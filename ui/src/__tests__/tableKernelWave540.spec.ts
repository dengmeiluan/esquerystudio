/**
 *  W3（轨3 数据表格内核）：remoteSort 消费侧真接线（§6y 遗留收口）。
 *
 * 契约（验收锚）：
 * ① IndexHubView 文档浏览器（docs tab）接 RT remoteSort 档：remote-sort + @sort-change；
 *    排序变化携 ES sort body 重查当前页（真服务端排序下推，dbx「排序下推」对标）——
 *    RT remote 档只 emit 意图（{f,d:'asc'|'desc'}|null，null=取消），取数归宿主。
 * ② 分页（goDocsPage）/页大小（setDocsSize）/刷新（@refresh）/新查询（runDocsNew）路径
 *    走 runDocs 天然携带 docsSort 态（排序是浏览态，不随页码/查询词重置，Kibana Discover
 *    心智）；切索引（watch cur）清 sort 态——排序属于当前索引维度。
 * ③ sort body 注入收口 buildDocsDslWithSort：parse-merge 包一层（buildDocsDsl 是共享纯函数，
 *    被 DslQueryView 等黑名单消费方读，源码锁锚其字面调用形态——不改 utils/workbench.ts）；
 *    body 形态 [{ f: { order: 'asc'|'desc', unmapped_type: 'long' } }]（unmapped_type 防动态列/
 *    跨分片映射缺失 400，ES 官方同款）。
 * ④ RT remoteSort 档 emit 契约轻量再锚（535 约定随行核）：点表头 emit {f,d}、行序/落盘零触碰。
 * ⑤ QRT 查询 tab（qryTbl）不接线——DSL 是用户手写，服务端排序下推会与用户 sort 子句冲突。
 *
 * 范围铁律：RT/QRT 内核零改动；DslQueryView（黑名单）缺省路径逐字节不变。
 * 设施：indexHubExec534 同款 monaco stub + 只 mock ../api + 裸 createApp 挂载。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* monaco editor.api stub——最小 editor 面（indexHubExec534 同款，斩断真实 monaco 导入链） */
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
import ResultTable from '../components/ResultTable.vue';
import { useAppStore } from '../stores/app';
import { __clearFieldCache } from '../composables/useIndexFields';

const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');

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

const btnByText = (host: ParentNode, re: RegExp) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => re.test((b.textContent || '').trim()));

/* docs tab 命中样例：name 字段供 RT 列推断出可点表头 */
const DOCS_HITS = [
  { _id: '1', _source: { name: 'b' } },
  { _id: '2', _source: { name: 'a' } },
];

const thByName = (host: ParentNode, col: string) =>
  [...host.querySelectorAll<HTMLElement>('thead th.rt-th')].find(t => t.textContent?.includes(col));

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

/* ═══════════ 一、源码锁：docs tab remoteSort 接线 ═══════════ */
describe('：IndexHubView 文档浏览器 remoteSort 消费接线（源码锁）', () => {
  it('docs RT 标签 remote-sort + @sort-change 在场；query tab RT 不接线（DSL 手写不冲突）', () => {
    /* docs RT 标签切片（防 query/其他消费方误匹配） */
    const dStart = ih.indexOf('<ResultTable ref="docsTbl"');
    expect(dStart, 'docs RT 消费标签存在（防空跑）').toBeGreaterThan(-1);
    const dTag = ih.slice(dStart, ih.indexOf('</ResultTable>', dStart));
    expect(dTag).toMatch(/remote-sort/);
    expect(dTag).toMatch(/@sort-change="onDocsSortChange"/);

    /* query tab 切片不含 remote-sort：DSL 是用户手写，服务端 sort 下推会与用户 sort 子句冲突 */
    const qStart = ih.indexOf('v-else-if="tab === \'query\'"');
    const qEnd = ih.indexOf('v-else-if="tab === \'settings\'"', qStart);
    const qSlice = ih.slice(qStart, qEnd);
    expect(qSlice, '查询 tab RT 无 remote-sort').not.toMatch(/remote-sort|sort-change/);
  });

  it('docsSort 态+onDocsSortChange（重查当前页不归 1）；buildDocsDslWithSort 注入 sort body', () => {
    expect(ih).toMatch(/const docsSort = ref<\{ f: string; d: 'asc' \| 'desc' \} \| null>\(null\);/);
    const fnStart = ih.indexOf('function onDocsSortChange(');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = ih.slice(fnStart, ih.indexOf('\n}', fnStart));
    expect(fnBody).toContain("docsSort.value = s;");
    expect(fnBody).toContain('void runDocs();');
    expect(fnBody, '重查当前页：排序不归页 1（页码语义与翻页一致）').not.toContain('docsPage.value = 1');

    /* sort body 注入收口：parse-merge 包一层， buildDocsDsl 字面调用锚原样保留 */
    expect(ih).toMatch(/function buildDocsDslWithSort\(\): string \{/);
    expect(ih).toMatch(/JSON\.parse\(buildDocsDsl\(docsQ\.value, docsSize\.value, \(docsPage\.value - 1\) \* docsSize\.value\)\)/);
    /* 1150：下推字段先过 resolveSortField（text 无 .keyword 子域=ES 必 400，拦下不下发），
       实际写入用裁决后的 r.field；unmapped_type 兜底口径不变 */
    expect(ih).toContain('const r = resolveSortField(docsSort.value.f, fieldTypesMap.value);');
    expect(ih).toMatch(/o\.sort = \[\{ \[r\.field\]: \{ order: docsSort\.value\.d, unmapped_type: 'long' \} \}\];/);
    /* runDocs 消费注入件（api.clusterQuery 第二参 DSL 来自带 sort 版本）。
       同步更新：runDocs 接直方图注入链（useHistAgg 统一件）后改为 bodyObj
       可变引用形态——buildDocsDslWithSort() 产物 parse 进 bodyObj（sort 注入不变），
       applyHistToBody 只加 __hist 聚合不动 sort，降级重试两处均 stringify(bodyObj)。
       锁意图原样：带 sort 的产物进重查 body、重查当前页不归 1。 */
    expect(ih).toMatch(/const bodyObj = JSON\.parse\(buildDocsDslWithSort\(\)\) as Record<string, unknown>;/);
    expect(ih).toMatch(/api\.clusterQuery\(idx, JSON\.stringify\(bodyObj\), docsSize\.value, signal\)/);
  });

  it('切索引清 sort 态（watch cur 段：排序属于当前索引维度）', () => {
    const wStart = ih.indexOf('watch(cur, () => {');
    expect(wStart).toBeGreaterThan(-1);
    const wBody = ih.slice(wStart, ih.indexOf('\n});', wStart));
    expect(wBody).toContain('docsSort.value = null;');
    /* 归位行原样保留（既有锁随行核） */
    expect(wBody).toContain('docsPage.value = 1; /* 切索引翻页归位 */');
  });
});

/* ═══════════ 二、行为网：排序下推真重查 ═══════════ */
describe('：docs tab 排序下推行为网（真服务端排序重查当前页）', () => {
  it('首查无 sort；点表头→携 ES sort body 重查当前页（from 不变）；三态 asc→desc→取消', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    const { host } = await mountHub(); /* 默认 docs tab：onMounted 即 runDocs */
    await settle();
    expect(clusterQueryFn).toHaveBeenCalledTimes(1);
    const first = JSON.parse(clusterQueryFn.mock.calls[0][1]);
    expect(first.sort, '首查（原始序）不带 sort').toBeUndefined();
    expect(first.from).toBe(0);

    const th = thByName(host, 'name');
    expect(th, 'RT 列推断出 name 表头').toBeTruthy();
    th!.click();
    await settle();
    expect(clusterQueryFn).toHaveBeenCalledTimes(2);
    const asc = JSON.parse(clusterQueryFn.mock.calls[1][1]);
    expect(asc.sort, 'asc 下推：[{ name: { order: asc, unmapped_type: long } }]')
      .toEqual([{ name: { order: 'asc', unmapped_type: 'long' } }]);
    expect(asc.from, '重查当前页（第 1 页 from 仍 0）').toBe(0);

    th!.click();
    await settle();
    const desc = JSON.parse(clusterQueryFn.mock.calls[2][1]);
    expect(desc.sort).toEqual([{ name: { order: 'desc', unmapped_type: 'long' } }]);
    expect(desc.from).toBe(0);

    th!.click();
    await settle();
    const off = JSON.parse(clusterQueryFn.mock.calls[3][1]);
    expect(off.sort, '第三击取消排序：body 无 sort（回 ES 原始序）').toBeUndefined();
  });

  it('翻页携带 sort 态（from 真翻页）；新查询保留 sort 态（排序是浏览态）', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    const { host } = await mountHub();
    await settle();
    const th = thByName(host, 'name')!;
    th.click();
    await settle();
    expect(clusterQueryFn).toHaveBeenCalledTimes(2);

    /* 翻到第 2 页：sort 态保持 + from=size（真分页下推） */
    host.querySelector<HTMLButtonElement>('button[aria-label="下一页"]')!.click();
    await settle();
    expect(clusterQueryFn).toHaveBeenCalledTimes(3);
    const p2 = JSON.parse(clusterQueryFn.mock.calls[2][1]);
    expect(p2.sort, '翻页路径 sort 态保持').toEqual([{ name: { order: 'asc', unmapped_type: 'long' } }]);
    expect(p2.from, 'from 真翻页').toBe(clusterQueryFn.mock.calls[2][2]);

    /* 新查询（检索钮=runDocsNew 页码归 1）：sort 态仍保持（Kibana Discover 心智） */
    (btnByText(host, /检索/) as HTMLElement).click();
    await settle();
    expect(clusterQueryFn).toHaveBeenCalledTimes(4);
    const rerun = JSON.parse(clusterQueryFn.mock.calls[3][1]);
    expect(rerun.from, '新查询页码归 1').toBe(0);
    expect(rerun.sort, '新查询 sort 态保持').toEqual([{ name: { order: 'asc', unmapped_type: 'long' } }]);
  });

  it('切索引清 sort 态：重查 body 无 sort（行为面）', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    const { st } = await mountHub();
    await settle();
    thByName(document, 'name')!.click();
    await settle();
    expect(clusterQueryFn).toHaveBeenCalledTimes(2);

    st.pick('b-idx');
    await settle();
    expect(clusterQueryFn.mock.calls.length, '切索引 docs tab 激活即重拉').toBeGreaterThanOrEqual(3);
    const last = JSON.parse(clusterQueryFn.mock.calls[clusterQueryFn.mock.calls.length - 1][1]);
    expect(last.sort, '切索引后 sort 态清（新索引原始序）').toBeUndefined();
  });
});

/* ═══════════ 三、RT remoteSort 档 emit 契约锚（535 约定随行核） ═══════════ */
describe('：RT remoteSort 档 emit 契约（轻量再锚）', () => {
  it('remoteSort=true 点表头只 emit {f,d}（asc 起步）；本地行序/落盘零触碰', async () => {
    const got: Array<{ f: string; d: 'asc' | 'desc' } | null> = [];
    const HITS = [
      { _id: 'a', _source: { n: 30 } },
      { _id: 'b', _source: { n: 10 } },
    ] as any;
    const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 2, index: 'w540rs', remoteSort: true, onSortChange: (s: any) => got.push(s) }) });
    apps.push(app);
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.use(createPinia());
    app.mount(host);
    await settle();
    const th = [...host.querySelectorAll<HTMLElement>('thead th.rt-th')].find(t => t.textContent?.includes('n'))!;
    th.click(); await settle(6);
    th.click(); await settle(6);
    th.click(); await settle(6);
    expect(got, '三态循环：asc→desc→null（宿主消费后重查）').toEqual([{ f: 'n', d: 'asc' }, { f: 'n', d: 'desc' }, null]);
    const firstCell = host.querySelector('tbody td.rt-cell') as HTMLElement;
    expect(firstCell.textContent?.trim(), '本地行序零触碰（仍原始序 30）').toBe('30');
    expect(localStorage.getItem('es_tbl_sort:w540rs:m'), '不写排序落盘').toBeNull();
  });
});
