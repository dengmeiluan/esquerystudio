/**
 * 五百五十七批工蚁1（轨1 智能提示与高亮·修配器族）hintWave557：
 *  A monacoJsonQuickFix root-bare-clause CodeAction（裸子句逐键包 query 外壳，「整 body
 *    重写不可修」旧裁定修订）：正向=两笔编辑（子句键前零宽插 "query": { + 子句值收尾补
 *    }，balancedCloseOf/objectInsertBeforeClose 配平定位）；负向=marker 键不符 /
 *    root 已有 "query" 键（首层键扫）/ 子句值非对象 一律零 action；
 *  B monacoJsonQuickFix 557 两条增量：text-range（range 打 text 字段追加 .keyword，
 *    text-term 同款反向证据闸）+ agg-interval-key（双键互斥分支出删 calendar_interval /
 *    fixed_interval 双 action 二选一；废弃 interval 分支维持零 action 不越界）；
 *  C sqlCompletion IN 列表第 2+ 项值位候选（`, 'xx␣` 主值位正则要求操作符紧邻值失配
 *    根治）：keyword 走 terms suggest、date 走静态档、第 3 项/空前缀同款；LHS 列名左扫
 *    口径不变（未知列零候选）、首项既有通道零扰动；
 *  D splitMark 数值归一联动：字面失配经 normNumStr 归一二次命中产 mark（修「数值归一
 *    命中格内无 mark」）；既有字面行为零漂移 + JsonTree renderHl 手写切分循环退役
 *    （全站第三份切分实现收口 splitMark 单源，jt-mark 类与样式保留，覆盖面只增不减）；
 *  E SynonymsManagerView filterName 裸 input 挂 datalist（源锚：候选=该视图已加载的
 *    同义词 filter id 清单）。
 *
 * stub 范式：A/B 段照 quickFixDslLint534（vi.hoisted caps + editor.api mock + 注册表
 * 直填）；C 段照 sqlValPos535（monaco 最小 fake + pinia + api spy）；D 段挂载照
 * suggestWave554（createApp 直挂 happy-dom）；E 段源锚照 assistLintWave533。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';

/* ═══ monaco stub（quickFixDslLint534 同范式） ═══ */
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

import { ensureDslLintQuickFixes, recordDslLintMarkers } from '../utils/monacoJsonQuickFix';
import { ensureSqlCompletion, type SqlCompletionCtx } from '../utils/sqlCompletion';
import { splitMark } from '../composables/useGridSearch';
import { api } from '../api';
import { __clearSuggestCache } from '../composables/useTermsSuggest';
import JsonTree from '../components/JsonTree.vue';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');

const URI_STR = 'inmemory://hint-557/1';
const URI = { toString: () => URI_STR };

/** 单行文档 fake model（quickFixDslLint534 同款）。 */
function fakeModel(line: string) {
  const colOf = (idx: number) => idx + 1;
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
        hits.push({ range: { startLineNumber: 1, startColumn: colOf(at), endLineNumber: 1, endColumn: colOf(at) + needle.length } });
        from = at + 1;
      }
      return hits.filter(h => h.range.startColumn >= scope.startColumn);
    },
  };
}

/** 多行文档 fake model（root-bare-clause 典型 pretty 排版；modelFullText 逐行拼装口径）。 */
function fakeModelML(lines: string[]) {
  const full = lines.join('\n');
  const colOf = (idx: number) => idx + 1;
  return {
    uri: URI,
    getValueInRange: (r: any) =>
      r.startLineNumber === r.endLineNumber
        ? lines[r.startLineNumber - 1]!.slice(r.startColumn - 1, r.endColumn - 1)
        : full,
    getLineContent: (ln: number) => lines[ln - 1] ?? '',
    getLineCount: () => lines.length,
    getLineMaxColumn: (ln: number) => (lines[ln - 1] ?? '').length + 1,
    findMatches: () => [],
  };
}

const RANGE = { startLineNumber: 1, startColumn: 1, endLineNumber: 5, endColumn: 80 };

function markerAt(sl: number, sc: number, ec: number, patch: Record<string, any> = {}) {
  return {
    owner: 'es-dsl-lint', startLineNumber: sl, startColumn: sc, endLineNumber: sl, endColumn: ec,
    message: '', severity: 4, code: { value: 'es-dsl-lint:anchored' }, ...patch,
  };
}
function entry(sl: number, sc: number, ec: number, rule: string, message: string) {
  return { startLineNumber: sl, startColumn: sc, endLineNumber: sl, endColumn: ec, finding: { rule, message, suggestion: 's', anchor: 'a' } };
}
const dslProvider = () => caps.providers[caps.providers.length - 1];

/** 单行多编辑按原坐标合成（range 均同行；后向前替换保 offset）。 */
function applyEdits(doc: string, edits: { textEdit: { range: any; text: string } }[]): string {
  let out = doc;
  const sorted = [...edits].sort((a, b) => b.textEdit.range.startColumn - a.textEdit.range.startColumn);
  for (const e of sorted) {
    out = out.slice(0, e.textEdit.range.startColumn - 1) + e.textEdit.text + out.slice(e.textEdit.range.endColumn - 1);
  }
  return out;
}

beforeAll(() => { ensureDslLintQuickFixes(); });
beforeEach(() => { caps.markers = []; caps.filter = null; });

/* ═══ A：root-bare-clause 裸子句包 query 外壳 ═══ */
describe('557 A：root-bare-clause CodeAction（逐键 wrap query 外壳）', () => {
  it('正向：键前零宽插 "query": { + 子句值收尾补 }，合成即合法 DSL', () => {
    const doc = '{"term": {"status": 1}}';
    caps.markers = [markerAt(1, 2, 8)]; /* 覆盖 "term" */
    recordDslLintMarkers(URI_STR, [entry(1, 2, 8, 'root-bare-clause', '子句「term」裸在根层：需包在 query 里，ES 对根级未知键直接 400')]);
    const acts = dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions;
    expect(acts.length).toBe(1);
    expect(acts[0].kind).toBe('quickfix');
    const edits = acts[0].edit.edits;
    expect(edits.length).toBe(2);
    const [a, b] = edits.map((e: any) => e.textEdit);
    /* 键前零宽插壳 */
    expect(a.text).toBe('"query": {');
    expect(a.range).toEqual({ startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 });
    /* 子句值收尾 '}' 前零宽补 }（balancedCloseOf 配平定位） */
    expect(b.text).toBe('}');
    expect(b.range).toEqual({ startLineNumber: 1, startColumn: 22, endLineNumber: 1, endColumn: 22 });
    expect(applyEdits(doc, edits), '两笔编辑合成必须是合法 DSL').toBe('{"query": {"term": {"status": 1}}}');
  });

  it('正向（多行 pretty 排版）：modelFullText 逐行配平，收尾补在子句值同行', () => {
    const doc = ['{', '  "term": {"status": 1}', '}'];
    caps.markers = [markerAt(2, 3, 9)];
    recordDslLintMarkers(URI_STR, [entry(2, 3, 9, 'root-bare-clause', '子句「term」裸在根层：需包在 query 里，ES 对根级未知键直接 400')]);
    const acts = dslProvider().provideCodeActions(fakeModelML(doc), RANGE).actions;
    expect(acts.length).toBe(1);
    const [a, b] = acts[0].edit.edits.map((e: any) => e.textEdit);
    expect(a.text).toBe('"query": {');
    expect(a.range).toEqual({ startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 3 });
    expect(b.text).toBe('}');
    expect(b.range).toEqual({ startLineNumber: 2, startColumn: 23, endLineNumber: 2, endColumn: 23 });
  });

  it('负向：root 已有 "query" 键（首层键扫）零 action——不产重复 query 键', () => {
    const doc = '{"query": {"match_all": {}}, "term": {"status": 1}}';
    caps.markers = [markerAt(1, 30, 36)]; /* 覆盖裸子句 "term" */
    recordDslLintMarkers(URI_STR, [entry(1, 30, 36, 'root-bare-clause', '子句「term」裸在根层：需包在 query 里，ES 对根级未知键直接 400')]);
    expect(dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions).toEqual([]);
  });

  it('负向：marker 未覆盖消息内子句键本体（534 B 段同形态）零 action', () => {
    caps.markers = [markerAt(1, 2, 9)];
    recordDslLintMarkers(URI_STR, [entry(1, 2, 9, 'root-bare-clause', '子句「term」裸在根层：需包在 query 里')]);
    expect(dslProvider().provideCodeActions(fakeModel('{"anchor": {}}'), RANGE).actions).toEqual([]);
  });

  it('负向：子句值非对象（键后非 ": {"）零 action——不越界改结构', () => {
    const doc = '{"term": 1}';
    caps.markers = [markerAt(1, 2, 8)];
    recordDslLintMarkers(URI_STR, [entry(1, 2, 8, 'root-bare-clause', '子句「term」裸在根层：需包在 query 里，ES 对根级未知键直接 400')]);
    expect(dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions).toEqual([]);
  });
});

/* ═══ B：text-range / agg-interval-key 两条增量 ═══ */
describe('557 B：text-range + agg-interval-key quickfix', () => {
  it('text-range：marker 覆盖 text 字段本体 → 追加 .keyword（text-term 同款形态）', () => {
    const doc = '{"query": {"range": {"title": {"gte": "a"}}}}';
    const m = markerAt(1, 22, 29); /* 覆盖 "title" */
    caps.markers = [m];
    recordDslLintMarkers(URI_STR, [entry(1, 22, 29, 'text-range', 'text 字段 title 的 range 在分词后的词项上按字典序比较，数值/时间语义失真')]);
    const acts = dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions;
    expect(acts.length).toBe(1);
    expect(acts[0].title).toBe('字段改为「title.keyword」');
    expect(acts[0].edit.edits[0].textEdit.text).toBe('"title.keyword"');
    expect(acts[0].edit.edits[0].textEdit.range).toEqual(m);
  });

  it('text-range 负向：已带 .keyword / marker 非带引号串 → 零 action（反向证据闸）', () => {
    const msg = 'text 字段 title.keyword 的 range 在分词后的词项上按字典序比较，数值/时间语义失真';
    caps.markers = [markerAt(1, 20, 36)];
    recordDslLintMarkers(URI_STR, [entry(1, 20, 36, 'text-range', msg)]);
    expect(dslProvider().provideCodeActions(fakeModel('{"query": {"range": {"title.keyword": {"gte": "a"}}}}'), RANGE).actions).toEqual([]);
    /* marker 覆盖裸词（无引号壳）：非串零 action */
    caps.markers = [markerAt(1, 2, 7)];
    recordDslLintMarkers(URI_STR, [entry(1, 2, 7, 'text-range', 'text 字段 title 的 range 在分词后的词项上按字典序比较，数值/时间语义失真')]);
    expect(dslProvider().provideCodeActions(fakeModel('{title: 1}'), RANGE).actions).toEqual([]);
  });

  it('agg-interval-key 双键互斥：出删 calendar_interval / fixed_interval 双 action（含逗号回吞）', () => {
    const doc = '{"date_histogram": {"calendar_interval": "month", "fixed_interval": "1h"}}';
    caps.markers = [markerAt(1, 2, 18)]; /* 覆盖 "date_histogram" */
    recordDslLintMarkers(URI_STR, [entry(1, 2, 18, 'agg-interval-key', 'date_histogram 的 calendar_interval 与 fixed_interval 互斥：两键并存 ES 直接拒绝请求（400）')]);
    const acts = dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions;
    expect(acts.length).toBe(2);
    expect(acts[0].title).toBe('删 "calendar_interval"（保留 fixed_interval）');
    expect(acts[1].title).toBe('删 "fixed_interval"（保留 calendar_interval）');
    /* 删 calendar：连值带尾随逗号及后随空白整段摘除 */
    const e0 = acts[0].edit.edits[0].textEdit;
    expect(e0.range).toEqual({ startLineNumber: 1, startColumn: 21, endLineNumber: 1, endColumn: 51 });
    expect(applyEdits(doc, acts[0].edit.edits)).toBe('{"date_histogram": {"fixed_interval": "1h"}}');
    /* 删 fixed：对象内最后一对无尾逗号 → 回吞前导逗号 */
    const e1 = acts[1].edit.edits[0].textEdit;
    expect(e1.range).toEqual({ startLineNumber: 1, startColumn: 49, endLineNumber: 1, endColumn: 73 });
    expect(applyEdits(doc, acts[1].edit.edits)).toBe('{"date_histogram": {"calendar_interval": "month"}}');
  });

  it('agg-interval-key 负向：marker 非本体 → 零 action', () => {
    /* 558 批同步更新注记（557 root-bare-clause 修订先例同款）：废弃 interval 分支已修订出
       「interval 改为 calendar_interval」改名 action，本用例原前半段（废弃消息零 action
       断言）废止，正样移 hintWave558 A 段；保留 marker 非本体证据闸负样。 */
    /* 534 B 段同形态：marker 不在 "date_histogram" 上 */
    caps.markers = [markerAt(1, 2, 9)];
    recordDslLintMarkers(URI_STR, [entry(1, 2, 9, 'agg-interval-key', 'date_histogram 的 calendar_interval 与 fixed_interval 互斥：两键并存 ES 直接拒绝请求（400）')]);
    expect(dslProvider().provideCodeActions(fakeModel('{"anchor": {}}'), RANGE).actions).toEqual([]);
  });
});

/* ═══ C：sqlCompletion IN 列表第 2+ 项值位候选 ═══ */
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

const ALL_FIELDS = [
  { path: 'name', type: 'keyword' },
  { path: 'created', type: 'date' },
  { path: 'title', type: 'text' },
];

function makeCtx(): () => SqlCompletionCtx {
  return () => ({
    indices: () => [{ index: 'orders' }],
    pickedIdx: () => 'orders',
    curFields: () => ALL_FIELDS,
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

describe("557 C：IN 列表第 2+ 项值位候选（`, 'xx␣` 失配根治）", () => {
  beforeEach(() => { setActivePinia(createPinia()); });
  afterEach(() => { __clearSuggestCache(); vi.restoreAllMocks(); });

  it('keyword 列第 2 项：IN (\'act\', \'ac␣ → terms suggest 候选（LHS 左扫到 name）', async () => {
    vi.useFakeTimers();
    const m = makeMonaco();
    const spy = vi.spyOn(api, 'searchRaw').mockResolvedValue({
      aggregations: { suggest: { buckets: [{ key: 'act' }, { key: 'active' }] } },
    });
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      const before = "SELECT * FROM orders WHERE name IN ('act', 'ac";
      const p = sqlProvider(m).provideCompletionItems(fakeSqlModel(before), { lineNumber: 1 });
      await vi.advanceTimersByTimeAsync(10);
      const r = await p;
      expect(spy).toHaveBeenCalledTimes(1);
      expect((r.suggestions as any[]).map(s => s.label)).toEqual(['act', 'active']);
      expect(String(r.suggestions[0].detail)).toContain('name');
    } finally { h.dispose(); vi.useRealTimers(); }
  });

  it('date 列第 2 项静态档（已敲前缀含 -）与第 3 项空前缀：零请求同步快返', () => {
    const m = makeMonaco();
    const spy = vi.spyOn(api, 'searchRaw');
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      const cases = [
        "SELECT * FROM orders WHERE created IN ('2026-01-01', '2026-",
        "SELECT * FROM orders WHERE created IN ('2026-01-01', '2026-02-02', '",
      ];
      for (const before of cases) {
        const r: any = sqlProvider(m).provideCompletionItems(fakeSqlModel(before), { lineNumber: 1 });
        expect((r.suggestions as any[]).map(s => s.label), before).toEqual(['now-1d/d', 'now-1h/h']);
        expect(String(r.suggestions[0].detail), before).toContain('date');
      }
      expect(spy, '静态档零请求').not.toHaveBeenCalled();
    } finally { h.dispose(); }
  });

  it('首项既有通道零扰动 + 未知列第 2 项零候选（宁缺勿错）', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      /* 首项走既有主正则（535 R2 契约零漂移） */
      const r1: any = sqlProvider(m).provideCompletionItems(
        fakeSqlModel("SELECT * FROM orders WHERE created IN ('"), { lineNumber: 1 });
      expect((r1.suggestions as any[]).map(s => s.label)).toEqual(['now-1d/d', 'now-1h/h']);
      /* IN 支路 LHS 列名左扫口径不变：列未知零候选，不落 ③ 字段名候选 */
      const r2: any = sqlProvider(m).provideCompletionItems(
        fakeSqlModel("SELECT * FROM orders WHERE nope IN ('a', 'x"), { lineNumber: 1 });
      expect(r2.suggestions).toEqual([]);
    } finally { h.dispose(); }
  });
});

/* ═══ D：splitMark 数值归一联动 + JsonTree renderHl 收口 ═══ */
describe('557 D：splitMark 归一命中产 mark（字面行为零漂移）', () => {
  it('字面失配 + 两侧数值归一命中 → 整段 mark（千分位/归一含对齐 useGridSearch 第二遍口径）', () => {
    expect(splitMark('1,234', '1234')).toEqual([{ t: '1,234', m: true }]);
    expect(splitMark('1,234,567', '1234567')).toEqual([{ t: '1,234,567', m: true }]);
    /* 归一 include 局部命中（matches 第二遍 includes 同口径） */
    expect(splitMark('12,345', '2345')).toEqual([{ t: '12,345', m: true }]);
  });

  it('字面命中路径零漂移：命中切分/无命中单段原文（229 批契约不变）', () => {
    expect(splitMark('1,234 and 1234', '1234')).toEqual([
      { t: '1,234 and ', m: false }, { t: '1234', m: true },
    ]);
    expect(splitMark('abc', 'zz')).toEqual([{ t: 'abc', m: false }]);
    /* kw 是数而文本不是数（归一不参与）；非千分位形态 '12,34' 不归一（去逗号误伤防波） */
    expect(splitMark('abc', '12')).toEqual([{ t: 'abc', m: false }]);
    expect(splitMark('12,34', '1234')).toEqual([{ t: '12,34', m: false }]);
  });

  it('JsonTree renderHl：手写切分循环退役（splitMark 单源）+ jt-mark 类保留', () => {
    const jt = read('components/JsonTree.vue');
    expect(jt, '切分收口 useGridSearch.splitMark 单源').toContain("import { splitMark } from '../composables/useGridSearch';");
    expect(jt).toContain('splitMark(text, k)');
    expect(jt, '手写 indexOf 切分循环退役').not.toMatch(/indexOf\(lk/);
    expect(jt, 'jt-mark 类与样式保留').toContain("class: 'jt-mark'");
    expect(jt).toContain('.jt-mark');
  });

  it('JsonTree 挂载行为：高亮覆盖面只增不减——数值归一格出 mark，字面高亮照旧', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(JsonTree, { data: { n: 1234567, s: 'hello world' }, tools: true, highlightKw: '1,234,567' }) });
    try {
      app.mount(host);
      await nextTick();
      const marks = Array.from(host.querySelectorAll('mark.jt-mark')).map(el => el.textContent);
      /* 数值归一命中（kw 千分位 '1,234,567' ↔ 数字叶子文本 '1234567'）：此前零 mark，收口后白得
         （数字叶子 valText=String(v) 无引号壳，归一比对可达；字符串叶子带引号壳不误标） */
      expect(marks).toContain('1234567');
      /* 字面高亮零漂移：字面词照常切 mark */
      app.unmount();
      document.body.innerHTML = '';
      const host2 = document.createElement('div');
      document.body.appendChild(host2);
      const app2 = createApp({ render: () => h(JsonTree, { data: { s: 'hello world' }, tools: true, highlightKw: 'world' }) });
      app2.mount(host2);
      await nextTick();
      expect(Array.from(host2.querySelectorAll('mark.jt-mark')).map(el => el.textContent)).toEqual(['world']);
      app2.unmount();
    } finally {
      app.unmount();
      document.body.innerHTML = '';
    }
  });
});

/* ═══ E：SynonymsManagerView filterName datalist（源锚） ═══ */
describe('557 E：同义词视图 filter 名 input 挂 datalist', () => {
  it('裸 input 挂 list + datalist 候选=已加载同义词 filter id（doLoad 随载随填）', () => {
    const sv = read('views/SynonymsManagerView.vue');
    expect(sv, 'filter 名 input 挂 datalist').toContain('list="sy-filter-ids"');
    expect(sv).toContain('<datalist id="sy-filter-ids">');
    expect(sv, '候选项吃已加载清单').toContain('v-for="fid in loadedFilterIds"');
    expect(sv, 'doLoad 收集同义词 filter id（synonym_graph/synonym 两型）').toContain("flt[k]?.type === 'synonym_graph' || flt[k]?.type === 'synonym'");
    expect(sv).toContain('loadedFilterIds');
  });
});
