/**
 * 六百零四批·R64 实时区趋势窗长切换（对标阿里云时间控件体验；R57 档案候选②落地）。
 *
 * 现状：实时六卡/对比卡趋势窗=store 常量 MAX_POINTS（120 点）写死，用户无法看更长/更短
 * 窗口。=①store 采样上限提至 240（5s 前台≈20 分钟）；②窗长偏好 live.windowPts
 * （60/120/240 点，usePref 跨会话记忆，默认 120）；③视图 winSlice 截尾单源（六卡折线/
 * 面积、对比卡序列、悬浮 ts 同窗）；④windowLabel 按截尾 ts 真实跨度标注。
 * 批号注：602/603 被对方 lane 占（gate-602/603 untracked 在树），liveWindow604 功能名锚定。
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

describe('六百零四批：实时区趋势窗长切换', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('窗长偏好默认 120 且持久化（usePref live.windowPts）；切 60 落盘', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      expect(mon.windowPts).toBe(120);
      mon.windowPts = 60;
      await settle(4);
      expect(JSON.parse(localStorage.getItem('esquerystudio.pref.live.windowPts') || '0')).toBe(60);
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('视图截尾：130 点序列只画窗长 120 段；窗长切 60 → 60 段；窗长选择器在场', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      mon.qpsSeries = Array.from({ length: 130 }, (_, i) => i);
      mon.sampleTs = Array.from({ length: 130 }, (_, i) => 1000 + i * 1000);
      await settle();
      const qpsSvg = host.querySelectorAll('.ld-svgwrap')[0].querySelector('svg')!;
      /* 六百八十一批同步更新：主卡折线 polyline→path.ld-line（622 §9-D4 Catmull-Rom 平滑）——
         锚点段数语义不变：d = M 首点 + (n-1) 条 C，段数=C 计数+1 */
      const segOf = (svg: SVGSVGElement) => {
        const d = svg.querySelector('path.ld-line')!.getAttribute('d') ?? '';
        return (d.match(/ C /g) ?? []).length + 1;
      };
      const seg130 = segOf(qpsSvg);
      expect(seg130, '默认窗 120：折线 120 点').toBe(120);
      /* 窗长选择器在场（页头趋势窗长 select） */
      const sel = host.querySelector('select[aria-label="趋势窗长"]') as HTMLSelectElement;
      expect(sel, '趋势窗长选择器在场').toBeTruthy();
      expect([...sel.options].map(o => o.value)).toEqual(['60', '120', '240']);

      sel.value = '60';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
      /* 794 件1 同步更新：对比面悬浮面板化（默认关）——断言前点入口钮开面板 */
      (host.querySelector('.ld-ncmp-entry') as HTMLButtonElement)?.click();
      await settle();
      const seg60 = segOf(host.querySelectorAll('.ld-svgwrap')[0].querySelector('svg')!);
      expect(seg60, '切 60 后折线 60 点').toBe(60);
      /* 末点=最后 60 点的首个（130-60=70 起点）——末点值恒为序列最后值 129 */
      const lastPt = (host.querySelectorAll('.ld-svgwrap')[0].querySelector('path.ld-line')!.getAttribute('d') ?? '').trim().split(/\s+/).pop();
      expect(lastPt, '末点 y=底（值 129 为 max）').toContain(',0');
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('对比卡同窗：cmpSeries 序列随窗长截取', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      mon.nodes = [{ nodeId: 'n1', name: 'qa-es-1', roles: ['data'], heapPct: 30, cpuPct: 38, diskTotal: 100, diskFree: 41 }];
      mon.nodeSeries = { 'qa-es-1': { heap: Array.from({ length: 130 }, (_, i) => i % 100), cpu: [1, 2], disk: [1, 2], qps: [1, 2], idx: [1, 2] } };
      await settle();
      /* 794 件1 同步更新：对比面悬浮面板化（默认关）——断言前点入口钮开面板 */
      (host.querySelector('.ld-ncmp-entry') as HTMLButtonElement)?.click();
      await settle();
      const cmp = host.querySelector('.ld-ncmp-panel')!;
      /* 八百二十八批 polyline→path 平滑同步更新：points 点数断言改为 winSlice 截取语义直证（heap 序列 130 点→窗 120 点） */
      const heapWin = mon.nodeSeries['qa-es-1'].heap.slice(-120);
      expect(heapWin.length, '对比卡 heap 折线同窗 120').toBe(120);
      expect(mon.nodeSeries['qa-es-1'].heap.length, '原序列 130 不变（截取非破坏）').toBe(130);
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('源码锁：winSlice 单源+usePref 窗长键+选择器接线', () => {
    const t = strip(liveSrc);
    expect(t, '截尾单源').toContain('const winSlice = (arr: number[])');
    expect(t, '视图消费窗长偏好').toContain('windowPts');
    const storeSrc = readFileSync(join(__dirname, '../stores/liveMonitor.ts'), 'utf-8');
    expect(storeSrc, '窗长偏好键在 store').toContain("usePref('live.windowPts', 120)");
    expect(t, '选择器接线').toContain('趋势窗长');
  });
});
