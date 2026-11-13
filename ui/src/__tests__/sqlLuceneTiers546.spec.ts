/**
 * 546 批轨1：语义排序/类型档收口三件——
 *  A sqlCompletion ② 限定列位语义排序：该位此前按原始 mapping 序出列、无类型亲和；
 *    接 CLAUSE_TYPE_PRIO（clauseOf(before) 上下文，535 R1 三词位同款形态）做语义置顶
 *    （WHERE/GROUP BY/HAVING 位 keyword 置前、SELECT 位零倾向原 rank 序；候选集不变）；
 *  B LuceneInput：field 段 searchFields 传 typePriorityForOp('term')（裸词=term 语义，
 *    builder FieldSelect 同表先例）；值位档补 wildcard（'pref*' 通配形态，544 姊妹表同形）
 *    与 date_nanos（≡date 族，复用本地 DATE_HINTS）；既有五档字面行不回退（luceneValTiers538 锁同步更新）；
 *  C ColPicker types 徽标：新可选 prop types（缺省 undefined=零增量不传不出徽标），
 *    清单行字段名旁渲染 .mft-type 色卡徽标（FieldPicker.vue:51 同语言）。
 *
 * sql 段行为锁照 sqlValPos535 形态（monaco 最小 fake + pinia）；LuceneInput/ColPicker
 * 照 luceneInput.spec / colPicker.spec 的 createApp+h 挂载范式。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick, reactive, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

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

import { ensureSqlCompletion, type SqlCompletionCtx } from '../utils/sqlCompletion';
import LuceneInput from '../components/LuceneInput.vue';
import ColPicker from '../components/ColPicker.vue';
import { __clearFieldCache } from '../composables/useIndexFields';
import { __clearSuggestCache } from '../composables/useTermsSuggest';

const SRC = join(__dirname, '..');
const li = readFileSync(join(SRC, 'components/LuceneInput.vue'), 'utf-8');
const cp = readFileSync(join(SRC, 'components/ColPicker.vue'), 'utf-8');

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/* ═══ A：sqlCompletion ② 限定列位语义排序（sqlValPos535 形态） ═══ */

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
const SQL_MAPPING = { raw: { properties: {
  name: { type: 'keyword' },
  amount: { type: 'double' },
  created: { type: 'date' },
  title: { type: 'text' },
} } };
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

describe('A sqlCompletion ② 限定列位语义排序', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    __clearFieldCache();
    __clearSuggestCache();
    mappingDetailFn.mockReset().mockResolvedValue(SQL_MAPPING);
    searchRawFn.mockReset().mockResolvedValue({ aggregations: { suggest: { buckets: [] } } });
  });

  it('WHERE 语境限定列位：keyword 置前（CLAUSE_TYPE_PRIO term 同表），候选集不变', async () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, (): SqlCompletionCtx => ({
      indices: () => [{ index: 'orders' }],
      pickedIdx: () => 'orders',
      curFields: () => [],
      ensureCurFields: () => {},
    }));
    const before = 'SELECT * FROM orders WHERE o.';
    /* 551 同步更新：A3 Promise 化——provider await ensure，首轮字段到位即出候选
       （原 fire-and-forget「首轮零候选等下次触发」契约随批退役）；语义排序/候选集/detail 断言原样保留 */
    const r1 = await sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
    expect(labelsOf(r1), '首轮 await ensure 后即出候选（551 A3）').toEqual(['name', 'amount', 'created', 'title']);
    await settle();
    const r2 = await sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
    expect(labelsOf(r2), 'keyword 置前，其余殿后保持 rank+字母序').toEqual(['name', 'amount', 'created', 'title']);
    expect(String(r2.suggestions[0].detail), 'detail 既有「来自 表名」文案保持').toContain('来自 o');
    h.dispose();
  });

  it('SELECT 语境限定列位：零倾向原 rank 序（字母序）；GROUP BY 语境同 WHERE keyword 置前', async () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, (): SqlCompletionCtx => ({
      indices: () => [{ index: 'orders' }],
      pickedIdx: () => 'orders',
      curFields: () => [],
      ensureCurFields: () => {},
    }));
    const sel = 'SELECT o.';
    /* 551 同步更新：A3 Promise 化——首轮 await 即出（预载语义不变），后续轮断言原样 */
    await sqlProvider(m).provideCompletionItems(fakeModel(sel, sel.length), { lineNumber: 1 });
    await settle();
    const r2 = await sqlProvider(m).provideCompletionItems(fakeModel(sel, sel.length), { lineNumber: 1 });
    expect(labelsOf(r2), 'SELECT 位零倾向').toEqual(['amount', 'created', 'name', 'title']);
    const gb = 'SELECT * FROM orders GROUP BY o.';
    const r3 = await sqlProvider(m).provideCompletionItems(fakeModel(gb, gb.length), { lineNumber: 1 });
    expect(labelsOf(r3), 'GROUP BY 位 keyword 置前').toEqual(['name', 'amount', 'created', 'title']);
    h.dispose();
  });

  it('colM 第二捕获组：1207 起是**活捕获**（承载点后前缀），必须消费且进排序', () => {
    const src = readFileSync(join(SRC, 'utils/sqlCompletion.ts'), 'utf-8');
    /* 546 把它判为死捕获并退役——前提是"从未消费"。1207 让点后已敲前缀参与字段排序
       （否则 `t.pub` 的候选只按字母序，`publish_time` 淹在中间），这个捕获组因此变成活代码。
       锁改成**双向**：正则必须带第二组，且该组必须真的被传给 searchFields 的 query。 */
    expect(src).toContain('before.match(/(\\w+)\\.(\\w*)$/)');
    const i = src.indexOf('before.match(/(\\w+)\\.(\\w*)$/)');
    const seg = src.slice(i, i + 900);
    expect(seg, '第二组必须被取出').toMatch(/colM\[2\]/);
    expect(seg, '必须参与 searchFields 排序').toMatch(/query:\s*colPrefix/);
  });
});

/* ═══ B：LuceneInput field 段 term 亲和 + wildcard/date_nanos 值位档 ═══ */

const LUCENE_MAPPING = { raw: { properties: {
  xword: { type: 'keyword' },
  xdate: { type: 'date' },
  xtext: { type: 'text' },
  wfield: { type: 'wildcard' },
  nfield: { type: 'date_nanos' },
} } };

const apps: ReturnType<typeof createApp>[] = [];

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
const items = () => Array.from(document.body.querySelectorAll<HTMLElement>('.li-item'));
const itemTexts = () => Array.from(document.body.querySelectorAll('.li-item .li-name')).map(el => el.textContent);
const inp = (host: ParentNode) => host.querySelector<HTMLInputElement>('.li-inp')!;
async function type(host: ParentNode, v: string) {
  const el = inp(host);
  el.value = v; /* happy-dom：程序赋值后 selectionStart 自动置尾 */
  el.dispatchEvent(new Event('input'));
  await settle();
}

describe('B LuceneInput typePriority 亲和 + wildcard/date_nanos 值位档', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    __clearFieldCache();
    __clearSuggestCache();
    mappingDetailFn.mockReset().mockResolvedValue(LUCENE_MAPPING);
    searchRawFn.mockReset().mockResolvedValue({ aggregations: { suggest: { buckets: [] } } });
  });
  afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

  it('field 段（裸词=term 语义）：keyword 置前（typePriorityForOp(\'term\') 同表）', async () => {
    const { host } = await mountInput();
    await type(host, 'x');
    expect(itemTexts(), 'keyword 亲和置前，其余殿后字母序').toEqual(['xword', 'xdate', 'xtext']);
  });

  it('值位 wildcard 档：候选 pref* 通配形态（544 姊妹表 keyword/wildcard→pref* 同形）', async () => {
    const { host } = await mountInput();
    await type(host, 'wfield:pre');
    expect(itemTexts()).toEqual(['pref*']);
  });

  it('值位 date_nanos 档：≡date 族，复用 DATE_HINTS 同款内容', async () => {
    const { host } = await mountInput();
    await type(host, 'nfield:now');
    expect(itemTexts()).toEqual(['now-1h/h', 'now-1d/d']);
  });

  it('源锚：WILDCARD_HINTS 表 + wildcard/date_nanos 分档行 + field 段 typePriority 传参在場', () => {
    expect(li).toContain("const WILDCARD_HINTS = ['pref*'];");
    expect(li).toContain("if (t === 'wildcard') return WILDCARD_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);");
    expect(li).toContain("if (t === 'date_nanos') return DATE_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);");
    expect(li).toContain("typePriority: typePriorityForOp('term')");
    /* 554 同步更新：queryAstOps 单行导入扩为多导入（KEYWORD_VALUE_TYPES/NUMERIC_VALUE_TYPES
       族表单源同批接入）——typePriorityForOp 自 queryAstOps 导入的锚意同步更新保形 */
    expect(li).toContain("import { typePriorityForOp, KEYWORD_VALUE_TYPES, NUMERIC_VALUE_TYPES } from '../utils/queryAstOps';");
  });

  it('既有五档字面行不回退（luceneValTiers538 源锚锁同步更新自证：BOOL/IP 逐字不动，只新增分支）', () => {
    expect(li).toContain("const BOOL_HINTS = ['true', 'false'];");
    /* 551 同步更新：ip 档补 CIDR 形态档（sqlCompletion D1 姊妹面同批对齐）——点分示例逐字不动 */
    expect(li).toContain("const IP_HINTS = ['192.168.0.1', '192.168.0.0/24'];");
    /* 554 同步更新：keyword 本名判定收口 AGG_KEYWORD_TYPES 族表（KEYWORD_VALUE_TYPES 去
       wildcard，constant_keyword 同走 terms-agg）——原 keyword 档行为为族表真子集，不回退 */
    expect(li).toContain("if (AGG_KEYWORD_TYPES.includes(t)) return suggestions.value.filter(v => !p || v.toLowerCase().startsWith(p)).map(withSegs);");
    expect(li).toContain("if (t === 'date') return DATE_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);");
    expect(li).toContain('if (NUMERIC_TYPES.includes(t)) return NUM_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);');
    expect(li).toContain("if (t === 'boolean') return BOOL_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);");
    expect(li).toContain("if (t === 'ip') return IP_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);");
    /* 548 锁同步更新：known 行扩 wildcard/date_nanos 两档（548 D1 约定，滤空提示随档同权）；
       原契约意图保持——keyword/date/boolean/ip/numeric 五档逐字不动。
       550 同步更新：known 行再补 t === 'text' 档（值位 .keyword 子字段建议 550 约定，
       滤空提示随档同权并附「.keyword 子字段」文案），五档既有内容仍逐字不动。
       552 同步更新：known 行补 t === 'constant_keyword' 档（keyword 族值语义，
       sqlCompletion.KEYWORD_VALUE_TYPES 同族，滤空提示随档同权），既有各档仍逐字不动。
       554 同步更新：known 行收口 KEYWORD_VALUE_TYPES 族表（keyword/wildcard/constant_keyword
       三档经族表在册），geo_point 新档随权（'纬度,经度' 静态档 554 约定）——逐档语义等值扩张。
       560 同步更新：known 行头部补 `s.field === '_exists_'`（值位候选改出字段清单 560 约定，
       滤空提示随权）、尾部补 t === 'version'（静态档 560 约定）——既有各档语义仍不变 */
    expect(li).toContain("const known = s.field === '_exists_' || KEYWORD_VALUE_TYPES.includes(t) || t === 'date' || t === 'boolean' || t === 'ip' || t === 'date_nanos' || t === 'text' || t === 'geo_point' || t === 'version' || RANGE_FLAT_TYPES.includes(t) || NUMERIC_TYPES.includes(t);");
  });

  it('548 扩档行为面：wildcard/date_nanos 值位滤空出「无候选值」提示（与既有档同权）', async () => {
    const { host } = await mountInput();
    await type(host, 'wfield:zzz');
    expect(document.body.querySelector('.li-hint')?.textContent, 'wildcard 滤空出提示').toContain('暂无匹配');
    await type(host, 'nfield:zzz');
    expect(document.body.querySelector('.li-hint')?.textContent, 'date_nanos 滤空出提示').toContain('暂无匹配');
  });
});

/* ═══ C：ColPicker types 徽标（colPicker.spec 挂载范式） ═══ */

const pickerApps: ReturnType<typeof createApp>[] = [];
const cpHost = document.createElement('div');
document.body.appendChild(cpHost);

/** 挂 ColPicker 并打开 popover（照 colPicker.spec：n-popover 内容 teleport 到 body，断言查 document）。 */
async function mountPicker(props: { cols: string[]; selected: string[]; types?: Record<string, string> }) {
  pickerApps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  pickerApps.length = 0;
  document.body.innerHTML = '';
  document.body.appendChild(cpHost);
  const sel = ref(props.selected);
  const app = createApp({
    setup() {
      return () => h(ColPicker as any, {
        cols: props.cols,
        selected: sel.value,
        ...(props.types !== undefined ? { types: props.types } : {}),
        'onUpdate:selected': (v: string[]) => { sel.value = v; },
      });
    },
  });
  app.mount(cpHost);
  pickerApps.push(app);
  await nextTick();
  (cpHost.querySelector('button') as HTMLButtonElement).click();
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
}

describe('C ColPicker types 徽标', () => {
  beforeEach(() => {
    localStorage.clear();
    pickerApps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    pickerApps.length = 0;
    document.body.innerHTML = '';
    document.body.appendChild(cpHost);
  });
  afterEach(() => { pickerApps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } }); pickerApps.length = 0; });

  it('传 types：清单行字段名旁出类型徽标（.mft-type 色卡类 + data-t=类型，FieldPicker 同语言）', async () => {
    await mountPicker({ cols: ['name', 'created', 'flag'], selected: [], types: { name: 'keyword', created: 'date' } });
    const badges = Array.from(document.body.querySelectorAll<HTMLElement>('.col-pick-item .cp-type'));
    expect(badges.length, 'types 有键的行出徽标（flag 无键不出）').toBe(2);
    expect(badges.map(b => b.getAttribute('data-t'))).toEqual(['keyword', 'date']);
    expect(badges.map(b => b.textContent)).toEqual(['keyword', 'date']);
    expect(badges.every(b => b.classList.contains('mft-type')), '全站色卡类在場').toBe(true);
    /* 徽标与字段名同行且 textContent 仍含字段名（布局零改动自证） */
    const row = document.body.querySelector('.col-pick-item') as HTMLElement;
    expect(row.textContent).toContain('name');
  });

  it('不传 types：零徽标零增量（向后兼容）', async () => {
    await mountPicker({ cols: ['name', 'created'], selected: [] });
    expect(document.body.querySelectorAll('.col-pick-item .cp-type').length).toBe(0);
  });

  it('types 缺省键的行不出徽标；源锚：prop 可选声明 + v-if 守卫在場', async () => {
    await mountPicker({ cols: ['a', 'b'], selected: [], types: {} });
    expect(document.body.querySelectorAll('.col-pick-item .cp-type').length).toBe(0);
    expect(cp).toContain('types?: Record<string, string>');
    expect(cp).toContain('v-if="types?.[c]"');
  });
});
