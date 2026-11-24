/**
 * 八百零六批·实时监控第七轮「节点+历史双区质感+对比面归流」（用户双实报 20260908 18:23
 * 「这两块的设计质感和交互，明显非常廉价…基于整体协调性优化」+18:43「节点对比怎么回事，
 * 怎么单独弹出了一个页面，投机倒把，重新设计跟页面一样的设计语言」；稿=docs/goal806-live-polish.html）。
 * 件1 节点卡：水位条 8→12px+85/90 阈值刻度双标+超档 tone 色；tp/load 合一行收尾；卡壳 r-m+
 * hover 青强调；区块头节点/告警汇总。件2 历史图底座：网格三线+Y 中档三刻度（对齐 802 Top 曲线）。
 * 件3 对比面归流：794 fixed 悬浮面板（用户令推翻）→ .ld-nodes 区内联容器同页面语言（800 单容器同构）。
 * 挂载 spec 静态 import 视图（805-C1 约定）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useLiveMonitorStore } from '../stores/liveMonitor';
import LiveDashboardView from '../views/LiveDashboardView.vue';
import HistoryChart from '../components/HistoryChart.vue';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  const anyCall: any = new Proxy(function () { return Promise.resolve(null); }, {
    get(_t, p) { if (p === 'then' || typeof p === 'symbol') return undefined; return anyCall; },
    apply() { return Promise.resolve(null); },
  });
  const proxied = new Proxy({}, {
    get(_target, prop: string) {
      if (prop === 'monitorMetrics') {
        return () => Promise.resolve({ records: [
          { kind: 'metrics', scope: 'cluster', connName: 'qa-es', timestamp: 2000, qps: 71.4, indices: 863 },
          { kind: 'metrics', scope: 'cluster', connName: 'qa-es', timestamp: 1000, qps: 52, indices: 861 },
        ] });
      }
      return anyCall;
    },
  });
  return { ...actual, api: proxied };
});

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

let app: ReturnType<typeof createApp> | null = null;
let hostEl: HTMLElement | null = null;
let piniaRef: ReturnType<typeof createPinia> | null = null;

async function mountLive() {
  location.hash = '#/';
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const a = createApp({ render: () => h(LiveDashboardView as any) });
  a.use(pinia); a.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  a.mount(host);
  await settle();
  app = a; hostEl = host; piniaRef = pinia;
  return { app: a, host, pinia };
}

function seedNodes(mon: ReturnType<typeof useLiveMonitorStore>) {
  mon.nodes = [
    { nodeId: 'n1', name: 'qa-es-1', roles: ['data'], heapPct: 91, cpuPct: 38, diskTotal: 100, diskFree: 41, tpSearchActive: 2, tpSearchQueue: 0, load: { '1m': 1.8 } },
    { nodeId: 'n2', name: 'qa-es-2', roles: ['data', 'master'], heapPct: 34, cpuPct: 52, diskTotal: 100, diskFree: 24 },
    { nodeId: 'n3', name: 'qa-es-3', roles: ['data'], heapPct: 60, cpuPct: 86, diskTotal: 100, diskFree: 10 },
  ];
}

beforeEach(async () => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  await mountLive();
  seedNodes(useLiveMonitorStore(piniaRef!));
  await settle();
});
afterEach(() => { app?.unmount(); hostEl?.remove(); app = null; hostEl = null; piniaRef = null; });

describe('件1：节点卡质感升档', () => {
  it('A1 水位条 12px+阈值刻度双标+超档 tone 色（挂载：91% heap 节点条 err 档；12px 走源码锁——happy-dom computed height 不级联样式表规则）', async () => {
    const cards = [...hostEl!.querySelectorAll('.ld-node')];
    expect(cards.length).toBe(3);
    expect(strip(liveSrc), '条加粗 12px（源码锁）').toMatch(/\.ld-bar \{[^}]*height:\s*12px/);
    const ticks = cards[0].querySelectorAll('.ld-bar-tick');
    expect(ticks.length, '每卡 3 条 × 2 刻度 = 6').toBe(6);
    const fills = cards[0].querySelectorAll('.ld-bar > div');
    expect(fills[0]!.className, 'heap 91%=err 档条色').toContain('err');
    expect(fills[2]!.className, 'disk 59%=ok 档（身份色）').toContain('ok');
  });

  it('A2 tp+load 合一行收尾（挂载：n1 合行/n2 无/n3 无）', async () => {
    const cards = [...hostEl!.querySelectorAll('.ld-node')];
    const foot1 = [...cards[0].querySelectorAll('.ld-node-row')].find(r => r.classList.contains('ld-node-foot'));
    expect(foot1, 'n1 收尾行在场').toBeTruthy();
    expect(foot1!.textContent).toContain('tp');
    expect(foot1!.textContent).toContain('2/0');
    expect(foot1!.textContent).toContain('load');
    expect(foot1!.textContent).toContain('1.80');
    expect(getComputedStyle(foot1!).borderTopWidth, '收尾分隔线').not.toBe('0px');
    for (const c of [cards[1], cards[2]]) {
      expect([...c.querySelectorAll('.ld-node-foot')].length, '无 tp/load 节点零收尾行').toBe(0);
    }
  });

  it('A3 区块头汇总：3 节点 · 1 master · 2 水位告警（挂载）', async () => {
    const sum = hostEl!.querySelector('.ld-nodes-sum');
    expect(sum, '汇总位在场').toBeTruthy();
    expect(sum!.textContent).toContain('3 节点');
    expect(sum!.textContent).toContain('1 master');
    expect(sum!.textContent).toContain('2 水位告警');
  });

  it('A4 卡壳 r-m+hover 青强调（源码锁）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-node \{[^}]*border-radius:\s*var\(--r-m\)/);
    expect(s).toMatch(/\.ld-node:hover \{[^}]*border-color:\s*var\(--ac\)/);
  });
});

describe('件2：历史图底座对齐 802（网格+Y 中档）', () => {
  const SERIES = [{ name: 'qa-es', points: Array.from({ length: 12 }, (_, i) => ({ t: 1000 + i * 60e3, v: 10 + i * 2 })) }];
  function mountHc() {
    const a = createApp({ render: () => h(HistoryChart as any, { title: 'QPS', unit: '/s', series: SERIES }) });
    const host = document.createElement('div');
    document.body.appendChild(host);
    a.mount(host);
    return { a, host };
  }
  it('B1 横向网格三线（25/50/75%）', () => {
    const { a, host } = mountHc();
    const grid = host.querySelectorAll('.hc-grid');
    expect(grid.length, '网格线三档').toBe(3);
    a.unmount(); host.remove();
  });
  it('B2 Y 刻度五档：ymax/yzero+中档三只', () => {
    const { a, host } = mountHc();
    expect(host.querySelectorAll('.hc-ymax').length).toBe(1);
    expect(host.querySelectorAll('.hc-yzero').length).toBe(1);
    const mid = host.querySelectorAll('.hc-yt');
    expect(mid.length, '中档三只').toBe(3);
    a.unmount(); host.remove();
  });
});

describe('件3：节点对比归流（794 悬浮面板用户令推翻→内联容器）', () => {
  it('C1 入口点开=内联容器在 .ld-nodes 内（非 fixed 弹层）', async () => {
    const entry = hostEl!.querySelector('.ld-ncmp-entry') as HTMLButtonElement;
    entry.click();
    await settle();
    const panel = hostEl!.querySelector('.ld-ncmp-panel') as HTMLElement;
    expect(panel, '容器开').toBeTruthy();
    expect(panel.closest('.ld-nodes'), '归属 .ld-nodes 区（页面流内联）').toBeTruthy();
    const pos = getComputedStyle(panel).position;
    expect(pos === 'fixed' || pos === 'absolute', '非浮层定位（static/relative 流内）').toBe(false);
    expect(panel.querySelector('.ld-ncmp-hd'), '头部行在场（seg 五档+恢复钮位）').toBeTruthy();
  });

  it('C2 悬浮面板形态退役（源码锁：fixed/拖动/位置落盘零残留；开合态保留）', () => {
    const s = strip(liveSrc);
    expect(s).not.toContain('.ld-ncmp-panel { position: fixed');
    expect(s).not.toContain('onCmpDragStart');
    expect(s).not.toContain("'ld.cmpPos'");
    expect(s).toContain("'ld.cmpOpen'");
  });

  it('C3 Esc 收起+焦点回入口（交互语义保留）', async () => {
    const entry = hostEl!.querySelector('.ld-ncmp-entry') as HTMLButtonElement;
    entry.click();
    await settle();
    const panel = hostEl!.querySelector('.ld-ncmp-panel') as HTMLElement;
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(hostEl!.querySelector('.ld-ncmp-panel'), 'Esc 收起').toBeNull();
    expect(document.activeElement === entry || hostEl!.contains(document.activeElement), '焦点回视图内').toBe(true);
  });
});
