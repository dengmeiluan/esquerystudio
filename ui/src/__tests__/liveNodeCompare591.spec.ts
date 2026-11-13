/**
 * 五百九十一批·R56 实时区节点对比叠加图（含各节点悬浮值行读出）。
 *
 * 背景（goal METRICS「集群→节点两级监控数据可查、可对比」+档案 ⑥ 头号候选合并）：实时区
 * 节点卡各自持有 mini spark（180×20，悬浮命中窗窄=589 时评估结论），但跨节点对比只能
 * 眼扫小图；历史区 scope=node 已有「各节点序列叠加」交互（色板锚定节点排序位），实时区
 * 缺同语汇。=节点区加指标分段（Heap/CPU/磁盘）+一张全宽叠加卡：各节点序列按排序位
 * 锚定 HistoryChart PALETTE 同源五色画多折线+当前指标阈值虚线；悬浮复用 sparkHoverAt
 * （pct 刻度）出十字线+读出层按节点列「色点+名+该时刻值%」行（589 单值读出的多序列版）。
 *
 * 数据零新采样：nodeSeries（per-node heap/cpu/disk 序列）已在 store 常驻持久化。
 * 批号注：590 被对方 lane spResidue（轨5）占号（untracked spec+门禁文件在树，18:3x 活跃），
 * 567-C1/575 让位先例同步更新 591。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useLiveMonitorStore } from '../stores/liveMonitor';
import { fmtTime } from '../utils/format';
import { METRIC_THRESHOLDS } from '../utils/metricThresholds';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
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

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountLive() {
  location.hash = '#/';
  const pinia = createPinia();
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

/* 两节点 × 三指标序列（≥2 点出线）；ts 三点与序列等长 */
function seedNodes(mon: ReturnType<typeof useLiveMonitorStore>) {
  mon.nodes = [
    { nodeId: 'n1', name: 'qa-es-1', roles: ['data', 'ingest'], heapPct: 30, cpuPct: 38, diskTotal: 100, diskFree: 41 },
    { nodeId: 'n2', name: 'qa-es-2', roles: ['data'], heapPct: 34, cpuPct: 52, diskTotal: 100, diskFree: 24 },
  ];
  mon.nodeSeries = {
    'qa-es-1': { heap: [28, 30, 31], cpu: [40, 38, 36], disk: [58, 59, 59.5], qps: [30, 80, 55], idx: [10, 25, 18] },
    'qa-es-2': { heap: [32, 34, 35], cpu: [55, 52, 50], disk: [75, 76, 76.4], qps: [20, 45, 35], idx: [8, 20, 12] },
  };
  mon.sampleTs = [1000, 2000, 3000];
}

describe('五百九十一批：实时区节点对比叠加图接线', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('默认 Heap：叠加卡多折线（节点数条）+色板锚排序位+阈值虚线 80；悬浮读出含节点名（781 批图例退役同步更新）', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      seedNodes(useLiveMonitorStore(pinia));
      await settle();
      /* 794 件1 同步更新：对比面悬浮面板化（默认关）——断言前点入口钮开面板 */
      (host.querySelector('.ld-ncmp-entry') as HTMLButtonElement)?.click();
      await settle();
      const cmp = host.querySelector('.ld-ncmp-panel');
      expect(cmp, '节点对比叠加卡在场').toBeTruthy();
      const lines = cmp!.querySelectorAll('path'); /* 八百二十八批 polyline→path 平滑同步更新 */
      expect(lines.length, '每节点一条折线').toBe(2);
      expect(lines[0].getAttribute('stroke'), '首序位色=dv-blue（HistoryChart PALETTE 同源）').toBe('var(--dv-blue)');
      expect(lines[1].getAttribute('stroke'), '次序位色=ok').toBe('var(--ok)');
      const th = cmp!.querySelector('line[stroke-dasharray]');
      expect(parseFloat(th?.getAttribute('y1') ?? ''), 'heap.warn=80 → y=120-120*0.8（629 批对比卡图高 96→120 同步更新）').toBeCloseTo(24, 5);
      /* 七百八十一批 K2 同步更新：常驻图例退役（与悬浮读出双份重复）——节点名断言迁悬浮读出层 */
      cmp!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0 }));
      await settle(4);
      expect(cmp!.textContent).toContain('qa-es-1');
      expect(cmp!.textContent).toContain('qa-es-2');
      expect(cmp!.querySelector('.seg'), '指标分段钮在场（站内 .seg 单源）').toBeTruthy();
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('分段切 CPU：阈值线随档变（warn 75→y=24）+active 态迁移（R57 扩五档后=5 分段）', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      mon.nodes = [
        { nodeId: 'n1', name: 'qa-es-1', roles: ['data'], heapPct: 30, cpuPct: 38, diskTotal: 100, diskFree: 41 },
        { nodeId: 'n2', name: 'qa-es-2', roles: ['data'], heapPct: 34, cpuPct: 52, diskTotal: 100, diskFree: 24 },
      ];
      mon.nodeSeries = {
        'qa-es-1': { heap: [28, 30, 31], cpu: [40, 38, 36], disk: [58, 59, 59.5], qps: [30, 80, 55], idx: [10, 25, 18] },
        'qa-es-2': { heap: [32, 34, 35], cpu: [55, 52, 50], disk: [75, 76, 76.4], qps: [20, 45, 35], idx: [8, 20, 12] },
      };
      mon.sampleTs = [1000, 2000, 3000];
      await settle();
      /* 794 件1 同步更新：对比面悬浮面板化（默认关）——断言前点入口钮开面板 */
      (host.querySelector('.ld-ncmp-entry') as HTMLButtonElement)?.click();
      await settle();
      const segs = [...host.querySelectorAll('.ld-ncmp-panel .seg button')] as HTMLButtonElement[];
      expect(segs.length, '五档分段（R57 扩 QPS/写入）').toBe(5);
      const cpuBtn = segs.find(b => b.textContent!.includes('CPU'))!;
      cpuBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle();
      const th = host.querySelector('.ld-ncmp-panel line[stroke-dasharray]');
      expect(parseFloat(th?.getAttribute('y1') ?? ''), 'cpu.warn=75 → y=120-120*0.75=30（629 批对比卡图高 96→120 同步更新）').toBeCloseTo(30, 5);
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('悬浮：十字线+读出层=时刻行+每节点「色点+名+该时刻值%」行；离场全收', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      seedNodes(useLiveMonitorStore(pinia));
      await settle();
      /* 794 件1 同步更新：对比面悬浮面板化（默认关）——断言前点入口钮开面板 */
      (host.querySelector('.ld-ncmp-entry') as HTMLButtonElement)?.click();
      await settle();
      const wrap = host.querySelector('.ld-ncmp-panel')!;
      /* happy-dom rect 恒 0 → frac=0 → 命中 i=0：各行值=各序列首点。
       877 同步更新：悬浮监听下沉绘图域 .ld-cmp-plot，派发目标随之 */
      (wrap.querySelector('.ld-cmp-plot') as HTMLElement).dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0 }));
      await settle(4);
      const hv = wrap.querySelector('.ld-hv');
      expect(hv, '悬浮读出层在场').toBeTruthy();
      expect(hv!.textContent).toContain(fmtTime(1000));
      expect(hv!.textContent).toContain('qa-es-1');
      expect(hv!.textContent).toContain('28%');
      expect(hv!.textContent).toContain('32%');
      expect(wrap.querySelector('.ld-xline'), '十字线在场').toBeTruthy();
      (wrap.querySelector('.ld-cmp-plot') as HTMLElement).dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
      await settle(4);
      expect(wrap.querySelector('.ld-hv'), '离场读出收起').toBeNull();
      expect(wrap.querySelector('.ld-xline'), '离场十字线收起').toBeNull();
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('采样不足（nodeSeries 空）：叠加卡占位无折线无悬浮产物', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      mon.nodes = [{ nodeId: 'n1', name: 'qa-es-1', roles: ['data'], heapPct: 30, cpuPct: 38, diskTotal: 100, diskFree: 41 }];
      await settle();
      /* 794 件1 同步更新：对比面悬浮面板化（默认关）——断言前点入口钮开面板 */
      (host.querySelector('.ld-ncmp-entry') as HTMLButtonElement)?.click();
      await settle();
      const cmp = host.querySelector('.ld-ncmp-panel')!;
      expect(cmp.querySelector('path'), '无序列不画线').toBeNull(); /* 八百二十八批同步更新 */
      expect(cmp.textContent).toContain('采样中');
      cmp.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0 }));
      await settle(4);
      expect(cmp.querySelector('.ld-hv'), '空序列 hover 零读出').toBeNull();
    } finally {
      app.unmount();
      host.remove();
    }
  });
});

describe('五百九十一批：源码锁（对比叠加图语汇在场防回流）', () => {
  it('分段钮+叠加卡+sparkHoverAt 单源复用+PALETTE 同源锚', () => {
    const t = strip(liveSrc);
    expect(t, '指标分段钮（站内 .seg 单源，禁私造皮；六百三十二批加 ld-seg 滑块修饰，.seg 基类仍在）').toContain('class="seg ld-seg"');
    expect(t, '叠加卡宿主（794 悬浮面板化）').toContain('class="ld-ncmp-panel"');
    expect(t, '点位换算复用 sparkHoverAt 单源（禁视图私造公式）').toContain('sparkHoverAt(');
    expect(t, '色板 HistoryChart PALETTE 同源锚').toContain('var(--ac)');
  });
});
