/* 1030 批：查询算子注册表全量收官两员（type = 7.x 遗留映射类型过滤 / template = 搜索模板
   查询）+ 聚合建议表全量补齐（管道族 / 地理网格族 / 杂项桶与度量族）+ 管道族具名参数
   schema（buckets_path/gap_policy 升类型化输入）。往返无损契约与 985/987 同构：
   两员都是 none 形态（主值直接挂 body），parse/ser 零 AST 改动、注册即得富表单。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTree, serializeTree, makeNodeByOp, serQueryNode } from '../utils/queryAst';
import type { LeafNode } from '../utils/queryAst';
import { OPS_META, ADV_MENU, labelOfOp, AGG_OPS, AGG_BODY_PARAMS } from '../utils/queryAstOps';

const roundTrip = (name: string, dsl: any) => {
  it(name, () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
};

const srcOf = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

describe('1030 查询算子全量收官（type/template）', () => {
  it('两员注册且有中文标签', () => {
    for (const op of ['type', 'template']) {
      expect(OPS_META[op], op).toBeDefined();
      expect(labelOfOp(op), op + ' 中文标签').not.toBe(op);
    }
  });
  it('ADV_MENU 分组可达：type 在精确与集合 / template 在脚本与其他', () => {
    const groups = Object.fromEntries(ADV_MENU.map(g => [g.group, g.ops]));
    expect(groups['精确与集合']).toContain('type');
    expect(groups['脚本与其他']).toContain('template');
  });
  it('none 形态契约：mainKey 必备（985 注册表契约同款）', () => {
    expect(OPS_META.type!.form).toBe('none');
    expect(OPS_META.type!.mainKey).toBe('value');
    expect(OPS_META.template!.form).toBe('none');
    expect(OPS_META.template!.mainKey).toBe('id');
  });
  roundTrip('type 标量简写', { query: { type: { value: '_doc' } } });
  roundTrip('type 带 boost', { query: { type: { value: 'logs', boost: 1.5 } } });
  roundTrip('template id + params', { query: { template: { id: 'tpl-1', params: { size: 10, q: '债券' } } } });
  roundTrip('template name 形态（id 缺席落 params 保真）', { query: { template: { name: 'tpl-x' } } });
  roundTrip('bool 内嵌两员往返', { query: { bool: { must: [{ type: { value: '_doc' } }, { template: { id: 't' } }] } } });
  it('工厂形态：field null + 标量空串初值', () => {
    for (const op of ['type', 'template']) {
      const n = makeNodeByOp(op) as LeafNode;
      expect(n.type).toBe('leaf');
      expect(n.field, op).toBeNull();
      expect(n.value, op).toBe('');
    }
  });
  it('工厂×序列化一致（none 形态主值直挂）', () => {
    expect(serQueryNode(makeNodeByOp('type'))).toEqual({ type: { value: '' } });
    expect(serQueryNode(makeNodeByOp('template'))).toEqual({ template: { id: '' } });
  });
});

describe('1030 聚合建议表全量补齐', () => {
  it('管道族十四员在册', () => {
    for (const op of ['bucket_script', 'bucket_selector', 'bucket_sort', 'cumulative_cardinality',
      'cumulative_sum', 'derivative', 'extended_stats_bucket', 'moving_fn', 'moving_percentiles',
      'moving_avg', 'normalize', 'percentiles_bucket', 'serial_diff', 'stats_bucket']) {
      expect(AGG_OPS[op], op).toBeDefined();
    }
  });
  it('地理网格族与杂项桶/度量族在册', () => {
    for (const op of ['geo_distance', 'geohash_grid', 'geotile_grid', 'geohex_grid', 'geo_line',
      'auto_date_histogram', 'multi_terms', 'adjacency_matrix', 'significant_text', 'global',
      'children', 'parent', 'ip_range', 'variable_width_histogram', 'rate', 'matrix_stats',
      'inference', 'categorize_text', 'frequent_item_sets', 't_test']) {
      expect(AGG_OPS[op], op).toBeDefined();
    }
  });
  it('建议表键值全为字符串（datalist 直供契约）', () => {
    for (const [k, v] of Object.entries(AGG_OPS)) expect(typeof v, k).toBe('string');
  });
  it('管道族 schema：buckets_path/gap_policy/数值档在册', () => {
    const keysOf = (op: string) => (AGG_BODY_PARAMS[op] || []).map(p => p.key);
    expect(keysOf('derivative')).toEqual(expect.arrayContaining(['buckets_path', 'gap_policy', 'unit']));
    expect(keysOf('bucket_sort')).toContain('gap_policy');
    expect(keysOf('serial_diff')).toContain('lag');
    expect(keysOf('moving_fn')).toEqual(expect.arrayContaining(['window', 'shift', 'gap_policy']));
    expect(keysOf('normalize')).toContain('mode');
    expect(keysOf('geohash_grid')).toEqual(expect.arrayContaining(['precision', 'size']));
    expect(keysOf('rate')).toEqual(expect.arrayContaining(['unit', 'mode']));
    expect(keysOf('auto_date_histogram')).toContain('buckets');
  });
  it('schema 枚举档 options 非空（GenericParams 下拉直供契约）', () => {
    for (const [op, list] of Object.entries(AGG_BODY_PARAMS)) {
      for (const p of list) if (p.kind === 'enum') expect(p.options?.length, op + ':' + p.key).toBeGreaterThan(0);
    }
  });
});

describe('1030 聚合树字段选择扩员', () => {
  it('FIELD_BODY_AGGS 含新族字段聚合（body.field 行内 FieldSelect 直供）', () => {
    const src = srcOf('components/builder/AggTreeNode.vue');
    for (const op of ['auto_date_histogram', 'significant_text', 'ip_range', 'variable_width_histogram',
      'geohash_grid', 'geotile_grid', 'geohex_grid', 'geo_distance', 'rate']) {
      expect(src, op).toContain("'" + op + "'");
    }
  });
  it('aggTypePriority 含新族类型置顶（date/geo/数值族分组排前）', () => {
    const src = srcOf('components/builder/AggTreeNode.vue');
    expect(src).toContain("op === 'date_histogram' || props.node.op === 'auto_date_histogram'");
    expect(src).toContain("const GEO_AGGS = new Set(['geohash_grid', 'geotile_grid', 'geohex_grid', 'geo_distance'])");
    expect(src).toContain("'variable_width_histogram', 'rate'");
  });
});

describe('1030 高级菜单长算子名收口', () => {
  it('adv-i code 位省略号收口 + 行 title 全名提示（真机实锚：combined_fields 等 14+ 字符溢出面板裁切）', () => {
    const src = srcOf('components/builder/BoolGroupNode.vue');
    expect(src).toContain('.adv-i code { font-size: var(--fs-2xs); color: var(--tx2); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }');
    expect(src).toContain(':title="op + \' · \' + labelOfOp(op)"');
  });
});
