/**
 * 五百三十四批 P0-2：es-dsl-lint CodeAction + setMarkers 注册表契约看守。
 *
 *  A 规则→fix 白名单九条逐条行为（script-inline / sort-order-typo / range-op-typo /
 *    bool-key-typo / root-key-typo / settings-key / mapping-key 键改名 + terms-scalar
 *    标量包数组 + body-value-type·settings-value 剥引号成数）；
 *  B 负向：agg-interval-key（日历 vs 固定二义）与 match-all / deep-paging 等建议类零 action；
 *    settings-value 非数字串不出剥引号 action（证据闸）；
 *  C 注册表随 setMarkers 语义同步：全量替换不叠加、clearDslLintMarkers 清理、
 *    注册表缺席时 marker.code 后缀兜底；卸载清理源锚；
 *  D 既有 owner='json' 四码链路零触碰（过滤面 owner=json、528 行为不变）；
 *  E MonacoEditor/JsonArea 契约同步更新源锚（code 前缀 + record/clear + 类型加 rule 可选）。
 *
 * stub 范式同 codeActionQuickFix.spec（vi.hoisted caps + editor.api mock）；注册表经
 * recordDslLintMarkers 直填（MonacoEditor.setMarkers 同一写入面，组件级行为由源锚锁定）。
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

import { ensureJsonQuickFixes, ensureDslLintQuickFixes, recordDslLintMarkers, clearDslLintMarkers } from '../utils/monacoJsonQuickFix';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');

const URI_STR = 'inmemory://dsl-lint/1';
const URI = { toString: () => URI_STR };

/** 单行文档 fake model：findMatches 大小写敏感右扫（scope 起点之后过滤）、行内容切片。 */
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

/* 整行触发选区（provideCodeActions 第二参） */
const RANGE = { startLineNumber: 1, startColumn: 1, endLineNumber: 5, endColumn: 80 };

function markerAt(sc: number, ec: number, patch: Record<string, any> = {}) {
  return {
    owner: 'es-dsl-lint', startLineNumber: 1, startColumn: sc, endLineNumber: 1, endColumn: ec,
    message: '', severity: 4, code: { value: 'es-dsl-lint:anchored' }, ...patch,
  };
}
function entry(sc: number, ec: number, rule: string, message: string) {
  return { startLineNumber: 1, startColumn: sc, endLineNumber: 1, endColumn: ec, finding: { rule, message, suggestion: 's', anchor: 'a' } };
}
const dslProvider = () => caps.providers[caps.providers.length - 1];

beforeAll(() => { ensureJsonQuickFixes(); ensureDslLintQuickFixes(); });
beforeEach(() => { caps.markers = []; caps.filter = null; });

describe('A 规则→fix 白名单九条（行为逐条）', () => {
  it('script-inline →「inline 改为 source」：锚点后右扫首条 "inline" 改名', () => {
    const model = fakeModel('{"script": {"inline": "ctx.x=1"}}');
    caps.markers = [markerAt(2, 9)]; /* 覆盖 "script" */
    recordDslLintMarkers(URI_STR, [entry(2, 9, 'script-inline', 'script 使用旧键 "inline"：ES 6.x 起已改名 "source"')]);
    const a = dslProvider().provideCodeActions(model, RANGE).actions[0];
    expect(a.title).toBe('inline 改为 source');
    expect(a.kind).toBe('quickfix');
    const te = a.edit.edits[0].textEdit;
    expect(te.text).toBe('"source"');
    expect(te.range).toEqual({ startLineNumber: 1, startColumn: 13, endLineNumber: 1, endColumn: 21 });
  });

  it('bool-key-typo →「键改为「should」」：marker 即坏键本体，整段改名', () => {
    const model = fakeModel('{"bool": {"shoud": []}}');
    caps.markers = [markerAt(11, 18)];
    recordDslLintMarkers(URI_STR, [entry(11, 18, 'bool-key-typo', 'bool 组键「shoud」疑似拼写错误（最接近：should）——拼错键会被 ES 忽略')]);
    const a = dslProvider().provideCodeActions(model, RANGE).actions[0];
    expect(a.title).toBe('键改为「should」');
    expect(a.edit.edits[0].textEdit.text).toBe('"should"');
    expect(a.edit.edits[0].textEdit.range).toEqual(markerAt(11, 18));
  });

  it('body-key-typo →「键改为「query」」：nested 体里的 qurey（1439 新规则并入键改名）', () => {
    const model = fakeModel('{"query": {"nested": {"qurey": {}}}}');
    caps.markers = [markerAt(23, 30)];
    recordDslLintMarkers(URI_STR, [entry(23, 30, 'body-key-typo', '查询子句「nested」的键「qurey」疑似拼写错误（最接近：query）——ES 不认该键')]);
    const a = dslProvider().provideCodeActions(model, RANGE).actions[0];
    expect(a.title).toBe('键改为「query」');
    expect(a.edit.edits[0].textEdit.text).toBe('"query"');
  });

  it('agg-field-key-typo →「键改为「field」」：terms 体里的 filed（1439 并入键改名）', () => {
    const model = fakeModel('{"aggs":{"a":{"terms":{"filed":"x"}}}}');
    caps.markers = [markerAt(24, 31)];
    recordDslLintMarkers(URI_STR, [entry(24, 31, 'agg-field-key-typo', '聚合「terms」的字段键「filed」疑似拼写错误（最接近：field）——ES 不认该键')]);
    const a = dslProvider().provideCodeActions(model, RANGE).actions[0];
    expect(a.title).toBe('键改为「field」');
    expect(a.edit.edits[0].textEdit.text).toBe('"field"');
  });

  it('root-key-typo / settings-key / mapping-key 同款键改名（最接近候选拆自消息）', () => {
    const cases: [string, string, string][] = [
      ['root-key-typo', '{"querry": {}}', '键改为「query」'],
      ['settings-key', '{"number_of_sharps": 1}', '键改为「number_of_shards」'],
      ['mapping-key', '{"propeties": {}}', '键改为「properties」'],
    ];
    for (const [rule, doc, title] of cases) {
      const near = title.slice(4, -1);
      const model = fakeModel(doc);
      caps.markers = [markerAt(2, 9)];
      recordDslLintMarkers(URI_STR, [entry(2, 9, rule, `根级键「${doc.slice(2, -5)}」疑似拼写错误（最接近：${near}）——…`)]);
      const acts = dslProvider().provideCodeActions(model, RANGE).actions;
      expect(acts.map((a: any) => a.title), rule).toEqual([title]);
      expect(acts[0].edit.edits[0].textEdit.text).toBe('"' + near + '"');
    }
  });

  it('range-op-typo →「操作符改为「gte」」：锚点（字段名）后右扫坏操作符改名', () => {
    const model = fakeModel('{"range": {"created": {"gtee": "2026"}}}');
    caps.markers = [markerAt(12, 21)]; /* 覆盖 "created" */
    recordDslLintMarkers(URI_STR, [entry(12, 21, 'range-op-typo', 'range 操作符「gtee」疑似拼写错误（最接近：gte）——拼错键会被 ES 拒绝或忽略')]);
    const a = dslProvider().provideCodeActions(model, RANGE).actions[0];
    expect(a.title).toBe('操作符改为「gte」');
    expect(a.edit.edits[0].textEdit.text).toBe('"gte"');
    expect(a.edit.edits[0].textEdit.range).toEqual({ startLineNumber: 1, startColumn: 24, endLineNumber: 1, endColumn: 30 });
  });

  it('sort-order-typo →「方向改为「asc」」：锚点后右扫坏方向值改名', () => {
    const model = fakeModel('{"sort": [{"created": "ascending"}]}');
    caps.markers = [markerAt(12, 21)];
    recordDslLintMarkers(URI_STR, [entry(12, 21, 'sort-order-typo', 'sort 方向「ascending」疑似拼写错误（最接近：asc）——合法方向只有 asc / desc')]);
    const a = dslProvider().provideCodeActions(model, RANGE).actions[0];
    expect(a.title).toBe('方向改为「asc」');
    expect(a.edit.edits[0].textEdit.text).toBe('"asc"');
    expect(a.edit.edits[0].textEdit.range).toEqual({ startLineNumber: 1, startColumn: 23, endLineNumber: 1, endColumn: 34 });
  });

  it('terms-scalar →「标量包成数组」：同键值行标量剥取后 [] 包裹', () => {
    const model = fakeModel('{"query": {"terms": {"status": "active"}}}');
    caps.markers = [markerAt(22, 30)];
    recordDslLintMarkers(URI_STR, [entry(22, 30, 'terms-scalar', 'terms 值必须是数组：字段 status 收到标量「active」，ES 会拒绝请求（400）')]);
    const a = dslProvider().provideCodeActions(model, RANGE).actions[0];
    expect(a.title).toBe('标量包成数组 ["active"]');
    expect(a.edit.edits[0].textEdit.text).toBe('["active"]');
    expect(a.edit.edits[0].textEdit.range).toEqual({ startLineNumber: 1, startColumn: 32, endLineNumber: 1, endColumn: 40 });
  });

  it('body-value-type →「剥引号改为数字」：串内是合法数字才出', () => {
    const model = fakeModel('{"size": "10", "query": {}}');
    caps.markers = [markerAt(2, 8)];
    recordDslLintMarkers(URI_STR, [entry(2, 8, 'body-value-type', '根层 size 收到非数字标量「10」：分页参数类型严格，ES 直接拒绝请求（400）')]);
    const a = dslProvider().provideCodeActions(model, RANGE).actions[0];
    expect(a.title).toBe('剥引号改为数字 10');
    expect(a.edit.edits[0].textEdit.text).toBe('10');
    expect(a.edit.edits[0].textEdit.range).toEqual({ startLineNumber: 1, startColumn: 10, endLineNumber: 1, endColumn: 14 });
  });

  it('settings-value 剥引号成数同通道：数字串出、非数字串证据闸拦下（负向）', () => {
    /* 数字串：出剥引号 action（marker 覆盖 "number_of_shards" 全串，1 基 12..30） */
    const m1 = fakeModel('{"index": {"number_of_shards": "3"}}');
    caps.markers = [markerAt(12, 30)];
    recordDslLintMarkers(URI_STR, [entry(12, 30, 'settings-value', '设置 index.number_of_shards 收到非数值「3」：该键要求整数，ES 会拒绝请求（400）')]);
    const a1 = dslProvider().provideCodeActions(m1, RANGE).actions[0];
    expect(a1.title).toBe('剥引号改为数字 3');
    expect(a1.edit.edits[0].textEdit.text).toBe('3');

    /* 非数字串：剥引号成不了数字，零 action 防越修越坏 */
    caps.markers = [markerAt(12, 30)];
    recordDslLintMarkers(URI_STR, [entry(12, 30, 'settings-value', '设置 index.number_of_shards 收到非数值「abc」：该键要求整数，ES 会拒绝请求（400）')]);
    expect(dslProvider().provideCodeActions(fakeModel('{"index": {"number_of_shards": "abc"}}'), RANGE).actions).toEqual([]);
  });
});

describe('B 负向：二义/建议类零 action', () => {
  it('agg-interval-key（日历 vs 固定二义）与 match-all/deep-paging 等建议类零 action', () => {
    /* 558 批同步更新注记（557 root-bare-clause 先例同款）：废弃 interval 分支已修订出
       「interval 改为 calendar_interval」改名 action（正样移 hintWave558 A 段），本行
       保留转证据闸负样——样例文档 '{"anchor": {}}' 无 '"interval"' 字面，验证改名分支
       的宁缺勿错闸（字面不在场零 action），规则级「废弃 interval 零 action」旧钉废止。 */
    const advisory: [string, string][] = [
      ['agg-interval-key', 'date_histogram 使用已废弃的 "interval" 键：ES 7.2 起拆分为 calendar_interval / fixed_interval'],
      ['match-all', 'match_all 全量扫描：不设任何过滤条件会遍历全索引'],
      ['deep-paging', '深分页：from + size = 20000，超出 index.max_result_window 默认 10000'],
      ['search-after-no-sort', 'search_after 必须配合 sort 使用：无排序上下文时 ES 直接拒绝请求（400）'],
      ['missing-filter', 'must 里全是不需要打分的条件'],
      ['agg-size-default', 'terms 聚合未写 size：默认只返回 10 桶'],
      ['highlight-fields', 'highlight 缺 fields：不指定高亮字段会被 ES 拒绝或整卡零高亮'],
      ['nested-path', 'nested 缺 path：不指定嵌套路径 ES 直接拒绝请求（400）'],
      ['query-structure', 'query 必须是对象形态：收到标量「term」'],
      ['root-bare-clause', '子句「term」裸在根层：需包在 query 里'],
      ['unknown-field', '字段「userr」不在当前索引 mapping 中（最接近：user）'],
      ['prefix-wildcard', '前缀通配符：无法利用倒排索引，等于全表扫描'],
      ['huge-size', '超大 size：单次取 2000 条，内存与传输开销大'],
    ];
    for (const [rule, message] of advisory) {
      const model = fakeModel('{"anchor": {}}');
      caps.markers = [markerAt(2, 9)];
      recordDslLintMarkers(URI_STR, [entry(2, 9, rule, message)]);
      const acts = dslProvider().provideCodeActions(model, RANGE).actions;
      expect(acts.map((a: any) => a.title), `${rule} 必须零 action`).toEqual([]);
    }
  });

  it('改名类候选拆不出「最接近：」时零 action（宁缺勿错）', () => {
    const model = fakeModel('{"bool": {"shoud": []}}');
    caps.markers = [markerAt(11, 18)];
    recordDslLintMarkers(URI_STR, [entry(11, 18, 'bool-key-typo', 'bool 组键「shoud」拼写存疑')]);
    expect(dslProvider().provideCodeActions(model, RANGE).actions).toEqual([]);
  });
});

describe('C 注册表随 setMarkers 语义同步', () => {
  it('全量替换不叠加：重 lint 清空即零 action、换规则即只出新 action；clearDslLintMarkers 清理', () => {
    const model = fakeModel('{"bool": {"shoud": []}}');
    caps.markers = [markerAt(11, 18)];
    recordDslLintMarkers(URI_STR, [entry(11, 18, 'bool-key-typo', 'bool 组键「shoud」疑似拼写错误（最接近：should）——…')]);
    expect(dslProvider().provideCodeActions(model, RANGE).actions.length).toBe(1);
    /* 重复 lint：fix 后重 lint 零 finding → setMarkers([]) → 注册表全量替换为空，零 action 不叠加 */
    recordDslLintMarkers(URI_STR, []);
    expect(dslProvider().provideCodeActions(model, RANGE).actions.length).toBe(0);
    /* 再 lint 命中别的规则：只出新规则的 action（旧条目不残留） */
    recordDslLintMarkers(URI_STR, [entry(11, 18, 'root-key-typo', '根级键「shoud」疑似拼写错误（最接近：should）——…')]);
    const acts = dslProvider().provideCodeActions(model, RANGE).actions;
    expect(acts.length).toBe(1);
    expect(acts[0].title).toBe('键改为「should」');
    /* 实例卸载清理通道 */
    clearDslLintMarkers(URI_STR);
    expect(dslProvider().provideCodeActions(model, RANGE).actions.length).toBe(0);
  });

  it('注册表缺席时 marker.code 后缀兜底（跨实例/跨 uri 防漏）', () => {
    const model = fakeModel('{"bool": {"shoud": []}}');
    caps.markers = [markerAt(11, 18, { code: { value: 'es-dsl-lint:bool-key-typo' } })];
    /* 不写注册表：靠 code 后缀拿规则名；消息回落 marker.message */
    caps.markers[0].message = 'bool 组键「shoud」疑似拼写错误（最接近：should）——…';
    const acts = dslProvider().provideCodeActions(model, RANGE).actions;
    expect(acts.map((a: any) => a.title)).toEqual(['键改为「should」']);
  });
});

describe('D 既有 json 四码链路零触碰', () => {
  it('注册面：json 与 es-dsl-lint 各一份、两函数幂等；json 过滤面 owner=json 528 行为不变', () => {
    expect(caps.calls).toEqual(['json', 'json']);
    expect(caps.providers.length).toBe(2);
    const jsonProvider = caps.providers[0];
    caps.markers = [{
      owner: 'json', startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 7,
      message: 'Property keys must be doublequoted', severity: 8, code: '528',
    }];
    const model = fakeModel('{match: 1}');
    const list = jsonProvider.provideCodeActions(model, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 30 });
    expect(caps.filter).toEqual({ resource: URI, owner: 'json' });
    expect(list.actions[0].title).toBe('键加双引号');
  });

  it('es-dsl-lint provider 只查 owner=es-dsl-lint 的 marker（与 json 面互不串扰）', () => {
    caps.markers = [{ owner: 'json', startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 9, message: 'x', severity: 8 }];
    const model = fakeModel('{"bool": {"shoud": []}}');
    expect(dslProvider().provideCodeActions(model, RANGE).actions).toEqual([]);
    expect(caps.filter).toEqual({ resource: URI, owner: 'es-dsl-lint' });
  });
});

describe('E MonacoEditor / JsonArea 契约同步更新源锚', () => {
  it('MonacoEditor setMarkers：marker code 前缀 + 注册表随写/卸载清理 + 泛型补 rule 可选', () => {
    const me = read('components/MonacoEditor.vue');
    expect(me).toContain("code: { value: LINT_OWNER + ':' + (f.rule ?? ''), target: model.uri },");
    expect(me).toContain("recordDslLintMarkers(model.uri?.toString?.() ?? '', registry);");
    expect(me).toContain('clearDslLintMarkers(m.uri?.toString?.()');
    expect(me).toContain('ensureDslLintQuickFixes();');
    expect(me).toContain('rule?: string;');
  });

  it('JsonArea MarkerFinding 类型同步更新：rule 可选（15+ 消费点签名不变）', () => {
    const ja = read('components/JsonArea.vue');
    expect(ja).toContain('nth: number; rule?: string };');
  });
});
