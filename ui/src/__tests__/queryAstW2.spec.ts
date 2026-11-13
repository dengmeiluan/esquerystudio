/* W2：sort/_source/highlight/aggs 往返无损（形态记忆）。契约同 W1：serialize(parse(x)) 深度相等。 */
import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree } from '../utils/queryAst';

const roundTrip = (name: string, dsl: any) => {
  it(name, () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
};

describe('queryAst W2 周边子句往返', () => {
  roundTrip('sort 字符串形态', { sort: ['a'] });
  roundTrip('sort 简写形态', { sort: [{ a: 'desc' }] });
  roundTrip('sort 完整体带参数', { sort: [{ a: { order: 'desc', missing: '_last', unmapped_type: 'long' } }] });
  roundTrip('sort 完整体无 order 键', { sort: [{ a: { missing: '_last' } }] });
  roundTrip('sort 混合形态', { sort: ['a', { b: 'desc' }, { c: { order: 'asc' } }] });
  roundTrip('sort 空数组保键', { query: { match_all: {} }, sort: [] });
  roundTrip('sort 非法简写值原样', { sort: [{ a: 'bogus' }] });
  roundTrip('_source true/false', { _source: false });
  roundTrip('_source 单字符串', { _source: 'title' });
  roundTrip('_source 数组', { _source: ['a', 'b'] });
  roundTrip('_source includes/excludes', { _source: { includes: ['a.*'], excludes: ['b'] } });
  roundTrip('_source 只 excludes', { _source: { excludes: ['b'] } });
  roundTrip('_source 空对象', { _source: {} });
  roundTrip('highlight 字段+全局参数', { highlight: { fields: { title: {}, content: { fragment_size: 20 } }, pre_tags: ['<em>'], post_tags: ['</em>'] } });
  roundTrip('aggs 单层 terms', { aggs: { by_status: { terms: { field: 'status', size: 10 } } } });
  roundTrip('aggs 嵌套子聚合', { aggs: { by_day: { date_histogram: { field: 'd', calendar_interval: 'day' } }, aggs: { avg_p: { avg: { field: 'p' } } } } });
  roundTrip('aggs 带 meta', { aggs: { g: { terms: { field: 'a' }, meta: { note: 'x' } } } });
  roundTrip('aggregations 键名记忆', { aggregations: { g: { value_count: { field: 'a' } } } });
  roundTrip('嵌套层 aggregations 键名记忆', { aggs: { g: { terms: { field: 'a' }, aggregations: { sub: { max: { field: 'b' } } } } } });
  roundTrip('size/from 与周边共存', { query: { bool: { must: [{ term: { a: 1 } }] } }, size: 20, from: 0, sort: [{ d: 'desc' }], _source: ['a'], aggs: { g: { terms: { field: 'a' } } }, highlight: { fields: { a: {} } } });

  it('非数组 sort 落 extras 保留', () => {
    const r = parseTree({ sort: 'a' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.sort).toBeNull();
    expect(r.tree.extras.sort).toBe('a');
    expect(serializeTree(r.tree)).toEqual({ sort: 'a' });
  });

  it('非对象 highlight 落 extras', () => {
    const r = parseTree({ highlight: null });
    expect(r.ok && serializeTree(r.tree)).toEqual({ highlight: null });
  });

  roundTrip('_source true 显式', { _source: true });
  roundTrip('_source includes 空数组保键', { _source: { includes: [] } });
  roundTrip('_source excludes 空数组保键', { _source: { excludes: [] } });
  roundTrip('aggs 空 meta 保键', { aggs: { g: { terms: { field: 'a' }, meta: {} } } });
  roundTrip('aggs 空子聚合键保键', { aggs: { g: { terms: { field: 'a' }, aggregations: {} } } });
  roundTrip('aggs 纯 meta 无 op', { aggs: { g: { meta: {} } } });
  roundTrip('aggs 空对象保键', { aggs: {} });
  roundTrip('highlight 空 fields 保键', { highlight: { fields: {} } });

  it('sort str 形态加参数后升级 full 输出（字段名不丢）', () => {
    const r = parseTree({ sort: ['a'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    r.tree.sort![0].params.order = 'desc';   // 模拟 UI 编辑
    expect(serializeTree(r.tree)).toEqual({ sort: [{ a: { order: 'desc' } }] });
  });
});
