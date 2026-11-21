/**
 * 五百九十五批·R57 实时区负载维度补全——「集群整体和个体的负载」（用户实报驱动）。
 *
 * 用户实报：需要看到集群中整体和个体的负载。整体=既有均值卡/集群 QPS 卡已覆盖；
 * 个体缺口=①每节点各扛多少吞吐（QPS/写入）——brief 已带 per-node queryTotal/indexTotal，
 * liveMonitor tick 只做集群合计差分，per-node 差分前端纯补；②节点 Load_1m——brief 已带
 * load_average 对象，前端从未消费。
 *
 * ①utils 化纯函数 pushNodeRateSeries（liveMonitor.ts 模块级导出）：按节点名差分
 *   ΔqueryTotal/ΔindexTotal ÷ dt 秒推入 nodeSeries[name].qps/idx——prev=null（首轮/切集群后）
 *   只记基线不推（差分宁缺毋假纪律）；无基线的新节点跳过；dtSec<=0 防除零。
 * ②对比卡扩五档：Heap/CPU/磁盘（pct 固定刻度+阈值线+悬浮带 %）+QPS/写入（abs 峰值地板
 *   刻度+无阈值线+悬浮 toFixed(1) 无 %）——sparkHoverAt 双模式 589 已约定，此处首条 abs 消费面。
 * ③节点卡第四行 load：load_average['1m'] 两位小数；缺省节点整行不渲染（诚实缺省）。
 * ④切集群清 nodeRatePrev 基线（587 跨集群串数据同款防线）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { pushNodeRateSeries, useLiveMonitorStore } from '../stores/liveMonitor';
import { useAppStore } from '../stores/app';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const storeSrc = readFileSync(join(__dirname, '../stores/liveMonitor.ts'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  const anyCall: any = new Proxy(function () { return Promise.resolve(null); }, {
    get(_t, p) {
      if (p === 'then' || typeof p === 'symbol') return undefined;
      return anyCall;
    },
    apply() { return Promise.resolve(null); },
  });
  const proxied = new Proxy({}, {
    get(_target, _prop: string) { return anyCall; },
  });
  return { ...actual, api: proxied };
});

/* ═══════════ ① 纯函数 pushNodeRateSeries ═══════════ */

describe('五百九十五批①：pushNodeRateSeries 每节点吞吐差分', () => {
  const mkSeries = () => ({
    n1: { heap: [1], cpu: [1], disk: [1], qps: [], idx: [] },
    n2: { heap: [1], cpu: [1], disk: [1], qps: [], idx: [] },
  });
  const nodes = [
    { name: 'n1', queryTotal: 2000, indexTotal: 750 },
    { name: 'n2', queryTotal: 1000, indexTotal: 500 },
  ];

  it('首轮 prev=null：只记基线不推序列（差分宁缺毋假）', () => {
    const series = mkSeries();
    const next = pushNodeRateSeries(null, nodes, series, 0);
    expect(next.get('n1')).toEqual({ q: 2000, i: 750 });
    expect(series.n1.qps).toEqual([]);
    expect(series.n1.idx).toEqual([]);
  });

  it('两轮差分：Δ÷dt 入 qps/idx（n1 q+1000/5s=200/s，i+250/5s=50/s）', () => {
    const series = mkSeries();
    const prev = new Map([['n1', { q: 1000, i: 500 }], ['n2', { q: 800, i: 400 }]]);
    const next = pushNodeRateSeries(prev, nodes, series, 5);
    expect(series.n1.qps).toEqual([200]);
    expect(series.n1.idx).toEqual([50]);
    expect(series.n2.qps).toEqual([40]);
    expect(next.get('n1')).toEqual({ q: 2000, i: 750 });
  });

  it('无基线的新节点跳过不推；dtSec<=0 防除零不推', () => {
    const series = mkSeries();
    const prev = new Map([['n1', { q: 1000, i: 500 }]]); /* n2 无基线 */
    pushNodeRateSeries(prev, nodes, series, 5);
    expect(series.n2.qps).toEqual([]);
    expect(series.n1.qps).toEqual([200]);
    const s2 = mkSeries();
    pushNodeRateSeries(new Map([['n1', { q: 1000, i: 500 }]]), nodes, s2, 0);
    expect(s2.n1.qps).toEqual([]);
  });
});

/* ═══════════ ② 视图接线：对比卡 QPS/写入档 + 节点卡 load 行 ═══════════ */

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountLive() {
  location.hash = '#/';
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
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

describe('五百九十五批②：对比卡 QPS/写入档 + 节点卡 load 行', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  function seed(mon: ReturnType<typeof useLiveMonitorStore>) {
    mon.nodes = [
      { nodeId: 'n1', name: 'qa-es-1', roles: ['data'], heapPct: 30, cpuPct: 38, diskTotal: 100, diskFree: 41, load: { '1m': 1.8 } },
      { nodeId: 'n2', name: 'qa-es-2', roles: ['data'], heapPct: 34, cpuPct: 52, diskTotal: 100, diskFree: 24 },
    ];
    mon.nodeSeries = {
      'qa-es-1': { heap: [28, 30, 31], cpu: [40, 38, 36], disk: [58, 59, 59.5], qps: [30, 80, 55], idx: [10, 25, 18] },
      'qa-es-2': { heap: [32, 34, 35], cpu: [55, 52, 50], disk: [75, 76, 76.4], qps: [20, 45, 35], idx: [8, 20, 12] },
    };
    mon.sampleTs = [1000, 2000, 3000];
  }

  it('对比卡五档分段在场；QPS 档 abs 画线无阈值线，悬浮行值无 %（Heap 档带 %）', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      seed(useLiveMonitorStore(pinia));
      await settle();
      /* 794 件1 同步更新：对比面悬浮面板化（默认关）——断言前点入口钮开面板 */
      (host.querySelector('.ld-ncmp-entry') as HTMLButtonElement)?.click();
      await settle();
      const segs = [...host.querySelectorAll('.ld-ncmp-panel .seg button')] as HTMLButtonElement[];
      expect(segs.map(b => b.textContent!.trim()), '五档分段').toEqual(['Heap', 'CPU', '磁盘', 'QPS', '写入']);
      const cmp = host.querySelector('.ld-ncmp-panel')!;

      /* Heap 档（默认）：阈值线在场 */
      expect(cmp.querySelector('line[stroke-dasharray]'), 'pct 档阈值线在场').toBeTruthy();
      /* 悬浮 Heap：行值带 % */
      (cmp.querySelector('.ld-cmp-plot') as HTMLElement).dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0 })); /* 877：派发目标随监听下沉绘图域 */
      await settle(4);
      expect(cmp.querySelector('.ld-hv')!.textContent).toContain('%');
      (cmp.querySelector('.ld-cmp-plot') as HTMLElement).dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
      await settle(4);

      /* 切 QPS：阈值线移除（无固定阈值语义），悬浮行值无 % */
      const qpsBtn = segs.find(b => b.textContent!.trim() === 'QPS')!;
      qpsBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle();
      expect(cmp.querySelector('line[stroke-dasharray]'), 'abs 档无阈值线').toBeNull();
      (cmp.querySelector('.ld-cmp-plot') as HTMLElement).dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0 })); /* 877：派发目标随监听下沉绘图域 */
      await settle(4);
      const hv = cmp.querySelector('.ld-hv')!;
      expect(hv.textContent).toContain('30'); /* qps 首点 30 */
      expect(hv.textContent).not.toContain('%');
      (cmp.querySelector('.ld-cmp-plot') as HTMLElement).dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
      await settle(4);
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('节点卡第四行 load：load_average.1m 两位小数；无 load 节点整行不渲染', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      seed(useLiveMonitorStore(pinia));
      await settle();
      const cards = [...host.querySelectorAll('.ld-node')];
      expect(cards.length).toBe(2);
      const row1 = [...cards[0].querySelectorAll('.ld-node-row')].find(r => r.textContent!.includes('load'));
      expect(row1, '有 load 节点行在场').toBeTruthy();
      expect(row1!.textContent).toContain('1.80');
      const row2 = [...cards[1].querySelectorAll('.ld-node-row')].filter(r => r.textContent!.includes('load'));
      expect(row2.length, '无 load 节点行不渲染').toBe(0);
    } finally {
      app.unmount();
      host.remove();
    }
  });
});

/* ═══════════ ③ 源码锁：差分接线+清基线+快照兼容 ═══════════ */

describe('五百九十五批③：源码锁', () => {
  it('store：nodeSeries qps/idx 槽+pushNodeRateSeries 接线+切集群清基线+旧快照补键', () => {
    const t = strip(storeSrc);
    expect(t, 'qps/idx 槽位').toContain('qps: [], idx: []');
    expect(t, 'tick 接线差分').toContain('pushNodeRateSeries(');
    expect(t, '切集群清吞吐基线（587 同款防线）').toContain('nodeRatePrev = null');
    expect(t, '旧快照补键（restore 兼容）').toContain('if (!s.qps) s.qps = []');
  });
  it('视图：对比卡 abs 画线分流+load 行消费', () => {
    const t = strip(liveSrc);
    expect(t, 'abs/pct 画线分流').toContain("cmpMetric === 'qps' || cmpMetric === 'idx'");
    expect(t, 'load 行消费').toContain('load1mOf(');
    expect(t, '五档含 QPS/写入').toContain("label: 'QPS'");
  });
});
