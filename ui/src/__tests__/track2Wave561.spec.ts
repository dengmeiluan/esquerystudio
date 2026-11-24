/**
 * GOAL-534 （轨2，工蚁 B'）：IndexHub 部分分片失败黄条 + 两 RT export-name
 * +  Ctrl+I 两处补锚。
 *
 * 背景：
 * ① DslQueryView  P1-7 有「部分分片失败黄条」（shardsHint 统一口径：_shards.failed/
 *    timed_out>0 = 结果可能不完整，诚实呈现），IndexHub docs/query 两 tab 的检索响应同结构
 *    （api.clusterQuery 裸透传，运行时字段 _shards；类型侧 types.ts SearchResp.shards 是 
 *    预留消费位）却无同款提示——补齐：独立 computed×2 + 独立黄条块×2（role=status，
 *    .ih-partial 新类名，扁平样式 warn 色+warn-soft 底+--r-s 圆角、无新壳边框；可关闭）。
 *    独立块插 HistogramSection 与 err-bar/RT 之间，不进 ih-qerr 既有 v-if/v-else-if 链
 *    （上游锁面零触），高度链零触（内容增量不进 min-height 链）。
 * ② docs RT export-name="ih-docs" / query RT export-name="ih-qry"（ W-D 导出契约
 *    消费位补齐；rtTag 切片锁 :144-148 只增属性行安全；命名 ih- 前缀不撞既有名）。
 * ③ HotkeyPanel「查询工作台编辑器补全」Ctrl+I 行——前工蚁 B1 已落（本 spec 只补锚）。
 * ④ DslQueryView Ctrl+I addCommand——同前工蚁 B1 已落（本 spec 只补锚）。
 *    ⚠  Ctrl+I 落点随 DslQueryView 在途态，若对方波重排需同步更新（readFileSync 只读锚）。
 *
 * 设施：ihUnify554 同款 monaco stub + 只 mock ../api + 裸 createApp 挂载（行为网）；
 * 源码锚全部走新建切片（本 describe 自有区间），不插入既有顺序锁区间。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* monaco editor.api stub——ihUnify554/indexHubExec534 同款（斩断真实 monaco 导入链） */
vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  editor: {
    defineTheme: () => {},
    create: () => ({
      onDidChangeModelContent: () => ({ dispose() {} }),
      addAction: () => {},
      getValue: () => '',
      setValue: () => {},
      updateOptions: () => {},
      getAction: () => null,
      getSelection: () => null,
      executeEdits: () => {},
      focus: () => {},
      deltaDecorations: () => [],
      getModel: () => null,
      dispose: () => {},
    }),
    setTheme: () => {},
    setModelMarkers: () => {},
  },
  languages: {
    registerCompletionItemProvider: () => ({ dispose() {} }),
    registerHoverProvider: () => ({ dispose() {} }),
    register: () => {},
    setMonarchTokensProvider: () => {},
    setLanguageConfiguration: () => {},
    registerCodeActionProvider: () => ({ dispose() {} }),
    json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
    CompletionItemKind: { Property: 9, Snippet: 27, Field: 3, Keyword: 17, Value: 13 },
    CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
  },
  Range: class {},
  KeyMod: { CtrlCmd: 2048 },
  KeyCode: { Enter: 3 },
  MarkerSeverity: { Hint: 1, Warning: 8 },
}));
vi.mock('monaco-editor/esm/vs/language/json/monaco.contribution', () => ({}));
vi.mock('monaco-editor/esm/vs/basic-languages/sql/sql.contribution', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/folding/browser/folding', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/find/browser/findController', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/format/browser/formatActions', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/comment/browser/comment', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({ default: class {} }));
vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({ default: class {} }));

const clusterQueryFn = vi.fn();
const mappingDetailFn = vi.fn();
const indexSettingsFn = vi.fn();
const shardsFn = vi.fn();
const aliasesFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterQuery: (...a: any[]) => clusterQueryFn(...a),
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      indexSettings: (...a: any[]) => indexSettingsFn(...a),
      shards: (...a: any[]) => shardsFn(...a),
      aliases: (...a: any[]) => aliasesFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
    },
  };
});

import IndexHubView from '../views/IndexHubView.vue';
import { useAppStore } from '../stores/app';
import { __clearFieldCache } from '../composables/useIndexFields';

const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
/* ③④ 只读补锚：B1 已完成件（零触碰，只断言） */
const hkp = readFileSync(join(__dirname, '../components/HotkeyPanel.vue'), 'utf-8');
const dqv = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

async function settle(n = 10) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountHub() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(IndexHubView as any) });
  apps.push(app);
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { host, router, st: useAppStore(pinia) };
}

/* RT 标签切片（ihUnify554 同款切法，本 spec 自有副本） */
function rtTag(src: string, ref: string): string {
  const start = src.indexOf('<ResultTable ref="' + ref + '"');
  expect(start, 'RT 消费标签存在（防空跑）').toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('</ResultTable>', start));
}
/* 函数体切片（ihUnify554 fnBody 同款，本 spec 自有副本） */
function fnBody(src: string, name: string): string {
  const start = src.indexOf('async function ' + name + '()');
  expect(start, name + ' 在场（防空跑）').toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('\nasync function ', start + 1) === -1 ? src.length : src.indexOf('\nasync function ', start + 1));
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  __clearFieldCache();
  mappingDetailFn.mockReset().mockResolvedValue({ index: 'a-idx', raw: { properties: {} } });
  indexSettingsFn.mockReset().mockResolvedValue({ index: { refresh_interval: '1s', number_of_replicas: '1' } });
  shardsFn.mockReset().mockResolvedValue([]);
  aliasesFn.mockReset().mockResolvedValue([]);
  clusterQueryFn.mockReset().mockResolvedValue({ took: 3, hits: [{ _id: '1', _source: { name: 'b' } }], total: 2 });
});
afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
});

/* ═══════════ ① 一：部分分片失败黄条——源码锚（新建切片，不进既有锁区间） ═══════════ */
describe('561 ①：IH 部分分片失败黄条（DQ shardsHint 先例同口径，docs/query 独立 computed）', () => {
  it('统一件接线：shardsHint 导入 + 两独立 computed（query 读直通 _shards / docs 读旁路 ref）', () => {
    expect(ih).toContain("import { shardsHint } from '../utils/shardsHint';");
    expect(ih).toMatch(/const qryPartialHint = computed\(\(\) => shardsHint\(\(qryResp\.value as any\)\?._shards \?\? null\)\);/);
    expect(ih).toMatch(/const docsPartialHint = computed\(\(\) => shardsHint\(docsShards\.value\)\);/);
    /* 可关闭 + 新响应自动重现（DQ watch 同款） */
    expect(ih).toMatch(/const qryPartialDismissed = ref\(false\);/);
    expect(ih).toMatch(/const docsPartialDismissed = ref\(false\);/);
    expect(ih).toMatch(/watch\(\(\) => qryResp\.value, \(\) => \{ qryPartialDismissed\.value = false; \}\);/);
    /* docs 侧响应不整存：dismissed 复位直接落 runDocs 成功路径（等价 DQ watch(resp) 语义，免对象身份判定） */
    expect(fnBody(ih, 'runDocs')).toContain('docsPartialDismissed.value = false;');
  });
  it('runDocs 分片旁路：成功路径落 docsShards（响应不整存，只留黄条消费位）', () => {
    const body = fnBody(ih, 'runDocs');
    expect(body).toContain('docsShards.value = (r as any)._shards');
  });
  it('切索引清场：docsShards 归零（watch(cur) 旧命中集清场同语义）', () => {
    expect(ih).toContain('docsShards.value = null;');
  });
  it('docs tab 位序：HistogramSection → 黄条 → docsRan 结果域（独立块不破 docsRan/docsErr v-if 链）', () => {
    const seg = ih.slice(ih.indexOf("tab === 'docs'"), ih.indexOf("tab === 'query'"));
    const hist = seg.indexOf('<HistogramSection');
    const partial = seg.indexOf('class="ih-partial');
    const ran = seg.indexOf('<template v-if="docsRan">');
    expect(hist).toBeGreaterThan(-1);
    expect(partial, '黄条在直方图后').toBeGreaterThan(hist);
    expect(ran).toBeGreaterThan(-1);
    expect(partial, '黄条在结果域前').toBeLessThan(ran);
    expect(seg).toContain('<div v-if="docsPartialHint && !docsPartialDismissed" class="ih-partial mono" role="status">');
  });
  it('query tab 位序：HistogramSection → 黄条 → ih-qerr err-bar（独立块不进 v-if/v-else-if 链，链首原样）', () => {
    const seg = ih.slice(ih.indexOf("<template v-else-if=\"tab === 'query'\">"), ih.indexOf('<!-- Settings -->'));
    const hist = seg.indexOf('<HistogramSection');
    const partial = seg.indexOf('class="ih-partial');
    const err = seg.indexOf('<div v-if="qryErr" role="alert" class="err-bar ih-qerr">');
    expect(hist).toBeGreaterThan(-1);
    expect(partial, '黄条在直方图后').toBeGreaterThan(hist);
    expect(err, 'err-bar 链首原样在场').toBeGreaterThan(-1);
    expect(partial, '黄条在 err-bar 前').toBeLessThan(err);
    expect(seg).toContain('<div v-if="qryPartialHint && !qryPartialDismissed" class="ih-partial mono" role="status">');
  });
  it('扁平样式：warn 色+warn-soft 底+--r-s 圆角，无新壳边框（无 border: 声明）', () => {
    const m = ih.match(/\.ih-partial \{[^}]*\}/);
    expect(m, '.ih-partial 样式规则在场').toBeTruthy();
    expect(m![0]).toMatch(/color:\s*var\(--warn\)/);
    expect(m![0]).toMatch(/background:\s*var\(--warn-soft\)/);
    expect(m![0]).toMatch(/border-radius:\s*var\(--r-s\)/);
    expect(m![0], '无新壳边框（border-radius 圆角不算边框）').not.toMatch(/border:\s/);
  });
});

/* ═══════════ ① 二：行为网（failed>0 出条 / 干净零条 / 关闭重现） ═══════════ */
describe('561 ①：黄条行为网（裸 createApp 挂载，ihUnify554 同设施）', () => {
  it('docs：_shards.failed>0 → role=status 黄条渲染 shardsHint 文案；关闭后重检索自动重现', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    clusterQueryFn.mockResolvedValue({ took: 1, total: 2, hits: [{ _id: '1', _source: { name: 'b' } }], _shards: { total: 5, successful: 3, failed: 2 } });
    const { host } = await mountHub(); /* 默认 docs tab：onMounted 即 runDocs */
    await settle(12);
    let bar = host.querySelector<HTMLElement>('.ih-partial');
    expect(bar, '部分分片失败黄条在场').toBeTruthy();
    expect(bar!.getAttribute('role')).toBe('status');
    expect(bar!.textContent).toContain('2 个失败');
    expect(bar!.textContent).toContain('结果可能不完整');
    (bar!.querySelector<HTMLButtonElement>('.ih-partial-x')!).click();
    await settle();
    expect(host.querySelector('.ih-partial'), '关闭后隐藏').toBeNull();
    const rerun = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => (b.textContent || '').trim() === '检索')!;
    rerun.click();
    await settle(12);
    expect(host.querySelector('.ih-partial'), '新响应自动重现（dismissed 复位）').toBeTruthy();
  });
  it('docs：_shards 干净（failed=0）→ 零黄条', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    clusterQueryFn.mockResolvedValue({ took: 1, total: 2, hits: [{ _id: '1', _source: { name: 'b' } }], _shards: { total: 5, successful: 5, failed: 0 } });
    const { host } = await mountHub();
    await settle(12);
    expect(host.querySelector('.ih-partial'), '干净响应零黄条').toBeNull();
  });
  it('query：执行后 _shards.failed>0 → 黄条在场（同判据独立 computed）', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    clusterQueryFn.mockResolvedValue({ took: 1, total: 2, hits: [{ _id: '1', _source: { name: 'b' } }], _shards: { total: 5, successful: 4, failed: 1 } });
    const { host } = await mountHub();
    await settle();
    const qtab = [...host.querySelectorAll<HTMLButtonElement>('.ih-tabs button')].find(b => b.textContent?.includes('查询'))!;
    qtab.click();
    await settle();
    const run = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => (b.textContent || '').includes('执行查询'))!;
    run.click();
    await settle(16);
    const bar = host.querySelector<HTMLElement>('.ih-partial');
    expect(bar, 'query 黄条在场').toBeTruthy();
    expect(bar!.textContent).toContain('1 个失败');
  });
});

/* ═══════════ ②：两 RT 补 export-name（ W-D 导出契约消费位） ═══════════ */
describe('561 ②：docs/query 两 RT export-name（ih-docs / ih-qry，命名不撞既有名）', () => {
  it('docs RT export-name="ih-docs"、query RT export-name="ih-qry"（各唯一）', () => {
    expect(rtTag(ih, 'docsTbl')).toContain('export-name="ih-docs"');
    expect(rtTag(ih, 'qryTbl')).toContain('export-name="ih-qry"');
    const names = [...ih.matchAll(/export-name="([^"]+)"/g)].map(m => m[1]);
    expect(names.filter(n => n === 'ih-docs').length, 'ih-docs 唯一').toBe(1);
    expect(names.filter(n => n === 'ih-qry').length, 'ih-qry 唯一').toBe(1);
  });
});

/* ═══════════ ③：HotkeyPanel Ctrl+I「查询工作台编辑器补全」行（B1 已落件补锚） ═══════════ */
describe('561 ③：HotkeyPanel「查询工作台编辑器补全」Ctrl+I 行（B1 已完成件，零触碰补锚）', () => {
  it('登记行字面在场 + 备案注释', () => {
    expect(hkp).toContain("{ keys: ['Ctrl', 'I'], desc: '查询工作台编辑器补全', pageKeys: ['search'] }");
    expect(hkp).toContain('查询工作台 DSL 编辑器 Ctrl+I 补全登记');
  });
});

/* ═══════════ ④：DslQueryView Ctrl+I addCommand（B1 已落件补锚） ═══════════ */
describe('561 ④：DslQueryView Ctrl+I addCommand（B1 已写入，readFileSync 只读锚）', () => {
  /* ⚠  Ctrl+I 落点随 DslQueryView 在途态，若对方波重排需同步更新 */
  it('addCommand(KeyMod.CtrlCmd | KeyCode.KeyI) → triggerSuggest 接线字面在场', () => {
    expect(dqv).toContain('ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyI, () => {');
    expect(dqv).toContain("ed.trigger('', 'editor.action.triggerSuggest', null);");
    expect(dqv).toContain('：Ctrl+I 唤起补全');
  });
});
