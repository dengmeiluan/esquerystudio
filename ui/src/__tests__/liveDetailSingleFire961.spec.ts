/**
 * 九百六十一批：LiveDashboardView 监控明细懒加载「同 tick 双发」收敛单源（真挂载行为锚三段）。
 *
 * 矿相：toggleDetail()/switchDetail() 函数体各有一次 ensureDetailLoad() 直调，
 * 而 watch(detailOpen)/watch(detailTab) 又对同一状态变化再调一次——按钮/切档
 * 通道每次交互同 tick 双入口双发：loadTop/loadSlow 各拉两拍（topSeq/slowSeq
 * 世代守卫只丢弃旧拍回包，不省网络：每交互双倍请求，Top 合并视图=每拍
 * 集群数 × 2 条）。raceGuard859 行为测试全走「直写 state」通道（watch 单发），
 * 按钮通道双发从未被覆盖=测试域盲区。修法：函数体直调退役，watch 成为唯一
 * 触发源（单点收敛；直写 state 的外部通道天然受 watch 覆盖）。
 *
 * 驱动方式照 raceGuard859 LiveDashboard 段（视图全真 + 只 mock ../api 出口 +
 * Monaco/HistoryChart stub + 手控回包袋；S1/S2 走组件方法通道=按钮真实动线）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* ---- 网络出口 mock：LiveDashboard 挂载路径全量接管（raceGuard859 同款裁剪） ---- */
const metricsFn = vi.fn();
const alertsFn = vi.fn();
const topFn = vi.fn();
const opsAuditFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterIndices: vi.fn(async () => []),
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
      monitorMetrics: (...a: any[]) => metricsFn(...a),
      monitorAlerts: (...a: any[]) => alertsFn(...a),
      monitorTopIndexes: (...a: any[]) => topFn(...a),
      auth: { ...actual.api.auth, opsAudit: (...a: any[]) => opsAuditFn(...a) },
      ringUsage: vi.fn(async () => ({ auditPrefix: 'a', monitorPrefix: 'm', auditBytes: 1, capBytes: 10, total: 1 })),
    },
  };
});

/* MonacoEditor 组件 stub（LiveDashboard onMounted 调 mon.start()/setFocus——stub 须暴露） */
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

/* HistoryChart 组件 stub（曲线 props 断言面本批不消费，占位挡真实渲染） */
vi.mock('../components/HistoryChart.vue', () => ({
  default: {
    name: 'HistoryChart',
    props: ['title', 'unit', 'series', 'forecast', 'note', 'threshold', 'palette', 'gapMs', 'statusBands', 'events'],
    setup() { return {}; },
    template: '<div class="history-stub"></div>',
  },
}));

import LiveDashboardView from '../views/LiveDashboardView.vue';
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

/** 按触发序放行 pending 回包（859 releaseAt 同源） */
function releaseAt<T extends { res: (v: any) => void }>(bag: T[], i: number, v: any) {
  if (!bag[i]) throw new Error(`pending #${i} 不在场`);
  bag.splice(i, 1)[0].res(v);
}

/* ---- LiveDashboard：metrics/top/slow 手控回包袋 ---- */
const pendingMetrics: Array<{ id: string; res: (v: any) => void }> = [];
const pendingTops: Array<{ id: string; res: (v: any) => void }> = [];
const pendingSlows: Array<{ id: string; res: (v: any) => void }> = [];
const now = Date.now();
const METRICS = (tag: string, conns: string[]) => ({
  records: conns.map(c => ({ timestamp: now, connName: c, heapUsedMb: tag === 'B' ? 5 : 999 })),
});

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  pendingMetrics.length = 0; pendingTops.length = 0; pendingSlows.length = 0;
  metricsFn.mockReset().mockImplementation(() =>
    new Promise(res => pendingMetrics.push({ id: 'm' + pendingMetrics.length, res })));
  alertsFn.mockReset().mockImplementation(() => Promise.resolve({ records: [] }));
  topFn.mockReset().mockImplementation((connId?: string) =>
    new Promise(res => pendingTops.push({ id: String(connId ?? '') + '#' + pendingTops.length, res })));
  opsAuditFn.mockReset().mockImplementation(() =>
    new Promise(res => pendingSlows.push({ id: 's' + pendingSlows.length, res })));
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

function mountLive() {
  return mountView(LiveDashboardView, '/', p => {
    useAuthStore(p).me = { username: 't', role: 'ADMIN', fallback: false };
  });
}

describe('961 LiveDashboard 监控明细懒加载单发收敛', () => {
  it('S1 toggle 开启单发：按钮通道（toggleDetail）开容器只拉一拍 Top（体+watch 同 tick 双发=矿红证）', async () => {
    const { app } = await mountLive();
    const st = stateOf(app);
    await settle(4);
    releaseAt(pendingMetrics, 0, METRICS('A', ['c1', 'c2'])); // 首拍落地 → clusterList=[c1,c2]
    await settle(8);
    st.toggleDetail(); // 按钮通道（非直写 state；859 行为测试全走直写=盲区）
    await settle(6);
    expect(pendingTops.map(p => p.id.split('#')[0])).toEqual(['c1', 'c2']); // 闸前实测 c1,c2,c1,c2
  });

  it('S2 切档单发：switchDetail 切 slow 只拉一拍（同 tick 双发=矿红证）', async () => {
    const { app } = await mountLive();
    const st = stateOf(app);
    await settle(4);
    expect(st.detailTabs.some((t: any) => t.k === 'slow'), '慢请求明细页签在场（ADMIN 视角）').toBe(true);
    st.toggleDetail(); // 开容器（seg 收起态隐藏=切档必在展开态；watch(detailOpen) → top 拍）
    await settle(6);
    st.switchDetail('slow');
    await settle(6);
    expect(pendingSlows.length, '闸前实测 2 发').toBe(1);
  });

  it('S3 watch 通道在场：直写 detailTab 仍触发懒加载（体调用退役后唯一触发源不许死）', async () => {
    const { app } = await mountLive();
    const st = stateOf(app);
    await settle(4);
    releaseAt(pendingMetrics, 0, METRICS('A', ['c1', 'c2']));
    await settle(8);
    st.toggleDetail();
    await settle(6);
    const afterToggle = pendingTops.length;
    st.detailTab = 'alert'; // 直写（859 竞态动线）：alert 分支零拉取
    await settle(6);
    st.detailTab = 'top'; // 直写回 top → watch → ensureDetailLoad → topRows 空仍拉
    await settle(6);
    expect(pendingTops.length).toBe(afterToggle + 2);
    expect(pendingTops.slice(afterToggle).map(p => p.id.split('#')[0])).toEqual(['c1', 'c2']);
  });
});
