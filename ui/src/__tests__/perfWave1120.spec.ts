/**
 * 1120 性能波次：轮询型页面的渲染降载。产线交互卡顿的机理是「轮询回包必全量落地」——
 * 每 2~10s 回包换新数组身份，下游表格五级 computed 逐层失效，N×M 格重算重渲。
 * 锁七件：
 *   ① 回包浅比较辅助（shallowEqBy/shallowEqFields，jobTracker 单一出处）+ store 落地行为；
 *   ② jobTracker 通道去重：路由落在目标页时跳过对应通道（页面自身轮询已覆盖）；
 *   ③ MAX_RENDER 首批 2000→300（增量续渲机制兜住浏览连续性）；
 *   ④ QRT 行渲染：v-for 稳定业务键 + v-memo 行级依赖快照；
 *   ⑤ 进度条填充 width 过渡→transform scaleX（合成器动画不触发 layout）；
 *   ⑥ TasksView 默认轮询 10000 + 树节点跨拍复用（children 清理正确性）；
 *   ⑦ XmigrateView SparkLine 单调（模板局部变量 + 序列引用缓存）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { api } from '../api';
import { router } from '../router';
import { useJobTrackerStore, shallowEqBy, shallowEqFields } from '../stores/jobTracker';
import { MAX_RENDER } from '../composables/useRenderMore';

const rd = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const rmSrc = rd('../composables/useRenderMore.ts');
const jtSrc = rd('../stores/jobTracker.ts');
const qrtSrc = rd('../components/QueryResultTable.vue');
const tvSrc = rd('../views/TasksView.vue');
const xmSrc = rd('../views/XmigrateView.vue');

/* ═══════════ TasksView 挂载基建（api.clusterTasks mock，tasksProgress528 同构） ═══════════ */
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
  const localRouter = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }, { path: '/tasks', component: { template: '<div/>' } }],
  });
  await localRouter.push('/');
  await localRouter.isReady();
  const { default: TasksView } = await import('../views/TasksView.vue');
  const app = createApp({ render: () => h(TasksView as any) });
  app.use(pinia);
  app.use(localRouter);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

/* ═════ ① 回包浅比较辅助（单一出处导出） ═════ */
describe('1120 ① 浅比较辅助 shallowEqBy / shallowEqFields', () => {
  it('shallowEqBy：签名全等→true（跳过赋值）；任一签名差异→false；长度差→false；同引用→true', () => {
    const a = [{ id: 'x', status: 'RUNNING', stage: 'REINDEX', pct: 10 }, { id: 'y', status: 'RUNNING', stage: '', pct: -1 }];
    const b = [{ id: 'x', status: 'RUNNING', stage: 'REINDEX', pct: 10 }, { id: 'y', status: 'RUNNING', stage: '', pct: -1 }];
    const keys = (j: any) => [j.id, j.status, j.stage, j.pct];
    expect(shallowEqBy(a, b, keys), '新数组同签名内容：等价可跳过').toBe(true);
    expect(shallowEqBy(a, a, keys), '同引用直接等价').toBe(true);
    const c = [{ id: 'x', status: 'RUNNING', stage: 'REINDEX', pct: 11 }];
    expect(shallowEqBy(a, c, keys), '长度不等：不等价').toBe(false);
    const d = [{ id: 'x', status: 'FAILED', stage: 'REINDEX', pct: 10 }, { id: 'y', status: 'RUNNING', stage: '', pct: -1 }];
    expect(shallowEqBy(a, d, keys), 'status 变化：不等价（必须赋值）').toBe(false);
    expect(shallowEqBy(null, b, keys), 'prev 缺席：不等价').toBe(false);
  });

  it('shallowEqFields：字段全等→true；差异/null→false；同引用→true', () => {
    expect(shallowEqFields({ status: 'RUNNING', stage: 'REINDEX' }, { status: 'RUNNING', stage: 'REINDEX' }, ['status', 'stage'])).toBe(true);
    expect(shallowEqFields({ status: 'RUNNING', stage: 'A' }, { status: 'RUNNING', stage: 'B' }, ['status', 'stage'])).toBe(false);
    expect(shallowEqFields(null, { status: 'RUNNING' }, ['status'])).toBe(false);
    const o = { status: 'RUNNING' };
    expect(shallowEqFields(o, o, ['status'])).toBe(true);
  });

  it('jobTracker 源码锚：poll 落地前经浅比较门（未变不赋值）', () => {
    expect(jtSrc).toContain('export function shallowEqBy');
    expect(jtSrc).toMatch(/if \(!shallowEqBy\(jobs\.value, next, j => \[j\.id, j\.status, j\.stage, j\.pct, j\.label, j\.reason\]\)\)/);
  });
});

/* ═════ ①行为 + ② jobTracker：store 落地引用稳定 / 通道去重 ═════ */
describe('1120 ①② jobTracker poll：同内容回包不换引用 + 路由通道去重', () => {
  let adhocJobs: any[] = [];
  const adhocJobsFn = vi.fn(async () => adhocJobs);
  const xbJobsFn = vi.fn(async () => []);
  /* currentRoute getter 直写（真实 push 会进全局权限守卫的异步链，测试环境不 settle）；
   jobTracker 读 currentRoute.value.path，mock 返回带 value 的形态 */
  const routeAt = (path: string) => {
    vi.spyOn(router, 'currentRoute', 'get').mockReturnValue({ value: { path } } as any);
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    setActivePinia(createPinia());
    adhocJobs = [];
    vi.spyOn(api.adhoc, 'jobs').mockImplementation(adhocJobsFn as any);
    vi.spyOn(api.xb, 'jobs').mockImplementation(xbJobsFn as any);
    vi.spyOn(api, 'clusterTasks').mockImplementation(async () => { throw new Error('boom'); });
    vi.spyOn(api, 'snapshotStatus').mockImplementation(async () => { throw new Error('boom'); });
    adhocJobsFn.mockClear();
    xbJobsFn.mockClear();
    routeAt('/');
  });

  it('两拍同内容回包：jobs 引用不变（下游 computed 免失效）；差异拍引用更新', async () => {
    adhocJobs = [{ jobId: 'p1', logicalName: 'idx-1', status: 'RUNNING', stage: 'REINDEX', startedAt: 1 }];
    const jt = useJobTrackerStore();
    await jt.poll();
    const ref1 = jt.jobs;
    expect(ref1.length).toBe(1);
    adhocJobsFn.mockClear();
    await jt.poll(); // 回包内容等价（新数组、新对象，签名全同）
    expect(adhocJobsFn).toHaveBeenCalled();
    /* 浅比较相等拍不赋值：引用恒定 */
    expect(jt.jobs).toBe(ref1);
    adhocJobs = [
      { jobId: 'p1', logicalName: 'idx-1', status: 'RUNNING', stage: 'REINDEX', startedAt: 1 },
      { jobId: 'p2', logicalName: 'idx-2', status: 'RUNNING', stage: 'REINDEX', startedAt: 2 },
    ];
    await jt.poll();
    /* 差异拍正常落地 */
    expect(jt.jobs).not.toBe(ref1);
    expect(jt.jobs.length).toBe(2);
  });

  it('通道去重：路由落在 /adhoc-rebuild 跳过 adhoc 通道（页面自身轮询已覆盖），回首页恢复', async () => {
    adhocJobs = [{ jobId: 'p1', logicalName: 'idx-1', status: 'RUNNING', stage: 'REINDEX', startedAt: 1 }];
    const jt = useJobTrackerStore();
    await jt.poll();
    expect(adhocJobsFn).toHaveBeenCalledTimes(1);
    adhocJobsFn.mockClear();
    xbJobsFn.mockClear();
    routeAt('/adhoc-rebuild');
    await jt.poll();
    expect(adhocJobsFn, '当前路由就是托管重建页：adhoc 通道跳过').not.toHaveBeenCalled();
    expect(xbJobsFn, '其它通道照常轮询').toHaveBeenCalled();
    routeAt('/');
    adhocJobsFn.mockClear();
    await jt.poll();
    expect(adhocJobsFn, '离开页面下一拍恢复').toHaveBeenCalled();
  });

  it('通道去重源码锚：四通道按当前路由裁剪', () => {
    expect(jtSrc).toContain("const here = router.currentRoute.value.path;");
    expect(jtSrc).toContain("const wantAdhocLive = wantAdhoc && here !== '/adhoc-rebuild';");
    expect(jtSrc).toContain("const wantXmLive = wantXm && here !== '/xmigrate';");
    expect(jtSrc).toContain("const wantTasksLive = wantTasks && here !== '/tasks' && here !== '/task-tree';");
    expect(jtSrc).toContain("const wantSnapsLive = wantSnaps && here !== '/snapshots';");
  });
});

/* ═════ ③ MAX_RENDER=300（源码值锚） ═════ */
describe('1120 ③ MAX_RENDER 首批 300', () => {
  it('常量值与源码锚（增量续渲兜住浏览连续性）', () => {
    expect(MAX_RENDER).toBe(300);
    expect(rmSrc).toMatch(/export const MAX_RENDER = 300;/);
  });
});

/* ═════ ④ QRT 行渲染：稳定业务键（v-memo 尝试后退役） ═════ */
describe('1120 ④ QRT 稳定业务键 + 行级 v-memo 退役护栏', () => {
  it('v-for key 从行号改 rowKeys（首列业务身份；缺席/撞值全表回退行号）', () => {
    expect(qrtSrc).toContain('<template v-for="(row, ri) in renderRows" :key="rowKeys[ri]">');
    expect(qrtSrc).toMatch(/const rowKeys = computed<string\[\]>/);
    expect(qrtSrc).toContain('// 首列缺席：回退行号');
    expect(qrtSrc).toContain('// 首列撞值：回退行号（key 必须唯一）');
  });

  it('行级 v-memo 不得回流：行槽内容的响应式订阅归属表格渲染副作用，宿主状态变化（中止钮 busy/确认窗挂起禁用）会被 memo 吞掉——中止执行闸二击穿透实测', () => {
    /* 中止执行闸（xmigrateGateExport941/securityRebindGate940）是行为红线，负锚防回流 */
    expect(qrtSrc).not.toMatch(/<tr v-memo=/);
    /* 退役原因注释必须在场（下次优化前先读） */
    expect(qrtSrc).toContain('1120 尝试后退役：此节点不加 v-memo 行级依赖快照');
    expect(qrtSrc).toContain('行级 memo 会吞掉这类更新');
  });
});

/* ═════ ⑤ 进度条填充 transform scaleX（不触发 layout） ═════
   ProgressBar 统一件零引用已退役（孤儿处置），本组只守 TasksView 行内进度条 */
describe('1120 ⑤ 进度条 width 过渡→transform scaleX', () => {
  it('TasksView .tv-prog-fill：scaleX 形态 + 无 width 过渡回流', () => {
    expect(tvSrc).toContain(`:style="{ transform: 'scaleX(' + (t.prog.pct / 100) + ')' }"`);
    const rule = tvSrc.match(/\.tv-prog-fill \{[^}]*\}/)?.[0] || '';
    expect(rule).toContain('transform-origin: left');
    expect(rule).toContain('transition: transform 400ms ease');
    expect(rule, 'width 过渡回流即回归').not.toContain('transition: width');
  });
});

/* ═════ ⑥ TasksView 默认轮询 10000 + 树节点跨拍复用 ═════ */
describe('1120 ⑥ TasksView 默认轮询与树复用', () => {
  beforeEach(() => {
    /* 还原 ①② describe 里 spyOn 的 api 方法（clusterTasks 等泄漏会让本组挂载直接走错误分支） */
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    tasksFn.mockReset();
  });

  it('默认轮询 10000（观测面板不是秒表；usePref 记忆，用户可切档）', () => {
    expect(tvSrc).toContain("usePref('tasks.intervalMs', 10000)");
  });

  it('树复用源码锚：treeCache 跨拍缓存 + 签名等价保留旧引用（children 清空重挂）', () => {
    expect(tvSrc).toContain('let treeCache = new Map<string, TreeNode>();');
    expect(tvSrc).toMatch(/if \(prev && sameTreeNode\(prev, t, prog\)\) \{/);
    expect(tvSrc).toContain('prev.children.length = 0;');
    expect(tvSrc).toMatch(/for \(const id of \[...treeCache\.keys\(\)\]\) if \(!live\.has\(id\)\) treeCache\.delete\(id\);/);
  });

  it('树复用行为：签名等价拍（耗时粒度内微变）行集不膨胀——children 复用清理正确', async () => {
    const parent = { ...TV_TASK, status: { total: 5000, updated: 1200, created: 0, deleted: 0 }, tookMs: 2000 };
    const child = { ...TV_TASK, taskId: 'node-es-01:124', parentTaskId: 'node-es-01:123', description: 'child shard', status: {}, tookMs: 1900 };
    tasksFn.mockResolvedValue([parent, child]);
    const { app, host } = await mountTasks();
    expect(host.querySelectorAll('.tv-node').length).toBe(2);
    /* 第二拍：父任务进度推进（updated 1200→1201，浅比较签名不等→落地发生→树重建），
       子任务除耗时粒度内微变外全等价（命中复用分支）——行数必须恒定
       （复用分支若漏清 children 会逐拍重复挂子节点） */
    tasksFn.mockResolvedValue([
      { ...parent, status: { total: 5000, updated: 1201, created: 0, deleted: 0 } },
      { ...child, runningTimeNanos: 1_950_000_000, tookMs: 1950 },
    ]);
    (host.querySelector('button[aria-label="刷新任务列表"]') as HTMLElement).click();
    await settle();
    expect(host.querySelectorAll('.tv-node').length, '复用拍行集不膨胀').toBe(2);
    expect(host.querySelector('[data-task-id="node-es-01:124"]')).toBeTruthy();
    app.unmount();
  }, 20000);
});

/* ═════ ⑦ XmigrateView SparkLine 单调 + 序列引用缓存 ═════ */
describe('1120 ⑦ SparkLine 单调（模板局部变量 + 序列引用缓存）', () => {
  it('单元素 v-for 局部变量：sparkOf 每行只求值一次（原 v-if/:data 双调）', () => {
    expect(xmSrc).toContain(`<template v-for="sp in [sparkOf(rowJob(row))]" :key="'sp'">`);
    expect(xmSrc).toContain('<SparkLine v-if="sp.length >= 2" class="xm-p-spark" :data="sp" :w="96" :h="16" />');
    /* 双调形态回流即回归 */
    expect(xmSrc).not.toContain('v-if="sparkOf(rowJob(row)).length >= 2"');
  });

  it('序列引用缓存：末点未变返回同一数组（SparkLine pts computed 跳过重算）', () => {
    expect(xmSrc).toContain('const sparkCache = new Map<string, { s: number[]; t: number }>();');
    expect(xmSrc).toMatch(/if \(hit && hit\.t === top\.t\) return hit\.s;/);
  });
});
