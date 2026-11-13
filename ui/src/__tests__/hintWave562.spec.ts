/**
 * 五百六十二批（轨1 智能提示与高亮·工蚁1）：hintWave562 —— 红先行锁面。
 *
 *  A RankDebugView：:57/:107 两处 rd-verdict bad 失败面板补 role=alert（读屏可播报；
 *    vrErr/tvErr/al-err 558/561 先例同款）+ .rd-lint 私造三条随 561 lint-bar 单源约定改用
 *    （rd-lint 锚类保留并存，scoped 私造形态退役）。
 *  B QueryXrayView：本页 lint 只有 setMarkers 编辑器划线单通道 → 补行内 lint 兜底条
 *    （error 档 role=alert / warn 档 role=status，theme.css lint-bar 单源勿私造 CSS；
 *    lintDsl 提 computed 全量 findings 出行内条=unplaced 兜底——定位失败进不了 marker
 *    的 finding 仍可见）+ .qx-verdict.bad 改引 err-bar 同源 token 防漂移锁。
 *  C sqlCompletion VAL_FORMAT_HINTS 补 date_range（复用 date 档 date-math values 通道）/
 *    ip_range（复用 ip 档 CIDR values 通道）；LuceneInput 值位分支+known 行补 range 族
 *    （integer/long/float/double_range→数值区间形态、date_range→date-math、ip_range→CIDR）
 *    +flattened（通配形态）。既有字面锁 6 处同步更新（known 行/luceneJsonFind374/379 下界）。
 *  D BoostTunerView kwCandidates 补「已敲前缀恰为候选全文时置顶」精确排序
 *    （sqlCompletion 558 / LuceneInput 561 先例同款一行稳定 sort）。
 *  E LuceneQueryView :237-242 JSON 视图查找手写件改用 SearchFilterBar 统一件
 *    （ss-hits-find 561 先例同款窄栏胶囊；计数/清除入 slot；Esc 清空组件内建承接）。
 *  F SearchSandboxView explain/profile/auto-highlight 三 checkbox 补中文 title 释义。
 *  G dslCompletionContext 新增 ANALYZER_COMPONENT_ZH 组件名中文释义表（esEnumZh 黑名单
 *    勿动，新表放 dslCompletionContext）+ AnalyzerLab 四 datalist option 挂 title。
 *  H monacoJsonQuickFix 补 should-in-filter quickfix 分支（should 同层零宽插
 *    "minimum_should_match": 1，agg-size-default objectInsertBeforeClose 定位件形态平移）。
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setActivePinia, createPinia } from 'pinia';
import { VAL_FORMAT_HINTS, ensureSqlCompletion } from '../utils/sqlCompletion';
import { BUILTIN_ANALYZERS, BUILTIN_TOKENIZERS, BUILTIN_CHAR_FILTERS, BUILTIN_TOKEN_FILTERS, ANALYZER_COMPONENT_ZH } from '../utils/dslCompletionContext';
import { ensureDslLintQuickFixes, recordDslLintMarkers } from '../utils/monacoJsonQuickFix';

const SRC = join(__dirname, '..');
const read = (f: string) => readFileSync(join(SRC, f), 'utf-8');

const rd = read('views/RankDebugView.vue');
const qx = read('views/QueryXrayView.vue');
const bt = read('views/BoostTunerView.vue');
const lc = read('views/LuceneQueryView.vue');
const ss = read('views/SearchSandboxView.vue');
const al = read('views/AnalyzerLabView.vue');
const li = read('components/LuceneInput.vue');

/* ═══ A：RankDebugView role=alert ×2 + .rd-lint 改用 lint-bar 单源 ═══ */
describe('562 A：RankDebugView 两失败面板 role=alert + lint 条单源改用', () => {
  it('whyErr / abErr 两处 rd-verdict bad 面板补 role="alert"', () => {
    expect(rd).toContain('<div v-if="!busy && whyErr" role="alert" class="rd-verdict bad">');
    expect(rd).toContain('<div v-if="!busy && abErr" role="alert" class="rd-verdict bad">');
  });

  it('.rd-lint 私造条改用 theme.css lint-bar 单源（rd-lint 锚类保留并存，双档各自 role）', () => {
    expect(rd).toContain('<div v-if="rdLintErrors.length" role="alert" class="rd-lint lint-bar lint-bar-err">');
    expect(rd).toContain('<div v-else-if="rdLintWarns.length" role="status" class="rd-lint lint-bar lint-bar-warn">');
  });

  it('scoped .rd-lint 三条私造形态退役（display 壳 + warn/err 底色档归 lint-bar 单源）', () => {
    expect(rd, '形态壳与底色档退役（lintBarWave561 四视图同判据）').not.toMatch(/^\.rd-lint/m);
  });
});

/* ═══ B：QueryXrayView 行内 lint 兜底条 + bad 档同源 token 防漂移 ═══ */
describe('562 B：QueryXrayView 行内 lint 兜底条 + qx-verdict.bad 同源 token', () => {
  it('行内 lint 兜底条双档在位：error 档 role=alert / warn 档 role=status，直用 lint-bar 单源类', () => {
    expect(qx).toContain('<div v-if="qxLintErrors.length" role="alert" class="lint-bar lint-bar-err">');
    expect(qx).toContain('<div v-else-if="qxLintWarns.length" role="status" class="lint-bar lint-bar-warn">');
    expect(qx, '行内条渲染全量 findings（unplaced 兜底）').toContain('qxLintErrors.map');
    expect(qx).toContain('qxLintWarns.map');
  });

  it('lintDsl 提 computed 单源：行内条实时面与 setMarkers 防抖面同源（RankDebug rdLint 同范式）', () => {
    expect(qx).toContain('const qxLint = computed(');
    expect(qx).toContain('const qxLintErrors = computed(() => qxLint.value.filter(f => f.severity === \'error\'));');
    expect(qx).toContain('const qxLintWarns = computed(() => qxLint.value.filter(f => f.severity === \'warning\' || f.severity === \'hint\'));');
    expect(qx).toContain('qxJaRef.value?.setMarkers?.(qxLint.value.map');
  });

  it('.qx-verdict.bad 引 err-bar 同源 token（var(--err)/var(--err-soft)/var(--err-line) 三件套防漂移）', () => {
    expect(qx).toContain('.qx-verdict.bad { background: var(--err-soft); color: var(--err); border: 1px solid var(--err-line); }');
  });

  it('本页勿私造 lint 条 CSS（theme.css 单源，scoped 零 .lint-bar 规则）', () => {
    expect(qx).not.toMatch(/^\.lint-bar/m);
  });
});

/* ═══ C：SQL 值位 date_range/ip_range 档 + LuceneInput range 族/flattened ═══ */
describe('562 C：sqlCompletion date_range/ip_range 档 + LuceneInput range 族', () => {
  it('表锁：date_range 复用 date-math values 通道 / ip_range 复用 CIDR values 通道', () => {
    expect(VAL_FORMAT_HINTS.date_range).toEqual({ detail: 'date-math 格式提示 · date_range', values: ['now-1d/d', 'now-1h/h'] });
    expect(VAL_FORMAT_HINTS.ip_range).toEqual({ detail: '字面提示 · ip_range', values: ['192.168.0.1', '192.168.0.0/24'] });
    /* 既有档抽样零漂移（545/551 锚保形） */
    expect(VAL_FORMAT_HINTS.date).toEqual({ detail: 'date-math 格式提示 · date', values: ['now-1d/d', 'now-1h/h'] });
    expect(VAL_FORMAT_HINTS.ip).toEqual({ detail: '字面提示 · ip', values: ['192.168.0.1', '192.168.0.0/24'] });
  });
});

describe('562 C2：date_range/ip_range 字段列值位行为（裸 provider）', () => {
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
  const FIELDS = [
    { path: 'dr', type: 'date_range' },
    { path: 'ipr', type: 'ip_range' },
    { path: 'name', type: 'keyword' },
  ];
  function fakeModel(text: string) {
    return {
      getValue: () => text,
      getOffsetAt: () => text.length,
      getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1, word: '' }),
    };
  }

  beforeEach(() => { setActivePinia(createPinia()); });

  it('date_range 列出 date-math 候选、ip_range 列出 CIDR 候选（detail 带类型名）', async () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, () => ({
      indices: () => [{ index: 'orders' }],
      pickedIdx: () => 'orders',
      curFields: () => FIELDS,
      ensureCurFields: () => {},
    }));
    try {
      const p = m.providers.sql![m.providers.sql!.length - 1];
      const r1 = await p.provideCompletionItems(fakeModel("SELECT * FROM orders WHERE dr >= '"), { lineNumber: 1 });
      expect((r1.suggestions as any[]).map(s => s.label)).toEqual(['now-1d/d', 'now-1h/h']);
      expect(String(r1.suggestions[0].detail)).toContain('date_range');
      const r2 = await p.provideCompletionItems(fakeModel("SELECT * FROM orders WHERE ipr = '"), { lineNumber: 1 });
      expect((r2.suggestions as any[]).map(s => s.label)).toEqual(['192.168.0.1', '192.168.0.0/24']);
      expect(String(r2.suggestions[0].detail)).toContain('ip_range');
    } finally { h.dispose(); }
  });
});

describe('562 C3：LuceneInput 值位分支 + known 行补 range 族/flattened（源锚，luceneValTiers538 同理由）', () => {
  it('RANGE_FLAT_TYPES 族表定形（四数值 range + date_range + ip_range + flattened）', () => {
    expect(li).toContain("const RANGE_FLAT_TYPES = ['integer_range', 'long_range', 'float_range', 'double_range', 'date_range', 'ip_range', 'flattened'];");
  });

  it('值位四分支：数值 range 族→NUM_HINTS、date_range→DATE_HINTS、ip_range→IP_HINTS、flattened→WILDCARD_HINTS', () => {
    expect(li).toContain("if (t === 'integer_range' || t === 'long_range' || t === 'float_range' || t === 'double_range') return NUM_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);");
    expect(li).toContain("if (t === 'date_range') return DATE_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);");
    expect(li).toContain("if (t === 'ip_range') return IP_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);");
    expect(li).toContain("if (t === 'flattened') return WILDCARD_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);");
  });

  it('known 行扩档（滤空出「无候选值」提示随权；既有各档语义不变）', () => {
    expect(li).toContain("const known = s.field === '_exists_' || KEYWORD_VALUE_TYPES.includes(t) || t === 'date' || t === 'boolean' || t === 'ip' || t === 'date_nanos' || t === 'text' || t === 'geo_point' || t === 'version' || RANGE_FLAT_TYPES.includes(t) || NUMERIC_TYPES.includes(t);");
  });
});

/* ═══ D：BoostTunerView kwCandidates 精确前缀置顶 ═══ */
describe('562 D：BoostTunerView kwCandidates 精确前缀置顶', () => {
  it('filter 后接精确置顶稳定排序一行（sqlCompletion 558 / LuceneInput 561 先例同款字面）', () => {
    expect(bt).toContain("return kwSugList.value.filter(v => !p || v.toLowerCase().startsWith(p)).sort((a, b) => Number(b.toLowerCase() === p) - Number(a.toLowerCase() === p));");
  });
});

/* ═══ E：LuceneQueryView JSON 查找改用 SearchFilterBar ═══ */
describe('562 E：LuceneQueryView JSON 视图查找改用 SearchFilterBar', () => {
  it('统一件接线：import + 窄栏胶囊落位类 + placeholder 兼 aria-label（lc-json-find 374 锚容器保留）', () => {
    expect(lc).toContain("import SearchFilterBar from '../components/SearchFilterBar.vue';");
    expect(lc).toContain('<div class="lc-json-find" v-if="hits.length">');
    expect(lc).toContain('<SearchFilterBar v-model="jsonKw" class="lc-json-find-bar" placeholder="在 JSON 视图内查找（_id/字段值）…">');
  });

  it('计数/清除入 slot 胶囊内右翼（374 计数/清除锚语义同步更新）', () => {
    expect(lc).toContain('{{ jsonHits.length }}/{{ hits.length }} 条');
    expect(lc).toContain('<button v-if="jsonKw" class="btn ghost xs" aria-label="清除 JSON 视图查找" @click="jsonKw = \'\'">✕</button>');
  });

  it('Esc 清空由组件内建承接（手写 @keydown.esc 退役，行为等价 filterEscClear379 口径）', () => {
    expect(lc).not.toContain('@keydown.esc.prevent="jsonKw = \'\'"');
  });
});

/* ═══ F：SearchSandboxView 三 checkbox 中文 title ═══ */
describe('562 F：SearchSandboxView 三开关中文释义 title', () => {
  it('explain / profile / auto-highlight 三 checkbox 补 title（纯属性追加）', () => {
    expect(ss).toContain('<label class="ss-chk" title="返回每命中的打分解释（_explanation，响应变大）"><input type="checkbox" v-model="opts.explain" />');
    expect(ss).toContain('<label class="ss-chk" title="返回各分片执行明细（Profile，调优排障用，响应变大）"><input type="checkbox" v-model="opts.profile" />');
    expect(ss).toContain('<label class="ss-chk" title="按查询词自动高亮命中片段"><input type="checkbox" v-model="opts.highlight" />');
  });
});

/* ═══ G：组件名中文释义表 + AnalyzerLab datalist option 挂 title ═══ */
describe('562 G：ANALYZER_COMPONENT_ZH 释义表 + AnalyzerLab 四 datalist option 挂 title', () => {
  it('释义表键覆盖四张 BUILTIN_* 全员且 ≥20 键（行为锁，esEnumZh 黑名单零触）', () => {
    const all = [...BUILTIN_ANALYZERS, ...BUILTIN_TOKENIZERS, ...BUILTIN_CHAR_FILTERS, ...BUILTIN_TOKEN_FILTERS];
    expect(Object.keys(ANALYZER_COMPONENT_ZH).length).toBeGreaterThanOrEqual(20);
    for (const k of all) expect(ANALYZER_COMPONENT_ZH[k], `组件缺中文释义：${k}`).toBeTruthy();
  });

  it('AnalyzerLab 四 datalist option 全部挂 :title（缺席零扰动）', () => {
    for (const list of ['BUILTIN_ANALYZERS', 'BUILTIN_TOKENIZERS', 'BUILTIN_CHAR_FILTERS', 'BUILTIN_TOKEN_FILTERS']) {
      expect(al, list).toContain(`<option v-for="a in ${list}" :key="a" :value="a" :title="ANALYZER_COMPONENT_ZH[a] || ''" />`);
    }
    expect(al).toContain("ANALYZER_COMPONENT_ZH");
  });
});

/* ═══ H：should-in-filter quickfix（monaco stub，quickFixDslLint534 范式） ═══ */
const caps = vi.hoisted(() => ({
  calls: [] as string[],
  providers: [] as any[],
  filter: null as any,
  markers: [] as any[],
}));

vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  languages: {
    registerCodeActionProvider: (_lang: string, p: any) => {
      caps.calls.push(_lang);
      caps.providers.push(p);
      return { dispose() {} };
    },
  },
  editor: {
    getModelMarkers: (filter: any) => { caps.filter = filter; return caps.markers; },
  },
}));

describe('562 H：monacoJsonQuickFix should-in-filter quickfix（agg-size-default 定位件形态平移）', () => {
  const URI_STR = 'inmemory://dsl-lint/562';
  const URI = { toString: () => URI_STR };
  /** 单行文档 fake model（quickFixDslLint534 同款：findMatches 右扫 + 行内容切片 + 全文拼装三件）。 */
  function fakeModel(line: string) {
    return {
      uri: URI,
      getValueInRange: (r: any) => line.slice(r.startColumn - 1, r.endColumn - 1),
      getLineContent: () => line,
      getLineCount: () => 1,
      getLineMaxColumn: () => line.length + 1,
      findMatches: (needle: string, scope: any) => {
        const hits: any[] = [];
        let from = 0;
        for (;;) {
          const at = line.indexOf(needle, from);
          if (at < 0) break;
          hits.push({ range: { startLineNumber: 1, startColumn: at + 1, endLineNumber: 1, endColumn: at + 1 + needle.length } });
          from = at + 1;
        }
        return hits.filter(h => h.range.startColumn >= scope.startColumn);
      },
    };
  }
  const RANGE = { startLineNumber: 1, startColumn: 1, endLineNumber: 5, endColumn: 80 };
  function markerAt(sc: number, ec: number) {
    return {
      owner: 'es-dsl-lint', startLineNumber: 1, startColumn: sc, endLineNumber: 1, endColumn: ec,
      message: '', severity: 4, code: { value: 'es-dsl-lint:should-in-filter' },
    };
  }
  function entry(sc: number, ec: number, message: string) {
    return {
      startLineNumber: 1, startColumn: sc, endLineNumber: 1, endColumn: ec,
      finding: { rule: 'should-in-filter', message, suggestion: 's', anchor: 'should' },
    };
  }
  const dslProvider = () => caps.providers[caps.providers.length - 1];

  beforeAll(() => { ensureDslLintQuickFixes(); });
  beforeEach(() => { caps.markers = []; caps.filter = null; });

  it('filter 语境纯 should → bool 体收尾零宽插 ", \\"minimum_should_match\\": 1"', () => {
    const line = '{"query":{"bool":{"filter":{"bool":{"should":[{"term":{"a":1}}]}}}}}';
    const model = fakeModel(line);
    caps.markers = [markerAt(37, 45)]; /* 覆盖内层 bool 的 "should" 键本体（col37-44，exclusive 尾列 45） */
    recordDslLintMarkers(URI_STR, [entry(37, 45, 'filter 语境 should 不计分，需 minimum_should_match 才生效')]);
    const acts = dslProvider().provideCodeActions(model, RANGE).actions;
    expect(acts.length).toBe(1);
    expect(acts[0].title).toContain('minimum_should_match');
    const te = acts[0].edit.edits[0].textEdit;
    expect(te.text).toBe(', "minimum_should_match": 1');
    expect(te.range).toEqual({ startLineNumber: 1, startColumn: 64, endLineNumber: 1, endColumn: 64 }); /* should 所在 bool 体收尾 } 前 */
  });

  it('应用补丁后 JSON 仍合法且 minimum_should_match 落在 should 同层=1（拼装验证）', () => {
    const line = '{"query":{"bool":{"filter":{"bool":{"should":[{"term":{"a":1}}]}}}}}';
    const model = fakeModel(line);
    caps.markers = [markerAt(37, 45)];
    recordDslLintMarkers(URI_STR, [entry(37, 45, 'filter 语境 should 不计分，需 minimum_should_match 才生效')]);
    const te = dslProvider().provideCodeActions(model, RANGE).actions[0].edit.edits[0].textEdit;
    const applied = line.slice(0, te.range.startColumn - 1) + te.text + line.slice(te.range.endColumn - 1);
    const parsed = JSON.parse(applied);
    expect(parsed.query.bool.filter.bool.minimum_should_match).toBe(1);
  });

  it('marker 非 "should" 本体（534 B 段 {"anchor": {}} 负向形态）零 action（宁缺勿错）', () => {
    const model = fakeModel('{"anchor": {}}');
    caps.markers = [markerAt(2, 10)];
    recordDslLintMarkers(URI_STR, [entry(2, 10, 'filter 语境 should 不计分，需 minimum_should_match 才生效')]);
    expect(dslProvider().provideCodeActions(model, RANGE).actions).toEqual([]);
  });
});
