/**
 * 一一一批（1119）：托管重建向导·诚实反馈与危险操作收口。
 *
 * 行为锁（真挂载 + memory router + askConfirm/api 手控回包，adhocGateRace943 同款基建）：
 *  · 确认预览步目标磁盘预估：进入 step3 拉取 reindexPreview → 估算中→结果行；
 *    失败静默降级（整行不渲染、无 error toast）；同源缓存（离开重进不重复拉）。
 *  · 切换确认双门：未勾删除 → warn 门拦截（生产写入改道须确认，取消不放行）；
 *    勾删除 → critical 门 guardText=物理索引名（被删对象是物理索引，不是逻辑名）。
 *  · 中止确认不带 dismissable：删半成品索引+回滚属破坏性动作，不允许会话级跳过。
 *  · strategy 列中文（增量追平/直切+回补）+ 英文原值小字（status/stage 列同范式）。
 *  · 终态耗时冻结：优先 tookMs，缺席 finishedAt-startedAt，皆无 —；不走 Date.now 走字。
 *  · 作业列表拉取失败：错误卡+重试在场（不再整卡消隐），重试成功恢复。
 *  · MANUAL 策略隐藏时间字段+缓冲行；INCREMENTAL 禁用时策略卡给现场原因小字。
 * 末尾附源码锚（stripNote 目标集群口径 / 预估缓存与静默字段 / 终态分支无 Date.now）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { draftStorageKey } from '../composables/useScopedDraft';

const askConfirmFn = vi.fn();
const prepareFn = vi.fn();
const statusFn = vi.fn();
const jobsFn = vi.fn();
const abortFn = vi.fn();
const confirmSwitchFn = vi.fn();
const reindexPreviewFn = vi.fn();

vi.mock('../composables/confirm', () => ({
  askConfirm: (...a: any[]) => askConfirmFn(...a),
}));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      reindexPreview: (...a: any[]) => reindexPreviewFn(...a),
      adhoc: {
        ...actual.api.adhoc,
        prepare: (...a: any[]) => prepareFn(...a),
        status: (...a: any[]) => statusFn(...a),
        jobs: (...a: any[]) => jobsFn(...a),
        abort: (...a: any[]) => abortFn(...a),
        confirmSwitch: (...a: any[]) => confirmSwitchFn(...a),
      },
    },
  };
});
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { void emit; return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: async () => true };
});

import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];
let pendingConfirms: { res: (v: boolean) => void }[] = [];

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* 探测回包：源物理名与逻辑名刻意不同（guardText 物理名断言的判别基础） */
const PREP_MOCK = {
  index: 'bond_index', isAlias: true, physicals: ['bond_v1'],
  sourcePhysical: 'bond_v1', docCount: 12345,
  settingsJson: '{"index":{"number_of_replicas":1}}',
  mappingJson: JSON.stringify({ properties: { a: { type: 'keyword' } } }),
  suggestedDest: 'bond_v2', timeFieldCandidates: [{ field: 'ts', type: 'date' }],
};
const AWAIT_JOB = {
  jobId: 'await-1', logicalName: 'bond_index', strategy: 'WRITE_BLOCK', status: 'RUNNING',
  stage: 'AWAIT_CONFIRM', awaitConfirmSince: Date.now(), startedAt: 1700000000000,
  sourcePhysical: 'bond_v1', destPhysical: 'bond_v2',
};

interface MountOpts {
  jobs?: any[];
  status?: any;
  prepare?: any;
  step?: string;
  indexName?: string;
  strategy?: string;
  deleteOld?: boolean;
  reindex?: (resolve: (v: any) => void, reject: (e: any) => void) => void;
}

async function mountAR(opts: MountOpts = {}): Promise<{ host: HTMLElement; store: ReturnType<typeof useAppStore> }> {
  jobsFn.mockResolvedValue(opts.jobs ?? []);
  statusFn.mockImplementation(async () => (opts.status ?? AWAIT_JOB));
  prepareFn.mockImplementation(async () => (opts.prepare ?? PREP_MOCK));
  reindexPreviewFn.mockImplementation(() => new Promise((resolve, reject) => {
    if (opts.reindex) opts.reindex(resolve, reject);
    else resolve({ estimatedTargetBytes: 1234567890, docs: 12345, avgDocBytes: 100000.6 });
  }));
  const K = (f: string) => draftStorageKey({ route: 'adhoc' }, f);
  if (opts.step) sessionStorage.setItem(K('step'), opts.step);
  if (opts.indexName) sessionStorage.setItem(K('index-name'), opts.indexName);
  if (opts.strategy) sessionStorage.setItem(K('strategy'), opts.strategy);
  if (opts.deleteOld) sessionStorage.setItem(K('delete-old-index'), '1');
  const View = (await import('../views/AdhocRebuildView.vue')).default;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/search', component: { template: '<div/>' } },
      { path: '/indices', component: { template: '<div/>' } },
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
  return { host, store: useAppStore(pinia) };
}

function btnByText(host: ParentNode, label: string): HTMLButtonElement {
  const btn = [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find(b => (b.textContent || '').trim() === label);
  if (!btn) throw new Error('button not found: ' + label);
  return btn;
}

function releaseConfirm(v: boolean) {
  const p = pendingConfirms.shift();
  if (!p) throw new Error('no pending confirm');
  p.res(v);
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
  pendingConfirms = [];
  askConfirmFn.mockReset().mockImplementation(() => new Promise<boolean>((res) => { pendingConfirms.push({ res }); }));
  prepareFn.mockReset();
  statusFn.mockReset();
  jobsFn.mockReset();
  abortFn.mockReset().mockResolvedValue({ ...AWAIT_JOB });
  confirmSwitchFn.mockReset().mockResolvedValue({ ...AWAIT_JOB, status: 'DONE' });
  reindexPreviewFn.mockReset();
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('1119 刀1 确认预览步目标磁盘预估', () => {
  it('进入 step3 即按源物理名拉取：估算中 → 渲染「预计目标磁盘占用」行（docs × 平均 B）', { timeout: 20000 }, async () => {
    let releaseEst: ((v: any) => void) | null = null;
    const { host } = await mountAR({
      step: '3', indexName: 'bond_index',
      reindex: (res) => { releaseEst = res; },
    });
    expect(reindexPreviewFn).toHaveBeenCalledTimes(1);
    expect(reindexPreviewFn.mock.calls[0]![0]).toBe('bond_v1');   /* 按源物理名估，不按逻辑名 */
    expect(host.querySelector('[data-test="pv-disk-est-loading"]'), '在途显示估算中').toBeTruthy();
    (releaseEst as any)({ estimatedTargetBytes: 1234567890, docs: 12345, avgDocBytes: 100000.6 });
    await settle(8);
    const row = host.querySelector('[data-test="pv-disk-est"]');
    expect(row, '回包后渲染预估行').toBeTruthy();
    expect(row!.textContent).toContain('预计目标磁盘占用 ≈');
    expect(row!.textContent).toContain('1.1gb');                   /* fmtSize(1234567890) */
    expect(row!.textContent).toContain('12,345 篇');
    expect(row!.textContent).toContain('100,001 B');               /* Math.round(100000.6) 千分位 */
  });

  it('预估失败静默降级：整行不渲染、无 error toast、预览卡不受影响', { timeout: 20000 }, async () => {
    const { host, store } = await mountAR({
      step: '3', indexName: 'bond_index',
      reindex: (_res, rej) => { rej(new Error('preview down')); },
    });
    await settle(8);
    expect(host.querySelector('[data-test="pv-disk-est"]')).toBeNull();
    expect(host.querySelector('[data-test="pv-disk-est-loading"]')).toBeNull();
    expect(host.textContent, '预览卡本体不受预估失败影响').toContain('执行预览');
    const spy = vi.spyOn(store, 'notify');
    expect(spy.mock.calls.filter(c => c[0] === 'error'), '失败不得播报').toHaveLength(0);
  });

  it('同一源缓存：离开 step3 再回来不重复拉（reindexPreview 恒 1 次）', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ step: '3', indexName: 'bond_index' });
    expect(reindexPreviewFn).toHaveBeenCalledTimes(1);
    btnByText(host, '上一步').click();                              /* step3 → step2 */
    await settle(8);
    expect(host.textContent).toContain('追平策略');
    btnByText(host, '下一步：确认预览').click();                    /* step2 → step3 */
    await settle(8);
    expect(reindexPreviewFn, '同源缓存命中，不重复拉').toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-test="pv-disk-est"]'), '缓存值直接渲染').toBeTruthy();
  });
});

describe('1119 刀2/3 切换确认双门', () => {
  it('未勾删除：先过 warn 门——文案点名目标索引与生产写入改道；取消不放行、确认才发 confirmSwitch', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ jobs: [AWAIT_JOB], status: AWAIT_JOB });
    await openMonitorStep(host, AWAIT_JOB);
    btnByText(host, '确认切换').click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    const opts = askConfirmFn.mock.calls[0]![0] as any;
    expect(opts.level).toBe('warn');
    expect(opts.title).toContain('切换写入路由');
    expect(opts.message).toContain('bond_v2');                     /* 目标索引点名 */
    expect(opts.message).toContain('生产写入会立即打到新索引');
    releaseConfirm(false);
    await settle(6);
    expect(confirmSwitchFn, '取消不得放行切换').not.toHaveBeenCalled();
    btnByText(host, '确认切换').click();
    await settle(6);
    releaseConfirm(true);
    await settle(8);
    expect(confirmSwitchFn).toHaveBeenCalledTimes(1);
  });

  it('勾删除：critical 门零触碰，guardText=物理索引名（被删对象，而非逻辑名）', { timeout: 20000 }, async () => {
    const { host } = await mountAR({
      jobs: [AWAIT_JOB], status: AWAIT_JOB, deleteOld: true, indexName: 'bond_index',
    });
    await openMonitorStep(host, AWAIT_JOB);
    btnByText(host, '确认切换').click();
    await settle(6);
    const opts = askConfirmFn.mock.calls[0]![0] as any;
    expect(opts.level).toBe('critical');
    expect(opts.title).toBe('将删除旧物理索引');
    expect(opts.guardText, '守卫对象=将被物理删除的源物理索引').toBe('bond_v1');
    expect(opts.message).toContain('「bond_v1」');
    expect(opts.message, '逻辑名不得再冒充被删对象').not.toContain('「bond_index」');
    releaseConfirm(false);
    await settle(6);
    expect(confirmSwitchFn).not.toHaveBeenCalled();
  });
});

describe('1119 刀4 中止确认', () => {
  it('中止确认不带 dismissable（破坏性动作不允许「本次会话不再询问」）', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ jobs: [AWAIT_JOB], status: AWAIT_JOB });
    await openMonitorStep(host, AWAIT_JOB);
    btnByText(host, '中止并解除阻断').click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    const opts = askConfirmFn.mock.calls[0]![0] as any;
    expect(opts.dismissable).toBeUndefined();
    expect('dismissable' in opts, '属性须整体缺席，而非显式传 undefined').toBe(false);
    releaseConfirm(false);
    await settle(6);
    expect(abortFn).not.toHaveBeenCalled();
  });
});

describe('1119 刀8 strategy 列中文', () => {
  it('最近作业表 strategy 列：中文主体+英文原值小字（status/stage 同范式）', { timeout: 20000 }, async () => {
    const jobs = [
      { jobId: 'j-s1', logicalName: 'a_idx', strategy: 'INCREMENTAL', status: 'RUNNING', stage: 'REINDEX', startedAt: 1700000000000 },
      { jobId: 'j-s2', logicalName: 'b_idx', strategy: 'MANUAL', status: 'DONE', stage: 'DONE', startedAt: 1700000001000 },
    ];
    const { host } = await mountAR({ jobs, status: AWAIT_JOB });
    const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
    const r1 = rows.find(tr => (tr.textContent || '').includes('j-s1'))!;
    expect(r1.textContent).toContain('增量追平');
    expect(r1.textContent).toContain('INCREMENTAL');               /* en 小字保留原值 */
    const r2 = rows.find(tr => (tr.textContent || '').includes('j-s2'))!;
    expect(r2.textContent).toContain('直切+回补');
  });
});

describe('1119 刀12 终态耗时冻结', () => {
  const doneJob = (over: Partial<any>) => ({
    jobId: 'j-done-1', logicalName: 'idx_d', strategy: 'MANUAL', status: 'DONE', stage: 'DONE',
    startedAt: Date.now() - 60_000, currentProgress: { total: 100, created: 100 }, ...over,
  });

  it('无 tookMs：取 finishedAt-startedAt（8.0s），读数不随挂载时刻漂移', { timeout: 20000 }, async () => {
    const job = doneJob({ finishedAt: Date.now() - 52_000 });      /* startedAt+8s 收尾 */
    const { host } = await mountAR({ jobs: [job], status: job });
    await openMonitorStep(host, job);
    const rate = host.querySelector('[data-test="adhoc-rate"]')!;
    expect(rate.textContent).toContain('8.0s');                     /* 若走 Date.now 会是 ~60s 且递增 */
    await new Promise(r => setTimeout(r, 30));
    await settle(4);
    expect(host.querySelector('[data-test="adhoc-rate"]')!.textContent, '终态读数冻结').toContain('8.0s');
  });

  it('有 tookMs 优先后端值（5.0s）；tookMs/finishedAt 皆无 → 已耗时 —', { timeout: 20000 }, async () => {
    const withTook = doneJob({ tookMs: 5000, finishedAt: Date.now() - 52_000 });
    const { host } = await mountAR({ jobs: [withTook], status: withTook });
    await openMonitorStep(host, withTook);
    expect(host.querySelector('[data-test="adhoc-rate"]')!.textContent).toContain('5.0s');
    apps.pop()!.unmount();
    document.body.innerHTML = '';
    const bare = doneJob({});                                      /* 两时钟字段皆缺 */
    const h2 = (await mountAR({ jobs: [bare], status: bare })).host;
    await openMonitorStep(h2, bare);
    expect(h2.querySelector('[data-test="adhoc-rate"]')!.textContent).toContain('已耗时 —');
  });
});

describe('1119 刀13 作业列表失败留卡', () => {
  it('拉取失败：错误卡+重试在场（不整卡消隐），重试成功恢复正常表', { timeout: 20000 }, async () => {
    jobsFn.mockRejectedValueOnce(new Error('boom'));
    const { host } = await mountAR({});
    const errCard = host.querySelector('[data-test="ar-jobs-err"]');
    expect(errCard, '失败错误卡必须在场').toBeTruthy();
    expect(errCard!.textContent).toContain('作业列表拉取失败');
    expect(host.querySelector('[data-test="ar-jobs-retry"]'), '重试钮在场').toBeTruthy();
    expect(host.textContent, '错误态不渲染过滤工具行').not.toContain('过滤：jobId / 逻辑名 / 状态');
    (host.querySelector('[data-test="ar-jobs-retry"]') as HTMLButtonElement).click();
    await settle(10);                                              /* 第二次 jobs 调用 → [] */
    expect(host.querySelector('[data-test="ar-jobs-err"]'), '重试成功错误卡消退').toBeNull();
    expect(jobsFn).toHaveBeenCalledTimes(2);
  });
});

describe('1119 刀9/11 策略步显隐与禁用现场解释', () => {
  it('MANUAL：时间字段+追平缓冲行整行隐藏；WRITE_BLOCK 时在场', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ step: '2', indexName: 'bond_index', strategy: 'MANUAL' });
    /* 时间字段下拉改 NSelect（data-test=ar-time-field；旧 select.sel 锚随原生 select 退役迁移） */
    expect(host.querySelector('[data-test="ar-time-field"]'), 'MANUAL 无追平概念：时间字段下拉整行隐藏').toBeNull();
    expect(host.textContent).not.toContain('追平缓冲');
    expect((host.querySelector('input[type="radio"][value="MANUAL"]') as HTMLInputElement).checked).toBe(true);
    apps.pop()!.unmount();
    document.body.innerHTML = '';
    const h2 = (await mountAR({ step: '2', indexName: 'bond_index', strategy: 'WRITE_BLOCK' })).host;
    expect(h2.querySelector('[data-test="ar-time-field"]'), 'WRITE_BLOCK 时间字段下拉在场').toBeTruthy();
    expect(h2.textContent).toContain('追平缓冲');
  });

  it('INCREMENTAL 禁用现场解释：无时间字段候选时卡内给原因小字，且只在未选中时显示', { timeout: 20000 }, async () => {
    const noTf = { ...PREP_MOCK, timeFieldCandidates: [] };
    const { host } = await mountAR({ step: '2', indexName: 'bond_index', strategy: 'WRITE_BLOCK', prepare: noTf });
    const hint = host.querySelector('[data-test="strat-inc-unavailable"]');
    expect(hint, '禁用且未选中 → 现场原因在场').toBeTruthy();
    expect(hint!.textContent).toContain('索引无时间字段候选，此策略不可用');
    apps.pop()!.unmount();
    document.body.innerHTML = '';
    const h2 = (await mountAR({ step: '2', indexName: 'bond_index', strategy: 'INCREMENTAL', prepare: noTf })).host;
    expect(h2.querySelector('[data-test="strat-inc-unavailable"]'), '已选中（或候选可用）不重复提示').toBeNull();
  });
});

describe('1119 源码锚（防回潮）', () => {
  const src = read('../views/AdhocRebuildView.vue');

  it('预估缓存/静默降级 + 切换双门 + 物理名守卫 + stripNote 目标集群口径 + 终态不走字', () => {
    /* 刀1：同源缓存判断与失败静默（落 fail 态不播报） */
    expect(src).toContain('previewEstSource === source');
    expect(src).toContain("previewEstState.value = 'fail'");
    /* 刀2：未勾删除的 warn 门文案 */
    expect(src).toMatch(/即将把别名写入路由切换到新索引/);
    /* 刀3：critical 守卫对象=物理索引名 */
    expect(src).toContain('const delTarget = job.value?.sourcePhysical || indexName.value;');
    expect(src).toMatch(/guardText: delTarget/);
    /* 刀4：中止确认不得回挂 dismissable */
    const abortBlock = src.slice(src.indexOf("title: '中止重建作业'"), src.indexOf("title: '中止重建作业'") + 260);
    expect(abortBlock).not.toContain('dismissable');
    /* 刀7：stripNote 按顶栏目标集群口径（旧「恒定宿主」说法不得回潮） */
    expect(src).toContain('本向导的探测与重建作用于顶栏当前选中的目标集群');
    expect(src).not.toContain('恒定作用于宿主集群');
    /* 刀12：终态分支不吃 Date.now()（运行分支保留 now-startedAt 属预期） */
    const m = src.slice(src.indexOf('const jobElapsedMs'), src.indexOf('const allJobs'));
    const terminal = m.slice(m.indexOf("if (j && j.status !== 'RUNNING')"), m.indexOf('if (!Number.isFinite(started)'));
    expect(terminal).not.toContain('Date.now()');
  });

  it('reset 清场连带磁盘预估缓存（旧估值不陪下一轮向导）', () => {
    const r = src.slice(src.indexOf('function reset()'), src.indexOf('function reset()') + 900);
    expect(r).toContain('previewEstSeq += 1');
    expect(r).toContain("previewEstState.value = 'idle'");
    expect(r).toContain("previewEstSource = ''");
  });
});
