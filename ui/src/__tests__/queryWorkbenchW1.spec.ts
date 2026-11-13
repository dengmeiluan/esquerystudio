/**
 * W1 工蚁批：查询工作台大屏自适应 + 高度链（P0 用户实报三联根治）。
 *
 * ① P0 超宽屏窄列：≥1920 视口 .page 用 --page-maxw 居中把查询工作台压成 ~40% 窄列
 *    （theme.css §9「表格密度页可豁免」承诺无机制）。机制落 router.ts WIDE_ROUTES
 *    （meta.wide）+ App.vue .page.page-wide 覆盖居中 padding。
 * ② P0 结果区出视口：WorkbenchLayout 五百一十四批视口兜底（.wl min-height:100vh-210px）
 *    把常规流兄弟节点 .dq-result 顶到视口底沿（res-bar 只露分页条）。
 *    修法：fillViewport prop（默认 true 零破坏）+ DslQueryView 传 false 自建真高度链。
 * ③ P1 命中数常驻 / 预设文案「条件区/编辑器」口径 / Ctrl+Enter 全局执行 / filter-hit 消费端 /
 *    Lucene ?page= 契约。
 *
 * 挂载型断言最终 DOM（res-bar/res-body 同现、fillViewport 类、Ctrl+Enter 输入守卫）；
 * Monaco 在 happy-dom 必炸 → editor.api stub + contribution 空 mock（dslAssistPenetration 范式）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';
import { useAuthStore } from '../stores/auth';
import { createRouter, createMemoryHistory } from 'vue-router';

const rd = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const appSrc = rd('App.vue');
const routerSrc = rd('router.ts');
const wlSrc = rd('components/WorkbenchLayout.vue');
const dqSrc = rd('views/DslQueryView.vue');
const rtSrc = rd('components/ResultTable.vue');
const lcSrc = rd('views/LuceneQueryView.vue');

/* ═══ 静态契约 ═══ */

describe('P0 超宽屏：meta.wide 豁免机制（router.ts + App.vue）', () => {
  it('App.vue：.page 挂 page-wide 动态类，media 内覆盖居中 padding', () => {
    expect(appSrc).toMatch(/<div(?: v-else)? class="page scroll-y" :class="\{ 'page-wide': pageWide \}">/);
    expect(appSrc).toMatch(/const pageWide = computed\(\(\) => route\.meta\.wide === true\);/);
    /* 覆盖规则必须写在 ≥1920 媒体查询内（只在该断点豁免，常规视口零变化） */
    expect(appSrc).toMatch(
      /@media \(min-width: 1920px\) \{\s*\.page \{ padding-left: calc\(\(100% - var\(--page-maxw\)\) \/ 2\); padding-right: calc\(\(100% - var\(--page-maxw\)\) \/ 2\); \}\s*\.page\.page-wide \{ padding-left: var\(--sp-5\); padding-right: var\(--sp-5\); \}\s*\}/,
    );
  });

  it('router.ts：WIDE_ROUTES 覆盖各工作台/表格观测群，纯阅读与错误页保持居中', () => {
    /* 只认 WIDE_ROUTES 集合块（/favorites 等在 routes 数组另有定义，不在豁免集合） */
    const wideBlock = routerSrc.slice(routerSrc.indexOf('const WIDE_ROUTES'), routerSrc.indexOf('export const router'));
    /* 数据密集群逐条枚举（查询工作台/索引工作区/重建迁移/开发者工具/表格观测） */
    for (const p of ['/search', '/indices', '/browser', '/mapping', '/devtools', '/rest', '/xmigrate',
      '/adhoc-rebuild', '/reindex-advanced', '/bulk', '/diag', '/tasks', '/snapshots', '/ilm',
      '/live', '/system', '/security', '/doc-diff', '/query-xray']) {
      expect(wideBlock, `WIDE_ROUTES 应含 ${p}`).toContain(`'${p}'`);
    }
    /* 豁免集合外的居中页：纯阅读/画廊/错误页 */
    expect(wideBlock).not.toContain(`'/favorites'`);
    expect(wideBlock).not.toContain(`'/templates-gallery'`);
    expect(wideBlock).not.toContain(`'/forbidden'`);
    /* meta 注入走统一 map（逐路由 meta 字面量不可漂移） */
    expect(routerSrc).toMatch(/\.map\(r => \(WIDE_ROUTES\.has\(r\.path\) \? \{ \.\.\.r, meta: \{ wide: true \} \} : r\)\)/);
  });

  it('router.ts：不变式收口——WIDE_ROUTES 覆盖全部数据页，唯纯阅读/画廊/向导/错误页居中', () => {
    /* routes 数组里的全部字面量 path 与 WIDE_ROUTES 逐一对账（W1b 校验补遗防新页漏配：
       此前 /analyzer-lab 漏在实验室群外，靠逐群抽样断言抓不住）。
       redirect 项（/、/cluster-map、LEGACY_QUERY_PATHS 走变量 path 不落字面量）与
       纯阅读（/favorites、/templates-gallery）、向导/错误页（/forbidden、catch-all）不在豁免集合。 */
    const wideBlock = routerSrc.slice(routerSrc.indexOf('const WIDE_ROUTES'), routerSrc.indexOf('export const router'));
    const routesBlock = routerSrc.slice(routerSrc.indexOf('routes: ['), routerSrc.indexOf("].map(r => (WIDE_ROUTES"));
    const routePaths = [...routesBlock.matchAll(/path: '([^']+)'/g)].map(m => m[1]).filter(p => p.startsWith('/'));
    const centered = new Set(['/', '/cluster-map', '/templates-gallery', '/favorites',
      '/forbidden', '/module-off', '/:pathMatch(.*)*']);
    const dataPages = routePaths.filter(p => !centered.has(p));
    expect(dataPages.length, '对账基数：数据页必须非空（正则失配时防静默绿）').toBeGreaterThan(40);
    for (const p of dataPages) expect(wideBlock, `数据页 ${p} 应豁免居中`).toContain(`'${p}'`);
    /* 且集合无死条目：WIDE_ROUTES 每一项都能对回真实路由 */
    for (const m of wideBlock.matchAll(/'(\/[a-z-]+)'/g)) {
      expect(routePaths, `WIDE_ROUTES 项 ${m[1]} 必须是真实路由（防死条目）`).toContain(m[1]);
    }
  });

  it('顺手合并：cluster-banner 字号与 naive 基准字号 token 化', () => {
    expect(appSrc).toMatch(/\.cluster-banner \{[^}]*font-size: var\(--fs-sm\);/);
    /* naive 覆盖需 px 字面量（不认 CSS var）→ 抽常量与 --fs-md 同源，light/dark 两套共用 */
    expect(appSrc).toMatch(/const NAIVE_FONT_SIZE = '13px';/);
    expect(appSrc.match(/fontSize: NAIVE_FONT_SIZE/g)?.length).toBe(2);
    expect(appSrc).not.toMatch(/fontSize: '13px'/);
  });
});

describe('P0 高度链：WorkbenchLayout fillViewport + DslQueryView 自建链', () => {
  it('WorkbenchLayout：fillViewport 默认 true（既有消费方零行为变化），false 时视口兜底退役', () => {
    expect(wlSrc).toMatch(/fillViewport\?: boolean;/);
    expect(wlSrc).toMatch(/fillViewport: true,/);
    /* 兜底开关走类：min-height 仅缺省时生效 */
    expect(wlSrc).toMatch(/'wl-viewport-bounded': !fillViewport/);
    expect(wlSrc).toMatch(/\.wl \{ min-height: calc\(100vh - var\(--vh-offset\)\); \}/);
    expect(wlSrc).toMatch(/\.wl\.wl-viewport-bounded \{ min-height: 0; \}/);
  });

  it('DslQueryView：传 fill-viewport=false + 定高 flex 链（549 批高度链合一同步更新：dq-main 高度恒由内联 style 承接 DQ_MAIN_H 档位值/拖柄自定义 px，CSS 定高退役；结果区保底 320）', () => {
    expect(dqSrc).toMatch(/:fill-viewport="false"/);
    /* 1035（并行轨）：.dq-fill 改精确占满 .page 内容盒（height:100%），
       不再用 100vh-vh-offset 硬预算——iframe 高度变化时硬预算会溢出并遮挡冻结工具行。
       2.1.5：滚动职责移到 .dq-scroll（工具行在滚动区外），sticky 工具行不再把
       条件树过滤框/编辑器首行压在底下 */
    expect(dqSrc).toMatch(/\.dq\.dq-fill \{ height: 100%; overflow: hidden; \}/);
    expect(dqSrc).toMatch(/\.dq-scroll \{ flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; \}/);
    /* 五百四十九批：34vh CSS 定高退役（与编辑器档位双轨分裂=空白带真凶），新契约=DQ_MAIN_H 四档；
       flex-shrink:0=声明高不被结果区内容挤压（真机 P3/P4 实证 shrink:1 恒被压回 min-height） */
    expect(dqSrc).toMatch(/\.dq-main \{ display: flex; gap: 0; align-items: stretch; flex: 0 0 auto; min-height: 220px; isolation: isolate; \}/);
    expect(dqSrc).toMatch(/const DQ_MAIN_H: Record<EditorHKey, string> = \{/);
    expect(dqSrc).toMatch(/dqMainStyle = computed\(\(\) => \(\{ height: dqMainH\.value > 0 \? dqMainH\.value \+ 'px' : DQ_MAIN_H\[editorH\.value\] \}\)\)/);
    /* 1035：结果区保底升 420（用户裁决最小至少 10 行——320 档在构建器展开时被压到 5 行没法读） */
    expect(dqSrc).toMatch(/\.dq-result \{ margin-top: (?:10px|var\(--sp-2h\)); flex: 1 1 auto; min-height: 505px; display: flex; flex-direction: column; \}/);
    /* res-body 转确定高容器，各视图分支自滚；cap 兜底保留。
       五百五十七批同步更新（击穿者：557 轨2 刀——.dq-res-body padding 退役）：正则去 padding 段，
       --dq-view-cap: 56vh 与 flex 链逐字保留（workbenchParity402 cap 锚零触免同步更新） */
    expect(dqSrc).toMatch(/\.dq-res-body \{ --dq-view-cap: 56vh; flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column; \}/);
    expect(dqSrc).toMatch(/\.dq-json-wrap \{ max-height: var\(--dq-view-cap\); flex: 1 1 auto; min-height: 0; \}/);
    expect(dqSrc).toMatch(/\.dq-cards \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(240px, 1fr\)\); gap: (?:10px|var\(--sp-2h\)); max-height: var\(--dq-view-cap\); flex: 1 1 auto; min-height: 0; \}/);
    /* 树 720px 硬顶退役——pane 内滚（rp-content）承担 */
    expect(dqSrc).toMatch(/\.dq-tree \{ flex-shrink: 0; min-width: 0; overflow-y: auto; max-height: 100%; padding-right: var\(--sp-2\); \}/);
    /* dq-fill 只在选中索引时（空态页保持原页面流） */
    expect(dqSrc).toMatch(/'dq-fill': !!store\.pickedIdx/);
  });

  it('DslQueryView：预设钮换「条件区/编辑器」口径（editor-first 实调条件树拉宽）', () => {
    expect(dqSrc).toMatch(/preset-editor-label="条件优先" preset-editor-title="条件树优先（编辑器收窄）"/);
    expect(dqSrc).toMatch(/preset-result-label="编辑优先" preset-result-title="编辑器优先（条件树收窄）"/);
    /* 组件侧默认值=通用文案（零破坏） */
    expect(wlSrc).toMatch(/presetEditorLabel: '编辑优先', presetEditorTitle: '编辑区优先',/);
    expect(wlSrc).toMatch(/presetResultLabel: '结果优先', presetResultTitle: '结果区优先',/);
  });

  it('P1 命中数常驻：541 批语义演进——RT 工具行 rt-info 常驻承担（res-head/MetaStrip 本地复制品退役）', () => {
    expect(dqSrc).toContain('<template #bar-prepend>');
    expect(rtSrc).toMatch(/<span class="rt-info mono">\{\{ hits\.length \}\}\/\{\{ fmtNum\(total\) \}\}/);
    expect(rtSrc).toContain('<slot name="bar-prepend" />');
    expect(dqSrc).toMatch(/import TookBadge from '\.\.\/components\/TookBadge\.vue';/);
    expect(dqSrc).toMatch(/value: fmtNum\(r\.total\) \+ \(r\.totalGte \? '\+' : ''\), label: '命中'/);
  });

  it('P1 Ctrl+Enter 全局执行 + filter-hit 消费端接线', () => {
    expect(dqSrc).toMatch(/function onGlobalRunKey\(e: KeyboardEvent\)/);
    expect(dqSrc).toMatch(/@filter-hit="onFilterHit"/);
    /* 输入守卫 + Monaco 让路（编辑器内已有同名 execute action） */
    expect(dqSrc).toMatch(/t\.closest\('\.monaco-editor'\)/);
    /* 1439：payload 增 not?: boolean（「排除此值并重查」复用同一事件） */
    expect(dqSrc).toMatch(/function onFilterHit\(p: \{ field: string; value: unknown; op\?: 'term' \| 'match'; not\?: boolean \}\)/);
    /* 挂载双入口（carry 分支提前 return 也要挂）+ KeepAlive 回页补挂 + 离页/卸载对称 */
    expect(dqSrc.match(/window\.addEventListener\('keydown', onGlobalRunKey\)/g)?.length).toBe(3);
    expect(dqSrc).toMatch(/window\.removeEventListener\('keydown', onGlobalRunKey\)/);
    expect(dqSrc).toMatch(/onDeactivated\(\(\) => \{[\s\S]*?removeEventListener\('keydown', onGlobalRunKey\)/);
  });

  it('P1 Lucene：?page= 契约对齐 DSL + 聚焦态全屏高口径（561 同步更新：内建聚焦承接）', () => {
    expect(lcSrc).toMatch(/const pageLink = useUrlState\('page', '1'\);/);
    expect(lcSrc).toMatch(/const from = ref\(Math\.max\(0, \(\(parseInt\(pageLink\.value, 10\) \|\| 1\) - 1\) \* size\.value\)\);/);
    expect(lcSrc).toMatch(/watch\(page, v => \{ pageLink\.value = String\(v\); \}\);/);
    /* 旧裸 130px 退役（等价换算 210-80=130，视觉零变化）
       五百六十一批同步更新：聚焦态全屏高口径随表格头收口移交 QRT 内建聚焦面（FS headless
       .fs-active 链 max-height:none 承接，宿主 max-height 恒 '100%'）——宿主 80px 表达式退役为负锁 */
    expect(lcSrc).not.toMatch(/calc\(100vh - 130px\)/);
    expect(lcSrc).not.toMatch(/calc\(100vh - var\(--vh-offset\) \+ 80px\)/);
    expect(lcSrc).toMatch(/max-height="100%"/);
  });
});

/* ═══ 挂载型 ═══ */

/* monaco editor.api stub（dslAssistPenetration 同范式：MonacoEditor 挂载链在 happy-dom 必炸） */
vi.mock('monaco-editor/esm/vs/editor/editor.api', () => {
  const fakeEditor = {
    onDidChangeModelContent: () => ({ dispose() {} }),
    onDidFocusEditorText: () => ({ dispose() {} }),
    onDidBlurEditorText: () => ({ dispose() {} }),
    addAction: () => ({}),
    addCommand: () => ({}),
    getValue: () => '',
    setValue: () => {},
    updateOptions: () => {},
    getAction: () => null,
    getSelection: () => null,
    executeEdits: () => {},
    focus: () => {},
    deltaDecorations: () => [],
    getModel: () => null,
    layout: () => {},
    dispose: () => {},
  };
  return {
    editor: {
      defineTheme: () => {},
      create: () => fakeEditor,
      setTheme: () => {},
      setModelMarkers: () => {},
    },
    languages: {
      registerCompletionItemProvider: () => ({ dispose() {} }),
      registerHoverProvider: () => ({ dispose() {} }),
      register: () => {},
      setMonarchTokensProvider: () => ({ dispose() {} }),
      setLanguageConfiguration: () => ({ dispose() {} }),
      registerCodeActionProvider: () => ({ dispose() {} }),
      json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
      CompletionItemKind: { Property: 9, Snippet: 27, Field: 3, Keyword: 17, Value: 13 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
    Range: class {},
    KeyMod: { CtrlCmd: 2048 },
    KeyCode: { Enter: 3 },
    MarkerSeverity: { Hint: 1, Warning: 8 },
  };
});
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
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterQuery: (...a: any[]) => clusterQueryFn(...a),
      /* 防御性 stub 挡 store 首探噪音 */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      clusterInspect: () => Promise.resolve({ mappings: {} }),
    },
  };
});

import WorkbenchLayout from '../components/WorkbenchLayout.vue';
import DslQueryView from '../views/DslQueryView.vue';
import { findMenuItem } from './helpers/ctxMenu'; /* 1142：二级菜单取项 */

const RESP = {
  took: 42,
  total: 123299,
  totalGte: false,
  hits: [{ _id: '1', _index: 'a-idx', _score: 1, _source: { status: 'ACTIVE' } }],
  aggregations: null,
  shards: null,
};

describe('WorkbenchLayout fillViewport（挂载型）', () => {
  let app: App | null = null;
  let host: HTMLDivElement | null = null;
  const origGBCR = Element.prototype.getBoundingClientRect;

  async function mountWl(props: Record<string, unknown>) {
    host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp({ render: () => h(WorkbenchLayout, {
      scope: { target: 'qa', route: '/search', mode: 'builder', profile: 'standard' },
      panes: [
        { id: 'tree', role: 'tree', minSize: 360, defaultSize: 470, maxSize: 'available' },
        { id: 'workspace', role: 'workspace', minSize: 360, defaultSize: 'flex' },
      ],
      ...props,
    }, { 'pane-tree': () => h('div', 't'), 'pane-workspace': () => h('div', 'w') }) });
    app.config.warnHandler = () => {};
    app.use(createPinia());
    app.mount(host);
    await nextTick();
    await nextTick();
  }

  beforeEach(() => {
    localStorage.clear();
    Element.prototype.getBoundingClientRect = function () {
      return { width: 1000, height: 700, top: 0, left: 0, right: 1000, bottom: 700, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    } as typeof origGBCR;
    window.innerWidth = 1440;
    window.innerHeight = 900;
  });
  afterEach(() => {
    Element.prototype.getBoundingClientRect = origGBCR;
    app?.unmount();
    host?.remove();
    app = null; host = null;
    localStorage.clear();
  });

  it('缺省（true）：不出现豁免类，视口兜底保持（既有 8 视图零行为变化）', async () => {
    await mountWl({});
    expect(host!.querySelector('.wl')!.classList.contains('wl-viewport-bounded')).toBe(false);
  });

  it('fillViewport=false：wl-viewport-bounded 类落地（DslQueryView 高度链前提）', async () => {
    await mountWl({ fillViewport: false });
    expect(host!.querySelector('.wl')!.classList.contains('wl-viewport-bounded')).toBe(true);
  });

  it('预设钮文案 prop 缺省=通用文案，宿主传值即换口径（toolbar 需 ≥2 sized pane 才渲染）', async () => {
    /* DSL 页 [sized tree, flex workspace] 下 toolbarVisible=false（钮不渲染）；
       prop 机制用双 sized pane 挂载验证（对齐 workbenchLayout.spec TWO_PANES 形态）。
       profile 显式传 'standard'：不传则走容器实测宽（GBCR stub 1000 < 1100）误判 stacked，
       toolbar 整条不渲染（workbenchLayout.spec mountWorkbench 同款传法） */
    const mount = async (props: Record<string, unknown>) => {
      host = document.createElement('div');
      document.body.appendChild(host);
      app = createApp({ render: () => h(WorkbenchLayout, {
        scope: { target: 'qa', route: '/search', mode: 'builder', profile: 'standard' },
        profile: 'standard',
        panes: [
          { id: 'tree', role: 'tree', minSize: 240, defaultSize: 360 },
          { id: 'workspace', role: 'workspace', minSize: 240, defaultSize: 420 },
        ],
        ...props,
      }, { 'pane-tree': () => h('div', 't'), 'pane-workspace': () => h('div', 'w') }) });
      app.config.warnHandler = () => {};
      app.use(createPinia());
      app.mount(host);
      await nextTick();
      await nextTick();
    };
    await mount({});
    const btns = () => Object.fromEntries(['editor-first', 'result-first'].map(k =>
      [k, host!.querySelector(`[data-layout-preset="${k}"]`)!.textContent?.trim()]));
    expect(btns()).toEqual({ 'editor-first': '编辑优先', 'result-first': '结果优先' });
    app?.unmount(); host!.remove();
    await mount({ presetEditorLabel: '条件优先', presetResultLabel: '编辑优先' });
    expect(host!.querySelector('[data-layout-preset="editor-first"]')!.textContent?.trim()).toBe('条件优先');
    expect(host!.querySelector('[data-layout-preset="result-first"]')!.textContent?.trim()).toBe('编辑优先');
  });
});

describe('DslQueryView 高度链 + 命中数常驻 + Ctrl+Enter（挂载型）', () => {
  const DSL = '{"query":{"match_all":{}},"size":20}';
  let app: App | null = null;
  let host: HTMLDivElement | null = null;

  async function settle(n = 14) {
    for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '#/');
    clusterQueryFn.mockReset().mockResolvedValue(structuredClone(RESP));
    localStorage.setItem('es_picked', 'a-idx');
  });
  afterEach(() => { app?.unmount(); app = null; host = null; localStorage.clear(); });

  async function mountDsl() {
    /* 深链 ?dsl= 触发 onMounted 自动执行（runQuery → mock clusterQuery → resp 渲染结果区）；
       useUrlState/useRouter 需 router 上下文（memoryHistory 供注入，URL 读写锚定真实 hash） */
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/search', component: { template: '<div/>' } }],
    });
    await router.push('/search');
    await router.isReady();
    const shared = encodeURIComponent(btoa(unescape(encodeURIComponent(DSL))));
    history.replaceState(null, '', `#/search?mode=dsl&idx=a-idx&dsl=${shared}`);
    const pinia = createPinia();
    /* 并行批新增自动执行身份门：直挂 DslQueryView 不走 App 探测——显式声明无鉴权部署，
       否则 autoRun 永远等 probe，深链自动执行无法验证 */
    const auth = useAuthStore(pinia);
    auth.probed = true;
    auth.authDisabled = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp({ render: () => h(DslQueryView) });
    app.config.warnHandler = () => {};
    app.use(pinia);
    app.use(router);
    app.mount(host);
    await settle();
    await vi.waitFor(() => { expect(clusterQueryFn).toHaveBeenCalled(); });
    await settle();
  }

  it('P0：.dq-res-bar 与 .dq-res-body 同时可现（结果区不再被顶出视口）', async () => {
    await mountDsl();
    /* 541 批同步更新：res-bar 退役，表格自带工具行 rt-bar 承担（视图 seg/分页寄居 bar-prepend） */
    const bar = host!.querySelector('.rt-bar');
    const body = host!.querySelector('.dq-res-body');
    expect(bar, 'rt-bar（视图段钮/分页/命中徽标）必须渲染').toBeTruthy();
    expect(body, 'res-body（结果表格容器）必须渲染').toBeTruthy();
    expect(bar!.contains(body!)).toBe(false);
    /* 高度链类：选中索引 → dq-fill 定高 + WorkbenchLayout 视口兜底退役 */
    expect(host!.querySelector('.dq')!.classList.contains('dq-fill')).toBe(true);
    expect(host!.querySelector('.wl')!.classList.contains('wl-viewport-bounded')).toBe(true);
  });

  it('P1 命中数常驻：541 批语义演进——rt-info 读 total（千分位）+ gte 标注 + TookBadge', async () => {
    await mountDsl();
    const info = host!.querySelector('.rt-info')!;
    expect(info.textContent).toContain('123,299');
    expect(info.textContent).toContain('42ms');
  });

  it('P1 Ctrl+Enter：任意处触发执行；输入框内让路（RT onGridKeydown 输入守卫同思想）', async () => {
    await mountDsl();
    const calls = clusterQueryFn.mock.calls.length;
    /* 非输入焦点：body 上派发（window keydown 监听）→ runQuery → clusterQuery 再调 */
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    await vi.waitFor(() => { expect(clusterQueryFn.mock.calls.length).toBeGreaterThan(calls); });
    /* 输入守卫：INPUT 内派发 → 不触发 */
    const inp = document.createElement('input');
    host!.querySelector('.dq-toolbar')!.appendChild(inp);
    const before = clusterQueryFn.mock.calls.length;
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    await settle(4);
    expect(clusterQueryFn.mock.calls.length).toBe(before);
  });

  it('P1 filter-hit 消费端：RT 右键下钻 → 并入当前 query 重查（drillAgg 同款组装，端到端）', async () => {
    await mountDsl();
    const calls = clusterQueryFn.mock.calls.length;
    /* 全链路真交互（rtFilterHit.spec 同款触发）：cell contextmenu → ccm 菜单项 →
       RT emit('filter-hit') → DqlQueryView onFilterHit → DSL 并入 → runQuery */
    const td = [...host!.querySelectorAll<HTMLTableCellElement>('.dq-res-body td.rt-cell')]
      .find(el => el.dataset.col === 'status' && el.dataset.ri === '0');
    expect(td, '表格视图 status 格必须渲染').toBeTruthy();
    td!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    await settle();
    /* 1142：动作项住「筛选与排序…」二级——findMenuItem 按需展开 */
    const item = (await findMenuItem('以此值过滤并重查')) as HTMLElement | null;
    expect(item, '右键菜单应有「以此值过滤并重查」').toBeTruthy();
    item!.click();
    await vi.waitFor(() => { expect(clusterQueryFn.mock.calls.length).toBeGreaterThan(calls); });
    /* 组装契约与 drillAgg 对齐：既有 query（match_all）整体入 must + buildDsl 产出入 filter。
       mock mappingDetail 空 properties → builderTypes 无类型 → buildDsl 走 term 兜底 */
    const body = JSON.parse(clusterQueryFn.mock.calls[clusterQueryFn.mock.calls.length - 1]![1]);
    expect(body.query).toEqual({
      bool: { must: [{ match_all: {} }], filter: [{ term: { status: 'ACTIVE' } }] },
    });
  });
});
