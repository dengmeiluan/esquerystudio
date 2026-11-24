/**
 * 1439：聚合字段键拼写（agg-field-key-typo）。
 *
 * 例：{"aggs":{"a":{"terms":{"filed":"x"}}}}、nested 聚合的 "pth"——ES 不认这些键，
 * 聚合要么直接 400，要么「问不到字段」产出空桶。此前字段键（field/path）没有任何拼写提示。
 *
 * 反向普查（合法输入必须静默）：官方聚合体键齐全的真实体 → 零 finding；
 * 查询侧 nested 不走本规则（body-key-typo 负责）；彻底陌生键不报。
 */
import { describe, it, expect } from 'vitest';
import { lintDsl } from '../utils/dslLint';

const aggFieldTypos = (obj: unknown) =>
  lintDsl(obj as any).filter((f: any) => f.rule === 'agg-field-key-typo');

describe('1439 聚合字段键拼写', () => {
  it('反向普查：官方体键齐全的聚合体必须零 finding', () => {
    const legit = [
      { aggs: { a: { terms: { field: 'region', size: 10, order: { _count: 'desc' }, min_doc_count: 1, missing: 'N/A' } } } },
      { aggs: { a: { date_histogram: { field: 'ts', calendar_interval: 'month', time_zone: '+08:00', format: 'yyyy-MM', min_doc_count: 0 } } } },
      { aggs: { a: { histogram: { field: 'score', interval: 10, offset: 5, keyed: false } } } },
      { aggs: { a: { range: { field: 'amount', ranges: [{ to: 100 }, { from: 100 }], keyed: true } } } },
      { aggs: { a: { date_range: { field: 'ts', ranges: [{ to: 'now-1y' }], format: 'yyyy-MM-dd' } } } },
      { aggs: { a: { percentiles: { field: 'amount', percents: [50, 95], keyed: true } } } },
      { aggs: { a: { significant_terms: { field: 'issuer', size: 5, background_filter: { match_all: {} } } } } },
      { aggs: { a: { geo_bounds: { field: 'location', wrap_longitude: true } } } },
      { aggs: { a: { median_absolute_deviation: { field: 'amount', compression: 100 } } } },
      { aggs: { a: { nested: { path: 'comments' }, aggs: { b: { reverse_nested: { path: 'post' } } } } } },
      { aggs: { a: { missing: { field: 'region' } } } },
      /* top_hits/scripted_metric 不是 field 型聚合——体里的自定义键不该被本条判 */
      { aggs: { a: { top_hits: { size: 3, _source: ['title'], sort: [{ ts: 'desc' }] } } } },
      { aggs: { a: { scripted_metric: { init_script: 'state.x = 0', map_script: 'x', combine_script: 'x', reduce_script: 'x' } } } },
    ];
    for (const dsl of legit) {
      expect(aggFieldTypos(dsl), JSON.stringify(dsl)).toEqual([]);
    }
  });

  it('filed / pth 等拼写错被点名并给出目标键', () => {
    const cases: Array<[string, unknown, string]> = [
      ['terms.filed', { aggs: { a: { terms: { filed: 'region' } } } }, 'field'],
      ['date_histogram.filed', { aggs: { a: { date_histogram: { filed: 'ts', calendar_interval: '1d' } } } }, 'field'],
      ['range.filed', { aggs: { a: { range: { filed: 'amount', ranges: [] } } } }, 'field'],
      ['nested.pth（聚合）', { aggs: { a: { nested: { pth: 'comments' } } } }, 'path'],
      ['reverse_nested.pth（聚合）', { aggs: { a: { reverse_nested: { pth: 'post' } } } }, 'path'],
      ['terms.fields（多写了 s）', { aggs: { a: { terms: { fields: ['region'] } } } }, 'field'],
    ];
    for (const [name, dsl, near] of cases) {
      const fs = aggFieldTypos(dsl);
      expect(fs.length, name).toBe(1);
      expect(fs[0].message, name).toContain(near);
      expect(fs[0].severity).toBe('warning');
    }
  });

  it('查询侧 nested 不归本规则（由 body-key-typo 负责）', () => {
    const queryNested = { query: { nested: { pth: 'comments', query: { match_all: {} } } } };
    expect(aggFieldTypos(queryNested)).toEqual([]);
  });

  it('未知插件键（编辑距离 >2）不报', () => {
    const dsl = { aggs: { a: { terms: { field: 'region', vendor_extension_xyz: 1 } } } };
    expect(aggFieldTypos(dsl)).toEqual([]);
  });

  it('负控：同一判据喂正确字段键必须是空（证明零 finding 不是探针失灵）', () => {
    expect(aggFieldTypos({ aggs: { a: { terms: { field: 'region' } } } })).toEqual([]);
    expect(aggFieldTypos({ aggs: { a: { terms: { filed: 'region' } } } }).length).toBe(1);
  });
});
