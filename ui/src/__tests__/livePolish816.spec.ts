/**
 * 八百一十六批·实时监控第十轮「六实报+追报七件」（用户 20261009 07:59~08:10 八截图；R196——
 * R191~R195 对方五批先落档顺延）。刀面：件1 对比容器图例 chips 行（「为什么仍然是这个效果」——
 * 对标 byNode 悬浮读出形态=「我要的是这个效果」）；件2 HistoryChart Y 刻度列（线和文字互相遮挡）；
 * 件3 明细收起条 seg 收起态隐藏（该 UI 样式非常丑陋）；件4 byNode 默认开启（按节点藏太深应该是默认）；
 * 件5 页头 actions 单行化（UI 太丑啦 竖排三行）；件6 历史区告警胶囊行撤（两胶囊叠行+整块无设计语言）；
 * 件7 历史区头部保留两层制（seg 控行①②既有 Z4 约定维持）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useLiveMonitorStore } from '../stores/liveMonitor';
import { useAppStore } from '../stores/app';
import LiveDashboardView from '../views/LiveDashboardView.vue';
import HistoryChart from '../components/HistoryChart.vue';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const hcSrc = readFileSync(join(__dirname, '../components/HistoryChart.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

const bucket = vi.hoisted(() => ({
  health: { status: 'green', version: '8.11.4', unassigned: 0, number_of_data_nodes: 2 } as any,
  nodes: [
    { nodeId: 'n1', name: 'qa-es-1', roles: ['data'], heapPct: 40, cpuPct: 30, diskTotal: 1000, diskFree: 600, qps: 12, idx: 30 },
    { nodeId: 'n2', name: 'qa-es-2', roles: ['data'], heapPct: 55, cpuPct: 44, diskTotal: 1000, diskFree: 500, qps: 8, idx: 20 },
  ] as any[],
}));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  const anyCall: any = new Proxy(function () { return Promise.resolve(null); }, {
    get(_t, p) { if (p === 'then' || typeof p === 'symbol') return undefined; return anyCall; },
    apply() { return Promise.resolve(null); },
  });
  const proxied = new Proxy({}, {
    get(_target, prop: string) {
      if (prop === 'clusterHealth') return () => Promise.resolve(bucket.health);
      if (prop === 'nodesStatsBrief') return () => Promise.resolve(bucket.nodes);
      if (prop === 'pendingTasks') return () => Promise.resolve({ tasks: [] });
      if (prop === 'monitorMetrics') {
        return () => Promise.resolve({ records: [
          { kind: 'metrics', scope: 'cluster', connName: 'qa-es', timestamp: 2000, qps: 71.4 },
          { kind: 'metrics', scope: 'cluster', connName: 'qa-es', timestamp: 1000, qps: 52 },
        ] });
      }
      return anyCall;
    },
  });
  return { ...actual, api: proxied };
});

async function settle(n = 20) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

let app: ReturnType<typeof createApp> | null = null;
let hostEl: HTMLElement | null = null;
let piniaEl: ReturnType<typeof createPinia> | null = null;

async function mountLive() {
  location.hash = '#/';
  const pinia = createPinia();
  setActivePinia(pinia);
  piniaEl = pinia;
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const a = createApp({ render: () => h(LiveDashboardView as any) });
  a.use(pinia); a.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  a.mount(host);
  await settle(30);
  app = a; hostEl = host;
  return host;
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => { app?.unmount(); hostEl?.remove(); app = null; hostEl = null; piniaEl = null; });

describe('件1：对比容器图例 chips 行', () => {
  it('A1 挂载：开容器后 chips 行=节点数（色点+名+当前值），点击 chip 隐藏（off 划线）+恢复钮出现', async () => {
    await mountLive();
    const entry = hostEl!.querySelector('.ld-ncmp-entry') as HTMLButtonElement;
    entry.click();
    await settle();
    const chips = [...hostEl!.querySelectorAll('.ld-cmp-lg')];
    expect(chips.length, 'chips=2 节点').toBe(2);
    expect(chips[0].textContent).toContain('qa-es-1');
    expect(chips[0].querySelector('i'), '色点在场').toBeTruthy();
    expect(chips[0].textContent).toMatch(/\d/);
    (chips[0] as HTMLElement).click();
    await settle();
    expect(chips[0].className, '点击后 off 态').toContain('off');
    expect(hostEl!.querySelector('.ld-ncmp-restore'), '恢复钮出现').toBeTruthy();
  });

  it('A2 源码锁：chips 行挂 X 轴后（hc-legend 同语言）+值取序列末点', () => {
    const s = strip(liveSrc);
    expect(s).toContain('ld-cmp-lg');
    expect(s.indexOf('ld-xaxis'), 'chips 在 X 轴后').toBeLessThan(s.indexOf('ld-cmp-lg'));
    expect(s).toMatch(/ld-cmp-lg[^`]*\{\{[^}]*cur|curText|lastOf/);
  });
});

describe('件2：HistoryChart Y 刻度列（线与文字不遮挡）', () => {
  it('B1 源码锁：plot 左留白刻度列+svg 右移+刻度右对齐', () => {
    const s = strip(hcSrc);
    expect(s).toMatch(/\.hc-canvas \{[^}]*left:\s*3[0-9]px/);
    expect(s).toMatch(/\.hc-ymax,[^{]*\{[^}]*width:\s*32px[^}]*text-align:\s*right|\.hc-ymax,[^{]*\{[^}]*text-align:\s*right[^}]*width:\s*32px/);
  });
});

describe('件3：明细收起条 seg 收起态隐藏', () => {
  it('C1 挂载：收起态 seg 不在场；展开后在场（该 UI 样式非常丑陋=收起条单行化）', async () => {
    await mountLive();
    expect(hostEl!.querySelector('.ld-detail-seg'), '收起态 seg 隐藏').toBeNull();
    const toggle = hostEl!.querySelector('.ld-detail-toggle') as HTMLButtonElement;
    toggle.click();
    await settle();
    expect(hostEl!.querySelector('.ld-detail-seg'), '展开态 seg 在场').toBeTruthy();
  });

  it('C2 批内勘正：nodeMode（byNode 默认开+集群已选）下明细 seg 非空壳（HEAD 潜伏 v-if 误罩 v-for，件4 默认开放大）+body 落告警历史非空白', async () => {
    await mountLive();
    const appStore = useAppStore(piniaEl!);
    appStore.conns = [{ id: 'c1', name: 'qa-es' }] as any;
    appStore.target = 'c1';
    await settle(20);
    const toggle = hostEl!.querySelector('.ld-detail-toggle') as HTMLButtonElement;
    toggle.click();
    await settle();
    const btns = [...hostEl!.querySelectorAll('.ld-detail-seg button')];
    expect(btns.length, 'nodeMode 下 seg 按钮非零（Top 摘除但 slow/alert 留场）').toBeGreaterThan(0);
    expect(btns.map(b => (b.textContent || '').trim()).some(t => t.includes('Top 索引')), 'Top 索引钮不在 nodeMode seg').toBe(false);
    expect(btns.some(b => (b.textContent || '').includes('告警历史')), '告警历史钮在场').toBe(true);
    const body = hostEl!.querySelector('.ld-detail-body');
    expect((body?.textContent || '').trim().length, 'body 非空白（top+nodeMode 无分支命中=旧空壳）').toBeGreaterThan(0);
  });
});

describe('件4：byNode 默认开启', () => {
  it('D1 源码锁+挂载：usePref live.byNode 默认 true（选中集群即节点叠加=默认效果）', async () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/byNode = usePref<boolean>\('live\.byNode', true\)/);
    await mountLive();
    const cb = hostEl!.querySelector('.ld-hist-node input') as HTMLInputElement | null;
    if (cb) expect(cb.checked, 'checkbox 默认勾选').toBe(true);
  });
});

describe('件5：页头 actions 单行化', () => {
  it('E1 源码锁：本页 scope ph-r nowrap 覆写（竖排三行根治）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-page :deep\(\.ph-r\)[^{]*\{[^}]*flex-wrap:\s*nowrap/);
  });
});

describe('件6：历史区告警胶囊行撤（零重复）', () => {
  it('F1 挂载：空告警时历史区零胶囊行（与实时告警区重复退役；有告警 chips 时保留）', async () => {
    await mountLive();
    expect(hostEl!.querySelector('.ld-hist-alerts'), '空告警整行不渲染').toBeNull();
  });
  it('F2 源码锁：告警行 v-if=srvActive.length（空不渲染）+802 胶囊锁面维持', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/class="ld-hist-alerts"[^>]*v-if="srvActive\.length"|v-if="srvActive\.length"[^>]*class="ld-hist-alerts"/);
    expect(s).toContain('ld-ok-chip');
  });
});
