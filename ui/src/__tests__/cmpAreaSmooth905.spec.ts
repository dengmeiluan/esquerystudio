/**
 * 九百零五批·用户实报「节点对比曲线还是跟其他曲线不一样，不丝滑」：
 * 对比卡联动面积是逐点直连的 polygon（面积上边缘=折线段），而曲线本体已是
 * Catmull-Rom 平滑 path——悬浮节点时面积边与曲线不贴合、波动处穿出缩进，视觉割裂。
 * 本批把面积收敛到全站单源 catmullRomAreaPath（六卡 ld-area/历史卡 hc-area 同款）：
 * 面积上边缘=同一条平滑曲线，视觉贴合。
 *
 * 锁面三锚：①源码锁=catmullRomAreaPath 在场+polygon 面积形态退役；
 * ②形态锁=热点联动下 .ld-ncmp-area 为 path 且 d 含贝塞尔段；
 * ③贴合锁=面积 path 的 d 以热点折线 path 的 d 为前缀（catmullRomAreaPath=曲线+底边闭合）。
 *
 * 锁面顾虑解除注记：面积 polygon 曾为绕折线 path 计数锁的形态；面积自联动化起
 * 仅悬浮热点时条件渲染，折线计数断言场景不触发热点，path 化不进计数。
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

describe('九百零五批：对比卡联动面积平滑化（面积与曲线单源贴合）', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('源码锁：catmullRomAreaPath 在场消费+polygon 面积形态退役', () => {
    const s = strip(liveSrc);
    expect(s, '面积平滑单源 import 在场').toContain('catmullRomAreaPath');
    expect(s, 'polygon 面积形态退役（:points=cmpArea.points 不复在）').not.toContain(':points="cmpArea.points"');
  });

  it('形态+贴合锁：热点联动下面积为 path、d 含贝塞尔段、且以热点折线 d 为前缀', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      seedNodes(useLiveMonitorStore(pinia));
      await settle();
      (host.querySelector('.ld-ncmp-entry') as HTMLButtonElement)?.click();
      await settle();
      const cmp = host.querySelector('.ld-ncmp-panel')!;
      expect(cmp, '节点对比叠加卡在场').toBeTruthy();
      /* 热点前：面积不在场（hover 联动条件渲染，折线计数场景形态不变） */
      expect(cmp.querySelector('.ld-ncmp-area'), '无热点不画面积').toBeNull();
      /* 悬浮出读出行 → 行 mouseenter 触发热点联动 */
      (cmp.querySelector('.ld-cmp-plot') as HTMLElement).dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 60 }));
      await settle(4);
      const row = [...cmp.querySelectorAll('.ld-ncmp-tip-r')].find(r => r.textContent!.includes('qa-es-1')) as HTMLElement;
      expect(row, '读出行在场').toBeTruthy();
      row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await settle();
      const area = cmp.querySelector('.ld-ncmp-area') as SVGPathElement;
      expect(area, '热点联动面积在场').toBeTruthy();
      expect(area.tagName.toLowerCase(), '面积形态=path（polygon 退役）').toBe('path');
      const d = area.getAttribute('d') ?? '';
      /* 896 批同步更新：heap 档=阶梯形态（GC 锯齿 gauge 指标的专业形态，L 折线无贝塞尔），
       其余档=贝塞尔平滑（含 ' C '）；两档共同不变量=面积与热点折线同形贴合+底边闭合 */
      const hotLine = cmp.querySelector('path.is-hot') as SVGPathElement;
      expect(hotLine, '热点折线在场').toBeTruthy();
      const lineD = hotLine.getAttribute('d') ?? '';
      if (d.includes(' C ')) {
        expect(lineD, '平滑档：折线同为贝塞尔形态').toContain(' C ');
      } else {
        expect(lineD, '阶梯档：折线同为阶梯形态').not.toContain(' C ');
      }
      expect(d.startsWith(lineD), '面积上边缘与热点折线完全贴合（d 前缀=曲线 d，底边闭合其后）').toBe(true);
      expect(area.getAttribute('fill'), '身份色渐变保真').toBe('url(#cmpAreaGrad)');
    } finally {
      app.unmount();
      host.remove();
    }
  });
});
