/**
 * 五百九十七批·R59 实时监控页视觉交互深度重构（用户实报「视觉交互仍有很多提升空间，
 * 深度重构前后端全栈加强，布局规范遵循 GOAL-CONSOLE-DEEP.md」）。
 *
 * 宪法对位（GOAL-CONSOLE-DEEP.md）：utilitarian/Kibana 同语言、--sp 与 --fs 档表制、
 * 禁 AI slop（零新色零玻璃零渐变滥用——渐变面积是 HistoryChart 既有数据语汇非装饰）、
 * 降层纯视觉（高度哨兵恒定）、加载态语汇（SkeletonBox 三层回声约定）、高频交互
 * 下钻链路（铁律 B：告警条可点定位=既有，节点卡同级补齐）。
 *
 * 件 A【视觉】实时六卡折线渐变面积：SVG linearGradient（卡身份色 25%→透明）+polygon
 *   面积（sparkArea 拼 0,H/W,H 两角）——HistoryChart 渐变面积同语汇，实时卡此前裸线。
 * 件 B【视觉/档位纠偏】卡头当前值 14px→21px：.ld-chart-cur 升 var(--fs-num)
 *   （theme.css:90 档表用途明写「KPI 中号数字」，此前 fs-lg 14px=档位错配）。
 * 件 C【丝滑/加载态】采样中占位骨架化：SkeletonBox 取代纯文字（三层回声约定），
 *   「约 10s 后出图」提示语保留。
 * 件 D【交互/下钻】节点卡点击下钻 /diag?node={name}（告警条 alertRoute 同款语汇；
 *   role=button+tabindex+Enter 键盘可达=铁律 B；hover 边框亮）。
 * 件 E【视觉/KPI】快照状态 chip（对标阿里云集群级「快照状态」卡）：cluster doc
 *   snapshotFailed/snapshotsTotal 按 timestamp 最新取（596 约定），失败>0 err。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useLiveMonitorStore } from '../stores/liveMonitor';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const sparkSrc = readFileSync(join(__dirname, '../utils/sparkChart.ts'), 'utf-8'); /* 六百三十八批 P1a-1：sparkArea 单源下沉 */
const cardSrc = readFileSync(join(__dirname, '../components/LiveChartCard.vue'), 'utf-8'); /* 六百三十八批 P1a-2 */
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
    get(_target, prop: string) {
      if (prop === 'monitorMetrics') {
        return () => Promise.resolve({ records: [
          { kind: 'metrics', scope: 'cluster', connName: 'qa-es', timestamp: 2000, qps: 71.4, indices: 863, snapshotFailed: 1, snapshotsTotal: 12 },
          { kind: 'metrics', scope: 'cluster', connName: 'qa-es', timestamp: 1000, qps: 52, indices: 861, snapshotFailed: 0, snapshotsTotal: 11 },
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

async function mountLive() {
  location.hash = '#/';
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/diag', component: { template: '<div/>' } },
    ],
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
  return { app, host, pinia, router };
}

describe('五百九十七批：实时区视觉交互深度重构', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('件 A：六卡渐变面积——linearGradient defs+面积 path 在场（fill=url(#ldg-*)；681 同步更新 polygon→.ld-area）', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      mon.qpsSeries = [3, 7, 5];
      mon.heapSeries = [10, 90];
      await settle();
      const charts = host.querySelectorAll('.ld-chart');
      const grads = host.querySelectorAll('.ld-charts defs linearGradient');
      expect(grads.length, '渐变 defs 在场（六卡渐变语汇）').toBeGreaterThanOrEqual(1);
      /* 六百八十一批同步更新：面积 polygon→path.ld-area（622 §9-D4 曲线平滑同曲线面积）——
         锚点数语义不变：3 数据点=2 条 C；两角闭合 L 右下 L 左下 Z */
      const areas = [...charts].filter(c => c.querySelector('path.ld-area'));
      expect(areas.length, '有折线的卡都有面积 path').toBeGreaterThanOrEqual(2);
      const area = charts[0].querySelector('path.ld-area');
      expect(area?.getAttribute('fill') ?? '', '面积填充引用渐变').toMatch(/^url\(#ldg-/);
      const d = (area?.getAttribute('d') ?? '').trim();
      expect((d.match(/ C /g) ?? []).length, '3 数据点=2 平滑段').toBe(2);
      expect(d, '两角闭合（右下→左下）').toMatch(/ L [0-9.]+,88\.0 L 0\.0,88\.0 Z$/);
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('件 B：卡头当前值档位（597 fs-num 纠偏→799 同步更新 fs-num-l 28px=任务卡两行制 KPI 与组件同构）', () => {
    const t = strip(liveSrc);
    expect(t, '.ld-chart-cur 档位（799 终态）').toMatch(/\.ld-chart-cur \{[^}]*var\(--fs-num-l\)/);
    expect(t, '退役 14px 小字档').not.toMatch(/\.ld-chart-cur \{[^}]*var\(--fs-lg\)/);
  });

  it('件 C：采样中占位骨架化（SkeletonBox 在场+提示语保留）', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      mon.qpsSeries = [3]; /* <2 点=占位态 */
      await settle();
      const wait = host.querySelectorAll('.ld-svg-wait')[0];
      expect(wait, '占位容器在场').toBeTruthy();
      expect(wait.querySelector('.sk, [class*=skeleton], .ld-sk'), '骨架件在场（三层回声语汇）').toBeTruthy();
      expect(wait.textContent).toContain('采样中');
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('件 D：节点卡点击下钻 /diag?node={name}——role=button+Enter 键盘可达+router.push 断言', async () => {
    const { app, host, pinia, router } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      mon.nodes = [
        { nodeId: 'n1', name: 'qa-es-1', roles: ['data'], heapPct: 30, cpuPct: 38, diskTotal: 100, diskFree: 41 },
      ];
      await settle();
      const card = host.querySelector('.ld-node') as HTMLElement;
      expect(card.getAttribute('role'), '节点卡=button 语义').toBe('button');
      expect(card.getAttribute('tabindex'), '键盘可达').toBe('0');
      const spy = vi.spyOn(router, 'push');
      card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle(4);
      expect(spy).toHaveBeenCalledWith({ path: '/diag', query: { node: 'qa-es-1' } });
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle(4);
      expect(spy).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('件 E：快照状态 chip——timestamp 最新采样 snapshotFailed=1 → err 档「快照」chip', async () => {
    const { app, host } = await mountLive();
    try {
      await settle(30);
      const stripEl = host.querySelector('.ld-strip')!;
      expect(stripEl.textContent).toContain('快照');
      expect(stripEl.textContent).toContain('1'); /* 最新一条 snapshotFailed=1（非旧条 0） */
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('源码锁：sparkArea 单源+骨架语汇+下钻接线+快照 chip 接线', () => {
    const t = strip(liveSrc);
    const c = strip(cardSrc);
    expect(c, '面积拼接经 import 单源消费（合并进组件；681 同步更新=平滑面积 catmullRomAreaPath 同单源）').toContain("catmullRomAreaPath } from '../utils/sparkChart'");
    expect(c, '组件不再本地定义 sparkArea（零重定义=单源）').not.toContain('function sparkArea');
    expect(strip(sparkSrc), 'sparkArea 真源在 utils/sparkChart.ts').toContain('function sparkArea');
    expect(c, '渐变 id 语汇（组件 :id="gid" 动态消费）').toContain(':id="gid"');
    expect(c, '面积填充 url(#gid)').toContain("'url(#' + gid + ')'");
    expect(t, '渐变 id 前缀（视图 gid 保留 ldg- 前缀）').toMatch(/gid="ldg-/);
    expect(c, '骨架占位（组件）').toContain('SkeletonBox');
    expect(t, '下钻接线（alertRoute 同语汇，留视图）').toContain("path: '/diag', query: { node:");
    expect(t, '快照 chip 接线（留视图）').toContain('lastClusterSnapshot');
  });
});
