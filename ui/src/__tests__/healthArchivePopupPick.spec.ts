/**
 * 体检对比「基准/对照」弹层选择器（行为网）：原生 select（无输入过滤，存档 8 份后盲滚）→
 * usePopupList 弹层（label 带时间，输入即过滤+rank，点选/Enter 回填存档下标）。
 * 锁定：
 * 1) 挂载后默认对（基准=次新/对照=最新）回显 archiveLabel；
 * 2) 输入过滤命中（弹层 Teleport 到 body，happy-dom 查 document）；
 * 3) 点选回填 pickBase/pickCmp（下标语义不变，diff/得分差链路跟随刷新）；
 * 4) Esc 关层；当前基准/当前对照标记在场。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { ARCHIVE_KEY, ARCHIVE_MAX, archiveLabel, type ArchivedReport } from '../utils/reportArchive';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api, healthReport: vi.fn() } };
});

import HealthReportView from '../views/HealthReportView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

function seedArchive(): ArchivedReport[] {
  const now = Date.now();
  const arr: ArchivedReport[] = [
    { ts: now - 3600e3, score: 86, data: { score: 86 } },
    { ts: now - 7200e3, score: 85, data: { score: 85 } },
    { ts: now - 3 * 3600e3, score: 72, data: { score: 72 } },
  ];
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(arr));
  /* 对比卡在 hr-body 内（v-if="data"）：种一份「上次报告」让报告区渲染（R51 sessionStorage 复原语义） */
  sessionStorage.setItem('esquerystudio.health-report.last', JSON.stringify({ score: 90, generatedAt: now, summary: {} }));
  return arr;
}

async function mountView() {
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(HealthReportView) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

function pickInputs(host: HTMLElement) {
  return host.querySelectorAll<HTMLInputElement>('.hr-diff-pick .hr-pick input');
}
function popItems(): HTMLElement[] {
  /* 弹层 Teleport 在 body 下：查 document 而非 host */
  return Array.from(document.querySelectorAll<HTMLElement>('.hr-pop .hr-pop-item'));
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.removeItem(ARCHIVE_KEY);
  sessionStorage.clear();
});

describe('HealthReportView 基准/对照弹层选择器', () => {
  it(`存档 ${ARCHIVE_MAX} 份上限口径不动：挂载即出对比卡，默认对回显（基准=次新/对照=最新）`, async () => {
    const arr = seedArchive();
    const { app, host } = await mountView();
    expect(host.querySelector('.hr-diff'), 'archive>=2 出卡').toBeTruthy();
    const inputs = pickInputs(host);
    expect(inputs.length).toBe(2);
    expect((inputs[0] as HTMLInputElement).value).toBe(archiveLabel(arr[1]));
    expect((inputs[1] as HTMLInputElement).value).toBe(archiveLabel(arr[0]));
    app.unmount();
  });

  it('输入即过滤：命中存档（弹层在 document），点选回填下标并刷新得分差', async () => {
    seedArchive();
    const { app, host } = await mountView();
    const base = pickInputs(host)[0] as HTMLInputElement;
    base.value = '得分 72';
    base.dispatchEvent(new Event('input'));
    await settle();
    const items = popItems();
    expect(items.length, '「得分 72」只命中一份存档').toBe(1);
    expect(items[0].textContent).toContain('得分 72');
    items[0].click();
    await settle();
    expect((pickInputs(host)[0] as HTMLInputElement).value, '点选后回显所选 label').toContain('得分 72');
    /* happy-dom 不派发 transitionend，leave 态 DOM 残留——以 aria-expanded 判「层已收」而非查节点移除 */
    expect(pickInputs(host)[0].getAttribute('aria-expanded'), '回填后弹层收起').toBe('false');
    /* 基准换到 72 分那份 → 摘要得分差跟随（86→72 场景下 delta 徽标向下） */
    expect(host.textContent).toContain('得分 72 → 86');
    app.unmount();
  });

  it('过滤空命中出提示；Esc 关层（过滤词保留在输入框，IndexPicker 同范式）', async () => {
    seedArchive();
    const { app, host } = await mountView();
    const cmp = pickInputs(host)[1] as HTMLInputElement;
    cmp.value = '不存在的存档';
    cmp.dispatchEvent(new Event('input'));
    await settle();
    /* 五百五十八批(b)：hr-pop-hint 裸 div 空态合并 EmptyState compact（flattenWave558b）——
       锚随批迁移 .hr-pop-hint → .hr-pop .es-text（EmptyState 文本行），文案语义不变 */
    expect(document.querySelector('.hr-pop .es-text')?.textContent).toContain('没有匹配');
    cmp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    /* happy-dom 不派发 transitionend——以 aria-expanded 判「层已收」而非查节点移除 */
    expect(pickInputs(host)[1].getAttribute('aria-expanded'), 'Esc 关层').toBe('false');
    expect((pickInputs(host)[1] as HTMLInputElement).value, 'Esc 只关层不清词（与 IndexPicker 范式一致）').toBe('不存在的存档');
    app.unmount();
  });

  it('当前基准/当前对照标记在场（互为提示，替代旧 option 内联文案）', async () => {
    seedArchive();
    const { app, host } = await mountView();
    const base = pickInputs(host)[0] as HTMLInputElement;
    base.value = '得分';
    base.dispatchEvent(new Event('input'));
    await settle();
    const txt = popItems().map(i => i.textContent || '').join('|');
    expect(txt).toContain('当前基准');
    expect(txt).toContain('当前对照');
    app.unmount();
  });
});
