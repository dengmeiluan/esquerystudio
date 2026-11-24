import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { adhocPrepare, adhocStart, adhocStatus, adhocJobs, adhocAbort, adhocConfirm, adhocRetry, adhocThrottle, adhocCleanupJobs } from '../platform/browserAdhoc';

const calls: { path: string; method: string; body?: string }[] = [];
let taskDone = false;

function fakeEs(path: string, method = 'GET', body?: string) {
  calls.push({ path, method, body });
  if (path.startsWith('/_alias/')) return Promise.resolve({ 'orders-2026': { aliases: { orders: { is_write_index: true } } } });
  if (path === '/orders-2026/_mapping') return Promise.resolve({ 'orders-2026': { mappings: { properties: { order_id: { type: 'keyword' }, created_at: { type: 'date' } } } } });
  if (path === '/orders-2026/_settings?flat_settings=true') return Promise.resolve({ 'orders-2026': { settings: { 'index.number_of_shards': '1', 'index.uuid': 'x', 'index.refresh_interval': '1s' } } });
  if (path === '/orders-2026/_count') return Promise.resolve({ count: 10 });
  if (path === '/_reindex?wait_for_completion=false&slices=auto&refresh=true') return Promise.resolve({ task: 'n1:1' });
  if (path.startsWith('/_tasks/')) return Promise.resolve({ completed: taskDone, task: { status: { total: 10, created: taskDone ? 10 : 5, updated: 0 } } });
  return Promise.resolve({ acknowledged: true });
}

/* 多 task 场景 mock：states 按提交序号回放（states[0]=全量 task，states[1]=追平轮 1 …，
 * 最后一个是异步终追 task）。log 供 body 断言。 */
function esWithTasks(states: { completed?: boolean; status?: any; error?: any }[]) {
  const log: { path: string; method: string; body?: string }[] = [];
  let submitted = 0;
  const es = (path: string, method = 'GET', body?: string) => {
    log.push({ path, method, body });
    if (path.startsWith('/_alias/')) return Promise.resolve({ 'orders-2026': { aliases: { orders: { is_write_index: true } } } });
    if (path === '/orders-2026/_mapping') return Promise.resolve({ 'orders-2026': { mappings: { properties: { order_id: { type: 'keyword' }, created_at: { type: 'date' } } } } });
    if (path === '/orders-2026/_settings?flat_settings=true') return Promise.resolve({ 'orders-2026': { settings: {} } });
    if (path === '/orders-2026/_count') return Promise.resolve({ count: 10 });
    if (path.startsWith('/_reindex')) {
      submitted++;
      return Promise.resolve({ task: 'n1:' + submitted });
    }
    if (path.startsWith('/_tasks/')) {
      const s = states[Math.min(submitted, states.length) - 1] || {};
      return Promise.resolve({ completed: !!s.completed, error: s.error, task: { status: s.status || {} } });
    }
    return Promise.resolve({ acknowledged: true });
  };
  return { es, log };
}

/* 与 jitterName 同口径的期望时间戳（fake timers 冻结时钟，测试内两次取值一致） */
function stamp14(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

describe('browser adhoc rebuild orchestration', () => {
  beforeEach(() => {
    localStorage.clear(); calls.length = 0; taskDone = false;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('prepare 解析别名 write 索引并给出 settings/mapping/字段候选', async () => {
    const p = await adhocPrepare(fakeEs as any, 'orders');
    expect(p).toMatchObject({ isAlias: true, sourcePhysical: 'orders-2026', docCount: 10 });
    expect(p.timeFieldCandidates).toContain('created_at');
    expect(JSON.parse(p.settingsJson)).toEqual({ number_of_shards: '1', refresh_interval: '1s' });
  });

  it('建议目标名与服务端同构：_adhoc_ + 14 位 yyyyMMddHHmmss，清洗口径保留', async () => {
    const p = await adhocPrepare(fakeEs as any, 'orders');
    expect(p.suggestedDest).toBe('orders_adhoc_' + stamp14());
    expect(p.suggestedDest).toMatch(/^orders_adhoc_\d{14}$/);
    const dirty = await adhocPrepare(fakeEs as any, 'My Orders!! 2026');
    expect(dirty.suggestedDest).toBe('my-orders-2026_adhoc_' + stamp14());
  });

  it('源是历史重建产物时剥净旧代 _adhoc_ 后缀再拼（不叠层，与服务端同口径）', async () => {
    const legacy = await adhocPrepare(fakeEs as any, 'orders_adhoc_20260806134223');
    expect(legacy.suggestedDest).toBe('orders_adhoc_' + stamp14());
    expect(legacy.suggestedDest, '不得双层 _adhoc_').not.toMatch(/_adhoc_\d+_adhoc_\d+/);
    const stacked = await adhocPrepare(fakeEs as any, 'orders_adhoc_20260806134223_adhoc_20260901120000');
    expect(stacked.suggestedDest, '多代叠层一次剥净').toBe('orders_adhoc_' + stamp14());
  });

  it('start -> status 推进 -> 完成后原子切别名（旧索引保留别名内只读）', async () => {
    const r = await adhocStart(fakeEs as any, { index: 'orders', strategy: 'INCREMENTAL', destIndex: 'orders-new', confirmDirectSwap: true });
    expect(r.job).toMatchObject({ status: 'RUNNING', sourcePhysical: 'orders-2026', destPhysical: 'orders-new' });
    const running = await adhocStatus(fakeEs as any, r.jobId);
    expect(running).toMatchObject({ status: 'RUNNING', created: 5 });
    taskDone = true;
    const done = await adhocStatus(fakeEs as any, r.jobId);
    expect(done).toMatchObject({ status: 'SUCCEEDED', stage: 'DONE', created: 10 });
    const aliasCall = calls.find(c => c.path === '/_aliases');
    /* 与服务端 switchWriteIndex 同形态：双 add——新 write + 旧只读，不 remove */
    expect(JSON.parse(aliasCall!.body!).actions).toEqual([
      { add: { index: 'orders-new', alias: 'orders', is_write_index: true } },
      { add: { index: 'orders-2026', alias: 'orders', is_write_index: false } },
    ]);
    expect(aliasCall!.body).not.toContain('"remove"');
    expect(done.report.hint).toContain('旧索引保留在别名内只读');
    const list = await adhocJobs(fakeEs as any);
    expect(list[0].jobId).toBe(r.jobId);
  });

  it('INCREMENTAL：全量完成后发起 range 追平（覆盖式），收敛后切换并异步终追（op_type=create）', async () => {
    const states: { completed?: boolean; status?: any; error?: any }[] = [{ completed: false, status: { total: 10, created: 4, updated: 0 } }];
    const { es, log } = esWithTasks(states);
    const r = await adhocStart(es as any, { index: 'orders', strategy: 'INCREMENTAL', timeField: 'created_at', destIndex: 'orders-cu' });
    const startedAt = r.job.startedAt;
    expect(r.job).toMatchObject({ status: 'RUNNING', catchupRound: 0 });
    await adhocStatus(es as any, r.jobId); // 全量进行中
    expect((await adhocStatus(es as any, r.jobId)).stage).toBe('FULL_REINDEX');
    states[0] = { completed: true, status: { total: 10, created: 10, updated: 0 } };
    states.push({ completed: false, status: { total: 3, created: 1, updated: 0 } });
    const catchup = await adhocStatus(es as any, r.jobId); // 全量完成 → 提交追平轮 1
    expect(catchup).toMatchObject({ status: 'RUNNING', stage: 'CATCHUP', catchupRound: 1 });
    const cuBody = JSON.parse(log.filter(c => c.path.startsWith('/_reindex'))[1].body!);
    expect(cuBody.conflicts).toBe('proceed');
    expect(cuBody.source).toEqual({ index: 'orders-2026', query: { range: { created_at: { gte: new Date(startedAt - 120000).toISOString() } } } });
    /* 切换前追平与服务端 createOnly=false 同构：dest 不放 op_type（覆盖式，更新能补进 dest） */
    expect(cuBody.dest).toEqual({ index: 'orders-cu' });
    expect(cuBody.dest.op_type).toBeUndefined();
    states[1] = { completed: true, status: { total: 3, created: 3, updated: 0 } }; // 受影响 3 < 50 收敛
    states.push({ completed: false, status: { total: 2, created: 1, updated: 0 } });
    const switching = await adhocStatus(es as any, r.jobId); // 收敛 → 切换 → 终追异步 task 提交
    expect(switching).toMatchObject({ status: 'RUNNING', stage: 'FINAL_CATCHUP' });
    const reindexes = log.filter(c => c.path.startsWith('/_reindex'));
    expect(reindexes[2].path).toBe('/_reindex?wait_for_completion=false&slices=auto&refresh=true');
    const finalBody = JSON.parse(reindexes[2].body!);
    expect(finalBody.source.query.range.created_at.gte).toBe(new Date(startedAt).toISOString());
    /* 终追与服务端 createOnly=true 同构：op_type=create，不覆盖切换后写入 dest 的新版本 */
    expect(finalBody.dest).toEqual({ index: 'orders-cu', op_type: 'create' });
    expect(finalBody.conflicts).toBe('proceed');
    states[2] = { completed: true, status: { total: 2, created: 2, updated: 0 } };
    const done = await adhocStatus(es as any, r.jobId); // 终追完成 → 收尾 DONE
    expect(done).toMatchObject({ status: 'SUCCEEDED', stage: 'DONE' });
    expect(done.rounds.map((x: any) => x.label)).toEqual(['full', 'catchup-1', 'final']);
    expect(done.rounds.every((x: any) => typeof x.tookMs === 'number')).toBe(true);
    expect(done.created).toBe(15); // 全量 10 + 追平 3 + 终追 2
    expect(done.report.created).toBe(15);
    expect(done.report.finalCatchupFailed).toBeUndefined();
    expect(JSON.parse(log.find(c => c.path === '/_aliases')!.body!).actions).toEqual([
      { add: { index: 'orders-cu', alias: 'orders', is_write_index: true } },
      { add: { index: 'orders-2026', alias: 'orders', is_write_index: false } },
    ]);
  });

  it('INCREMENTAL：单轮 created+updated ≥50 不收敛（updated 计入），按完成时刻回退 buffer 再来一轮', async () => {
    const t0 = Date.now();
    const states: { completed?: boolean; status?: any }[] = [{ completed: true, status: { total: 10, created: 10, updated: 0 } }];
    const { es, log } = esWithTasks(states);
    const r = await adhocStart(es as any, { index: 'orders', strategy: 'INCREMENTAL', timeField: 'created_at', destIndex: 'orders-cu2' });
    const startedAt = r.job.startedAt;
    states.push({ completed: true, status: { total: 60, created: 20, updated: 45 } }); // 追平轮 1：created 20<50 但 affected 65≥50 不收敛
    states.push({ completed: false, status: { total: 2, created: 1, updated: 1 } });
    await adhocStatus(es as any, r.jobId); // 全量完成 → 追平轮 1 提交（range 起点 = startedAt - buffer）
    let reindexes = log.filter(c => c.path.startsWith('/_reindex'));
    expect(JSON.parse(reindexes[1].body!).source.query.range.created_at.gte).toBe(new Date(startedAt - 120000).toISOString());
    vi.setSystemTime(t0 + 90000); // 追平轮 1 在此刻完成
    const round2 = await adhocStatus(es as any, r.jobId); // 提交追平轮 2：range 起点 = 本轮完成时刻 - buffer
    expect(round2).toMatchObject({ stage: 'CATCHUP', catchupRound: 2 }); // updated 计入：否则这里已错误收敛
    reindexes = log.filter(c => c.path.startsWith('/_reindex'));
    expect(reindexes.length).toBe(3);
    expect(JSON.parse(reindexes[2].body!).source.query.range.created_at.gte).toBe(new Date(t0 + 90000 - 120000).toISOString());
    states[2] = { completed: true, status: { total: 2, created: 1, updated: 1 } }; // affected 2 < 50 收敛（updated 计入也无碍）
    states.push({ completed: false, status: { total: 1, created: 0, updated: 0 } });
    const switching = await adhocStatus(es as any, r.jobId); // 轮 2 收敛 → 切换 → 终追提交
    expect(switching).toMatchObject({ stage: 'FINAL_CATCHUP' });
    states[3] = { completed: true, status: { total: 1, created: 1, updated: 0 } };
    const done = await adhocStatus(es as any, r.jobId);
    expect(done).toMatchObject({ status: 'SUCCEEDED' });
    expect(done.rounds.map((x: any) => x.label)).toEqual(['full', 'catchup-1', 'catchup-2', 'final']);
  });

  it('MANUAL：直切不追平，report 给回补 range DSL 建议', async () => {
    const states: { completed?: boolean; status?: any }[] = [{ completed: true, status: { total: 10, created: 10, updated: 0 } }];
    const { es, log } = esWithTasks(states);
    const r = await adhocStart(es as any, { index: 'orders', strategy: 'MANUAL', timeField: 'created_at', destIndex: 'orders-man' });
    const done = await adhocStatus(es as any, r.jobId);
    expect(done).toMatchObject({ status: 'SUCCEEDED', stage: 'DONE' });
    expect(log.filter(c => c.path.startsWith('/_reindex')).length).toBe(1); // 只有全量：不追平不终追
    expect(done.report.suggestedBackfillDsl).toContain('"index": "orders-2026"');
    expect(done.report.suggestedBackfillDsl).toContain('"range": { "created_at"');
    expect(done.report.suggestedBackfillDsl).toContain('"op_type": "create"');
    expect(done.report.suggestedBackfillDsl).toContain(new Date(r.job.startedAt - 120000).toISOString());
    expect(done.report.hint).toContain('MANUAL 策略未自动追平');
  });

  it('MANUAL 无时间字段：提示按业务主键人工核对回补', async () => {
    const states: { completed?: boolean; status?: any }[] = [{ completed: true, status: { total: 10, created: 10 } }];
    const { es } = esWithTasks(states);
    const r = await adhocStart(es as any, { index: 'orders', strategy: 'MANUAL', destIndex: 'orders-man2' });
    const done = await adhocStatus(es as any, r.jobId);
    expect(done.report.hint).toContain('按业务主键');
    expect(done.report.suggestedBackfillDsl).toBeUndefined();
  });

  it('abort：取消 task 但保留目标索引供诊断', async () => {
    const states: { completed?: boolean; status?: any }[] = [{ completed: false, status: { total: 10, created: 3 } }];
    const { es, log } = esWithTasks(states);
    const r = await adhocStart(es as any, { index: 'orders', strategy: 'INCREMENTAL', timeField: 'created_at', destIndex: 'orders-ab' });
    await adhocStatus(es as any, r.jobId);
    const aborted = await adhocAbort(es as any, r.jobId);
    expect(aborted).toMatchObject({ status: 'ABORTED', stage: 'DONE', error: null });
    expect(aborted.report.hint).toBe('已中止：目标索引 orders-ab 保留供诊断，可手动删除或复用');
    expect(log.some(c => c.method === 'DELETE' && c.path === '/orders-ab')).toBe(false);
    expect(log.some(c => c.path.startsWith('/_tasks/') && c.path.endsWith('/_cancel'))).toBe(true);
  });

  it('abort：FINAL_CATCHUP 期间可取消终追 task，作业保持 ABORTED 不被收尾覆写', async () => {
    const states: { completed?: boolean; status?: any }[] = [{ completed: true, status: { total: 10, created: 10, updated: 0 } }];
    const { es, log } = esWithTasks(states);
    const r = await adhocStart(es as any, { index: 'orders', strategy: 'INCREMENTAL', timeField: 'created_at', destIndex: 'orders-fc' });
    states.push({ completed: true, status: { total: 1, created: 1, updated: 0 } }); // 追平轮 1 立即收敛
    states.push({ completed: false, status: { total: 5, created: 2, updated: 0 } });
    await adhocStatus(es as any, r.jobId); // 全量完成 → 追平轮 1
    const switching = await adhocStatus(es as any, r.jobId); // 收敛 → 切换 → 终追异步 task
    expect(switching).toMatchObject({ status: 'RUNNING', stage: 'FINAL_CATCHUP' });
    const aborted = await adhocAbort(es as any, r.jobId);
    expect(aborted).toMatchObject({ status: 'ABORTED', error: null });
    /* 终追 task 在场即可被 _cancel 取消（currentTaskId 轮转到终追 task） */
    expect(log.some(c => c.method === 'POST' && c.path === '/_tasks/n1%3A3/_cancel')).toBe(true);
    expect(log.some(c => c.method === 'DELETE')).toBe(false); // 中止不删任何索引
    const after = await adhocStatus(es as any, r.jobId);
    expect(after).toMatchObject({ status: 'ABORTED' }); // 后续刷新不复活、不覆写
    expect(log.filter(c => c.path.startsWith('/_reindex')).length).toBe(3); // 无新提交
  });

  it('执行参数透传：requestsPerSecond 进 body，自定义 slices 进 URL（缺省 auto）', async () => {
    const custom = esWithTasks([{ completed: true, status: { total: 10, created: 10 } }]);
    const r1 = await adhocStart(custom.es as any, { index: 'orders', strategy: 'MANUAL', destIndex: 'orders-rps', requestsPerSecond: 123.5, slices: 4 });
    const first = custom.log.find(c => c.path.startsWith('/_reindex'))!;
    expect(first.path).toBe('/_reindex?wait_for_completion=false&slices=4&refresh=true');
    expect(JSON.parse(first.body!).requests_per_second).toBe(123.5);
    await adhocStatus(custom.es as any, r1.jobId); // 推到 DONE，避免同逻辑名重复作业校验挡住第二段

    const def = esWithTasks([{ completed: true, status: { total: 10, created: 10 } }]);
    await adhocStart(def.es as any, { index: 'orders', strategy: 'MANUAL', destIndex: 'orders-auto' });
    const second = def.log.find(c => c.path.startsWith('/_reindex'))!;
    expect(second.path).toBe('/_reindex?wait_for_completion=false&slices=auto&refresh=true');
    expect(JSON.parse(second.body!).requests_per_second).toBeUndefined();
  });

  /* ── 成员别名安全门（与服务端 AdhocRebuildService 同口径）：删除物理索引会连带
     断开其所属别名的成员关系，业务侧查询将失效 ── */

  const memberEs = (log?: { path: string; method: string; body?: string }[]) => (path: string, method = 'GET', body?: string) => {
    log?.push({ path, method, body });
    if (path === '/_alias/qa_phys') return Promise.resolve({ qa_phys: { aliases: { 'qa_onshore-bond-basic_bond_basic_asset_basic_info': {}, qa_extra_alias: {} } } });
    if (path === '/qa_phys/_mapping') return Promise.resolve({ qa_phys: { mappings: { properties: { created_at: { type: 'date' } } } } });
    if (path === '/qa_phys/_settings?flat_settings=true') return Promise.resolve({ qa_phys: { settings: {} } });
    if (path === '/qa_phys/_count') return Promise.resolve({ count: 3 });
    return Promise.resolve({ acknowledged: true });
  };

  it('prepare 透出源物理索引的成员别名列表（memberAliases，直连形态反查同一响应）', async () => {
    const p = await adhocPrepare(memberEs() as any, 'qa_phys');
    expect(p.isAlias).toBe(false);
    expect(p.memberAliases).toEqual(['qa_onshore-bond-basic_bond_basic_asset_basic_info', 'qa_extra_alias']);
  });

  it('start 直连 + 成员别名非空 → 硬拒（中文消息点名别名并引导别名入口），不建目标索引', async () => {
    const log: { path: string; method: string; body?: string }[] = [];
    await expect(adhocStart(memberEs(log) as any, { index: 'qa_phys', strategy: 'MANUAL', confirmDirectSwap: true }))
      .rejects.toThrow('源物理索引 qa_phys 是别名 qa_onshore-bond-basic_bond_basic_asset_basic_info、qa_extra_alias 的成员');
    await expect(adhocStart(memberEs(log) as any, { index: 'qa_phys', strategy: 'MANUAL', confirmDirectSwap: true }))
      .rejects.toThrow('请改用别名名（如 qa_onshore-bond-basic_bond_basic_asset_basic_info）作为重建入口');
    expect(log.some(c => c.method === 'PUT'), '被安全门拒绝的 start 不得创建目标索引').toBe(false);
  });

  it('别名模式不受成员别名门影响（反查出成员别名也照常启动——切换不动成员关系）', async () => {
    /* fakeEs：orders 是别名，write 物理 orders-2026 反查即挂 orders 别名（memberAliases
       非空），但 isAlias=true 走 write-index swap，不得触发直连安全门 */
    const p = await adhocPrepare(fakeEs as any, 'orders');
    expect(p.memberAliases).toEqual(['orders']);
    const r = await adhocStart(fakeEs as any, { index: 'orders', strategy: 'MANUAL', destIndex: 'orders-gate' });
    expect(r.job).toMatchObject({ status: 'RUNNING', aliasMode: true });
  });
});

/* ── 并发裁决与口径对齐：确认门竞态（探活等待期间门被超时收尾）/ 切换事实先行落盘 /
   重跑互斥与防双击 / 调速拒 0 / 保留旧索引写保护 / 清理天数校验 ── */

const JOBS_KEY = 'esquerystudio.adhoc.jobs';

function readJobs(): any[] { return JSON.parse(localStorage.getItem(JOBS_KEY) || '[]'); }

/* 门上的别名模式作业（手工落盘，编排消费的字段齐全） */
function putGateJob(over: Record<string, any> = {}) {
  const j: any = {
    jobId: 'adhoc-gate-1', logicalName: 'orders', strategy: 'INCREMENTAL', aliasMode: true,
    sourcePhysical: 'orders-2026', destPhysical: 'orders-new', timeField: 'created_at',
    bufferMs: 120000, startedAt: Date.now() - 60_000, finishedAt: null,
    status: 'RUNNING', stage: 'AWAIT_CONFIRM', error: null, currentTaskId: null,
    catchupRound: 1, catchupBaseMs: Date.now(), catchupRoundStart: Date.now() - 1000, rounds: [],
    requestsPerSecond: null, slices: null,
    total: 10, created: 10, updated: 0, roundBase: { total: 10, created: 10, updated: 0 },
    sourceDocCount: 10, destDocCount: 10, deleteOldIndex: false, pauseBeforeSwitch: true,
    awaitConfirmSince: Date.now() - 60_000, gateDeadlineMs: Date.now() + 29 * 60_000,
    gateOutcome: null, writeBlocked: false, switchedWithoutLock: false, report: null,
    ...over,
  };
  localStorage.setItem(JOBS_KEY, JSON.stringify([j]));
  return j;
}

async function microtasks(n = 30) { for (let i = 0; i < n; i++) await Promise.resolve(); }

describe('browser adhoc 并发裁决：确认与门超时（adhocConfirm vs gateTimeout）', () => {
  beforeEach(() => { localStorage.clear(); calls.length = 0; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('探活网络等待期间门已被超时收尾 → 确认拒绝放行，不执行切换、不覆写终态', async () => {
    const log: { path: string; method: string; body?: string }[] = [];
    let releaseCount: ((v: any) => void) | null = null;
    const es = (path: string, method = 'GET', body?: string) => {
      log.push({ path, method, body });
      if (path === '/orders-new/_count') return new Promise<any>(r => { releaseCount = r; });
      return Promise.resolve({ acknowledged: true });
    };
    putGateJob({ deleteOldIndex: true }); // 勾选删除 → 确认先探活目标索引（网络挂起）
    const confirming = adhocConfirm(es as any, 'adhoc-gate-1');
    expect(releaseCount, '确认已停在目标索引探活的网络等待上').toBeTruthy();
    /* 模拟 2s 轮询在探活等待期间把门按超时收尾（盘上落 FAILED/TIMED_OUT 终态） */
    const timed = { ...readJobs()[0], status: 'FAILED', stage: 'DONE', gateOutcome: 'TIMED_OUT', finishedAt: Date.now() };
    localStorage.setItem(JOBS_KEY, JSON.stringify([timed]));
    releaseCount!({ count: 10 });
    await expect(confirming).rejects.toThrow('确认门已被超时收尾');
    expect(log.some(c => c.path === '/_aliases'), '不得执行别名切换').toBe(false);
    expect(log.some(c => c.method === 'DELETE'), '不得删除旧索引').toBe(false);
    /* 超时终态不被确认覆写 */
    expect(readJobs()[0]).toMatchObject({ status: 'FAILED', gateOutcome: 'TIMED_OUT' });
  });

  it('确认放行即抢占落盘：切换请求在途期间盘上已离开确认门，越过截止时刻也不再改判', async () => {
    const log: { path: string; method: string; body?: string }[] = [];
    let releaseAliases: ((v: any) => void) | null = null;
    const es = (path: string, method = 'GET', body?: string) => {
      log.push({ path, method, body });
      if (path === '/_aliases') return new Promise<any>(r => { releaseAliases = r; });
      if (path.startsWith('/_reindex')) return Promise.resolve({ task: 'n1:9' });
      if (path.startsWith('/_tasks/')) return Promise.resolve({ completed: false, task: { status: { total: 1, created: 0, updated: 0 } } });
      return Promise.resolve({ acknowledged: true });
    };
    const gate = putGateJob();
    const confirming = adhocConfirm(es as any, 'adhoc-gate-1');
    await microtasks();
    expect(releaseAliases, '切换请求在途').toBeTruthy();
    /* 切换尚未回包，盘上已是 CONFIRMED + 离开 AWAIT_CONFIRM（先行落盘事实） */
    expect(readJobs()[0]).toMatchObject({ gateOutcome: 'CONFIRMED', status: 'RUNNING' });
    expect(readJobs()[0].stage).not.toBe('AWAIT_CONFIRM');
    expect(readJobs()[0].gateDeadlineMs).toBeNull();
    releaseAliases!({ acknowledged: true });
    const r = await confirming;
    expect(r).toMatchObject({ status: 'RUNNING', stage: 'FINAL_CATCHUP', gateOutcome: 'CONFIRMED' });
    /* 时钟越过原截止时刻 + 刷新：终追在途不被门超时改判成 FAILED「未执行切换」 */
    vi.setSystemTime(gate.gateDeadlineMs + 60_000);
    const after = await adhocStatus(es as any, 'adhoc-gate-1');
    expect(after).toMatchObject({ status: 'RUNNING', stage: 'FINAL_CATCHUP', gateOutcome: 'CONFIRMED' });
  });
});

describe('browser adhoc 切换事实先行落盘（终追提交失败不回滚到门上）', () => {
  beforeEach(() => { localStorage.clear(); calls.length = 0; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('别名 swap 成功后终追提交失败 → 盘上不残留 AWAIT_CONFIRM，按「已切换+终追失败」收尾', async () => {
    const log: { path: string; method: string; body?: string }[] = [];
    let rejectFinal: ((e: any) => void) | null = null;
    const es = (path: string, method = 'GET', body?: string) => {
      log.push({ path, method, body });
      if (path === '/_aliases') return Promise.resolve({ acknowledged: true });
      if (path.startsWith('/_reindex')) return new Promise<any>((_res, rej) => { rejectFinal = rej; });
      return Promise.resolve({ acknowledged: true });
    };
    putGateJob(); // INCREMENTAL + timeField → 切换后应提交终追
    const confirming = adhocConfirm(es as any, 'adhoc-gate-1');
    await microtasks();
    expect(rejectFinal, '终追提交已挂起').toBeTruthy();
    /* 关键时序：_aliases 已成功、终追尚未提交完成——此刻盘上必须已落 CONFIRMED
     * 且离开 AWAIT_CONFIRM（到点不会再被 gateTimeout 判成「未执行切换」） */
    expect(readJobs()[0]).toMatchObject({ gateOutcome: 'CONFIRMED', status: 'RUNNING' });
    expect(readJobs()[0].stage).not.toBe('AWAIT_CONFIRM');
    rejectFinal!(new Error('final submit failed'));
    const r = await confirming;
    expect(r).toMatchObject({ status: 'SUCCEEDED', gateOutcome: 'CONFIRMED' });
    expect(r.report.finalCatchupFailed).toBe(true);
    expect(r.report.hint).toContain('终追失败');
    expect(log.some(c => c.path === '/_aliases'), '别名切换已执行').toBe(true);
  });
});

describe('browser adhoc 重跑互斥与防双击（adhocRetry）', () => {
  beforeEach(() => { localStorage.clear(); calls.length = 0; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  const failedJob = (over: Record<string, any> = {}) => ({
    jobId: 'adhoc-retry-9', logicalName: 'orders', strategy: 'INCREMENTAL', aliasMode: true,
    sourcePhysical: 'orders-2026', destPhysical: 'orders-new', timeField: 'created_at',
    bufferMs: 120000, startedAt: Date.now() - 3600_000, finishedAt: Date.now() - 1800_000,
    status: 'FAILED', stage: 'DONE', error: 'reindex 失败', currentTaskId: 'n1:9',
    catchupRound: 0, catchupBaseMs: Date.now(), rounds: [], requestsPerSecond: null, slices: null,
    total: 10, created: 3, updated: 0, roundBase: { total: 10, created: 3, updated: 0 },
    sourceDocCount: 10, destDocCount: 3, deleteOldIndex: false, pauseBeforeSwitch: true,
    awaitConfirmSince: null, gateDeadlineMs: null, gateOutcome: null, writeBlocked: false,
    switchedWithoutLock: false, report: null, ...over,
  });
  const plainEs = (path: string, method = 'GET', body?: string) => {
    if (path === '/orders-new/_count') return Promise.resolve({ count: 10 });
    if (path.startsWith('/_reindex')) return Promise.resolve({ task: 'n1:11' });
    return Promise.resolve({ acknowledged: true });
  };

  it('同 logicalName 另一作业 RUNNING → 拒绝重跑（防两作业并发写同一目标）', async () => {
    localStorage.setItem(JOBS_KEY, JSON.stringify([
      failedJob(),
      failedJob({ jobId: 'adhoc-run-x', status: 'RUNNING', stage: 'FULL_REINDEX', finishedAt: null, error: null }),
    ]));
    await expect(adhocRetry(plainEs as any, 'adhoc-retry-9')).rejects.toThrow('该索引已有运行中的重建作业');
    /* 被拒路径不改写终态事实 */
    expect(readJobs()[0]).toMatchObject({ status: 'FAILED' });
  });

  it('重跑在途防双击：取消旧 task 的网络等待期间再次发起立即拒绝', async () => {
    let releaseCancel: ((v: any) => void) | null = null;
    const es = (path: string, method = 'GET', body?: string) => {
      if (path.startsWith('/_tasks/') && path.endsWith('/_cancel')) return new Promise<any>(r => { releaseCancel = r; });
      return plainEs(path, method, body);
    };
    localStorage.setItem(JOBS_KEY, JSON.stringify([failedJob()]));
    const first = adhocRetry(es as any, 'adhoc-retry-9');
    expect(releaseCancel, '首次重跑停在取消旧 task 的网络等待上').toBeTruthy();
    await expect(adhocRetry(es as any, 'adhoc-retry-9')).rejects.toThrow('重跑请求正在处理中');
    releaseCancel!({});
    const r = await first;
    expect(r).toMatchObject({ status: 'RUNNING', stage: 'CATCHUP' });
  });
});

describe('browser adhoc 服务端口径对齐（throttle / 旧索引写保护 / 清理天数）', () => {
  beforeEach(() => { localStorage.clear(); calls.length = 0; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('调速拒 0：requestsPerSecond=0 与服务端同义报错（不限速应传 -1）', async () => {
    putGateJob({ status: 'RUNNING', stage: 'CATCHUP', currentTaskId: 'n1:5', awaitConfirmSince: null, gateDeadlineMs: null });
    await expect(adhocThrottle(fakeEs as any, 'adhoc-gate-1', 0)).rejects.toThrow('requestsPerSecond 不得为 0：不限速请传 -1');
  });

  it('别名模式保留旧索引收尾：给旧物理索引加 blocks.write=true（服务端 FINALIZE 同口径）', async () => {
    const r = await adhocStart(fakeEs as any, { index: 'orders', strategy: 'INCREMENTAL', destIndex: 'orders-keep' });
    taskDone = true;
    const done = await adhocStatus(fakeEs as any, r.jobId);
    expect(done).toMatchObject({ status: 'SUCCEEDED' });
    const wp = calls.find(c => c.method === 'PUT' && c.path === '/orders-2026/_settings' && /"write":\s*true/.test(String(c.body)));
    expect(wp, '保留旧索引必须加写保护').toBeTruthy();
    expect(done.report.hint).toContain('已加写保护 blocks.write=true');
  });

  it('写保护设置失败：hint 如实说明未加上，不伪成功', async () => {
    const log: { path: string; method: string; body?: string }[] = [];
    const es = (path: string, method = 'GET', body?: string) => {
      log.push({ path, method, body });
      if (path.startsWith('/_alias/')) return Promise.resolve({ 'orders-2026': { aliases: { orders: { is_write_index: true } } } });
      if (path === '/orders-2026/_mapping') return Promise.resolve({ 'orders-2026': { mappings: { properties: { order_id: { type: 'keyword' } } } } });
      if (path === '/orders-2026/_settings?flat_settings=true') return Promise.resolve({ 'orders-2026': { settings: {} } });
      if (path === '/orders-2026/_count') return Promise.resolve({ count: 10 });
      if (path === '/orders-2026/_settings') return Promise.reject(new Error('settings rejected'));
      if (path.startsWith('/_reindex')) return Promise.resolve({ task: 'n1:1' });
      if (path.startsWith('/_tasks/')) return Promise.resolve({ completed: true, task: { status: { total: 10, created: 10, updated: 0 } } });
      return Promise.resolve({ acknowledged: true });
    };
    const r = await adhocStart(es as any, { index: 'orders', strategy: 'INCREMENTAL', destIndex: 'orders-wpf' });
    const done = await adhocStatus(es as any, r.jobId);
    expect(done).toMatchObject({ status: 'SUCCEEDED' });
    expect(done.report.hint).toContain('写保护设置失败：旧索引未加上 blocks.write=true');
  });

  it('清理天数校验：0 与负数拒绝（与服务端 deleteOlderThan 同口径）', async () => {
    localStorage.setItem(JOBS_KEY, JSON.stringify([putGateJob({ status: 'FAILED', stage: 'DONE', finishedAt: Date.now() })]));
    await expect(adhocCleanupJobs(0)).rejects.toThrow('olderThanDays 必须为正整数');
    await expect(adhocCleanupJobs(-1)).rejects.toThrow('olderThanDays 必须为正整数');
    expect(readJobs().length, '被拒路径不删任何记录').toBe(1);
  });
});

/* ── 切换后中止守卫：确认已赢下确认门（gateOutcome=CONFIRMED）后切换必然执行，此刻的
   中止拦不住任何东西——如实硬拒，不把已切换别名的活索引作业改标 ABORTED（与服务端
   AdhocRebuildService.abort 同口径） ── */

describe('browser adhoc 切换后中止守卫（CONFIRMED 后不可中止）', () => {
  beforeEach(() => { localStorage.clear(); calls.length = 0; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('确认切换后 FINAL_CATCHUP 阶段 abort 硬拒：不取消 task、不覆写作业状态', async () => {
    const states: { completed?: boolean; status?: any }[] = [{ completed: true, status: { total: 10, created: 10, updated: 0 } }];
    const { es, log } = esWithTasks(states);
    const r = await adhocStart(es as any, { index: 'orders', strategy: 'INCREMENTAL', timeField: 'created_at', destIndex: 'orders-cab', pauseBeforeSwitch: true });
    states.push({ completed: true, status: { total: 1, created: 1, updated: 0 } }); // 追平轮 1 即收敛
    await adhocStatus(es as any, r.jobId); // 全量完成 → 追平轮 1 提交
    const atGate = await adhocStatus(es as any, r.jobId); // 收敛 → 停门
    expect(atGate).toMatchObject({ stage: 'AWAIT_CONFIRM', status: 'RUNNING' });
    const confirmed = await adhocConfirm(es as any, r.jobId); // 确认 → 切换 → 终追在途
    expect(confirmed).toMatchObject({ stage: 'FINAL_CATCHUP', gateOutcome: 'CONFIRMED', status: 'RUNNING' });
    await expect(adhocAbort(es as any, r.jobId)).rejects.toThrow('切换已确认，无法中止');
    expect(log.some(c => c.path.endsWith('/_cancel')), '被拒的 abort 不得取消 task').toBe(false);
    expect(readJobs()[0]).toMatchObject({ status: 'RUNNING', stage: 'FINAL_CATCHUP', gateOutcome: 'CONFIRMED' });
  });

  it('DONE + CONFIRMED 的作业同样硬拒：不把已切换完成的作业改标 ABORTED', async () => {
    putGateJob({ stage: 'DONE', status: 'SUCCEEDED', gateOutcome: 'CONFIRMED', finishedAt: Date.now(), awaitConfirmSince: null, gateDeadlineMs: null, report: { hint: 'ok' } });
    await expect(adhocAbort(fakeEs as any, 'adhoc-gate-1')).rejects.toThrow('切换已确认，无法中止');
    expect(readJobs()[0]).toMatchObject({ status: 'SUCCEEDED', stage: 'DONE', gateOutcome: 'CONFIRMED' });
  });
});

/* ── task 读失败容忍：_tasks 读取失败不再一次判死——连续失败计数（2s 轮询 × 5 ≈ 10s）
   内保持 RUNNING 并标注 degraded（UI 可显示「联系 ES 暂失」），达到上限才落终态；
   destCount 兜底判活保留 ── */

describe('browser adhoc task 读失败容忍（连续失败计数 + degraded）', () => {
  beforeEach(() => { localStorage.clear(); calls.length = 0; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  /* /_tasks 前 failTimes.n 次抛错；orders-flk/_count 回 destCount（兜底判活输入） */
  function flakyEs(failTimes: { n: number }, destCount: number) {
    const log: { path: string; method: string; body?: string }[] = [];
    let submitted = 0;
    const es = (path: string, method = 'GET', body?: string) => {
      log.push({ path, method, body });
      if (path.startsWith('/_alias/')) return Promise.resolve({ 'orders-2026': { aliases: { orders: { is_write_index: true } } } });
      if (path === '/orders-2026/_mapping') return Promise.resolve({ 'orders-2026': { mappings: { properties: { order_id: { type: 'keyword' }, created_at: { type: 'date' } } } } });
      if (path === '/orders-2026/_settings?flat_settings=true') return Promise.resolve({ 'orders-2026': { settings: {} } });
      if (path === '/orders-2026/_count') return Promise.resolve({ count: 10 });
      if (path === '/orders-flk/_count') return Promise.resolve({ count: destCount });
      if (path.startsWith('/_reindex')) { submitted++; return Promise.resolve({ task: 'n1:' + submitted }); }
      if (path.startsWith('/_tasks/')) {
        if (failTimes.n > 0) { failTimes.n--; return Promise.reject(new Error('es unavailable')); }
        return Promise.resolve({ completed: false, task: { status: { total: 10, created: 5, updated: 0 } } });
      }
      return Promise.resolve({ acknowledged: true });
    };
    return { es: es as any, log };
  }

  it('暂时读不到 task：前 4 次保持 RUNNING + degraded=true，连续第 5 次才落终态', async () => {
    const { es } = flakyEs({ n: 5 }, 3); // 目标 _count=3 < sourceDocCount=10，兜底不达标
    const r = await adhocStart(es, { index: 'orders', strategy: 'INCREMENTAL', destIndex: 'orders-flk' });
    for (let i = 1; i <= 4; i++) {
      const st = await adhocStatus(es, r.jobId);
      expect(st).toMatchObject({ status: 'RUNNING', degraded: true, error: null });
    }
    const failed = await adhocStatus(es, r.jobId); // 连续第 5 次
    expect(failed).toMatchObject({ status: 'FAILED', stage: 'DONE' });
    expect(failed.error).toBe('无法读取 _reindex 任务，且目标文档数不足');
  });

  it('读取恢复即清零：失败 2 次后读取成功，degraded 归零；再失败从 1 重新计数', async () => {
    const fails = { n: 2 };
    const { es } = flakyEs(fails, 3);
    const r = await adhocStart(es, { index: 'orders', strategy: 'INCREMENTAL', destIndex: 'orders-flk' });
    await adhocStatus(es, r.jobId); // 失败 1
    const degraded = await adhocStatus(es, r.jobId); // 失败 2
    expect(degraded.degraded).toBe(true);
    const recovered = await adhocStatus(es, r.jobId); // 读取成功（task 未完成）
    expect(recovered).toMatchObject({ status: 'RUNNING', degraded: false });
    fails.n = 1;
    const again = await adhocStatus(es, r.jobId); // 再失败：计数从 1 重新开始
    expect(again).toMatchObject({ status: 'RUNNING', degraded: true });
  });

  it('destCount 兜底判活保留：读 task 失败但目标文档数达标 → 照常进停门，不受计数影响', async () => {
    const { es } = flakyEs({ n: 99 }, 10); // 一直读不到 task，但目标 _count=10 达标
    const r = await adhocStart(es, { index: 'orders', strategy: 'MANUAL', destIndex: 'orders-flk', pauseBeforeSwitch: true });
    const st = await adhocStatus(es, r.jobId); // 首次失败即兜底切停门
    expect(st).toMatchObject({ status: 'RUNNING', stage: 'AWAIT_CONFIRM' });
  });

  it('FINAL_CATCHUP 终追读不到：同样计数容忍，连续第 5 次才按终追失败口径收尾', async () => {
    const log: { path: string; method: string; body?: string }[] = [];
    let submitted = 0;
    let reads = 0;
    const es = (path: string, method = 'GET', body?: string) => {
      log.push({ path, method, body });
      if (path.startsWith('/_alias/')) return Promise.resolve({ 'orders-2026': { aliases: { orders: { is_write_index: true } } } });
      if (path === '/orders-2026/_mapping') return Promise.resolve({ 'orders-2026': { mappings: { properties: { order_id: { type: 'keyword' }, created_at: { type: 'date' } } } } });
      if (path === '/orders-2026/_settings?flat_settings=true') return Promise.resolve({ 'orders-2026': { settings: {} } });
      if (path === '/orders-2026/_count') return Promise.resolve({ count: 10 });
      if (path.startsWith('/_reindex')) { submitted++; return Promise.resolve({ task: 'n1:' + submitted }); }
      if (path.startsWith('/_tasks/')) {
        reads++;
        /* 前两次读（全量、追平轮 1）正常完成；终追 task 起一直读不到 */
        if (reads <= 2) return Promise.resolve({ completed: true, task: { status: { total: 10, created: 10, updated: 0 } } });
        return Promise.reject(new Error('es unavailable'));
      }
      return Promise.resolve({ acknowledged: true });
    };
    const r = await adhocStart(es as any, { index: 'orders', strategy: 'INCREMENTAL', timeField: 'created_at', destIndex: 'orders-fc2' }); // 直切：收敛即切换提交终追
    await adhocStatus(es as any, r.jobId); // 全量完成 → 追平轮 1
    const switching = await adhocStatus(es as any, r.jobId); // 收敛 → 切换 → 终追在途
    expect(switching).toMatchObject({ status: 'RUNNING', stage: 'FINAL_CATCHUP' });
    for (let i = 1; i <= 4; i++) {
      const st = await adhocStatus(es as any, r.jobId); // 终追读不到 1~4 次
      expect(st).toMatchObject({ status: 'RUNNING', stage: 'FINAL_CATCHUP', degraded: true });
    }
    const done = await adhocStatus(es as any, r.jobId); // 连续第 5 次
    expect(done).toMatchObject({ status: 'SUCCEEDED', stage: 'DONE' });
    expect(done.report.finalCatchupFailed).toBe(true);
  });
});

/* ── 多标签页 CAS 守卫：副作用（提交下一轮 reindex / 切换别名 / 删除源索引）前重读
   作业存储，currentTaskId 已不是本页签看到的旧值即另一标签页已接管——放弃副作用且
   不覆写盘上状态；storage 事件让本页签对其他页签的改动即时收敛 ── */

describe('browser adhoc 多标签页 CAS 守卫与 storage 收敛', () => {
  beforeEach(() => { localStorage.clear(); calls.length = 0; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  /* takeoverAtRead：第几次 /_tasks 读取时把盘上作业 currentTaskId 换成 otherTabTask
   *（模拟另一标签页已接管推进）。第 1 次读回全量完成，其后读回追平/终追完成（affected<50） */
  function esWithTakeover(takeoverAtRead: number, otherTabTask: string) {
    const log: { path: string; method: string; body?: string }[] = [];
    let submitted = 0;
    let reads = 0;
    const es = (path: string, method = 'GET', body?: string) => {
      log.push({ path, method, body });
      if (path.startsWith('/_alias/')) return Promise.resolve({ 'orders-2026': { aliases: { orders: { is_write_index: true } } } });
      if (path === '/orders-2026/_mapping') return Promise.resolve({ 'orders-2026': { mappings: { properties: { order_id: { type: 'keyword' }, created_at: { type: 'date' } } } } });
      if (path === '/orders-2026/_settings?flat_settings=true') return Promise.resolve({ 'orders-2026': { settings: {} } });
      if (path === '/orders-2026/_count') return Promise.resolve({ count: 10 });
      if (path.startsWith('/_reindex')) { submitted++; return Promise.resolve({ task: 'n1:' + submitted }); }
      if (path.startsWith('/_tasks/')) {
        reads++;
        if (reads === takeoverAtRead) {
          const list = readJobs();
          if (list[0]) { list[0].currentTaskId = otherTabTask; localStorage.setItem(JOBS_KEY, JSON.stringify(list)); }
        }
        const st = reads === 1
          ? { completed: true, task: { status: { total: 10, created: 10, updated: 0 } } }
          : { completed: true, task: { status: { total: 1, created: 1, updated: 0 } } };
        return Promise.resolve(st);
      }
      return Promise.resolve({ acknowledged: true });
    };
    return { es: es as any, log };
  }

  it('提交下一轮 reindex 前 currentTaskId 已轮转 → 放弃提交，不覆写接管页签的 task', async () => {
    const { es, log } = esWithTakeover(1, 'other-tab:7'); // 全量 task 回包时另一页签已提交追平
    const r = await adhocStart(es, { index: 'orders', strategy: 'INCREMENTAL', timeField: 'created_at', destIndex: 'orders-cas' });
    const st = await adhocStatus(es, r.jobId); // 全量完成 → 提交追平前发现 task 已被轮转
    expect(st).toMatchObject({ status: 'RUNNING' });
    expect(log.filter(c => c.path.startsWith('/_reindex')).length, '不得重复提交追平轮').toBe(1);
    expect(readJobs()[0]).toMatchObject({ status: 'RUNNING', currentTaskId: 'other-tab:7' });
  });

  it('切换别名前 currentTaskId 已轮转 → 放弃切换', async () => {
    const { es, log } = esWithTakeover(2, 'other-tab:8'); // 追平 task 回包时另一页签已接管切换
    const r = await adhocStart(es, { index: 'orders', strategy: 'INCREMENTAL', timeField: 'created_at', destIndex: 'orders-cas2' });
    await adhocStatus(es, r.jobId); // 全量完成 → 追平轮 1
    const st = await adhocStatus(es, r.jobId); // 收敛 → 切换前发现 task 已被轮转
    expect(st).toMatchObject({ status: 'RUNNING' });
    expect(log.some(c => c.path === '/_aliases'), '接管页签已推进，不得重复切换').toBe(false);
    expect(readJobs()[0]).toMatchObject({ status: 'RUNNING', currentTaskId: 'other-tab:8' });
  });

  it('删源索引前 currentTaskId 已轮转 → 放弃删除', async () => {
    const { es, log } = esWithTakeover(3, 'other-tab:9'); // 终追 task 回包时另一页签已轮转
    const r = await adhocStart(es, { index: 'orders', strategy: 'INCREMENTAL', timeField: 'created_at', destIndex: 'orders-cas3', deleteOldIndex: true });
    await adhocStatus(es, r.jobId); // 全量完成 → 追平轮 1
    await adhocStatus(es, r.jobId); // 收敛 → 切换 → 终追在途
    const st = await adhocStatus(es, r.jobId); // 终追完成 → 删源前发现 task 已被轮转
    expect(st).toMatchObject({ status: 'RUNNING' });
    expect(log.some(c => c.method === 'DELETE'), '接管页签已推进，不得重复删源').toBe(false);
    expect(readJobs()[0]).toMatchObject({ status: 'RUNNING', currentTaskId: 'other-tab:9' });
  });

  it('storage 事件（JOBS_KEY 被其他标签页改动）→ 立即刷新 RUNNING 作业，不等 2s 定时器', async () => {
    let taskState: { completed?: boolean; status?: any } = { completed: false, status: { total: 3, created: 1, updated: 0 } };
    const es = (path: string, _method = 'GET', _body?: string) => {
      if (path.startsWith('/_tasks/')) return Promise.resolve({ completed: !!taskState.completed, task: { status: taskState.status || {} } });
      return Promise.resolve({ acknowledged: true });
    };
    putGateJob({ stage: 'CATCHUP', currentTaskId: 'n1:2', catchupRound: 1, awaitConfirmSince: null, gateDeadlineMs: null });
    await adhocStatus(es as any, 'adhoc-gate-1'); // 建立 esCall 与轮询；追平 task 未完成，保持 CATCHUP
    expect(readJobs()[0].stage).toBe('CATCHUP');
    taskState = { completed: true, status: { total: 1, created: 1, updated: 0 } }; // 追平收敛（affected<50）
    window.dispatchEvent(new StorageEvent('storage', { key: JOBS_KEY }));
    await microtasks(60);
    expect(readJobs()[0].stage, 'storage 事件即时触发推进（停门）').toBe('AWAIT_CONFIRM');
  });
});
