/**
 * 五百五十四批工蚁A：es console 智能提示与高亮轨六件——
 *  A 值类型族单源下沉：KEYWORD_VALUE_TYPES（keyword/wildcard/constant_keyword）与数值族
 *    十口径（long/integer/short/byte/double/float/half_float/scaled_float/unsigned_long/
 *    token_count）下沉零依赖的 queryAstOps 导出；sqlCompletion re-export（552 C1 值锁
 *    保形）、dslCompletionContext AFFINITY keyword/number 与 LuceneInput NUMERIC_TYPES
 *    改吃单源；opsForType/typePriorityForOp 行为零变（token_count 维持 ['exists'] 兜底）。
 *  B LuceneInput 值位 keyword 族收口：items/known/refresh/choose 四处 t==='keyword' 本名
 *    判定改吃族表（去 wildcard，constant_keyword 也走 terms-agg；wildcard 维持静态 pref*
 *    档不动）；补 geo_point 值位静态档（'40.71,-74.01'，sqlCompletion VAL_FORMAT_HINTS
 *    .geo_point 对齐）+ known 随档同权。
 *  C LuceneInput 值位首轮预载：watch(fields) 读 lastRecentField(props.index)，命中 keyword
 *    族即空前缀 suggest 预热 TTL 缓存——手输字段名+冒号后首轮零网络（缓存命中同步回填）。
 *  D ClauseNode：①watch(node.field) 触发 primeValAgg（精确语义档 && kwAggFieldOf 命中）；
 *    ②range 四 input 按字段类型挂 datalist 形态提示（date→now-1d/d、数值→100、ip→CIDR）。
 *  E sqlCompletion ④ text 子字段档：text 列且 curFields 含 col.keyword 时出一条精确匹配
 *    候选（LuceneInput 550 text 档同语义）；其余维持零候选。
 *  F QueryXrayView/RankDebugView：dslAssist fields() 惰性 ensure 改挂载即 ensure
 *    （SearchSandboxView watch immediate 范式），fields() 退役为纯读。
 *
 * 行为锁照 suggestWave552 形态（只替换网络出口，组件/composable 全用真的）；源码锁
 * 照 luceneValTiers538 形态（readFileSync 锁档位数据面契约）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick, reactive, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* 只替换网络出口，组件/composable/store 全用真的（suggestWave552 同款惰性包装防 TDZ） */
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
import LuceneInput from '../components/LuceneInput.vue';
import { ensureSqlCompletion, KEYWORD_VALUE_TYPES as SQL_KW, type SqlCompletionCtx } from '../utils/sqlCompletion';
import { setFieldSearchIndex } from '../utils/fieldSearch';
import { __clearFieldCache } from '../composables/useIndexFields';
import { __clearSuggestCache } from '../composables/useTermsSuggest';
import { opsForType, typePriorityForOp } from '../utils/queryAstOps';
import { dslFieldAffinityTypes } from '../utils/dslCompletionContext';

/* 动态导入（queryAstOps 新导出在实施前不存在——undefined 呈红而非整文件载入崩） */
const qaoMod: any = await import('../utils/queryAstOps');

const SRC = join(__dirname, '..');
const readSrc = (rel: string) => readFileSync(join(SRC, rel), 'utf-8');
const li = readSrc('components/LuceneInput.vue');
const cn = readSrc('components/builder/ClauseNode.vue');
const sql = readSrc('utils/sqlCompletion.ts');
const dcc = readSrc('utils/dslCompletionContext.ts');
const qao = readSrc('utils/queryAstOps.ts');
const qx = readSrc('views/QueryXrayView.vue');
const rd = readSrc('views/RankDebugView.vue');

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/* ═══ LuceneInput 挂载 harness（sqlLuceneTiers546 同款） ═══ */

const CK_MAPPING = { raw: { properties: {
  ck: { type: 'constant_keyword' },
  geo: { type: 'geo_point' },
  rec: { type: 'keyword' },
} } };

async function mountInput(init: { index?: string } = {}) {
  const state = reactive({ modelValue: '', index: init.index ?? 'logs-2026.08' });
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
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
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, state };
}
const itemTexts = () => Array.from(document.body.querySelectorAll('.li-item .li-name')).map(el => el.textContent);
const inp = (host: ParentNode) => host.querySelector<HTMLInputElement>('.li-inp')!;
async function type(host: ParentNode, v: string) {
  const el = inp(host);
  el.value = v; /* happy-dom：程序赋值后 selectionStart 自动置尾 */
  el.dispatchEvent(new Event('input'));
  await settle();
}

/* ═══ ClauseNode 挂载 harness（suggestWave552 mountClause 可观测 node 版） ═══ */

function mountClause554(init: { fields?: string[]; types?: Record<string, string>; node?: Record<string, any> } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const node = ref<Record<string, any>>(init.node ?? { id: 't1', type: 'leaf', op: 'term', field: 'other', value: '', params: {}, raw: null });
  const app = createApp({
    render: () => h(ClauseNode as any, {
      node: node.value,
      fields: init.fields ?? ['name', 'other'],
      types: init.types ?? { name: 'keyword', other: 'date' },
      'onUpdate:node': (n: Record<string, any>) => { node.value = n; },
    }),
  });
  app.use(createPinia());
  app.config.warnHandler = () => {};
  app.mount(host);
  apps.push(app);
  return { host, node, app };
}

/* ═══ sqlCompletion harness（sqlLuceneTiers546 A 段同款最小 fake） ═══ */

type Provider = { provideCompletionItems: (model: any, position: any, context?: any, token?: any) => any };
function makeMonaco() {
  const providers: Record<string, Provider[]> = {};
  const api = {
    languages: {
      registerCompletionItemProvider: (_lang: string, p: Provider) => {
        (providers[_lang] ||= []).push(p);
        return { dispose: () => {} };
      },
      CompletionItemKind: { Field: 'Field', Property: 'Property', Value: 'Value' },
    },
  };
  return { api, providers };
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
const E_FIELDS = [
  { path: 'title', type: 'text' },
  { path: 'title.keyword', type: 'keyword' },
  { path: 'body', type: 'text' },
  { path: 'name', type: 'keyword' },
];
function eCtx(): () => SqlCompletionCtx {
  return () => ({
    indices: () => [{ index: 't' }],
    pickedIdx: () => 't',
    curFields: () => E_FIELDS,
    ensureCurFields: () => {},
  });
}

/* ═══ A：值类型族单源下沉（queryAstOps 单一出处） ═══ */

describe('A 值类型族单源下沉 queryAstOps', () => {
  it('A1 表锁：queryAstOps 导出 keyword 族三员 + 数值族十口径（值与原四处 literal 逐字同形）', () => {
    expect(qaoMod.KEYWORD_VALUE_TYPES).toEqual(['keyword', 'wildcard', 'constant_keyword']);
    expect(qaoMod.NUMERIC_VALUE_TYPES).toEqual(['long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'unsigned_long', 'token_count']);
  });

  it('A2 同源：sqlCompletion.KEYWORD_VALUE_TYPES 与 queryAstOps 同一引用（re-export 单源）', () => {
    expect(SQL_KW).toBe(qaoMod.KEYWORD_VALUE_TYPES);
  });

  it('A3 行为零变：token_count 维持 exists 兜底 + 既有 ops/prio/亲和序逐字不回退', () => {
    expect(opsForType('token_count')).toEqual(['exists']);
    expect(opsForType('unsigned_long')).toEqual(['term', 'terms', 'range', 'exists']);
    expect(typePriorityForOp('range')).toEqual(['date', 'date_nanos', 'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'unsigned_long']);
    expect(dslFieldAffinityTypes('term')).toEqual(['keyword', 'wildcard', 'constant_keyword']);
    expect(dslFieldAffinityTypes('range')).toContain('unsigned_long');
    expect(dslFieldAffinityTypes('range')).not.toContain('token_count');
  });

  it('A4 源码锁：四处 literal 收口（re-export + AFFINITY 消费 + NUMERIC_HINT_TYPES/LuceneInput 改吃单源）', () => {
    expect(qao).toContain("export const KEYWORD_VALUE_TYPES = ['keyword', 'wildcard', 'constant_keyword'];");
    expect(qao).toContain("export const NUMERIC_VALUE_TYPES = ['long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'unsigned_long', 'token_count'];");
    expect(sql).toContain('export { KEYWORD_VALUE_TYPES };');
    expect(sql).toContain('const NUMERIC_HINT_TYPES = NUMERIC_VALUE_TYPES;');
    expect(dcc).toContain('keyword: KEYWORD_VALUE_TYPES,');
    expect(dcc).toContain("number: NUMERIC_VALUE_TYPES.filter(t => t !== 'token_count'),");
    expect(li).toContain('const NUMERIC_TYPES = NUMERIC_VALUE_TYPES;');
  });
});

/* ═══ B：LuceneInput 值位 keyword 族收口 + geo_point 档 ═══ */

describe('B LuceneInput keyword 族收口 + geo_point 档', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    __clearFieldCache();
    __clearSuggestCache();
    mappingDetailFn.mockReset().mockResolvedValue(CK_MAPPING);
    searchRawFn.mockReset().mockResolvedValue({ aggregations: { suggest: { buckets: [{ key: 'active', doc_count: 2 }, { key: 'closed', doc_count: 1 }] } } });
  });
  afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; vi.useRealTimers(); vi.restoreAllMocks(); });

  it('B1 constant_keyword 值位走 terms-agg（族收口行为面：出候选非 no-values）', async () => {
    const { host } = await mountInput();
    await type(host, 'ck:');
    await vi.advanceTimersByTimeAsync(400);
    expect(searchRawFn, 'constant_keyword 进 terms-agg 请求').toHaveBeenCalledTimes(1);
    expect(itemTexts(), '候选值照 keyword 档回填').toEqual(['active', 'closed']);
  });

  it('B2 geo_point 值位静态档：40.71,-74.01（sqlCompletion VAL_FORMAT_HINTS.geo_point 对齐，零请求）', async () => {
    const { host } = await mountInput();
    await type(host, 'geo:');
    expect(itemTexts()).toEqual(['40.71,-74.01']);
    expect(searchRawFn, '静态档零请求').not.toHaveBeenCalled();
  });

  it('B3 geo_point 滤空出「无候选值」提示（known 随档同权）', async () => {
    const { host } = await mountInput();
    await type(host, 'geo:zzz');
    expect(document.body.querySelector('.li-hint')?.textContent, '滤空提示').toContain('暂无匹配');
  });

  it('B4 源码锁：四处 keyword 本名判定改族表（去 wildcard）+ GEO_HINTS 档 + known 收口', () => {
    expect(li).toContain("const AGG_KEYWORD_TYPES = KEYWORD_VALUE_TYPES.filter(t => t !== 'wildcard');");
    expect(li).toContain("if (AGG_KEYWORD_TYPES.includes(t)) return suggestions.value.filter(v => !p || v.toLowerCase().startsWith(p)).map(withSegs);");
    expect(li).toContain("if (suggesting.value && !items.value.length && AGG_KEYWORD_TYPES.includes(fieldType(s.field))) return 'values-loading';");
    expect(li).toContain("if (s.kind === 'value' && AGG_KEYWORD_TYPES.includes(fieldType(s.field))) suggest(s.field, s.prefix);");
    expect(li).toContain("if (AGG_KEYWORD_TYPES.includes(fieldType(it.text))) suggest(it.text, '');");
    expect(li).toContain("const GEO_HINTS = ['40.71,-74.01'];");
    expect(li).toContain("if (t === 'geo_point') return GEO_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);");
    /* 560 同步更新：known 行头部补 `s.field === '_exists_'`、尾部补 t === 'version'
       （两档 560 约定，滤空提示随权）——既有各族档/静态档语义零回退 */
    expect(li).toContain("const known = s.field === '_exists_' || KEYWORD_VALUE_TYPES.includes(t) || t === 'date' || t === 'boolean' || t === 'ip' || t === 'date_nanos' || t === 'text' || t === 'geo_point' || t === 'version' || RANGE_FLAT_TYPES.includes(t) || NUMERIC_TYPES.includes(t);");
  });

  it('B5 既有档保形：wildcard 静态 pref* 与 items date/NUMERIC_TYPES 行字面不回退', () => {
    expect(li).toContain("if (t === 'wildcard') return WILDCARD_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);");
    expect(li).toContain("if (t === 'date') return DATE_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);");
    expect(li).toContain('if (NUMERIC_TYPES.includes(t)) return NUM_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);');
  });
});

/* ═══ C：LuceneInput 值位首轮预载（watch(fields) 读最近字段） ═══ */

describe('C LuceneInput 值位首轮预载', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    __clearFieldCache();
    __clearSuggestCache();
    mappingDetailFn.mockReset().mockResolvedValue(CK_MAPPING);
    searchRawFn.mockReset().mockResolvedValue({ aggregations: { suggest: { buckets: [{ key: 'active', doc_count: 2 }, { key: 'closed', doc_count: 1 }] } } });
  });
  afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; vi.useRealTimers(); vi.restoreAllMocks(); });

  it('C1 fields 到位即预载最近 keyword 字段：冒号前 searchRaw 已发，值位缓存命中零新请求', async () => {
    localStorage.setItem('esquerystudio_qb_field_recent::logs-2026.08', JSON.stringify(['rec']));
    const { host } = await mountInput();
    await type(host, 'rec'); /* 手输字段名 → ensure → fields 到位 → watch 预载 */
    await vi.advanceTimersByTimeAsync(400);
    expect(searchRawFn, 'fields 到位即空前缀预载最近 keyword 字段').toHaveBeenCalledTimes(1);
    await type(host, 'rec:'); /* 冒号后值位 suggest 走 TTL 缓存 */
    await vi.advanceTimersByTimeAsync(400);
    expect(searchRawFn, '缓存命中零新请求（首轮即出候选）').toHaveBeenCalledTimes(1);
    expect(itemTexts(), '缓存同步回填候选').toEqual(['active', 'closed']);
  });

  it('C2 非 keyword 族最近字段零预载', async () => {
    localStorage.setItem('esquerystudio_qb_field_recent::logs-2026.08', JSON.stringify(['geo']));
    const { host } = await mountInput();
    await type(host, 'geo');
    await vi.advanceTimersByTimeAsync(400);
    expect(searchRawFn, 'geo_point 静态档字段不预载 terms').not.toHaveBeenCalled();
  });

  it('C3 源码锁：watch(fields) 预载接线 + lastRecentField import', () => {
    expect(li).toContain("import { searchFields, rememberRecentField, lastRecentField, type MarkSeg } from '../utils/fieldSearch';");
    expect(li).toContain('watch(fields, () => { primeRecentFieldAgg(); refresh(); });');
    expect(li).toContain('const f = lastRecentField(props.index);');
    expect(li).toContain('if (f && AGG_KEYWORD_TYPES.includes(fieldType(f))) suggest(f, \'\');');
  });
});

/* ═══ D：ClauseNode watch prime + range datalist ═══ */

describe('D ClauseNode：field watch prime + range 形态 datalist', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    setActivePinia(createPinia());
    setFieldSearchIndex('idx-554');
    __clearSuggestCache();
    searchRawFn.mockReset().mockResolvedValue({ aggregations: { suggest: { buckets: [{ key: 'v1' }, { key: 'v2' }] } } });
  });
  afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; vi.useRealTimers(); vi.restoreAllMocks(); });

  it('D1 换字段到 keyword 族即 prime terms-agg（watch(node.field) 行为面）', async () => {
    const { node } = mountClause554();
    await settle();
    expect(searchRawFn, '初始 date 字段零预载').not.toHaveBeenCalled();
    node.value = { ...node.value, field: 'name' };
    await settle();
    await vi.advanceTimersByTimeAsync(400);
    expect(searchRawFn, 'watch 触发 primeValAgg 空前缀预载').toHaveBeenCalledTimes(1);
  });

  it('D2 换到非 keyword 族字段零 prime', async () => {
    const { node } = mountClause554({ node: { id: 't2', type: 'leaf', op: 'term', field: 'name', value: '', params: {}, raw: null } });
    await settle();
    node.value = { ...node.value, field: 'other' };
    await settle();
    await vi.advanceTimersByTimeAsync(400);
    expect(searchRawFn, 'date 字段不预载').not.toHaveBeenCalled();
  });

  it('D3 range 值位 datalist 形态提示：date→date-math、数值→100、ip→CIDR、keyword 零档', () => {
    const mk = (field: string, types: Record<string, string>) => mountClause554({
      node: { id: 'r1', type: 'leaf', op: 'range', field, value: { gte: '', lt: '' }, params: {}, raw: null },
      types,
    });
    const d = mk('f', { f: 'date' });
    const dDl = d.host.querySelector('datalist');
    expect(dDl, 'date 族出 range datalist').toBeTruthy();
    expect(Array.from(dDl!.querySelectorAll('option')).map(o => o.value)).toEqual(['now-1d/d', 'now-1h/h']);
    d.app.unmount();
    const n = mk('f', { f: 'long' });
    expect(Array.from(n.host.querySelector('datalist')!.querySelectorAll('option')).map(o => o.value)).toEqual(['100']);
    n.app.unmount();
    const ip = mk('f', { f: 'ip' });
    expect(Array.from(ip.host.querySelector('datalist')!.querySelectorAll('option')).map(o => o.value)).toEqual(['10.0.0.0/24']);
    ip.app.unmount();
    const k = mk('kw', { kw: 'keyword' });
    expect(k.host.querySelector('datalist'), 'keyword 字段无 range 形态档').toBeNull();
    k.app.unmount();
  });

  it('D4 源码锁：watch 接线 + range 四 input :list', () => {
    expect(cn).toContain('watch(() => props.node.field, () => primeValAgg());');
    expect(cn.match(/:list="rangeDlId"/g)?.length, 'gte/lte/gt/lt 四 input 均挂 datalist').toBe(4);
    expect(cn).toContain("const rangeDlId = 'cn-rg-' + props.node.id;");
  });
});

/* ═══ E：sqlCompletion text 子字段档 ═══ */

describe('E sqlCompletion ④ text 子字段档', () => {
  it('E1 text 列且 mapping 含 col.keyword：= 位出一条精确匹配候选（detail 注明 .keyword）', async () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, eCtx());
    try {
      const before = "SELECT * FROM t WHERE title = 'x";
      const r = await sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
      expect(labelsOf(r), 'text 值位出 .keyword 子字段候选').toEqual(['title.keyword']);
      expect(String((r.suggestions as any[])[0].detail)).toContain('.keyword');
      expect((r.suggestions as any[])[0].kind).toBe('Value');
    } finally { h.dispose(); }
  });

  it('E2 text 列无 .keyword 子字段：维持零候选', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, eCtx());
    try {
      const before = "SELECT * FROM t WHERE body = 'x";
      const r = sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
      expect(labelsOf(r), '无子字段不出候选').toEqual([]);
    } finally { h.dispose(); }
  });

  it('E3 源码锁：子字段档分支在 ④ 值位收口处', () => {
    expect(sql).toContain("const kwPath = fld.path + '.keyword';");
    expect(sql).toContain('ctx.curFields().some(f => f.path === kwPath)');
  });
});

/* ═══ F：QueryXrayView/RankDebugView 挂载即 ensure ═══ */

describe('F dslAssist 挂载即 ensure（SearchSandboxView immediate 范式）', () => {
  it('F1 源码锁：QueryXrayView watch immediate ensure + 两视图 fields() 纯读', () => {
    expect(qx, '挂载即 ensure（index 变化跟随重拉）').toContain('watch(index, () => { void ensureAssistFields(); }, { immediate: true });');
    expect(qx, 'dslAssist fields() 惰性 ensure 退役为纯读（661 同步更新：terms 闭包同行追加，纯读语义零回退）').toContain('const dslAssist = { fields: () => assistFields.value, terms: (f: string, p: string) => qxTerms.suggestAsync(f, p) };');
    expect(rd, 'dslAssist fields() 纯读（ensure 已由既有 watch immediate 承担；661 同步更新：terms 闭包同行追加）').toContain('const dslAssist = { fields: () => assistFields.value, terms: (f: string, p: string) => rdTerms.suggestAsync(f, p) };');
  });
});
