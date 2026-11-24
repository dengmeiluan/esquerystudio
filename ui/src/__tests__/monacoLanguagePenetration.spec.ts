/** ux2 Task 8/9：换壳视图 Monaco 语言/高度/只读契约渗透（一份文件管两个 Task）。
 *  组件 stub 范式同 devtoolsSmartAssist L57-67（setup 闭包迟引用 monacoCaps，无 TDZ）。
 *  mock 面一次给全（含 Task 9 视图的 listStoredScripts/adhoc.jobs）——Task 9 只加用例零改本区。 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* 防御性 stub 挡真实 fetch 噪音（store.loadIndices / IndexPicker 链路） */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      /* useIndexFields 出口（ReindexPreview rpAssist；空 properties → fields []） */
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      /* Task 8 用例①：doRun 默认走严格 sqlJson（数组/多值字段不静默取首值） */
      sqlLenient: vi.fn(() => Promise.resolve({ columns: [], rows: [] })),
      sqlJson: vi.fn(() => Promise.resolve({ columns: [], rows: [] })),
      /* Task 9 修复轮 ⑥b：doSubmit 出口（BulkEditor bulk 写入 spy） */
      bulk: vi.fn(() => Promise.resolve({})),
      /* Task 9 用例③：PainlessLab onMounted(loadStored) 出口（L178 r?.scripts 形态） */
      listStoredScripts: () => Promise.resolve({ scripts: {} }),
      /* Task 9 用例⑦：AdhocRebuild onMounted(loadJobs) 出口（L795 api.adhoc.jobs） */
      adhoc: { ...actual.api.adhoc, jobs: () => Promise.resolve([]) },
    },
  };
});

/* Task 9 修复轮 ⑥b：askConfirm 调用面 spy（空档守卫断言锚点；默认返回 undefined=取消，防真弹窗挂住） */
const askConfirmFn = vi.hoisted(() => vi.fn());
vi.mock('../composables/confirm', () => ({ askConfirm: (...args: any[]) => askConfirmFn(...args) }));

const monacoCaps: { props: any; emit: (e: string, v?: any) => void }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { monacoCaps.push({ props, emit }); return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

import { api } from '../api';
import SqlConsoleView from '../views/SqlConsoleView.vue';
import ReindexPreviewView from '../views/ReindexPreviewView.vue';
import PainlessLabView from '../views/PainlessLabView.vue';
import UpdateByQueryView from '../views/UpdateByQueryView.vue';
import ReindexAdvancedView from '../views/ReindexAdvancedView.vue';
import BulkEditorView from '../views/BulkEditorView.vue';
import AdhocRebuildView from '../views/AdhocRebuildView.vue';
import SynonymsManagerView from '../views/SynonymsManagerView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(comp: any, hash = '#/') {
  location.hash = hash;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(comp) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  monacoCaps.length = 0;
  vi.clearAllMocks(); /* 清调用记录不清实现 */
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
});

describe('ux2 Task 8 换壳渗透', () => {
  it('① SqlConsoleView：sql 可写 100% 弹性(v3.0.1 屏幕自适应)；execute 默认走严格 sqlJson（fetch_size 默认 200）', async () => {
    await mountView(SqlConsoleView, '#/sql');
    expect(monacoCaps.length, 'SQL 编辑器恰 1 枚 Monaco').toBe(1);
    expect(monacoCaps[0].props.language).toBe('sql');
    expect(monacoCaps[0].props.readonly, 'SQL 栏可写').toBeFalsy();
    expect(monacoCaps[0].props.height).toBe('100%');
    monacoCaps[0].emit('update:modelValue', 'SELECT 1');
    await settle();
    monacoCaps[0].emit('execute');
    await settle();
    expect(api.sqlJson).toHaveBeenCalledTimes(1);
    expect(api.sqlJson).toHaveBeenCalledWith(JSON.stringify({ query: 'SELECT 1', fetch_size: 200 }), expect.any(AbortSignal));
    expect(api.sqlLenient).not.toHaveBeenCalled();
  });

  it('② ReindexPreviewView：JsonArea 统一件(fill→100% 随 pane 弹性) + dslAssist search 档（fields 函数/空索引早退零网络）', async () => {
    await mountView(ReindexPreviewView, '#/reindex-preview');
    expect(monacoCaps.length, 'queryBody 编辑器恰 1 枚 Monaco').toBe(1);
    const cap = monacoCaps[0];
    expect(cap.props.language).toBe('json');
    expect(cap.props.height, '五百一十九批：JsonArea fill → 100%（原 rows=11→225px 定高退役）').toBe('100%');
    expect(cap.props.modelValue, 'useDraft 默认 match_all 骨架在位').toContain('match_all');
    expect(typeof cap.props.dslAssist?.fields, 'fields 必须是函数').toBe('function');
    expect(typeof cap.props.dslAssist?.bodyKind, 'bodyKind 必须是函数').toBe('function');
    expect(cap.props.dslAssist.bodyKind()).toBe('search');
    expect(cap.props.dslAssist.fields(), '无源索引时字段档空（ensure 空索引早退）').toEqual([]);
  });
});

describe('ux2 Task 9 六视图换壳渗透', () => {
  it('③ PainlessLabView：source/params 100% 弹性(v3.0.1 屏幕自适应,原 150/110px)；524 批主编辑面接 painless assist', async () => {
    await mountView(PainlessLabView, '#/painless-lab');
    expect(monacoCaps.length, 'source/params 恰 2 枚 Monaco').toBe(2);
    expect(monacoCaps[0].props.language).toBe('painless');
    expect(monacoCaps[0].props.height).toBe('100%');
    expect(monacoCaps[1].props.language).toBe('json');
    expect(monacoCaps[1].props.height).toBe('100%');
    /* 五百二十四批：主编辑面（painless）必接 dslAssist（本页无索引上下文 fields 恒空——
       四骨架补全不依赖 fields，hover 空表静默）；params JSON 面不接 */
    expect(typeof monacoCaps[0].props.dslAssist?.fields).toBe('function');
    expect(monacoCaps[0].props.dslAssist.fields()).toEqual([]);
    expect(monacoCaps[1].props.dslAssist, 'params JSON 面零 assist').toBeUndefined();
  });

  it('④ UpdateByQueryView：scriptSource painless 110px（mode 默认 update 直渲，L152）；524 批接 assist', async () => {
    await mountView(UpdateByQueryView, '#/update-by-query?idx=logs-*');
    /* find 钉特征不用下标——JsonArea Task 10 换 Monaco 后 caps 总数变，本断言不返工 */
    const cap = monacoCaps.find(c => c.props.language === 'painless');
    expect(cap, 'scriptSource Monaco（painless）必须在位').toBeTruthy();
    expect(cap!.props.height).toBe('max(110px, 42vh)'); /* 528 批 W-C：28vh 合并 42vh 弹性档+usePref 三档（SCRIPT_H_TIERS 首档） */
    /* 五百二十四批：painless 面接 assist——fields 与 query 口同源（uqQueryAssist 同一 useIndexFields 出口） */
    expect(typeof cap!.props.dslAssist?.fields).toBe('function');
  });

  it('⑤ ReindexAdvancedView：scriptSource painless max(110px, 42vh) 弹性档；524 批接 assist', async () => {
    await mountView(ReindexAdvancedView, '#/reindex-advanced');
    const cap = monacoCaps.find(c => c.props.language === 'painless');
    expect(cap, 'scriptSource Monaco（painless）必须在位').toBeTruthy();
    expect(cap!.props.height).toBe('max(110px, 42vh)'); /* 528 批 W-C：28vh→42vh 三档循环首档（⑤ 同口径同步更新） */
    /* 五百二十四批：painless 面接 assist——fields 与源 query 口同源（raQueryAssist 出口） */
    expect(typeof cap!.props.dslAssist?.fields).toBe('function');
  });

  it('⑥ BulkEditorView：body ndjson 100% 弹性（独立 monarch 语言，不吃 json LS 多根对象误报）', async () => {
    await mountView(BulkEditorView, '#/bulk-editor?idx=logs-*');
    expect(monacoCaps.length, 'body 编辑器恰 1 枚 Monaco（JsonTree 非 Monaco）').toBe(1);
    expect(monacoCaps[0].props.language).toBe('ndjson');
    expect(monacoCaps[0].props.height).toBe('100%'); /* 五百一十九批：330px 定高 → 100% 随 pane 弹性 */
  });

  it('⑥b BulkEditorView 空档守卫：body 空（opsCount=0）时 execute 不到 askConfirm/api.bulk（按钮 disabled 双门的函数级补位）', async () => {
    await mountView(BulkEditorView, '#/bulk-editor?idx=logs-*');
    monacoCaps[0].emit('execute');
    await settle();
    expect(askConfirmFn, '空档不得弹任何确认框').not.toHaveBeenCalled();
    expect(api.bulk, '空档不得发 bulk 请求').not.toHaveBeenCalled();
  });

  it('⑦ AdhocRebuildView：pasteRaw json min(60vh, 420px) 弹性档（531 批：min(200px, 24vh) 定高升视口弹性）', async () => {
    await mountView(AdhocRebuildView, '#/adhoc-rebuild');
    const cap = monacoCaps.find(c => c.props.height === 'min(60vh, 420px)');
    expect(cap, 'pasteRaw Monaco（min(60vh, 420px)）必须在位').toBeTruthy();
    expect(cap!.props.language).toBe('json');
  });

  it('⑧ SynonymsManagerView：raw synonyms 100% 弹性(v3.0.1 屏幕自适应)，默认教学文本在位', async () => {
    await mountView(SynonymsManagerView, '#/synonyms?idx=logs-*');
    expect(monacoCaps.length, 'raw 编辑器恰 1 枚 Monaco').toBe(1);
    expect(monacoCaps[0].props.language).toBe('synonyms');
    expect(monacoCaps[0].props.height).toBe('100%');
    expect(monacoCaps[0].props.modelValue, 'raw 默认教学文本（L123-128）直渲').toContain('elasticsearch, es, elastic search');
  });
});
