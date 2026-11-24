/**
 * 五百五十八批工蚁A（轨1 智能提示高亮）hintWave558：五件行为看守。
 *  A monacoJsonQuickFix agg-interval-key 废弃 interval 分支修订出改名 CodeAction：
 *    消息拆废弃键名（「使用已废弃的 "interval" 键」）→ 锚后右扫整段改名 "calendar_interval"
 *    （script-inline 同款形态，日历语义为建议文案首选的保守侧）；双缺分支维持零 action；
 *  B monacoJsonQuickFix 513 前导逗号删除：marker 所在行 trimStart 以 ',' 开头 → 删该前导
 *    逗号（删除不是补逗号，「513 不得误配补逗号」旧裁定不越界；无 ',,' 与行首逗号证据
 *    仍零 action；',,' 双逗号安全子集零扰动）；
 *  C esError KNOWN 六高频错误码中文映射（query_shard / mapper_parsing / action_request_
 *    validation / document_parsing / rejected_execution / too_many_buckets；叶子先于
 *    包装型命中，527 位置约定）+ HTTP 400/500/503 兜底（556 批五码扩容，叶子优先零扰动）；
 *  D dslLint 两盲区：① FIELD_CLAUSES 收 exists——{"field":x} 值位字段引用进 unknown-field
 *    口径（root-bare-clause 顺带覆盖根层裸 exists）；② AGG_FIELD_METRICS 判定域 field 值
 *    复用 unknown-field 口径（aggs.terms.field 拼错静默空桶）；零 ctx 两件零回归；
 *  E dslCompletionContext DSL_VALUE_TYPE_HINTS 补 date_nanos + geo_point 两档
 *    （dslValueTiers540 B 段负锁同步更新修订——540 regime 收窄，与 sqlCompletion/LuceneInput
 *    姊妹面对齐；detail 与 values 逐字同源平移）。
 *
 * stub 范式：A/B 段照 quickFixDslLint534 / codeActionQuickFix（vi.hoisted caps + editor.api
 * mock + 注册表直填）；C/D/E 段纯函数直 import 不挂 Monaco。
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

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

import { ensureJsonQuickFixes, ensureDslLintQuickFixes, recordDslLintMarkers } from '../utils/monacoJsonQuickFix';
import { friendlyEsError } from '../utils/esError';
import { lintDsl, type LintCtx } from '../utils/dslLint';
import { DSL_VALUE_TYPE_HINTS } from '../utils/dslCompletionContext';

const URI_STR = 'inmemory://hint-558/1';
const URI = { toString: () => URI_STR };

/** 单行文档 fake model（quickFixDslLint534 同款）：findMatches 大小写敏感右扫、行内容切片。 */
function fakeModel(line: string) {
  const colOf = (idx: number) => idx + 1; /* 单行文档：0 基 idx → 1 基列 */
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

/** 多行文档 fake model（codeActionQuickFix fakeModelLines 同款，513 行内容读取用）。 */
function fakeModelLines(lines: string[]) {
  return {
    uri: URI,
    getValueInRange: (r: any) => (lines[r.startLineNumber - 1] ?? '').slice(r.startColumn - 1, r.endColumn - 1),
    getLineContent: (ln: number) => lines[ln - 1] ?? '',
    getLineCount: () => lines.length,
  };
}

/* 整行触发选区（provideCodeActions 第二参） */
const RANGE = { startLineNumber: 1, startColumn: 1, endLineNumber: 5, endColumn: 200 };

function dslMarkerAt(sc: number, ec: number) {
  return {
    owner: 'es-dsl-lint', startLineNumber: 1, startColumn: sc, endLineNumber: 1, endColumn: ec,
    message: '', severity: 4, code: { value: 'es-dsl-lint:anchored' },
  };
}
function dslEntry(sc: number, ec: number, rule: string, message: string) {
  return { startLineNumber: 1, startColumn: sc, endLineNumber: 1, endColumn: ec, finding: { rule, message, suggestion: 's', anchor: 'a' } };
}
function jsonMarker(ln: number, sc: number, ec: number, code: string, message: string) {
  return { owner: 'json', startLineNumber: ln, startColumn: sc, endLineNumber: ln, endColumn: ec, message, severity: 8, code };
}
const jsonProvider = () => caps.providers[0];
const dslProvider = () => caps.providers[caps.providers.length - 1];

/** 单行多编辑按原坐标合成（range 均同行；后向前替换保 offset，hintWave557 同款）。 */
function applyEdits(doc: string, edits: { textEdit: { range: any; text: string } }[]): string {
  let out = doc;
  const sorted = [...edits].sort((a, b) => b.textEdit.range.startColumn - a.textEdit.range.startColumn);
  for (const e of sorted) {
    out = out.slice(0, e.textEdit.range.startColumn - 1) + e.textEdit.text + out.slice(e.textEdit.range.endColumn - 1);
  }
  return out;
}

beforeAll(() => { ensureJsonQuickFixes(); ensureDslLintQuickFixes(); });
beforeEach(() => { caps.markers = []; caps.filter = null; });

/* ═══ A：agg-interval-key 废弃 interval 分支修订出改名 action ═══ */
describe('558 A：agg-interval-key 废弃 interval → interval 改名 calendar_interval', () => {
  it('正向：消息拆废弃键名右扫整段改名，合成即合法 DSL', () => {
    const doc = '{"date_histogram": {"interval": "1h"}}';
    caps.markers = [dslMarkerAt(2, 18)]; /* 覆盖 "date_histogram" */
    recordDslLintMarkers(URI_STR, [dslEntry(2, 18, 'agg-interval-key', 'date_histogram 使用已废弃的 "interval" 键：ES 7.2 起拆分为 calendar_interval / fixed_interval，新版本直接拒绝请求（400）')]);
    const acts = dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions;
    expect(acts.length).toBe(1);
    expect(acts[0].kind).toBe('quickfix');
    expect(acts[0].title).toBe('interval 改为 calendar_interval');
    const te = acts[0].edit.edits[0].textEdit;
    expect(te.text).toBe('"calendar_interval"');
    /* script-inline 同款右扫：锚后 '"interval"' 字面（1 基列 21 起、10 字符） */
    expect(te.range).toEqual({ startLineNumber: 1, startColumn: 21, endLineNumber: 1, endColumn: 31 });
    const after = applyEdits(doc, acts[0].edit.edits);
    expect(after).toBe('{"date_histogram": {"calendar_interval": "1h"}}');
    expect(() => JSON.parse(after)).not.toThrow();
  });

  it('负向：双缺分支维持零 action（557 备案不扩）/ 文档无废弃键字面零 action（宁缺勿错）', () => {
    /* 双缺消息：拆不出「使用已废弃的 "…" 键」→ null */
    caps.markers = [dslMarkerAt(2, 18)];
    recordDslLintMarkers(URI_STR, [dslEntry(2, 18, 'agg-interval-key', 'date_histogram 缺时间间隔键：需写 calendar_interval 或 fixed_interval 之一（旧 "interval" 已废弃）')]);
    expect(dslProvider().provideCodeActions(fakeModel('{"date_histogram": {"field": "created"}}'), RANGE).actions).toEqual([]);
    /* 废弃消息但文档无 '"interval"' 字面（注册表/文档错位）→ 零 action */
    caps.markers = [dslMarkerAt(2, 18)];
    recordDslLintMarkers(URI_STR, [dslEntry(2, 18, 'agg-interval-key', 'date_histogram 使用已废弃的 "interval" 键：ES 7.2 起拆分为 calendar_interval / fixed_interval，新版本直接拒绝请求（400）')]);
    expect(dslProvider().provideCodeActions(fakeModel('{"date_histogram": {"field": "created"}}'), RANGE).actions).toEqual([]);
  });
});

/* ═══ B：513 前导逗号删除分支 ═══ */
describe('558 B：513 前导逗号删除（删除不是补逗号，旧裁定不越界）', () => {
  it('正向：marker 行 trimStart 以 , 开头 → 删除该前导逗号，合成后 JSON 合法', () => {
    const lines = ['{"a": 1,', '  , "b": 2}'];
    caps.markers = [jsonMarker(2, 4, 5, '513', 'Property expected')];
    const acts = jsonProvider().provideCodeActions(fakeModelLines(lines), RANGE).actions;
    const a = acts.find((x: any) => x.title === '删除前导逗号');
    expect(a, '前导逗号行应出删除 action').toBeTruthy();
    expect(a.kind).toBe('quickfix');
    expect(a.edit.edits[0].textEdit.text).toBe('');
    /* 修复点=行首首个非空白字符（该逗号本身）：列 3-4 */
    expect(a.edit.edits[0].textEdit.range).toEqual({ startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 4 });
    /* 「513 不得误配补逗号」旧裁定头注：绝不出补逗号 action */
    expect(acts.find((x: any) => x.title === '补逗号')).toBeUndefined();
    const merged = [lines[0], applyEdits(lines[1]!, acts.map((x: any) => x.edit.edits[0]))].join('\n');
    expect(() => JSON.parse(merged)).not.toThrow();
  });

  it('负向：无行首逗号且无 ,, 证据仍零 action（其余 513 场景裁定保留）；,, 双逗号安全子集零扰动', () => {
    /* 行首无逗号：不出任何 action */
    caps.markers = [jsonMarker(2, 3, 4, '513', 'Property expected')];
    expect(jsonProvider().provideCodeActions(fakeModelLines(['{"a": 1', '  "b": 2}']), RANGE).actions).toEqual([]);
    /* ',,' 双逗号安全子集（533 批行为零漂移） */
    caps.markers = [jsonMarker(1, 11, 12, '513', 'Property expected')];
    const acts = jsonProvider().provideCodeActions(fakeModelLines(['{"a": [1,, 2]}']), RANGE).actions;
    expect(acts.map((x: any) => x.title)).toEqual(['双逗号删一']);
  });
});

/* ═══ C：esError KNOWN 六错误码 + HTTP 400/500/503 兜底 ═══ */
describe('558 C：esError 六高频错误码中文映射 + HTTP 兜底三码', () => {
  it('六错误码逐条命中（叶子标签入文案）', () => {
    expect(friendlyEsError('query_shard_exception: Failed to parse query [x]')).toContain('查询构建错误');
    /* mapper/document_parsing_exception：JSON error.type 形态走结构化精确映射
       （结构化先于子串，explainDocMissing 同位先例） */
    expect(friendlyEsError('{"error":{"root_cause":[{"type":"mapper_parsing_exception","reason":"failed to parse field [name]"}],"type":"mapper_parsing_exception"}}')).toContain('mapping 解析失败');
    expect(friendlyEsError('{"error":{"type":"document_parsing_exception","reason":"[1:12] failed to parse field [age]"}}')).toContain('文档解析失败');
    expect(friendlyEsError('action_request_validation_exception: Validation Failed: 1: size is required;')).toContain('请求校验失败');
    expect(friendlyEsError('es_rejected_execution_exception: rejected execution of processing')).toContain('线程池拒绝');
    expect(friendlyEsError('too_many_buckets_exception: Trying to create too many buckets')).toContain('聚合桶数超限');
  });

  it('mapper_parsing_exception 裸异常串维持泛翻译零回归（jobTracker R79 锁同源）', () => {
    expect(friendlyEsError('mapper_parsing_exception: failed to parse field [ts]')).toContain('DSL 解析失败');
    expect(friendlyEsError('mapper_parsing_exception: failed to parse field [ts]')).not.toContain('mapping 解析失败');
  });

  it('位置约定（527 先例）：叶子原因先于包装型命中，不被泛文案吞掉', () => {
    const raw = '{"error":{"root_cause":[{"type":"query_shard_exception","reason":"Failed to parse query [x]"}],"type":"search_phase_execution_exception","reason":"all shards failed"}}';
    const out = friendlyEsError(raw);
    expect(out).toContain('查询构建错误');
    expect(out).not.toContain('查询执行失败');
    /* parsing_exception 泛串是 mapper_parsing_exception / document_parsing_exception 的子串：
       不前置约定会被泛文案吞掉——子串共存时叶子赢 */
    const raw2 = '{"error":{"type":"mapper_parsing_exception","reason":"failed to parse"}}';
    expect(friendlyEsError(raw2)).toContain('mapping 解析失败');
    expect(friendlyEsError(raw2)).not.toContain('DSL 解析失败');
  });

  it('HTTP 400/500/503 兜底映射；既有叶子映射优先零扰动（556 约定延续）', () => {
    expect(friendlyEsError('HTTP 400')).toContain('400');
    expect(friendlyEsError('HTTP 500')).toContain('500');
    expect(friendlyEsError('HTTP 503')).toContain('503');
    /* body 带 ES error.type 时叶子先命中先赢（KNOWN 尾部约定） */
    expect(friendlyEsError('HTTP 400 index_not_found_exception')).toContain('索引不存在');
  });

  it('ctx 前缀重拼：组装态消息「id: 原因」结构共存（commitFailReason 约定同源）', () => {
    /* 组装态消息（notify 会整条再喂 friendlyEsError）：泛 parsing_exception 命中点在
       'mapper_' 词中，前缀剥离到不了 id 的 ASCII 冒号 → 「a: 」结构自然保留 */
    const out = friendlyEsError('失败 1 条（已保留待重试）— a: mapper_parsing_exception: failed to parse field [name]');
    expect(out).toContain('a: ');
    expect(out).toContain('DSL 解析失败');
    /* R85 ctx 短前缀全角重拼形态不变（esError.spec 同款钉） */
    expect(friendlyEsError('inspect 失败: Failed to fetch')).toContain('inspect 失败：网络请求失败');
  });
});

/* ═══ D：dslLint 两盲区（exists 值位字段 + aggs field 值 unknown-field） ═══ */
const CTX: LintCtx = { fields: [{ path: 'status', type: 'keyword' }, { path: 'created', type: 'date' }, { path: 'title', type: 'text' }] };
const rulesOf = (obj: unknown, ctx?: LintCtx) => lintDsl(obj, ctx).map(f => f.rule);

describe('558 D①：exists 子句 {"field":x} 值位字段引用进 unknown-field 口径', () => {
  it('笔误字段报 unknown-field：anchor=字段名、附最近字段候选（与 term 系同文案契约）', () => {
    const fs = lintDsl({ query: { exists: { field: 'statuz' } } }, CTX);
    const f = fs.find(x => x.rule === 'unknown-field');
    expect(f, 'exists.field 笔误应命中').toBeTruthy();
    expect(f!.anchor).toBe('statuz');
    expect(f!.message).toContain('最接近：status');
    expect(f!.nth).toBe(0);
    /* 合法字段零误报；元字段 _id 豁免（lintFieldUsage 既有元字段守卫同口径） */
    expect(rulesOf({ query: { exists: { field: 'status' } } }, CTX)).not.toContain('unknown-field');
    expect(rulesOf({ query: { exists: { field: '_id' } } }, CTX)).not.toContain('unknown-field');
  });

  it('零 ctx 零回归；FIELD_CLAUSES 收 exists 的顺带面=根层裸 exists 进 root-bare-clause', () => {
    expect(rulesOf({ query: { exists: { field: 'statuz' } } })).not.toContain('unknown-field');
    expect(rulesOf({ exists: { field: 'status' } })).toContain('root-bare-clause');
  });
});

describe('558 D②：AGG_FIELD_METRICS 判定域 field 值复用 unknown-field 口径', () => {
  it('aggs terms.field 拼错 → unknown-field hint（附最近字段）；.keyword 基字段在场豁免', () => {
    const fs = lintDsl({ aggs: { h: { terms: { field: 'statuz', size: 10 } } } }, CTX);
    const f = fs.find(x => x.rule === 'unknown-field');
    expect(f, 'aggs field 笔误应命中').toBeTruthy();
    expect(f!.anchor).toBe('statuz');
    expect(f!.message).toContain('最接近：status');
    expect(rulesOf({ aggs: { h: { terms: { field: 'status.keyword' } } } }, CTX)).not.toContain('unknown-field');
    /* text 字段仍走 agg-text-field（既有判定零漂移、与 unknown-field 互斥不双报） */
    const tfs = lintDsl({ aggs: { h: { terms: { field: 'title' } } } }, CTX);
    expect(tfs.map(x => x.rule)).toContain('agg-text-field');
    expect(tfs.map(x => x.rule)).not.toContain('unknown-field');
  });

  it('零 ctx 零回归', () => {
    expect(rulesOf({ aggs: { h: { terms: { field: 'statuz' } } } })).not.toContain('unknown-field');
  });
});

/* ═══ E：DSL_VALUE_TYPE_HINTS 补 date_nanos + geo_point 两档 ═══ */
describe('558 E：DSL_VALUE_TYPE_HINTS 姊妹面对齐两档（540 负锁同步更新修订）', () => {
  it('date_nanos / geo_point 档与 sqlCompletion VAL_FORMAT_HINTS 同值同形', () => {
    expect(DSL_VALUE_TYPE_HINTS.date_nanos).toEqual({ detail: 'date-math 格式提示 · date_nanos', values: ['now-1d/d', 'now-1h/h'] });
    expect(DSL_VALUE_TYPE_HINTS.geo_point).toEqual({ detail: '字面提示 · geo_point', values: ['40.71,-74.01'] });
    /* 既有两档零扰动（540 B 段正锁保留） */
    expect(DSL_VALUE_TYPE_HINTS.date).toEqual({ detail: 'date-math 格式提示 · date', values: ['now-1d/d', 'now-1h/h'] });
    expect(DSL_VALUE_TYPE_HINTS.ip).toEqual({ detail: '字面提示 · ip', values: ['192.168.0.1'] });
  });
});
