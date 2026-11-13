/**
 * 五百二十四批：IndexHub 查询 tab 补全字段源换代 + 翻页（P0 行为网）。
 *
 * 契约（验收锚）：
 * ① 字段源换代：查询 tab JsonArea 的 dslAssist.fields 挂 useIndexFields（mappingDetail
 *    出口）——嵌套 a.b 与 multi-field .keyword 全量在场（原 fieldTypesMap 顶层遍历缺席）；
 *    doPrepare 同款「同点预载」= loadDetail 时 ensureIhFields()；
 * ② 查询 tab 翻页：runDsl 注入顶层 from/size（页大小共享键 es_pager_size，默认 20），
 *    Pagination 下一页 → from=20 第二次真检索；页大小下拉改动回写 es_pager_size；
 * ③ 查看态文档弹窗只读 Monaco + 编辑态 JsonArea 保持（源码锁——弹窗需命中行驱动，
 *    源码锁足够防回退）；
 * ④ refresh_interval 自定义值（2s）动态并入档位选项（ops tab 行为断言）；
 * ⑤ 编辑器高度四档（S/M/L/满，五百一十九批：editorTiers 统一件档位 + usePref ih.editorH
 *    + 档位钮组；满档保留 42vh 视口弹性）+ fill（源码锁）。
 *
 * 设施：monaco editor.api stub（dslAssistPenetration 同款捕获）+ contrib/worker 空 mock；
 * 只 mock ../api 出口；naive-ui 用真的；tab 深链走真实 location.hash。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

type Reg = { lang: string; provider: any; disposed: boolean };

/* monaco editor.api stub——注册捕获 + 最小 editor 面（同 dslAssistPenetration.spec.ts） */
vi.mock('monaco-editor/esm/vs/editor/editor.api', () => {
  const registrations: Reg[] = [];
  const fakeEditor = {
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
  };
  return {
    __registrations: registrations,
    editor: {
      defineTheme: () => {},
      create: () => fakeEditor,
      setTheme: () => {},
      setModelMarkers: () => {},
    },
    languages: {
      registerCompletionItemProvider: (lang: string, provider: any) => {
        const rec: Reg = { lang, provider, disposed: false };
        registrations.push(rec);
        return { dispose: () => { rec.disposed = true; } };
      },
      /* 五百三十批：MonacoEditor 新增 dsl 字段 hover provider（并行批改动）——stub 缺此方法
         会让挂载在 mounted hook 直接抛 TypeError（①④连带假红），与注册捕获同款空实现 */
      registerHoverProvider: () => ({ dispose() {} }),
      register: () => {},
      setMonarchTokensProvider: () => {},
      setLanguageConfiguration: () => {},
      registerCodeActionProvider: () => ({ dispose() {} }),
      json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
      CompletionItemKind: { Property: 9, Snippet: 27, Field: 3, Keyword: 17, Value: 13 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
    Range: class {
      constructor(
        public startLineNumber?: number, public startColumn?: number,
        public endLineNumber?: number, public endColumn?: number,
      ) {}
    },
    KeyMod: { CtrlCmd: 2048 },
    KeyCode: { Enter: 3 },
    MarkerSeverity: { Hint: 1, Warning: 8 },
  };
});

/* contrib/worker 全空 mock——斩断真实 monaco 导入链 */
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

const mappingDetailFn = vi.fn();
const indexSettingsFn = vi.fn();
const shardsFn = vi.fn();
const aliasesFn = vi.fn();
const clusterQueryFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      indexSettings: (...a: any[]) => indexSettingsFn(...a),
      shards: (...a: any[]) => shardsFn(...a),
      aliases: (...a: any[]) => aliasesFn(...a),
      clusterQuery: (...a: any[]) => clusterQueryFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* 防御性 stub 挡真实 fetch 噪音（store.loadIndices→loadVersion 等） */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
    },
  };
});

import * as monacoStub from 'monaco-editor/esm/vs/editor/editor.api';
import IndexHubView from '../views/IndexHubView.vue';
import { __clearFieldCache } from '../composables/useIndexFields';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const registrations = () => (monacoStub as any).__registrations as Reg[];
const dslRegs = () => registrations().filter(r => {
  const tc = r.provider?.triggerCharacters;
  return Array.isArray(tc) && tc.length === 1 && tc[0] === '"';
});

/* mappingDetail 出口：嵌套 user.name + multi-field title.keyword（fieldTypesMap 顶层口径两者皆无） */
const MAPPING = { index: 'a-idx', raw: { properties: {
  status: { type: 'keyword' },
  title: { type: 'text', fields: { keyword: { type: 'keyword' } } },
  user: { properties: { name: { type: 'text' } } },
} } };
const IDX_FIELDS = ['status', 'title', 'title.keyword', 'user', 'user.name'];

const QRESP = { took: 3, hits: [{ _id: '1', _source: { status: 'A' } }], total: 45 };

async function settle(n = 14) {
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
  app.use(createPinia());
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { host, router };
}

/** 直接调用捕获的 dslAssist provider（model stub 与真实 ITextModel 同口径：1 基行列） */
function suggest(doc: string, offset = doc.length): any[] {
  const reg = dslRegs()[0];
  expect(reg, 'dslAssist provider 应已注册').toBeTruthy();
  const model = {
    getValue: () => doc,
    getOffsetAt: () => offset,
    getPositionAt: (off: number) => {
      let line = 1, last = -1;
      for (let i = 0; i < off; i++) if (doc[i] === '\n') { line++; last = i; }
      return { lineNumber: line, column: off - last };
    },
  };
  return reg.provider.provideCompletionItems(model, {}).suggestions;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  __clearFieldCache();
  registrations().length = 0;
  mappingDetailFn.mockReset().mockResolvedValue(MAPPING);
  indexSettingsFn.mockReset().mockResolvedValue({ index: { refresh_interval: '1s', number_of_replicas: '1' } });
  shardsFn.mockReset().mockResolvedValue([]);
  aliasesFn.mockReset().mockResolvedValue([]);
  clusterQueryFn.mockReset().mockResolvedValue(QRESP);
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('IndexHub 查询 tab：字段源换代 + 翻页（524 批）', () => {
  it('① dslAssist 挂 useIndexFields：嵌套/multi-field 全量在场，mappingDetail 同点预载', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    history.replaceState(null, '', '#/?tab=query');
    await mountHub();
    /* 五百二十一批：provider 逐语言 json+ndjson 各一份，dslRegs 签名过滤下恒 2 */
    expect(dslRegs().length, '查询 tab JsonArea 必须注册 dslAssist provider').toBe(2);
    /* 字段档出自 mappingDetail 出口（递归 walk + 排序）：user.name 与 title.keyword 在场。
       五百三十一批：dslAssist 值位类型感知排序上线（match 档 text 置顶，序归 monacoDslAssist
       契约锁），此处断言语义收敛为「全量在场」——排序无关比较 */
    const s = suggest('{"query": {"match": {"');
    expect([...s.map(i => i.label)].sort()).toEqual(IDX_FIELDS);
    /* loadDetail 同点预载：挂载即拉字段（幂等+缓存），不等用户先敲一次补全 */
    expect(mappingDetailFn).toHaveBeenCalledWith('a-idx');
  });

  it('② runDsl 注入顶层 from/size（es_pager_size 默认 20），翻页 from=20 真检索', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    history.replaceState(null, '', '#/?tab=query');
    const { host } = await mountHub();
    const runBtn = host.querySelector<HTMLButtonElement>('.btn-run-lock');
    expect(runBtn, '查询 tab 必须有执行按钮').toBeTruthy();
    runBtn!.click();
    await vi.waitFor(() => { expect(clusterQueryFn).toHaveBeenCalledTimes(1); });
    await settle();
    const first = clusterQueryFn.mock.calls[0];
    expect(first[0]).toBe('a-idx');
    const body1 = JSON.parse(first[1]);
    expect(body1.from, '首页 from=0').toBe(0);
    expect(body1.size, '页大小来自共享键 es_pager_size 默认 20').toBe(20);
    expect(first[2]).toBe(20);
    /* 结果表已渲染（total=45 → totalPages=3），下一页 → from=20 */
    const next = host.querySelector<HTMLButtonElement>('[aria-label="下一页"]');
    expect(next, '查询 tab 必须挂 Pagination（下一页可用）').toBeTruthy();
    expect(next!.disabled, 'total=45/size=20 共 3 页，下一页必须可点').toBe(false);
    next!.click();
    await vi.waitFor(() => { expect(clusterQueryFn).toHaveBeenCalledTimes(2); });
    await settle();
    const body2 = JSON.parse(clusterQueryFn.mock.calls[1][1]);
    expect(body2.from, '第二页 from=20').toBe(20);
    expect(body2.size).toBe(20);
    /* 页大小改动回写共享键 es_pager_size（与 docs tab/DslQueryView 一次调节一致）。
       五百六十六批同步更新：563 四刀把原生 select 换 n-popover 横排胶囊弹窗（且漏 import
       NPopover 致触发钮不渲染，本文件 ② 随之红——补 import 后恢复），交互契约同步
       select change → 触发钮点开浮层 + 点选选项胶囊（pickSize 回写）。 */
    const psel = host.querySelector<HTMLButtonElement>('.pgn-psel');
    expect(psel, 'Pagination 必须带页大小触发钮（n-popover 已解析渲染）').toBeTruthy();
    psel!.click();
    await settle();
    const opt50 = [...document.querySelectorAll<HTMLButtonElement>('.pgn-psize-opt')]
      .find(o => (o.textContent || '').trim().startsWith('50'));
    expect(opt50, '浮层须出 50/页 选项胶囊').toBeTruthy();
    opt50!.click();
    await settle();
    expect(localStorage.getItem('es_pager_size')).toBe('50');
  });

  it('④ refresh_interval 自定义值（2s）动态并入档位选项（ops tab 不再显示空）', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    indexSettingsFn.mockResolvedValue({ index: { refresh_interval: '2s', number_of_replicas: '1' } });
    history.replaceState(null, '', '#/?tab=ops');
    const { host } = await mountHub();
    expect(host.textContent, '自定义当前值必须出现在档位选项中（n-select 选中态回显）').toContain('2s（当前值）');
  });

  it('③⑤ 源码锁：查看态只读 Monaco + riOpts 动态档 + 编辑器高度四档（S/M/L/满）', () => {
    const v = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
    /* ③ 文档弹窗查看态只读 Monaco（旧裸 pre.ih-doc-json 退役），编辑态 JsonArea 保持。
       高度 min(60vh,420px)：视口弹性、原 420px 兜底；编辑态 JsonArea 补字段补全
       （fields 透传同页查询口 ihDslAssist，bodyKind 'doc'——五百二十四批 doc 档在档，
       键位零候选、field 值位白名单出字段候选；五百三十批临时 'none' 随 doc 档落地升档）。
       五百二十五批同步更新：查看态 Monaco 也挂同构 dsl-assist（只读面 hover 白得）；
       编辑态 rows=14 定高退役 → fill + 外包 min(60vh,420px)（两态同口径） */
    /* 六百六十九批同步更新（击穿者：件B 弹窗字号档——查看 Monaco 尾追 :font-size="ihFont"
       同页同键，dsl-assist 契约锁意图零触；edFontModal669.spec E1 同锚） */
    expect(v).toMatch(/<MonacoEditor :model-value="docEditText" language="json" :readonly="true" height="min\(60vh,420px\)"\s*:dsl-assist="\{ fields: ihDslAssist\.fields, bodyKind: \(\) => 'doc' \}" :font-size="ihFont" \/>/);
    expect(v).not.toContain('<pre class="ih-doc-json"');
    expect(v).toContain('<JsonArea v-model="docEditText" fill :dsl-assist="{ fields: ihDslAssist.fields, bodyKind: () => \'doc\' }" />');
    expect(v).toContain('style="height:min(60vh,420px);display:flex"');
    /* ⑤ 查询 tab DSL 编辑器高度四档（五百一十九批）：editorTiers 统一件档位 + usePref 记忆
       （ih.editorH）+ 档位钮组；满档保留 42vh 视口弹性，JsonArea fill 保持 */
    expect(v).toMatch(/\.ih-dsl-wrap \{ display: flex; flex-direction: column; \}/);
    expect(v).toMatch(/\.ih-dsl-wrap\.ih-h-full \{ min-height: max\(168px, 42vh\); \}/);
    /* 六百六十八批同步更新：import 行扩 EDITOR_FONT_TIERS（字号三档单源，edFontSpread668 E4 同锚） */
    expect(v).toContain("import { EDITOR_HEIGHTS, EDITOR_H_TIERS, EDITOR_FONT_TIERS, type EditorHKey } from '../utils/editorTiers';");
    /* 2.1.4：高度档读取侧归一（存量非法档回落 s），底层落盘键 ih.editorH 不变 */
    expect(v).toContain("usePref<string>('ih.editorH', 's')");
    expect(v).toMatch(/normalizePrefEnum\(editorHPref\.value, IH_EDITOR_H_KEYS, 's'\)/);
    expect(v).toContain('aria-label="编辑器高度档位"');
    /* 五百三十二批锚同步更新：JsonArea 补 ref="dslJaRef"（lintDsl 划线注入口，PitScrollView 同款） */
    expect(v).toContain('<JsonArea ref="dslJaRef" v-model="dsl" fill :dsl-assist="ihDslAssist"');
    /* ④ riOpts 动态并入当前值的实现锚 */
    expect(v).toMatch(/riOpts = computed/);
    expect(v).toContain('（当前值）');
  });
});

/* ═══════════ 五百三十五批 W3（追加）：查询 tab 页内历史（519 push 只写不显补显） ═══════════
   既有 describe 一字不动，本块只追加。行为面（开面板/回放过门）在 histPanel535.spec.ts */
describe('IndexHub 查询 tab 页内历史接线（535 批 W3）', () => {
  it('源码锁：工具行历史钮 + NModal+QueryHistoryPanel（mode=dsl 单档全量），回放走 runDslNew 不绕门', () => {
    const v = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
    /* 查询 tab 工具行历史钮（执行/取消/DevTools 同一行） */
    expect(v).toContain('<button class="btn sm ghost" data-test="open-hist" @click="histOpen = true" title="查询历史"><History :size="11" /> 历史</button>');
    /* NModal + QueryHistoryPanel（SqlConsoleView 528 范式；导入/清空关闭） */
    expect(v).toMatch(/<n-modal v-model:show="histOpen" preset="card" title="查询历史（索引工作区）"/);
    /* 550 同步更新：actions 加 'fav'（IH fav 闭环，track2Wave550 批）——QueryHistoryPanel 行级门
       `!it.mode || it.mode === 'dsl'` 下本页 histRows（恒 mode='dsl'）星标钮全行可达。
       554 同步更新：actions 加 'curl'（面板 552 内建行级钮，宿主 histCurl 组装 POST {index}/_search）
       562 同步更新（击穿者：kibanaWave562 K3/K4——docs 检索历史入口闭环）：actions 加 'newtab'
       （561b 内建行级钮，带到 DevTools 新 Tab 组装归宿主 ihHistNewTab）+ histRows 并显
       lucene 行 + :show-mode="true"（mode 徽标区分 DSL/Lucene） */
    expect(v).toContain(":items=\"histRows\" :actions=\"['play', 'fill', 'copy', 'fav', 'curl', 'newtab', 'del']\" :clearable=\"false\" :importable=\"false\" :show-mode=\"true\"");
    expect(v).toContain('@play="h => replayIhHist(h, true)" @fill="h => replayIhHist(h, false)" @del="h => qh.removeOne(h.id)"');
    /* mode=dsl 单档全量，不做 index 过滤（Lead 裁决简单优先）——整句字面锁定，无 index 维度。
       562 同步更新：并显 lucene 行（docs 检索历史 546 批只写不显，kibanaWave562 K3 入口闭环） */
    expect(v).toContain("const histRows = computed(() => qh.items.filter(i => i.mode === 'dsl' || i.mode === 'lucene'));");
    /* 回放=回填 dsl 草稿+runDslNew——必须走 runDsl 既有 JSON 合法性门与 from/size 注入草稿路径，
       不得绕过（push 存的是编辑器原文，回放安全）。
       562 同步更新：lucene 行分派 docsQ 草稿路径（runDocsNew 既有链），dsl 行原门零触 */
    expect(v).toMatch(/function replayIhHist\(row: \{ query: string; mode\?: string \}, runIt: boolean\) \{/);
    expect(v).toContain("if (row.mode === 'lucene') {");
    /* 身份门（autoRunAllowed 同口径）：回放改走 runDslAuto（dsl.value 回填与
       from/size 注入路径不变；载荷来自上一账号时不抢发）。runDslNew 仍供用户主动点击。 */
    expect(v).toContain('dsl.value = row.query;');
    expect(v).toContain('if (runIt) runDslAuto();');
  });

  it('查询 tab 工具行挂载出现历史钮（行为面在 histPanel535）', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    history.replaceState(null, '', '#/?tab=query');
    const { host } = await mountHub();
    expect(host.querySelector<HTMLButtonElement>('[data-test="open-hist"]'), '查询 tab 工具行必须有历史钮').toBeTruthy();
  });
});
