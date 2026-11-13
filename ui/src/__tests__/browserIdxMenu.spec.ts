/**
 * R130 一百三十二批：BrowserView 索引列表右键菜单（CellContextMenu 第三场景）。
 * 五百二十九批反转同步更新：裸表换 QRT rows 型——行级右键随壳退役，菜单能力按 QRT 消费形态映射：
 *   旧「复制索引名」→ QRT 单元格右键「复制值」（索引名格原值入剪贴板，同一剪贴板结果）；
 *   旧「打开索引工作区/DSL 查询/查看 Mapping/ForceMerge/删除索引」→ #cell-操作 槽五钮逐字保真；
 *   旧「复制行信息」→ #row-actions 行尾注入位（browserExportMd 锁）。
 * 锁定：
 * 1) 索引名格 contextmenu 打开 QRT 单元格菜单，标题按列名；
 * 2) 「复制值」走剪贴板（writeText 参数=索引名）+ success toast；
 * 3) 操作列五钮齐（工作区/DSL/Mapping/ForceMerge/删除），删除项 danger 红色；
 * 4) 点「索引工作区」钮触发 goHub（router.push 落 /indices?idx=）。
 * 挂载：browserSortMemory 同款壳（useRouter mock + 裸 pinia），indices 直接灌 store。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const pushSpy = vi.fn();
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }), useRoute: () => ({ path: '/browser', query: {} }) }));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([IDX]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import BrowserView from '../views/BrowserView.vue';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');

const IDX = {
  index: 'idx-rt', health: 'green', status: 'open',
  'docs.count': 12, 'store.size': '3kb', pri: 1, rep: 1,
  'creation.date.string': '2026-01-01',
} as any;

async function mountBrowser() {
  document.body.appendChild(host);
  const pinia = createPinia();
  const app = createApp({ setup: () => () => h(BrowserView as any) });
  app.use(pinia);
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
});

function menuButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll('.ccm-mask .ccm-it')] as HTMLButtonElement[];
}
/* 五百二十九批锚同步更新：tr contextmenu → QRT 单元格 contextmenu（落在「索引」列格上） */
async function openCellMenu() {
  const td = [...host.querySelectorAll('table.qrt-tbl tbody tr td')]
    .find(t => t.textContent?.includes('idx-rt')) as HTMLElement;
  expect(td, '索引名格必须渲染').toBeTruthy();
  td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
}

describe('BrowserView 索引表右键能力（132 批 → 529 QRT 消费形态）', () => {
  it('索引名格右键：QRT 单元格菜单打开（标题按「索引」列），复制值/复制行 JSON 在', async () => {
    await mountBrowser();
    await openCellMenu();
    expect(document.querySelector('.ccm-mask .ccm-hd')?.textContent).toContain('索引');
    const labels = menuButtons().map(b => b.textContent?.trim());
    expect(labels).toContain('复制值');
    /* 1142：复制行 JSON 收进「复制…」二级（与 QRT/RT 同一分组语言） */
    const copyGroup = [...document.querySelectorAll('.ccm-mask .ccm-it')]
      .find(b => (b.textContent ?? '').includes('复制…') && b.getAttribute('aria-haspopup') === 'menu') as HTMLButtonElement;
    expect(copyGroup, '复制分组父行在场').toBeTruthy();
    copyGroup.click();
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    const subLabels = [...document.querySelectorAll('.ccm-mask .ccm-sub .ccm-it')].map(b => b.textContent?.trim());
    expect(subLabels).toContain('复制行 JSON');
    /* 1148：操作列常驻只留「索引工作区 + 更多 ⋯」（五颗图标钮会把操作列撑到 300px+），
       其余四项收进 ⋯ 弹层，能力零删除。 */
    const acts = host.querySelector('.bw-acts')!;
    expect(acts.querySelectorAll('button').length, '常驻两钮（工作区 + 更多）').toBe(2);
    expect([...acts.querySelectorAll('button')].map(b => b.getAttribute('aria-label')))
      .toContain('索引工作区（文档/查询/配置/分片/运维）');
    expect([...acts.querySelectorAll('button')].map(b => b.getAttribute('aria-label'))[1])
      .toMatch(/^更多操作：/);
    /* 打开「更多」：DSL 查询 / Mapping / ForceMerge / 删除索引 全在 */
    (acts.querySelectorAll('button')[1] as HTMLButtonElement).click();
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    const moreLabels = [...document.querySelectorAll('.bw-more .bw-more-it')].map(b => (b.textContent ?? '').trim());
    expect(moreLabels).toEqual(['DSL 查询', 'Mapping', 'ForceMerge 段合并', '删除索引']);
  });

  it('「复制值」（索引名格）走剪贴板', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    await mountBrowser();
    await openCellMenu();
    menuButtons().find(b => b.textContent?.includes('复制值'))!.click();
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    expect(writeText).toHaveBeenCalledWith('idx-rt');
  });

  it('「更多」里的删除索引仍带 danger 语义（旧菜单 danger+sep 保真）', async () => {
    await mountBrowser();
    const more = [...host.querySelectorAll<HTMLButtonElement>('.bw-acts button')][1];
    more.click();
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    const del = [...document.querySelectorAll<HTMLButtonElement>('.bw-more .bw-more-it')]
      .find(b => (b.textContent ?? '').includes('删除索引'))!;
    expect(del.classList.contains('danger')).toBe(true);
  });

  it('操作列「索引工作区」钮触发 goHub（router.push 落 /indices）', async () => {
    await mountBrowser();
    const hubBtn = [...host.querySelectorAll<HTMLButtonElement>('.bw-acts button')]
      .find(b => b.getAttribute('aria-label') === '索引工作区（文档/查询/配置/分片/运维）')!;
    hubBtn.click();
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    expect(pushSpy).toHaveBeenCalledWith(expect.objectContaining({ path: '/indices', query: { idx: 'idx-rt' } }));
  });
});
