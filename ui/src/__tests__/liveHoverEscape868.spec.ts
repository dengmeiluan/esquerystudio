/**
 * 八百六十八批：悬浮态残留根治——鼠标坐标巡检兜底（用户三次实报「命中的点
 * 不在鼠标位置」终局定谳）。
 *
 * 现象铁证（用户截图 18:27）：坐标标签显示鼠标在 (40,421)=卡外，而 Heap 卡的
 * 十字线+tooltip 仍钉在旧位置开着——mouseleave 是悬浮态唯一的清除通道，快速
 * 移出/轮询重渲竞态下该事件会丢失（元素 patch 替换瞬间鼠标已在外，mouseleave
 * 不再发生），hit ref 永不清→悬浮态残留，用户看到的「命中的点」停在鼠标
 * 几分钟前经过的位置。
 *
 * 修法：useHoverEscape 巡检兜底——hit 非空期间挂 document capture 级 mousemove，
 * 任一移动的坐标落在卡矩形外即清悬浮态并卸载巡检（不依赖 mouseleave 事件）。
 * 六卡（LiveChartCard）/对比卡（cmpHit）/顶部图（topHit）三链统一接线。
 *
 * 锁定（红→绿）：
 * 1) 行为锚：卡内 mousemove 建立悬浮后，向 document 派发远处（卡外）mousemove
 *    ——当前实现无巡检，十字线残留（红）；刀后十字线收起（绿）；
 * 2) 行为锚：坐标回到卡内时悬浮正常重建（巡检不误伤正常使用）；
 * 3) 接线锁：三链源码含 useHoverEscape 接线。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useLiveMonitorStore } from '../stores/liveMonitor';

const cardSrc = readFileSync(join(__dirname, '../components/LiveChartCard.vue'), 'utf-8');
const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');

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

async function settle(n = 10) {
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

function seedNodes(mon: any) {
  mon.windowPts = 6;
  mon.nodes = [
    { nodeId: 'n1', name: 'qa-es-1', roles: ['data'], heapPct: 30, cpuPct: 38, diskTotal: 100, diskFree: 41 },
    { nodeId: 'n2', name: 'qa-es-2', roles: ['data'], heapPct: 34, cpuPct: 52, diskTotal: 100, diskFree: 24 },
  ];
  mon.nodeSeries = {
    'qa-es-1': { heap: [10, 20, 30, 40, 50, 60], cpu: [10, 20, 30, 40, 50, 60], disk: [10, 20, 30, 40, 50, 60], qps: [1, 2, 3, 4, 5, 6], idx: [1, 2, 3, 4, 5, 6] },
    'qa-es-2': { heap: [11, 21, 31, 41, 51, 61], cpu: [11, 21, 31, 41, 51, 61], disk: [11, 21, 31, 41, 51, 61], qps: [2, 3, 4, 5, 6, 7], idx: [2, 3, 4, 5, 6, 7] },
  };
  mon.qpsSeries = [1, 2, 3, 4, 5, 6];
  mon.indexRateSeries = [2, 3, 4, 5, 6, 7];
  mon.heapSeries = [20, 22, 24, 26, 28, 30];
  mon.cpuSeries = [30, 32, 34, 36, 38, 40];
  mon.diskSeries = [40, 42, 44, 46, 48, 50];
  mon.sampleTs = Array.from({ length: 6 }, (_, i) => 60_000 * (i + 1));
}

describe('liveHoverEscape868 · 悬浮态残留巡检兜底', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('行为锚：卡内悬浮建立后，卡外 document mousemove 清除十字线（残留根治）', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      seedNodes(useLiveMonitorStore(pinia));
      await settle();
      const wrap = host.querySelector('.ld-svgwrap') as HTMLElement;
      expect(wrap, '走势卡在场').toBeTruthy();
      const r = { left: 0, top: 0, width: 100, height: 88, right: 100, bottom: 88, x: 0, y: 0, toJSON: () => ({}) };
      const spy = vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue(r as DOMRect);
      /* 卡内移动建立悬浮 */
      const mon = useLiveMonitorStore(pinia);
      wrap.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 40 }));
      await settle(3);
      expect(wrap.querySelector('.ld-xline'), '悬浮建立：十字线在场').toBeTruthy();
      /* 鼠标已到卡外（重渲竞态下卡内 mouseleave 丢失的场景模拟）：document 收到远处移动 */
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 900, clientY: 900 }));
      await settle(3);
      expect(wrap.querySelector('.ld-xline'), '卡外移动后十字线收起（残留根治）').toBeNull();
      void spy;
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('行为锚：坐标回到卡内时悬浮正常重建（巡检不误伤）', async () => {
      const { app, host, pinia } = await mountLive();
    try {
      seedNodes(useLiveMonitorStore(pinia));
      await settle();
      const wrap = host.querySelector('.ld-svgwrap') as HTMLElement;
      vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 100, height: 88, right: 100, bottom: 88, x: 0, y: 0, toJSON: () => ({}),
      } as DOMRect);
      wrap.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 40 }));
      await settle(3);
      expect(wrap.querySelector('.ld-xline')).toBeTruthy();
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 900, clientY: 900 }));
      await settle(3);
      expect(wrap.querySelector('.ld-xline')).toBeNull();
      /* 回到卡内：wrap 自身 mousemove 重建悬浮 */
      wrap.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 30, clientY: 40 }));
      await settle(3);
      expect(wrap.querySelector('.ld-xline'), '卡内重建悬浮').toBeTruthy();
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('接线锁：三链（六卡/对比卡/顶部图）统一接 useHoverEscape', () => {
    expect(cardSrc).toContain('useHoverEscape');
    expect(liveSrc).toContain('useHoverEscape');
    expect((liveSrc.match(/useHoverEscape\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

