/**
 * 托管重建最近作业：健康摘要条（2026-11-21 对账批）。
 *
 *  · 表上方从已加载 jobs 前端派生芯片：总数/运行中/成功/失败/平均轮次耗时/停门中；
 *  · 空清单整行隐藏（不冒充 0）；
 *  · 平均轮次耗时 = 全部作业轮次 roundTookMs 算术平均；无轮次采样展示 '—'；
 *  · 停门中 = RUNNING 且 stage=AWAIT_CONFIRM（业务写入正被阻断的作业数）。
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

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const job = (over: Record<string, any> = {}) => ({
  jobId: 'h-' + Math.random().toString(36).slice(2, 8), logicalName: 'bond_index',
  aliasMode: true, strategy: 'INCREMENTAL', timeField: 'ts', status: 'SUCCEEDED',
  stage: 'DONE', startedAt: 1700000000000, finishedAt: 1700000180000,
  sourcePhysical: 'bond_v1', destPhysical: 'bond_v2', error: null, currentTaskId: null,
  ...over,
});

async function mountAR(jobs: any[]) {
  jobsFn.mockResolvedValue(jobs);
  statusFn.mockImplementation(async () => jobs[0] ?? null);
  eventsFn.mockResolvedValue({ events: [] });
  const View = AdhocRebuildView;
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
  const app = createApp({ render: () => h(View as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  await settle(20);
  return host;
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('健康摘要条', () => {
  it('空清单：摘要条整行隐藏（不冒充 0）', { timeout: 20000 }, async () => {
    const host = await mountAR([]);
    expect(host.querySelector('[data-test="ar-health"]'), '空清单隐藏摘要条').toBeNull();
  });

  it('多作业派生：总数/运行中/成功/失败/停门中逐芯片对号', { timeout: 20000 }, async () => {
    const host = await mountAR([
      job({ status: 'RUNNING', stage: 'FULL_REINDEX', finishedAt: null }),   // 运行中
      job({ status: 'RUNNING', stage: 'AWAIT_CONFIRM', finishedAt: null }),  // 运行中 + 停门
      job({ status: 'SUCCEEDED', stage: 'DONE' }),
      job({ status: 'FAILED', stage: 'FULL_REINDEX', error: 'x' }),
      job({ status: 'ABORTED', stage: 'AWAIT_CONFIRM' }),
    ]);
    const bar = host.querySelector('[data-test="ar-health"]');
    expect(bar, '摘要条在场').toBeTruthy();
    expect(host.querySelector('[data-test="ar-health-total"]')!.textContent).toContain('总数 5');
    expect(host.querySelector('[data-test="ar-health-running"]')!.textContent).toContain('运行中 2');
    expect(host.querySelector('[data-test="ar-health-succeeded"]')!.textContent).toContain('成功 1');
    expect(host.querySelector('[data-test="ar-health-failed"]')!.textContent).toContain('失败 1');
    expect(host.querySelector('[data-test="ar-health-gated"]')!.textContent).toContain('停门中 1');
  });

  it('平均轮次耗时：roundTookMs 算术平均；无轮次采样展示 —', { timeout: 20000 }, async () => {
    const host = await mountAR([
      job({ rounds: [{ roundTookMs: 30000 }, { roundTookMs: 60000 }] }),  // 平均 45s
      job({ rounds: [{ roundTookMs: 90000 }] }),                          // → 三轮平均 60s
    ]);
    /* 随迁（fmtMs 单源批）：本地 fmtMs '1m0s' 退役，utils/format fmtMs（semFormat
       duration 档）60000ms → '60.0s' */
    expect(host.querySelector('[data-test="ar-health-avg-round"]')!.textContent).toContain('平均轮次耗时 60.0s');

    const host2 = await mountAR([job({ rounds: [] })]);
    expect(host2.querySelector('[data-test="ar-health-avg-round"]')!.textContent).toContain('平均轮次耗时 —');
  });
});
