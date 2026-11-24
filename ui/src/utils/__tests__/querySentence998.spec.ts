/* 998 批：查询语句摘要（纯函数）契约。
   覆盖四类语义：词项形态 / 逻辑连接（且·或·非）/ 容器嵌套 / 检索级元信息。
   断言用 sentenceText（去多余空白的纯文本），避免逐片断锁死排版细节。 */
import { describe, it, expect } from 'vitest';
import { buildQuerySentence, sentenceText, briefValue, nodeParts } from '../querySentence';
import { parseTree, type QueryTree } from '../queryAst';

function treeOf(dsl: Record<string, unknown>): QueryTree {
  const r = parseTree(dsl);
  if (!r.ok) throw new Error(r.reason);
  return r.tree;
}
const say = (dsl: Record<string, unknown>) => sentenceText(buildQuerySentence(treeOf(dsl)).query);

describe('998 语句摘要 · 词项形态', () => {
  it('term 标量', () => {
    expect(say({ query: { term: { status: 'active' } } })).toBe('status = 「active」');
  });
  it('term 对象形态不改变语义读法', () => {
    expect(say({ query: { term: { status: { value: 'active' } } } })).toBe('status = 「active」');
  });
  it('terms 集合', () => {
    expect(say({ query: { terms: { tag: ['a', 'b'] } } })).toBe('tag ∈ [a, b]');
  });
  it('range 双边（边界用顿号，不与外层「且」混淆）', () => {
    expect(say({ query: { range: { age: { gte: 10, lte: 20 } } } })).toBe('age ≥ 10、≤ 20');
  });
  it('range 单边 + date math', () => {
    expect(say({ query: { range: { ts: { gte: 'now-1d/d' } } } })).toBe('ts ≥ 近1天'); /* 1044：date-math 人话化随迁 */
  });
  it('exists', () => {
    expect(say({ query: { exists: { field: 'user' } } })).toBe('user 存在');
  });
  it('match 全文', () => {
    expect(say({ query: { match: { title: 'hello world' } } })).toBe('title 包含 「hello world」');
  });
  it('multi_match 报字段数', () => {
    expect(say({ query: { multi_match: { query: 'x', fields: ['a', 'b', 'c'] } } })).toBe('3 个字段 包含 「x」');
  });
  it('match_all / match_none', () => {
    expect(say({ query: { match_all: {} } })).toBe('全部文档');
    expect(say({ query: { match_none: {} } })).toBe('不匹配任何文档');
  });
  it('未知算子走自定义占位（不吞）', () => {
    const s = say({ query: { my_custom_op: { a: 1 } } });
    expect(s.startsWith('自定义')).toBe(true);
    expect(s).toContain('my_custom_op');
  });
});

describe('998 语句摘要 · 逻辑连接', () => {
  it('must 用「且」', () => {
    expect(say({ query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }] } } })).toBe('a = 「1」 且 b = 「2」');
  });
  it('should 多分支整体加括号（避免 A 且 B 或 C 的歧义）', () => {
    expect(say({
      query: { bool: { must: [{ term: { a: 1 } }], should: [{ term: { b: 2 } }, { term: { c: 3 } }] } },
    })).toBe('a = 「1」 且 （b = 「2」 或 c = 「3」）');
  });
  it('must_not 用「非」', () => {
    expect(say({ query: { bool: { must: [{ term: { a: 1 } }], must_not: [{ exists: { field: 'x' } }] } } }))
      .toBe('a = 「1」 且 非 x 存在');
  });
  it('must + filter 合并为「且」', () => {
    expect(say({ query: { bool: { must: [{ term: { a: 1 } }], filter: [{ term: { b: 2 } }] } } }))
      .toBe('a = 「1」 且 b = 「2」');
  });
  it('空 bool 组给「空条件组」而非空白', () => {
    expect(say({ query: { bool: {} } })).toBe('空条件组');
  });
  it('嵌套 bool：含 or/not 的子组在 AND 语境加括号', () => {
    const s = say({
      query: {
        bool: {
          must: [
            { term: { a: 1 } },
            { bool: { should: [{ term: { b: 2 } }, { term: { c: 3 } }] } },
          ],
        },
      },
    });
    expect(s).toBe('a = 「1」 且 （b = 「2」 或 c = 「3」）');
  });
});

describe('998 语句摘要 · 容器', () => {
  it('nested 带路由字段', () => {
    const s = say({ query: { nested: { path: 'comments', query: { term: { 'comments.author': 'x' } } } } });
    expect(s).toContain('嵌套');
    expect(s).toContain('comments');
    expect(s).toContain('comments.author = 「x」');
  });
  it('has_child 带类型', () => {
    const s = say({ query: { has_child: { type: 'answer', query: { term: { a: 1 } } } } });
    expect(s).toBe('子文档 answer（a = 「1」）');
  });
  it('boosting 双分区', () => {
    const s = say({ query: { boosting: { positive: { term: { a: 1 } }, negative: { term: { b: 2 } } } } });
    expect(s).toContain('正负加权');
    expect(s).toContain('a = 「1」');
    expect(s).toContain('b = 「2」');
  });
  it('bool 在 wrap 里作为子查询', () => {
    const s = say({ query: { constant_score: { filter: { bool: { must: [{ term: { a: 1 } }] } } } } });
    expect(s).toBe('恒定评分（a = 「1」）');
  });
});

describe('998 语句摘要 · 检索级元信息', () => {
  it('size/sort/aggs 进 meta 行', () => {
    const { meta } = buildQuerySentence(treeOf({
      query: { match_all: {} }, size: 20, sort: [{ ts: 'desc' }],
      aggs: { by_tag: { terms: { field: 'tag' } } },
    }));
    const t = sentenceText(meta);
    expect(t).toContain('取 20 条');
    expect(t).toContain('排序 ts ↓');
    expect(t).toContain('1 个聚合');
  });
  it('查询参数（search_after/pit）进 meta 行', () => {
    const { meta } = buildQuerySentence(treeOf({
      query: { match_all: {} }, search_after: [1], pit: { id: 'x', keep_alive: '1m' }, min_score: 0.4,
    }));
    const t = sentenceText(meta);
    expect(t).toContain('游标翻页');
    expect(t).toContain('PIT 快照');
    expect(t).toContain('最低分 0.4');
  });
  it('无 query 时 query 片段为空（不渲染语句条）', () => {
    expect(buildQuerySentence(treeOf({ size: 10 })).query).toEqual([]);
  });
});

describe('998 语句摘要 · 片段可定位', () => {
  it('叶子片段带 nodeId', () => {
    const t = treeOf({ query: { term: { status: 'active' } } });
    const parts = nodeParts(t.root!);
    expect(parts.every(p => p.nodeId === t.root!.id)).toBe(true);
  });
  it('briefValue 截断与形态', () => {
    expect(briefValue('abcdefghij', 5)).toBe('abcd…');
    expect(briefValue([1, 2])).toBe('[1, 2]');
    expect(briefValue({ a: 1 })).toBe('{"a":1}');
    expect(briefValue(null)).toBe('null');
  });
});
