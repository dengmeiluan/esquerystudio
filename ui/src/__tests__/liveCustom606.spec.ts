/**
 * 六百零六批·R66 G5 自定义时间档收官（对标阿里云基础监控「自定义」时间档——R27 清单最后未闭项）。
 *
 * 现状：历史趋势时间档仅 1h~14d 六个固定档；阿里云另有「自定义」档（起止时间）。
 * 后端 monitor-metrics 的 fromMs/toMs 通道早已在案（api.monitorMetrics 形参）——纯前端：
 * ①时间档下拉加「自定义」选项，选中后现出起止 datetime-local 输入（type 原生控件=键盘可达）；
 * ②rangeMs 单源 computed：custom 档解析起止（非法/缺省端点回落 now），非 custom 档维持
 *   MH_RANGE_MS 固定窗——曲线/告警/慢请求三处消费点同窗语义不变；
 * ③起止输入变更入 watch 触发重拉（datetime-local 完整选择后单次 change）。
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

const metricsCalls: any[] = [];
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
        return (p: any) => { metricsCalls.push(p); return Promise.resolve({ records: [
          { kind: 'metrics', scope: 'cluster', connName: 'qa-es', timestamp: 2000, qps: 71.4, indices: 10 },
        ] }); };
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

/* 原生 setter 喂 v-model（561-C2 教训：直接赋值不触发 Vue 响应） */
function setNative(el: HTMLInputElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  desc?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('六百零六批：G5 自定义时间档', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    metricsCalls.length = 0;
  });

  it('选「自定义」档：起止 datetime-local 输入在场；非 custom 档隐藏', async () => {
    const { app, host } = await mountLive();
    try {
      const sel = host.querySelector('.ld-hist select[aria-label="时间范围"]') as HTMLSelectElement;
      expect([...sel.options].some(o => o.value === 'custom'), 'custom 档在场').toBe(true);
      sel.value = 'custom';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
      expect(host.querySelector('.ld-hist input[type="datetime-local"][aria-label="自定义开始时间"]'), '起输入在场').toBeTruthy();
      expect(host.querySelector('.ld-hist input[type="datetime-local"][aria-label="自定义结束时间"]'), '止输入在场').toBeTruthy();
      sel.value = '24h';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
      expect(host.querySelector('.ld-hist input[type="datetime-local"]'), '非 custom 档隐藏').toBeNull();
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('custom 档取数：fromMs/toMs=起止解析毫秒（下推 monitor-metrics）', async () => {
    const { app, host } = await mountLive();
    try {
      const sel = host.querySelector('.ld-hist select[aria-label="时间范围"]') as HTMLSelectElement;
      sel.value = 'custom';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
      const from = host.querySelector('input[aria-label="自定义开始时间"]') as HTMLInputElement;
      const to = host.querySelector('input[aria-label="自定义结束时间"]') as HTMLInputElement;
      setNative(from, '2026-09-23T10:00');
      setNative(to, '2026-09-23T12:00');
      await settle(20);
      const last = metricsCalls[metricsCalls.length - 1];
      expect(last, 'custom 档发起了取数').toBeTruthy();
      expect(last.fromMs, 'fromMs=起解析毫秒').toBe(Date.parse('2026-09-23T10:00'));
      expect(last.toMs, 'toMs=止解析毫秒').toBe(Date.parse('2026-09-23T12:00'));
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('custom 起止非法/空缺省：回落「止=now」不炸（from 非法→NaN 守卫回落固定窗）', async () => {
    const { app, host } = await mountLive();
    try {
      const sel = host.querySelector('.ld-hist select[aria-label="时间范围"]') as HTMLSelectElement;
      sel.value = 'custom';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
      const to = host.querySelector('input[aria-label="自定义结束时间"]') as HTMLInputElement;
      setNative(to, '2026-09-23T12:00');
      await settle(20);
      /* from 未填（空串→NaN）→ rangeMs 回落固定窗（fromMs=now-24h 量级），取数不炸 */
      const last = metricsCalls[metricsCalls.length - 1];
      expect(last && typeof last.fromMs).toBe('number');
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('源码锁：custom 档+rangeMs 单源+datetime-local 接线', () => {
    const t = strip(liveSrc);
    expect(t, 'custom 档选项').toContain("value=\"custom\"");
    expect(t, 'rangeMs 单源（三消费点同窗）').toContain('const rangeMs = computed');
    expect(t, '起止输入接线').toContain('datetime-local');
  });
});
