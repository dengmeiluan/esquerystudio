/* 聚合算子的族分类——把 AGG_OPS 的 68 项按 ES 官方语义分三族：
   桶（产出文档集合，可再嵌子聚合）/ 指标（在桶内算一个数）/ 管道（对已有桶再计算）。
 纯数据零依赖；族清单是显式表（不按名字猜），测试保证 AGG_OPS 每一项都被分类覆盖，
 新增算子忘了归类会直接红——不会静默落进「其他」。 */

export type AggFamily = 'bucket' | 'metric' | 'pipeline';

export const AGG_FAMILY_LABELS: Record<AggFamily, string> = {
  bucket: '桶聚合',
  metric: '指标聚合',
  pipeline: '管道聚合',
};

/* ES 聚合族显式归类（按官方参考手册的分章，而不是按名字前缀猜） */
const FAMILY_MEMBERS: Record<AggFamily, readonly string[]> = {
  bucket: [
    /* 分组/直方图/范围 */
    'terms', 'multi_terms', 'date_histogram', 'auto_date_histogram', 'histogram',
    'variable_width_histogram', 'range', 'date_range', 'ip_range',
    /* 过滤类 */
    'filter', 'filters', 'global', 'missing',
    /* 显著性与采样 */
    'significant_terms', 'significant_text', 'rare_terms', 'sampler', 'diversified_sampler', 'random_sampler',
    /* 复合/矩阵/邻接 */
    'composite', 'adjacency_matrix',
    /* 关系/嵌套 */
    'nested', 'reverse_nested', 'children', 'parent',
    /* 地理网格（每个网格格是一个桶） */
    'geo_distance', 'geohash_grid', 'geotile_grid', 'geohex_grid',
    /* 文本归类与频繁项集（产出桶） */
    'categorize_text', 'frequent_item_sets',
    /* 推理（可产出桶） */
    'inference',
  ],
  metric: [
    'avg', 'sum', 'min', 'max', 'value_count', 'cardinality',
    'stats', 'extended_stats', 'string_stats', 'boxplot',
    'percentiles', 'percentile_ranks', 'median_absolute_deviation',
    'weighted_avg', 'matrix_stats', 't_test', 'scripted_metric',
    'top_hits', 'top_metrics',
    'geo_bounds', 'geo_centroid', 'geo_line',
    'rate',
  ],
  pipeline: [
    'bucket_script', 'bucket_selector', 'bucket_sort',
    'cumulative_cardinality', 'cumulative_sum', 'derivative', 'serial_diff',
    'extended_stats_bucket', 'percentiles_bucket', 'stats_bucket',
    'avg_bucket', 'sum_bucket', 'min_bucket', 'max_bucket',
    'moving_fn', 'moving_percentiles', 'moving_avg', 'normalize',
  ],
};

const OP_TO_FAMILY = new Map<string, AggFamily>();
for (const fam of Object.keys(FAMILY_MEMBERS) as AggFamily[]) {
  for (const op of FAMILY_MEMBERS[fam]) {
    if (OP_TO_FAMILY.has(op)) throw new Error(`聚合算子重复归类：${op}`);
    OP_TO_FAMILY.set(op, fam);
  }
}

/** 算子所属族；未登记返回 null（调用方据此显示「自定义」档，不猜） */
export function aggFamilyOf(op: string): AggFamily | null {
  return OP_TO_FAMILY.get(op) ?? null;
}

/** 按族切分算子表——保持 AGG_OPS 的原始键序（族内顺序=注册表顺序，用户熟悉的在前） */
export function groupAggOps(ops: Record<string, string>): { fam: AggFamily; label: string; items: { op: string; label: string }[] }[] {
  const order: AggFamily[] = ['bucket', 'metric', 'pipeline'];
  const buckets: Record<AggFamily, { op: string; label: string }[]> = { bucket: [], metric: [], pipeline: [] };
  for (const [op, label] of Object.entries(ops)) {
    const fam = OP_TO_FAMILY.get(op);
    if (fam) buckets[fam].push({ op, label });
  }
  return order.map(fam => ({ fam, label: AGG_FAMILY_LABELS[fam], items: buckets[fam] }));
}
