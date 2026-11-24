/**
 * 六百一十一批·R71 实时六卡单卡放大全屏（R70 探索轮二号候选落地；对标阿里云每卡
 * expand-arrows-alt 放大图标）。
 *
 * 交互（铁律 D1 放大还原双态同钮+铁律 B 键盘可达）：
 * - 每卡卡头放大钮（Maximize2↔Minimize2 双态同钮，aria-label 展开/还原）
 * - 点击→该卡切 ld-chart-full 态（position:fixed 覆盖视口 92%，背景遮罩；
 *   SVG viewBox 自适应天然放大=零内容重复渲染的最优解）
 * - Esc（window 捕获级，放大态挂载/还原摘卸）与还原钮双通道退出
 * - 打开时存触发钮焦点，关闭还焦（FocusableSurface 约定同语言）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useLiveMonitorStore } from '../stores/liveMonitor';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
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

describe('六百一十一批：实时六卡单卡放大全屏', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('放大钮五卡在场（双态同钮 aria-label）；点击 QPS 卡→ld-chart-full 态+遮罩；Esc→还原', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      mon.qpsSeries = [3, 7, 5];
      await settle();
      const btns = [...host.querySelectorAll('.ld-chart .ld-expand')];
      expect(btns.length, '五张折线卡放大钮在场').toBe(5);
      const qpsChart = host.querySelectorAll('.ld-chart')[0];
      const qpsBtn = qpsChart.querySelector('.ld-expand') as HTMLButtonElement;
      expect(qpsBtn.getAttribute('aria-label'), '初始=展开语义').toBe('展开');
      qpsBtn.click();
      await settle();
      expect(qpsChart.className).toContain('ld-chart-full');
      expect(qpsBtn.getAttribute('aria-label'), '放大态=还原语义').toBe('还原');
      expect(document.body.className).toContain('ld-chart-mask');
      /* Esc 退出（window 捕获级） */
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await settle();
      expect(qpsChart.className).not.toContain('ld-chart-full');
      expect(document.body.className).not.toContain('ld-chart-mask');
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('还原钮双通道：放大态再点同钮→还原（铁律 D1 双态同钮）', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      mon.qpsSeries = [3, 7, 5];
      await settle();
      const qpsChart = host.querySelectorAll('.ld-chart')[0];
      const btn = qpsChart.querySelector('.ld-expand') as HTMLButtonElement;
      btn.click();
      await settle();
      expect(qpsChart.className).toContain('ld-chart-full');
      btn.click();
      await settle();
      expect(qpsChart.className).not.toContain('ld-chart-full');
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('源码锁：ld-expand 钮+ld-chart-full 态+Esc window 捕获级+遮罩类', () => {
    const t = strip(liveSrc);
    const c = strip(cardSrc);
    expect(c, '放大钮类（合并进组件）').toContain('ld-expand');
    expect(c, '全屏态类（合并进组件）').toContain('ld-chart-full');
    expect(t, '遮罩类（留视图 body 级）').toContain('ld-chart-mask');
    expect(t, 'Esc window 捕获级（留视图；566/568 约定形态）').toMatch(/addEventListener\('keydown', \w+, true\)|addEventListener\("keydown", \w+, true\)/);
    expect(t, '五线卡展开接线（留视图）').toMatch(/@expand="toggleExpand\('/);
  });
});
