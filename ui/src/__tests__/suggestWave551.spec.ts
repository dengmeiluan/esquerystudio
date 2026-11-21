/**
 * 551 批轨1：全站智能提示与高亮五件（TDD 先行，实现前全红）——
 *  A ProfileFlameView lint 接线（真盲区）：dsl-assist 已接但 lintDsl/setMarkers 缺席，
 *    RankDebugView 范式逐字平移（lint computed + useDebounceFn 250ms + JsonArea setMarkers）；
 *  B LuceneInput 值位：keyword terms 飞行中 hint=null → 弹层闪关，补 values-loading 档
 *    （复用字段 loading 占位形态，items 非空不出档防收窄闪）；choose 选中 keyword 字段后
 *    空前缀 suggest 预载（TTL 缓存白得 548 A2 宽前缀本地滤）；IP_HINTS 补 CIDR 形态
 *    （sqlCompletion D1 姊妹面同批对齐）；
 *  C BoostTuner：kwField 变化空前缀预载 kwSuggest(f,'')（kwField 非空时）；
 *    .bt-drop-chip 手写 warn-soft 徽标改用 StatusPill tone="y"（550 批 is-kind/syn/flt 先例）；
 *  D sqlCompletion：VAL_FORMAT_HINTS ip 档补 CIDR；BETWEEN 语境数值族出 '10 AND 20' 区间
 *    形态（LuceneInput NUM_HINTS '[10 TO 20]' 同语义）；② ensure / ③ ensureCurFields 两处
 *    fire-and-forget 改 Promise 链（④ keyword 档同款先例，token 取消弃回填）；
 *  E SystemView lintDsl 补 fields ctx（SY_TYPES 固定表在场即 mapping 事实源，类型错配规则白得）。
 *
 * mount 范式：LuceneInput 走 suggestWave550/luceneInput.spec 范式（createApp+h+pinia+router，
 * 只 mock ../api 出口）；sqlCompletion 走 sqlValPos535 monaco 最小 fake（零挂载）；
 * ProfileFlame/SystemView/BoostTuner 走源码锁（lintMarkersWave534 同理由：happy-dom 不参与
 * Monaco 计算，接线是形态契约）+ lintDsl 纯函数单元断言。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* 只替换网络出口，组件/composable/store 全用真的（luceneInput.spec 同款惰性包装防 TDZ） */
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

import LuceneInput from '../components/LuceneInput.vue';
import { lintDsl } from '../utils/dslLint';
import { ensureSqlCompletion, VAL_FORMAT_HINTS, type SqlCompletionCtx } from '../utils/sqlCompletion';
import { api } from '../api';
import { __clearFieldCache } from '../composables/useIndexFields';
import { __clearSuggestCache } from '../composables/useTermsSuggest';

const SRC = join(__dirname, '..');
const readSrc = (rel: string) => readFileSync(join(SRC, rel), 'utf-8');
const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/* ═══ LuceneInput 挂载（suggestWave550 同款范式） ═══ */
const MAPPING = { raw: { properties: {
  status: { type: 'keyword' },
  host: { type: 'ip' },
} } };
const TERMS = { aggregations: { suggest: { buckets: [{ key: 'active' }, { key: 'closed' }] } } };

async function mountInput(init: { modelValue?: string } = {}) {
  const state = reactive({ modelValue: init.modelValue ?? '', index: 'logs-2026.08' });
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

/* 弹层 Teleport 在 body 下，统一查 document.body（luceneInput.spec 同款） */
const pop = () => document.body.querySelector('.li-pop');
const itemTexts = () => Array.from(document.body.querySelectorAll('.li-item .li-name')).map(el => el.textContent);
async function type(host: ParentNode, v: string) {
  const el = host.querySelector<HTMLInputElement>('.li-inp')!;
  el.value = v; /* happy-dom：程序赋值后 selectionStart 自动置尾 */
  el.dispatchEvent(new Event('input'));
  await settle();
}

beforeEach(() => {
  setActivePinia(createPinia());
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  __clearFieldCache();
  __clearSuggestCache();
  mappingDetailFn.mockReset().mockResolvedValue(MAPPING);
  searchRawFn.mockReset().mockResolvedValue(TERMS);
});

afterEach(() => {
  vi.useRealTimers();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  vi.restoreAllMocks();
});

/* ═══ A：ProfileFlameView lint 接线（真盲区） ═══ */

describe('A ProfileFlameView lint 接线（RankDebugView 范式平移）', () => {
  it('源码锁：lintDsl import + lint computed（fields ctx 同源 dsl-assist）+ JsonArea ref + setMarkers 降级接线', () => {
    const pf = readSrc('views/ProfileFlameView.vue');
    expect(pf, 'lintDsl 静态体检接入').toContain("import { lintDsl } from '../utils/dslLint';");
    expect(pf, '防抖统一件接入').toContain("import { useDebounceFn } from '../composables/useDebounceFn';");
    expect(pf, 'lint ctx 与 dsl-assist 同源字段表').toContain('lintDsl(JSON.parse(dsl.value || \'\'), { fields: assistFields.value })');
    expect(pf, 'JsonArea 实例 ref 在场').toMatch(/<JsonArea ref="pfJaRef" v-model="dsl"/);
    expect(pf, 'findings 注入编辑器划线（533 范式）').toContain('pfJaRef.value?.setMarkers?.(pfLint.value');
    expect(pf, 'info 降级 hint（marker 档只收 warning/hint/error）').toContain("severity: f.severity === 'info' ? 'hint' as const : f.severity");
    expect(pf, '输入即刷新划线（RankDebug 同款 immediate）').toContain('watch(dsl, () => { queuePfLintMarkers(); }, { immediate: true });');
  });

  it('lintDsl 单元：坏 body 出 error finding（接线后经 setMarkers 成 marker 的数据面）', () => {
    const fs = lintDsl(JSON.parse('{"query":"term"}'));
    expect(fs.some(f => f.rule === 'query-structure' && f.severity === 'error')).toBe(true);
    const bare = lintDsl(JSON.parse('{"term":{"status":"a"}}'));
    expect(bare.some(f => f.rule === 'root-bare-clause' && f.severity === 'error')).toBe(true);
  });
});

/* ═══ B：LuceneInput 值位 loading 档 + choose 预载 + IP CIDR ═══ */

describe('B1 LuceneInput values-loading 档（terms 飞行中弹层不闪关）', () => {
  it('首敲 keyword 值位：飞行中 hint=「正在加载候选值…」且弹层不关；响应到位换列表', async () => {
    vi.useFakeTimers();
    const { host } = await mountInput();
    await type(host, 'status:ac');
    const hintEl = pop()!.querySelector('.li-hint');
    expect(hintEl, '飞行中不再 hint=null 关层，改出加载占位').toBeTruthy();
    expect(hintEl!.textContent).toContain('正在加载候选值');
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(itemTexts(), '响应到位换列表（原语义不变）').toEqual(['active']);
  });

  it('收窄过滤期 items 非空：不出加载档、列表持续（防收窄闪）', async () => {
    vi.useFakeTimers();
    const { host } = await mountInput();
    await type(host, 'status:a');
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(itemTexts()).toEqual(['active']);
    await type(host, 'status:act');
    expect(pop()!.querySelector('.li-hint'), '旧候选尚可显示 → 不出加载档').toBeNull();
    expect(itemTexts(), '列表在防抖飞行期持续').toEqual(['active']);
    vi.useRealTimers();
  });

  it('源码锁：hint 联合类型扩档 + 模板占位行 + items 空门槛（防收窄误入档）', () => {
    const li = readSrc('components/LuceneInput.vue');
    expect(li).toContain("'no-match' | 'no-values' | 'values-loading' | null");
    expect(li).toContain(`<div v-else-if="hint === 'values-loading'" class="li-hint">正在加载候选值…</div>`);
    /* 554 同步更新：飞行中档类型门槛随 keyword 族收口（AGG_KEYWORD_TYPES，constant_keyword
       同出加载占位）——items 空门槛防收窄误入档的契约意图保形 */
    expect(li).toMatch(/suggesting\.value && !items\.value\.length && AGG_KEYWORD_TYPES\.includes\(fieldType\(s\.field\)\)/);
  });
});

describe('B2 choose 字段后空前缀预载（TTL 缓存白得）', () => {
  it('选中 keyword 字段 → 发一次空前缀 terms（无 include=top20），防抖窗内零请求', async () => {
    vi.useFakeTimers();
    const { host } = await mountInput();
    await type(host, 'stat');
    expect(document.body.querySelector('.li-item .li-name')!.textContent).toBe('status');
    (document.body.querySelector('.li-item') as HTMLElement).click();
    await settle();
    expect(searchRawFn, '预载走 300ms 防抖，窗内不发包').not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    const body = JSON.parse(searchRawFn.mock.calls[0][1]);
    expect(body.aggs.suggest.terms.field).toBe('status');
    expect(body.aggs.suggest.terms.include, '空前缀省略 include（语义=top20 by doc_count）').toBeUndefined();
    vi.useRealTimers();
  });

  it('非 keyword 字段不预载（text/ip 等值位走静态档/子字段推荐，terms 是浪费）', async () => {
    vi.useFakeTimers();
    const { host } = await mountInput();
    await type(host, 'hos');
    (document.body.querySelector('.li-item') as HTMLElement).click();
    await settle();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(searchRawFn, 'ip 字段不值位 terms，零预载').not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('源码锁：choose 侧 keyword 门槛 + 空前缀调用在場', () => {
    /* 554 同步更新：choose 侧 keyword 本名门槛收口 AGG_KEYWORD_TYPES 族表
       （KEYWORD_VALUE_TYPES 去 wildcard，constant_keyword 选中同预载）——空前缀调用锚不变 */
    const li = readSrc('components/LuceneInput.vue');
    expect(li).toContain("if (AGG_KEYWORD_TYPES.includes(fieldType(it.text))) suggest(it.text, '');");
  });
});

describe('B3 IP_HINTS 补 CIDR 形态（sqlCompletion D1 姊妹面同批对齐）', () => {
  it('行为：ip 字段值位出点分示例 + CIDR 两档（前缀本地滤既有通道）', async () => {
    const { host } = await mountInput();
    await type(host, 'host:');
    expect(itemTexts()).toEqual(['192.168.0.1', '192.168.0.0/24']);
    expect(searchRawFn, '静态档零请求').not.toHaveBeenCalled();
  });

  it('源码锁：IP_HINTS 常量表双档定形', () => {
    const li = readSrc('components/LuceneInput.vue');
    expect(li).toContain("const IP_HINTS = ['192.168.0.1', '192.168.0.0/24'];");
  });
});

/* ═══ C：BoostTuner kwField 预载 + 掉出徽标改用 StatusPill ═══ */

describe('C BoostTunerView kwField 预载 + bt-drop-chip 改用 StatusPill', () => {
  it('源码锁：kwField 变化空前缀预载（非空门槛）+ StatusPill tone="y" 改用 + 手写色档退役', () => {
    const bt = readSrc('views/BoostTunerView.vue');
    expect(bt, 'kwField 变化空前缀预载（kwField 非空时）').toContain('watch(kwField, f => { if (f) kwSuggest(f, \'\'); });');
    expect(bt, '掉出徽标改用 StatusPill（550 is-kind/syn/flt 先例，bt-drop-chip 锚保留）')
      .toContain('<StatusPill v-for="d in dropped" :key="d" class="bt-drop-chip" tone="y" :label="d" />');
    expect(bt, 'StatusPill 统一件 import 在场').toContain("import StatusPill from '../components/StatusPill.vue';");
    expect(bt, '手写 warn-soft 色档退役（色归 tone 单源）').not.toMatch(/\.bt-drop-chip \{[^}]*warn-soft/);
  });
});

/* ═══ D：sqlCompletion ip CIDR + BETWEEN 形态 + Promise 化 ═══ */

/* monaco 最小 fake（sqlValPos535 同款） */
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
  { path: 'amount', type: 'double' },
  { path: 'created', type: 'date' },
  { path: 'ip', type: 'ip' },
  { path: 'title', type: 'text' },
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
function sqlProvider(monaco: ReturnType<typeof makeMonaco>): Provider {
  const arr = monaco.providers.sql;
  expect(arr, 'sql 语言 provider 必须已注册').toBeTruthy();
  return arr![arr!.length - 1];
}
const labelsOf = (r: any) => ((r?.suggestions ?? []) as any[]).map(s => s.label);

describe('D1 sqlCompletion ip 档补 CIDR', () => {
  it('行为：ip 列值位出点分示例 + CIDR 两档（静态快返零请求）；detail 带类型名', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    const spy = vi.spyOn(api, 'searchRaw');
    try {
      const r = sqlProvider(m).provideCompletionItems(
        fakeModel('SELECT * FROM orders WHERE ip = ', 'SELECT * FROM orders WHERE ip = '.length), { lineNumber: 1 });
      expect(labelsOf(r)).toEqual(['192.168.0.1', '192.168.0.0/24']);
      expect(String((r.suggestions as any[])[0].detail)).toContain('ip');
      expect((r.suggestions as any[])[0].kind).toBe('Value');
      expect(spy, '静态档零请求').not.toHaveBeenCalled();
    } finally { h.dispose(); vi.restoreAllMocks(); }
  });

  it('表锁：VAL_FORMAT_HINTS.ip 双档定形（551 同步更新）', () => {
    expect(VAL_FORMAT_HINTS.ip).toEqual({ detail: '字面提示 · ip', values: ['192.168.0.1', '192.168.0.0/24'] });
  });
});

describe('D2 BETWEEN 语境数值族出区间形态', () => {
  it('行为：double 列 BETWEEN 位出「10 AND 20」（= 位仍出 100，两语境并存不互扰）', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    try {
      const r = sqlProvider(m).provideCompletionItems(
        fakeModel('SELECT * FROM orders WHERE amount BETWEEN ', 'SELECT * FROM orders WHERE amount BETWEEN '.length), { lineNumber: 1 });
      expect(labelsOf(r), 'BETWEEN 语境出区间形态（LuceneInput [10 TO 20] 同语义）').toEqual(['10 AND 20']);
      const r2 = sqlProvider(m).provideCompletionItems(
        fakeModel('SELECT * FROM orders WHERE amount = ', 'SELECT * FROM orders WHERE amount = '.length), { lineNumber: 1 });
      expect(labelsOf(r2), '非 BETWEEN 语境静态档原样').toEqual(['100']);
      const r3 = sqlProvider(m).provideCompletionItems(
        fakeModel('SELECT * FROM orders WHERE amount > ', 'SELECT * FROM orders WHERE amount > '.length), { lineNumber: 1 });
      expect(labelsOf(r3), '其余比较符原样').toEqual(['100']);
    } finally { h.dispose(); }
  });

  it('非数值族 BETWEEN 不变形：date 列仍 date-math；text 列零候选', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    try {
      const r = sqlProvider(m).provideCompletionItems(
        fakeModel('SELECT * FROM orders WHERE created BETWEEN ', 'SELECT * FROM orders WHERE created BETWEEN '.length), { lineNumber: 1 });
      expect(labelsOf(r)).toEqual(['now-1d/d', 'now-1h/h']);
      const r2 = sqlProvider(m).provideCompletionItems(
        fakeModel("SELECT * FROM orders WHERE title BETWEEN 'x", "SELECT * FROM orders WHERE title BETWEEN 'x".length), { lineNumber: 1 });
      expect(r2.suggestions).toEqual([]);
    } finally { h.dispose(); }
  });
});

describe('D3 ②③ 两处 Promise 化（首轮即出，④ keyword 档先例）', () => {
  it('② 限定列位：返回 Promise，await 微任务后首轮非空（mapping 在途不再空过一轮）', async () => {
    mappingDetailFn.mockResolvedValue({ raw: { properties: { name: { type: 'keyword' } } } });
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn({ curFields: () => [] }));
    try {
      const before = 'SELECT * FROM orders WHERE o.';
      const p = sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
      expect(p, 'provider 返回 Promise').toHaveProperty('then');
      const r = await p;
      expect(labelsOf(r), '首轮即非空（await ensure 后 searchFields）').toEqual(['name']);
    } finally { h.dispose(); __clearFieldCache(); }
  });

  it('② token 取消：弃迟到回填（请求照发，回填口零候选）', async () => {
    mappingDetailFn.mockResolvedValue({ raw: { properties: { name: { type: 'keyword' } } } });
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn({ curFields: () => [] }));
    try {
      const before = 'SELECT * FROM orders WHERE o.';
      const p = sqlProvider(m).provideCompletionItems(
        fakeModel(before, before.length), { lineNumber: 1 }, undefined, { isCancellationRequested: true });
      const r = await p;
      expect(r.suggestions, '取消后不得回填').toEqual([]);
    } finally { h.dispose(); __clearFieldCache(); }
  });

  it('③ 词位：ensureCurFields 为 Promise 时 await 后出候选；同步 void 旧口径兼容（微任务一拍）', async () => {
    let release!: () => void;
    const gate = new Promise<void>(res => { release = res; });
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn({ ensureCurFields: () => gate }));
    try {
      const before = 'SELECT * FROM orders WHERE ';
      const p = sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
      expect(p).toHaveProperty('then');
      release();
      const r = await p;
      expect(labelsOf(r).length, 'fields 到位后出候选').toBeGreaterThan(0);
      expect(labelsOf(r)).toContain('name');
    } finally { h.dispose(); }
  });

  it('③ token 取消：弃回填', async () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    try {
      const before = 'SELECT * FROM orders WHERE ';
      const p = sqlProvider(m).provideCompletionItems(
        fakeModel(before, before.length), { lineNumber: 1 }, undefined, { isCancellationRequested: true });
      const r = await p;
      expect(r.suggestions).toEqual([]);
    } finally { h.dispose(); }
  });
});

/* ═══ E：SystemView lintDsl 补 fields ctx ═══ */

describe('E SystemView lintDsl 补 fields ctx（SY_TYPES 固定表派生）', () => {
  it('源码锁：lintDsl 第二参 fields ctx 在场（SY_TYPES 派生，系统索引 mapping 不读）', () => {
    const sv = readSrc('views/SystemView.vue');
    expect(sv).toContain('const SY_LINT_FIELDS = Object.entries(SY_TYPES).map(([path, type]) => ({ path, type }));');
    expect(sv).toContain("lintDsl(JSON.parse(dsl.value || ''), { fields: SY_LINT_FIELDS })");
  });

  it('lintDsl 单元：fields ctx 后类型错配规则白得（keyword-range / range-type / unknown-field）', () => {
    const fields = Object.entries({
      job_id: 'keyword', status_name: 'keyword', index_name: 'keyword', updated_ts: 'long',
    }).map(([path, type]) => ({ path, type }));
    const rulesOf = (dsl: string) => lintDsl(JSON.parse(dsl), { fields }).map(f => f.rule);
    expect(rulesOf('{"query":{"range":{"job_id":{"gte":"a","lte":"z"}}}}')).toContain('keyword-range');
    expect(rulesOf('{"query":{"range":{"updated_ts":{"gte":"abc"}}}}')).toContain('range-type');
    expect(rulesOf('{"query":{"term":{"job_idx":"a"}}}')).toContain('unknown-field');
  });
});
