/**
 *  W3（轨3 数据表格内核）：syncSort 宿主权威排序态回填（约定遗留收口）。
 *
 * 背景：给 IndexHubView docs tab 接了 remote-sort+@sort-change（docsSort 态+重查），
 * 但 RT 内核排序箭头只由内部意图态 remoteSortCur（升→降→取消三态循环）驱动——宿主清了
 * docsSort（切索引），内核箭头仍停旧态。约定 syncSort 回填通道：
 * ① prop `syncSort?: { f: string; d: 1 | -1 } | null`（d 按约定契约收 1|-1，内核内部归一
 *    'asc'|'desc'——535 公共契约载荷）：remote 档下有值→回填 remoteSortCur（箭头/aria-sort
 *    同步该态，此后用户点击仍走既有三态循环只 emit 意图）；null=清态（箭头清+循环基点清）。
 * ② 缺省 undefined=未接线零增量：本地排序档/remote 档逐字节不变（不读不写 remoteSortCur，
 *    remote 未接线档箭头恒 hint/aria-sort 恒无）。本地（客户端）档不消费本 prop。
 * ③ 与「remoteSort=true 档挂载不读排序落盘」正交兼容：回填只走 prop 不触 LS。
 * ④ IndexHubView 消费侧接线：docsSortSync computed（'asc'|'desc'→1|-1 归一）传
 *    :sync-sort；切索引 watch(cur) 置 docsSort=null 即内核箭头同步清。重查不变路径零改动。
 *
 * ⚠ 域清单勘误（报告已列明）：特性叙述/540 接线/箭头内核（remoteSortCur）真身都在
 * ResultTable.vue（docs tab 消费方 <ResultTable ref="docsTbl">）；独占域清单所写
 * QueryResultTable.vue 是 QRT（SQL 通道轻量表，IndexHubView 不消费，改之即死代码）。
 * 本 spec 以 RT 真身为锚。
 *
 * 范围铁律：RT 高度模型（popH/聚合行/tfoot 字面）零触碰；props 只增不改。
 * 设施：tableKernelWave540 同款 monaco stub + 只 mock ../api + 裸 createApp 挂载。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
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

/* RT 直挂（ part 三同款）：propsFactory 每渲读取（ref 回填通道需响应式重渲） */
const RT_HITS = [
  { _id: 'a', _source: { n: 30 } },
  { _id: 'b', _source: { n: 10 } },
] as any;

async function mountRtLive(propsFactory: () => Record<string, unknown>) {
  const app = createApp({ setup: () => () => h(ResultTable as any, propsFactory()) });
  apps.push(app);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.use(createPinia());
  app.mount(host);
  await settle();
  return host;
}

const nTh = (host: ParentNode) => host.querySelector<HTMLElement>('thead th[data-col="n"]')!;
const hint = (host: ParentNode) => host.querySelector('thead th[data-col="n"] .rt-th-sort-hint');
const firstRowId = (host: ParentNode) => (host.querySelector('tbody td.rt-cell') as HTMLElement | null)?.textContent?.trim();

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
  clusterQueryFn.mockReset().mockResolvedValue({ took: 3, hits: RT_HITS, total: 25 });
});
afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
});

/* ═══════════ 一、RT 内核 syncSort 契约（行为网）═══════════ */
describe('：RT syncSort 缺省零增量锚（本地档/remote 档逐字节不变）', () => {
  it('remote 档未接线（缺省 undefined）：点击 emit 意图但箭头恒 hint/aria-sort 恒无，行序零触碰', async () => {
    const got: Array<{ f: string; d: 'asc' | 'desc' } | null> = [];
    const host = await mountRtLive(() => ({ hits: RT_HITS, total: 2, index: 'w543rt', remoteSort: true, onSortChange: (s: any) => got.push(s) }));
    const th = nTh(host);
    expect(th, 'RT 列推断出 n 表头（防空跑）').toBeTruthy();
    expect(hint(host), '未接线：⇅ hint 常驻').toBeTruthy();
    th.click(); await settle(6);
    expect(got).toEqual([{ f: 'n', d: 'asc' }]);
    expect(hint(host), '未接线：点击后箭头仍不显示（显示归宿主回填通道）').toBeTruthy();
    expect(th.getAttribute('aria-sort')).toBeNull();
    expect(firstRowId(host), '行序零触碰（仍原始序，540 同款锚：首业务格 30）').toBe('30');
  });

  it('本地档（remoteSort 缺省）：升→降→取消三态与 aria-sort 既有语义不变（显示链同一收口零增量）', async () => {
    const host = await mountRtLive(() => ({ hits: RT_HITS, total: 2, index: 'w543loc' }));
    const th = nTh(host);
    th.click(); await settle(6);
    expect(th.getAttribute('aria-sort'), '本地档首击升序（既有）').toBe('ascending');
    expect(hint(host), '链内列 hint 让位实色箭头（既有）').toBeNull();
    th.click(); await settle(6);
    expect(th.getAttribute('aria-sort')).toBe('descending');
    th.click(); await settle(6);
    expect(th.getAttribute('aria-sort'), '第三击取消（既有）').toBeNull();
    expect(hint(host), '取消后 hint 回归（既有）').toBeTruthy();
  });
});

describe('：RT syncSort 回填/清态契约（remote 档箭头回显通道）', () => {
  it('syncSort 有值→箭头/aria-sort 显示该态（回填驱动），行序/落盘零触碰；改值跟切', async () => {
    const sync = ref<{ f: string; d: 1 | -1 } | null>({ f: 'n', d: 1 });
    const host = await mountRtLive(() => ({ hits: RT_HITS, total: 2, index: 'w543sync', storageKey: 'w543sync', remoteSort: true, syncSort: sync.value }));
    const th = nTh(host);
    expect(th.getAttribute('aria-sort'), '宿主回填 asc → aria-sort=ascending').toBe('ascending');
    expect(hint(host), '回填后 hint 让位实色箭头').toBeNull();
    sync.value = { f: 'n', d: -1 };
    await settle();
    expect(th.getAttribute('aria-sort'), '宿主回填 desc → aria-sort=descending').toBe('descending');
    expect(firstRowId(host), '显示通道不触行序（仍原始序，540 同款锚）').toBe('30');
    expect(localStorage.getItem('es_tbl_sort:w543sync:m'), '回填不写排序落盘').toBeNull();
  });

  it('回填后用户点击仍走既有三态循环（从回填态续推）：asc→desc→null，显示随内部意图', async () => {
    const sync = ref<{ f: string; d: 1 | -1 } | null>({ f: 'n', d: 1 });
    const got: Array<{ f: string; d: 'asc' | 'desc' } | null> = [];
    const host = await mountRtLive(() => ({ hits: RT_HITS, total: 2, index: 'w543cyc', remoteSort: true, syncSort: sync.value, onSortChange: (s: any) => got.push(s) }));
    const th = nTh(host);
    th.click(); await settle(6);
    expect(got[0], '回填 asc 后点击 → emit desc（三态循环从回填态续推，非 asc 重启）').toEqual({ f: 'n', d: 'desc' });
    expect(th.getAttribute('aria-sort'), '显示随内部意图态（prop 未变不再回灌）').toBe('descending');
    th.click(); await settle(6);
    expect(got[1], '再击 → emit null（取消）').toBeNull();
    expect(th.getAttribute('aria-sort')).toBeNull();
    expect(hint(host), '取消后 hint 回归').toBeTruthy();
  });

  it('syncSort=null 清态锚：箭头清+循环基点清（null 后点击 asc 重启）', async () => {
    const sync = ref<{ f: string; d: 1 | -1 } | null>({ f: 'n', d: 1 });
    const got: Array<{ f: string; d: 'asc' | 'desc' } | null> = [];
    const host = await mountRtLive(() => ({ hits: RT_HITS, total: 2, index: 'w543null', remoteSort: true, syncSort: sync.value, onSortChange: (s: any) => got.push(s) }));
    expect(nTh(host).getAttribute('aria-sort')).toBe('ascending');
    sync.value = null;
    await settle();
    expect(nTh(host).getAttribute('aria-sort'), '宿主置 null → 箭头同步清').toBeNull();
    expect(hint(host), '清态后 hint 回归').toBeTruthy();
    nTh(host).click(); await settle(6);
    expect(got, '清态后点击从 asc 重启（循环基点已清）').toEqual([{ f: 'n', d: 'asc' }]);
  });

  it('兼容锚：remote 档挂载不读排序落盘——LS 残留不上箭头；回填值（非 LS 值）决定显示', async () => {
    localStorage.setItem('es_tbl_sort:w543ls:m', JSON.stringify([{ f: 'n', d: 'asc' }]));
    const raw = localStorage.getItem('es_tbl_sort:w543ls:m');
    /* 未接线：LS 残留不恢复箭头（538 审计口径，显示面再核） */
    const host1 = await mountRtLive(() => ({ hits: RT_HITS, total: 2, index: 'w543ls', storageKey: 'w543ls', remoteSort: true }));
    expect(nTh(host1).getAttribute('aria-sort'), '挂载不读落盘：LS 的 asc 不上箭头').toBeNull();
    expect(hint(host1)).toBeTruthy();
    /* 接线：显示来自宿主回填（desc），而非 LS 残留（asc）；落盘零触碰 */
    const sync = ref<{ f: string; d: 1 | -1 } | null>({ f: 'n', d: -1 });
    const host2 = await mountRtLive(() => ({ hits: RT_HITS, total: 2, index: 'w543ls', storageKey: 'w543ls', remoteSort: true, syncSort: sync.value }));
    expect(nTh(host2).getAttribute('aria-sort'), '显示来自回填（descending）而非 LS（ascending）').toBe('descending');
    expect(localStorage.getItem('es_tbl_sort:w543ls:m'), '回填路径不改写落盘').toBe(raw);
  });
});

/* ═══════════ 二、IndexHubView 消费侧接线（源码锁+行为锚）═══════════ */
describe('：IndexHubView docsSortSync 接线（源码锁）', () => {
  it('docs RT 标签 :sync-sort 在场；query tab RT 不接线；docsSortSync 归一 1/-1', () => {
    const dStart = ih.indexOf('<ResultTable ref="docsTbl"');
    expect(dStart).toBeGreaterThan(-1);
    const dTag = ih.slice(dStart, ih.indexOf('</ResultTable>', dStart));
    expect(dTag).toMatch(/remote-sort/);
    expect(dTag).toMatch(/:sync-sort="docsSortSync"/);

    /* query tab 切片不接线（DSL 手写不冲突，540 口径随行核） */
    const qStart = ih.indexOf('v-else-if="tab === \'query\'"');
    const qEnd = ih.indexOf('v-else-if="tab === \'settings\'"', qStart);
    expect(ih.slice(qStart, qEnd)).not.toMatch(/sync-sort|remote-sort|sort-change/);

    /* 归一 computed：'asc'→1 / 'desc'→-1，null 直通 */
    expect(ih).toMatch(/const docsSortSync = computed\(\(\) => docsSort\.value/);
    expect(ih).toMatch(/d: \(docsSort\.value\.d === 'asc' \? 1 : -1\) as 1 \| -1/);
  });

  it('切索引清 docsSort（540 锚同步更新核：清态即内核回填清的宿主侧来源）', () => {
    const wStart = ih.indexOf('watch(cur, () => {');
    expect(wStart).toBeGreaterThan(-1);
    const wBody = ih.slice(wStart, ih.indexOf('\n});', wStart));
    expect(wBody).toContain('docsSort.value = null;');
    expect(wBody).toContain('docsPage.value = 1; /* 切索引翻页归位 */');
  });
});

describe('：IndexHubView 接线行为锚（切索引内核箭头同步清）', () => {
  it('点表头回填上行（aria-sort=ascending）→ 切索引 docsSort=null → 箭头清', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    const { st } = await mountHub(); /* 默认 docs tab：onMounted 即 runDocs */
    await settle();
    nTh(document).click();
    await settle();
    expect(clusterQueryFn).toHaveBeenCalledTimes(2);
    /* 重查后 RT 重渲（v-if/骨架链）会替换 th 元素——断言一律现查（540 thByName 同款手法） */
    expect(nTh(document).getAttribute('aria-sort'), '排序后宿主 docsSort 回填 → 箭头上行').toBe('ascending');

    st.pick('b-idx');
    await settle();
    expect(clusterQueryFn.mock.calls.length, '切索引 docs tab 激活即重拉').toBeGreaterThanOrEqual(3);
    const last = JSON.parse(clusterQueryFn.mock.calls[clusterQueryFn.mock.calls.length - 1][1]);
    expect(last.sort, '重查 body 无 sort（540 既有语义零改动）').toBeUndefined();
    const th2 = nTh(document);
    expect(th2.getAttribute('aria-sort'), '切索引后内核箭头同步清（约定点）').toBeNull();
    expect(hint(document), '箭头清后 hint 回归').toBeTruthy();
  });
});
