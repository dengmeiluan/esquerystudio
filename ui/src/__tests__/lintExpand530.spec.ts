/**
 * 五百三十批：dslLint 25→30 五条新规则逐条契约 + ROOT_KEY_WHITELIST 六键 +
 * typePriorityForOp 下沉（ClauseNode 消费同源）。
 *  ① agg-text-field（warning，需 ctx）：聚合 field 打 text 无 .keyword → fielddata 400；
 *  ② body-value-type（error，零 ctx）：根层 from/size 收非数字标量；
 *  ③ agg-interval-key（error，零 ctx）：date_histogram 废弃 interval / 间隔键双缺 / 双键互斥；
 *  ④ nested-path（error，零 ctx）：nested 缺 path；
 *  ⑤ query-structure（error，零 ctx）：根层 query 标量/数组（补 root-bare-clause 盲区）。
 * lintClause（skipRoot）组合：键级规则仍在、根层规则豁免；白名单六键不误报。
 * 纯函数测试，无挂载。
 */
import { describe, it, expect } from 'vitest';
import { lintDsl, lintClause } from '../utils/dslLint';
import { typePriorityForOp } from '../utils/queryAstOps';

const FIELDS = [
  { path: 'title', type: 'text' },
  { path: 'title.keyword', type: 'keyword' },
  { path: 'status', type: 'keyword' },
  { path: 'age', type: 'integer' },
  { path: 'created', type: 'date' },
];
const ctx = { fields: FIELDS };
const rulesOf = (o: unknown, c?: typeof ctx) => lintDsl(o, c).map(f => f.rule);

describe('五百三十批规则①：agg-text-field（聚合 field 打 text，warning 档）', () => {
  it('terms 聚合 field 打 text → warning，anchor=字段名、path 带 .field、建议带 .keyword', () => {
    const fs = lintDsl({ aggs: { g: { terms: { field: 'title', size: 10 } } } }, ctx);
    const f = fs.find(x => x.rule === 'agg-text-field');
    expect(f, '应产出 agg-text-field finding').toBeTruthy();
    expect(f!.severity).toBe('warning');
    expect(f!.anchor).toBe('title');
    expect(f!.path).toBe('aggs.g.terms.field');
    expect(f!.nth).toBe(0);
    expect(f!.suggestion).toContain('title.keyword');
    expect(f!.message).toContain('fielddata');
  });

  it('avg / date_histogram / cardinality 多聚合类型各报（aggregations 双拼写同判）', () => {
    expect(rulesOf({ aggs: { g: { avg: { field: 'title' } } } }, ctx)).toContain('agg-text-field');
    expect(rulesOf({ aggregations: { h: { date_histogram: { field: 'title', calendar_interval: 'month' } } } }, ctx))
      .toContain('agg-text-field');
    expect(rulesOf({ aggs: { c: { cardinality: { field: 'title' } } } }, ctx)).toContain('agg-text-field');
  });

  it('嵌套 aggs 深层聚合体同判（路径仍以 aggs. 开头）', () => {
    const fs = lintDsl({ aggs: { g: { terms: { field: 'status', size: 5 }, aggs: { i: { avg: { field: 'title' } } } } } }, ctx);
    const f = fs.find(x => x.rule === 'agg-text-field')!;
    expect(f, '嵌套聚合体的 text field 应命中').toBeTruthy();
    expect(f.path).toBe('aggs.g.aggs.i.avg.field');
  });

  it('.keyword 子字段豁免；keyword/integer 等非 text 类型聚合不报', () => {
    const none = (o: unknown) => lintDsl(o, ctx).filter(x => x.rule === 'agg-text-field');
    expect(none({ aggs: { g: { terms: { field: 'title.keyword', size: 10 } } } })).toHaveLength(0);
    expect(none({ aggs: { g: { terms: { field: 'status', size: 10 } } } })).toHaveLength(0);
    expect(none({ aggs: { g: { avg: { field: 'age' } } } })).toHaveLength(0);
  });

  it('query 下的 terms 子句（非聚合路径）不判；不传 ctx 全哑（零回归）', () => {
    expect(rulesOf({ query: { terms: { title: ['a'] } } }, ctx)).not.toContain('agg-text-field');
    expect(rulesOf({ aggs: { g: { terms: { field: 'title', size: 10 } } } })).not.toContain('agg-text-field');
  });

  it('nth 与文本出现序对齐：字段先作查询键、后作聚合 field 串 → nth=1', () => {
    const fs = lintDsl({ query: { term: { title: 'x' } }, aggs: { g: { avg: { field: 'title' } } } }, ctx);
    const f = fs.find(x => x.rule === 'agg-text-field')!;
    expect(f.nth).toBe(1);
  });
});

describe('五百三十批规则②：body-value-type（根层 from/size 非数字标量，error 档）', () => {
  it('size 写串 → error，anchor=size', () => {
    const fs = lintDsl({ query: { term: { status: 'A' } }, size: '10' });
    const f = fs.find(x => x.rule === 'body-value-type');
    expect(f, '串值 size 应命中').toBeTruthy();
    expect(f!.severity).toBe('error');
    expect(f!.anchor).toBe('size');
    expect(f!.path).toBe('size');
    expect(f!.message).toContain('size');
  });

  it('from 写串同样报；anchor/nth 各归各键', () => {
    const fs = lintDsl({ from: '5', size: 10 });
    const f = fs.find(x => x.rule === 'body-value-type')!;
    expect(f.anchor).toBe('from');
    expect(f.message).toContain('from');
  });

  it('布尔值也是非数字标量（非数字标量判定域内）', () => {
    expect(rulesOf({ size: true })).toContain('body-value-type');
  });

  it('数字值（含 0）零误报', () => {
    expect(rulesOf({ from: 0, size: 10 })).not.toContain('body-value-type');
  });
});

describe('五百三十批规则③：agg-interval-key（date_histogram 间隔键，error 档）', () => {
  it('废弃 interval 键 → error，anchor=date_histogram', () => {
    const fs = lintDsl({ aggs: { h: { date_histogram: { field: 'created', interval: '1h' } } } });
    const f = fs.find(x => x.rule === 'agg-interval-key');
    expect(f, '废弃 interval 应命中').toBeTruthy();
    expect(f!.severity).toBe('error');
    expect(f!.anchor).toBe('date_histogram');
    expect(f!.message).toContain('interval');
    expect(f!.suggestion).toContain('calendar_interval');
  });

  it('calendar_interval / fixed_interval 双缺 → error', () => {
    const fs = lintDsl({ aggs: { h: { date_histogram: { field: 'created' } } } });
    const f = fs.find(x => x.rule === 'agg-interval-key')!;
    expect(f, '双缺应命中').toBeTruthy();
    expect(f.severity).toBe('error');
    expect(f.suggestion).toContain('fixed_interval');
  });

  it('calendar_interval 与 fixed_interval 双键并存（互斥）→ error', () => {
    const fs = lintDsl({ aggs: { h: { date_histogram: { field: 'created', calendar_interval: 'month', fixed_interval: '1h' } } } });
    const f = fs.find(x => x.rule === 'agg-interval-key')!;
    expect(f, '双键互斥应命中').toBeTruthy();
    expect(f.message).toContain('互斥');
  });

  it('fixed_interval / calendar_interval 单键合法形态零误报；histogram 的 interval 合法不进判定域', () => {
    expect(rulesOf({ aggs: { h: { date_histogram: { field: 'created', fixed_interval: '1h' } } } }))
      .not.toContain('agg-interval-key');
    expect(rulesOf({ aggs: { h: { date_histogram: { field: 'created', calendar_interval: 'month' } } } }))
      .not.toContain('agg-interval-key');
    expect(rulesOf({ aggs: { g: { histogram: { field: 'age', interval: 10 } } } }))
      .not.toContain('agg-interval-key');
  });
});

describe('五百三十批规则④：nested-path（nested 缺 path，error 档）', () => {
  it('query 内 nested 缺 path → error，anchor=nested', () => {
    const fs = lintDsl({ query: { nested: { must: { term: { 'a.b': 1 } } } } });
    const f = fs.find(x => x.rule === 'nested-path');
    expect(f, '缺 path 应命中').toBeTruthy();
    expect(f!.severity).toBe('error');
    expect(f!.anchor).toBe('nested');
    expect(f!.path).toBe('query.nested');
    expect(f!.suggestion).toContain('path');
  });

  it('aggs 下 nested 聚合缺 path 同判；bool 深层嵌套同判', () => {
    expect(rulesOf({ aggs: { n: { nested: { aggs: { x: { terms: { field: 'status', size: 1 } } } } } } }))
      .toContain('nested-path');
    expect(rulesOf({ query: { bool: { must: [{ nested: { query: { match_all: {} } } }] } } }))
      .toContain('nested-path');
  });

  it('带 path 的 query 形态 / 聚合形态零误报', () => {
    expect(rulesOf({ query: { nested: { path: 'orders', query: { term: { c: 1 } } } } }))
      .not.toContain('nested-path');
    expect(rulesOf({ aggs: { n: { nested: { path: 'orders', aggs: { i: { terms: { field: 'status', size: 1 } } } } } } }))
      .not.toContain('nested-path');
  });
});

describe('五百三十批规则⑤：query-structure（根层 query 标量/数组，error 档）', () => {
  it('query 写标量串 → error，anchor=query', () => {
    const fs = lintDsl({ query: 'term' });
    const f = fs.find(x => x.rule === 'query-structure');
    expect(f, '标量 query 应命中').toBeTruthy();
    expect(f!.severity).toBe('error');
    expect(f!.anchor).toBe('query');
    expect(f!.message).toContain('对象');
  });

  it('query 写数组 / 数字同样报（补 root-bare-clause 只查裸子句键的盲区）', () => {
    expect(rulesOf({ query: [{ term: { a: 1 } }] })).toContain('query-structure');
    expect(rulesOf({ query: 123 })).toContain('query-structure');
    /* 对照：根层裸子句键走 root-bare-clause，两条规则判定域互补不重叠 */
    expect(rulesOf({ term: { a: 1 } })).not.toContain('query-structure');
  });

  it('正常对象 query（term / bool 组合）零误报，match-all 形态不受扰', () => {
    expect(rulesOf({ query: { term: { a: 1 } } })).not.toContain('query-structure');
    expect(rulesOf({ query: { bool: { must: [] } } })).not.toContain('query-structure');
    expect(rulesOf({ query: { match_all: {} } })).not.toContain('query-structure');
  });
});

describe('五百三十批：lintClause（skipRoot）与新规则组合', () => {
  it('skipRoot 下键级规则仍在：agg-text-field / agg-interval-key / nested-path 照报', () => {
    /* 聚合片段输入带 aggs 外壳（真实片段形态），路径前缀判定不受 skipRoot 影响 */
    expect(lintClause({ aggs: { g: { avg: { field: 'title' } } } }, ctx).map(f => f.rule))
      .toContain('agg-text-field');
    expect(lintClause({ date_histogram: { field: 'created', interval: '1d' } }).map(f => f.rule))
      .toContain('agg-interval-key');
    expect(lintClause({ nested: { must: {} } }).map(f => f.rule)).toContain('nested-path');
  });

  it('skipRoot 下根层规则豁免：body-value-type / query-structure 不误伤子句输入', () => {
    expect(lintClause({ query: 'x', size: '10' }).map(f => f.rule))
      .not.toContain('query-structure');
    expect(lintClause({ query: 'x', size: '10' }).map(f => f.rule))
      .not.toContain('body-value-type');
  });
});

describe('五百三十批：ROOT_KEY_WHITELIST 补六键（root-key-typo 不误报）', () => {
  it('pit / runtime_mappings / preference / routing / ext / stats 六键各不报', () => {
    const docs: Record<string, unknown>[] = [
      { pit: { id: 'xxx', keep_alive: '1m' } },
      { runtime_mappings: { double_age: { type: 'long', script: { source: '1' } } } },
      { preference: '_local' },
      { routing: 'user1' },
      { ext: {} },
      { stats: ['group1'] },
    ];
    for (const d of docs) {
      expect(rulesOf(d), JSON.stringify(d)).not.toContain('root-key-typo');
    }
  });

  it('白名单未放松：拼错根键照报（frm→from）', () => {
    expect(rulesOf({ frm: 10, size: 10 })).toContain('root-key-typo');
  });
});

describe('五百三十批：typePriorityForOp 下沉（ClauseNode 消费同源）', () => {
  it('term/terms/prefix/wildcard → keyword 优先；range → date+数值族', () => {
    expect(typePriorityForOp('term')).toEqual(['keyword']);
    expect(typePriorityForOp('terms')).toEqual(['keyword']);
    expect(typePriorityForOp('prefix')).toEqual(['keyword']);
    expect(typePriorityForOp('wildcard')).toEqual(['keyword']);
    expect(typePriorityForOp('range'))
      /* 五百四十五批同步更新：数值族九口径对齐（531 备案 unsigned_long 补员，queryAstOps NUM
         与本表同源九种；轨1 dslValueTiers545 约定，排序链 range/ORDER BY 随之置顶）
         548 锁同步更新：序补 date_nanos（紧跟 date，opsForType date 分支并档同批）；原契约意图
         保持——date 族置顶、数值族相对次序零变动 */
      .toEqual(['date', 'date_nanos', 'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'unsigned_long']);
  });

  it('match 系 → text+keyword；其余算子/未知算子 → 空数组', () => {
    expect(typePriorityForOp('match')).toEqual(['text', 'keyword']);
    expect(typePriorityForOp('match_phrase')).toEqual(['text', 'keyword']);
    expect(typePriorityForOp('multi_match')).toEqual(['text', 'keyword']);
    expect(typePriorityForOp('query_string')).toEqual(['text', 'keyword']);
    expect(typePriorityForOp('exists')).toEqual([]);
    /* 535 批 R4 同步更新：fuzzy 由 [] 改新档 ['keyword','text']（与 OPS_META.types 对齐；
       ClauseNode 值候选档 includes('keyword') 随之放行，历史值 datalist 白得） */
    expect(typePriorityForOp('fuzzy')).toEqual(['keyword', 'text']);
    expect(typePriorityForOp('regexp')).toEqual(['keyword', 'text']);
    expect(typePriorityForOp('no_such_op')).toEqual([]);
  });

  /* 535 批 R4：match_phrase_prefix 补档同步更新（并入 match 系 → ['text','keyword']） */
  it('match_phrase_prefix → text+keyword（535 补档）', () => {
    expect(typePriorityForOp('match_phrase_prefix')).toEqual(['text', 'keyword']);
  });
});
