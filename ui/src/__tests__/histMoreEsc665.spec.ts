/**
 * 六百六十五批·G'5 ⋯浮层 Esc 收口补齐（⑥664 头号候选落地；轨6 监控实报随修，台账 R82）。
 *
 * 缺口（664 复检源码实锚）：`.ld-hist-more`（details 原生披露组件）无 Esc 收口——
 * LiveDashboardView 的 Escape 监听仅 onExpandEsc（放大态 :745-755），details 浮层开合
 * 只有点击 summary 一条路，铁律 D1#5「开弹层→Esc→焦点回触发器」张力（664-C2：646
 * 探针 s2c 是 log 读数不进 VERDICT，缺口以「已验证」假象流传）。
 *
 * 修复（566 约定范式落 .ld-hist-more 专属）：开层（toggle open）挂 window 捕获级
 * keydown（onHistMoreEsc），Esc 关层+焦点回 summary；关层摘卸+处理体内防御性摘卸
 * （双保险：程序化 open 变更的 toggle 事件在个别环境不派发时仍不泄漏）；卸载摘卸
 * （onBeforeUnmount 对称）。628 注释「details 无需 document 捕获级 Esc 接线」就此
 * 证伪勘误。浮层内无文本输入（3 select+1 checkbox），566 两段的「清词段」不适用=
 * 单段关层；select 原生下拉展开态 Esc 由浏览器 UI 消费（keydown 不达页面）零误关。
 *
 * details 原生开合（summary click→open+toggle）属浏览器本体行为，真机 probe-665
 * 承担；本 spec 以原生 click/toggle 事件驱动状态机，锁三件：行为（Esc 关层+还焦）/
 * 摘卸对称（关层+卸载）/ 源码锚（566 范式件套）。
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

describe('六百六十五批：⋯浮层（.ld-hist-more）Esc 收口', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('开层→Esc→关层+焦点回触发钮（铁律 D1#5；关层后二次 Esc 零动作）', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      mon.qpsSeries = [3, 7, 5];
      await settle();
      const details = host.querySelector('.ld-hist-more') as HTMLDetailsElement;
      const sum = details.querySelector('.ld-hist-more-sum') as HTMLElement;
      expect(details, '⋯ details 在场').toBeTruthy();
      sum.click();
      await settle();
      expect(details.open, 'summary 点击开层（happy-dom 原生 details）').toBe(true);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await settle();
      expect(details.open, 'Esc 关层（G\'5 缺口本体）').toBe(false);
      expect(document.activeElement, '焦点回触发钮（铁律 D1#5）').toBe(sum);
      /* 关层摘卸：二次 Esc 零动作（不复活/不报错） */
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await settle();
      expect(details.open, '二次 Esc 零动作').toBe(false);
      expect(document.activeElement, '二次 Esc 不改焦点').toBe(sum);
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('摘卸对称：关层摘卸（spy）+卸载摘卸（onBeforeUnmount）', async () => {
    const rs = vi.spyOn(window, 'removeEventListener');
    const { app, host, pinia } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      mon.qpsSeries = [3, 7, 5];
      await settle();
      const details = host.querySelector('.ld-hist-more') as HTMLDetailsElement;
      const sum = details.querySelector('.ld-hist-more-sum') as HTMLElement;
      sum.click();
      await settle();
      expect(details.open, '前置：开层').toBe(true);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await settle();
      expect(details.open, '前置：Esc 关层').toBe(false);
      const n0 = rs.mock.calls.filter(c => c[0] === 'keydown' && c[2] === true).length;
      expect(n0, '关层摘卸已发生（toggle 或处理体双保险其一）').toBeGreaterThan(0);
      app.unmount();
      const n1 = rs.mock.calls.filter(c => c[0] === 'keydown' && c[2] === true).length;
      expect(n1, '卸载摘卸 onBeforeUnmount 对称').toBeGreaterThan(n0);
    } finally {
      host.remove();
    }
  });

  it('源码锁：566 范式件套（ref+toggle 接线/window 捕获级挂摘/focus 还焦）', () => {
    const t = strip(liveSrc);
    expect(t, 'details 接线（ref+@toggle，class 原位保 628/637 锁）')
      .toContain('<details ref="histMoreEl" class="ld-hist-more" @toggle="onHistMoreToggle">');
    expect(t, 'summary 焦点锚').toContain('ref="histMoreSumEl"');
    expect(t, 'window 捕获级挂载（566 约定形态）')
      .toContain("window.addEventListener('keydown', onHistMoreEsc, true)");
    expect(t, 'window 捕获级摘卸')
      .toContain("window.removeEventListener('keydown', onHistMoreEsc, true)");
    expect(t, '焦点回触发钮').toContain('histMoreSumEl.value?.focus()');
    expect(t, '关层态守卫（仅开层动作）').toMatch(/if \(e\.key !== 'Escape' \|\| !histMoreEl\.value\?\.open\) return;/);
  });
});
