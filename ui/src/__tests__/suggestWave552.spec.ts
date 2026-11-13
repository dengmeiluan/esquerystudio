/**
 * 552 批轨1：智能提示与高亮五件（TDD 先行，实现前全红）——
 *  A ClauseNode 值位 datalist：接 useTermsSuggest，terms-agg top20 候选与查询历史合并去重
 *    喂同一 datalist；静默闸随 qhStore 先例（无 pinia 裸挂载 null 零降级）；索引语境读
 *    fieldSearch 模块态 curFieldSearchIndex（深嵌树内无 index prop 可透传）。
 *  B sqlCompletion 值位：抽 KEYWORD_VALUE_TYPES = ['keyword','wildcard','constant_keyword']
 *    单一出处（dslCompletionContext.AFFINITY_FAMILIES.keyword 同表先例），constant_keyword
 *    走 terms-agg 候选（wildcard 保留 LIKE % 静态档——545 表锁）；NUMERIC_HINT_TYPES 并入
 *    token_count；VAL_FORMAT_HINTS 补 geo_point 档。
 *  C LuceneInput：known 表同步更新 constant_keyword（token_count 经 NUMERIC_TYPES 同权）。
 *  D FieldSelect：选中 keyword 族字段空前缀预载 terms（LuceneInput.choose 551 同范式；
 *    裸挂载无 pinia 零动作，索引语境缺席 suggest 空参早退零请求）。
 *  E SnapshotsView：rename_pattern new RegExp 试编译提示条 + Indices 索引表达式
 *    indexNameRule 校验（逗号分隔拆分逐个、通配 * 探针放行）。
 *
 * 范式：LuceneInput 走 suggestWave551 挂载范式（createApp+h+pinia+router，只 mock ../api）；
 * sqlCompletion 走 sqlValPos535 monaco 最小 fake；ClauseNode/FieldSelect 走 fieldSelectPopup
 * createApp 手工 mount。⚠用例顺序敏感：A 组裸挂载判空必须在文件内任何 pinia 建立之前
 * （histEntry528 同前提——pinia install 会全局 setActivePinia 残留）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick, ref, reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* 只替换网络出口，组件/composable/store 全用真的（suggestWave551 同款惰性包装防 TDZ） */
const mappingDetailFn = vi.fn();
const searchRawFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      searchRaw: (...a: any[]) => searchRawFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
    },
  };
});

import ClauseNode from '../components/builder/ClauseNode.vue';
import FieldSelect from '../components/builder/FieldSelect.vue';
import LuceneInput from '../components/LuceneInput.vue';
import { ensureSqlCompletion, VAL_FORMAT_HINTS, KEYWORD_VALUE_TYPES, type SqlCompletionCtx } from '../utils/sqlCompletion';
import { setFieldSearchIndex } from '../utils/fieldSearch';
import { __clearFieldCache } from '../composables/useIndexFields';
import { __clearSuggestCache } from '../composables/useTermsSuggest';

const SRC = join(__dirname, '..');
const readSrc = (rel: string) => readFileSync(join(SRC, rel), 'utf-8');
const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

function seedHist(items: Array<Partial<{ id: string; mode: string; query: string; index: string; ts: number }>>) {
  localStorage.setItem('es_query_hist_v2', JSON.stringify(
    items.map((it, i) => ({ id: it.id ?? 'qh-' + i, mode: it.mode, query: it.query, index: it.index, ts: it.ts ?? 1700000000000 + i })),
  ));
}

function mountClause(opts: { pinia?: boolean; fields?: string[]; types?: Record<string, string>; node?: Record<string, any> } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const node = ref<Record<string, any>>(opts.node ?? { id: 't1', type: 'leaf', op: 'term', field: '', value: '', params: {}, raw: null });
  const app = createApp({
    render: () => h(ClauseNode as any, {
      node: node.value,
      fields: opts.fields ?? ['status'],
      types: opts.types ?? { status: 'keyword' },
      'onUpdate:node': (n: Record<string, any>) => { node.value = n; },
    }),
  });
  if (opts.pinia) app.use(createPinia());
  app.config.warnHandler = () => {};
  app.mount(host);
  apps.push(app);
  return host;
}

function mountSelect(opts: { pinia?: boolean; fields?: string[]; types?: Record<string, string> } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const val = ref('');
  const app = createApp({
    render: () => h(FieldSelect as any, {
      modelValue: val.value,
      fields: opts.fields ?? ['status'],
      types: opts.types ?? { status: 'keyword' },
      'onUpdate:modelValue': (v: string) => { val.value = v; },
    }),
  });
  if (opts.pinia) app.use(createPinia());
  app.config.warnHandler = () => {};
  app.mount(host);
  apps.push(app);
  return host;
}

/* FieldSelect 弹层 Teleport 到 body（fieldSelectPopup 同款） */
const fsItems = () => Array.from(document.body.querySelectorAll<HTMLElement>('.fs-item'));
async function focusAndPick(host: ParentNode, type = '') {
  const inp = host.querySelector<HTMLInputElement>('.fs-inp')!;
  inp.dispatchEvent(new Event('focus'));
  await settle();
  if (type) { inp.value = type; inp.dispatchEvent(new Event('input')); await settle(); }
  const item = fsItems()[0] as HTMLElement;
  expect(item, '候选必须在场').toBeTruthy();
  item.click();
  await settle();
}

const TERMS = { aggregations: { suggest: { buckets: [{ key: 'active' }, { key: 'closed' }] } } };
const dlVals = (host: ParentNode) => [...host.querySelectorAll('datalist option')].map(o => o.getAttribute('value'));

/* ═══ A：裸挂载静默契约（必须在文件内任何 pinia 之前） ═══ */
describe('A 裸挂载静默契约（无 pinia 零降级，histEntry528/fieldSelectPopup 同前提）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    setFieldSearchIndex('');
    searchRawFn.mockReset().mockResolvedValue(TERMS);
  });
  afterEach(() => { vi.useRealTimers(); while (apps.length) apps.pop()!.unmount(); });

  it('A1 ClauseNode 裸挂载：无 datalist 零崩溃（termCtx/qhStore 双闸关闭）', async () => {
    seedHist([{ id: 'a', mode: 'dsl', query: '{"term":{"status":"ACTIVE"}}' }]);
    const host = mountClause({ pinia: false });
    await settle();
    expect(host.querySelector('.cn'), '组件本体照常渲染').toBeTruthy();
    expect(host.querySelector('datalist'), '无 pinia 环境静默无 datalist（qhStore 闸既有语义不回退）').toBeNull();
  });

  it('A2 FieldSelect 裸挂载：选中 keyword 字段零崩溃、最近字段记忆照写、零预载', async () => {
    const host = mountSelect({ pinia: false });
    await focusAndPick(host);
    expect(JSON.parse(localStorage.getItem('esquerystudio_qb_field_recent') || '[]'), '记忆通道不受影响').toEqual(['status']);
    expect(searchRawFn, '裸挂载零预载').not.toHaveBeenCalled();
  });
});

/* ═══ B：ClauseNode terms-agg 合并 datalist ═══ */
describe('B ClauseNode 值位 datalist：terms-agg top20 × 历史合并去重', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    setFieldSearchIndex('');
    __clearSuggestCache();
    mappingDetailFn.mockReset().mockResolvedValue({ raw: { properties: {} } });
    searchRawFn.mockReset().mockResolvedValue(TERMS);
  });
  afterEach(() => { vi.useRealTimers(); while (apps.length) apps.pop()!.unmount(); });

  it('B1 选中 keyword 字段预热缓存 → 值位聚焦零网络白得 → datalist=agg+历史去重合并', async () => {
    vi.useFakeTimers();
    /* 历史含 'active'（与 agg 桶重叠，证去重）与 agg 外的 RED/BLUE */
    seedHist([
      { id: 'a', mode: 'dsl', query: '{"term":{"status":"active"}}' },
      { id: 'b', mode: 'dsl', query: '{"terms":{"status":["RED","BLUE"]}}' },
    ]);
    setFieldSearchIndex('idx-a');
    const host = mountClause({ pinia: true });
    await focusAndPick(host);          // FieldSelect 预载（模块级 TTL 缓存）+ onField 换字段
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(searchRawFn, 'FieldSelect 预载恰好一包').toHaveBeenCalledTimes(1);
    expect(JSON.parse(searchRawFn.mock.calls[0][1]).aggs.suggest.terms.field).toBe('status');
    /* 值位聚焦 prime：同字段空前缀 → 模块缓存命中零网络（552 架构主断言） */
    (host.querySelector<HTMLInputElement>('.cn-val')!).dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(searchRawFn, '缓存白得：值位聚焦零新增请求').toHaveBeenCalledTimes(1);
    expect(dlVals(host), 'agg 先行 + 历史续后去重（active 重叠只留一份）')
      .toEqual(['active', 'closed', 'RED', 'BLUE']);
  });

  it('B2 非 keyword 族字段：值位聚焦零请求（历史通道照旧、零 terms 浪费）', async () => {
    vi.useFakeTimers();
    setFieldSearchIndex('idx-a');
    const host = mountClause({ pinia: true, fields: ['host'], types: { host: 'ip' } });
    await focusAndPick(host);
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    (host.querySelector<HTMLInputElement>('.cn-val')!).dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(searchRawFn, 'ip 字段不值位 terms，零预载零 prime').not.toHaveBeenCalled();
  });

  it('B3 源码锁：静默闸 + curFieldSearchIndex 索引语境 + KEYWORD_VALUE_TYPES 门槛 + prime 接线', () => {
    const cn = readSrc('components/builder/ClauseNode.vue');
    expect(cn, 'useTermsSuggest 静默闸（qhStore 同款形态）')
      .toContain('const termCtx = getActivePinia() ? useTermsSuggest(curFieldSearchIndex, () => props.types) : null;');
    expect(cn, 'keyword 族单一出处消费').toContain("import { KEYWORD_VALUE_TYPES } from '../../utils/sqlCompletion';");
    expect(cn, '值输入聚焦 prime 接线').toContain('@focus="primeValAgg"');
    expect(cn, '合并链：agg 先行 + 历史续后').toContain('termCtx.suggestions.value');
  });
});

/* ═══ C：sqlCompletion KEYWORD_VALUE_TYPES / constant_keyword / token_count / geo_point ═══ */

type Provider = { provideCompletionItems: (model: any, position: any, context?: any, token?: any) => any };
function makeMonaco() {
  const providers: Record<string, Provider[]> = {};
  const mapi = {
    languages: {
      registerCompletionItemProvider: (_lang: string, p: Provider) => {
        (providers[_lang] ||= []).push(p);
        return { dispose: () => {} };
      },
      CompletionItemKind: { Field: 'Field', Property: 'Property', Value: 'Value' },
    },
  };
  return { api: mapi, providers };
}
const SQL_FIELDS = [
  { path: 'name', type: 'keyword' },
  { path: 'ck', type: 'constant_keyword' },
  { path: 'pat', type: 'wildcard' },
  { path: 'tk', type: 'token_count' },
  { path: 'loc', type: 'geo_point' },
];
function makeCtx(over: Partial<SqlCompletionCtx> = {}): SqlCompletionCtx {
  return {
    indices: () => [{ index: 'orders' }],
    pickedIdx: () => 'orders',
    curFields: () => SQL_FIELDS,
    ensureCurFields: () => {},
    ...over,
  };
}
function ctxFn(over: Partial<SqlCompletionCtx> = {}): () => SqlCompletionCtx {
  return () => makeCtx(over);
}
function fakeModel(text: string, offset: number, word = '') {
  return {
    getValue: () => text,
    getOffsetAt: () => offset,
    getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1 + word.length, word }),
  };
}
function sqlProvider(m: ReturnType<typeof makeMonaco>): Provider {
  const arr = m.providers.sql;
  expect(arr, 'sql 语言 provider 必须已注册').toBeTruthy();
  return arr![arr!.length - 1];
}
const labelsOf = (r: any) => ((r?.suggestions ?? []) as any[]).map(s => s.label);

describe('C sqlCompletion：KEYWORD_VALUE_TYPES 单一出处 + 三档扩容', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    __clearSuggestCache();
    searchRawFn.mockReset().mockResolvedValue(TERMS);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('C1 表锁：KEYWORD_VALUE_TYPES 族三员定形（AFFINITY_FAMILIES.keyword 同表）', () => {
    expect(KEYWORD_VALUE_TYPES).toEqual(['keyword', 'wildcard', 'constant_keyword']);
  });

  it('C2 constant_keyword 列值位走 terms-agg（detail 带类型，kind=Value）', async () => {
    vi.useFakeTimers();
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    try {
      const before = "SELECT * FROM orders WHERE ck = 'f";
      const p = sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
      await vi.advanceTimersByTimeAsync(10);
      const r = await p;
      expect(searchRawFn, '走 terms-agg 候选').toHaveBeenCalledTimes(1);
      expect(labelsOf(r)).toEqual(['active', 'closed']);
      expect(String((r.suggestions as any[])[0].detail)).toContain('constant_keyword');
      expect((r.suggestions as any[])[0].kind).toBe('Value');
    } finally { h.dispose(); __clearSuggestCache(); }
  });

  it('C3 wildcard 列仍走 LIKE % 静态档（族内去 wildcard，545 表锁零同步更新回归）', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    try {
      const before = "SELECT * FROM orders WHERE pat = 'p";
      const r = sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
      expect(labelsOf(r), 'wildcard 不进 terms-agg，保留 pref% 静态格式档').toEqual(['pref%']);
      expect(searchRawFn, '静态档零请求').not.toHaveBeenCalled();
    } finally { h.dispose(); }
  });

  it('C4 token_count 数值档：= 位出 100、BETWEEN 位出区间形态（551 D2 同语义）', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    try {
      const eq = 'SELECT * FROM orders WHERE tk = ';
      const r1 = sqlProvider(m).provideCompletionItems(fakeModel(eq, eq.length), { lineNumber: 1 });
      expect(labelsOf(r1), '数值族静态档').toEqual(['100']);
      expect(String((r1.suggestions as any[])[0].detail)).toContain('token_count');
      const bt = 'SELECT * FROM orders WHERE tk BETWEEN ';
      const r2 = sqlProvider(m).provideCompletionItems(fakeModel(bt, bt.length), { lineNumber: 1 });
      expect(labelsOf(r2), 'BETWEEN 区间形态').toEqual(['10 AND 20']);
      expect(searchRawFn, '静态档零请求').not.toHaveBeenCalled();
    } finally { h.dispose(); }
  });

  it('C5 geo_point 档：表锁定形 + 行为出 40.71,-74.01（静态快返零请求）', () => {
    expect(VAL_FORMAT_HINTS.geo_point).toEqual({ detail: '字面提示 · geo_point', values: ['40.71,-74.01'] });
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    try {
      const before = 'SELECT * FROM orders WHERE loc = ';
      const r = sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
      expect(labelsOf(r)).toEqual(['40.71,-74.01']);
      expect(String((r.suggestions as any[])[0].detail)).toContain('geo_point');
      expect(searchRawFn, '静态档零请求').not.toHaveBeenCalled();
    } finally { h.dispose(); }
  });

  it('C6 源码锁：族表导出 + 值位分支消费（AGG_VALUE_TYPES）', () => {
    /* 554 同步更新：KEYWORD_VALUE_TYPES 表本体下沉 queryAstOps 零依赖单源（数值族
       NUMERIC_VALUE_TYPES 同批下沉），sqlCompletion 改 re-export——原「export const
       落在 sqlCompletion」锚同步更新为「queryAstOps 定义 + sqlCompletion re-export」，
       值逐字同形（C1 表锁保形）；AGG_VALUE_TYPES 消费锚原样不动 */
    expect(readSrc('utils/queryAstOps.ts')).toContain("export const KEYWORD_VALUE_TYPES = ['keyword', 'wildcard', 'constant_keyword'];");
    const sql = readSrc('utils/sqlCompletion.ts');
    expect(sql).toContain('export { KEYWORD_VALUE_TYPES };');
    expect(sql).toContain('AGG_VALUE_TYPES.includes(fld.type)');
  });
});

/* ═══ D：LuceneInput known 同步更新 constant_keyword + NUMERIC_TYPES 并入 token_count ═══ */

const LUCENE_MAPPING = { raw: { properties: {
  cfield: { type: 'constant_keyword' },
  tfield: { type: 'token_count' },
} } };

async function mountInput() {
  const state = reactive({ modelValue: '', index: 'logs-2026.08' });
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(LuceneInput, {
      modelValue: state.modelValue,
      index: state.index,
      'onUpdate:modelValue': (v: string) => { state.modelValue = v; },
    }),
  });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  app.mount(host);
  await settle();
  return { host, state };
}
const itemTexts = () => Array.from(document.body.querySelectorAll('.li-item .li-name')).map(el => el.textContent);
async function type(host: ParentNode, v: string) {
  const el = host.querySelector<HTMLInputElement>('.li-inp')!;
  el.value = v; /* happy-dom：程序赋值后 selectionStart 自动置尾 */
  el.dispatchEvent(new Event('input'));
  await settle();
}

describe('D LuceneInput：known 同步更新 constant_keyword + token_count 数值档', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    __clearFieldCache();
    __clearSuggestCache();
    mappingDetailFn.mockReset().mockResolvedValue(LUCENE_MAPPING);
    searchRawFn.mockReset().mockResolvedValue(TERMS);
  });
  afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

  it('D1 constant_keyword 值位滤空出「无候选值」提示（known 同步更新行为面，与既有档同权）', async () => {
    /* 554 同步更新：constant_keyword 值位由「known 兜底滤空提示」升格为 AGG_KEYWORD_TYPES 族表
       terms-agg 动态候选（LuceneInput keyword 族收口约定）——原「非 keyword 不触发 terms」
       契约随批退役；滤空提示语义保留：terms 已回（零桶）且本地过滤为空仍出「暂无」 */
    searchRawFn.mockReset().mockResolvedValue({ aggregations: { suggest: { buckets: [] } } });
    vi.useFakeTimers();
    try {
      const { host } = await mountInput();
      await type(host, 'cfield:');
      await vi.advanceTimersByTimeAsync(400);
      expect(searchRawFn, '族表收口后走 terms-agg').toHaveBeenCalledTimes(1);
      /* 空 buckets 后 watch(suggestions)→refresh 会再发一次空前缀 suggest（空结果 watch 环
         为 useTermsSuggest 既有面，554 不动）——再推进一拍令其缓存命中落稳（仍零新请求） */
      await vi.advanceTimersByTimeAsync(400);
      expect(searchRawFn, '缓存命中零新请求').toHaveBeenCalledTimes(1);
      expect(document.body.querySelector('.li-hint'), 'known 档滤空提示在場').toBeTruthy();
      expect(document.body.querySelector('.li-hint')!.textContent).toContain('暂无');
    } finally { vi.useRealTimers(); }
  });

  it('D2 token_count 值位出数值静态档（NUMERIC_TYPES 并入行为面）', async () => {
    const { host } = await mountInput();
    await type(host, 'tfield:');
    expect(itemTexts()).toEqual(['>100', '[10 TO 20]']);
    expect(searchRawFn, '静态档零请求').not.toHaveBeenCalled();
  });

  it('D3 源码锁：known 行补 constant_keyword + NUMERIC_TYPES 行补 token_count', () => {
    /* 554 同步更新：known 行收口 KEYWORD_VALUE_TYPES 族表（constant_keyword 经族表在册，
       语义扩 geo_point 随权）；NUMERIC_TYPES 表本体下沉 queryAstOps.NUMERIC_VALUE_TYPES
       单源（值逐字同形，token_count 在册）。原契约意图保持：constant_keyword 与
       token_count 均在档，滤空提示/数值静态档随权不变。
       560 同步更新：known 行头部补 `s.field === '_exists_'`、尾部补 t === 'version'
       （两档 560 约定）——constant_keyword/token_count 既有语义零回退 */
    const li = readSrc('components/LuceneInput.vue');
    expect(li).toContain("const known = s.field === '_exists_' || KEYWORD_VALUE_TYPES.includes(t) || t === 'date' || t === 'boolean' || t === 'ip' || t === 'date_nanos' || t === 'text' || t === 'geo_point' || t === 'version' || RANGE_FLAT_TYPES.includes(t) || NUMERIC_TYPES.includes(t);");
    expect(li).toContain('const NUMERIC_TYPES = NUMERIC_VALUE_TYPES;');
  });
});

/* ═══ E：FieldSelect keyword 族空前缀预载 ═══ */
describe('E FieldSelect 选中字段空前缀预载（LuceneInput.choose 551 同范式）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    setFieldSearchIndex('');
    __clearSuggestCache();
    searchRawFn.mockReset().mockResolvedValue(TERMS);
  });
  afterEach(() => { vi.useRealTimers(); while (apps.length) apps.pop()!.unmount(); });

  it('E1 选中 keyword 字段：300ms 防抖后一次空前缀 terms（无 include）；索引语境缺席零请求', async () => {
    vi.useFakeTimers();
    setFieldSearchIndex('idx-a');
    const host = mountSelect({ pinia: true });
    await focusAndPick(host);
    expect(searchRawFn, '预载走 300ms 防抖，窗内不发包').not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    expect(searchRawFn.mock.calls[0][0]).toBe('idx-a');
    const body = JSON.parse(searchRawFn.mock.calls[0][1]);
    expect(body.aggs.suggest.terms.field).toBe('status');
    expect(body.aggs.suggest.terms.include, '空前缀省略 include（语义=top20 by doc_count）').toBeUndefined();
    /* 索引语境缺席：suggest 空参早退零请求 */
    setFieldSearchIndex('');
    __clearSuggestCache();
    searchRawFn.mockClear();
    const host2 = mountSelect({ pinia: true });
    await focusAndPick(host2);
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(searchRawFn, '无索引语境零动作（保裸挂载静默同款契约）').not.toHaveBeenCalled();
  });

  it('E2 非 keyword 族字段零预载 + 源码锁：静默闸 + KEYWORD_VALUE_TYPES 门槛', async () => {
    vi.useFakeTimers();
    setFieldSearchIndex('idx-a');
    const host = mountSelect({ pinia: true, fields: ['host'], types: { host: 'ip' } });
    await focusAndPick(host);
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(searchRawFn, 'ip 字段不预载').not.toHaveBeenCalled();
    const fs = readSrc('components/builder/FieldSelect.vue');
    expect(fs, '静默闸（qhStore 同款形态）').toContain('const valSuggest = getActivePinia() ? useTermsSuggest(curFieldSearchIndex, () => props.types) : null;');
    expect(fs, 'keyword 族门槛 + 空前缀调用在場').toContain("if (valSuggest && KEYWORD_VALUE_TYPES.includes(h.type)) valSuggest.suggest(h.path, '');");
  });
});

/* ═══ F：SnapshotsView 输入智能校验（视图接线锁，suggestWave551 A/E 同理由：接线是形态契约） ═══ */
describe('F SnapshotsView：rename 正则试编译 + Indices 索引表达式校验', () => {
  const sv = () => readSrc('views/SnapshotsView.vue');

  it('F1 lint 接线锚：useInputLint/indexNameRule 接入 + 三实例 + 三 watch', () => {
    const s = sv();
    expect(s, 'lint 单源接入').toContain("import { useInputLint, indexNameRule, type LintRule } from '../composables/useInputLint';");
    expect(s, '创建 Indices 校验').toContain('const createIndicesLint = useInputLint([snapshotIndicesRule()]);');
    expect(s, '恢复 Indices 校验').toContain('const restoreIndicesLint = useInputLint([snapshotIndicesRule()]);');
    expect(s, 'rename_pattern 正则校验').toContain('const renamePatternLint = useInputLint([renamePatternRule()]);');
    expect(s, '创建 Indices watch 接线').toContain('watch(createIndices, v => { createIndicesCheck(v); });');
    expect(s, '恢复 Indices watch 接线').toContain('watch(restoreIndices, v => { restoreIndicesCheck(v); });');
    expect(s, 'rename_pattern watch 接线').toContain('watch(restoreRenamePattern, v => { restoreRenamePatternCheck(v); });');
  });

  it('F2 规则锚：逗号拆分逐个校验 + 通配 * 探针放行 + new RegExp 试编译', () => {
    const s = sv();
    expect(s, '多表达式拆分逐个校验').toContain("for (const part of v.split(',')) {");
    expect(s, '单表达式逻辑复用 indexNameRule').toContain('const single = indexNameRule();');
    expect(s, '通配符探针：* 折叠为普通字符过单表达式校验（快照 indices 支持通配）').toContain("expr.replace(/\\*/g, 'a')");
    expect(s, 'rename_pattern 试编译').toContain('try { new RegExp(v); return null; }');
  });

  it('F3 模板锚：三处 .il-hint 提示条（theme.css 单一样式出处）+ 行内折行收口', () => {
    const s = sv();
    expect(s).toContain('v-if="createIndicesHint"');
    expect(s).toContain('v-if="restoreIndicesHint"');
    expect(s).toContain('v-if="restoreRenamePatternHint"');
    expect(s.match(/class="il-hint"/g)!.length, '三处提示条挂全站 il-hint 类').toBeGreaterThanOrEqual(3);
    expect(s, '提示条折行占满整行（容器内收口，theme.css 禁全局 basis 纪律）').toContain('.sv-form-row .il-hint { flex-basis: 100%; }');
  });
});
