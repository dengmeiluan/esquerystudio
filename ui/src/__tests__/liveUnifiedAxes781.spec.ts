/**
 * 七百八十一批：实时监控整体重构（用户实报随修；稿=docs/goal781-live-unified.html）。
 *
 * 件A-K1 主卡轴系统一（LiveChartCard）：折线/阈值线挂 vector-effect=non-scaling-stroke
 *   （viewBox 300 拉伸不再变粗=「线粗遮挡文案」根治）；Y 轴左缘双刻度（pct=100/0、
 *   abs=窗峰值/0，HistoryChart .hc-ymax/.hc-yzero 同语言）；阈值虚线右缘贴行标值
 *   （.hc-thlabel 同语言）；X 轴时间锚移出图区独立行（start/mid/end 3 锚，与折线零叠压）。
 * 件A-K2 节点对比悬浮化：常驻图例退役（与悬浮读出重复=用户点名「应该是悬浮数据」）；
 *   读出行尾 × 隐藏节点（治 615 批图例「隐藏后无法再显示」死路）+头部「已隐藏 N ▸ 恢复」；
 *   轴系补齐（pct 网格 25/50/75+100/0 刻度+阈值标签；abs 峰值/0；X 3 锚）；1.5px 恒宽多线。
 * 件A-K3 节点卡减密：卡内三行迷你 spark 退役（与节点对比图/历史下钻重复；tp/load 两行保留）。
 * 驱动：seedNine（liveLegend615 同源）+ 集群序列直种。
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

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  const anyCall: any = new Proxy(function () { return Promise.resolve(null); }, {
    get(_t, p) {
      if (p === 'then' || typeof p === 'symbol') return undefined;
      return anyCall;
    },
    apply() { return Promise.resolve(null); },
  });
  const proxied = new Proxy({}, { get: () => anyCall });
  return { ...actual, api: proxied };
});

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

function seedFull(mon: ReturnType<typeof useLiveMonitorStore>) {
  const names = ['n-1', 'n-2', 'n-3', 'n-4', 'n-5', 'n-6', 'n-7', 'n-8', 'n-9'];
  mon.nodes = names.map((n, i) => ({
    nodeId: 'id' + i, name: n, roles: ['data'], heapPct: 30 + i, cpuPct: 20 + i,
    diskTotal: 100, diskFree: 50, tpSearchActive: i, tpSearchQueue: 0, load: { '1m': 1.5 },
  }));
  mon.nodeSeries = Object.fromEntries(names.map(n => [n, { heap: [30, 31, 32], cpu: [20, 21, 22], disk: [50, 51, 52], qps: [1, 2, 3], idx: [4, 5, 6] }]));
  mon.sampleTs = [1000, 2000, 3000];
  /* 集群级五卡序列（QPS 峰值 160=abs 顶刻度锚；heap 60~68 过 80 阈值线在高位） */
  mon.qpsSeries = [100, 120, 140, 160];
  mon.indexRateSeries = [40, 42, 44, 46];
  mon.heapSeries = [60, 62, 65, 68];
  mon.cpuSeries = [20, 22, 24, 26];
  mon.diskSeries = [55, 56, 57, 58];
}

function cardByTitle(host: HTMLElement, title: string): HTMLElement | null {
  return [...host.querySelectorAll('.ld-chart')].find(c => (c.textContent || '').includes(title)) as HTMLElement | undefined || null;
}

let app: ReturnType<typeof createApp> | null = null;
let hostEl: HTMLElement | null = null;
beforeEach(async () => {
  localStorage.clear();
  document.body.innerHTML = '';
  const m = await mountLive();
  app = m.app; hostEl = m.host;
  seedFull(useLiveMonitorStore(m.pinia));
  await settle();
});
afterEach(() => {
  app?.unmount();
  hostEl?.remove();
  app = null; hostEl = null;
});

describe('K1 主卡（LiveChartCard）细线恒宽 + 轴系补齐', () => {
  it('折线/阈值线挂 non-scaling-stroke（拉伸不再变粗）', () => {
    const heap = cardByTitle(hostEl!, 'Heap 使用趋势')!;
    expect(heap).toBeTruthy();
    const line = heap.querySelector('path.ld-line')!;
    expect(line.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(line.getAttribute('stroke-width')).toBe('1.5'); /* 794 件3：与对比卡统一细线 */
    const th = heap.querySelector('line[stroke-dasharray]')!;
    expect(th.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  it('Y 轴左缘双刻度：pct 卡 100/0；abs 卡窗峰值/0', () => {
    const heap = cardByTitle(hostEl!, 'Heap 使用趋势')!;
    const top = heap.querySelector('.ld-yt-top')!;
    const bot = heap.querySelector('.ld-yt-bot')!;
    expect(top.textContent).toBe('100');
    expect(bot.textContent).toBe('0');
    const qps = cardByTitle(hostEl!, '集群 QPS')!;
    expect(qps.querySelector('.ld-yt-top')!.textContent).toBe('160');
    expect(qps.querySelector('.ld-yt-bot')!.textContent).toBe('0');
  });

  it('阈值虚线右缘贴行标值（heap warn=80）', () => {
    const heap = cardByTitle(hostEl!, 'Heap 使用趋势')!;
    const thv = heap.querySelector('.ld-thv')!;
    expect(thv.textContent).toBe('80');
    expect(thv.className).toContain('ld-thv');
  });

  it('X 轴时间锚移出图区：独立行 3 锚（start/mid/end），svgwrap 内零残留', () => {
    const qps = cardByTitle(hostEl!, '集群 QPS')!;
    const xaxis = qps.querySelector('.ld-xaxis')!;
    expect(xaxis, '图下独立时间行').toBeTruthy();
    expect(xaxis.querySelectorAll('.ld-ta').length).toBe(3);
    expect(xaxis.querySelector('.ld-ta-l')).toBeTruthy();
    expect(xaxis.querySelector('.ld-ta-m')).toBeTruthy();
    expect(xaxis.querySelector('.ld-ta-r')).toBeTruthy();
    expect(qps.querySelector('.ld-svgwrap')!.querySelector('.ld-ta')).toBeNull();
    /* 三锚文本非空（时间可读） */
    for (const t of xaxis.querySelectorAll('.ld-ta')) expect((t.textContent || '').trim().length).toBeGreaterThan(0);
  });

  it('源码锁：X 轴行与 Y 刻度样式侧（HistoryChart .hc-xaxis 同语言）', () => {
    const t = strip(cardSrc);
    expect(t).toMatch(/\.ld-xaxis \{ display: flex; justify-content: space-between;/);
    expect(t).toMatch(/\.ld-yt \{/);
    expect(t).toMatch(/\.ld-thv \{/);
  });
});

describe('K2 节点对比悬浮化 + 轴系', () => {
  /* 794 件1 同步更新：对比面悬浮面板化（默认关）——断言前点入口钮开面板 */
  function cmpSync(): HTMLElement | null { return hostEl!.querySelector('.ld-ncmp-panel'); }
  async function cmp(): Promise<HTMLElement> {
    let p = cmpSync();
    if (!p) { (hostEl!.querySelector('.ld-ncmp-entry') as HTMLButtonElement)?.click(); await settle(); p = cmpSync(); }
    if (!p) throw new Error('794 同步更新：悬浮面板开失败');
    return p;
  }

  it('常驻图例退役（零 .ld-ncmp-leg）', async () => {
    expect((await cmp()).querySelectorAll('.ld-ncmp-leg').length).toBe(0);
    expect(strip(liveSrc)).not.toContain('ld-ncmp-leg-b');
  });

  it('pct 档轴系：25/50/75 网格 + 100/0 刻度 + 阈值标签（heap warn=80）', async () => {
    const c = await cmp();
    expect(c.querySelectorAll('svg .ld-glines line').length).toBe(3);
    expect(c.querySelector('.ld-yt-top')!.textContent).toBe('100');
    expect(c.querySelector('.ld-yt-bot')!.textContent).toBe('0');
    expect(c.querySelector('.ld-thv')!.textContent).toBe('80');
  });

  it('abs 档（QPS）：无网格无阈值标签，顶刻度=窗峰值（899 续滑动平均后=均值窗峰值）', async () => {
    const c = await cmp();
    const segBtn = [...c.querySelectorAll('.ld-seg button')].find(b => b.textContent!.includes('QPS')) as HTMLElement;
    segBtn.click();
    await settle();
    expect(c.querySelectorAll('svg .ld-glines line').length).toBe(0);
    expect(c.querySelector('.ld-thv')).toBeNull();
    /* 种子 qps=[1,2,3] → 5 窗滑动平均 [1,1.5,2] → 顶刻度=均值后窗峰值 2.0 */
    expect(c.querySelector('.ld-yt-top')!.textContent).toBe('2.0');
    expect(c.querySelector('.ld-yt-bot')!.textContent).toBe('0');
  });

  it('多线 1.5px 恒宽（non-scaling）', async () => {
    const lines = [...(await cmp()).querySelectorAll('svg path')]; /* 八百二十八批 polyline→path 同步更新 */
    expect(lines.length).toBe(9);
    for (const l of lines) {
      expect(l.getAttribute('stroke-width')).toBe('1.5');
      expect(l.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    }
  });

  it('X 轴时间行 3 锚（图区之下独立行）', async () => {
    const x = (await cmp()).querySelector('.ld-xaxis')!;
    expect(x).toBeTruthy();
    expect(x.querySelectorAll('.ld-ta').length).toBe(3);
  });

  it('悬浮读出行尾 × 隐藏节点 + 头部「已隐藏 N ▸ 恢复」一键复原', async () => {
    const c = await cmp();
    /* 877 同步更新：悬浮监听下沉绘图域 .ld-cmp-plot（面板域监听=读出恒坠约 40px 病灶退役） */
    (c.querySelector('.ld-cmp-plot') as HTMLElement).dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0 }));
    await settle(4);
    const hv = c.querySelector('.ld-hv.ld-hv-stack')!;
    /* 八百二十五批同步更新：CMP_TIP_CAP 8→24（用户实报「+1 节点…看不完整」）→9 节点全量读出+尾行零在场
       （700 批①截断口径退役于常规规模；+N 通道保留兜底 >24 行极端集群） */
    expect(hv.querySelectorAll('.ld-ncmp-tip-r').length).toBe(9);
    expect(hv.textContent).not.toContain('+1 节点');
    /* 每行尾隐藏钮在场（全量=9 行全带钮） */
    const hides = hv.querySelectorAll('button.ld-ncmp-hide');
    expect(hides.length).toBe(9);
    /* 点 n-1 行的 × → 折线 9→8 + 读出过滤 + 头部恢复钮出场 */
    const row1 = [...hv.querySelectorAll('.ld-ncmp-tip-r')].find(r => r.textContent!.includes('n-1'))!;
    (row1.querySelector('button.ld-ncmp-hide') as HTMLElement).click();
    await settle();
    expect(c.querySelectorAll('path').length).toBe(8); /* 八百二十八批同步更新 */
    const restore = c.querySelector('button.ld-ncmp-restore') as HTMLElement;
    expect(restore).toBeTruthy();
    expect(restore.textContent!).toContain('已隐藏 1');
    /* 恢复全部 → 9 条回全 */
    restore.click();
    await settle();
    expect(c.querySelectorAll('path').length).toBe(9); /* 八百二十八批同步更新 */
    expect(c.querySelector('button.ld-ncmp-restore')).toBeNull();
  });
});

describe('K3 节点卡减密（迷你 spark 退役）', () => {
  it('零 .ld-node-sparks/.ld-spark；heap/cpu/disk/tp/load 行保留', () => {
    const card = hostEl!.querySelector('.ld-node') as HTMLElement;
    expect(card).toBeTruthy();
    expect(hostEl!.querySelectorAll('.ld-node-sparks').length).toBe(0);
    expect(hostEl!.querySelectorAll('.ld-spark').length).toBe(0);
    const rows = [...card.querySelectorAll('.ld-node-row')];
    for (const key of ['heap', 'cpu', 'disk', 'tp', 'load']) {
      expect(rows.find(r => r.textContent!.includes(key)), key + ' 行保留').toBeTruthy();
    }
  });

  it('源码锁：迷你 spark 零残留（NODE_METRICS/ld-spark-row 退役防回潮）', () => {
    const t = strip(liveSrc);
    expect(t).not.toContain('NODE_METRICS');
    expect(t).not.toContain('ld-spark-row');
    expect(t).not.toContain('ld-node-sparks');
  });
});
