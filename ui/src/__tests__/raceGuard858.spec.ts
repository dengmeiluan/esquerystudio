/**
 * 八百五十八批：横切续轮接力——async 竞态回包卫生续扫（857 族A 范式平移·带参 load 四页）。
 *
 * 857 修了 watch/pick 驱动的 load 四页；本批续扫「带参 load」余量（857 ⑥ 记档点名
 * fetchCompare 等），定谳真缺口四处：
 *   ① DiffEditorView.fetchCompare——Enter 通道无 busy 守卫，改 _id 再按 Enter 后
 *      旧对比双拉后到会覆盖新对比结果（摘要计数与字段差整体回跳）。
 *   ② TaskTreeView.fetchDetail——pick 切节点无守卫，慢详情后到顶掉新选中节点的
 *      Detail JSON；catch 支还会把旧失败(null)盖掉新详情。
 *   ③ DiagView.loadHot——节点行采样钮无 :disabled（页级钮有），连点两节点后旧
 *      采样文本后到顶掉新节点采样；finally 无守卫还会提前熄掉在途 spinner。
 *   ④ AdhocRebuildView.loadDateRisks——粘贴 chip 连切/整单重贴后，旧采样回包后到
 *      复污染风险报告（reset 注释已预警「上一个索引的风险结论留在屏幕上」，守卫缺位）。
 *      守卫锚=选中的粘贴对象身份（pasteIdx 数值跨 apply 轮复用，值比对会被骗过）。
 *
 * 竞态用例三拍驱动（raceGuard857 同源）：双 pending 手控回包次序（快包先落、慢包
 * 后到），断言新选择的数据存活、旧回包被丢弃。视图全真，只 mock ../api 出口。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* ---- 网络出口 mock：四页挂载路径全量接管 ---- */
const getDocFn = vi.fn();
const tasksFn = vi.fn();
const taskDetailFn = vi.fn();
const hotThreadsFn = vi.fn();
const dateFormsFn = vi.fn();
const prepareFn = vi.fn();
const validateFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getDoc: (...a: any[]) => getDocFn(...a),
      putDoc: vi.fn(async () => ({ ok: true })),
      updateDoc: vi.fn(async () => ({ ok: true })),
      clusterIndices: vi.fn(async () => []),
      clusterInspect: vi.fn(async () => ({ mappings: {} })),
      mappingDetail: vi.fn(async () => ({ raw: { properties: {} } })),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterTasks: (...a: any[]) => tasksFn(...a),
      taskDetail: (...a: any[]) => taskDetailFn(...a),
      cancelTask: vi.fn(async () => ({})),
      health: vi.fn(async () => ({ status: 'green' })),
      clusterHealth: vi.fn(async () => ({})),
      nodesStats: vi.fn(async () => NODES_858),
      pendingTasks: vi.fn(async () => ({ tasks: [] })),
      allocationExplain: vi.fn(async () => ({})),
      hotThreads: (...a: any[]) => hotThreadsFn(...a),
      dateForms: (...a: any[]) => dateFormsFn(...a),
      configLab: { ...actual.api.configLab, validate: (...a: any[]) => validateFn(...a) },
      adhoc: { ...actual.api.adhoc, prepare: (...a: any[]) => prepareFn(...a), jobs: vi.fn(async () => []) },
    },
  };
});

/* MonacoEditor 组件 stub（adhocDerivedMapping caps 捕获形态——粘贴驱动走 cap emit；
   monaco-editor api 模块同步 stub 兜底 DiffEditor/JsonArea 域真实 import 面） */
const monacoCaps: { props: any; emit: (e: string, v?: any) => void }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { monacoCaps.push({ props, emit }); return {}; },
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

import DiffEditorView from '../views/DiffEditorView.vue';
import TaskTreeView from '../views/TaskTreeView.vue';
import DiagView from '../views/DiagView.vue';
import AdhocRebuildView from '../views/AdhocRebuildView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(view: any, path = '/') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push(path);
  await router.isReady();
  const app = createApp({ render: () => h(view as any) });
  apps.push(app);
  app.use(createPinia());
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

/** 按 key 精确放行 pending 回包（raceGuard857 release 同源：乱序释放即竞态三拍本体） */
function release<T extends { id: string; res: (v: any) => void }>(bag: T[], id: string, v: any) {
  const i = bag.findIndex(p => p.id === id);
  if (i < 0) throw new Error(`pending ${id} 不在场（挂载链未按预期发起请求）`);
  bag.splice(i, 1)[0].res(v);
}

/* ---- DiffEditor compare 双拉竞态 ---- */
const pendingDocs: Array<{ id: string; res: (v: any) => void }> = [];

/* ---- TaskTree：两根任务，detail 回包带互斥标记 ---- */
const TASKS_858 = [
  { taskId: 'task-a', action: 'indices:data/write/reindex', node: 'node-858a', runningTimeNanos: 40000000000, cancellable: true },
  { taskId: 'task-b', action: 'cluster:monitor/tasks/get', node: 'node-858b', runningTimeNanos: 1500000000, cancellable: false },
];
const pendingDetails: Array<{ id: string; res: (v: any) => void }> = [];

/* ---- Diag：两节点，热线程回包带互斥标记 ---- */
const NODES_858 = [
  { name: 'node-a', roles: ['data'], heapPct: 30, cpuPct: 20, load1: 1 },
  { name: 'node-b', roles: ['master'], heapPct: 40, cpuPct: 25, load1: 2 },
];
const pendingHot: Array<{ id: string; res: (v: any) => void }> = [];

/* ---- AdhocRebuild：粘贴对象身份守卫——三别名三份采样互斥标记。
 fields 名与 mapping 键错位（created ∉ {day}）保证每轮都产出 FIELD_NAME_MISMATCH
 风险行，.ar-risk 头（含「基于 N 条样本」读数）恒可断言 ---- */
const PASTE_AB = [
  { indexKey: 'k1', alias: 'probe-aa', fields: [{ name: 'created', type: 'date' }], mappingJson: '{"properties":{"day":{"type":"keyword"}}}' },
  { indexKey: 'k2', alias: 'probe-bb', fields: [{ name: 'created', type: 'date' }], mappingJson: '{"properties":{"day":{"type":"keyword"}}}' },
];
const PASTE_C = [
  { indexKey: 'k3', alias: 'probe-cc', fields: [{ name: 'created', type: 'date' }], mappingJson: '{"properties":{"day":{"type":"keyword"}}}' },
];
const pendingForms: Array<{ id: string; res: (v: any) => void }> = [];
const FORMS = (sampled: number) => ({ sampled, sampling: 'terms', forms: {} });

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  monacoCaps.length = 0;
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  pendingDocs.length = 0; pendingDetails.length = 0; pendingHot.length = 0; pendingForms.length = 0;
  getDocFn.mockReset().mockImplementation((idx: string, id: string) =>
    new Promise(res => pendingDocs.push({ id: idx + '/' + id, res })));
  tasksFn.mockReset().mockResolvedValue(TASKS_858);
  taskDetailFn.mockReset().mockImplementation((id: string) =>
    new Promise(res => pendingDetails.push({ id, res })));
  hotThreadsFn.mockReset().mockImplementation((_a: any, _b: any, _c: any, nodeId?: string) =>
    new Promise(res => pendingHot.push({ id: String(nodeId ?? ''), res })));
  dateFormsFn.mockReset().mockImplementation((alias: string) =>
    new Promise(res => pendingForms.push({ id: alias, res })));
  prepareFn.mockReset().mockResolvedValue({
    index: 'probe-aa', isAlias: true, physicals: ['probe-aa-v1'],
    sourcePhysical: 'probe-aa-v1', docCount: 1,
    settingsJson: '{"index":{"number_of_replicas":1}}',
    mappingJson: '{"properties":{"day":{"type":"keyword"}}}',
    suggestedDest: 'probe-aa-v2', timeFieldCandidates: [],
  });
  validateFn.mockReset().mockResolvedValue({ valid: true, errorCount: 0, warnCount: 0, infoCount: 0, issues: [] });
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('858 族：async 竞态回包卫生续扫——带参 load 四页（857 三拍范式平移）', () => {
  it('DiffEditor compare：改 _id 连按两次 Enter，慢包后到不得顶掉新对比结果', async () => {
    history.replaceState(null, '', '#/?idx=probe-a&mode=compare&b=probe-b&id=doc1');
    const host = await mountView(DiffEditorView, '/');
    await settle(8);
    expect(pendingDocs.map(p => p.id)).toEqual(['probe-a/doc1', 'probe-b/doc1']);
    const idInp = host.querySelector<HTMLInputElement>('input[placeholder="文档 ID"]')!;
    expect(idInp).toBeTruthy();
    idInp.value = 'doc2';
    idInp.dispatchEvent(new Event('input', { bubbles: true }));
    idInp.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    await settle(8);
    expect(pendingDocs.map(p => p.id)).toEqual(['probe-a/doc1', 'probe-b/doc1', 'probe-a/doc2', 'probe-b/doc2']);
    /* doc2 对：改 2（title+flag）+ 仅 B 有 1（extra）；doc1 对：改 1（views） */
    release(pendingDocs, 'probe-a/doc2', { _id: 'doc2', _source: { title: 'diff-a', flag: 'x' } });
    release(pendingDocs, 'probe-b/doc2', { _id: 'doc2', _source: { title: 'diff-b', flag: 'y', extra: 'z' } });
    await settle(8);
    const sumTxt = () => (host.querySelector('.df-cmp-sum')?.textContent || '').replace(/\s+/g, '');
    expect(sumTxt()).toContain('改2');
    release(pendingDocs, 'probe-a/doc1', { _id: 'doc1', _source: { title: 'same', views: 1 } });   // 慢包后到
    release(pendingDocs, 'probe-b/doc1', { _id: 'doc1', _source: { title: 'same', views: 9 } });
    await settle(8);
    expect(sumTxt()).toContain('改2');
    expect(sumTxt()).not.toContain('改1');
  });

  it('TaskTree：连点两节点，慢详情后到不得顶掉新选中节点的 Detail JSON', async () => {
    const host = await mountView(TaskTreeView);
    await settle(8);
    const rows = host.querySelectorAll<HTMLElement>('.tt-node .tr');
    expect(rows.length).toBe(2);
    rows[0]!.click();                               // pick task-a → detail 慢包
    await settle(4);
    rows[1]!.click();                               // pick task-b → detail 快包
    await settle(4);
    expect(pendingDetails.map(p => p.id)).toEqual(['task-a', 'task-b']);
    release(pendingDetails, 'task-b', { taskId: 'task-b', marker: 'DETAIL-BBB' });   // 快包先落
    await settle(8);
    let json = host.querySelector('.json-view')?.textContent || '';
    expect(json).toContain('DETAIL-BBB');
    release(pendingDetails, 'task-a', { taskId: 'task-a', marker: 'DETAIL-AAA' });   // 慢包后到
    await settle(8);
    json = host.querySelector('.json-view')?.textContent || '';
    expect(json).toContain('DETAIL-BBB');
    expect(json).not.toContain('DETAIL-AAA');
  });

  it('Diag：连点两节点采热线程（行内钮无 disabled），慢采样后到不得顶掉新节点结果', async () => {
    const host = await mountView(DiagView);
    await settle(10);
    const hotBtns = host.querySelectorAll<HTMLButtonElement>('button[aria-label^="按节点"]');
    expect(hotBtns.length).toBe(2);
    hotBtns[0]!.click();                            // node-a 采样（慢包）
    await settle(4);
    hotBtns[1]!.click();                            // node-b 采样（快包）
    await settle(4);
    expect(pendingHot.map(p => p.id)).toEqual(['node-a', 'node-b']);
    release(pendingHot, 'node-b', 'HOT-THREADS-BBB');   // 快包先落
    await settle(8);
    const hotTxt = () => host.querySelector('.dg-hot-pre')?.textContent || '';
    expect(hotTxt()).toContain('HOT-THREADS-BBB');
    release(pendingHot, 'node-a', 'HOT-THREADS-AAA');   // 慢包后到
    await settle(8);
    expect(hotTxt()).toContain('HOT-THREADS-BBB');
    expect(hotTxt()).not.toContain('HOT-THREADS-AAA');
  });

  it('AdhocRebuild：chip 连切+整单重贴后，旧采样回包后到不得复污染风险报告（身份守卫语义）', async () => {
    const host = await mountView(AdhocRebuildView);
    await settle(8);
    const pasteVia = async (rows: Record<string, unknown>[]) => {
      const cap = monacoCaps.find(c => c.props.height === 'min(60vh, 420px)');
      expect(cap, 'pasteRaw Monaco（默认档 min(60vh, 420px)）必须在位').toBeTruthy();
      cap!.emit('update:modelValue', JSON.stringify(rows));
      await nextTick();
      const btn = [...(host.querySelector('.ar-paste') as HTMLElement).querySelectorAll('button')]
        .find(x => /预填|应用|解析|载入|确定/.test(x.textContent || ''));
      expect(btn, '粘贴应用按钮必须在位').toBeTruthy();
      btn!.click();
      await settle(8);
    };
    await pasteVia(PASTE_AB);                       // 整单 A+B → 自动 pick 0（probe-aa 慢包）
    const chips = host.querySelectorAll<HTMLButtonElement>('.ar-paste-list button');
    expect(chips.length).toBe(2);
    chips[1]!.click();                              // 切 chip 1（probe-bb 快包）
    await settle(4);
    expect(pendingForms.map(p => p.id)).toEqual(['probe-aa', 'probe-bb']);
    release(pendingForms, 'probe-bb', FORMS(55));   // 快包先落（报告数据就绪；块在审编步才渲染）
    await settle(8);
    await pasteVia(PASTE_C);                        // 整单重贴 C → pasteList 重建、pick 0（probe-cc）
    await settle(4);
    expect(pendingForms.map(p => p.id)).toContain('probe-cc');
    /* 风险报告块挂 step 2（选策略）节——审阅(1)→校验并继续(2) 两跳推进后再断言 */
    const clickBtn = async (re: RegExp) => {
      const btn = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => re.test(b.textContent || ''));
      expect(btn, `按钮必须存在：${re}`).toBeTruthy();
      btn!.click();
      await settle(8);
    };
    await clickBtn(/下一步：审阅/);                  // step 0 → 1
    await clickBtn(/校验并继续/);                    // step 1 → 2（validate mock 恒 valid）
    release(pendingForms, 'probe-cc', FORMS(77));   // 新单快包落定
    await settle(8);
    const riskTxt = () => (host.querySelector('.ar-risk-hd')?.textContent || '').replace(/\s+/g, '');
    expect(riskTxt()).toContain('基于77条样本');
    release(pendingForms, 'probe-aa', FORMS(11));   // 第一轮慢包后到（pasteIdx 数值仍为 0——值比对会被骗过）
    await settle(8);
    expect(riskTxt()).toContain('基于77条样本');
    expect(riskTxt()).not.toContain('基于11条样本');
    expect(riskTxt()).not.toContain('基于55条样本');
  });
});

describe('858 源码锁：AdhocRebuild reset 清 riskBusy（守卫 finally 跳复位时不卡死采样钮）', () => {
  it('reset 块显式复位 riskBusy——过期回包 finally 被守卫跳过后，busy 不残留', () => {
    const src = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');
    const resetIdx = src.indexOf("pasteRaw.value = '';");
    expect(resetIdx).toBeGreaterThan(-1);
    const resetBlock = src.slice(resetIdx, resetIdx + 900);
    expect(resetBlock, 'reset 块须显式清 riskBusy（loadDateRisks 守卫式 finally 会跳过过期复位的路径）').toContain('riskBusy.value = false;');
  });
});
