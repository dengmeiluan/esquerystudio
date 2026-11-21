/**
 * 托管重建监控：事件时间线跨天分组（2026-11-22 能力栈批）。
 *
 *  · 事件按天分段，段头 dayLabel 单源（今天/昨天/MM-DD，utils/format）；
 *  · 分组派生自筛选后序列——切筛选芯片后剩余事件跨天时分组仍正确（共存）；
 *  · ar-ev-N 全局索引保持（template v-for 外壳化零锁迁，.ar-ev 类锚不动）。
 * 计时相关：vi.useFakeTimers({toFake:['Date']}) 钉住系统时间（dayLabel 无 now 参
 * 时走 Date.now()），事件 ts 用「今天 0 点」相对构造规避时区漂移。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const statusFn = vi.fn();
const jobsFn = vi.fn();
const eventsFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      adhoc: {
        ...actual.api.adhoc,
        status: (...a: any[]) => statusFn(...a),
        jobs: (...a: any[]) => jobsFn(...a),
        events: (...a: any[]) => eventsFn(...a),
      },
    },
  };
});
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { void props; void emit; return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

import AdhocRebuildView from '../views/AdhocRebuildView.vue';
import { dayLabel } from '../utils/format';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const NOW = new Date(2026, 10, 22, 10, 0, 0).getTime(); /* 2026-11-22 10:00 本地时 */
const START_OF_TODAY = new Date(2026, 10, 22).getTime();
const TS_TODAY = START_OF_TODAY + 3600_000;        /* 今天 01:00 */
const TS_YESTERDAY = START_OF_TODAY - 2 * 3600_000; /* 昨天 22:00 */
const TS_DAY_BEFORE = START_OF_TODAY - 26 * 3600_000; /* 前天 22:00 → MM-DD 档 */

const doneJob = {
  jobId: 'tdg-1', logicalName: 'bond_index', aliasMode: true, strategy: 'INCREMENTAL',
  timeField: 'ts', status: 'SUCCEEDED', stage: 'DONE', startedAt: TS_DAY_BEFORE,
  finishedAt: TS_TODAY, sourcePhysical: 'bond_v1', destPhysical: 'bond_v2', error: null,
  currentTaskId: null,
};

const EVENTS = [
  { ts: TS_DAY_BEFORE, stage: 'AWAIT_CONFIRM', status: 'GATE_OPEN', detail: '前天开门' },
  { ts: TS_YESTERDAY, stage: 'FULL_REINDEX', status: null, detail: '昨天过程' },
  { ts: TS_TODAY, stage: 'SWITCHED', status: 'GATE_CONFIRMED', detail: '今天放行' },
  { ts: TS_TODAY + 60_000, stage: 'DONE', status: 'SUCCEEDED', detail: '今天完成' },
];

async function mountAR() {
  jobsFn.mockResolvedValue([doneJob]);
  statusFn.mockResolvedValue(doneJob);
  eventsFn.mockResolvedValue({ events: EVENTS });
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/search', component: { template: '<div/>' } },
      { path: '/indices', component: { template: '<div/>' } },
      { path: '/tasks', component: { template: '<div/>' } },
      { path: '/aliases', component: { template: '<div/>' } },
      { path: '/health-report', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(AdhocRebuildView as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  await settle(20);
  /* 进监控步（事件时间线在监控卡内） */
  const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
  const row = rows.find(tr => (tr.textContent || '').includes(doneJob.jobId));
  (row!.querySelector('button[aria-label="查看任务详情"]') as HTMLButtonElement).click();
  await settle(12);
  return host;
}

const dayHeads = (host: HTMLElement) =>
  [...host.querySelectorAll('[data-test="ar-day-head"]')].map(el => (el.textContent || '').trim());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('事件时间线跨天分组', () => {
  it('单源口径：dayLabel 三档（今天/昨天/MM-DD）与测试时刻自洽', () => {
    expect(dayLabel(TS_TODAY, NOW)).toBe('今天');
    expect(dayLabel(TS_YESTERDAY, NOW)).toBe('昨天');
    expect(dayLabel(TS_DAY_BEFORE, NOW)).toMatch(/^\d{2}-\d{2}$/);
  });

  it('全量视图：跨三天四事件 → 三段头（MM-DD/昨天/今天），事件行与全局索引保持', { timeout: 20000 }, async () => {
    const host = await mountAR();
    const heads = dayHeads(host);
    expect(heads, '段头按事件序分天').toHaveLength(3);
    expect(heads[0]).toMatch(/^\d{2}-\d{2}$/);
    expect(heads[1]).toBe('昨天');
    expect(heads[2]).toBe('今天');
    /* 事件行不增不减：ar-ev-N 全局索引保持（既有锁面零迁） */
    const evs = host.querySelectorAll('.ar-ev');
    expect(evs).toHaveLength(4);
    expect(host.querySelector('[data-test="ar-ev-0"]')!.textContent).toContain('前天开门');
    expect(host.querySelector('[data-test="ar-ev-3"]')!.textContent).toContain('今天完成');
    /* 同日相邻事件不重复出段头：今天两事件只一个「今天」头（heads 长度已锁 3） */
  });

  it('筛选共存：切「门禁」后剩余事件跨两天 → 段头仍按天重算；同日单段不重复', { timeout: 20000 }, async () => {
    const host = await mountAR();
    (host.querySelector<HTMLButtonElement>('[data-test="ar-evt-filter-gate"]'))!.click();
    await settle(6);
    /* 门禁命中：前天 GATE_OPEN + 今天 GATE_CONFIRMED（昨天过程事件被滤除） */
    const heads = dayHeads(host);
    expect(heads).toHaveLength(2);
    expect(heads[0]).toMatch(/^\d{2}-\d{2}$/);
    expect(heads[1]).toBe('今天');
    expect(host.querySelectorAll('.ar-ev')).toHaveLength(2);

    /* 切「终态」：仅今天 SUCCEEDED → 单段「今天」 */
    (host.querySelector<HTMLButtonElement>('[data-test="ar-evt-filter-final"]'))!.click();
    await settle(6);
    expect(dayHeads(host)).toEqual(['今天']);
    expect(host.querySelectorAll('.ar-ev')).toHaveLength(1);

    /* 回「全部」：段头恢复三段（筛选与分组互不干扰） */
    (host.querySelector<HTMLButtonElement>('[data-test="ar-evt-filter-all"]'))!.click();
    await settle(6);
    expect(dayHeads(host)).toHaveLength(3);
  });
});
