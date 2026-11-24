/**
 * 五百五十四批（工蚁2）：索引工作区表格能力对齐 + 直方图识别修正。
 *
 * 用户产线实报：
 * ① IndexHub docs/query 两 tab 的 RT 工具行没有视图形式切换 seg（DslQueryView 有）——
 *    能力不一致。给两处 RT 接同款 seg（表格/JSON/Tree/卡片四档，DQ 卡片档有实现
 *    故四档全上）+ RT hideBody（缺省 false 零增量，552 rtFix552 非表格视图自动退聚焦），
 *    JSON/Tree/卡片渲染体= DQ 最小集逐字平移（jsonFind 高亮搜索链是 DQ 视图域增强不同步更新）；
 * ② 「顶满」钮= DQ 本页级收起构建区（buildCollapsed）——IndexHub docs/query 无构建区
 *    （query tab 编辑器高度档是另一套受锁高度链），语义不适用，备案不做（负锚看守）；
 * ③ 直方图两页识别不一致（同索引 DQ 38 桶、IndexHub「未识别到可作直方图的字段」）根因：
 *    a) 首查不等字段源到位——DQ preloadMapping().then(firstRun)（mapping 先行），IndexHub
 *       runDocs/runDsl 与 ensureIhFields 并行赛跑，首查 mappingDates 空沿 → __hist 不注入；
 *    b) DQ 有「二次嗅探重放」（mapping 不可用时响应回来后从 hits 值形态补嗅探重放一次），
 *       IndexHub 552 批接线时备案未接（sniffFromHits 出口闲置）。
 *    修正：runDocs/runDsl 注入前 await ensureIhFields()（DQ 等位语义）+ 响应后二次嗅探
 *    重放链（sniffFromHits → injectField → 重放 → onResp(r2)，失败走既有降级拉黑）。
 *
 * 契约（验收锚）：
 * 一、docs/query 两 RT 接视图 seg（bar-prepend 内，DQ 同款四档）+ hideBody=非表格档；
 * 二、偏好落盘 usePref 键 ih.docs.view / ih.qry.view（与 DQ useScopedDraft 键分开）；
 * 三、alt 渲染体三档在场（JSON=高亮 pretty 信封、Tree=JsonTree tools、卡片=openDoc 点开）；
 * 四、直方图：两链字段源等位（await ensureIhFields）+ 二次嗅探重放（sniffFromHits/injectField/
 *     onResp(r2)）；行为网：字段源拒（403）时首查裸查、响应后按 hits 值形态重放带 __hist
 *     查询回填直方图桶（与 DQ 同链）；
 * 五、顶满钮负锚：两处 bar-prepend 无「顶满」（语义不适用备案不做，防后续误加）。
 * 设施：tableKernelWave540 同款 monaco stub + 只 mock ../api + 裸 createApp 挂载。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* monaco editor.api stub——最小 editor 面（indexHubExec534/540 同款，斩断真实 monaco 导入链） */
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

/* docs RT / query RT 标签切片（防其他消费方误匹配；541 同款切法） */
function rtTag(src: string, ref: string): string {
  const start = src.indexOf('<ResultTable ref="' + ref + '"');
  expect(start, 'RT 消费标签存在（防空跑）').toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('</ResultTable>', start));
}
/* runDocs / runDsl 函数体切片（注入顺序断言用） */
function fnBody(src: string, name: string): string {
  const start = src.indexOf('async function ' + name + '()');
  expect(start, name + ' 在场（防空跑）').toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('\nasync function ', start + 1) === -1 ? src.length : src.indexOf('\nasync function ', start + 1));
}

/* docs tab 命中样例：name 字段供 RT 列推断；issueTime=epoch 毫秒（值形态可嗅探日期字段） */
const DOCS_HITS = [
  { _id: '1', _source: { name: 'b', issueTime: 1700000000000 } },
  { _id: '2', _source: { name: 'a', issueTime: 1700086400000 } },
];

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
  clusterQueryFn.mockReset().mockResolvedValue({ took: 3, hits: DOCS_HITS, total: 25 });
});
afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
});

/* ═══════════ 一、视图 seg 接线 + hideBody（源码锁） ═══════════ */
describe('554 一：docs/query 两 RT 接视图形式切换 seg（DQ 同款四档）', () => {
  it('seg 档位常量：表格/JSON/Tree/卡片 四档（DQ views 同构；DQ 卡片档有实现故四档全上）', () => {
    expect(ih).toMatch(/const IH_VIEWS = \[\s*\{ k: 'table', t: '表格' \},\s*\{ k: 'json', t: 'JSON' \},\s*\{ k: 'tree', t: 'Tree' \},\s*\{ k: 'cards', t: '卡片' \},\s*\] as const;/);
  });
  it('docs RT：bar-prepend 内 seg（IH_VIEWS v-for + docsView 双向）+ :hide-body=非表格档', () => {
    const tag = rtTag(ih, 'docsTbl');
    expect(tag).toMatch(/<div class="seg ih-view-seg">\s*<button v-for="v in IH_VIEWS" :key="v\.k" :class="\{ on: docsView === v\.k \}" @click="docsView = v\.k">\{\{ v\.t \}\}<\/button>\s*<\/div>/);
    expect(tag).toContain(':hide-body="docsView !== \'table\'"');
  });
  it('query RT：bar-prepend 内 seg（qryView 双向）+ :hide-body=非表格档', () => {
    const tag = rtTag(ih, 'qryTbl');
    expect(tag).toMatch(/<div class="seg ih-view-seg">\s*<button v-for="v in IH_VIEWS" :key="v\.k" :class="\{ on: qryView === v\.k \}" @click="qryView = v\.k">\{\{ v\.t \}\}<\/button>\s*<\/div>/);
    expect(tag).toContain(':hide-body="qryView !== \'table\'"');
  });
  it('JSON/Tree 档无翻页语义：两处 Pagination 仅表格/卡片档在场（DQ 同款 v-if 前缀）', () => {
    const dTag = rtTag(ih, 'docsTbl');
    const qTag = rtTag(ih, 'qryTbl');
    expect(dTag).toContain('<Pagination v-if="docsView !== \'json\' && docsView !== \'tree\'"');
    expect(qTag).toContain('<Pagination v-if="qryView !== \'json\' && qryView !== \'tree\'"');
  });
  it('偏好落盘：usePref 键 ih.docs.view / ih.qry.view（缺省 table，与 DQ 键分开）', () => {
    expect(ih).toContain("usePref<string>('ih.docs.view', 'table')");
    expect(ih).toContain("usePref<string>('ih.qry.view', 'table')");
    expect(ih).toContain('normalizePrefEnum(docsViewPref.value');
    expect(ih).toContain('normalizePrefEnum(qryViewPref.value');
  });
});

/* ═══════════ 二、alt 渲染体三档（DQ 最小集逐字平移） ═══════════ */
describe('554 二：JSON/Tree/卡片渲染体（docs docsRan 域 + query qryResp 域）', () => {
  it('docs：JSON=高亮 pretty 信封（AltHitsViews 入参）、Tree=行集入参、卡片=全量命中+openDoc（667 改用同步更新：内脏入共享件，包裹层容器类保形）', () => {
    const seg = ih.slice(ih.indexOf("tab === 'docs'"), ih.indexOf("tab === 'query'"));
    /* 六百六十七批同步更新（击穿者：IH alt 体改用 AltHitsViews 统一件）——内脏 DOM 入组件，
       包裹层 v-show 容器类与入参绑定保形（json=信封/tree=行集/cards=全量命中+openDoc）；
       文档导航条接线（934 能力矩阵对齐：json/tree 档 +doc-count/doc-ids/打开/编辑直达） */
    expect(seg).toMatch(/<div v-show="docsView === 'json'" class="scroll-y ih-json-wrap ih-alt-body">\s*<AltHitsViews view="json" :json-html="docsJsonHtml" :doc-count="docsHits\.length"/);
    expect(seg).toContain('<AltHitsViews view="tree" :tree-data="docsAltData" :doc-count="docsAltData.length"');
    expect(seg).toMatch(/<div v-show="docsView === 'cards'" class="ih-cards ih-alt-body">/);
    expect(seg).toContain('<AltHitsViews view="cards" :hits="docsHits" @open-doc="openDoc" />');
  });
  it('query：三档同构（qryView 驱动；667 改用同步更新同 docs 域）', () => {
    const seg = ih.slice(ih.indexOf('<template v-else-if="tab === \'query\'">'), ih.indexOf('<!-- Settings -->'));
    expect(seg).toMatch(/<div v-show="qryView === 'json'" class="scroll-y ih-json-wrap ih-alt-body">\s*<AltHitsViews view="json" :json-html="qryJsonHtml" :doc-count="qryResp\?\.hits\?\.length \?\? 0"/);
    expect(seg).toContain('<AltHitsViews view="tree" :tree-data="qryAltData" :doc-count="qryAltData.length"');
    expect(seg).toMatch(/<div v-show="qryView === 'cards'" class="ih-cards ih-alt-body">/);
    expect(seg).toContain('<AltHitsViews view="cards" :hits="qryResp.hits" @open-doc="openDoc" />');
  });
  it('渲染源：AltHitsViews 共享件（667 改用）+ prettyJson/highlightJson（utils/jsonc）导入在场；42 字截断导入随内脏退役', () => {
    expect(ih).toMatch(/import AltHitsViews from '\.\.\/components\/AltHitsViews\.vue';/);
    expect(ih).toMatch(/import \{ stripJsonComments, prettyJson, highlightJson \} from '\.\.\/utils\/jsonc';/);
    expect(ih, '42 字截断导入随卡片内脏迁共享件（667）').not.toMatch(/\btrunc\b/);
    expect(ih).toMatch(/const docsAltData = computed\(\(\) => docsHits\.value\.map\(h => \(\{ _id: h\._id, \.\.\.h\._source \}\)\)\);/);
    expect(ih).toMatch(/highlightJson\(prettyJson\(/);
  });
});

/* ═══════════ 三、直方图识别一致化（根因修正） ═══════════ */
describe('554 三：直方图字段识别与 DQ 对齐（等位 + 二次嗅探重放）', () => {
  it('runDocs：注入前 await ensureIhFields()（DQ preloadMapping().then(firstRun) 等位语义）', () => {
    const body = fnBody(ih, 'runDocs');
    const ensure = body.indexOf('await ensureIhFields();');
    const inject = body.indexOf('docsHist.applyHistToBody(');
    expect(ensure, '字段源等位在场').toBeGreaterThan(-1);
    expect(inject, '注入链在场（552 既有）').toBeGreaterThan(-1);
    expect(ensure, '等位先于注入（首查不赛跑）').toBeLessThan(inject);
  });
  it('runDsl：注入前 await ensureIhFields()（同上）', () => {
    const body = fnBody(ih, 'runDsl');
    const ensure = body.indexOf('await ensureIhFields();');
    const inject = body.indexOf('qryHist.applyHistToBody(');
    expect(ensure, '字段源等位在场').toBeGreaterThan(-1);
    expect(inject, '注入链在场（552 既有）').toBeGreaterThan(-1);
    expect(ensure, '等位先于注入').toBeLessThan(inject);
  });
  it('两链二次嗅探重放：sniffFromHits → injectField → 重放 onResp(r2)；失败 AbortError 豁免拉黑', () => {
    const dBody = fnBody(ih, 'runDocs');
    expect(dBody).toMatch(/docsHist\.sniffFromHits\(r\.hits \|\| \[\]\)/);
    expect(dBody).toMatch(/docsHist\.injectField\(retryBody, sniffed\)/);
    expect(dBody).toMatch(/docsHist\.onResp\(r2\)/);
    expect(dBody).toMatch(/if \(e\?\.name !== 'AbortError'\) docsHist\.markBroken\(\)/);
    const qBody = fnBody(ih, 'runDsl');
    expect(qBody).toMatch(/qryHist\.sniffFromHits\(qryResp\.value\.hits \|\| \[\]\)/);
    expect(qBody).toMatch(/qryHist\.injectField\(bodyObj, sniffed\)/);
    expect(qBody).toMatch(/qryHist\.onResp\(r2\)/);
    expect(qBody).toMatch(/if \(e\?\.name !== 'AbortError'\) qryHist\.markBroken\(\)/);
  });
  it('重放门：仅未注入且无桶时补嗅探（自带 date_histogram/已降级不重放）', () => {
    const dBody = fnBody(ih, 'runDocs');
    expect(dBody).toContain('if (!histInjected && !docsHist.histBuckets.value.length) {');
    const qBody = fnBody(ih, 'runDsl');
    expect(qBody).toContain('if (!histInjected');
    expect(qBody).toContain('!qryHist.histBuckets.value.length');
  });

  it('行为网：字段源拒（403）→ 首查裸查 → 响应后按 hits 值形态重放带 __hist 查询 → 直方图桶回填', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    mappingDetailFn.mockRejectedValue(new Error('403 inspect denied'));
    clusterQueryFn.mockImplementation((_idx: string, body: string) => {
      const o = JSON.parse(body);
      const base = { took: 1, total: 2, hits: DOCS_HITS };
      if (o.aggs?.__hist) {
        return Promise.resolve({ ...base, aggregations: { __hist: { buckets: [{ key: 1700000000000, key_as_string: '2023-11-15', doc_count: 2 }] } } });
      }
      return Promise.resolve(base);
    });
    const { host } = await mountHub(); /* 默认 docs tab：onMounted 即 runDocs */
    await settle(16);
    expect(clusterQueryFn.mock.calls.length, '裸查 1 次 + 二次嗅探重放 1 次').toBe(2);
    const first = JSON.parse(clusterQueryFn.mock.calls[0][1]);
    expect(first.aggs, '首查（字段源不可用）无 __hist').toBeUndefined();
    const replay = JSON.parse(clusterQueryFn.mock.calls[1][1]);
    expect(replay.aggs?.__hist, '重放带 __hist（auto_date_histogram 值形态嗅探）').toBeTruthy();
    expect(host.querySelector('.dq-hist-body rect.agg-bar'), '直方图桶回填渲染').toBeTruthy();
  });

  it('行为网：字段源到位（date 字段在 mapping）→ 首查即注入 __hist（无重放）', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    mappingDetailFn.mockResolvedValue({
      index: 'a-idx',
      raw: { properties: { issueTime: { type: 'date' }, name: { type: 'keyword' } } },
    });
    await mountHub();
    await settle(16);
    expect(clusterQueryFn.mock.calls.length, '首查即带 __hist，一次到位').toBe(1);
    const first = JSON.parse(clusterQueryFn.mock.calls[0][1]);
    expect(first.aggs?.__hist, 'mappingDates 命中 issueTime').toBeTruthy();
  });

  it('行为网：无 date 值形态且字段源不可用 → 不重放（一次裸查，诚实空态）', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    mappingDetailFn.mockRejectedValue(new Error('403'));
    clusterQueryFn.mockResolvedValue({ took: 1, total: 2, hits: [{ _id: '1', _source: { name: 'b' } }] });
    await mountHub();
    await settle(16);
    expect(clusterQueryFn.mock.calls.length, '无可嗅探字段不重放').toBe(1);
  });
});

/* ═══════════ 四、视图切换行为网（seg 点击 → hideBody + 偏好落盘） ═══════════ */
describe('554 四：视图 seg 行为网（点击切档 + hideBody 隐表格体 + usePref 落盘）', () => {
  it('docs：点 JSON 档 → RT 表格体隐藏（工具行常驻）+ alt JSON 体在场 + 偏好落盘；点表格档还原', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    const { host } = await mountHub();
    await settle();
    expect(clusterQueryFn.mock.calls.length, '首查在场（前置）').toBeGreaterThanOrEqual(1);
    const seg = [...host.querySelectorAll<HTMLElement>('.rt-bar .seg.ih-view-seg')][0];
    expect(seg, 'docs RT 工具行内视图 seg 在场').toBeTruthy();
    expect(seg.querySelectorAll('button').length, '四档全上').toBe(4);
    const jsonBtn = [...seg.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === 'JSON')!;
    jsonBtn.click();
    await settle();
    expect(localStorage.getItem('esquerystudio.pref.ih.docs.view'), 'usePref 落盘 json').toBe('"json"');
    const wrap = host.querySelector<HTMLElement>('.rt-wrap');
    expect(wrap, '表格体节点在场（v-hideBody 为 v-show 非 v-if）').toBeTruthy();
    expect(wrap!.style.display, '非表格档 RT 表格体自动隐藏').toBe('none');
    expect(host.querySelector('pre.json-view'), 'alt JSON 体渲染').toBeTruthy();
    const tblBtn = [...seg.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === '表格')!;
    tblBtn.click();
    await settle();
    expect(wrap!.style.display, '表格档还原').not.toBe('none');
  });
  it('query：点卡片档 → 卡片网格在场且点卡开文档弹窗（openDoc 闭环）', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    const { host } = await mountHub();
    await settle();
    /* 切 query tab 并执行一次查询（执行钮） */
    const qtab = [...host.querySelectorAll<HTMLButtonElement>('.ih-tabs button')].find(b => b.textContent?.includes('查询'))!;
    qtab.click();
    await settle();
    const run = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => (b.textContent || '').includes('执行查询'))!;
    run.click();
    await settle(16);
    expect(clusterQueryFn.mock.calls.length, '查询已执行（前置）').toBeGreaterThanOrEqual(1);
    const segs = [...host.querySelectorAll<HTMLElement>('.rt-bar .seg.ih-view-seg')];
    expect(segs.length, 'query RT 工具行内视图 seg 在场').toBe(1);
    const cardsBtn = [...segs[0].querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === '卡片')!;
    cardsBtn.click();
    await settle();
    const card = host.querySelector<HTMLElement>('.ih-cards .dq-card');
    expect(card, '卡片档渲染').toBeTruthy();
    (card as HTMLElement).click();
    /* 971 手势仲裁：单击延迟开（双击选词的第二击到达即取消首击），泵过仲裁窗再断言
     （settle 参数是 nextTick 循环数非毫秒——仲裁窗是真时器，须真时等待） */
    await new Promise(r => setTimeout(r, 300));
    await settle();
    /* n-modal Teleport 到 body——断言走 document（rtCellDetail 同法） */
    expect(document.body.querySelectorAll('.n-modal').length, '点卡开文档弹窗（openDoc）').toBeGreaterThan(0);
  });
});

/* ═══════════ 五、顶满钮负锚（语义不适用备案不做） ═══════════ */
describe('554 五：顶满钮负锚（IndexHub docs/query 无构建区，语义不适用）', () => {
  const stripComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '');
  it('两处 bar-prepend 标记层无「顶满」钮（注释备案除外；DQ buildCollapsed 是本页级收起构建区，IndexHub 无对应物）', () => {
    const dTag = stripComments(rtTag(ih, 'docsTbl'));
    const qTag = stripComments(rtTag(ih, 'qryTbl'));
    expect(dTag, 'docs 工具行无顶满接线').not.toMatch(/顶满|buildCollapsed|dq-fillpage/);
    expect(qTag, 'query 工具行无顶满接线').not.toMatch(/顶满|buildCollapsed|dq-fillpage/);
    expect(ih, '不引 DQ 构建区折叠态').not.toMatch(/const buildCollapsed/);
    /* 裁决备案在场（可追溯）：顶满语义不适用的说明保留在 bar-prepend 注释里 */
    expect(ih).toContain('「顶满」钮不接');
  });
});
