/**
 * 六百一十五批·R73 节点对比卡交互修复（用户实报随报随修）：
 * ①「悬浮直接平铺不对」——9 节点值横向挤一行爆行：对比卡读出层改纵排堆叠
 *   （时刻在上、节点值行纵排，ld-hv-stack）；
 * ②「无法筛选节点」——节点序列显隐切换（Grafana 图例语汇）。
 *
 * ⚠七百八十一批 K2 锁同步更新：常驻图例 chip 退役（用户实报「节点对比应该是悬浮数据」=
 * 图例行与悬浮读出双份重复）——隐藏交互迁「读出行尾 × 钮」+头部「已隐藏 N ▸ 恢复」
 * 一键复原（顺治 615 批图例隐藏后图例项随 cmpSeries 滤除=无法再显示的单向死路）。
 * 件②断言同步更新至新交互；件①（纵排堆叠）与源码锁（toggleNode/hiddenNodes）不动。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useLiveMonitorStore } from '../stores/liveMonitor';

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

function seedNine(mon: ReturnType<typeof useLiveMonitorStore>) {
  const names = ['n-1', 'n-2', 'n-3', 'n-4', 'n-5', 'n-6', 'n-7', 'n-8', 'n-9'];
  mon.nodes = names.map((n, i) => ({ nodeId: 'id' + i, name: n, roles: ['data'], heapPct: 30 + i, cpuPct: 20 + i, diskTotal: 100, diskFree: 50 }));
  mon.nodeSeries = Object.fromEntries(names.map(n => [n, { heap: [30, 31, 32], cpu: [20, 21, 22], disk: [50, 51, 52], qps: [1, 2, 3], idx: [4, 5, 6] }]));
  mon.sampleTs = [1000, 2000, 3000];
}

describe('六百一十五批：节点对比卡交互修复', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  function seed9(host: HTMLElement, pinia: any) {
    seedNine(useLiveMonitorStore(pinia));
  }

  it('件①：读出层纵排堆叠（ld-hv-stack）——9 节点行纵排不横挤', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      seed9(host, pinia);
      await settle();
      /* 794 件1 同步更新：对比面悬浮面板化（默认关）——断言前点入口钮开面板 */
      (host.querySelector('.ld-ncmp-entry') as HTMLButtonElement)?.click();
      await settle();
      const cmp = host.querySelector('.ld-ncmp-panel')!;
      /* 877 同步更新：悬浮监听下沉绘图域 .ld-cmp-plot，派发目标随之 */
      (cmp.querySelector('.ld-cmp-plot') as HTMLElement).dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0 }));
      await settle(4);
      const hv = cmp.querySelector('.ld-hv')!;
      expect(hv.className).toContain('ld-hv-stack');
      expect(hv.querySelectorAll('.ld-ncmp-tip-r').length, '9 行纵排').toBe(9);
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('件②（781 同步更新）：读出行尾 × 隐藏节点——折线与悬浮行同步过滤，头部恢复钮一键复原', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      seed9(host, pinia);
      await settle();
      /* 794 件1 同步更新：对比面悬浮面板化（默认关）——断言前点入口钮开面板 */
      (host.querySelector('.ld-ncmp-entry') as HTMLButtonElement)?.click();
      await settle();
      const cmp = host.querySelector('.ld-ncmp-panel')!;
      expect(cmp.querySelectorAll('path').length, '9 条折线（八百二十八批 polyline→path 平滑同步更新）').toBe(9);
      expect(cmp.querySelectorAll('.ld-ncmp-panel .ld-ncmp-leg-b').length, '常驻图例退役').toBe(0);
      /* 悬浮出读出层：行尾 × 隐藏钮（CMP_TIP_CAP=8 截断 → 8 钮+聚合行） */
      /* 877 同步更新：悬浮监听下沉绘图域 .ld-cmp-plot，派发目标随之 */
      (cmp.querySelector('.ld-cmp-plot') as HTMLElement).dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0 }));
      await settle(4);
      const hv = cmp.querySelector('.ld-hv')!;
      const row1 = [...hv.querySelectorAll('.ld-ncmp-tip-r')].find(r => r.textContent!.includes('n-1')) as HTMLElement;
      (row1.querySelector('button.ld-ncmp-hide') as HTMLElement).click();
      await settle();
      expect(cmp.querySelectorAll('path').length, '隐藏后 8 条').toBe(8);
      /* 悬浮行同步过滤 */
      /* 877 同步更新：悬浮监听下沉绘图域 .ld-cmp-plot，派发目标随之 */
      (cmp.querySelector('.ld-cmp-plot') as HTMLElement).dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0 }));
      await settle(4);
      const hv2 = cmp.querySelector('.ld-hv')!;
      expect(hv2.textContent).not.toContain('n-1');
      /* 头部恢复钮一键复原（治 615 批隐藏后无法再显示的单向死路） */
      const restore = cmp.querySelector('button.ld-ncmp-restore') as HTMLElement;
      expect(restore).toBeTruthy();
      expect(restore.textContent!).toContain('已隐藏 1');
      restore.click();
      await settle();
      expect(cmp.querySelectorAll('path').length, '恢复 9 条').toBe(9);
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('源码锁：ld-hv-stack 纵排+行尾隐藏 toggle+hiddenNodes 状态', () => {
    const t = strip(liveSrc);
    expect(t, '读出层纵排').toContain('ld-hv-stack');
    expect(t, '行尾隐藏切换（781 同步更新）').toContain('toggleNode');
    expect(t, '隐藏节点状态').toContain('hiddenNodes');
  });
});
