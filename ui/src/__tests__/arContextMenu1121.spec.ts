/**
 * 托管重建最近作业表：行级右键菜单（2026-11-21 对账批）。
 *
 *  · jobId 单元格右键出行菜单（CellContextMenu，.stop 防冒泡进 QRT 内建单元格菜单）；
 *  · 菜单项：复制逻辑索引名 / 打开详情 / 重跑（终态）/ 调速+中止（运行中）/ 治理删除（终态）/
 *    以此参数新建——按作业状态条件渲染，不给死按钮；
 *  · 「打开详情」进入该作业执行监控步；「重跑」打开参数覆盖弹层（与任务二同链路）；
 *  · 操作列（Eye/重跑/删除钮）保留在场——右键是增量入口不是替代。
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
const retryFn = vi.fn();
const deleteFn = vi.fn();
const copyTextFn = vi.fn();

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
        retry: (...a: any[]) => retryFn(...a),
        deleteJob: (...a: any[]) => deleteFn(...a),
      },
    },
  };
});
vi.mock('../composables/confirm', () => ({
  askConfirm: () => Promise.resolve(true),
}));
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { void props; void emit; return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: (...a: any[]) => copyTextFn(...a) };
});

import AdhocRebuildView from '../views/AdhocRebuildView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const baseJob = (over: Record<string, any> = {}) => ({
  jobId: 'ctx-1', logicalName: 'bond_index', aliasMode: true, strategy: 'INCREMENTAL',
  timeField: 'ts', status: 'FAILED', stage: 'FULL_REINDEX', startedAt: 1700000000000,
  finishedAt: 1700000009000, sourcePhysical: 'bond_v1', destPhysical: 'bond_v2',
  error: null, currentTaskId: null,
  ...over,
});

async function mountAR(jobs: any[]) {
  jobsFn.mockResolvedValue(jobs);
  statusFn.mockImplementation(async () => jobs[0]);
  eventsFn.mockResolvedValue({ jobId: jobs[0]?.jobId, events: [] });
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

/** 对 jobId 单元格 dispatch 原生 contextmenu（用户右键路径） */
function rightClickJobCell(host: HTMLElement, jobId: string) {
  const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
  const row = rows.find(tr => (tr.textContent || '').includes(jobId));
  expect(row, '作业行必须先渲染').toBeTruthy();
  const cell = row!.querySelector('[data-test="ar-job-cell"]');
  expect(cell, 'jobId 单元格锚在场').toBeTruthy();
  cell!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
}
const menuItem = (key: string) =>
  document.querySelector<HTMLButtonElement>(`.ccm [data-key="${key}"]`);

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  copyTextFn.mockReset().mockResolvedValue(true);
  retryFn.mockReset().mockResolvedValue({ ...baseJob(), status: 'RUNNING', error: null });
  deleteFn.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('源码锁：行右键接线与菜单项', () => {
  const src = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');
  it('jobId 单元格挂 contextmenu（.stop 防冒泡进 QRT 内建菜单）+ 独立行菜单状态', () => {
    expect(src).toContain('@contextmenu.prevent.stop="openJobRowMenu($event, jobOf(row))"');
    expect(src).toContain('const jobRowMenu = ref<');
    expect(src).toContain(':items="jobRowMenuItems"');
  });
  it('菜单项齐备：复制索引名/打开详情/重跑/调速/中止/治理删除/以此参数新建', () => {
    expect(src).toContain("label: '复制逻辑索引名'");
    expect(src).toContain("label: '打开详情（执行监控）'");
    expect(src).toContain("label: '重跑（可覆盖执行参数）'");
    expect(src).toContain("label: '调速（滚到调速区）'");
    expect(src).toContain("label: '中止作业'");
    expect(src).toContain("label: '治理删除记录'");
    expect(src).toContain("label: '以此参数新建'");
  });
});

describe('行级右键：挂载行为', () => {
  it('右键 jobId 单元格出菜单（标题带 jobId）；「打开详情」进执行监控步', { timeout: 20000 }, async () => {
    const host = await mountAR([baseJob()]);
    rightClickJobCell(host, 'ctx-1');
    await settle(6);
    const menu = document.querySelector('.ccm');
    expect(menu, 'CellContextMenu 打开（teleport body）').toBeTruthy();
    expect(menu!.textContent).toContain('ctx-1');
    expect(menuItem('j-copy-idx'), '复制索引名项').toBeTruthy();
    expect(menuItem('j-open'), '打开详情项').toBeTruthy();
    (menuItem('j-open'))!.click();
    await settle(10);
    expect(host.textContent).toContain('执行监控');
    expect(host.textContent).toContain('ctx-1');
  });

  it('终态（FAILED）行：重跑/治理删除在场，调速/中止不渲染；「重跑」开参数覆盖弹层', { timeout: 20000 }, async () => {
    const host = await mountAR([baseJob()]);
    rightClickJobCell(host, 'ctx-1');
    await settle(6);
    expect(menuItem('j-retry'), '终态行有重跑').toBeTruthy();
    expect(menuItem('j-delete'), '终态行有治理删除').toBeTruthy();
    expect(menuItem('j-throttle'), '终态行无调速').toBeNull();
    expect(menuItem('j-abort'), '终态行无中止').toBeNull();
    expect(menuItem('j-reuse'), '以此参数新建在场').toBeTruthy();
    (menuItem('j-retry'))!.click();
    await settle(6);
    expect(document.querySelector('[data-test="ar-retry-rps"]'), '重跑项开参数覆盖弹层').toBeTruthy();
  });

  it('运行中（RUNNING）行：调速/中止在场，重跑/治理删除不渲染', { timeout: 20000 }, async () => {
    const host = await mountAR([baseJob({ status: 'RUNNING', stage: 'FULL_REINDEX', finishedAt: null, currentTaskId: 'task-1' })]);
    rightClickJobCell(host, 'ctx-1');
    await settle(6);
    expect(menuItem('j-throttle'), '运行中行有调速').toBeTruthy();
    expect(menuItem('j-abort'), '运行中行有中止').toBeTruthy();
    expect(menuItem('j-retry'), '运行中行无重跑').toBeNull();
    expect(menuItem('j-delete'), '运行中行无治理删除').toBeNull();
  });

  it('「复制逻辑索引名」走统一复制通道；「治理删除」确认后调 deleteJob', { timeout: 20000 }, async () => {
    const host = await mountAR([baseJob()]);
    rightClickJobCell(host, 'ctx-1');
    await settle(6);
    (menuItem('j-copy-idx'))!.click();
    await settle(6);
    expect(copyTextFn).toHaveBeenCalledWith('bond_index');
    rightClickJobCell(host, 'ctx-1');
    await settle(6);
    (menuItem('j-delete'))!.click();
    await settle(10);
    expect(deleteFn).toHaveBeenCalledWith('ctx-1');
  });

  it('操作列保留：Eye/重跑/删除钮仍在行尾（右键是增量入口不是替代）', { timeout: 20000 }, async () => {
    const host = await mountAR([baseJob()]);
    const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
    const row = rows.find(tr => (tr.textContent || '').includes('ctx-1'))!;
    expect(row.querySelector('button[aria-label="查看任务详情"]')).toBeTruthy();
    expect(row.querySelector('[data-test="adhoc-retry-row"]')).toBeTruthy();
    expect(row.querySelector('button[aria-label="删除记录"]')).toBeTruthy();
  });
});
