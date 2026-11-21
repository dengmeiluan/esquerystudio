/**
 * 横切审计第七轮预扫刀面二：useCountUp 自续约 rAF 循环缺卸载 cancel。
 *
 * 族D（requestAnimationFrame cancel 配对）全量清点 8 消费点，唯一缺口：
 * OverviewView KPI 数字滚动的 step 回调 p<1 时再调度，watch 随组件自动停但
 * 已排程的帧不回收——卸载截在动画中最多再空转一个收敛窗（自熄型低危），
 * 补 onUnmounted cancel 通道闭环。其余消费点（SplitHandle/LiveChartCard/
 * AggBarChart/MonacoEditor/FocusableSurface/LiveDashboard）配对齐整。
 *
 * 行为锚：spy cancelAnimationFrame，挂载期计数清零后只验卸载通道——修复前
 * 卸载零 cancel 调用（红），修复后 useCountUp 两实例各收一帧（≥1 绿）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* ---- 网络出口 mock：OverviewView 挂载/轮询路径全量接管（raceGuard860 同球） ---- */
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterIndices: vi.fn(async () => []),
      overview: vi.fn(async () => ({ indices: [] })),
      health: vi.fn(async () => ({ status: 'green' })),
      clusterHealth: vi.fn(async () => ({ status: 'green' })),
      shards: vi.fn(async () => []),
      nodesStatsBrief: vi.fn(async () => []),
      nodesStats: vi.fn(async () => []),
      pendingTasks: vi.fn(async () => []),
      monitorHistory: vi.fn(async () => ({ records: [] })),
      snapshotRepos: vi.fn(async () => []),
      snapshotList: vi.fn(async () => []),
      snapshotStatusSummary: vi.fn(async () => ({})),
      snapshotStatus: vi.fn(async () => ({})),
      clusterTasks: vi.fn(async () => []),
      xb: { ...actual.api.xb, jobs: vi.fn(async () => []) },
      adhoc: { ...actual.api.adhoc, jobs: vi.fn(async () => []) },
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

import OverviewView from '../views/OverviewView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp({ render: () => h(OverviewView as any) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('useCountUp 卸载通道（rAF 收敛循环随组件终止）', () => {
  it('卸载后 cancelAnimationFrame 被调用（修复前零调用=红）', async () => {
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    const { app } = await mountView();
    cancelSpy.mockClear();
    app.unmount();
    await settle(2);
    expect(cancelSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
