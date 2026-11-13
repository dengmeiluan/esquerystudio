/**
 * 五百八十九批·R55 实时区走势卡悬浮详情——十字线+最近点+时刻值读出。
 *
 * 背景（对标阿里云基础监控每卡悬浮读数 + 用户实报「页面不够丝滑」）：实时区五张走势卡
 * （QPS/写入/Heap/CPU/磁盘）此前是裸 SVG 折线，无任何悬浮反馈；历史区 HistoryChart 早已
 * 有十字线+最近点+tooltip 全套交互（hc-xline/hc-tip），实时卡与历史卡交互语汇断裂。
 *
 * ①纯函数 sparkHoverAt（utils/sparkHover.ts）：指针分数 → 最近采样点命中
 *   （序号/十字线 x/圆点 y/原值/采样时刻），点位公式与视图 sparklinePoints(Pct) 逐字同源
 *   （pct=0-100 固定刻度 / abs=max(...data,1) 地板），保证十字线钉在曲线上。
 * ②视图接线：.ld-svgwrap 挂 mousemove/mouseleave，HTML 绝对定位层渲染
 *   ld-xline/ld-dot/ld-hv（HistoryChart 同语汇迷你版——圆点与文本不进 SVG，
 *   防 preserveAspectRatio=none 非等比缩放把圆拉成椭圆、文字变形）。
 *
 * 行为锁锚：happy-dom getBoundingClientRect 恒 0 → frac=0 → 命中首采样点（确定性断言）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { sparkHoverAt } from '../utils/sparkHover';
import { useLiveMonitorStore } from '../stores/liveMonitor';
import { fmtTime } from '../utils/format';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const cardSrc = readFileSync(join(__dirname, '../components/LiveChartCard.vue'), 'utf-8'); /* 六百三十八批 P1a-2 */
/* 剥注释：注释里的字面不算数（flattenWave556 同一教训） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* ═══════════ ① 纯函数 sparkHoverAt ═══════════ */

describe('五百八十九批①：sparkHoverAt 指针分数→最近采样点命中', () => {
  it('pct 模式：0-100 固定刻度，y 与 sparklinePointsPct 同式（v=10 → y=57.6@H=64）', () => {
    const hit = sparkHoverAt([10, 50, 90], [1000, 2000, 3000], 0, 300, 64, 'pct');
    expect(hit).not.toBeNull();
    expect(hit!.i).toBe(0);
    expect(hit!.v).toBe(10);
    expect(hit!.t).toBe(1000);
    expect(hit!.y).toBeCloseTo(64 - 10 / 100 * 64, 5);
    expect(hit!.x).toBe(0);
    const last = sparkHoverAt([10, 50, 90], [1000, 2000, 3000], 1, 300, 64, 'pct');
    expect(last!.i).toBe(2);
    expect(last!.v).toBe(90);
    expect(last!.y).toBeCloseTo(64 - 90 / 100 * 64, 5);
    const mid = sparkHoverAt([10, 50, 90], [1000, 2000, 3000], 0.5, 300, 64, 'pct');
    expect(mid!.i).toBe(1);
    expect(mid!.y).toBeCloseTo(32, 5);
    /* pct 语义钳到 0-100：越界值按界画（与 sparklinePointsPct 钳位一致） */
    const over = sparkHoverAt([120, 50], [1, 2], 0, 300, 64, 'pct');
    expect(over!.y).toBe(0);
  });

  it('abs 模式：max(...data,1) 地板缩放，与 sparklinePoints 同式（零值不除零）', () => {
    const hit = sparkHoverAt([0, 5], [1000, 2000], 0, 300, 64, 'abs');
    expect(hit!.v).toBe(0);
    expect(hit!.y).toBe(64); /* 0/5 → 底边 */
    const last = sparkHoverAt([0, 5], [1000, 2000], 1, 300, 64, 'abs');
    expect(last!.y).toBe(0); /* 峰值 → 顶边 */
    const flat = sparkHoverAt([0, 0], [1, 2], 0.5, 300, 64, 'abs');
    expect(flat!.y).toBe(64); /* 全零序列 mx=1 地板，不产生 NaN */
  });

  it('钳制与守门：frac 越界收敛/NaN 归零/点数不足 null/ts 缺位 t=0', () => {
    expect(sparkHoverAt([1, 2, 3], [1, 2, 3], -3, 300, 64, 'pct')!.i).toBe(0);
    expect(sparkHoverAt([1, 2, 3], [1, 2, 3], 7, 300, 64, 'pct')!.i).toBe(2);
    expect(sparkHoverAt([1, 2, 3], [1, 2, 3], NaN, 300, 64, 'pct')!.i).toBe(0);
    expect(sparkHoverAt([1], [1], 0.5, 300, 64, 'pct')).toBeNull();
    expect(sparkHoverAt([], [], 0.5, 300, 64, 'abs')).toBeNull();
    const noTs = sparkHoverAt([1, 2], [], 0.5, 300, 64, 'pct');
    expect(noTs!.t).toBe(0);
  });
});

/* ═══════════ ② 视图接线：悬浮层渲染/清除 + 采样值读出 ═══════════ */

/* api 全兜底零网络（flattenWave556 同款 Proxy 形态） */
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

describe('五百八十九批②：LiveDashboardView 走势卡悬浮详情接线', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('mousemove → 十字线/圆点/读出层在场，读出=首采样点值+时刻；mouseleave → 全收', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      mon.qpsSeries = [3.2, 7.5, 5];
      mon.heapSeries = [10, 90];
      mon.sampleTs = [1000, 2000, 3000];
      await settle();
      /* 序列 >1 点后 SVG 在场（ld-svgwrap 悬浮层宿主） */
      const wraps = host.querySelectorAll('.ld-svgwrap');
      expect(wraps.length, '五张走势卡都有悬浮宿主').toBe(5);
      const qpsWrap = wraps[0];
      expect(qpsWrap.querySelector('svg'), 'QPS 卡 SVG 在场').toBeTruthy();

      /* happy-dom rect 恒 0 → frac=0 → 命中首点：读出=3.2/3.3 与 fmtTime(1000) */
      qpsWrap.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0 }));
      await settle(4);
      const hv = qpsWrap.querySelector('.ld-hv');
      expect(hv, '悬浮读出层在场').toBeTruthy();
      expect(hv!.textContent).toContain('3.2');
      expect(hv!.textContent).toContain(fmtTime(1000));
      expect(qpsWrap.querySelector('.ld-xline'), '十字线在场').toBeTruthy();
      expect(qpsWrap.querySelector('.ld-dot'), '最近点圆点在场').toBeTruthy();

      qpsWrap.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
      await settle(4);
      expect(qpsWrap.querySelector('.ld-hv'), '离开后读出层收起').toBeNull();
      expect(qpsWrap.querySelector('.ld-xline'), '离开后十字线收起').toBeNull();

      /* pct 卡：Heap 首点 10 → 读出 10.0%（值域语义随卡） */
      const heapWrap = wraps[2];
      heapWrap.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0 }));
      await settle(4);
      expect(heapWrap.querySelector('.ld-hv')!.textContent).toContain('10.0%');
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('采样不足（<2 点）无 SVG 无悬浮宿主行为：mousemove 不产生读出层', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      mon.qpsSeries = [3];
      await settle();
      const qpsWrap = host.querySelectorAll('.ld-svgwrap')[0];
      expect(qpsWrap.querySelector('svg'), '点数不足 SVG 不渲染').toBeNull();
      qpsWrap.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0 }));
      await settle(4);
      expect(qpsWrap.querySelector('.ld-hv'), '空序列 hover 零读出').toBeNull();
    } finally {
      app.unmount();
      host.remove();
    }
  });
});

/* ═══════════ ③ 源码锁：悬浮层语汇在场防回流 ═══════════ */

describe('五百八十九批③：源码锁（ld-svgwrap 挂接+HTML 悬浮层三件）', () => {
  it('五卡宿主 @mousemove/@mouseleave 接线 + ld-xline/ld-dot/ld-hv 语汇 + 点位公式同源', () => {
    const c = strip(cardSrc);
    expect(c, '宿主挂 mousemove（合并进组件）').toContain('@mousemove="onMove"');
    expect(c, '宿主挂 mouseleave（合并进组件）').toContain('@mouseleave="onLeave"');
    expect(c, '十字线件').toContain('class="ld-svgwrap"');
    expect(c, '十字线件').toContain('.ld-xline');
    expect(c, '最近点圆点件').toContain('.ld-dot');
    expect(c, '读出层件').toContain('.ld-hv');
    /* 读出时刻走 fmtTime 单源（与告警/历史 tooltip 同语汇），不许视图私造时间格式 */
    expect(c, '读出时刻 fmtTime 单源').toContain('fmtTime(');
  });
});
