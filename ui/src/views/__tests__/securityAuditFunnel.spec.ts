/**
 * 天罗W6 P0：SecurityView 审计表最小 graft（五百二十九批反转随迁：裸表换 QRT rows 型，
 * 漏斗/排序/列选/导出归内核；524 graft 的派生展示能力全部经 #cell-<列名> 槽保真）。
 * 锁定：
 * 1) 用户/角色/动作/方法/HTTP 列漏斗钮（QRT 内建 .qrt-funnel，原生 button 键盘可达）；
 *    HTTP 另有数值区间（fieldTypes long → 内建 isRangeCol）；
 * 2) 等值勾选过滤行集，与 kw 快滤 AND 叠加；
 * 3) HTTP 区间（min 含端点）过滤；
 * 4) 审计 role 列换装 StatusPill 统一件（551 批随迁：role-tag r-* 六色私造范式退役，
 *    roleTone 映射五档——VIEWER 只读→g 语义等值保留，槽内保真）；
 * 5) copyMatrix TSV 通道按钮（数据源=QRT getCsvBlock 漏斗+排序所见）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const AUDIT = [
  { timestamp: '2026-09-18T10:00:00Z', username: 'alice', role: 'VIEWER', action: 'WRITE', method: 'POST', uri: '/internal/es/index-a/_doc', httpStatus: 200, detail: '' },
  { timestamp: '2026-09-18T10:01:00Z', username: 'bob', role: 'VIEWER', action: 'PAGE_DENIED', method: 'GET', uri: '/internal/es/index-b', httpStatus: 403, detail: '' },
  { timestamp: '2026-09-18T10:02:00Z', username: 'carol', role: 'OPERATOR', action: 'LOGIN', method: 'POST', uri: '/login', httpStatus: 200, detail: '' },
];

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      auth: {
        ...actual.api.auth,
        users: vi.fn(async () => []),
        /* 五百五十五批：线缆 {records:[...]} 扁平直出（ES hits 包装契约退役） */
        opsAudit: vi.fn(async () => ({ records: AUDIT })),
      },
      setup: {
        ...actual.api.setup,
        status: vi.fn(async () => ({ bound: true, mode: 'SELF', endpoint: 'http://127.0.0.1:9200', appName: 'test', hostVisible: false })),
      },
    },
  };
});

import SecurityView from '../SecurityView.vue';
import { useAuthStore } from '../../stores/auth';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountSecurity() {
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(SecurityView) });
  app.use(pinia);
  app.use(router);
  const auth = useAuthStore(pinia);
  auth.me = { username: 'root', role: 'ADMIN', fallback: false } as any;
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

function cardByTitle(host: HTMLElement, title: string): HTMLElement {
  /* 五百五十四批锚随迁：顶层 .card 壳退役 → border-top 分节（me/us/ctl/audit 四锚类承接） */
  const card = [...host.querySelectorAll<HTMLElement>('.me-card, .us-card, .ctl-card, .audit-card')]
    .find(c => (c.querySelector('.card-t')?.textContent || '').includes(title));
  expect(card, `卡「${title}」必须渲染`).toBeTruthy();
  return card!;
}
/* 五百二十九批锚随迁：table.tbl → QRT table.qrt-tbl；全被筛空时内核出 .qrt-nomatch
   提示行（非数据行），行计数必须剔除 */
function auditRows(host: HTMLElement): HTMLElement[] {
  return Array.from(cardByTitle(host, '操作审计').querySelectorAll<HTMLTableRowElement>('table.qrt-tbl tbody tr'))
    .filter(tr => !tr.classList.contains('qrt-nomatch'));
}
/* 锚随迁：.af-btn → QRT 内建 .qrt-funnel；aria 同字（列名中文键「筛选 方法 列」） */
const funnelOf = (host: HTMLElement, label: string) =>
  [...cardByTitle(host, '操作审计').querySelectorAll<HTMLButtonElement>('thead .qrt-funnel')]
    .find(b => b.getAttribute('aria-label') === label);

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
});

describe('SecurityView 审计表 QRT rows 型（天罗W6 graft → 529 换壳）', () => {
  it('role 列换装 StatusPill 统一件（551 批随迁：role-tag 私造胶囊退役，roleTone 映射 VIEWER→g；#cell-角色 槽保真）', async () => {
    const { app, host } = await mountSecurity();
    /* 551 裁决记档：role 六色语义收进五档映射表（SecurityView ROLE_TONE 注释在册）——
       ADMIN→r / OPERATOR→y / REBUILD_OP→y / VIEWER 只读→g / CLUSTER_OP→b / AUDIT_OP→n，
       语义就近归档不丢失；本用例锚定槽内 pill 档与文本保真 */
    const pill = auditRows(host)[0].querySelector('.pill');
    expect(pill, '审计 role 列必须渲染 StatusPill 统一件').toBeTruthy();
    expect(pill!.classList.contains('g')).toBe(true);
    expect(pill!.textContent).toBe('VIEWER');
    app.unmount();
  });

  it('方法列等值漏斗：弹出值清单（每值计数），勾选过滤行集；漏斗 .on 高亮', async () => {
    const { app, host } = await mountSecurity();
    expect(auditRows(host).length).toBe(3);
    const funnel = funnelOf(host, '筛选 方法 列');
    expect(funnel, '方法列漏斗钮必须渲染').toBeTruthy();
    expect(funnel!.tagName).toBe('BUTTON');
    funnel!.click();
    await settle(6);
    const pop = document.querySelector('.cfp');
    expect(pop, '漏斗弹层（teleport body）').not.toBeNull();
    /* 五百二十九批锚随迁：筛选「method」→ 筛选「方法」（列名改中文键后内核弹层头文案跟随） */
    expect(pop!.textContent).toContain('筛选「方法」');
    const vals = [...pop!.querySelectorAll('.cfp-val')].map(s => s.textContent?.trim());
    expect(vals).toEqual(['POST', 'GET']);
    (pop!.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    await settle(6);
    expect(auditRows(host).length, '勾 POST → 只剩 2 行').toBe(2);
    expect(funnel!.classList.contains('on')).toBe(true);
    /* 与 kw 快滤 AND 叠加：POST 行里无 index-b（bob 是 GET）→ 0 行 */
    const kw = host.querySelector<HTMLInputElement>('input[placeholder="过滤用户/URI/集群"]');
    kw!.value = 'index-b';
    kw!.dispatchEvent(new Event('input'));
    await settle();
    expect(auditRows(host).length, '漏斗(method=POST) AND kw(index-b) → 空集').toBe(0);
    app.unmount();
  });

  it('HTTP 列数值区间：min=400 → 只剩 403 一行；区间+等值并存 AND', async () => {
    const { app, host } = await mountSecurity();
    funnelOf(host, '筛选 HTTP 列')!.click();
    await settle(6);
    let pop = document.querySelector('.cfp')!;
    expect(pop.querySelector('.cfp-range'), 'HTTP 列弹层带区间双输入（fieldTypes long → isRangeCol）').toBeTruthy();
    const min = pop.querySelector('.cfp-range-in') as HTMLInputElement;
    min.value = '400';
    min.dispatchEvent(new Event('input'));
    await settle(6);
    expect(auditRows(host).length, 'httpStatus ≥ 400 → 只剩 bob(403)').toBe(1);
    expect(auditRows(host)[0].textContent).toContain('bob');
    /* 弹层「清除」恢复全量 */
    funnelOf(host, '筛选 HTTP 列')!.click();
    await settle(4);
    pop = document.querySelector('.cfp')!;
    (pop.querySelector('.cfp-clear') as HTMLButtonElement).click();
    await settle(6);
    expect(auditRows(host).length).toBe(3);
    app.unmount();
  });

  it('copyMatrix TSV 通道按钮在位（数据源=QRT getCsvBlock 所见即所复）', async () => {
    const { app, host } = await mountSecurity();
    const tsvBtn = [...cardByTitle(host, '操作审计').querySelectorAll<HTMLButtonElement>('button')]
      .find(b => b.textContent?.includes('TSV'));
    expect(tsvBtn, '「TSV」复制矩阵按钮必须渲染').toBeTruthy();
    expect(tsvBtn!.disabled).toBe(false);
    app.unmount();
  });
});
