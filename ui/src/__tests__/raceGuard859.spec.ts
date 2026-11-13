/**
 * 八百五十九批：横切续轮接力——async 竞态回包卫生三续（857 族A / 858 族B 范式平移·链式与回调 load 四页）。
 *
 * 857 修了 watch/pick 驱动的 load 四页；858 修了带参 load 四页；本批续扫「链式 / 回调 load」
 * 余量（858 ⑥ 记档点名），定谳真缺口四处：
 *   ① DslQueryView.preloadMapping——切索引 watch 链 / 执行链 / 挂载链共用，回包直写
 *      mappingFields 四 ref+state 而无身份比对：连切两索引后旧索引 inspect 慢包后到
 *      会顶掉新索引字段（builder 候选错域），失败慢包还会把新索引 loading 打成 err。
 *   ② LifecycleView.prefillCurStep——watch(moveIndex) 触发 ilm/explain 回包直写
 *      curPhase/curAction/curStep/curStepInfo 四 ref：输入连改后旧索引慢包顶掉新索引
 *      预填，预填值直接进 POST /_ilm/move 请求体 current_step（推进不可回退）。
 *   ③ LiveDashboardView.loadHist/loadSlow/loadTop——时间窗/集群筛选/明细档任一变化
 *      重入，曲线+服务端告警（fire-and-forget）+环形+慢请求+Top 索引五链回包全部直写
 *      共享态：旧拍慢包顶掉新窗数据，过期 finally 还会提前熄掉在途 spinner。
 *   ④ AdhocRebuildView.watchJob——最近作业表 Eye 连点（表 sec 无 step 门，全程可见），
 *      旧作业 status 慢包顶掉新作业监控；旧作业 RUNNING 慢包还会劫持轮询目标
 *      pollJobId；失败慢包把新监控页踢回首页。轮询 tick 回包同写 job.value（拆行比对）。
 *
 * 竞态用例三拍驱动（857/858 同源）：双 pending 手控回包次序（快包先落、慢包后到），
 * 断言新选择的数据存活、旧回包被丢弃。视图全真，只 mock ../api 出口。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* ---- 网络出口 mock：四页挂载路径全量接管 ---- */
const inspectFn = vi.fn();
const explainFn = vi.fn();
const metricsFn = vi.fn();
const alertsFn = vi.fn();
const topFn = vi.fn();
const opsAuditFn = vi.fn();
const jobsFn = vi.fn();
const statusFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterIndices: vi.fn(async () => []),
      clusterInspect: (...a: any[]) => inspectFn(...a),
      nodesStatsBrief: vi.fn(async () => []),
      mappingDetail: vi.fn(async () => ({ raw: { properties: {} } })),
      aliases: vi.fn(async () => []),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      health: vi.fn(async () => ({ status: 'green' })),
      clusterHealth: vi.fn(async () => ({})),
      nodesStats: vi.fn(async () => []),
      pendingTasks: vi.fn(async () => ({ tasks: [] })),
      allocationExplain: vi.fn(async () => ({})),
      ilmStatus: vi.fn(async () => ({ indices: {} })),
      ilmPolicies: vi.fn(async () => []),
      ilmExplain: (...a: any[]) => explainFn(...a),
      monitorMetrics: (...a: any[]) => metricsFn(...a),
      monitorAlerts: (...a: any[]) => alertsFn(...a),
      monitorTopIndexes: (...a: any[]) => topFn(...a),
      auth: { ...actual.api.auth, opsAudit: (...a: any[]) => opsAuditFn(...a) },
      ringUsage: vi.fn(async () => ({ auditPrefix: 'a', monitorPrefix: 'm', auditBytes: 1, capBytes: 10, total: 1 })),
      adhoc: { ...actual.api.adhoc, prepare: vi.fn(async () => ({})), jobs: (...a: any[]) => jobsFn(...a), status: (...a: any[]) => statusFn(...a) },
    },
  };
});

/* MonacoEditor 组件 stub（LiveDashboard onMounted 调 mon.start()/setFocus——stub 须暴露；
   monaco-editor api 模块同步 stub 兜底真实 import 面） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup() { return { start: () => {}, setFocus: () => {} }; },
    template: '<div class="monaco-stub"></div>',
  },
}));
vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  editor: { defineTheme: () => {}, create: () => ({ onDidChangeModelContent: () => ({ dispose() {} }), addAction: () => {}, getValue: () => '', setValue: () => {}, updateOptions: () => {}, getAction: () => null, getSelection: () => null, executeEdits: () => {}, focus: () => {}, deltaDecorations: () => [], getModel: () => null, dispose: () => {} }), setTheme: () => {}, setModelMarkers: () => {} },
  languages: { registerCompletionItemProvider: () => ({ dispose() {} }), registerHoverProvider: () => ({ dispose() {} }), register: () => {}, setMonarchTokensProvider: () => {}, setLanguageConfiguration: () => {}, registerCodeActionProvider: () => ({ dispose() {} }), json: { jsonDefaults: { setDiagnosticsOptions: () => {} } } },
  Range: class {}, KeyMod: { CtrlCmd: 2048 }, KeyCode: { Enter: 3 }, MarkerSeverity: { Hint: 1, Warning: 8 },
}));
vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({ default: class {} }));
vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({ default: class {} }));

/* HistoryChart 组件 stub：捕获 props（曲线 series + 服务端告警 events 的断言面） */
const charts859: any[] = [];
vi.mock('../components/HistoryChart.vue', () => ({
  default: {
    name: 'HistoryChart',
    props: ['title', 'unit', 'series', 'forecast', 'note', 'threshold', 'palette', 'gapMs', 'statusBands', 'events'],
    setup(props: any) { charts859.push({ props }); return {}; },
    template: '<div class="history-stub"></div>',
  },
}));

import DslQueryView from '../views/DslQueryView.vue';
import LifecycleView from '../views/LifecycleView.vue';
import LiveDashboardView from '../views/LiveDashboardView.vue';
import AdhocRebuildView from '../views/AdhocRebuildView.vue';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(view: any, path = '/', preMount?: (pinia: ReturnType<typeof createPinia>) => void) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push(path);
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  preMount?.(pinia);
  const app = createApp({ render: () => h(view as any) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, pinia, store: useAppStore(pinia), auth: useAuthStore(pinia) };
}

/** script setup 根组件的绑定面（767 探针课③合法通道：内部态读数走 setupState） */
function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

/** 按 key 精确放行 pending 回包（858 release 同源：乱序释放即竞态三拍本体） */
function release<T extends { id: string; res: (v: any) => void }>(bag: T[], id: string, v: any) {
  const i = bag.findIndex(p => p.id === id);
  if (i < 0) throw new Error(`pending ${id} 不在场（挂载链未按预期发起请求）`);
  bag.splice(i, 1)[0].res(v);
}
/** 按触发序放行（opsAudit 两拍同参无法按参 id 区分，袋序=触发序） */
function releaseAt<T extends { res: (v: any) => void }>(bag: T[], i: number, v: any) {
  if (!bag[i]) throw new Error(`pending #${i} 不在场`);
  bag.splice(i, 1)[0].res(v);
}

/* ---- DslQuery：两索引 mapping 回包互斥字段标记 ---- */
const pendingInspects: Array<{ id: string; res: (v: any) => void }> = [];
const mappings859 = (tag: string) => ({
  mappings: { ['idx-' + tag]: { properties: { [tag + '-field']: { type: 'keyword' } } } },
});

/* ---- Lifecycle：两索引 explain 回包互斥 step 标记 ---- */
const pendingExplains: Array<{ id: string; res: (v: any) => void }> = [];
const EXPLAIN_859: Record<string, any> = {
  'lc-a': { indices: { 'lc-a': { phase: 'hot', action: 'rollover', step: 'A-STEP' } } },
  'lc-b': { indices: { 'lc-b': { phase: 'warm', action: 'forcemerge', step: 'B-STEP' } } },
};

/* ---- LiveDashboard：两拍 metrics/alerts/top/slow 回包互斥标记 ---- */
const pendingMetrics: Array<{ id: string; res: (v: any) => void }> = [];
const pendingAlerts: Array<{ id: string; res: (v: any) => void }> = [];
const pendingTops: Array<{ id: string; res: (v: any) => void }> = [];
const pendingSlows: Array<{ id: string; res: (v: any) => void }> = [];
const now = Date.now();
const METRICS = (tag: string, conns: string[]) => ({
  records: conns.map(c => ({ timestamp: now, connName: c, heapUsedMb: tag === 'B' ? 5 : 999 })),
});
const ALERTS = (tag: string) => ({
  records: [{ timestamp: now, connName: 'c1', level: 'CRIT', metric: 'heapUsedMb', value: 1, recovered: false, message: 'ALERT-' + tag }],
});

/* ---- AdhocRebuild：两作业 Eye 连点，status 回包互斥标记 ---- */
const JOBS_859 = [
  { jobId: 'job-a', logicalName: 'idx_a', strategy: 'WRITE_BLOCK', status: 'RUNNING', stage: 'FULL_REINDEX', startedAt: 1700000000000 },
  { jobId: 'job-b', logicalName: 'idx_b', strategy: 'WRITE_BLOCK', status: 'FINISHED', stage: 'DONE', startedAt: 1700000000000 },
];
const JOB = (id: string, st: string) => ({ jobId: id, status: st, stage: st === 'RUNNING' ? 'FULL_REINDEX' : 'DONE', startedAt: 1700000000000 });
const pendingStatus: Array<{ id: string; res: (v: any) => void }> = [];

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  charts859.length = 0;
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  pendingInspects.length = 0; pendingExplains.length = 0;
  pendingMetrics.length = 0; pendingAlerts.length = 0; pendingTops.length = 0; pendingSlows.length = 0;
  pendingStatus.length = 0;
  inspectFn.mockReset().mockImplementation((idx: string) =>
    new Promise(res => pendingInspects.push({ id: idx, res })));
  explainFn.mockReset().mockImplementation((idx: string) =>
    new Promise(res => pendingExplains.push({ id: idx, res })));
  metricsFn.mockReset().mockImplementation(() =>
    new Promise(res => pendingMetrics.push({ id: 'm' + pendingMetrics.length, res })));
  alertsFn.mockReset().mockImplementation(() =>
    new Promise(res => pendingAlerts.push({ id: 'al' + pendingAlerts.length, res })));
  topFn.mockReset().mockImplementation((connId?: string) =>
    new Promise(res => pendingTops.push({ id: String(connId ?? '') + '#' + pendingTops.length, res })));
  opsAuditFn.mockReset().mockImplementation(() =>
    new Promise(res => pendingSlows.push({ id: 's' + pendingSlows.length, res })));
  jobsFn.mockReset().mockResolvedValue(JOBS_859);
  statusFn.mockReset().mockImplementation((jobId: string) =>
    new Promise(res => pendingStatus.push({ id: jobId, res })));
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('859 族：async 竞态回包卫生三续——链式/回调 load 四页（857/858 三拍范式平移）', () => {
  it('DslQuery：连切两索引，旧索引 mapping 慢包后到不得顶掉新索引字段', async () => {
    const { app, store } = await mountView(DslQueryView, '/search');
    const st = stateOf(app);
    expect(st.mappingFields).toEqual([]);                    // 初始无 mapping
    store.pickedIdx = 'idx-a';                               // 切索引 watch → inspect-A（慢包）
    await settle(6);
    store.pickedIdx = 'idx-b';                               // 连切 B → 清字段+inspect-B（快包）
    await settle(6);
    expect(pendingInspects.map(p => p.id)).toEqual(['idx-a', 'idx-b']);
    release(pendingInspects, 'idx-b', mappings859('b'));     // 快包先落
    await settle(8);
    expect(st.mappingState).toBe('ok');
    expect(st.mappingFields).toEqual(['b-field']);
    release(pendingInspects, 'idx-a', mappings859('a'));     // 慢包后到
    await settle(8);
    expect(st.mappingFields).toEqual(['b-field']);           // 不得被 A 顶掉
    expect(st.mappingState).toBe('ok');
  });

  it('DslQuery：旧索引 inspect 失败慢包不得把新索引 loading/ok 打成 err', async () => {
    const { app, store } = await mountView(DslQueryView, '/search');
    const st = stateOf(app);
    store.pickedIdx = 'idx-a';
    await settle(6);
    store.pickedIdx = 'idx-b';
    await settle(6);
    release(pendingInspects, 'idx-b', mappings859('b'));
    await settle(8);
    expect(st.mappingState).toBe('ok');
    pendingInspects.find(p => p.id === 'idx-a')!.res(Promise.reject(new Error('boom')));   // A 失败慢包
    await settle(8);
    expect(st.mappingState).toBe('ok');                      // 不得被打成 err（重试钮不得出现）
    expect(st.mappingFields).toEqual(['b-field']);
  });

  it('Lifecycle：moveIndex 连改两索引，旧 explain 慢包后到不得顶掉新索引预填', async () => {
    const { host, store } = await mountView(LifecycleView);
    await settle(6);
    /* 本页 rollover 区与 move 区各有一只「用当前索引」钮——必须限定 .lc-move 取 move 区那只 */
    const pickBtn = () => host.querySelector<HTMLButtonElement>('.lc-move button[data-test="use-current-idx"]');
    store.pickedIdx = 'lc-a';                                // 首选 A → 点「用当前索引」→ explain-A（慢包）
    await settle(4);
    pickBtn()!.click();
    await settle(4);
    store.pickedIdx = 'lc-b';                                // 连改 B → explain-B（快包）
    await settle(4);
    pickBtn()!.click();
    await settle(4);
    expect(pendingExplains.map(p => p.id)).toEqual(['lc-a', 'lc-b']);
    release(pendingExplains, 'lc-b', EXPLAIN_859['lc-b']);   // 快包先落
    await settle(8);
    const cur = () => (host.querySelector('.lc-curstep')?.textContent || '');
    expect(cur()).toContain('当前所处：warm / forcemerge / B-STEP');
    release(pendingExplains, 'lc-a', EXPLAIN_859['lc-a']);   // 慢包后到
    await settle(8);
    expect(cur()).toContain('B-STEP');                       // 预填不得回跳 A（推进请求体直消费此值）
    expect(cur()).not.toContain('A-STEP');
    const [phase, action, step] = [...host.querySelectorAll<HTMLInputElement>('.lc-move input.lc-inp-sm')];
    expect(phase!.value).toBe('warm');
    expect(action!.value).toBe('forcemerge');
    expect(step!.value).toBe('B-STEP');
  });

  it('LiveDashboard：切时间窗后旧拍曲线+服务端告警慢包不得覆盖新窗', async () => {
    const { app, host } = await mountView(LiveDashboardView);
    const st = stateOf(app);
    await settle(4);
    expect(pendingMetrics.length).toBe(1);                   // 挂载首拍
    expect(pendingAlerts.length).toBe(1);
    st.mh2Range = '1h';                                      // 切窗 → 第二拍（watch 五元组）
    await settle(6);
    expect(pendingMetrics.length).toBe(2);
    expect(pendingAlerts.length).toBe(2);
    releaseAt(pendingMetrics, 1, METRICS('B', ['c1']));      // 新拍快包先落
    releaseAt(pendingAlerts, 1, ALERTS('B'));
    await settle(8);
    expect(st.hist[0]?.heapUsedMb).toBe(5);
    expect(charts859.some(c => JSON.stringify(c.props.events || []).includes('ALERT-B'))).toBe(true);
    releaseAt(pendingMetrics, 0, METRICS('A', ['old']));     // 旧拍慢包后到
    releaseAt(pendingAlerts, 0, ALERTS('A'));
    await settle(8);
    expect(st.hist[0]?.heapUsedMb).toBe(5);                  // 曲线不得回跳旧窗
    expect(st.hist.some((r: any) => r.connName === 'old')).toBe(false);
    const eventsTxt = charts859.map(c => JSON.stringify(c.props.events || [])).join('');
    expect(eventsTxt).toContain('ALERT-B');                  // 告警标记不得回跳旧窗
    expect(eventsTxt).not.toContain('ALERT-A');
  });

  it('LiveDashboard：切筛选/阈值后旧拍 Top 索引+慢请求慢包不得覆盖新拍明细', async () => {
    const { app, host } = await mountView(LiveDashboardView, '/', p => {
      useAuthStore(p).me = { username: 't', role: 'ADMIN', fallback: false };   // 慢请求页签的 canAuditAll 门
    });
    const st = stateOf(app);
    await settle(4);
    releaseAt(pendingMetrics, 0, METRICS('A', ['c1', 'c2'])); // 首拍落地 → clusterList=[c1,c2]
    await settle(8);
    st.detailOpen = true;                                    // 展开明细（watch(detailOpen) 单发 ensureDetailLoad）→ Top 拍 A
    await settle(6);
    expect(pendingTops.map(p => p.id.split('#')[0])).toEqual(['c1', 'c2']);   // A 拍双拉在袋（慢包）
    /* 触发源=改时间窗（真实 Top 重拉动线；切集群会进 byNode 默认开的 nodeMode、
     detailTab 自动回落 alert——Top 拍不发属产品语义，不作竞态对拍源） */
    st.mh2Range = '1h';                                      // 改窗 → watch 五元组 → Top 拍 B
    await settle(6);
    expect(pendingTops.map(p => p.id.split('#')[0])).toEqual(['c1', 'c2', 'c1', 'c2']);
    releaseAt(pendingTops, 2, { records: [{ index: 'idx-B-new', idxRate: 9, connName: 'c1' }] });   // B 快包先落
    releaseAt(pendingTops, 2, { records: [{ index: 'idx-B-new2', idxRate: 8, connName: 'c2' }] });
    await settle(8);
    const topIdx = () => st.topRows.map((r: any) => r.index).join(',');
    expect(topIdx()).toContain('idx-B-new');
    releaseAt(pendingTops, 0, { records: [{ index: 'idx-A-old', idxRate: 2, connName: 'c1' }] });   // 旧拍 c1 慢包后到
    await settle(8);
    expect(topIdx()).toContain('idx-B-new');
    expect(topIdx()).not.toContain('idx-A-old');

    /* 段2：慢请求页签同构——切明细档拉 A 拍，改窗拉 B 拍，旧包后到不得顶掉 */
    expect(st.detailTabs.some((t: any) => t.k === 'slow'), '慢请求明细页签在场（ADMIN 视角）').toBe(true);
    st.detailTab = 'slow';                                   // 切明细档（watch(detailTab) → ensureDetailLoad）→ slow 拍 A
    await settle(6);
    expect(pendingSlows.length).toBe(1);
    st.mh2Range = '6h';                                      // 改窗 → slow 拍 B
    await settle(6);
    expect(pendingSlows.length).toBe(2);
    releaseAt(pendingSlows, 1, { records: [{ timestamp: now, uri: '/B-slow', costMs: 5000 }] });
    await settle(8);
    releaseAt(pendingSlows, 0, { records: [{ timestamp: now, uri: '/A-slow', costMs: 9000 }] });  // A 慢包
    await settle(8);
    const slowUri = () => st.slowRows.map((r: any) => r.uri).join(',');
    expect(slowUri()).toBe('/B-slow');
  });

  it('AdhocRebuild：Eye 连点两作业，旧作业 RUNNING 慢包后到不得顶掉新作业监控、不得劫持轮询', async () => {
    const { app, host } = await mountView(AdhocRebuildView);
    const st = stateOf(app);
    await settle(8);
    const eyes = host.querySelectorAll<HTMLButtonElement>('button[aria-label="查看任务详情"]');
    expect(eyes.length).toBe(2);
    eyes[0]!.click();                                        // job-a（RUNNING 慢包）
    await settle(4);
    eyes[1]!.click();                                        // job-b（FINISHED 快包）
    await settle(4);
    expect(pendingStatus.map(p => p.id)).toEqual(['job-a', 'job-b']);
    release(pendingStatus, 'job-b', JOB('job-b', 'FINISHED'));   // 快包先落
    await settle(8);
    expect(st.job?.jobId).toBe('job-b');
    expect(st.pollJobId).toBe('');                           // FINISHED 不起轮询
    release(pendingStatus, 'job-a', JOB('job-a', 'RUNNING'));    // 旧作业 RUNNING 慢包后到
    await settle(8);
    expect(st.job?.jobId).toBe('job-b');                     // 监控不得回跳 job-a
    expect(st.pollJobId).toBe('');                           // 轮询目标不得被劫持为 job-a
  });

  it('AdhocRebuild：旧作业失败慢包不得把新作业监控页踢回首页', async () => {
    const { host } = await mountView(AdhocRebuildView);
    await settle(8);
    const eyes = host.querySelectorAll<HTMLButtonElement>('button[aria-label="查看任务详情"]');
    eyes[0]!.click();                                        // job-a（失败慢包）
    await settle(4);
    eyes[1]!.click();                                        // job-b（成功快包）
    await settle(4);
    release(pendingStatus, 'job-b', JOB('job-b', 'FINISHED'));
    await settle(8);
    const stepIdx = () => [...host.querySelectorAll('.steps .step')].findIndex(s => /\bact\b/.test(s.className));
    expect(stepIdx()).toBe(4);
    pendingStatus.find(p => p.id === 'job-a')!.res(Promise.reject(new Error('boom')));   // A 失败慢包
    await settle(8);
    expect(stepIdx()).toBe(4);                               // 不得被踢回首页（step=1）
    expect((host.querySelector('.ar-st-en')?.textContent || '')).not.toContain('job-a');
  });
});

describe('859 源码锁：AdhocRebuild 轮询面守卫（行为面难测的轮询写点三支同口径）', () => {
  it('jobPoller tick 回包比对 pollJobId + stopPolling 使在途 watchJob 回包过期', () => {
    const src = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');
    const tickIdx = src.indexOf('const jobPoller = useAutoRefresh');
    expect(tickIdx).toBeGreaterThan(-1);
    const tickBlock = src.slice(tickIdx, tickIdx + 700);
    expect(tickBlock, '轮询 tick 回包写 job.value 前必须比对 pollJobId 未漂移（旧拍回包丢弃）')
      .toMatch(/pollJobId\.value\s*!==\s*id/);
    const stopIdx = src.indexOf('function stopPolling');
    expect(stopIdx).toBeGreaterThan(-1);
    const stopBlock = src.slice(stopIdx, stopIdx + 300);
    expect(stopBlock, 'stopPolling 必须使在途 watchJob 回包过期（reset/离开监控步后旧回包不得复活轮询）')
      .toMatch(/watchSeq/);
  });
});
