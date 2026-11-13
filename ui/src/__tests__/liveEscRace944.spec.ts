/**
 * LiveDashboardView 走查四刀（轨6 轮转走查批）：raceGuard859 谱系续演+665 Esc 范式第二处消费点收口+死码域续账。
 *
 * 刀① nodeMode 清场通道世代守卫缺失——watch([windowPts, clusterFilter, nodeMode, topLimit])
 *    清空 topIndexSeries/topTsArr 不推进 loadTop 世代计数：切进节点下钻（按节点默认开+
 *    选定集群）时在途 cluster 拍 Top 回包 seq 仍相等照写 topRows 并重推会话序列——
 *    刚清空的序列被旧拍复活、nodeMode 态持有旧 cluster 行。859 批注释「Top 拍不发属
 *    产品语义」只甄别了新拍不发起，未甄别在途旧拍穿透=清场通道竞态盲区。
 *    修法=清场分支同步推进世代（清场即旧拍全链作废）。
 * 刀② 监控明细 ⋯ 浮层 Esc 收口缺 566 范式件套——onDetailMoreEsc 只关层：
 *    无 stopPropagation（全屏态下 Esc 穿透到 FocusableSurface 的 document 捕获级
 *    监听=⋯ 关+退全屏双关）、无焦点回 summary（铁律 D1#5；同页 .ld-hist-more 的
 *    665 收口两件俱全=同域两口径）。修法=summary 补 ref+处理体对齐 566 件套。
 * 刀③ 服务端告警 chips 容器内恒假空态退役——外层 v-if="srvActive.length" 之内嵌
 *    v-if="!srvActive.length" 分支恒假（死代码）；「无活动告警」活锚在实时告警区维持。
 * 刀④ 死码三件退役——CollapsePanel 死 import（单容器改造后模板零挂载）、
 *    sparklinePointsPct 死解构（卡内迷你 spark 退役后零引用）、topYTop 死 computed
 *    （topYTicks 底座替代后零消费）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* ---- 网络出口 mock：挂载链全量接管（raceGuard859 同源） ---- */
const metricsFn = vi.fn();
const alertsFn = vi.fn();
const topFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterIndices: vi.fn(async () => []),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      health: vi.fn(async () => ({ status: 'green' })),
      clusterHealth: vi.fn(async () => ({})),
      nodesStats: vi.fn(async () => []),
      nodesStatsBrief: vi.fn(async () => []),
      pendingTasks: vi.fn(async () => ({ tasks: [] })),
      monitorMetrics: (...a: any[]) => metricsFn(...a),
      monitorAlerts: (...a: any[]) => alertsFn(...a),
      monitorTopIndexes: (...a: any[]) => topFn(...a),
      ringUsage: vi.fn(async () => ({ auditPrefix: 'a', monitorPrefix: 'm', auditBytes: 1, capBytes: 10, total: 1 })),
    },
  };
});

/* MonacoEditor 同步 stub 兜底真实 import 面（859 同款防御） */
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

/* HistoryChart stub：隔离图卡内部渲染（断言面在视图状态不在图卡） */
vi.mock('../components/HistoryChart.vue', () => ({
  default: {
    name: 'HistoryChart',
    props: ['title', 'unit', 'series', 'forecast', 'note', 'threshold', 'palette', 'gapMs', 'statusBands', 'events'],
    setup() { return {}; },
    template: '<div class="history-stub"></div>',
  },
}));

import LiveDashboardView from '../views/LiveDashboardView.vue';
import { useAuthStore } from '../stores/auth';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(view: any, preMount?: (pinia: ReturnType<typeof createPinia>) => void) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/live');
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
  return { app, host, pinia, auth: useAuthStore(pinia) };
}

/** script setup 根组件的绑定面（767 探针课③合法通道：内部态读数走 setupState） */
function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

/** 按触发序放行 pending（袋序=触发序，859 releaseAt 同源） */
function releaseAt<T extends { res: (v: any) => void }>(bag: T[], i: number, v: any) {
  if (!bag[i]) throw new Error(`pending #${i} 不在场`);
  bag.splice(i, 1)[0].res(v);
}

const pendingMetrics: Array<{ id: string; res: (v: any) => void }> = [];
const pendingAlerts: Array<{ id: string; res: (v: any) => void }> = [];
const pendingTops: Array<{ id: string; res: (v: any) => void }> = [];
const now = Date.now();
const METRICS = (tag: string, conns: string[]) => ({
  records: conns.map(c => ({ timestamp: now, connName: c, heapUsedMb: tag === 'B' ? 5 : 999 })),
});

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  pendingMetrics.length = 0; pendingAlerts.length = 0; pendingTops.length = 0;
  metricsFn.mockReset().mockImplementation(() =>
    new Promise(res => pendingMetrics.push({ id: 'm' + pendingMetrics.length, res })));
  alertsFn.mockReset().mockImplementation(() =>
    new Promise(res => pendingAlerts.push({ id: 'al' + pendingAlerts.length, res })));
  topFn.mockReset().mockImplementation((connId?: string) =>
    new Promise(res => pendingTops.push({ id: String(connId ?? '') + '#' + pendingTops.length, res })));
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('刀①：nodeMode 清场通道世代守卫（raceGuard859 谱系续演）', () => {
  it('切节点下钻清场后，在途 cluster 拍 Top 回包后到不得穿透覆写（新拍/切回重开不受扰）', async () => {
    const { app } = await mountView(LiveDashboardView);
    const st = stateOf(app);
    await settle(4);
    expect(pendingMetrics.length).toBe(1);                    // 挂载首拍
    releaseAt(pendingMetrics, 0, METRICS('A', ['c1', 'c2'])); // 首拍落地 → clusterList=[c1,c2]
    await settle(8);
    st.detailOpen = true;                                     // 展开明细 → Top 拍 A（双拉慢包）
    await settle(6);
    expect(pendingTops.map(p => p.id.split('#')[0])).toEqual(['c1', 'c2']);
    st.clusterFilter = 'c1';                                  // 切节点下钻（按节点默认开）→ nodeMode=true
    await settle(6);
    expect(st.nodeMode).toBe(true);
    expect(st.detailTab).toBe('alert');                       // Top 视图节点态回落告警（既有语义）
    expect(pendingTops.length).toBe(2);                       // 新 Top 拍不发（859 甄别锚维持）
    releaseAt(pendingTops, 0, { records: [{ index: 'idx-A-old', idxRate: 9, connName: 'c1' }] });
    releaseAt(pendingTops, 0, { records: [{ index: 'idx-A-old2', idxRate: 8, connName: 'c2' }] }); /* splice 后次包顶到 0 */
    await settle(8);
    expect(st.topRows, '旧 cluster 拍回包不得穿透 nodeMode 清场').toEqual([]);
    expect(st.topTsArr, '会话时间轴不得被旧拍重推').toEqual([]);
    expect(Object.keys(st.topIndexSeries), '会话累积表不得被旧拍复活').toEqual([]);
    /* 防过修：切回集群态重开 Top 视图，新拍正常写入 */
    st.clusterFilter = '';
    await settle(6);
    expect(st.nodeMode).toBe(false);
    st.detailTab = 'top';
    await settle(6);
    expect(pendingTops.length).toBe(2);                       // 新拍 B（双拉）
    releaseAt(pendingTops, 0, { records: [{ index: 'idx-B-new', idxRate: 5, connName: 'c1' }] });
    releaseAt(pendingTops, 0, { records: [{ index: 'idx-B-new2', idxRate: 4, connName: 'c2' }] }); /* splice 后次包顶到 0 */
    await settle(8);
    expect(st.topRows.map((r: any) => r.index)).toEqual(['idx-B-new', 'idx-B-new2']);
  });
});

describe('刀②：明细 ⋯ 浮层 Esc 收口（665 范式第二处消费点）', () => {
  it('Esc 关层+焦点回 summary；全屏态 Esc 只关 ⋯ 不穿透退全屏', async () => {
    const { app, host } = await mountView(LiveDashboardView);
    const st = stateOf(app);
    await settle(4);
    st.detailOpen = true;
    await settle(4);
    const more = host.querySelector<HTMLDetailsElement>('.ld-detail-more');
    expect(more, '明细 ⋯ 在场').toBeTruthy();
    const sum = more!.querySelector('summary') as HTMLElement;
    sum.click();
    await settle(2);
    expect(more!.open, '前置：开层').toBe(true);
    /* 真实传播链：从 summary 冒泡——window 捕获级 onDetailMoreEsc 与 document 捕获级
       FocusableSurface 监听同链，stop 与否决定事件是否到达下层 */
    sum.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(2);
    expect(more!.open, 'Esc 关层').toBe(false);
    expect(document.activeElement, '焦点回触发钮（铁律 D1#5）').toBe(sum);
    /* 穿透链：全屏态下 ⋯ 开层 → Esc 只关 ⋯，全屏保持 */
    st.fullscreen = true;
    await settle(4);
    sum.click();
    await settle(2);
    expect(more!.open, '前置：全屏态再开层').toBe(true);
    sum.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(2);
    expect(more!.open, '⋯ 关层').toBe(false);
    expect(st.fullscreen, '全屏态保持（stopPropagation 挡住 document 捕获级退全屏）').toBe(true);
  });

  it('源码锁：566 范式件套落 onDetailMoreEsc（summary ref+stopPropagation+focus 还焦）', () => {
    const s = strip(liveSrc);
    expect(s, 'summary 焦点锚').toContain('ref="detailMoreSumEl"');
    const fnIdx = s.indexOf('function onDetailMoreEsc');
    expect(fnIdx).toBeGreaterThan(-1);
    const fnBlock = s.slice(fnIdx, fnIdx + 420);
    expect(fnBlock, '关层态守卫').toMatch(/e\.key !== 'Escape'/);
    expect(fnBlock, '传播截断（全屏态穿透链）').toContain('e.stopPropagation()');
    expect(fnBlock, '焦点回触发钮').toContain('detailMoreSumEl.value?.focus()');
  });
});

describe('刀③④：死码退役（785 死码域续账；活锚维持）', () => {
  it('chips 恒假空态分支退役+死码三件退役（活锚逐件维持）', () => {
    const s = strip(liveSrc);
    expect(s, '刀③：chips 容器内恒假空态分支退役').not.toContain('v-if="!srvActive.length"');
    expect(s, '外层 v-if 维持（livePolish816 F2 联动，属性序双分支）').toMatch(/class="ld-hist-alerts"[^>]*v-if="srvActive\.length"|v-if="srvActive\.length"[^>]*class="ld-hist-alerts"/);
    expect(s, '「无活动告警」活锚维持（实时告警区）').toContain('无活动告警');
    expect(s, '胶囊活锚维持（liveGraph802 D1/livePolish816 F2 联动）').toContain('ld-ok-chip');
    expect(s, '刀④：CollapsePanel 死 import 退役').not.toContain('CollapsePanel');
    expect(s, '刀④：sparklinePointsPct 死解构退役').not.toContain('sparklinePointsPct');
    expect(s, '刀④：topYTop 死 computed 退役').not.toContain('topYTop');
    expect(s, '防过修：活解构 sparklinePoints 维持（任务卡 spark）').toMatch(/sparklinePoints\s*\}\s*from/);
    expect(s, '防过修：topYTicks 底座维持（liveGraph802 A2 联动）').toMatch(/topYTicks/);
  });
});
