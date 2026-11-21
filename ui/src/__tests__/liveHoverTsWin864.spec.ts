/**
 * 八百六十四批：节点对比卡悬浮读出时刻窗对齐（用户实报「悬浮点不跟鼠标点」）。
 *
 * 现象：十字线跟手（frac 映射正确），tooltip 头部时刻却停在窗前——onCmpMove 给
 * sparkHoverAt 传的 ts 是全量 sampleTs，而 data 是 winSlice 截尾窗（windowPts 偏好）；
 * 同一索引 i 在全量 ts 上取到的是窗起点之前的采样时刻，读出行值域（截尾 data）与
 * 头部时刻域（全量 ts）分裂。LiveChartCard 的同名链路早已用 tsWin（按 series.length
 * 右对齐切片）同域，本刀把 onCmpMove 对齐到同一语义。
 *
 * 锁定：
 * 1) 行为锚：等长超窗序列（6 点、窗 4）下悬浮读出头部时刻=窗内首点采样时刻
 *    （happy-dom 图区宽 0 → frac 钳 0 → i=0；病灶实现取全量 ts[0]=窗前点，红）；
 * 2) 源码锁：onCmpMove 的调用行禁把全量 sampleTs 直接当 ts 传（防回潮）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useLiveMonitorStore } from '../stores/liveMonitor';
import { fmtTime } from '../utils/format';

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

/* 两节点 × 等长 6 点序列（超窗=4）；ts 与序列同针推入（store 常态），窗切片=后 4 点 */
function seedOverWindow(mon: ReturnType<typeof useLiveMonitorStore>) {
  const n = 6;
  mon.windowPts = 4;
  mon.nodes = [
    { nodeId: 'n1', name: 'qa-es-1', roles: ['data'], heapPct: 30, cpuPct: 38, diskTotal: 100, diskFree: 41 },
    { nodeId: 'n2', name: 'qa-es-2', roles: ['data'], heapPct: 34, cpuPct: 52, diskTotal: 100, diskFree: 24 },
  ];
  mon.nodeSeries = {
    'qa-es-1': { heap: [10, 20, 30, 40, 50, 60], cpu: [10, 20, 30, 40, 50, 60], disk: [10, 20, 30, 40, 50, 60], qps: [1, 2, 3, 4, 5, 6], idx: [1, 2, 3, 4, 5, 6] },
    'qa-es-2': { heap: [11, 21, 31, 41, 51, 61], cpu: [11, 21, 31, 41, 51, 61], disk: [11, 21, 31, 41, 51, 61], qps: [2, 3, 4, 5, 6, 7], idx: [2, 3, 4, 5, 6, 7] },
  };
  mon.sampleTs = Array.from({ length: n }, (_, i) => 60_000 * (i + 1));
}

describe('liveHoverTsWin864 · 对比卡悬浮时刻与十字线同窗', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('行为锚：超窗序列下悬浮头部时刻=窗内首点（非全量 ts 的窗前点）', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      seedOverWindow(mon);
      await settle();
      (host.querySelector('.ld-ncmp-entry') as HTMLButtonElement)?.click();
      await settle();
      const cmp = host.querySelector('.ld-ncmp-panel');
      expect(cmp, '节点对比叠加卡在场').toBeTruthy();
      /* 877 同步更新：悬浮监听下沉绘图域 .ld-cmp-plot，派发目标随之 */
      (cmp!.querySelector('.ld-cmp-plot') as HTMLElement).dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0 }));
      await settle(4);
      const t = cmp!.querySelector('.ld-hv-t')?.textContent?.trim();
      expect(t, '读出头部时刻在场').toBeTruthy();
      /* frac=0 → i=0 → 时刻应=窗内首点 ts[2]（全量 6 点右对齐 4 点窗）；
        病灶实现取全量 ts[0]=窗前两点，落在本断言之外 */
      expect(t).toBe(fmtTime(mon.sampleTs[2]));
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('源码锁：onCmpMove 禁把全量 sampleTs 直接当 ts 传 sparkHoverAt', () => {
    expect(liveSrc).not.toContain('sparkHoverAt(base.data, sampleTs.value');
  });
});
