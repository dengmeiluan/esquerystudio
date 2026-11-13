/**
 * 六百八十四批·622 §8-P4 挂墙模式（独立稿 goal684-wall-mode.html 落码；用户令「全部干
 * 全部批准」=W1~W5 全按推荐值）。
 *
 * 形态学（W1：全屏态即挂墙，零新按钮）：
 * - 页头「进入全屏」钮（位置恒定）→ .ld-page 挂 ld-wall 类 + FocusableSurface fs-active；
 *   再点同钮/Esc 双通道退出（FocusableSurface 统一件）。
 *
 * 五件套（§2）：
 * - ①元信息带隐藏 / ②告警折叠（头行徽标摘要留）/ ③当前值升 --fs-num-l /
 *   ⑤时间锚升满轴（fs-xs+opacity 1+离轴）——全走 .ld-wall CSS 级联（零 DOM 增删，671-C2 同律）；
 * - ④轮询恒定 5s——进墙存档锁 5s+选择器禁用（title 提示），出墙还原进墙前档位
 *   （usePref 落盘值进出等值还原，零状态重置律）。
 *
 * 稿约红线：不动高度链（.ld-chart-full/--vh-offset=2.9.119 确定解，源码锁负锚）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useLiveMonitorStore } from '../stores/liveMonitor';

const viewSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf8');
const arfSrc = readFileSync(join(__dirname, '../components/AutoRefreshSelect.vue'), 'utf8');
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

const fsBtn = (host: HTMLElement) =>
  [...host.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '进入全屏' || b.getAttribute('aria-label') === '退出全屏') as HTMLButtonElement;

describe('六百八十四批：挂墙模式（全屏态五件套）', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('W1 进墙=fs-active 挂墙域（页头全屏钮零新按钮）；Esc 双通道退出还原', async () => {
    const { app, host } = await mountLive();
    try {
      const fs = host.querySelector('.fs') as HTMLElement;
      expect(fs.className, '常态无墙态').not.toContain('fs-active');
      fsBtn(host).click();
      await settle();
      expect(fs.className, '进墙=FocusableSurface fs-active（墙作用域，ld-wall 私类方案实测失配废弃）').toContain('fs-active');
      /* Esc 双通道：FocusableSurface 监听在 document 捕获级——window 派发传播路径不达
         document（667-C3 合成键盘事件谱系），须 document 派发（App onKey 未挂载无炸面） */
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await settle();
      expect(fs.className, 'Esc 退出摘墙态').not.toContain('fs-active');
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('④轮询锁：进墙存档锁 5s+选择器禁用；同钮退出还原进墙前档位（零状态重置）', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      mon.intervalMs = 2000;
      await settle();
      const sel = host.querySelector('.arf-sel') as HTMLSelectElement;
      expect(sel.disabled, '常态选择器可用').toBe(false);
      fsBtn(host).click();
      await settle();
      expect(mon.intervalMs, '进墙恒定 5s').toBe(5000);
      expect(sel.value).toBe('5000');
      expect(sel.disabled, '墙内选择器禁用（位置恒定禁用不禁藏）').toBe(true);
      expect(sel.title, '禁用态有挂墙语义提示').toContain('挂墙');
      fsBtn(host).click();
      await settle();
      expect(mon.intervalMs, '出墙还原进墙前档位').toBe(2000);
      expect(sel.value).toBe('2000');
      expect(sel.disabled, '出墙解禁').toBe(false);
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('④等值还原：5s 档进墙→出墙仍 5s（进出等值零多余写）', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      mon.intervalMs = 5000;
      await settle();
      fsBtn(host).click();
      await settle();
      expect(mon.intervalMs).toBe(5000);
      expect((host.querySelector('.fs') as HTMLElement).className).toContain('fs-active');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await settle();
      expect((host.querySelector('.fs') as HTMLElement).className, '出墙实锚（防空转假绿）').not.toContain('fs-active');
      expect(mon.intervalMs, '等值进出墙不漂档').toBe(5000);
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('源码锁：五件套 CSS 级联（fs-active 墙域）+锁档脚本+控件禁用接线；高度链零触碰负锚', () => {
    const t = strip(viewSrc);
    /* ①②③⑤ 四件 CSS 级联（fs-active 墙域=FocusableSurface 全屏类；.ld-* 元素类+data-v 双限定只及本页） */
    expect(t).toMatch(/\.fs-active \.ld-strip\s*\{\s*display:\s*none/);
    expect(t).toMatch(/\.fs-active \.ld-alert\s*\{\s*display:\s*none/);
    expect(t).toMatch(/\.fs-active :deep\(\.ld-chart-cur\)\s*\{\s*font-size:\s*var\(--fs-num-l\)/);
    expect(t).toMatch(/\.fs-active :deep\(\.ld-ta\)\s*\{/);
    /* ld-wall 私类方案负锚（实测失配废弃：strip/alerts/charts 是 fs-body 下兄弟节点不在 .ld-page 内） */
    expect(t).not.toContain("'ld-wall'");
    /* ④ 锁档脚本：进墙存档锁 5s / 出墙还原 */
    expect(t).toMatch(/watch\(fullscreen/);
    expect(t).toMatch(/wallPrevMs/);
    expect(t).toMatch(/intervalMs\.value !== 5000/);
    /* ④ 控件禁用接线（禁用不禁藏） */
    expect(t).toContain(':disabled="fullscreen"');
    expect(t).toContain('挂墙');
    /* AutoRefreshSelect 透传 disabled（纯增量 prop） */
    expect(strip(arfSrc)).toContain(':disabled="disabled"');
    /* 稿约红线：高度链零触碰——不新增/不改 .ld-chart-full 与 --vh-offset 规则（存量规则在 LiveChartCard 域） */
    expect(t).not.toContain('--vh-offset');
    expect(t).not.toMatch(/\.fs-active[^{]*ld-chart-full/);
  });
});
