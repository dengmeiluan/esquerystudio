/**
 * 1439：查询子句体键拼写（body-key-typo）。
 *
 * 例：{"query":{"nested":{"qurey":…}}}、has_child 的 "scor_mode"——ES 不认这些键，
 * 要么静默忽略条件（查询「看似对但条件没生效」），要么直接 400。此前只有 bool 体
 * 与聚合类型有拼写提示，其余子句体全靠人肉发现。
 *
 * 反向普查（合法输入必须静默）：
 * ① 官方体键齐全的真实子句 → 零 finding；
 * ② aggs 下的同名聚合体（nested 聚合只有 path）不在查询语境 → 不判；
 * ③ 彻底陌生的插件键（编辑距离 >2）→ 不报，宁缺勿错。
 */
import { describe, it, expect } from 'vitest';
import { lintDsl } from '../utils/dslLint';

const bodyTypos = (obj: unknown) =>
  lintDsl(obj as any).filter((f: any) => f.rule === 'body-key-typo');

describe('1439 查询子句体键拼写', () => {
  it('反向普查：官方体键齐全的真实子句必须零 finding', () => {
    const legit = [
      { query: { nested: { path: 'comments', query: { match_all: {} }, score_mode: 'avg', ignore_unmapped: true, inner_hits: {} } } },
      { query: { has_child: { type: 'reply', query: { match_all: {} }, min_children: 1, max_children: 3, score_mode: 'max', ignore_unmapped: false } } },
      { query: { has_parent: { parent_type: 'post', query: { match_all: {} }, score_mode: 'score' } } },
      { query: { multi_match: { query: 'x', fields: ['title'], type: 'best_fields', operator: 'and', minimum_should_match: '50%', tie_breaker: 0.3, boost: 2 } } },
      { query: { query_string: { query: 'a', default_field: 'title', fields: ['b'], phrase_slop: 2, analyze_wildcard: true, allow_leading_wildcard: false } } },
      { query: { simple_query_string: { query: '+a -b', fields: ['title'], default_operator: 'and', flags: 'AND|OR' } } },
      { query: { span_near: { clauses: [{ span_term: { title: 'a' } }, { span_term: { title: 'b' } }], slop: 2, in_order: true } } },
      { query: { constant_score: { filter: { term: { a: 1 } }, boost: 2 } } },
      { query: { dis_max: { queries: [{ match_all: {} }], tie_breaker: 0.7 } } },
      { query: { match_all: { boost: 1, _name: 'all' } } },
      { post_filter: { nested: { path: 'c', query: { match_all: {} } } } },
    ];
    for (const dsl of legit) {
      expect(bodyTypos(dsl), JSON.stringify(dsl)).toEqual([]);
    }
  });

  it('拼写错被点名并给出最接近的键', () => {
    const cases: Array<[string, unknown, string]> = [
      ['nested.qurey', { query: { nested: { qurey: { match_all: {} } } } }, 'query'],
      ['has_child.scor_mode', { query: { has_child: { type: 'c', scor_mode: 'max', query: { match_all: {} } } } }, 'score_mode'],
      ['multi_match.fileds', { query: { multi_match: { query: 'x', fileds: ['a'] } } }, 'fields'],
      ['match_all.boos', { query: { match_all: { boos: 1 } } }, 'boost'],
      ['bool 内的 nested.pth', { query: { bool: { must: [{ nested: { pth: 'c', query: { match_all: {} } } }] } } }, 'path'],
      ['span_near.in_order 拼错', { query: { span_near: { clauses: [], in_ordr: true } } }, 'in_order'],
    ];
    for (const [name, dsl, near] of cases) {
      const fs = bodyTypos(dsl);
      expect(fs.length, name).toBe(1);
      expect(fs[0].message, name).toContain(near);
      expect(fs[0].severity).toBe('warning');
      expect(fs[0].anchor, name).toBeTruthy();
    }
  });

  it('aggs 下的同名聚合体不判（不在查询语境）', () => {
    const dsl = { aggs: { a: { nested: { pth: 'comments' } } } };
    expect(bodyTypos(dsl)).toEqual([]);
  });

  it('未知插件键（编辑距离 >2）不报，宁缺勿错', () => {
    const dsl = { query: { nested: { path: 'c', query: { match_all: {} }, vendor_extension_xyz: 1 } } };
    expect(bodyTypos(dsl)).toEqual([]);
  });

  it('负控：合法样本里代表体若缺键名，探针必须点名', () => {
    /* 同一判据喂一个「拼错」样本：必须产生 finding —— 证明上一条零 finding 不是探针失灵 */
    const bad = { query: { nested: { qurey: {} } } };
    expect(bodyTypos(bad).length).toBeGreaterThan(0);
  });
});
