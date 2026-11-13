/**
 * 五百二十八批（W-E）：任务进度可观测断链 + 弹层视口钳制 + 断点常量单源。
 *   ① TasksView reindex 行内进度：ES _tasks?detailed 的 status（BulkByScrollTask.Status，
 *      字段名按后端 EsIndexAdmin.getReindexProgress 解析键实地核实）渲染轻量进度——
 *      有 status.total 出「已处理/总数 百分比」+进度条；无 total 只显已处理数；
 *      非 reindex 行不受影响；不逐行打 /progress 端点（同域但 N×轮询成本不划算，备案裁决）。
 *   ② ReconcileReportDrawer 620 固定宽视口钳制（94% 收口，上限 620）。
 *   ③ BP_STACK 单源：常量本体在 utils/layout.ts，WorkbenchLayout import 引用
 *      （七百九十批：零消费 re-export 兼容层退役），
 *      WorkspaceView matchMedia 常量插值，getViewportProfile 内部档位合并。
 * 形态：①挂载行为（静态锁照不出渲染结果）+源码锁；②③源码锁（sweep524/layoutOcclusion 同手法）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const rd = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const tasksSrc = rd('../views/TasksView.vue');
const rrd = rd('../components/ReconcileReportDrawer.vue');
const layoutUtil = rd('../utils/layout.ts');
const wbs = rd('../components/WorkbenchLayout.vue');
const ws = rd('../views/WorkspaceView.vue');

/* ═══════════ TasksView 挂载（api.clusterTasks mock，sweep524 同构） ═══════════ */
const tasksFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterTasks: (...args: any[]) => tasksFn(...args),
    },
  };
});

const TV_TASK = {
  taskId: 'node-es-01:123', node: 'node-es-01', action: 'indices:data/write/reindex',
  description: 'reindex from [a] to [b]', parentTaskId: 'unset',
  startTimeMillis: 0, runningTimeNanos: 2_000_000_000, cancellable: true, status: {},
};

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountTasks() {
  location.hash = '#/';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }, { path: '/tasks', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const { default: TasksView } = await import('../views/TasksView.vue');
  const app = createApp({ render: () => h(TasksView as any) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

describe('TasksView reindex 进度渲染（528 批，挂载）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    location.hash = '#/';
    localStorage.clear();
    sessionStorage.clear();
    tasksFn.mockReset();
  });

  it('reindex 行带 status.total：出「已处理/总数 百分比」+ 进度条（width=百分比）', async () => {
    tasksFn.mockResolvedValue([
      { ...TV_TASK, status: { total: 5000, updated: 1200, created: 0, deleted: 0, version_conflicts: 0 } },
    ]);
    const { app, host } = await mountTasks();
    const prog = host.querySelector('.tv-prog');
    expect(prog, 'reindex 行必须渲染进度 chip').toBeTruthy();
    expect(prog!.querySelector('.tv-prog-txt')!.textContent).toContain('1,200/5,000 24%');
    expect(prog!.querySelector('.tv-prog-bar'), '有 total 必须出进度条').toBeTruthy();
    expect(prog!.querySelector<HTMLElement>('.tv-prog-fill')!.style.width).toBe('24%');
    const title = prog!.getAttribute('title') || '';
    expect(title).toContain('1,200');
    expect(title).toContain('5,000');
    app.unmount();
  });

  it('total 缺失但已有处理量：只显「已处理 N」，不出空进度条', async () => {
    tasksFn.mockResolvedValue([
      { ...TV_TASK, status: { updated: 800, created: 200, deleted: 0 } },
    ]);
    const { app, host } = await mountTasks();
    const prog = host.querySelector('.tv-prog');
    expect(prog, '无 total 也要显示已处理数').toBeTruthy();
    expect(prog!.querySelector('.tv-prog-txt')!.textContent).toContain('已处理 1,000');
    expect(prog!.querySelector('.tv-prog-bar'), 'total 缺失不出进度条（防空条误导）').toBeNull();
    app.unmount();
  });

  it('非 reindex 行（search/bulk）即使带 status 也不出进度 chip', async () => {
    tasksFn.mockResolvedValue([
      { ...TV_TASK, taskId: 'node-es-02:456', action: 'indices:data/read/search', status: { total: 100, updated: 50 } },
      { ...TV_TASK, taskId: 'node-es-03:789', action: 'indices:data/write/bulk', status: { total: 100, updated: 50 } },
    ]);
    const { app, host } = await mountTasks();
    expect(host.querySelectorAll('.tv-node').length).toBe(2);
    expect(host.querySelector('.tv-prog'), '非 reindex 行不渲染进度').toBeNull();
    app.unmount();
  });

  it('源码锁：status 字段提取口径 + 不逐行打 /progress 端点（可观测断链备案裁决）', () => {
    /* 字段名实地核实锚（后端 EsIndexAdmin.getReindexProgress 同键）：total/updated/created/deleted */
    expect(tasksSrc).toMatch(/const done = num\(s\.updated\) \+ num\(s\.created\) \+ num\(s\.deleted\);/);
    expect(tasksSrc).toMatch(/const total = num\(s\.total\);/);
    expect(tasksSrc).toMatch(/includes\('reindex'\)/);
    /* /progress 端点不接：taskId 同域但逐行打点=N×轮询频率额外请求，detailed=true 已带回同源 status */
    expect(tasksSrc).not.toMatch(/api\.progress/);
  });
});

describe('ReconcileReportDrawer 视口钳制（528 批）', () => {
  it('620 固定宽退役改 drawerW computed（94% 视口收口、上限 620）', () => {
    expect(rrd).toContain('const drawerW = computed(() => Math.min(620, Math.round(store.viewportW * 0.94)));');
    expect(rrd).toContain(':width="drawerW"');
    expect(rrd, '数字字面量回流即回归').not.toContain(':width="620"');
  });
});

describe('BP_STACK 断点常量单源（528 批合并 utils/layout）', () => {
  it('常量本体在 layout.ts（BP_STACK/BP_NARROW），getViewportProfile 内部档位合并不裸写', () => {
    expect(layoutUtil).toMatch(/export const BP_NARROW = 900;/);
    expect(layoutUtil).toMatch(/export const BP_STACK = 1100;/);
    expect(layoutUtil).toMatch(/width < BP_NARROW/);
    expect(layoutUtil).toMatch(/width < BP_STACK/);
    expect(layoutUtil, 'embedded 判据不得回流裸 900').not.toMatch(/width < 900/);
  });
  it('WorkbenchLayout import 引用形态（790 re-export 退役）；WorkspaceView matchMedia 常量插值不再裸写', () => {
    expect(wbs).toMatch(/^import \{[^}]*\bBP_STACK\b[^}]*\} from '\.\.\/utils\/layout';/m);
    expect(ws).toContain("import { BP_NARROW, BP_STACK } from '../utils/layout';");
    expect(ws).toMatch(/window\.matchMedia\(`\(max-width: \$\{BP_STACK\}px\)`\)/);
    expect(ws).toMatch(/window\.matchMedia\(`\(max-width: \$\{BP_NARROW\}px\)`\)/);
    expect(ws, '裸 900/1100 判据回流即回归').not.toMatch(/matchMedia\('\(max-width: (?:900|1100)px\)'\)/);
  });
});
