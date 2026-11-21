/**
 * 托管重建事件时间线增强（2026-11-21 对账批）：筛选芯片 + 自动滚动。
 *
 *  · 筛选芯片四档（全部/门禁/错误/终态，按 stage/status 过滤）：
 *    门禁=GATE_* 或 AWAIT_CONFIRM；错误=FAILED/ABORTED/LOCK_LOST；终态=SUCCEEDED/DONE；
 *  · 筛选空命中给「当前筛选无命中事件」空态（不冒充空清单）；
 *  · 自动滚动开关默认开（勾选态）；时间线容器限高内滚（滚动宿主在场）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const JOB = {
  jobId: 'ev-1', logicalName: 'bond_index', aliasMode: true, strategy: 'INCREMENTAL',
  timeField: 'ts', status: 'SUCCEEDED', stage: 'DONE', startedAt: 1700000000000,
  finishedAt: 1700000180000, sourcePhysical: 'bond_v1', destPhysical: 'bond_v2',
  currentTaskId: null, error: null,
};

/* 混合事件集：过程 2 + 门禁 2 + 错误 2 + 终态 2（共 8 条，ts 升序） */
const EVENTS = { jobId: 'ev-1', events: [
  { ts: 1700000000000, stage: 'CREATE_DEST', status: 'STARTED', detail: '作业创建' },
  { ts: 1700000020000, stage: 'AWAIT_CONFIRM', status: 'GATE_OPEN', detail: '确认门开启' },
  { ts: 1700000040000, stage: 'AWAIT_CONFIRM', status: 'GATE_CONFIRMED', detail: '人工放行' },
  { ts: 1700000060000, stage: 'FULL_REINDEX', status: 'FAILED', detail: '轮内 task 失败' },
  { ts: 1700000080000, stage: 'CATCHUP', status: 'ABORTED', detail: '人工中止' },
  { ts: 1700000100000, stage: 'AWAIT_CONFIRM', status: 'LOCK_LOST', detail: '失去重建锁' },
  { ts: 1700000140000, stage: 'DONE', status: 'SUCCEEDED', detail: '重建完成' },
  { ts: 1700000180000, stage: 'DONE', status: 'DONE', detail: '收尾完成' },
] };

async function mountAR(events = EVENTS) {
  jobsFn.mockResolvedValue([JOB]);
  statusFn.mockResolvedValue(JOB);
  eventsFn.mockResolvedValue(events);
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
  const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
  const row = rows.find(tr => (tr.textContent || '').includes(JOB.jobId));
  (row!.querySelector('button[title="查看任务详情"]') as HTMLButtonElement).click();
  await settle(10);
  return host;
}

const evRows = (host: HTMLElement) =>
  [...host.querySelectorAll('[data-test^="ar-ev-"][class*="ar-ev"]')].filter(el => el.classList.contains('ar-ev'));

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

describe('事件时间线：筛选芯片与自动滚动', () => {
  it('四枚筛选芯片在场且默认「全部」按下；自动滚动开关默认开', { timeout: 20000 }, async () => {
    const host = await mountAR();
    const all = host.querySelector('[data-test="ar-evt-filter-all"]');
    expect(all, '全部芯片').toBeTruthy();
    expect(all!.getAttribute('aria-pressed')).toBe('true');
    for (const k of ['gate', 'error', 'final']) {
      const chip = host.querySelector(`[data-test="ar-evt-filter-${k}"]`);
      expect(chip, `${k} 芯片在场`).toBeTruthy();
      expect(chip!.getAttribute('aria-pressed')).toBe('false');
    }
    expect(evRows(host).length, '全部档渲染全部 8 条').toBe(8);
    const auto = host.querySelector('[data-test="ar-evt-autoscroll"]');
    expect(auto, '自动滚动开关在场').toBeTruthy();
    expect(auto!.textContent).toContain('自动滚动到最新');
    /* naive checkbox 在 happy-dom 无原生 input，默认开经 setupState 直读（1119 setSlicesMode 同先例） */
    const setup = (host.querySelector('.ahr') as any).__vueParentComponent.setupState;
    expect(setup.evAutoScroll, '自动滚动默认开').toBe(true);
  });

  it('门禁档：只剩 GATE_* 与 AWAIT_CONFIRM 阶段事件', { timeout: 20000 }, async () => {
    const host = await mountAR();
    (host.querySelector<HTMLButtonElement>('[data-test="ar-evt-filter-gate"]'))!.click();
    await settle(6);
    const rows = evRows(host);
    expect(rows.length).toBe(3);
    const text = rows.map(r => r.textContent).join('\n');
    expect(text).toContain('确认门开启');
    expect(text).toContain('人工放行');
    expect(text).toContain('失去重建锁');
    /* 非门禁事件不得混入 */
    expect(text).not.toContain('作业创建');
    expect(text).not.toContain('重建完成');
    expect(host.querySelector('[data-test="ar-evt-filter-gate"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-test="ar-evt-filter-all"]')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('错误档：只剩 FAILED/ABORTED/LOCK_LOST 事件', { timeout: 20000 }, async () => {
    const host = await mountAR();
    (host.querySelector<HTMLButtonElement>('[data-test="ar-evt-filter-error"]'))!.click();
    await settle(6);
    const rows = evRows(host);
    expect(rows.length).toBe(3);
    const text = rows.map(r => r.textContent).join('\n');
    expect(text).toContain('轮内 task 失败');
    expect(text).toContain('人工中止');
    expect(text).toContain('失去重建锁');
    expect(text).not.toContain('确认门开启');
  });

  it('终态档：只剩 SUCCEEDED/DONE 事件', { timeout: 20000 }, async () => {
    const host = await mountAR();
    (host.querySelector<HTMLButtonElement>('[data-test="ar-evt-filter-final"]'))!.click();
    await settle(6);
    const rows = evRows(host);
    expect(rows.length).toBe(2);
    expect(rows.map(r => r.textContent).join('\n')).toContain('重建完成');
  });

  it('筛选空命中：「当前筛选无命中事件」空态（不冒充无记录）；切回全部恢复', { timeout: 20000 }, async () => {
    /* 稀疏事件集：仅一条过程事件（STARTED），门禁/错误/终态档全部空命中 */
    const sparse = { jobId: 'ev-1', events: [
      { ts: 1700000000000, stage: 'CREATE_DEST', status: 'STARTED', detail: '作业创建' },
    ] };
    const host = await mountAR(sparse);
    expect(evRows(host).length, '全部档 1 条').toBe(1);
    (host.querySelector<HTMLButtonElement>('[data-test="ar-evt-filter-gate"]'))!.click();
    await settle(6);
    const empty = host.querySelector('[data-test="ar-events-empty"]');
    expect(empty, '空命中空态在场').toBeTruthy();
    expect(empty!.textContent).toContain('当前筛选无命中事件');
    (host.querySelector<HTMLButtonElement>('[data-test="ar-evt-filter-all"]'))!.click();
    await settle(6);
    expect(evRows(host).length, '切回全部恢复渲染').toBe(1);
  });

  it('时间线容器限高内滚（自动滚动的滚动宿主；scoped 样式走源码锁）', { timeout: 20000 }, async () => {
    const host = await mountAR();
    expect(host.querySelector('[data-test="ar-events-line"]'), '滚动容器在场').toBeTruthy();
    const src = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');
    const rule = src.slice(src.indexOf('.ar-events-line {'), src.indexOf('.ar-ev-tools'));
    expect(rule).toContain('max-height');
    expect(rule).toContain('overflow-y: auto');
  });
});
