/**
 * 五百三十三批工蚁 D（可观测/进度可见/错误链）看守 spec。
 *
 *  ① SlmView 自动刷新：310 批范式源码锁 + 行为锁（mock timer——开关 ON 立即拉一轮、
 *    按 30s 周期轮询、OFF 即停；guard 用现有 loading 态防重入）；
 *  ② SnapshotsView 行内进度：mock summary 形状 → 总 pct 进度条 + 每索引 stage 计数
 *    （FAILURE 红档）渲染、非进行中行不请求；in-flight guard 防重叠；红线源码锁
 *    （不新开定时器/搭车 loadSnapshots finally/卸载作废代号）；
 *  ③ ApiError code 透传（api.headers.spec 同构：stub fetch 出口断异常对象）；
 *  ④ errPre code 徽标 + 「失败于 endpoint」顶部行（meta 值转义；缺省不显兼容旧后端）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { errPreHtml } from '../utils/errPre';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const slmSrc = read('../views/SlmView.vue');
const snapSrc = read('../views/SnapshotsView.vue');
const apiSrc = read('../api.ts');

/* ── 共享 api mock 面：vi.hoisted 持 vi.fn（模块 mock 每文件一份） ── */
const mocks = vi.hoisted(() => ({
  slmPolicies: vi.fn(),
  slmStatus: vi.fn(),
  snapshotRepos: vi.fn(),
  snapshotList: vi.fn(),
  snapshotStatusSummary: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      slmPolicies: mocks.slmPolicies,
      slmStatus: mocks.slmStatus,
      snapshotRepos: mocks.snapshotRepos,
      snapshotList: mocks.snapshotList,
      snapshotStatusSummary: mocks.snapshotStatusSummary,
    },
  };
});

import SlmView from '../views/SlmView.vue';
import SnapshotsView from '../views/SnapshotsView.vue';

const settle = async (n = 12) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountView(View: any) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(View) });
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

/* ═══ SlmView 场景 mock 默认值 ═══ */
const SLM_POLICY = {
  nightly: {
    policy: { repository: 'r1', schedule: '0 30 1 * * ?', config: { indices: ['idx-a'] } },
    last_success: { time: 1700000000000 },
    next_execution_millis: 1800000000000,
  },
};
const SLM_STATUS = {
  status: { operation_mode: 'RUNNING' },
  stats: { total_snapshots_taken: 3, total_snapshots_failed: 0, retention_runs: 1, retention_deletion_time_millis: 42 },
};

/* ═══ SnapshotsView 场景 mock 默认值（Lead 契约固定的 summary 形状） ═══ */
const SNAP_LIST = [
  { snapshot: 'snap-done', state: 'SUCCESS', start_time_in_millis: 1, duration_in_millis: 5, indices: ['idx-done'], shards: { total: 2, successful: 2, failed: 0 } },
  { snapshot: 'snap-run', state: 'IN_PROGRESS', start_time_in_millis: 2, indices: ['idx-a', 'idx-b'] },
  { snapshot: 'snap-fail', state: 'FAILED', start_time_in_millis: 3, indices: ['idx-f'] },
];
const SUMMARY = {
  repository: 'repo1',
  snapshot: 'snap-run',
  state: 'IN_PROGRESS',
  startTimeMillis: 2,
  shardsStats: { total: 8, done: 5, failed: 1 },
  pct: 40,
  indices: [
    { index: 'idx-a', shardsTotal: 5, shardsDone: 4, shardsFailed: 0, stageCounts: { INIT: 0, STARTED: 1, START: 0, FINALIZE: 0, DONE: 4, FAILURE: 0 } },
    { index: 'idx-b', shardsTotal: 3, shardsDone: 1, shardsFailed: 1, stageCounts: { INIT: 0, STARTED: 1, START: 0, FINALIZE: 0, DONE: 0, FAILURE: 1 } },
  ],
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  [mocks.slmPolicies, mocks.slmStatus, mocks.snapshotRepos, mocks.snapshotList, mocks.snapshotStatusSummary].forEach(f => f.mockReset());
  mocks.slmPolicies.mockResolvedValue(SLM_POLICY);
  mocks.slmStatus.mockResolvedValue(SLM_STATUS);
  mocks.snapshotRepos.mockResolvedValue([{ name: 'repo1', type: 'fs' }]);
  mocks.snapshotList.mockResolvedValue(SNAP_LIST);
});

const apps: ReturnType<typeof createApp>[] = [];
afterEach(() => {
  vi.useRealTimers();
  apps.splice(0).forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
});

/* ══════════ ① SlmView 自动刷新（五百三十三批） ══════════ */
describe('① SlmView 自动刷新（310 批同构接线 + mock timer 行为）', () => {
  it('源码锁：useAutoRefresh 接线（ms 读 slmIntervalMs 偏好、guard 验 loading）、偏好键记忆、无裸 setInterval', () => {
    expect(slmSrc).toMatch(/useAutoRefresh\(/);
    expect(slmSrc).toContain('slmIntervalMs.value');
    expect(slmSrc).toMatch(/guard: \(\) => !loading\.value/);
    expect(slmSrc).not.toMatch(/setInterval\(/);
    expect(slmSrc).toContain("'slm.autoRefresh'");
    expect(slmSrc).toContain("'slm.intervalMs'");
    expect(slmSrc).toMatch(/<AutoRefreshSelect v-if="slmAutoRefresh" v-model:ms="slmIntervalMs"/);
  });

  it('行为（mock timer）：开关 ON 立即拉一轮并按 30s 周期轮询；OFF 即停', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    const { app, host } = await mountView(SlmView);
    apps.push(app);
    const base = mocks.slmPolicies.mock.calls.length;
    expect(base).toBeGreaterThanOrEqual(1); /* onMounted 首拉 */
    const cb = host.querySelector('.slm-auto-lbl input[type="checkbox"]') as HTMLInputElement | null;
    expect(cb, '工具行应有自动刷新开关').toBeTruthy();
    cb!.checked = true;
    cb!.dispatchEvent(new Event('change'));
    await settle();
    const afterOn = mocks.slmPolicies.mock.calls.length;
    expect(afterOn).toBe(base + 1); /* 开关打开立即拉一轮 */
    expect(host.querySelector('.arf-sel'), '开关打开后出现 AutoRefreshSelect 统一件').toBeTruthy();
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.slmPolicies.mock.calls.length).toBe(afterOn + 1); /* 一个周期恰一轮 */
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.slmPolicies.mock.calls.length).toBe(afterOn + 2);
    cb!.checked = false;
    cb!.dispatchEvent(new Event('change'));
    await settle();
    const afterOff = mocks.slmPolicies.mock.calls.length;
    await vi.advanceTimersByTimeAsync(90000);
    expect(mocks.slmPolicies.mock.calls.length).toBe(afterOff); /* 关后零轮询 */
  });
});

/* ══════════ ② SnapshotsView 行内进度（五百三十三批） ══════════ */
describe('② SnapshotsView 行内进度（summary 搭车 + 红线）', () => {
  it('源码锁：不新开定时器、轮询仍挂既有 snapRefresher、in-flight guard、卸载作废代号、搭车点在 loadSnapshots', () => {
    expect(snapSrc).not.toMatch(/setInterval\(/);
    expect(snapSrc).toMatch(/const snapRefresher = useAutoRefresh\(loadSnapshots/);
    expect(snapSrc).toContain('progInFlight');
    expect(snapSrc).toMatch(/if \(seq !== progSeq\) return;/);
    expect(snapSrc).toContain('onBeforeUnmount(() => { progSeq++; });');
    expect(snapSrc).toContain('void loadSnapProgress();');
    expect(apiSrc).toMatch(/snapshotStatusSummary: \(repo: string, name: string\)/);
    expect(apiSrc).toContain('summary: true');
  });

  it('行为：进行中行请求 summary 并渲染 pct 条 + stage 计数（FAILURE 红档）；非进行中行不请求', async () => {
    mocks.snapshotStatusSummary.mockResolvedValue(SUMMARY);
    const { app, host } = await mountView(SnapshotsView);
    apps.push(app);
    expect(mocks.snapshotStatusSummary).toHaveBeenCalledTimes(1);
    expect(mocks.snapshotStatusSummary).toHaveBeenCalledWith('repo1', 'snap-run');
    const fill = host.querySelector('.sv-prog-fill') as HTMLElement | null;
    expect(fill, '进行中行应有总进度条').toBeTruthy();
    expect(fill!.getAttribute('style') || '').toMatch(/width:\s*40%/);
    expect(host.textContent).toContain('40%');
    expect(host.textContent).toContain('5/8 shards');
    expect(host.textContent).toContain('failed 1');
    expect(host.textContent).toContain('DONE 4');
    const failStage = host.querySelector('.sv-stage-fail');
    expect(failStage?.textContent).toContain('FAILURE 1');
    expect(host.querySelector('.sv-stage-zero')?.textContent).toContain('INIT 0');
  });

  it('行为：in-flight guard——摘要在途时再刷新不重叠下发，在途完成后照常写入', async () => {
    let resolveSummary!: (v: any) => void;
    mocks.snapshotStatusSummary.mockImplementation(() => new Promise<any>(res => { resolveSummary = res; }));
    const { app, host } = await mountView(SnapshotsView);
    apps.push(app);
    expect(mocks.snapshotStatusSummary).toHaveBeenCalledTimes(1); /* 首轮已发出（在途） */
    const btn = host.querySelector('button[aria-label="刷新快照列表"]') as HTMLButtonElement | null;
    expect(btn?.disabled).toBe(false); /* 列表已加载完（loading 复位），摘要在途 */
    btn!.click();
    await settle();
    expect(mocks.snapshotStatusSummary).toHaveBeenCalledTimes(1); /* 防重叠：第二轮跳过 */
    resolveSummary(SUMMARY);
    await settle();
    const fill = host.querySelector('.sv-prog-fill') as HTMLElement | null;
    expect(fill?.getAttribute('style') || '').toMatch(/width:\s*40%/); /* 在途完成照常写入 */
  });
});

/* ══════════ ③ ApiError code 透传（五百三十三批） ══════════ */
describe('③ ApiError code 透传（api.headers.spec 同构：stub fetch 出口）', () => {
  const catchErr = (p: Promise<unknown>) => p.then(() => { throw new Error('expected rejection'); }, (e: any) => e);

  afterEach(() => { vi.unstubAllGlobals(); });

  it('4xx body.code 随 ApiError 透传（LOCK_CONFLICT），message 不变', async () => {
    const { get: apiGet, ApiError } = await import('../api');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ code: 'LOCK_CONFLICT', message: '资源被锁' }), { status: 400 },
    )));
    const err = await catchErr(apiGet('/guarded-op'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe('LOCK_CONFLICT');
    expect(err.message).toBe('资源被锁');
  });

  it('CONN_FORBIDDEN 友好文案特判语义不丢，code 同时透传', async () => {
    const { get: apiGet, ApiError } = await import('../api');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ code: 'CONN_FORBIDDEN', required: 'ADMIN' }), { status: 403 },
    )));
    const err = await catchErr(apiGet('/cluster/health'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('CONN_FORBIDDEN');
    expect(err.message).toContain('无权访问该集群连接');
    expect(err.message).toContain('ADMIN');
  });

  it('200 + error 信封同样透传 code（ES_ERROR 多走此形态）', async () => {
    const { get: apiGet, ApiError } = await import('../api');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: true, code: 'ES_ERROR', message: 'boom' }), { status: 200 },
    )));
    const err = await catchErr(apiGet('/cluster/query'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('ES_ERROR');
    expect(err.message).toBe('boom');
  });

  it('body 无 code 时 err.code 为 undefined（兼容无码旧后端）', async () => {
    const { get: apiGet } = await import('../api');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ message: 'plain' }), { status: 500 },
    )));
    const err = await catchErr(apiGet('/x'));
    expect(err.status).toBe(500);
    expect(err.code).toBeUndefined();
  });
});

/* ══════════ ④ errPre code 徽标 + 失败端点行（五百三十三批） ══════════ */
describe('④ errPre code 徽标 + endpoint 顶部行', () => {
  it('有 code/endpoint：顶部 head 行含徽标与「失败于 …」，徽标在正文之前，正文转义不受影响', () => {
    const html = errPreHtml('boom <det>', { code: 'LOCK_CONFLICT', endpoint: 'GET /internal/es/console/x?y=1' });
    expect(html).toContain('class="ep-err-code"');
    expect(html).toContain('LOCK_CONFLICT');
    expect(html).toContain('class="ep-err-endpoint"');
    expect(html).toContain('失败于 GET /internal/es/console/x?y=1');
    expect(html).toContain('&lt;det&gt;'); /* 正文转义语义不变 */
    expect(html.indexOf('ep-err-head')).toBeLessThan(html.indexOf('boom')); /* 顶部 */
  });

  it('缺 code 不显徽标、缺 endpoint 不显「失败于」（兼容旧后端逐字段降级）', () => {
    const onlyCode = errPreHtml('e', { code: 'ES_ERROR' });
    expect(onlyCode).toContain('ep-err-code');
    expect(onlyCode).not.toContain('失败于');
    const onlyEp = errPreHtml('e', { endpoint: 'GET /a' });
    expect(onlyEp).not.toContain('ep-err-code');
    expect(onlyEp).toContain('失败于 GET /a');
  });

  it('meta 值注入安全：<script> 不以字面量出现（与正文同 escHtml 安全级）', () => {
    const html = errPreHtml('e', { code: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
