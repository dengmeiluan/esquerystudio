/**
 * 七百九十四批：实时监控完整重构（用户实报三令 20261008 07:56；稿=docs/goal794-live-refactor.html）。
 *
 * 件1 节点对比真悬浮化：781 K2 的「悬浮读出」非用户所指（用户两报口径一致：对比面本身要悬浮）——
 *    ld-ncmp 页面流独立块整退役，改 fixed 浮动面板（入口钮+可拖动+Esc 关+焦点回入口+位置落盘）；
 *    释放版面让节点卡 grid 加宽。
 * 件2 Top 索引曲线化：表格快照→per-index 写入速率会话累积多折线（与六卡/对比同语言）；
 *    曲线/表格双视图 seg；读出行内索引名可点下钻（R49 闭环保留）；loadTop 接进主轮询。
 * 件3 质感升级：主卡曲线 2px→1.5px（与对比卡统一=781「折线过粗」彻底兑现）+当前值末点
 *    pulse（transform/opacity 合成层）+卡 hover 边框亮档。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useLiveMonitorStore } from '../stores/liveMonitor';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const cardSrc = readFileSync(join(__dirname, '../components/LiveChartCard.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* monitorTopIndexes 定制桶（hoisted=vi.mock 工厂提升后仍可引用）：两拍各回 per-index 记录 */
const { topMock, topState, histMock } = vi.hoisted(() => {
  const topState = { calls: 0 };
  const topMock = async () => {
    topState.calls += 1;
    return { records: [
      { index: 'orders-v9', qps: 12, idxRate: 100 + topState.calls, storeMb: 2100 },
      { index: 'quotes-v3', qps: 4, idxRate: 50 + topState.calls, storeMb: 800 },
    ] };
  };
  const histMock = async () => ({ records: [
    { connName: 'prod-es', timestamp: 1000, qps: 1, indexRate: 1, heapUsedPct: 10, cpuPct: 5, diskUsedPct: 20 },
    { connName: 'prod-es', timestamp: 2000, qps: 2, indexRate: 2, heapUsedPct: 11, cpuPct: 6, diskUsedPct: 21 },
  ] });
  return { topMock, topState, histMock };
});
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  const anyCall: any = new Proxy(function () { return Promise.resolve(null); }, {
    get(_t, p) {
      if (p === 'then' || typeof p === 'symbol') return undefined;
      return anyCall;
    },
    apply() { return Promise.resolve(null); },
  });
  const proxied = new Proxy({}, { get: (_t, p) => (p === 'monitorTopIndexes' ? topMock : p === 'monitorMetrics' ? histMock : anyCall) });
  return { ...actual, api: proxied };
});

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountLive() {
  location.hash = '#/';
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const mod = await import('../views/LiveDashboardView.vue');
  const app = createApp({ render: () => h(mod.default as any) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, pinia };
}

function seed(mon: ReturnType<typeof useLiveMonitorStore>) {
  mon.nodes = [
    { nodeId: 'd1', name: 'node-d-01', roles: ['data'], heapPct: 60, cpuPct: 20, diskTotal: 1000, diskFree: 300, queryTotal: 100, indexTotal: 40 },
    { nodeId: 'd2', name: 'node-d-02', roles: ['data'], heapPct: 40, cpuPct: 30, diskTotal: 1000, diskFree: 500, queryTotal: 80, indexTotal: 30 },
  ];
  mon.nodeSeries = {
    'node-d-01': { heap: [60, 61], cpu: [20, 21], disk: [70, 71], qps: [1, 2], idx: [3, 4] },
    'node-d-02': { heap: [40, 42], cpu: [30, 31], disk: [50, 51], qps: [2, 3], idx: [1, 2] },
  };
  mon.sampleTs = [1000, 2000];
  mon.qpsSeries = [10, 12]; mon.indexRateSeries = [4, 5]; mon.heapSeries = [60, 61]; mon.cpuSeries = [20, 21]; mon.diskSeries = [70, 71];
}

let app: ReturnType<typeof createApp> | null = null;
let hostEl: HTMLElement | null = null;
let piniaRef: ReturnType<typeof createPinia> | null = null;
beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '';
  topState.calls = 0;
  const m = await mountLive();
  app = m.app; hostEl = m.host; piniaRef = m.pinia;
  seed(useLiveMonitorStore(m.pinia));
  await settle();
});
afterEach(() => { app?.unmount(); hostEl?.remove(); app = null; hostEl = null; piniaRef = null; });

describe('件1：节点对比悬浮面板化（真悬浮）', () => {
  it('A1 默认态：面板关闭（页面流零对比块）+入口钮在场', () => {
    expect(hostEl!.querySelector('.ld-ncmp-entry'), '节点区头部入口钮').toBeTruthy();
    expect(hostEl!.querySelector('.ld-ncmp-panel'), '默认关=零浮层').toBeNull();
  });

  it('A2 入口点开=内联容器展开+Esc 收起+焦点回入口（八百零六批件3 用户令推翻 794 悬浮形态：「跟页面一样的设计语言」=fixed 浮层迁 .ld-nodes 区页面流）', async () => {
    const entry = hostEl!.querySelector('.ld-ncmp-entry') as HTMLButtonElement;
    entry.click();
    await settle();
    const panel = hostEl!.querySelector('.ld-ncmp-panel') as HTMLElement;
    expect(panel, '面板开').toBeTruthy();
    expect(panel.closest('.ld-nodes'), '归属 .ld-nodes 区（页面流内联）').toBeTruthy();
    expect(liveSrc, 'fixed 浮层退役源码锁').not.toContain('.ld-ncmp-panel { position: fixed');
    expect(liveSrc, 'panel 壳同页面语言源码锁').toMatch(/\.ld-ncmp-panel \{[^}]*background:\s*var\(--panel\)/);
    expect(panel.querySelector('.ld-ncmp-hd'), '头部行').toBeTruthy();
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(hostEl!.querySelector('.ld-ncmp-panel'), 'Esc 关').toBeNull();
    expect(document.activeElement === entry || hostEl!.contains(document.activeElement), '焦点回视图内（入口钮）').toBe(true);
  });

  it('A3 面板内容完整迁移：seg 五档+多线 svg+悬浮读出语汇保留（源码锁）', () => {
    const s = strip(liveSrc);
    expect(s).toContain('ld-ncmp-panel');
    expect((s.match(/CMP_METRICS/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(s).toContain('sparkHoverAt');
    expect(s).toContain('ld-ncmp-restore');
  });

  it('A4 开合态落盘（usePref 键在场；位置落盘 ld.cmpPos 随 806 件3 内联化退役——拖动/位置语义用户令推翻）', () => {
    const s = strip(liveSrc);
    expect(s).toContain("'ld.cmpOpen'");
    expect(s).not.toContain("'ld.cmpPos'");
  });
});

describe('件2：Top 索引曲线化', () => {
  /* 800 同步更新：Top 面板合并进「监控明细」单容器（ld-detail）——开容器（默认 tab=Top） */
  async function openTop() {
    const toggle = hostEl!.querySelector('.ld-detail-toggle') as HTMLButtonElement | null;
    toggle?.click();
    await settle(20);
    const topBtn = [...hostEl!.querySelectorAll('.ld-detail-seg button')].find(b => (b.textContent || '').includes('Top 索引')) as HTMLButtonElement | undefined;
    topBtn?.click();
    await settle(20);
  }

  it('B1 默认曲线视图：多索引曲线 path 在场（八百二十八批 polyline→path 平滑同步更新）', async () => {
    await openTop();
    const panel = hostEl!.querySelector('.ld-detail-body');
    expect(panel, '监控明细容器展开（800 单容器形态）').toBeTruthy();
    expect(panel!.querySelector('.ld-top-plot'), '曲线视图容器（默认）').toBeTruthy();
  });

  it('B2 曲线/表格双视图 seg：切表格后 table 在场', async () => {
    await openTop();
    const segBtns = [...hostEl!.querySelectorAll('.ld-top-viewseg button')];
    expect(segBtns.length, '双视图 seg 两钮').toBe(2);
    const tblBtn = segBtns.find(b => (b.textContent || '').includes('表格'));
    (tblBtn as HTMLButtonElement)?.click();
    await settle();
    expect(hostEl!.querySelector('.ld-hist-hist-t'), '表格视图切换').toBeTruthy();
  });

  it('B3 会话累积：两拍快照推进=序列 2 点（轮询接线）', async () => {
    await openTop();
    expect(topState.calls, '首开已拉一拍').toBeGreaterThanOrEqual(1);
    /* 第二拍：触发条件重拉（watch 链路：窗长变化） */
    const winSel = hostEl!.querySelector('select[aria-label="趋势窗长"]') as HTMLSelectElement;
    winSel.value = '240'; /* 非默认档（默认 120 设同值不触发 watch） */
    winSel.dispatchEvent(new Event('change'));
    await settle(20);
    expect(topState.calls, '两拍拉取').toBeGreaterThanOrEqual(2);
    expect(hostEl!.querySelectorAll('.ld-top-plot path').length, '两拍后曲线渲染（≥2 索引线）').toBeGreaterThanOrEqual(2);
  });

  it('B4 下钻闭环保留（读出行内索引名可点，源码锁）', () => {
    const s = strip(liveSrc);
    expect(s).toContain('gotoBrowser');
    expect(s).toContain('ld-top-link');
  });
});

describe('件3：质感升级', () => {
  it('C1 主卡曲线 1.5px 统一+当前值末点 pulse（LiveChartCard 源码锁）', () => {
    const s = strip(cardSrc);
    expect(s).toContain('stroke-width="1.5"');
    expect((s.match(/ld-line-pulse|ld-pulse-dot/g) || []).length, '末点 pulse 锚').toBeGreaterThanOrEqual(1);
  });

  it('C2 节点卡 grid 版面释放加宽（源码锁 minmax 档）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/minmax\(2[3-9]\dpx/);
  });

  it('C3 挂墙/挂出零残留：面板态不随组件卸载泄漏（开面板→卸载→DOM 清）', async () => {
    const entry = hostEl!.querySelector('.ld-ncmp-entry') as HTMLButtonElement;
    entry.click();
    await settle();
    expect(hostEl!.querySelector('.ld-ncmp-panel')).toBeTruthy();
    app!.unmount();
    await settle();
    expect(hostEl!.querySelector('.ld-ncmp-panel'), '卸载后零残留').toBeNull();
  });
});
