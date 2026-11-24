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

/* select 升档 NSelect（时间范围）：option 走虚拟列表在 happy-dom 不渲染，档位切换用
 键盘路径驱动（click 开菜单 → 方向键 → Enter，snapSortMemory 同款形态）。
 档序 mh2RangeOpts：[1h, 6h, 24h, 3d, 7d, 14d, custom]——24h↔custom 相距 4 档 */
const rangeTrigger = (host: HTMLElement) =>
  host.querySelector('.n-select[aria-label="时间范围"] .n-base-selection') as HTMLElement;
async function nudgeRange(host: HTMLElement, key: 'ArrowUp' | 'ArrowDown', times: number) {
  const t = rangeTrigger(host);
  t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await settle();
  for (let i = 0; i < times; i++) {
    t.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await settle();
  }
  t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await settle();
}

describe('六百零六批：G5 自定义时间档', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    metricsCalls.length = 0;
  });

  it('选「自定义」档：起止 NDatePicker 输入在场；非 custom 档隐藏', async () => {
    const { app, host } = await mountLive();
    try {
      expect(liveSrc, 'custom 档在场（options 字面）').toContain("{ label: '自定义', value: 'custom' }");
      /* 当前档 24h → ArrowDown×4 落 custom 档（datetime-local 升档 NDatePicker：aria-label 落组件壳 div） */
      await nudgeRange(host, 'ArrowDown', 4);
      expect(host.querySelector('.ld-hist .n-date-picker[aria-label="自定义开始时间"]'), '起输入在场').toBeTruthy();
      expect(host.querySelector('.ld-hist .n-date-picker[aria-label="自定义结束时间"]'), '止输入在场').toBeTruthy();
      /* custom 档 → ArrowUp×4 回 24h 档 */
      await nudgeRange(host, 'ArrowUp', 4);
      expect(host.querySelector('.ld-hist .n-date-picker'), '非 custom 档隐藏').toBeNull();
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('custom 档取数：fromMs/toMs=起止解析毫秒（下推 monitor-metrics）', async () => {
    const { app, host } = await mountLive();
    try {
      await nudgeRange(host, 'ArrowDown', 4);
      const from = host.querySelector('.n-date-picker[aria-label="自定义开始时间"] input') as HTMLInputElement;
      const to = host.querySelector('.n-date-picker[aria-label="自定义结束时间"] input') as HTMLInputElement;
      /* NDatePicker 手输路径：input 事件即解析确认（格式 yyyy-MM-dd HH:mm:ss，本地时区=原 datetime-local 同口径） */
      setNative(from, '2026-09-23 10:00:00');
      setNative(to, '2026-09-23 12:00:00');
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

  it('custom 起止非法/空缺省：回落「止=now」不炸（from 未选→null 守卫回落固定窗）', async () => {
    const { app, host } = await mountLive();
    try {
      await nudgeRange(host, 'ArrowDown', 4);
      const to = host.querySelector('.n-date-picker[aria-label="自定义结束时间"] input') as HTMLInputElement;
      setNative(to, '2026-09-23 12:00:00');
      await settle(20);
      /* from 未选（null）→ rangeMs 回落固定窗（fromMs=now-24h 量级），取数不炸 */
      const last = metricsCalls[metricsCalls.length - 1];
      expect(last && typeof last.fromMs).toBe('number');
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('源码锁：custom 档+rangeMs 单源+NDatePicker 接线', () => {
    const t = strip(liveSrc);
    expect(t, 'custom 档选项（NSelect options 形态）').toContain("value: 'custom'");
    expect(t, 'rangeMs 单源（三消费点同窗）').toContain('const rangeMs = computed');
    expect(t, '起止输入接线（datetime-local 升档 NDatePicker）').toContain('type="datetime"');
    expect(t, '旧 datetime-local 原生控件不回潮').not.toContain('datetime-local');
  });
});
