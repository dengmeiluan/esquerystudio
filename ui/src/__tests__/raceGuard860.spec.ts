/**
 * 八百六十批：横切续轮接力——async 竞态回包卫生四续（857/858/859 三拍范式平移·轮询 tick 群与选择源绕门直调）。
 *
 * 859 ⑥ 记档余量「轮询 tick 群回包比对全查 + Promise.all 并行拉族」定谳真缺口四处：
 *   ① SnapshotsView.loadSnapshots——repo 切换 onRepoChange 直调（绕 useAutoRefresh guard），
 *      旧 repo 快照列表慢包迟到落笔=新 repo 页面显示旧 repo 数据；失败慢包还会清空新
 *      repo 列表，过期 finally 提前熄新拍 spinner 并误触进度搭车拉取。
 *   ② OverviewView.loadHistory——watch([mhConn,mhStatus,mhRange]) 直调 + autoRefresh 双触发
 *      源，旧筛选慢包顶掉新筛选回包；失败慢包把新筛选的 err 位打红。
 *   ③ stores/liveMonitor tick——setInterval 无在途互斥无世代比对（setFocus 还会立即补一针），
 *      旧拍回包全量覆盖 health/nodes/pendingTasks，吞吐差分链按到达序错算，告警面错翻转，
 *      snapshot() 把旧态落盘。
 *   ④ stores/jobTracker poll——setInterval 无在途互斥（档位切换重排后新拍与在途拍并发），
 *      旧拍 reconcile 把已消失作业重新登记进 seenRunning，jobs 清单被旧快照顶掉。
 *
 * 竞态用例三拍驱动（857/858/859 同源）：双 pending 手控回包次序（快包先落、慢包后到），
 * 断言新选择的数据存活、旧回包被丢弃。视图全真，只 mock ../api 出口；store 直调 tick/poll。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* ---- 网络出口 mock：四面挂载/轮询路径全量接管 ---- */
const reposFn = vi.fn();
const snapListFn = vi.fn();
const snapStatusFn = vi.fn();
const monHistFn = vi.fn();
const healthFn = vi.fn();
const nodesBriefFn = vi.fn();
const pendingTasksFn = vi.fn();
const adhocJobsFn = vi.fn();
const xbJobsFn = vi.fn();
const clusterTasksFn = vi.fn();
const snapStatusStoreFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterIndices: vi.fn(async () => []),
      overview: vi.fn(async () => ({ indices: [] })),
      health: vi.fn(async () => ({ status: 'green' })),
      clusterHealth: (...a: any[]) => healthFn(...a),
      shards: vi.fn(async () => []),
      nodesStatsBrief: (...a: any[]) => nodesBriefFn(...a),
      nodesStats: vi.fn(async () => []),
      pendingTasks: (...a: any[]) => pendingTasksFn(...a),
      monitorHistory: (...a: any[]) => monHistFn(...a),
      snapshotRepos: (...a: any[]) => reposFn(...a),
      snapshotList: (...a: any[]) => snapListFn(...a),
      snapshotStatusSummary: (...a: any[]) => snapStatusFn(...a),
      snapshotStatus: (...a: any[]) => snapStatusStoreFn(...a),
      clusterTasks: (...a: any[]) => clusterTasksFn(...a),
      xb: { ...actual.api.xb, jobs: (...a: any[]) => xbJobsFn(...a) },
      adhoc: { ...actual.api.adhoc, jobs: (...a: any[]) => adhocJobsFn(...a) },
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      ilmStatus: vi.fn(async () => ({ indices: {} })),
      ilmPolicies: vi.fn(async () => []),
      aliases: vi.fn(async () => []),
      mappingDetail: vi.fn(async () => ({ raw: { properties: {} } })),
    },
  };
});

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

import SnapshotsView from '../views/SnapshotsView.vue';
import OverviewView from '../views/OverviewView.vue';
import { useLiveMonitorStore } from '../stores/liveMonitor';
import { useJobTrackerStore } from '../stores/jobTracker';
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

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

/** 按 key 精确放行 pending 回包（857/858/859 release 同源：乱序释放即竞态三拍本体） */
function release<T extends { id: string; res: (v: any) => void }>(bag: T[], id: string, v: any) {
  const i = bag.findIndex(p => p.id === id);
  if (i < 0) throw new Error(`pending ${id} 不在场（触发链未按预期发起请求）`);
  bag.splice(i, 1)[0].res(v);
}
/** 按触发序放行（同参两拍无法按参 id 区分，袋序=触发序） */
function releaseAt<T extends { res: (v: any) => void }>(bag: T[], i: number, v: any) {
  if (!bag[i]) throw new Error(`pending #${i} 不在场`);
  bag.splice(i, 1)[0].res(v);
}

/* ---- Snapshots：两 repo 快照列表回包互斥标记 ---- */
const pendingSnaps: Array<{ id: string; res: (v: any) => void }> = [];
const SNAP_A = [{ snapshot: 'snap-a-old', state: 'SUCCESS', start_time: 1, duration_ms: 10, indices: ['i1'] }];
const SNAP_B = [{ snapshot: 'snap-b-new', state: 'SUCCESS', start_time: 2, duration_ms: 20, indices: ['i2'] }];

/* ---- Overview：monitorHistory 两拍回包互斥标记 ---- */
const pendingHist: Array<{ id: string; res: (v: any) => void }> = [];
const HIST = (conn: string) => ({ records: [{ timestamp: 1, connName: conn, env: 'e', status: 'GREEN', latencyMs: 3 }] });

/* ---- liveMonitor：两拍 nodesStatsBrief 回包互斥标记 ---- */
const pendingBrief: Array<{ id: string; res: (v: any) => void }> = [];
const NODES = (name: string, q: number) => [{ name, nodeId: name, queryTotal: q, indexTotal: q, heapPct: 30, cpuPct: 20, diskFree: 50, diskTotal: 100 }];

/* ---- jobTracker：两拍 jobs 回包互斥清单 ---- */
const pendingAdhoc: Array<{ id: string; res: (v: any) => void }> = [];
const ADHOC_JOB = (id: string, status: string) => [{ jobId: id, logicalName: 'idx_' + id, strategy: 'WRITE_BLOCK', status, stage: status === 'RUNNING' ? 'FULL_REINDEX' : 'DONE', startedAt: 1700000000000 }];

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  pendingSnaps.length = 0; pendingHist.length = 0;
  pendingBrief.length = 0; pendingAdhoc.length = 0;
  reposFn.mockReset().mockImplementation(() =>
    new Promise(res => pendingSnaps.push({ id: '__repos__', res })));
  snapListFn.mockReset().mockImplementation((repo: string) =>
    new Promise(res => pendingSnaps.push({ id: repo, res })));
  snapStatusFn.mockReset().mockResolvedValue({ running: [] });
  snapStatusStoreFn.mockReset().mockResolvedValue({ snapshots: [] });
  monHistFn.mockReset().mockImplementation((q: any) =>
    new Promise(res => pendingHist.push({ id: String(q?.connId ?? '') + '#' + pendingHist.length, res })));
  healthFn.mockReset().mockResolvedValue({ status: 'green' });
  nodesBriefFn.mockReset().mockImplementation(() =>
    new Promise(res => pendingBrief.push({ id: 'b' + pendingBrief.length, res })));
  pendingTasksFn.mockReset().mockResolvedValue({ tasks: [] });
  adhocJobsFn.mockReset().mockImplementation(() =>
    new Promise(res => pendingAdhoc.push({ id: 'ad' + pendingAdhoc.length, res })));
  xbJobsFn.mockReset().mockResolvedValue([]);
  clusterTasksFn.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  vi.restoreAllMocks();
});

describe('860 族：async 竞态回包卫生四续——轮询 tick 群与选择源绕门直调（857/858/859 三拍范式平移）', () => {
  it('Snapshots：切 repo 后旧 repo 快照列表慢包后到不得顶掉新 repo 数据', async () => {
    const { app } = await mountView(SnapshotsView);
    const st = stateOf(app);
    expect(pendingSnaps.length).toBe(1);                     // 挂载 repos 拍在袋
    /* 挂载链：loadRepos → 放仓库清单 → 自动选 repo-a → 拍 a（此后保持慢包在途） */
    release(pendingSnaps, '__repos__', [{ name: 'repo-a', type: 'fs' }, { name: 'repo-b', type: 'fs' }]);
    await settle(8);
    expect(st.currentRepo).toBe('repo-a');
    expect(pendingSnaps.map(p => p.id)).toEqual(['repo-a']);
    st.currentRepo = 'repo-b';
    void st.onRepoChange();                                  // 绕 guard 直调 → 拍 b（快包；不 await——其链挂在 pending 拍上）
    await settle(4);
    expect(pendingSnaps.map(p => p.id)).toEqual(['repo-a', 'repo-b']);   // repo-a 慢包仍在途+拍 b 已绕 guard 发起
    release(pendingSnaps, 'repo-b', SNAP_B);                 // 快包先落
    await settle(8);
    expect(st.snapshots.map((s: any) => s.snapshot)).toEqual(['snap-b-new']);
    release(pendingSnaps, 'repo-a', SNAP_A);                 // 旧 repo 慢包后到
    await settle(8);
    expect(st.snapshots.map((s: any) => s.snapshot)).toEqual(['snap-b-new']);   // 不得被 repo-a 顶掉
    expect(st.loading).toBe(false);
  });

  it('Snapshots：旧 repo 失败慢包不得清空新 repo 列表、不得误触进度搭车', async () => {
    const { app } = await mountView(SnapshotsView);
    const st = stateOf(app);
    release(pendingSnaps, '__repos__', [{ name: 'repo-a', type: 'fs' }, { name: 'repo-b', type: 'fs' }]);
    await settle(8);
    st.currentRepo = 'repo-b';
    void st.onRepoChange();
    await settle(4);
    release(pendingSnaps, 'repo-b', SNAP_B);
    await settle(8);
    expect(st.snapshots.map((s: any) => s.snapshot)).toEqual(['snap-b-new']);
    expect(st.loadErr).toBe('');
    const statusCallsBefore = snapStatusFn.mock.calls.length;
    pendingSnaps.find(p => p.id === 'repo-a')!.res(Promise.reject(new Error('boom')));   // repo-a 失败慢包
    await settle(8);
    expect(st.snapshots.map((s: any) => s.snapshot)).toEqual(['snap-b-new']);   // 失败慢包不得清空
    expect(st.loadErr).toBe('');                             // err 位不得被打红
    expect(snapStatusFn.mock.calls.length).toBe(statusCallsBefore);             // 过期拍不得误触进度搭车
  });

  it('Overview：连改筛选后旧拍监控历史慢包后到不得顶掉新筛选数据', async () => {
    const { app } = await mountView(OverviewView);
    const st = stateOf(app);
    await settle(6);
    expect(pendingHist.length).toBe(1);                      // 挂载首拍（默认筛选）
    st.mhConn = 'conn-a';                                    // 改连接 → watch 直调拍 a（慢包）
    await settle(6);
    expect(pendingHist.length).toBe(2);
    st.mhRange = '1h';                                       // 连改窗 → 拍 b（快包）
    await settle(6);
    expect(pendingHist.length).toBe(3);
    releaseAt(pendingHist, 2, HIST('conn-B'));               // 新拍快包先落
    await settle(8);
    expect(st.mhRows.map((r: any) => r.connName)).toEqual(['conn-B']);
    releaseAt(pendingHist, 1, HIST('conn-A'));               // 旧拍慢包后到
    await settle(8);
    expect(st.mhRows.map((r: any) => r.connName)).toEqual(['conn-B']);          // 不得回跳旧筛选
  });

  it('Overview：旧拍监控历史失败慢包不得把新筛选的 err 位打红', async () => {
    const { app } = await mountView(OverviewView);
    const st = stateOf(app);
    await settle(6);
    st.mhConn = 'conn-a';
    await settle(6);
    st.mhRange = '1h';
    await settle(6);
    releaseAt(pendingHist, 2, HIST('conn-B'));
    await settle(8);
    expect(st.mhErr).toBe('');
    pendingHist[1]!.res(Promise.reject(new Error('boom')));  // conn-a 拍失败慢包
    await settle(8);
    expect(st.mhErr).toBe('');                               // err 位不得被打红
    expect(st.mhRows.map((r: any) => r.connName)).toEqual(['conn-B']);
  });

  it('liveMonitor tick：双拍并发旧拍慢包后到不得顶掉新拍采样、不得错推差分', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore(pinia).me = { username: 't', role: 'ADMIN', fallback: false, grantedPages: null };   // 全放行 → canDiag=true
    useAppStore(pinia).target = 'host';
    const mon = useLiveMonitorStore(pinia);
    mon.start();                                             // 拍 1（挂载启动真实动线，setupTimer 排表）
    mon.setFocus(false);                                     // 离开大屏（降频重排，不发拍）
    mon.setFocus(true);                                      // 回大屏补一针 → 拍 2（真实并发通道）
    expect(pendingBrief.length).toBe(2);
    pendingBrief[1]!.res(NODES('n2', 3000));                 // 新拍快包先落
    await settle(8);
    expect(mon.nodes.map((n: any) => n.name)).toEqual(['n2']);
    expect(mon.qpsSeries.length).toBe(0);                    // 首个有数拍只记基线不推序列
    pendingBrief[0]!.res(NODES('n1', 100));                  // 旧拍慢包后到
    await settle(8);
    expect(mon.nodes.map((n: any) => n.name)).toEqual(['n2']);   // 采样不得回跳旧拍
    expect(mon.qpsSeries.length).toBe(0);                    // 旧拍丢弃不得多推差分点
    /* 续拍验证差分链健康：基线属于新拍，第三拍差分恰推一点且按 n2 基线计算 */
    mon.setFocus(false);
    mon.setFocus(true);                                      // 再补一针 → 拍 3
    await settle(4);
    pendingBrief[2]!.res(NODES('n2', 9000));                 // 与 n2 基线差分（3000→9000）
    await settle(8);
    expect(mon.nodes.map((n: any) => n.name)).toEqual(['n2']);
    expect(mon.qpsSeries.length).toBe(1);
    expect(mon.qpsSeries[mon.qpsSeries.length - 1]).toBeGreaterThan(0);   // 差分按 n2 基线计算而非旧拍 n1
  });

  it('jobTracker poll：双拍并发旧拍清单慢包后到不得顶掉新拍、不得错登记已消失作业', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore(pinia).me = { username: 't', role: 'ADMIN', fallback: false, grantedPages: null };
    const appStore = useAppStore(pinia);
    appStore.hostVisible = true;                             // dataReady → tasks 通道放行
    const jt = useJobTrackerStore(pinia);
    const notifySpy = vi.spyOn(appStore, 'notify');
    const p1 = jt.poll();                                    // 拍 1（慢，job-x RUNNING）
    const p2 = jt.poll();                                    // 拍 2（快，job-y RUNNING）
    expect(pendingAdhoc.length).toBe(2);
    void p1; void p2;
    pendingAdhoc[1]!.res(ADHOC_JOB('job-y', 'RUNNING'));     // 新拍快包先落
    await settle(8);
    expect(jt.jobs.map((j: any) => j.id)).toEqual(['adhoc:job-y']);
    pendingAdhoc[0]!.res(ADHOC_JOB('job-x', 'RUNNING'));     // 旧拍慢包后到
    await settle(8);
    expect(jt.jobs.map((j: any) => j.id)).toEqual(['adhoc:job-y']);   // 清单不得被旧拍顶掉
    expect(jt.jobs.some((j: any) => j.id === 'adhoc:job-x')).toBe(false);
    expect(notifySpy).not.toHaveBeenCalled();                // 旧拍丢弃不得产生任何通知副作用
  });
});
