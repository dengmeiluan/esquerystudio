/**
 * 五百六十批工蚁A（轨1 提示高亮）hintWave560：各件核心断言。
 *  A LuceneInput _exists_ 值位候选（fieldSearch 字段清单、field 段 LiItem 四件套同形态）
 *    + version 档（VERSION_HINTS=['1.0.0']，sqlCompletion VAL_FORMAT_HINTS.version 同款）
 *    + hint known 链同步（_exists_/version 滤空出提示同权）；
 *  B dslCompletionContext 三张内置表（BUILTIN_TOKENIZERS/BUILTIN_CHAR_FILTERS/
 *    BUILTIN_TOKEN_FILTERS，与 BUILTIN_ANALYZERS 同位置同风格）+ ANALYSIS_PARAM_ZH
 *    高频参数中文词表（12~15 个，表外键回落空串）；
 *  C highlightSanitize escapeHtml 三连转义导出单源 + hlSafe 放行段并档 RT 超集
 *    （<em>/<mark> 可带双引号 class；大小写/单引号变体仍 fail-closed）+ DiagView/
 *    IntegrationGuide 本地三连合并源锚；
 *  D indexSettingsCatalog：CLUSTER_SETTINGS_CATALOG 补 logger.org.elasticsearch.discovery、
 *    SETTINGS_CATALOG 动态段补 unassigned.node_left.delayed_timeout/max_refresh_listeners、
 *    静态段补 sort.field/sort.order（目录键去 index. 前缀口径，normKey 消费零视图改动）；
 *  E AnalysisSettingsView 参数释义消费 + 两处裸 err 并轨 friendlyEsError 源锚；
 *  F DiagView escapeHtml 合并 + allocation-explain/hot-threads 两处裸 err 并轨 +
 *    .dg-stuck 死样式退役源锚；
 *  G QueryXrayView runTv catch 补 tvErr 内联 + 两处 toast friendly 源锚；
 *  H ScoreExplainView/SearchSandboxView toast friendly 源锚；
 *  I LuceneQueryView sort label 中文释义 title 源锚；
 *  J sqlCompletion 主值位正则拆双形态：引号形态收任意非引号字符（vPrefix=m1??m2）、
 *    裸词行为零漂移、未知列/text 零候选不被引号形态绕开；
 *  K AnalyzerLabView 自定义组合三 input 各指新 datalist（tokenizer/char_filter/filter
 *    分表候选，analyzer 档原名原内容不动）源锚。
 *
 * stub 范式：A 段挂载照 sqlLuceneTiers546（vi.mock ../api + pinia + router）；
 * J 段照 sqlValPos535（monaco 最小 fake + pinia + api spy）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* ═══ api mock（A 段 LuceneInput 挂载用，sqlLuceneTiers546 同范式） ═══ */
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
import { __clearFieldCache } from '../composables/useIndexFields';
import { __clearSuggestCache } from '../composables/useTermsSuggest';
import {
  BUILTIN_TOKENIZERS, BUILTIN_CHAR_FILTERS, BUILTIN_TOKEN_FILTERS, ANALYSIS_PARAM_ZH,
} from '../utils/dslCompletionContext';
import { escapeHtml, hlSafe } from '../utils/highlightSanitize';
import { CLUSTER_SETTINGS_CATALOG, SETTINGS_CATALOG } from '../utils/indexSettingsCatalog';
import { ensureSqlCompletion, type SqlCompletionCtx } from '../utils/sqlCompletion';
import { api as apiMod } from '../api';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');
const li = read('components/LuceneInput.vue');

/* ═══ A：LuceneInput _exists_ 值位 + version 档 ═══ */

const HINT_MAPPING = { raw: { properties: {
  status: { type: 'keyword' },
  ver: { type: 'version' },
  created: { type: 'date' },
} } };

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountInput(init: { index?: string } = {}) {
  const state = { modelValue: '', index: init.index ?? 'logs-2026.08' } as { modelValue: string; index: string };
  const proxy = new Proxy(state, {
    set(t, k, v) { (t as any)[k] = v; return true; },
  }) as { modelValue: string; index: string };
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({
    render: () => h(LuceneInput, {
      modelValue: proxy.modelValue,
      index: proxy.index,
      'onUpdate:modelValue': (v: string) => { proxy.modelValue = v; },
    }),
  });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

const itemTexts = () => Array.from(document.body.querySelectorAll('.li-item .li-name')).map(el => el.textContent);
async function type(host: ParentNode, v: string) {
  const el = host.querySelector<HTMLInputElement>('.li-inp')!;
  el.value = v; /* happy-dom：程序赋值后 selectionStart 自动置尾 */
  el.dispatchEvent(new Event('input'));
  await settle();
}

describe('A LuceneInput _exists_ 值位候选 + version 档（560）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    __clearFieldCache();
    __clearSuggestCache();
    mappingDetailFn.mockReset().mockResolvedValue(HINT_MAPPING);
    searchRawFn.mockReset().mockResolvedValue({ aggregations: { suggest: { buckets: [] } } });
  });
  afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

  it('挂载行为：_exists_:sta 值位出字段候选（field 段同款清单，非零候选压制）', async () => {
    const { host } = await mountInput();
    await type(host, '_exists_:sta');
    expect(itemTexts(), '_exists_ 值位按前缀出字段候选').toContain('status');
  });

  it('挂载行为：_exists_ 值位滤空出「无候选值」提示（known 链同步同权）', async () => {
    const { host } = await mountInput();
    await type(host, '_exists_:zzzz');
    expect(document.body.querySelector('.li-hint')?.textContent, '_exists_ 滤空出提示').toContain('暂无匹配');
  });

  it('挂载行为：version 字段值位出 1.0.0 静态档（sqlCompletion version 同款对齐）', async () => {
    const { host } = await mountInput();
    await type(host, 'ver:1');
    expect(itemTexts(), 'version 档静态候选').toEqual(['1.0.0']);
  });

  it('源锚：_exists_ 分支走 fieldSearch 四件套 LiItem 形态；VERSION_HINTS 表 + version 分支行', () => {
    expect(li).toMatch(/if \(s\.field === '_exists_'\) \{\s*\n\s*return searchFields\(/);
    expect(li).toContain("text: h.path, type: h.type, segs: h.segs, fuzzy: h.fuzzy");
    expect(li).toContain("const VERSION_HINTS = ['1.0.0'];");
    expect(li).toContain("if (t === 'version') return VERSION_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);");
  });

  it('源锚：hint known 链同步 _exists_ 与 version 两档', () => {
    expect(li).toContain("const known = s.field === '_exists_' || KEYWORD_VALUE_TYPES.includes(t)");
    expect(li).toContain("t === 'version' || RANGE_FLAT_TYPES.includes(t) || NUMERIC_TYPES.includes(t);");
  });
});

/* ═══ B：dslCompletionContext 三张内置表 + ANALYSIS_PARAM_ZH ═══ */
describe('B dslCompletionContext 内置组件三表 + 参数中文词表（560）', () => {
  it('BUILTIN_TOKENIZERS：九内置 + ik 族', () => {
    for (const t of ['standard', 'keyword', 'whitespace', 'letter', 'lowercase', 'ngram', 'edge_ngram', 'path_hierarchy', 'pattern', 'ik_max_word', 'ik_smart']) {
      expect(BUILTIN_TOKENIZERS, t).toContain(t);
    }
  });
  it('BUILTIN_CHAR_FILTERS：html_strip/mapping/pattern_replace 三内置', () => {
    expect(BUILTIN_CHAR_FILTERS).toEqual(['html_strip', 'mapping', 'pattern_replace']);
  });
  it('BUILTIN_TOKEN_FILTERS：十二内置 + ik 族', () => {
    for (const f of ['lowercase', 'stop', 'asciifolding', 'stemmer', 'synonym', 'synonym_graph', 'trim', 'unique', 'truncate', 'word_delimiter', 'shingle', 'snowball', 'ik_max_word', 'ik_smart']) {
      expect(BUILTIN_TOKEN_FILTERS, f).toContain(f);
    }
  });
  it('ANALYSIS_PARAM_ZH：高频参数词表（560 钉 ≥12，561 扩容至 24）且任务点名键全在册；表外键回落空串语义（消费侧 find 兜底）', () => {
    expect(Object.keys(ANALYSIS_PARAM_ZH).length).toBeGreaterThanOrEqual(12);
    /* 561 同步更新（击穿者：561 工蚁2，词表按任务扩容 10 键：ngram/edge_ngram/shingle/
       pattern_replace/stemmer 族参数）——560 批 12~15 规模钉面随任务升级：上限放宽到 25
       （24+1 余量同 560 批风格），560 点名键与中文释义断言零改 */
    expect(Object.keys(ANALYSIS_PARAM_ZH).length).toBeLessThanOrEqual(25);
    for (const k of ['max_token_length', 'synonyms_path', 'stopwords', 'stopwords_path', 'search_analyzer', 'normalizer', 'filter', 'char_filter', 'tokenizer', 'mapping', 'aliases']) {
      expect(ANALYSIS_PARAM_ZH[k], k).toBeTruthy();
      expect(ANALYSIS_PARAM_ZH[k], k + ' 须中文释义').toMatch(/[\u4e00-\u9fff]/);
    }
    expect(ANALYSIS_PARAM_ZH['__no_such_key__']).toBeUndefined();
  });
});

/* ═══ C：highlightSanitize escapeHtml 导出 + hlSafe 并档 RT 超集 ═══ */
describe('C highlightSanitize escapeHtml 单源 + hlSafe em/mark 并档（560）', () => {
  it('escapeHtml 三连转义导出（& < >）', () => {
    expect(escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('hlSafe 并档：<mark>/<em> 可带双引号 class（RT 超集，559 立牌兑现）', () => {
    expect(hlSafe('a<mark>b</mark>c')).toBe('a<mark>b</mark>c');
    expect(hlSafe('a<mark class="hl">b</mark>c')).toBe('a<mark class="hl">b</mark>c');
    expect(hlSafe('<em class="hlt">x</em>')).toBe('<em class="hlt">x</em>');
  });

  it('既有 <em class="hl"> 档零回归；失败闭合不松（大小写/单引号/附加属性仍转义）', () => {
    expect(hlSafe('前<em class="hl">词</em>后')).toBe('前<em class="hl">词</em>后');
    expect(hlSafe('<EM CLASS="hl">x</EM>')).not.toContain('<EM');
    expect(hlSafe("<em class='hl'>y</em>")).not.toContain('<em');
    /* 带附加属性的伪标签不放行：整段保持转义纯文本（fail-closed） */
    const withAttr = hlSafe('<em class="hl" onmouseover="x">y</em>');
    expect(withAttr).not.toMatch(/<em class="hl" onmouseover/);
    expect(withAttr).toContain('&lt;em class="hl" onmouseover');
    expect(hlSafe('<MARK>y</MARK>')).not.toContain('<MARK');
  });

  it('DiagView/IntegrationGuide 本地三连合并（import 单源，本地 function 退役）', () => {
    const dg = read('views/DiagView.vue');
    const ig = read('components/IntegrationGuide.vue');
    expect(dg).toContain("import { escapeHtml } from '../utils/highlightSanitize';");
    expect(dg, '本地定义退役（单源不许双份）').not.toMatch(/function escapeHtml\(/);
    expect(ig).toContain("import { escapeHtml } from '../utils/highlightSanitize';");
    expect(ig).not.toMatch(/function escapeHtml\(/);
    expect(ig).toContain('escapeHtml(src)');
  });

  it('DiagView hotThreads 私造 span 分档保留（只换转义源）', () => {
    const dg = read('views/DiagView.vue');
    expect(dg).toContain('escapeHtml(hotThreads.value)');
    expect(dg).toContain('dv-cyan');
  });
});

/* ═══ D：indexSettingsCatalog 补目录 ═══ */
describe('D indexSettingsCatalog 补目录（560）', () => {
  it('CLUSTER_SETTINGS_CATALOG 补 logger.org.elasticsearch.discovery（日志族四字段齐）', () => {
    const e = CLUSTER_SETTINGS_CATALOG.find(x => x.key === 'logger.org.elasticsearch.discovery');
    expect(e, 'discovery 子日志键在册').toBeTruthy();
    expect(e!.desc).toContain('discovery');
    expect(e!.example).toContain('DEBUG');
    expect(e!.dynamic).toBe(true);
  });

  it('SETTINGS_CATALOG 动态段补 delayed_timeout / max_refresh_listeners', () => {
    const dt = SETTINGS_CATALOG.find(x => x.key === 'unassigned.node_left.delayed_timeout');
    expect(dt, '延迟恢复键在册').toBeTruthy();
    expect(dt!.desc).toContain('延迟恢复');
    expect(dt!.example).toBe('1d / 5d');
    expect(dt!.dynamic).toBe(true);
    expect(SETTINGS_CATALOG.find(x => x.key === 'max_refresh_listeners')?.dynamic).toBe(true);
  });

  it('静态段补 sort.field/sort.order（目录键去 index. 前缀口径，normKey 消费零视图改动）', () => {
    const f = SETTINGS_CATALOG.find(x => x.key === 'sort.field');
    const o = SETTINGS_CATALOG.find(x => x.key === 'sort.order');
    expect(f, 'index.sort.field（去前缀口径）在册').toBeTruthy();
    expect(o, 'index.sort.order（去前缀口径）在册').toBeTruthy();
    expect(f!.dynamic).toBe(false);
    expect(o!.dynamic).toBe(false);
    /* 消费口径自证：IndexSettingsView normKey 去 index. 前缀后精确查表可命中 */
    const normKey = (k: string) => (k.trim().startsWith('index.') ? k.trim().slice('index.'.length) : k.trim());
    expect(SETTINGS_CATALOG.find(e => e.key === normKey('index.sort.field'))).toBeTruthy();
  });
});

/* ═══ E/F/G/H/I：视图源锚 ═══ */
describe('E AnalysisSettingsView 参数释义 + 两处 friendly（560）', () => {
  const asv = read('views/AnalysisSettingsView.vue');
  it('ANALYSIS_PARAM_ZH 消费接线（展开态参数释义串 + 表外键零扰动）', () => {
    expect(asv).toContain("import { ANALYSIS_PARAM_ZH } from '../utils/dslCompletionContext';");
    expect(asv).toContain('paramHint(cfg)');
  });
  it('两处裸 err 并轨 friendlyEsError（加载/热重载）', () => {
    expect(asv).toContain("store.notify('error', '加载失败：' + friendlyEsError(String(e?.message ?? e)));");
    expect(asv).toContain("store.notify('error', '热重载失败：' + friendlyEsError(String(e?.message ?? e)));");
    expect(asv, '裸 (e?.message || e) 拼接不许残留').not.toMatch(/\+\s*\(e\?\.message \|\| e\)/);
  });
});

describe('F DiagView 两处 friendly + .dg-stuck 退役（560）', () => {
  const dg = read('views/DiagView.vue');
  it('allocation-explain / hot-threads 裸 err 并轨 friendlyEsError', () => {
    expect(dg).toContain("'allocation-explain: ' + friendlyEsError(String(e?.message ?? e))");
    expect(dg).toContain("'hot-threads: ' + friendlyEsError(String(e?.message ?? e))");
    expect(dg, '裸 (e?.message || e) 拼接不许残留').not.toMatch(/\+\s*\(e\?\.message \|\| e\)/);
  });
  it('.dg-stuck 死样式退役（全文件零引用）', () => {
    expect(dg).not.toContain('dg-stuck');
  });
});

describe('G QueryXrayView tvErr 内联 + 两处 toast friendly（560）', () => {
  const qx = read('views/QueryXrayView.vue');
  it('runTv catch 补 tvErr（内联错误条 :96 现成）+ 既有 found===false/空词向量分支零动', () => {
    expect(qx).toContain('tvErr.value = friendlyEsError(String(e?.message ?? e));');
    expect(qx).toContain(`if (r?.found === false) { tvErr.value = \`文档 \${tvId.value} 不存在\`; return; }`);
    expect(qx).toContain(`tvErr.value = '无词向量返回：字段可能不是 text 类型，或需要指定 fields';`);
  });
  it('透视失败/取证失败两处 toast friendly', () => {
    expect(qx).toContain("store.notify('error', '透视失败：' + friendlyEsError(String(e?.message ?? e)));");
    expect(qx).toContain("store.notify('error', '取证失败：' + friendlyEsError(String(e?.message ?? e)));");
    expect(qx, '裸 (e?.message || e) 拼接不许残留').not.toMatch(/\+\s*\(e\?\.message \|\| e\)/);
  });
});

describe('H ScoreExplain/SearchSandbox toast friendly（560）', () => {
  it('解剖失败 / 搜索失败 前缀保留 + friendlyEsError 包裹', () => {
    const se = read('views/ScoreExplainView.vue');
    const ss = read('views/SearchSandboxView.vue');
    expect(se).toContain("store.notify('error', '解剖失败：' + friendlyEsError(String(e?.message ?? e)));");
    expect(ss).toContain("store.notify('error', '搜索失败：' + friendlyEsError(String(e?.message ?? e)));");
  });
});

describe('I LuceneQueryView sort label 释义 title（560）', () => {
  it('size/from/order 三件套补齐第四件：sort 裸 label 挂中文释义 title', () => {
    const lc = read('views/LuceneQueryView.vue');
    expect(lc).toContain('<span title="排序字段（可排序类型，_score/_doc 可手输）">sort</span>');
  });
});

describe('K AnalyzerLabView 三 input 分表 datalist（560）', () => {
  const alv = read('views/AnalyzerLabView.vue');
  it('tokenizer/char_filter/filter 各指新 datalist；analyzer 档原名原内容不动', () => {
    expect(alv).toMatch(/<input v-model="l\.tokenizer"[^>]* list="al-tokenizer-opts"/);
    expect(alv).toMatch(/<input v-model="l\.charFilter"[^>]* list="al-charfilter-opts"/);
    expect(alv).toMatch(/<input v-model="l\.filter"[^>]* list="al-tokenfilter-opts"/);
    expect(alv).toMatch(/<input v-model="l\.analyzer"[^>]* list="al-analyzer-opts"/);
    expect((alv.match(/<datalist id="al-tokenizer-opts">/g) || []).length).toBe(1);
    expect((alv.match(/<datalist id="al-charfilter-opts">/g) || []).length).toBe(1);
    expect((alv.match(/<datalist id="al-tokenfilter-opts">/g) || []).length).toBe(1);
    expect(alv).toMatch(/v-for="a in BUILTIN_TOKENIZERS"/);
    expect(alv).toMatch(/v-for="a in BUILTIN_CHAR_FILTERS"/);
    expect(alv).toMatch(/v-for="a in BUILTIN_TOKEN_FILTERS"/);
    expect(alv).toMatch(/BUILTIN_ANALYZERS, BUILTIN_TOKENIZERS, BUILTIN_CHAR_FILTERS, BUILTIN_TOKEN_FILTERS/);
  });
});

/* ═══ J：sqlCompletion 主值位双形态（sqlValPos535 范式） ═══ */
type Provider = { provideCompletionItems: (model: any, position: any, context?: any, token?: any) => any };

function makeMonaco() {
  const providers: Record<string, Provider[]> = {};
  return {
    providers,
    api: {
      languages: {
        registerCompletionItemProvider: (_lang: string, p: Provider) => {
          (providers[_lang] ||= []).push(p);
          return { dispose: () => {} };
        },
        CompletionItemKind: { Field: 'Field', Property: 'Property', Value: 'Value' },
      },
    },
  };
}

const J_FIELDS = [
  { path: 'name', type: 'keyword' },
  { path: 'created', type: 'date' },
  { path: 'title', type: 'text' },
];

function makeCtx(): () => SqlCompletionCtx {
  return () => ({
    indices: () => [{ index: 'orders' }],
    pickedIdx: () => 'orders',
    curFields: () => J_FIELDS,
    ensureCurFields: () => {},
  });
}
function fakeSqlModel(text: string) {
  return {
    getValue: () => text,
    getOffsetAt: () => text.length,
    getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1, word: '' }),
  };
}
function sqlProvider(m: ReturnType<typeof makeMonaco>): Provider {
  const arr = m.providers.sql;
  expect(arr, 'sql 语言 provider 必须已注册').toBeTruthy();
  return arr![arr!.length - 1];
}

describe('J sqlCompletion 主值位引号形态（560）', () => {
  beforeEach(() => { setActivePinia(createPinia()); });
  afterEach(() => { __clearSuggestCache(); vi.restoreAllMocks(); });

  it('引号形态收任意非引号字符：date 列 >= \'2026- 出静态档（旧正则失配零候选根治）', () => {
    const m = makeMonaco();
    const spy = vi.spyOn(apiMod, 'searchRaw');
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      const before = "SELECT * FROM orders WHERE created >= '2026-";
      const r: any = sqlProvider(m).provideCompletionItems(fakeSqlModel(before), { lineNumber: 1 });
      expect((r.suggestions as any[]).map(s => s.label), '连字符引号值位进值位通道').toEqual(['now-1d/d', 'now-1h/h']);
      expect(String(r.suggestions[0].detail)).toContain('date');
      expect(spy, '静态档零请求').not.toHaveBeenCalled();
    } finally { h.dispose(); }
  });

  it('裸词行为零漂移：= a 与 = 空前缀既有形态不变', async () => {
    vi.useFakeTimers();
    const m = makeMonaco();
    const spy = vi.spyOn(apiMod, 'searchRaw').mockResolvedValue({
      aggregations: { suggest: { buckets: [{ key: 'act' }, { key: 'active' }] } },
    });
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      __clearSuggestCache();
      const bare = 'SELECT * FROM orders WHERE name = ac';
      const p = sqlProvider(m).provideCompletionItems(fakeSqlModel(bare), { lineNumber: 1 });
      await vi.advanceTimersByTimeAsync(10);
      const r = await p;
      expect((r.suggestions as any[]).map(s => s.label)).toEqual(['act', 'active']);
      __clearSuggestCache();
      spy.mockClear();
      /* 空前缀（op 后无字符）照旧进值位通道（keyword 走 suggest） */
      const empty = 'SELECT * FROM orders WHERE name = ';
      const p2 = sqlProvider(m).provideCompletionItems(fakeSqlModel(empty), { lineNumber: 1 });
      await vi.advanceTimersByTimeAsync(10);
      const r2 = await p2;
      expect(spy).toHaveBeenCalledTimes(1);
      expect((r2.suggestions as any[]).map(s => s.label)).toEqual(['act', 'active']);
    } finally { h.dispose(); vi.useRealTimers(); }
  });

  it('未知列/text 零候选不被引号形态绕开（宁缺勿错）', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      for (const before of ["SELECT * FROM orders WHERE nope = 'x", "SELECT * FROM orders WHERE title = 'x"]) {
        const r: any = sqlProvider(m).provideCompletionItems(fakeSqlModel(before), { lineNumber: 1 });
        expect(r.suggestions, before).toEqual([]);
      }
    } finally { h.dispose(); }
  });
});
