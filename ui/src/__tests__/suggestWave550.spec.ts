/**
 * 550 批轨1：智能提示四件（TDD 先行，实现前全红）——
 *  A JsonTree 外部高亮通道：highlightKw prop（tools 私有 kw 空时回落，缺省 undefined 零变化，
 *    对齐 maxChildren 惯例）+ LuceneQueryView JSON 视图 _source 接线
 *    （回收 548 E2 备案：共享件通道已开，_source 侧高亮补齐）；
 *  B boost ^ 三层识别（真 bug 修复）：`status^2:ok` 此前误报「未知字段「2」」、
 *    `status:ok^2` 值位补全滤空——luceneContext 判段前剥尾部 ^2/^2.5（field 段前缀 /
 *    value 段字段名与值前缀），LuceneInput 语法检查⑥正则放宽；
 *  C fuzzy「近似」徽标：548 C 产出的 FieldHit.fuzzy 三个消费方透传渲染
 *    （LuceneInput / FieldSelect / FieldPicker，徽标文案统一「近似」）；
 *  D text 值段子字段推荐：text 字段值位出「{field}.keyword」建议项（fields 清单确有
 *    子字段时，形态对齐既有静态档），hint known 表补 text 档 +「.keyword 子字段」文案
 *    （luceneValTiers538 / sqlLuceneTiers546 双字面锁同步更新在原文件，注明「550 同步更新」）。
 *
 * mount 范式：JsonTree 直挂（jsonTreeCap 同款）；LuceneInput 走 luceneInput.spec 范式
 * （createApp+h+pinia+router，只 mock ../api 出口）；源码锁参照 dqHeightUnify549 风格。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
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

import JsonTree from '../components/JsonTree.vue';
import LuceneInput from '../components/LuceneInput.vue';
import { luceneSegment } from '../utils/luceneContext';
import { __clearFieldCache } from '../composables/useIndexFields';
import { __clearSuggestCache } from '../composables/useTermsSuggest';

const SRC = join(__dirname, '..');
const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/* ═══ JsonTree 直挂（jsonTreeCap 同款：每例独立 host，afterEach 统一卸载） ═══ */
async function mountTree(props: Record<string, any>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ setup: () => () => h(JsonTree as any, props) });
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
  return host;
}

/* ═══ LuceneInput 挂载（luceneInput.spec 同款范式） ═══ */
const MAPPING = { raw: { properties: {
  status: { type: 'keyword' },
  message: { type: 'text', fields: { keyword: { type: 'keyword' } } },
  user: { properties: { name: { type: 'text' }, age: { type: 'integer' } } },
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
});

/* ═══ A：JsonTree highlightKw 外部高亮通道 ═══ */

describe('A JsonTree highlightKw 外部高亮通道', () => {
  it('highlightKw 生效：命中 mark（renderHl）+ 强制展开深层（isCollapsed）+ 命中编号（hitIdxOf）', async () => {
    /* d 在 depth>=2 的 object 下：缺省折叠看不见，外部关键字生效必须强制展开 */
    const host = await mountTree({ data: { a: { b: { c: { d: 'needle' } } } }, highlightKw: 'needle' });
    const mark = host.querySelector('mark.jt-mark');
    expect(mark, '外部关键字必须高亮（含强制展开深层后才可见）').toBeTruthy();
    expect(mark!.textContent).toBe('needle');
    expect(host.querySelector('[data-hit-idx]'), '命中编号离线表必须走 effKw').toBeTruthy();
  });

  it('缺省 undefined 零变化：无 prop 无 mark 无编号（深层照旧折叠，对齐 maxChildren 惯例）', async () => {
    const host = await mountTree({ data: { a: { b: { c: { d: 'needle' } } } } });
    expect(host.querySelector('mark.jt-mark')).toBeNull();
    expect(host.querySelector('[data-hit-idx]')).toBeNull();
    expect(host.textContent, 'depth>=2 缺省折叠，needle 不渲染').not.toContain('needle');
  });

  it('effKw 回落链：tools 私有 kw 非空优先，清空回落外部 highlightKw', async () => {
    const host = await mountTree({ data: { msg: 'error' }, tools: true, highlightKw: 'err' });
    expect(host.querySelectorAll('mark.jt-mark').length, 'tools kw 空 → 回落外部词高亮').toBeGreaterThan(0);
    const kw = host.querySelector<HTMLInputElement>('.jt-kw')!;
    kw.value = 'zzz';
    kw.dispatchEvent(new Event('input'));
    await settle();
    expect(host.querySelectorAll('mark.jt-mark').length, 'tools kw 非空优先（zzz 无命中 → 高亮消失）').toBe(0);
    kw.value = '';
    kw.dispatchEvent(new Event('input'));
    await settle();
    expect(host.querySelectorAll('mark.jt-mark').length, 'tools kw 清空 → 回落外部词高亮恢复').toBeGreaterThan(0);
  });

  it('源锚：prop/effKw 定义 + 三处消费 + LuceneQueryView _source 接线（548 E2 备案回收）', () => {
    const jt = readFileSync(join(SRC, 'components/JsonTree.vue'), 'utf-8');
    const lqv = readFileSync(join(SRC, 'views/LuceneQueryView.vue'), 'utf-8');
    expect(jt).toContain('highlightKw?: string;');
    expect(jt).toContain("const effKw = computed(() => kw.value.trim() || (props.highlightKw || '').trim());");
    expect(jt).toContain('const k = effKw.value;');
    expect(jt).toContain('const k = effKw.value.toLowerCase();');
    expect(jt).toContain('const isCollapsed = effKw.value ? false :');
    expect(lqv).toContain('<JsonTree :data="h._source" :highlight-kw="jsonMarkKw" />');
  });
});

/* ═══ B：boost ^ 三层识别（真 bug 修复） ═══ */

describe('B boost ^ 三层识别', () => {
  it('luceneContext 判段剥离：field 前缀/value 字段名/值前缀三处剥净', () => {
    expect(luceneSegment('status^2:ok', 11)).toMatchObject({ kind: 'value', field: 'status', prefix: 'ok' });
    expect(luceneSegment('status^2:ok', 9), 'boost 后冒号：field=status 值前缀空').toMatchObject({ kind: 'value', field: 'status', prefix: '' });
    expect(luceneSegment('status^2', 8), '裸词带 boost：field 段前缀剥净').toMatchObject({ kind: 'field', prefix: 'status' });
    expect(luceneSegment('status:ok^2', 11), '值尾 boost：值前缀剥净').toMatchObject({ kind: 'value', field: 'status', prefix: 'ok' });
    expect(luceneSegment('status:ok^2.5', 13), '小数 boost 同剥').toMatchObject({ kind: 'value', field: 'status', prefix: 'ok' });
    expect(luceneSegment('status^2: ok', 12), 'boost 后空格再值（step5 路径）：字段名剥净').toMatchObject({ kind: 'value', field: 'status', prefix: 'ok' });
  });

  it('luceneContext 无回归：无 boost 输入判定零变化（既有判定表锚点抽查）', () => {
    expect(luceneSegment('status:ac', 9)).toMatchObject({ kind: 'value', field: 'status', prefix: 'ac' });
    expect(luceneSegment('sta', 3)).toMatchObject({ kind: 'field', prefix: 'sta' });
    expect(luceneSegment('status:ok AND mes', 17)).toMatchObject({ kind: 'field', prefix: 'mes' });
  });

  it('行为：值前缀带 boost → 剥离后 terms 命中（include/本地滤都吃剥净前缀，原「滤空」bug 根治）', async () => {
    const { host } = await mountInput();
    vi.useFakeTimers();
    await type(host, 'status:ac^2');
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    const body = JSON.parse(searchRawFn.mock.calls[0][1]);
    expect(body.aggs.suggest.terms.field).toBe('status');
    expect(body.aggs.suggest.terms.include, 'terms include 吃剥净前缀（原 ^2 滤空）').toBe('ac.*');
    expect(itemTexts(), '本地 startsWith 同吃剥净前缀').toEqual(['active']);
    vi.useRealTimers();
  });

  it('行为：语法检查⑥不再误报「未知字段「2」」，boost 字段名仍点名真字段', async () => {
    const { host } = await mountInput();
    await type(host, 'status^2:ok');
    expect(host.querySelector('.li-syntax'), '已知字段带 boost 不许误报').toBeNull();
    await type(host, 'ghost^2:x');
    const bar = host.querySelector('.li-syntax');
    expect(bar, '未知字段仍要点名（剥 boost 后的真名）').toBeTruthy();
    expect(bar!.textContent).toContain('未知字段「ghost」');
    expect(bar!.textContent).not.toContain('未知字段「2」');
  });

  it('源锚：deboost 剥离 + 头注释更新（不再宣称 boost^ 一律兜底）+ 语法检查⑥正则放宽', () => {
    const lc = readFileSync(join(SRC, 'utils/luceneContext.ts'), 'utf-8');
    const li = readFileSync(join(SRC, 'components/LuceneInput.vue'), 'utf-8');
    expect(lc).toContain("const deboost = (s: string) => s.replace(/\\^\\d+(?:\\.\\d+)?$/, '');");
    expect(lc).toContain('deboost(token.slice(0, colon))');
    expect(lc).toContain('prefix: deboost(sp >= 0 ? raw.slice(sp + 1) : raw)');
    expect(lc).toContain('field: fm[1], prefix: deboost(token)');
    expect(lc).toContain("return { kind: 'field', prefix: deboost(token) };");
    expect(lc, '头注释不再宣称 boost^ 一律兜底').not.toContain('正则/boost^');
    expect(li).toContain('for (const m of bare.matchAll(/([\\w.\\-]+)(\\^\\d+(?:\\.\\d+)?)?:/g)) {');
  });
});

/* ═══ C：fuzzy「近似」徽标（548 C 产出的三消费方渲染） ═══ */

describe('C fuzzy「近似」徽标', () => {
  it('行为：field 段零命中纠错候选带「近似」徽标；三档命中不出徽标', async () => {
    const { host } = await mountInput();
    await type(host, 'statuz');
    expect(itemTexts(), '548 C 近似候选出层').toEqual(['status']);
    const badge = document.body.querySelector('.li-item .li-fuzzy');
    expect(badge, '近似徽标必须渲染').toBeTruthy();
    expect(badge!.textContent).toBe('近似');
    await type(host, 'stat');
    expect(itemTexts()).toEqual(['status']);
    expect(document.body.querySelector('.li-item .li-fuzzy'), '三档命中不出徽标').toBeNull();
  });

  it('源锚：三消费方徽标行 + 统一「近似」文案 + 同款样式', () => {
    const li = readFileSync(join(SRC, 'components/LuceneInput.vue'), 'utf-8');
    const fs = readFileSync(join(SRC, 'components/builder/FieldSelect.vue'), 'utf-8');
    const fp = readFileSync(join(SRC, 'components/FieldPicker.vue'), 'utf-8');
    expect(li).toContain('<i v-if="it.fuzzy" class="li-fuzzy">近似</i>');
    expect(li).toContain('fuzzy: h.fuzzy');
    expect(fs).toContain('<i v-if="r.hit!.fuzzy" class="fs-fuzzy">近似</i>');
    expect(fp).toContain('<i v-if="r.f!.fuzzy" class="fxp-fuzzy">近似</i>');
    expect(fp).toContain('type: h.type, fuzzy: h.fuzzy');
    /* 550 收口同步更新：margin-left 4px→var(--sp-1)（spSweep538 components 档位纪律），视觉零变 */
    const style = 'font-size: var(--fs-2xs); color: var(--warn); font-style: normal; margin-left: var(--sp-1);';
    expect(li).toContain(`.li-fuzzy { ${style} }`);
    expect(fs).toContain(`.fs-fuzzy { ${style} }`);
    expect(fp).toContain(`.fxp-fuzzy { ${style} }`);
  });
});

/* ═══ D：text 值段子字段推荐 ═══ */

describe('D text 值段子字段推荐', () => {
  it('行为：text 字段值位出「{field}.keyword」建议项（清单确有子字段；不发 terms）', async () => {
    const { host } = await mountInput();
    await type(host, 'message:');
    expect(itemTexts()).toEqual(['message.keyword']);
    expect(searchRawFn, 'text 段不发 terms').not.toHaveBeenCalled();
  });

  it('行为：前缀滤空 → 「无候选值」提示带「.keyword 子字段」文案（known 补 text 档）', async () => {
    const { host } = await mountInput();
    await type(host, 'message:zzz');
    const hintEl = pop()!.querySelector('.li-hint');
    expect(hintEl, 'text 档滤空出提示').toBeTruthy();
    expect(hintEl!.textContent).toContain('暂无匹配');
    expect(hintEl!.textContent).toContain('text → 建议用 .keyword 子字段精确匹配');
  });

  it('行为：text 无 .keyword 子字段 → 仍出提示文案（零候选可解释，不静默）', async () => {
    const { host } = await mountInput();
    await type(host, 'user.name:');
    expect(itemTexts()).toEqual([]);
    expect(pop()!.querySelector('.li-hint')!.textContent).toContain('.keyword 子字段');
  });

  it('源锚：text 分支行 + known 行补 text + 提示文案（双字面锁同步更新：luceneValTiers538 / sqlLuceneTiers546）', () => {
    const li = readFileSync(join(SRC, 'components/LuceneInput.vue'), 'utf-8');
    expect(li).toContain("if (t === 'text') {");
    expect(li).toContain("const kwPath = s.field + '.keyword';");
    expect(li).toContain('fields.value.some(f => f.path === kwPath)');
    /* 552 同步更新：known 行补 t === 'constant_keyword' 档（keyword 族值语义，
       sqlCompletion.KEYWORD_VALUE_TYPES 同族，滤空提示随档同权），既有各档仍逐字不动。
       554 同步更新：known 行收口 KEYWORD_VALUE_TYPES 族表（keyword/wildcard/constant_keyword
       三档经族表在册）+ geo_point 新档随权——text 档与 .keyword 提示文案锚原样不动。
       560 同步更新：known 行头部补 `s.field === '_exists_'`、尾部补 t === 'version'
       （两档 560 约定，滤空提示随权）——text 档既有语义零回退 */
    expect(li).toContain("const known = s.field === '_exists_' || KEYWORD_VALUE_TYPES.includes(t) || t === 'date' || t === 'boolean' || t === 'ip' || t === 'date_nanos' || t === 'text' || t === 'geo_point' || t === 'version' || RANGE_FLAT_TYPES.includes(t) || NUMERIC_TYPES.includes(t);");
    expect(li).toContain('text → 建议用 .keyword 子字段精确匹配');
  });
});
