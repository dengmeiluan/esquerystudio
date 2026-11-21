/**
 * 托管重建页面能力升级（直连确认门 / 门超时 / 重跑 / 完成校验 / taskId 联动 /
 * 失败处置 / 深链 / 历史治理 / 动态调速 / 策略控件 naive 化）。
 *
 * 两条锁面：
 *  · 纯浏览器编排（browserAdhoc）：直连模式同样停 AWAIT_CONFIRM 门（30 分钟截止）；
 *    确认时目标索引探活失败拒绝放行删除；门超时自动解除写阻断按失败收尾；retry 按
 *    「目标存活+增量」续跑 / 否则全量重发；throttle 直连 _rethrottle；记录级删除/清理。
 *  · 视图行为（真挂载 + memory router + api 手控回包，adhocTuningForm1119 同款基建）：
 *    门倒计时渲染与紧急态、监控/历史表重跑、完成校验徽标、taskId 深链、失败处置按钮、
 *    ?jobId= 深链定位与失联空态、历史表删除/清理、调速控件可用态。
 *  · 监控体验升级（同款真挂载基建）：轮次表耗时列与追平轮 pill、中止钮语义与切换后
 *    禁用守卫、轮询连续失败黄条、重挂提示放宽到 step<4、SUCCEEDED 跨板块联动
 *    （索引工作区芯片/别名管理页链接/健康报告入口）、完成校验活取 _count、
 *    最近作业表随监控轮询低频自动刷新。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* ══════════════ 纯浏览器编排（browserAdhoc 直调） ══════════════ */

import {
  adhocStart, adhocStatus, adhocConfirm, adhocRetry, adhocThrottle, adhocDeleteJob, adhocCleanupJobs,
} from '../platform/browserAdhoc';

type Call = { path: string; method: string; body?: string };

/* 直连物理索引 fake ES：states 按提交序回放 task 状态；destAlive 控制 _count 是否 404 */
function directEs(states: { completed?: boolean; status?: any }[], opts: { destAlive?: boolean; log?: Call[] } = {}) {
  const log = opts.log || [];
  const es = (path: string, method = 'GET', body?: string) => {
    log.push({ path, method, body });
    if (path === '/_alias/plain_idx') return Promise.resolve({});
    if (path === '/plain_idx/_mapping') return Promise.resolve({ plain_idx: { mappings: { properties: { created_at: { type: 'date' } } } } });
    if (path === '/plain_idx/_settings?flat_settings=true') return Promise.resolve({ plain_idx: { settings: {} } });
    if (path === '/plain_idx/_count') return Promise.resolve({ count: 10 });
    if (path === '/plain_new/_count') {
      if (opts.destAlive === false) return Promise.reject(new Error('index_not_found'));
      return Promise.resolve({ count: 10 });
    }
    if (path.startsWith('/_reindex')) return Promise.resolve({ task: 'n1:' + (log.filter(c => c.path.startsWith('/_reindex')).length) });
    if (path.startsWith('/_tasks/')) {
      const s = states[Math.min(log.filter(c => c.path.startsWith('/_reindex')).length, states.length) - 1] || {};
      return Promise.resolve({ completed: !!s.completed, task: { status: s.status || {} } });
    }
    return Promise.resolve({ acknowledged: true });
  };
  return { es: es as any, log };
}

function putFailedJob(over: Record<string, any> = {}) {
  const j: any = {
    jobId: 'adhoc-retry-1', logicalName: 'plain_idx', strategy: 'INCREMENTAL', aliasMode: false,
    sourcePhysical: 'plain_idx', destPhysical: 'plain_new', timeField: 'created_at',
    bufferMs: 120000, startedAt: Date.now() - 3600_000, finishedAt: Date.now() - 1800_000,
    status: 'FAILED', stage: 'DONE', error: 'reindex 失败', currentTaskId: 'n1:9',
    catchupRound: 0, catchupBaseMs: Date.now(), rounds: [], requestsPerSecond: null, slices: null,
    total: 10, created: 3, updated: 0, roundBase: { total: 10, created: 3, updated: 0 },
    sourceDocCount: 10, destDocCount: 3, deleteOldIndex: true, pauseBeforeSwitch: true,
    awaitConfirmSince: null, gateDeadlineMs: null, gateOutcome: null, report: null,
    ...over,
  };
  localStorage.setItem('esquerystudio.adhoc.jobs', JSON.stringify([j]));
  return j;
}

describe('纯浏览器编排：直连确认门与探活（browserAdhoc）', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('直连模式（非别名）开启确认门：追平收敛后停 AWAIT_CONFIRM，不再静默直切', async () => {
    const { es, log } = directEs([{ completed: true, status: { total: 10, created: 10, updated: 0 } }]);
    const r = await adhocStart(es, { index: 'plain_idx', strategy: 'MANUAL', destIndex: 'plain_new', confirmDirectSwap: true, pauseBeforeSwitch: true });
    const done = await adhocStatus(es, r.jobId);
    expect(done).toMatchObject({ status: 'RUNNING', stage: 'AWAIT_CONFIRM', aliasMode: false });
    expect(done.gateDeadlineMs).toBe(done.awaitConfirmSince + 30 * 60 * 1000);
    expect(log.some(c => c.method === 'DELETE'), '停门期间不得删任何索引').toBe(false);
  });

  it('直连确认：目标索引探活失败 → 拒绝放行，作业留在门上且未删除源索引', async () => {
    const { es, log } = directEs([{ completed: true, status: { total: 10, created: 10 } }], { destAlive: false, log: [] });
    const r = await adhocStart(es, { index: 'plain_idx', strategy: 'MANUAL', destIndex: 'plain_new', confirmDirectSwap: true, pauseBeforeSwitch: true, deleteOldIndex: true });
    await adhocStatus(es, r.jobId);
    await expect(adhocConfirm(es, r.jobId)).rejects.toThrow('探活失败');
    const after = await adhocStatus(es, r.jobId);
    expect(after).toMatchObject({ stage: 'AWAIT_CONFIRM', status: 'RUNNING' });
    expect(log.some(c => c.method === 'DELETE' && c.path === '/plain_idx'), '探活失败不得删源索引').toBe(false);
  });

  it('直连确认：探活通过 → 放行切换，收尾删除源索引且 report 如实说明', async () => {
    const log: Call[] = [];
    const { es } = directEs([{ completed: true, status: { total: 10, created: 10 } }], { log });
    const r = await adhocStart(es, { index: 'plain_idx', strategy: 'MANUAL', destIndex: 'plain_new', confirmDirectSwap: true, pauseBeforeSwitch: true, deleteOldIndex: true });
    await adhocStatus(es, r.jobId);
    const confirmed = await adhocConfirm(es, r.jobId);
    expect(confirmed).toMatchObject({ status: 'SUCCEEDED', stage: 'DONE' });
    expect(log.some(c => c.method === 'DELETE' && c.path === '/plain_idx'), '确认后按选项删除源索引').toBe(true);
    expect(confirmed.report.hint).toContain('直连模式已按选项删除旧索引 plain_idx');
  });

  it('门超时（30 分钟）：自动解除写阻断、不执行切换、按失败收尾并标记 TIMED_OUT', async () => {
    const log: Call[] = [];
    const { es } = directEs([{ completed: true, status: { total: 10, created: 10 } }], { log });
    const r = await adhocStart(es, {
      index: 'plain_idx', strategy: 'WRITE_BLOCK', destIndex: 'plain_new',
      confirmDirectSwap: true, pauseBeforeSwitch: true,
    });
    await adhocStatus(es, r.jobId); // 全量完成 → WRITE_BLOCK 停门（writeBlocked=true）
    const atGate = await adhocStatus(es, r.jobId);
    expect(atGate.stage).toBe('AWAIT_CONFIRM');
    expect(atGate.writeBlocked, 'WRITE_BLOCK 进门时已挡写').toBe(true);
    vi.setSystemTime(new Date('2026-11-19T10:31:00Z')); // 越过 30 分钟截止
    const timed = await adhocStatus(es, r.jobId);
    expect(timed).toMatchObject({ status: 'FAILED', stage: 'DONE', gateOutcome: 'TIMED_OUT' });
    expect(timed.error).toContain('确认门超时');
    const unblock = log.find(c => c.path === '/plain_idx/_settings' && c.method === 'PUT' && /"write":\s*false/.test(String(c.body)));
    expect(unblock, '超时必须解除写阻断（blocks.write=false）').toBeTruthy();
    expect(log.some(c => c.method === 'DELETE' && c.path === '/plain_idx'), '超时不得删除源索引').toBe(false);
    expect(log.some(c => c.path === '/_aliases'), '超时不得执行别名切换').toBe(false);
  });
});

describe('纯浏览器编排：重跑 / 调速 / 记录治理（browserAdhoc）', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('重跑（增量语义）：目标存活 + INCREMENTAL + timeField → 从追平点续跑 range reindex，同 jobId 重置', async () => {
    const log: Call[] = [];
    const { es } = directEs([{ completed: false, status: { total: 2, created: 1 } }], { log });
    const job = putFailedJob();
    const r = await adhocRetry(es, job.jobId);
    expect(r).toMatchObject({ jobId: job.jobId, status: 'RUNNING', stage: 'CATCHUP', error: null });
    expect(r.catchupRound).toBe(1);
    const cu = log.find(c => c.path.startsWith('/_reindex') && c.method === 'POST');
    expect(cu, '增量续跑提交 range reindex').toBeTruthy();
    const body = JSON.parse(cu!.body!);
    expect(body.source.index).toBe('plain_idx');
    expect(body.source.query.range.created_at.gte).toBe(new Date(job.startedAt - job.bufferMs).toISOString());
    expect(log.some(c => c.path.startsWith('/_tasks/n1%3A9/_cancel')), '重跑前先取消残留 task').toBe(true);
  });

  it('重跑（全量语义）：目标索引不在 → 按源现状重建目标并重发全量 reindex', async () => {
    const log: Call[] = [];
    const { es } = directEs([{ completed: false, status: { total: 10, created: 1 } }], { destAlive: false, log });
    const job = putFailedJob({ strategy: 'MANUAL', timeField: null });
    const r = await adhocRetry(es, job.jobId);
    expect(r).toMatchObject({ status: 'RUNNING', stage: 'FULL_REINDEX' });
    expect(log.some(c => c.method === 'PUT' && c.path === '/plain_new'), '目标不在时先重建目标索引').toBe(true);
    const full = log.filter(c => c.path.startsWith('/_reindex') && c.method === 'POST').pop()!;
    const body = JSON.parse(full.body!);
    expect(body.source).toEqual({ index: 'plain_idx' });
    expect(body.conflicts).toBe('proceed');
  });

  it('重跑闸：运行中作业拒绝重跑', async () => {
    const { es } = directEs([]);
    putFailedJob({ status: 'RUNNING', stage: 'FULL_REINDEX', finishedAt: null });
    await expect(adhocRetry(es, 'adhoc-retry-1')).rejects.toThrow('仅失败或已中止的作业可重跑');
  });

  it('调速：reindex 执行段直连 _rethrottle，-1 恢复不限速；AWAIT_CONFIRM 拒绝', async () => {
    const log: Call[] = [];
    const { es } = directEs([], { log });
    putFailedJob({ status: 'RUNNING', stage: 'CATCHUP', finishedAt: null, error: null });
    const r = await adhocThrottle(es, 'adhoc-retry-1', 50);
    expect(r.requestsPerSecond).toBe(50);
    expect(log.some(c => c.method === 'POST' && c.path === '/_tasks/n1%3A9/_rethrottle?requests_per_second=50')).toBe(true);
    await adhocThrottle(es, 'adhoc-retry-1', -1);
    const unthrottled = JSON.parse(localStorage.getItem('esquerystudio.adhoc.jobs')!)[0];
    expect(unthrottled.requestsPerSecond).toBe(null);
    putFailedJob({ status: 'RUNNING', stage: 'AWAIT_CONFIRM', finishedAt: null, error: null, gateDeadlineMs: Date.now() + 60000 });
    await expect(adhocThrottle(es, 'adhoc-retry-1', 50)).rejects.toThrow('无法调速');
  });

  it('记录治理：运行中拒绝删除；批量清理只删窗口内终态记录并回 {deleted:N}', async () => {
    putFailedJob({ status: 'RUNNING', stage: 'FULL_REINDEX', finishedAt: null, error: null });
    await expect(adhocDeleteJob('adhoc-retry-1')).rejects.toThrow('作业进行中');
    /* 改成 8 天前收尾的终态 + 一条进行中 + 一条今天终态 */
    const old = putFailedJob({ finishedAt: Date.now() - 8 * 86400000 });
    const running = { ...old, jobId: 'adhoc-run-2', status: 'RUNNING', stage: 'FULL_REINDEX', finishedAt: null, error: null };
    const fresh = { ...old, jobId: 'adhoc-fresh-3', finishedAt: Date.now() - 1000 };
    localStorage.setItem('esquerystudio.adhoc.jobs', JSON.stringify([old, running, fresh]));
    const r = await adhocCleanupJobs(7);
    expect(r).toEqual({ deleted: 1 });
    const left = JSON.parse(localStorage.getItem('esquerystudio.adhoc.jobs')!).map((x: any) => x.jobId);
    expect(left).toEqual(['adhoc-run-2', 'adhoc-fresh-3']);
    await adhocDeleteJob('adhoc-fresh-3');
    const after = JSON.parse(localStorage.getItem('esquerystudio.adhoc.jobs')!).map((x: any) => x.jobId);
    expect(after).toEqual(['adhoc-run-2']);
  });
});

/* ══════════════ 视图行为（真挂载） ══════════════ */

const askConfirmFn = vi.fn();
const prepareFn = vi.fn();
const statusFn = vi.fn();
const jobsFn = vi.fn();
const retryFn = vi.fn();
const deleteJobFn = vi.fn();
const cleanupJobsFn = vi.fn();
const throttleFn = vi.fn();
const aliasesFn = vi.fn();
const countFn = vi.fn();

vi.mock('../composables/confirm', () => ({
  askConfirm: (...a: any[]) => askConfirmFn(...a),
}));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      aliases: (...a: any[]) => aliasesFn(...a),
      count: (...a: any[]) => countFn(...a),
      adhoc: {
        ...actual.api.adhoc,
        prepare: (...a: any[]) => prepareFn(...a),
        status: (...a: any[]) => statusFn(...a),
        jobs: (...a: any[]) => jobsFn(...a),
        retry: (...a: any[]) => retryFn(...a),
        deleteJob: (...a: any[]) => deleteJobFn(...a),
        cleanupJobs: (...a: any[]) => cleanupJobsFn(...a),
        throttle: (...a: any[]) => throttleFn(...a),
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
const copiedTexts: string[] = [];
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: async (t: string) => { copiedTexts.push(t); return true; } };
});

import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const AWAIT_JOB = {
  jobId: 'await-9', logicalName: 'bond_index', aliasMode: true, strategy: 'WRITE_BLOCK', status: 'RUNNING',
  stage: 'AWAIT_CONFIRM', awaitConfirmSince: Date.now() - 60_000, startedAt: Date.now() - 120_000,
  sourcePhysical: 'bond_v1', destPhysical: 'bond_v2', currentTaskId: null,
};
const FAILED_JOB = {
  jobId: 'fail-9', logicalName: 'bond_index', aliasMode: true, strategy: 'INCREMENTAL', timeField: 'ts',
  status: 'FAILED', stage: 'DONE', error: 'reindex 失败', startedAt: 1700000000000, finishedAt: 1700000009000,
  sourcePhysical: 'bond_v1', destPhysical: 'bond_v2', sourceDocCount: 100, destDocCount: 100,
  currentTaskId: 'n1:7',
  failures: [
    { type: 'map_document_exception', reason: '字段类型冲突', index: 'bond_v2', id: 'doc-1' },
    { type: 'map_document_exception', reason: '字段类型冲突', index: 'bond_v2', id: 'doc-2' },
  ],
};

async function mountAR(opts: { jobs?: any[]; status?: any; query?: Record<string, string>; statusImpl?: () => any } = {}) {
  jobsFn.mockResolvedValue(opts.jobs ?? []);
  statusFn.mockImplementation(opts.statusImpl || (async () => (opts.status ?? AWAIT_JOB)));
  cleanupJobsFn.mockResolvedValue({ deleted: 2 });
  aliasesFn.mockReset().mockResolvedValue([
    { alias: 'bond_index', index: 'bond_v2', isWriteIndex: true },
    { alias: 'bond_index', index: 'bond_v1', isWriteIndex: false },
  ]);
  /* 完成校验活取 _count 的默认口径：不可达（等价宿主失联/无权限），视图回落快照比对 */
  countFn.mockReset().mockRejectedValue(new Error('count 请求失败'));
  const View = (await import('../views/AdhocRebuildView.vue')).default;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/adhoc-rebuild', component: { template: '<div/>' } },
      { path: '/search', component: { template: '<div/>' } },
      { path: '/indices', component: { template: '<div/>' } },
      { path: '/tasks', component: { template: '<div/>' } },
      { path: '/aliases', component: { template: '<div/>' } },
      { path: '/health-report', component: { template: '<div/>' } },
    ],
  });
  await router.push(opts.query ? { path: '/adhoc-rebuild', query: opts.query } : '/');
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
  return { host, router };
}

function btnByText(host: ParentNode, label: string): HTMLButtonElement {
  const btn = [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find(b => (b.textContent || '').trim() === label);
  if (!btn) throw new Error('button not found: ' + label);
  return btn;
}

/** 从最近作业表 Eye 钮进入指定作业的执行监控步（真实用户路径） */
async function openMonitorStep(host: HTMLElement, jobRow: any) {
  const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
  const row = rows.find(tr => (tr.textContent || '').includes(jobRow.jobId));
  expect(row, '最近作业表必须渲染出该作业行').toBeTruthy();
  (row!.querySelector('button[title="查看任务详情"]') as HTMLButtonElement).click();
  await settle(10);
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  copiedTexts.length = 0;
  askConfirmFn.mockReset().mockImplementation(() => Promise.resolve(true));
  prepareFn.mockReset().mockResolvedValue({
    index: 'bond_index', isAlias: true, physicals: ['bond_v1'], sourcePhysical: 'bond_v1', docCount: 12345,
    settingsJson: '{}', mappingJson: '{"properties":{"a":{"type":"keyword"}}}',
    suggestedDest: 'bond_v2', timeFieldCandidates: [{ field: 'ts', type: 'date' }],
  });
  statusFn.mockReset();
  jobsFn.mockReset();
  retryFn.mockReset();
  deleteJobFn.mockReset();
  cleanupJobsFn.mockReset();
  throttleFn.mockReset();
  countFn.mockReset();
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('视图：确认门倒计时（gateDeadlineMs）', () => {
  it('有截止字段：渲染剩余倒计时；最后 5 分钟转紧急红态', { timeout: 20000 }, async () => {
    const { host } = await mountAR({
      jobs: [AWAIT_JOB], status: { ...AWAIT_JOB, gateDeadlineMs: Date.now() + 10 * 60 * 1000 },
    });
    await openMonitorStep(host, AWAIT_JOB);
    const left = host.querySelector('[data-test="adhoc-gate-left"]')!;
    expect(left, '倒计时在场').toBeTruthy();
    expect(left.textContent).toContain('确认门剩余');
    expect(left.textContent).toMatch(/9:\d\d|10:0\d/);
    expect(left.className).not.toContain('urgent');
    apps.pop()!.unmount();
    document.body.innerHTML = '';
    const h2 = (await mountAR({
      jobs: [AWAIT_JOB], status: { ...AWAIT_JOB, gateDeadlineMs: Date.now() + 3 * 60 * 1000 },
    })).host;
    await openMonitorStep(h2, AWAIT_JOB);
    const urgent = h2.querySelector('[data-test="adhoc-gate-left"]')!;
    expect(urgent.className).toContain('urgent');
    expect(urgent.textContent).toContain('请尽快决策');
  });

  it('字段缺席（旧后端）：不渲染倒计时，正计时横幅保持', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ jobs: [AWAIT_JOB], status: AWAIT_JOB });
    await openMonitorStep(host, AWAIT_JOB);
    expect(host.querySelector('[data-test="adhoc-gate-left"]')).toBeNull();
    expect(host.textContent).toContain('已阻断');
  });
});

describe('视图：一键重跑（监控卡 + 历史表行）', () => {
  it('FAILED 作业监控卡重跑：调 retry 端点后留在监控态（job 区常驻）', { timeout: 20000 }, async () => {
    retryFn.mockResolvedValue({ ...FAILED_JOB, status: 'RUNNING', stage: 'FULL_REINDEX', error: null, currentProgress: { total: 100, created: 40 } });
    const { host } = await mountAR({ jobs: [FAILED_JOB], status: FAILED_JOB });
    await openMonitorStep(host, FAILED_JOB);
    const retry = host.querySelector<HTMLButtonElement>('[data-test="adhoc-retry"]')!;
    expect(retry).toBeTruthy();
    expect(host.querySelector('[data-test="adhoc-retry-hint"]')!.textContent).toContain('增量重跑');
    /* 2026-11-21 对账批随迁：重跑先开参数覆盖弹层；空覆盖提交保持单参 retry 请求形态 */
    retry.click();
    await settle(6);
    expect(retryFn).not.toHaveBeenCalled();
    (document.querySelector<HTMLButtonElement>('[data-test="ar-retry-go"]'))!.click();
    await settle(10);
    expect(retryFn).toHaveBeenCalledWith('fail-9');
    /* 回包 RUNNING：监控态常驻（probe 区源→目标行在场），重跑钮随 RUNNING 退场 */
    expect(host.textContent).toContain('bond_v1');
    expect(host.textContent).toContain('bond_v2');
    expect(host.querySelector('[data-test="adhoc-retry"]'), 'RUNNING 后重跑钮退场').toBeNull();
  });

  it('历史表 FAILED 行渲染重跑钮并调 retry；SUCCEEDED 行不渲染', { timeout: 20000 }, async () => {
    const okJob = { ...FAILED_JOB, jobId: 'ok-1', status: 'SUCCEEDED', error: null, failures: undefined };
    retryFn.mockResolvedValue({ ...FAILED_JOB, status: 'RUNNING' });
    const { host } = await mountAR({ jobs: [FAILED_JOB, okJob], status: FAILED_JOB });
    const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
    const failRow = rows.find(tr => (tr.textContent || '').includes('fail-9'))!;
    (failRow.querySelector('button[aria-label="重跑作业"]') as HTMLButtonElement).click();
    await settle(6);
    (document.querySelector<HTMLButtonElement>('[data-test="ar-retry-go"]'))!.click();
    await settle(10);
    expect(retryFn).toHaveBeenCalledWith('fail-9');
    const okRow = rows.find(tr => (tr.textContent || '').includes('ok-1'))!;
    expect(okRow.querySelector('button[aria-label="重跑作业"]')).toBeNull();
  });
});

describe('视图：完成校验闭环（SUCCEEDED）', () => {
  const okJob = (over: Record<string, any> = {}) => ({ ...FAILED_JOB, jobId: 'ok-9', status: 'SUCCEEDED', error: null, failures: undefined, currentTaskId: null, ...over });

  it('文档数一致 + 别名指向目标：双绿徽标，无排查指引', { timeout: 20000 }, async () => {
    const job = okJob();
    const { host } = await mountAR({ jobs: [job], status: job });
    await openMonitorStep(host, job);
    (host.querySelector<HTMLButtonElement>('[data-test="adhoc-verify-run"]'))!.click();
    await settle(10);
    expect(aliasesFn).toHaveBeenCalled();
    const box = host.querySelector('[data-test="adhoc-verify"]')!;
    expect(box.textContent).toContain('一致');
    expect(box.textContent).toContain('别名已指向目标索引');
    expect(host.querySelector('[data-test="adhoc-verify-guide"]')).toBeNull();
  });

  it('文档数不一致 + 别名未指向目标：红徽标 + 排查指引在场', { timeout: 20000 }, async () => {
    const job = okJob({ destDocCount: 92, finishedAt: 1700000009000 });
    aliasesFn.mockResolvedValue([{ alias: 'bond_index', index: 'bond_v1', isWriteIndex: true }]);
    const { host } = await mountAR({ jobs: [job], status: job });
    await openMonitorStep(host, job);
    (host.querySelector<HTMLButtonElement>('[data-test="adhoc-verify-run"]'))!.click();
    await settle(10);
    const box = host.querySelector('[data-test="adhoc-verify"]')!;
    expect(box.textContent).toContain('不一致');
    expect(box.textContent).toContain('别名未指向目标索引');
    expect(host.querySelector('[data-test="adhoc-verify-guide"]')!.textContent).toContain('排查指引');
  });

  it('直连模式：别名行如实说明无别名可核对', { timeout: 20000 }, async () => {
    const job = okJob({ aliasMode: false, logicalName: 'bond_v1' });
    const { host } = await mountAR({ jobs: [job], status: job });
    await openMonitorStep(host, job);
    (host.querySelector<HTMLButtonElement>('[data-test="adhoc-verify-run"]'))!.click();
    await settle(10);
    const box = host.querySelector('[data-test="adhoc-verify"]')!;
    expect(box.textContent).toContain('直连模式：无别名指向可核对');
    expect(aliasesFn).not.toHaveBeenCalled();
  });
});

describe('视图：taskId 联动深链', () => {
  it('currentTaskId 在场：chip 显示并点击跳 /tasks?taskId=', { timeout: 20000 }, async () => {
    const job = { ...FAILED_JOB };
    const { host, router } = await mountAR({ jobs: [job], status: job });
    await openMonitorStep(host, job);
    const link = host.querySelector<HTMLButtonElement>('[data-test="adhoc-task-link"]')!;
    expect(String(link.textContent || '').trim()).toBe('n1:7');
    link.click();
    await settle(20);
    await new Promise(r => setTimeout(r, 20));
    await settle(8);
    expect(router.currentRoute.value.path).toBe('/tasks');
    expect(router.currentRoute.value.query.taskId).toBe('n1:7');
  });
});

describe('视图：失败处置动作（复制 id / 回补 query）', () => {
  it('复制全部失败 doc id：copyText 收到逐行 id 列表', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ jobs: [FAILED_JOB], status: FAILED_JOB });
    await openMonitorStep(host, FAILED_JOB);
    const btn = host.querySelector<HTMLButtonElement>('[data-test="ar-failure-copy-ids"]')!;
    expect(btn.disabled).toBe(false);
    btn.click();
    await settle(8);
    expect(copiedTexts[copiedTexts.length - 1]).toBe('doc-1\ndoc-2');
  });

  it('有 timeField：生成回补 query 并复制（失败窗口 range + op_type=create）；无 timeField 禁用并说明', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ jobs: [FAILED_JOB], status: FAILED_JOB });
    await openMonitorStep(host, FAILED_JOB);
    const btn = host.querySelector<HTMLButtonElement>('[data-test="ar-failure-backfill"]')!;
    expect(btn.disabled).toBe(false);
    btn.click();
    await settle(8);
    const dsl = copiedTexts[copiedTexts.length - 1]!;
    expect(dsl).toContain('POST _reindex');
    expect(dsl).toContain('"index": "bond_v1"');
    expect(dsl).toContain('"ts"');
    expect(dsl).toContain('"op_type": "create"');
    apps.pop()!.unmount();
    document.body.innerHTML = '';
    const noTf = { ...FAILED_JOB, timeField: null };
    const h2 = (await mountAR({ jobs: [noTf], status: noTf })).host;
    await openMonitorStep(h2, noTf);
    const disabled = h2.querySelector<HTMLButtonElement>('[data-test="ar-failure-backfill"]')!;
    expect(disabled.disabled).toBe(true);
    expect(disabled.title).toContain('无时间字段');
  });
});

describe('视图：?jobId= 深链', () => {
  it('命中作业：直接进入该作业监控步（不再走向导裁决），query 用后即清', { timeout: 20000 }, async () => {
    const { host, router } = await mountAR({ jobs: [AWAIT_JOB], status: { ...AWAIT_JOB, gateDeadlineMs: Date.now() + 600_000 }, query: { jobId: 'await-9' } });
    await settle(12);
    expect(host.textContent).toContain('执行监控');
    expect(host.textContent).toContain('await-9');
    expect(router.currentRoute.value.query.jobId).toBeUndefined();
  });

  it('作业不在清单：呈现「作业不存在或已清理」空态（不踢回向导）', { timeout: 20000 }, async () => {
    const { host } = await mountAR({
      jobs: [], query: { jobId: 'missing-1' },
      statusImpl: async () => { throw new Error('作业不存在：missing-1'); },
    });
    await settle(12);
    const miss = host.querySelector('[data-test="adhoc-deeplink-miss"]')!;
    expect(miss, '空态在场').toBeTruthy();
    expect(miss.textContent).toContain('作业不存在或已清理');
    (miss.querySelector('button') as HTMLButtonElement).click();
    await settle(8);
    expect(host.textContent).toContain('选择要重建的逻辑索引名');
  });
});

describe('视图：历史治理（行删除 + 批量清理）', () => {
  it('终态行删除钮：确认后调 deleteJob 并刷新；进行中行禁用并说明', { timeout: 20000 }, async () => {
    const running = { ...FAILED_JOB, jobId: 'run-9', status: 'RUNNING', stage: 'FULL_REINDEX', finishedAt: null, error: null };
    deleteJobFn.mockResolvedValue(undefined);
    jobsFn.mockResolvedValue([FAILED_JOB, running]);
    const { host } = await mountAR({ jobs: [FAILED_JOB, running], status: FAILED_JOB });
    const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
    const failRow = rows.find(tr => (tr.textContent || '').includes('fail-9'))!;
    (failRow.querySelector('button[aria-label="删除记录"]') as HTMLButtonElement).click();
    await settle(10);
    expect(deleteJobFn).toHaveBeenCalledWith('fail-9');
    const runRow = rows.find(tr => (tr.textContent || '').includes('run-9'))!;
    const del = runRow.querySelector<HTMLButtonElement>('button[aria-label="删除记录"]')!;
    expect(del.disabled).toBe(true);
    expect(del.title).toContain('作业进行中');
  });

  it('表头清理钮：确认后调 cleanupJobs(7) 并提示清理条数', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ jobs: [FAILED_JOB], status: FAILED_JOB });
    const btn = host.querySelector<HTMLButtonElement>('[data-test="adhoc-cleanup"]')!;
    expect(btn.textContent).toContain('清理 7 天前');
    btn.click();
    await settle(10);
    expect(cleanupJobsFn).toHaveBeenCalledWith(7);
  });
});

describe('视图：动态调速控件', () => {
  it('reindex 执行段：档位+应用钮可用，调速成功回显当前速率', { timeout: 20000 }, async () => {
    const job = { ...FAILED_JOB, jobId: 'run-8', status: 'RUNNING', stage: 'CATCHUP', error: null, finishedAt: null, requestsPerSecond: null };
    throttleFn.mockResolvedValue({ ...job, requestsPerSecond: 50 });
    const { host } = await mountAR({ jobs: [job], status: job });
    await openMonitorStep(host, job);
    const area = host.querySelector('[data-test="adhoc-throttle"]')!;
    expect(area.textContent).toContain('当前 不限速');
    const apply = host.querySelector<HTMLButtonElement>('[data-test="adhoc-throttle-apply"]')!;
    expect(apply.disabled).toBe(false);
    apply.click();
    await settle(10);
    expect(throttleFn).toHaveBeenCalledWith('run-8', 200);
    expect(host.querySelector('[data-test="adhoc-throttle"]')!.textContent).toContain('当前 50/s');
  });

  it('非 reindex 阶段（AWAIT_CONFIRM）：应用钮禁用并说明原因', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ jobs: [AWAIT_JOB], status: AWAIT_JOB });
    await openMonitorStep(host, AWAIT_JOB);
    const apply = host.querySelector<HTMLButtonElement>('[data-test="adhoc-throttle-apply"]')!;
    expect(apply.disabled).toBe(true);
    expect(host.querySelector('[data-test="adhoc-throttle"]')!.textContent).toContain('非 reindex 执行段不可调速');
  });
});

/* ══════════════ 监控体验升级（轮次耗时 / 中止语义 / 轮询警示 / 重挂 / 跨板块联动 / 活取校验） ══════════════ */

const RUNNING_JOB = {
  jobId: 'run-live-1', logicalName: 'bond_index', aliasMode: true, strategy: 'INCREMENTAL',
  timeField: 'ts', status: 'RUNNING', stage: 'FULL_REINDEX', startedAt: Date.now() - 60_000,
  sourcePhysical: 'bond_v1', destPhysical: 'bond_v2', currentTaskId: 'n1:5',
  currentProgress: { total: 1000, created: 400 },
};
const CATCHUP_JOB = {
  jobId: 'catch-1', logicalName: 'bond_index', aliasMode: true, strategy: 'INCREMENTAL',
  timeField: 'ts', status: 'RUNNING', stage: 'CATCHUP', startedAt: Date.now() - 60_000,
  sourcePhysical: 'bond_v1', destPhysical: 'bond_v2', currentTaskId: 'n1:3',
  rounds: [
    { round: 1, phase: 'FULL', total: 100, created: 90, updated: 5, versionConflicts: 2, roundTookMs: 7200000 },
    { round: 2, phase: 'CATCHUP', total: 20, created: 7, updated: 3, versionConflicts: 1, tookMs: 4500 },
  ],
};

describe('视图：轮次耗时列与追平轮 pill', () => {
  it('轮次表新增耗时列：服务端 roundTookMs / 浏览器 tookMs 双字段兜底，TookBadge 语义档', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ jobs: [CATCHUP_JOB], status: CATCHUP_JOB });
    await openMonitorStep(host, CATCHUP_JOB);
    const tbl = host.querySelector('table.ar-rounds')!;
    expect([...tbl.querySelectorAll('thead th')].map(th => (th.textContent || '').trim()))
      .toEqual(['轮次', '阶段', '总计', '已建', '已更新', '冲突跳过', '耗时']);
    const took = [...tbl.querySelectorAll('[data-test="ar-round-took"]')];
    expect(took.length).toBe(2);
    expect(took[0].textContent).toContain('7200.0s');
    expect(took[1].textContent).toContain('4.5s');
  });

  it('CATCHUP 阶段 pill 旁补「第 N/3 轮」（N 取 rounds.length）', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ jobs: [CATCHUP_JOB], status: CATCHUP_JOB });
    await openMonitorStep(host, CATCHUP_JOB);
    const pill = host.querySelector('[data-test="adhoc-catchup-round"]')!;
    expect(pill, '追平轮 pill 在场').toBeTruthy();
    expect(pill.textContent).toContain('第 2/3 轮');
  });

  it('轮次行右键 TSV 复制同步带耗时列', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ jobs: [CATCHUP_JOB], status: CATCHUP_JOB });
    await openMonitorStep(host, CATCHUP_JOB);
    const row = host.querySelector('table.ar-rounds tbody tr')!;
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }));
    await new Promise(r => setTimeout(r, 40));
    const item = [...document.querySelectorAll('.ccm-it')].find(b => b.getAttribute('data-key') === 'round-copy-row') as HTMLButtonElement;
    expect(item, '右键菜单含「复制第 N 轮数据（TSV）」').toBeTruthy();
    item.click();
    await settle(8);
    expect(copiedTexts[copiedTexts.length - 1]).toContain('\t7200000');
  });
});

describe('视图：中止钮语义与切换后守卫', () => {
  it('中止钮 title 与确认窗同源：目标索引与已迁移数据保留、可重跑续接', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ jobs: [CATCHUP_JOB], status: CATCHUP_JOB });
    await openMonitorStep(host, CATCHUP_JOB);
    const abort = btnByText(host, '中止');
    expect(abort.title).toContain('目标索引与已迁移数据保留');
    expect(abort.title).toContain('可重跑续接');
    expect(abort.title, '旧「删除半成品/回滚/数据丢弃」说法不得回潮').not.toContain('删除半成品');
    expect(abort.disabled).toBe(false);
  });

  it('FINAL_CATCHUP / FINALIZE 阶段：中止钮禁用并说明「切换已确认，无法中止」', { timeout: 20000 }, async () => {
    for (const stage of ['FINAL_CATCHUP', 'FINALIZE']) {
      const job = { ...CATCHUP_JOB, stage, rounds: undefined };
      const { host } = await mountAR({ jobs: [job], status: job });
      await openMonitorStep(host, job);
      const abort = btnByText(host, '中止');
      expect(abort.disabled, stage + ' 阶段中止钮必须禁用').toBe(true);
      expect(abort.title).toContain('切换已确认，无法中止');
      apps.pop()!.unmount();
      document.body.innerHTML = '';
    }
  });
});

describe('视图：轮询失败黄条', () => {
  it('连续失败 ≥3 次出黄条（次数 + 上次成功时刻 + 数据可能已过期），成功即清零', { timeout: 20000 }, async () => {
    vi.useFakeTimers();
    try {
      let fail = false;
      const { host } = await mountAR({
        jobs: [RUNNING_JOB],
        statusImpl: async () => {
          if (fail) throw new Error('status 请求失败');
          return RUNNING_JOB;
        },
      });
      await openMonitorStep(host, RUNNING_JOB);
      await vi.advanceTimersByTimeAsync(2500); /* 首拍成功：记录上次成功时刻 */
      expect(host.querySelector('[data-test="adhoc-poll-stale"]')).toBeNull();
      fail = true;
      await vi.advanceTimersByTimeAsync(6500); /* 连续 3 拍失败 */
      const bar = host.querySelector('[data-test="adhoc-poll-stale"]')!;
      expect(bar, '连续失败 ≥3 次黄条在场').toBeTruthy();
      expect(bar.textContent).toContain('状态刷新失败 3 次');
      expect(bar.textContent).toContain('上次成功');
      expect(bar.textContent).toContain('数据可能已过期');
      fail = false;
      await vi.advanceTimersByTimeAsync(2500); /* 任一拍成功即清零 */
      expect(host.querySelector('[data-test="adhoc-poll-stale"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('视图：重挂提示放宽', () => {
  it('刷新后落在 step3（确认预览）同样可见重挂入口；回到监控步（step4）后收起', { timeout: 20000 }, async () => {
    sessionStorage.setItem('esquerystudio.draft2:adhoc:host:-:-:step', '3');
    const { host } = await mountAR({ jobs: [RUNNING_JOB], status: RUNNING_JOB });
    const hint = host.querySelector('[data-test="adhoc-reattach-hint"]')!;
    expect(hint, 'step3 也在重挂提示范围').toBeTruthy();
    (host.querySelector('[data-test="adhoc-reattach-go"]') as HTMLButtonElement).click();
    await settle(12);
    expect(host.querySelector('[data-test="adhoc-reattach-hint"]'), '切回监控步后收起').toBeNull();
  });
});

describe('视图：SUCCEEDED 跨板块联动', () => {
  const okLinkJob = (over: Record<string, any> = {}) => ({
    ...FAILED_JOB, jobId: 'ok-link-1', status: 'SUCCEEDED', error: null, failures: undefined,
    currentTaskId: null, ...over,
  });

  it('dest 物理名旁挂索引工作区芯片（gotoIdx 同款）；「查看健康报告」入口跳 /health-report', { timeout: 20000 }, async () => {
    const job = okLinkJob();
    const { host, router } = await mountAR({ jobs: [job], status: job });
    await openMonitorStep(host, job);
    const chip = host.querySelector<HTMLButtonElement>('[data-test="adhoc-dest-goto"]')!;
    expect(chip, 'dest 物理名旁索引工作区芯片在场').toBeTruthy();
    expect(chip.getAttribute('aria-label')).toContain('bond_v2');
    chip.click();
    await settle(8);
    await new Promise(r => setTimeout(r, 20));
    await settle(8);
    expect(router.currentRoute.value.path).toBe('/indices');
    expect(router.currentRoute.value.query.idx).toBe('bond_v2');
    const health = host.querySelector<HTMLButtonElement>('[data-test="adhoc-health-link"]')!;
    expect(health, '查看健康报告入口在场').toBeTruthy();
    health.click();
    await settle(8);
    await new Promise(r => setTimeout(r, 20));
    await settle(8);
    expect(router.currentRoute.value.path).toBe('/health-report');
  });

  it('排查指引中「别名管理页」是 /aliases 路由链接', { timeout: 20000 }, async () => {
    const job = okLinkJob({ destDocCount: 92 });
    aliasesFn.mockResolvedValue([{ alias: 'bond_index', index: 'bond_v1', isWriteIndex: true }]);
    const { host, router } = await mountAR({ jobs: [job], status: job });
    await openMonitorStep(host, job);
    (host.querySelector<HTMLButtonElement>('[data-test="adhoc-verify-run"]'))!.click();
    await settle(10);
    const guide = host.querySelector('[data-test="adhoc-verify-guide"]')!;
    expect(guide).toBeTruthy();
    const link = guide.querySelector('[data-test="adhoc-verify-aliases-link"]') as HTMLAnchorElement;
    expect(link, '别名管理页路由链接在场').toBeTruthy();
    link.click();
    await settle(8);
    await new Promise(r => setTimeout(r, 20));
    await settle(8);
    expect(router.currentRoute.value.path).toBe('/aliases');
  });
});

describe('视图：完成校验活取 _count', () => {
  const okLiveJob = (over: Record<string, any> = {}) => ({
    ...FAILED_JOB, jobId: 'ok-live-9', status: 'SUCCEEDED', error: null, failures: undefined,
    currentTaskId: null, ...over,
  });
  /* mountAR 内部会把 countFn 复位为默认拒绝（不可达），活取口径须在挂载后装配 */
  const runVerify = async (job: any, setupCount?: () => void) => {
    const { host } = await mountAR({ jobs: [job], status: job });
    setupCount?.();
    await openMonitorStep(host, job);
    (host.querySelector<HTMLButtonElement>('[data-test="adhoc-verify-run"]'))!.click();
    await settle(12);
    return host.querySelector('[data-test="adhoc-verify"]')!;
  };

  it('源/目标各活取一次 _count：活口径为主出结论，快照降级为参考行', { timeout: 20000 }, async () => {
    const box = await runVerify(okLiveJob({ destDocCount: 92 }), () => {
      countFn.mockImplementation(async () => ({ count: 100 }));
    });
    expect(countFn).toHaveBeenCalledWith('bond_v1', expect.any(String));
    expect(countFn).toHaveBeenCalledWith('bond_v2', expect.any(String));
    expect(box.textContent).toContain('实取 _count');
    expect(box.textContent).toContain('快照参考');
    expect(box.textContent).toContain('一致');
    expect(box.querySelector('[data-test="adhoc-verify-guide"]'), '活口径一致 + 别名正常 → 无排查指引').toBeNull();
  });

  it('活取不一致：红徽标 + 排查指引在场', { timeout: 20000 }, async () => {
    const box = await runVerify(okLiveJob(), () => {
      countFn.mockImplementation(async (index: string) => ({ count: index === 'bond_v2' ? 92 : 100 }));
    });
    expect(box.textContent).toContain('不一致');
    expect(box.querySelector('[data-test="adhoc-verify-guide"]')).toBeTruthy();
  });

  it('源索引已删：如实标注「源已删，仅快照可比」，快照口径承担比对', { timeout: 20000 }, async () => {
    const box = await runVerify(okLiveJob(), () => {
      countFn.mockImplementation(async (index: string) => {
        if (index === 'bond_v1') throw new Error('index_not_found_exception');
        return { count: 100 };
      });
    });
    expect(box.textContent).toContain('源已删，仅快照可比');
    expect(box.textContent).toContain('一致');
    expect(box.textContent).not.toContain('实取 _count');
  });

  it('活取不可达（未知失败）：回落快照口径，不冒充实取读数', { timeout: 20000 }, async () => {
    const box = await runVerify(okLiveJob({ destDocCount: 92 }), () => {
      countFn.mockRejectedValue(new Error('connection refused'));
    });
    expect(box.textContent).toContain('不一致');
    expect(box.textContent).not.toContain('实取 _count');
    expect(box.textContent).not.toContain('源已删');
  });
});

describe('视图：最近作业表随监控轮询自动刷新', () => {
  it('监控轮询期间每 ~30s 附带刷新一次作业清单（并行作业 stage/耗时不再停更）', { timeout: 20000 }, async () => {
    vi.useFakeTimers();
    try {
      const { host } = await mountAR({ jobs: [RUNNING_JOB], status: RUNNING_JOB });
      await openMonitorStep(host, RUNNING_JOB);
      const before = jobsFn.mock.calls.length;
      await vi.advanceTimersByTimeAsync(31000);
      expect(jobsFn.mock.calls.length, '30s 后作业清单被再次拉取').toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('源码锁：策略控件 naive 化（旧原生形态防回潮）', () => {
  const src = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');

  it('radio ×3 → NRadioGroup/NRadio；number ×3 → NInputNumber；checkbox → NCheckbox', () => {
    expect(src).toContain('<n-radio-group v-model:value="strategy"');
    expect(src.match(/<n-radio value=/g)?.length).toBe(3);
    expect(src).not.toContain('<input type="radio"');
    expect(src).toContain('<n-input-number v-model:value="bufferMsModel"');
    expect(src).toContain('v-model:value="tuningRpsModel"');
    expect(src).toContain('v-model:value="tuningSlicesModel"');
    expect(src).not.toContain('v-model.number="bufferMs"');
    expect(src).toContain('<n-checkbox v-model:checked="deleteOldIndex"');
    expect(src).not.toContain('type="checkbox"');
    /* INCREMENTAL 无时间字段候选时的禁用态逻辑保留 */
    expect(src).toMatch(/<n-radio value="INCREMENTAL" :disabled="!prep\?\.timeFieldCandidates\?\.length"/);
  });

  it('策略步直连边界警示在场（不静默降级）；门超时语义进入承诺文案', () => {
    expect(src).toContain('data-test="ar-direct-swap-warn"');
    expect(src).toContain('直连物理索引模式的切换边界');
    expect(src).toContain('30 分钟未确认');
  });
});
