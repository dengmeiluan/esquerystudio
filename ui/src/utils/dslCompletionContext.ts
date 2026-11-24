/* W4 ：DSL 补全上下文判定——从文首扫到 offset，维护 {}/[] 栈与每层最近键名。
 非严格解析（残缺文档容忍）：栈不平衡/半截字符串按已扫描信息兜底。
 root→根层键补全；query-type→查询类型 snippet；field→叶子子句字段名位（clause=子句名）；
 range-op→range 字段值对象内操作符位（gte/gt/lt/lte）；exists-key→exists 键位钉死 "field"；
 agg-name→aggs 容器键位（实例自由命名）；agg-type→实例值对象键位（聚合类型骨架）；none→不出层。 */
import { SETTINGS_CATALOG, CLUSTER_SETTINGS_CATALOG } from './indexSettingsCatalog';
/* 字段位类型亲和置顶序的语义源（下沉 queryAstOps 的单一出处，
 本链此前未消费——sqlCompletion/ClauseNode 同源，不另起算子映射表防漂移）
 keyword/number 两族改吃 queryAstOps 族表单源（KEYWORD_VALUE_TYPES 三员同值；
 number 滤 token_count 保持九口径——AFFINITY 族序零变，dslValueTiers545 行为锁保形） */
import { typePriorityForOp, KEYWORD_VALUE_TYPES, NUMERIC_VALUE_TYPES, labelOfOp, AGG_BODY_PARAMS, FIELD_BODY_AGGS, PATH_BODY_AGGS, OPS_META, WRAP_PARAMS, MULTI_META, RETRIEVER_PARAMS, type ParamMeta } from './queryAstOps';

type DslCtx = { kind: 'root' } | { kind: 'query-type' } | { kind: 'field'; clause: string }
  | { kind: 'range-op' } | { kind: 'exists-key' }
  | { kind: 'agg-name' } | { kind: 'agg-type' }
  /* 1439：检索器变体键位（retriever 值对象 / rrf.retrievers[] 元素） */
  | { kind: 'retriever-type' }
  /* 1439：建议器类型键位（suggest.<名> {} 内） */
  | { kind: 'suggester-type' }
  /* 1439：聚合体键位（terms: { 内）——参数键/字段键/嵌套 aggs */
  | { kind: 'agg-body-key'; op: string }
  /* 1439：terms/multi_terms 的 order 对象键位（_count/_key/_key_as_string；
     terms 另带同实例下可排序的子聚合名） */
  | { kind: 'agg-order-key'; subAggs: Array<{ name: string; type: string }> }
  /* 1439：order 对象的值位（排序方向 asc/desc） */
  | { kind: 'agg-order-dir' }
  /* 1439：子句体内的键位（bool must/filter、nested path/query、multi_match query/fields…）
     ——此前这里一律给 query-type（算子骨架），写进子句体全是非法键 */
  | { kind: 'query-body-key'; op: string }
  /* 1439：字段子句的字段配置对象（match.<field>.{query/operator}、fuzzy.<field>.{value/…}） */
  | { kind: 'clause-field-key'; op: string }
  /* 1439：检索器变体体键位（retriever.standard.{query}、knn.{field/query_vector}） */
  | { kind: 'retriever-body-key'; op: string }
  /* 1439：建议器体键位（suggest.<名>.<term|phrase|completion>.{}） */
  | { kind: 'suggester-body-key'; op: string }
  /* 1439：字段名作键的容器（highlight.fields { <字段>: {} }） */
  | { kind: 'field-key' }
  /* 1439：排序链——sort 元素的简写方向值 / 字段配置键 */
  | { kind: 'sort-order' }
  | { kind: 'sort-opt-key' }
  | { kind: 'array-elem-key'; owner: string } | { kind: 'none' };

export const QUERY_SNIPPETS: Record<string, string> = {
  /* —— 高频八员保持原有顺序（既有操作者肌肉记忆；类型前缀输入仍可秒筛） —— */
  match: '"match": {\n  "${1:field}": "${2:value}"\n}',
  match_phrase: '"match_phrase": {\n  "${1:field}": "${2:value}"\n}',
  term: '"term": {\n  "${1:field}": "${2:value}"\n}',
  /* 1439：占位值必须带引号——Monaco 把 ${2:value} 原样插成 value，裸数组 [value]
     接受即非法 JSON（其余 snippet 都带引号，只有该条漏了） */
  terms: '"terms": {\n  "${1:field}": ["${2:value}"]\n}',
  range: '"range": {\n  "${1:field}": {\n    "gte": "${2:now-1d/d}",\n    "lt": "${3:now/d}"\n  }\n}',
  exists: '"exists": {\n  "field": "${1:field}"\n}',
  wildcard: '"wildcard": {\n  "${1:field}": "${2:pref*}"\n}',
  bool: '"bool": {\n  "must": [\n    ${0}\n  ],\n  "filter": [],\n  "should": [],\n  "must_not": []\n}',
  /* —— term-level 其余（与树 OPS_META 全量对齐） —— */
  match_all: '"match_all": {}',
  match_none: '"match_none": {}',
  match_phrase_prefix: '"match_phrase_prefix": {\n  "${1:field}": "${2:value}"\n}',
  prefix: '"prefix": {\n  "${1:field}": "${2:prefix}"\n}',
  regexp: '"regexp": {\n  "${1:field}": "${2:pattern.*}"\n}',
  fuzzy: '"fuzzy": {\n  "${1:field}": {\n    "value": "${2:value}"\n  }\n}',
  match_bool_prefix: '"match_bool_prefix": {\n  "${1:field}": "${2:value}"\n}',
  terms_set: '"terms_set": {\n  "${1:field}": ["${2:value}"],\n  "minimum_should_match_field": "${3:countField}"\n}',
  bitmap_terms: '"bitmap_terms": {\n  "field": "${1:field}",\n  "value": "${2:value}"\n}',
  /* —— 全文检索 —— */
  multi_match: '"multi_match": {\n  "query": "${1:value}",\n  "fields": ["${2:field}"]\n}',
  query_string: '"query_string": {\n  "query": "${1:value}",\n  "default_field": "${2:field}"\n}',
  simple_query_string: '"simple_query_string": {\n  "query": "${1:value}",\n  "fields": ["${2:field}"]\n}',
  combined_fields: '"combined_fields": {\n  "query": "${1:value}",\n  "fields": ["${2:field}"]\n}',
  more_like_this: '"more_like_this": {\n  "fields": ["${1:field}"],\n  "like": "${2:text}"\n}',
  intervals: '"intervals": {\n  "${1:field}": {\n    "match": { "query": "${2:value}" }\n  }\n}',
  ids: '"ids": {\n  "values": ["${1:id}"]\n}',
  /* —— 排序特征 / 向量 / 语义 —— */
  rank_feature: '"rank_feature": {\n  "field": "${1:rankField}",\n  "boost": ${2:1}\n}',
  distance_feature: '"distance_feature": {\n  "field": "${1:dateField}",\n  "pivot": "${2:7d}",\n  "origin": "${3:now}"\n}',
  semantic: '"semantic": {\n  "field": "${1:semanticField}",\n  "query": "${2:text}"\n}',
  sparse_vector: '"sparse_vector": {\n  "field": "${1:vectorField}",\n  "query_vector": {}\n}',
  knn: '"knn": {\n  "field": "${1:vectorField}",\n  "query_vector": [],\n  "k": ${2:10},\n  "num_candidates": ${3:100}\n}',
  text_expansion: '"text_expansion": {\n  "${1:sparseField}": {\n    "model_id": "${2:model}",\n    "model_text": "${3:text}"\n  }\n}',
  weighted_tokens: '"weighted_tokens": {\n  "${1:sparseField}": {\n    "tokens": { "${2:token}": ${3:0.5} }\n  }\n}',
  /* —— geo / shape —— */
  geo_distance: '"geo_distance": {\n  "distance": "${1:10km}",\n  "${2:location}": { "lat": ${3:39.9}, "lon": ${4:116.4} }\n}',
  geo_bounding_box: '"geo_bounding_box": {\n  "${1:location}": {\n    "top_left": { "lat": ${2:40}, "lon": ${3:116} },\n    "bottom_right": { "lat": ${4:39}, "lon": ${5:117} }\n  }\n}',
  geo_polygon: '"geo_polygon": {\n  "${1:location}": {\n    "points": [\n      { "lat": ${2:39}, "lon": ${3:116} },\n      { "lat": ${4:40}, "lon": ${5:117} }\n    ]\n  }\n}',
  geo_shape: '"geo_shape": {\n  "${1:location}": {\n    "shape": { "type": "point", "coordinates": [${2:116.4}, ${3:39.9}] },\n    "relation": "intersects"\n  }\n}',
  geo_grid: '"geo_grid": {\n  "${1:location}": { "${2|geohash,geotile,geohex|}": "${3:u0}" }\n}',
  shape: '"shape": {\n  "${1:shapeField}": {\n    "shape": { "type": "point", "coordinates": [${2:116.4}, ${3:39.9}] },\n    "relation": "intersects"\n  }\n}',
  /* —— join / parent —— */
  nested: '"nested": {\n  "path": "${1:path}",\n  "query": { "match": { "${2:field}": "${3:value}" } }\n}',
  has_child: '"has_child": {\n  "type": "${1:childType}",\n  "query": { "match_all": {} }\n}',
  has_parent: '"has_parent": {\n  "parent_type": "${1:parentType}",\n  "query": { "match_all": {} }\n}',
  parent_id: '"parent_id": {\n  "type": "${1:parentType}",\n  "id": "${2:parentId}"\n}',
  /* —— 复合容器 —— */
  constant_score: '"constant_score": {\n  "filter": { "match_all": {} },\n  "boost": ${2:1}\n}',
  function_score: '"function_score": {\n  "query": { "match_all": {} },\n  "functions": [\n    { "weight": ${1:1} }\n  ],\n  "boost_mode": "multiply"\n}',
  script_score: '"script_score": {\n  "query": { "match_all": {} },\n  "script": { "source": "${1:params.factor}" },\n  "min_score": ${2:0}\n}',
  dis_max: '"dis_max": {\n  "queries": [\n    { "match_all": {} }\n  ],\n  "tie_breaker": ${2:0.7}\n}',
  boosting: '"boosting": {\n  "positive": { "match_all": {} },\n  "negative": { "match_none": {} },\n  "negative_boost": ${3:0.5}\n}',
  pinned: '"pinned": {\n  "ids": ["${1:id}"],\n  "organic": { "match_all": {} }\n}',
  /* —— span 跨度系 —— */
  span_near: '"span_near": {\n  "clauses": [\n    { "span_term": { "${1:field}": { "term": "${2:value}" } } }\n  ],\n  "slop": ${3:1},\n  "in_order": true\n}',
  span_or: '"span_or": {\n  "clauses": [\n    { "span_term": { "${1:field}": { "term": "${2:value}" } } }\n  ]\n}',
  span_not: '"span_not": {\n  "include": { "span_term": { "${1:field}": { "term": "${2:value}" } } },\n  "exclude": { "span_term": { "${3:field2}": { "term": "${4:value2}" } } }\n}',
  span_first: '"span_first": {\n  "match": { "span_term": { "${1:field}": { "term": "${2:value}" } } },\n  "end": ${3:3}\n}',
  span_containing: '"span_containing": {\n  "little": { "span_term": { "${1:field}": { "term": "${2:value}" } } },\n  "big": { "span_near": { "clauses": [], "slop": 1, "in_order": true } }\n}',
  span_within: '"span_within": {\n  "little": { "span_term": { "${1:field}": { "term": "${2:value}" } } },\n  "big": { "span_near": { "clauses": [], "slop": 1, "in_order": true } }\n}',
  span_term: '"span_term": {\n  "${1:field}": { "term": "${2:value}" }\n}',
  span_gap: '"span_gap": {\n  "${1:field}": ${2:1}\n}',
  span_multi: '"span_multi": {\n  "match": { "prefix": { "${1:field}": "${2:value}" } }\n}',
  span_field_masking: '"span_field_masking": {\n  "query": { "span_term": { "${1:field}": { "term": "${2:value}" } } },\n  "field": "${3:maskField}"\n}',
  /* —— 脚本 / 包装 / 反查 / 规则 / 遗留 —— */
  percolate: '"percolate": {\n  "field": "${1:queryField}",\n  "document": { "${2:field}": "${3:value}" }\n}',
  script: '"script": {\n  "script": { "source": "doc[\'${1:field}\'].value > 0" }\n}',
  wrapper: '"wrapper": {\n  "query": "${1:base64}"\n}',
  rule: '"rule": {\n  "ruleset_id": "${1:ruleset}",\n  "match_criteria": { "${2:field}": "${3:value}" }\n}',
  type: '"type": {\n  "value": "${1:docType}"\n}',
  template: '"template": {\n  "id": "${1:templateId}",\n  "params": {}\n}',
};
/* 1133：补全候选的中文语义（树注册表同源标签；bool 容器不在 OPS_META 单列）。
   出口放本模块，MonacoEditor 不直连 queryAstOps（dslValueTiers540 架构锁）。 */
export function querySnippetDetail(op: string): string {
  return op === 'bool' ? '布尔组合' : labelOfOp(op);
}

/* 2.6.0 range-op 档（spec ）：range 字段值对象内键位，日期占位默认值 */
export const RANGE_OPS: Record<string, string> = {
  gte: 'now-1d/d', gt: 'now-1d/d', lt: 'now/d', lte: 'now/d',
};
/* 2.6.0 聚合骨架（spec ）：agg-type 档候选。detail 一句话（H 发现性）。
 末键 aggs 是嵌套聚合入口（实例值对象内再开容器）。 */
export const AGG_SNIPPETS: Record<string, { text: string; detail: string }> = {
  terms:          { text: '"terms": {\n  "field": "${1:field}",\n  "size": ${2:10}\n}',                          detail: '分组统计（按字段值分桶）' },
  avg:            { text: '"avg": { "field": "${1:field}" }',                                                         detail: '平均值' },
  sum:            { text: '"sum": { "field": "${1:field}" }',                                                         detail: '求和' },
  min:            { text: '"min": { "field": "${1:field}" }',                                                         detail: '最小值' },
  max:            { text: '"max": { "field": "${1:field}" }',                                                         detail: '最大值' },
  stats:          { text: '"stats": { "field": "${1:field}" }',                                                       detail: 'count/min/max/avg/sum 一次全出' },
  cardinality:    { text: '"cardinality": { "field": "${1:field}" }',                                                 detail: '去重计数' },
  date_histogram: { text: '"date_histogram": {\n  "field": "${1:dateField}",\n  "calendar_interval": "${2|1d,1h,1w,1M|}"\n}', detail: '时间直方图（按间隔分桶）' },
  date_range:     { text: '"date_range": {\n  "field": "${1:dateField}",\n  "ranges": [\n    { "from": "${2:now-7d/d}", "to": "${3:now/d}" }\n  ]\n}', detail: '时间范围分桶' },
  top_hits:       { text: '"top_hits": {\n  "size": ${1:3},\n  "sort": [\n    { "${2:field}": { "order": "${3:desc}" } }\n  ]\n}', detail: '每桶取 TopN 文档' },
  aggs:           { text: '"aggs": {\n  ${0}\n}',                                                                       detail: '嵌套子聚合' },

  /* ── 1439：补到与 AGG_OPS 同宽（此前只有 11 种，Ctrl+Space 里看不到 histogram/
     percentiles/value_count/filter/nested/top_metrics 等常见聚合——补全就是发现性入口）。
     体一律取官方最小可用形态；占位符用 Monaco snippet 语法（${1:field} / ${2|a,b|}）。 ── */
  value_count:    { text: '"value_count": { "field": "${1:field}" }',                                                   detail: '计数（含重复）' },
  percentiles:    { text: '"percentiles": { "field": "${1:field}", "percents": [${2:50}, ${3:95}] }',                   detail: '分位数' },
  percentile_ranks: { text: '"percentile_ranks": { "field": "${1:field}", "values": [${2:50}] }',                       detail: '给定值的百分位排名' },
  extended_stats: { text: '"extended_stats": { "field": "${1:field}" }',                                                detail: '扩展统计（含方差/标准差）' },
  median_absolute_deviation: { text: '"median_absolute_deviation": { "field": "${1:field}" }',                          detail: '中位数绝对偏差（离群诊断）' },
  boxplot:        { text: '"boxplot": { "field": "${1:field}" }',                                                       detail: '箱线图统计（四分位）' },
  string_stats:   { text: '"string_stats": { "field": "${1:field}" }',                                                  detail: '字符串统计（长度/熵）' },
  matrix_stats:   { text: '"matrix_stats": { "fields": ["${1:field}", "${2:field2}"] }',                                detail: '多字段协方差矩阵' },
  weighted_avg:   { text: '"weighted_avg": {\n  "value": { "field": "${1:valueField}" },\n  "weight": { "field": "${2:weightField}" }\n}', detail: '加权平均' },
  t_test:         { text: '"t_test": {\n  "a": { "field": "${1:aField}" },\n  "b": { "field": "${2:bField}" }\n}',   detail: '两样本 t 检验' },
  rate:           { text: '"rate": {\n  "field": "${1:dateField}",\n  "unit": "${2|second,minute,hour,day,week,month,year|}"\n}', detail: '按时间单位的速率' },

  histogram:      { text: '"histogram": {\n  "field": "${1:field}",\n  "interval": ${2:10}\n}',                          detail: '数值直方图（固定区间分桶）' },
  range:          { text: '"range": {\n  "field": "${1:field}",\n  "ranges": [\n    { "to": ${2:100} },\n    { "from": ${2:100} }\n  ]\n}', detail: '数值范围分桶' },
  variable_width_histogram: { text: '"variable_width_histogram": {\n  "field": "${1:field}",\n  "buckets": ${2:10}\n}', detail: '按分布自适应的数值分桶' },
  auto_date_histogram: { text: '"auto_date_histogram": {\n  "field": "${1:dateField}",\n  "buckets": ${2:10}\n}',       detail: '自动选间隔的时间直方图' },
  missing:        { text: '"missing": { "field": "${1:field}" }',                                                       detail: '字段缺失的文档数' },
  filter:         { text: '"filter": { "term": { "${1:field}": "${2:value}" } }',                                       detail: '单过滤器分桶' },
  filters:        { text: '"filters": {\n  "filters": {\n    "${1:name}": { "term": { "${2:field}": "${3:value}" } }\n  }\n}', detail: '多过滤器命名分桶' },
  global:         { text: '"global": {}',                                                                               detail: '全局桶（不受查询过滤影响）' },
  nested:         { text: '"nested": { "path": "${1:path}" }',                                                          detail: '进入 nested 文档聚合' },
  reverse_nested: { text: '"reverse_nested": {}',                                                                       detail: '回到父文档聚合' },
  children:       { text: '"children": { "type": "${1:childType}" }',                                                   detail: '按子文档类型分桶' },
  parent:         { text: '"parent": { "type": "${1:parentType}" }',                                                    detail: '按父文档类型分桶' },
  sampler:        { text: '"sampler": { "shard_size": ${1:100} }',                                                      detail: '采样后聚合（降开销）' },
  random_sampler: { text: '"random_sampler": { "probability": ${1:0.1} }',                                              detail: '随机采样（可重复）' },
  diversified_sampler: { text: '"diversified_sampler": {\n  "field": "${1:field}",\n  "shard_size": ${2:100}\n}',       detail: '按字段去重的采样' },
  composite:      { text: '"composite": {\n  "sources": [\n    { "${1:name}": { "terms": { "field": "${2:field}" } } }\n  ],\n  "size": ${3:10}\n}', detail: '复合分桶（多键分页遍历）' },
  multi_terms:    { text: '"multi_terms": {\n  "terms": [\n    { "field": "${1:field}" },\n    { "field": "${2:field2}" }\n  ]\n}', detail: '多字段组合分桶' },
  adjacency_matrix: { text: '"adjacency_matrix": {\n  "filters": {\n    "${1:g1}": { "term": { "${2:field}": "${3:value}" } }\n  }\n}', detail: '过滤器两两相邻矩阵' },
  frequent_item_sets: { text: '"frequent_item_sets": {\n  "fields": ["${1:field}"],\n  "minimum_set_size": ${2:2}\n}', detail: '频繁项集挖掘' },
  significant_terms: { text: '"significant_terms": {\n  "field": "${1:field}",\n  "size": ${2:10}\n}',                  detail: '显著词项（对比背景集）' },
  significant_text: { text: '"significant_text": { "field": "${1:textField}" }',                                        detail: '显著文本片段' },
  rare_terms:     { text: '"rare_terms": { "field": "${1:field}" }',                                                    detail: '稀有词项分桶' },
  top_metrics:    { text: '"top_metrics": {\n  "metrics": [ { "field": "${1:field}" } ],\n  "sort": [ { "${2:sortField}": "desc" } ]\n}', detail: '按排序取同桶内极值字段' },
  geo_bounds:     { text: '"geo_bounds": { "field": "${1:location}" }',                                                 detail: '地理包围盒' },
  geo_centroid:   { text: '"geo_centroid": { "field": "${1:location}" }',                                               detail: '地理质心' },
  geo_distance:   { text: '"geo_distance": {\n  "field": "${1:location}",\n  "origin": { "lat": ${2:0}, "lon": ${3:0} },\n  "unit": "${4:km}"\n}', detail: '距离分桶' },
  geo_line:       { text: '"geo_line": {\n  "point": { "field": "${1:location}" },\n  "sort": { "field": "${2:timeField}" }\n}', detail: '轨迹线（按时间排序的坐标）' },
  geohash_grid:   { text: '"geohash_grid": {\n  "field": "${1:location}",\n  "precision": ${2:5}\n}',                   detail: 'geohash 网格分桶' },
  geotile_grid:   { text: '"geotile_grid": {\n  "field": "${1:location}",\n  "precision": ${2:7}\n}',                   detail: 'geotile 网格分桶' },
  geohex_grid:    { text: '"geohex_grid": {\n  "field": "${1:location}",\n  "precision": ${2:4}\n}',                     detail: 'geohex 网格分桶' },
  ip_range:       { text: '"ip_range": {\n  "field": "${1:ip}",\n  "ranges": [ { "to": "${2:10.0.0.255}" } ]\n}',      detail: 'IP 段分桶' },
  categorize_text: { text: '"categorize_text": { "field": "${1:message}" }',                                            detail: '文本自动分类分桶' },
  inference:      { text: '"inference": { "model_id": "${1:modelId}" }',                                                detail: '推理结果分桶（ML）' },
  scripted_metric: { text: '"scripted_metric": {\n  "init_script": "${1:state.n = 0}",\n  "map_script": "${2:state.n += 1}",\n  "combine_script": "${3:return state.n}",\n  "reduce_script": "${4:return states.sum()}"\n}', detail: '脚本自定义指标' },

  stats_bucket:   { text: '"stats_bucket": { "buckets_path": "${1:agg>metric}" }',                                      detail: '对兄弟桶统计做统计' },
  extended_stats_bucket: { text: '"extended_stats_bucket": { "buckets_path": "${1:agg>metric}" }',                      detail: '对兄弟桶做扩展统计' },
  /* 1439：官方桶均值/求和/最小/最大四员（与 stats_bucket 同族） */
  avg_bucket:     { text: '"avg_bucket": { "buckets_path": "${1:agg>metric}" }',                                        detail: '对兄弟桶求均值' },
  sum_bucket:     { text: '"sum_bucket": { "buckets_path": "${1:agg>metric}" }',                                        detail: '对兄弟桶求和' },
  min_bucket:     { text: '"min_bucket": { "buckets_path": "${1:agg>metric}" }',                                        detail: '对兄弟桶求最小' },
  max_bucket:     { text: '"max_bucket": { "buckets_path": "${1:agg>metric}" }',                                        detail: '对兄弟桶求最大' },
  percentiles_bucket: { text: '"percentiles_bucket": { "buckets_path": "${1:agg>metric}" }',                            detail: '对兄弟桶求分位' },
  derivative:     { text: '"derivative": { "buckets_path": "${1:agg>metric}" }',                                        detail: '相邻桶差值' },
  cumulative_sum: { text: '"cumulative_sum": { "buckets_path": "${1:agg>metric}" }',                                    detail: '累计和' },
  cumulative_cardinality: { text: '"cumulative_cardinality": { "buckets_path": "${1:agg>metric}" }',                    detail: '累计去重数' },
  serial_diff:    { text: '"serial_diff": {\n  "buckets_path": "${1:agg>metric}",\n  "lag": ${2:1}\n}',                 detail: '按滞后期求差' },
  moving_avg:     { text: '"moving_avg": {\n  "buckets_path": "${1:agg>metric}",\n  "window": ${2:5}\n}',                detail: '滑动平均（已废弃，建议 moving_fn）' },
  moving_fn:      { text: '"moving_fn": {\n  "buckets_path": "${1:agg>metric}",\n  "window": ${2:5},\n  "script": "${3:MovingFunctions.unweightedAvg(values)}"\n}', detail: '滑动函数' },
  moving_percentiles: { text: '"moving_percentiles": {\n  "buckets_path": "${1:agg>metric}",\n  "window": ${2:5},\n  "percents": [${3:50}]\n}', detail: '滑动分位数' },
  bucket_script:  { text: '"bucket_script": {\n  "buckets_path": { "${1:k}": "${2:agg>metric}" },\n  "script": "${3:params.k * 2}"\n}', detail: '按同桶指标算表达式' },
  bucket_selector: { text: '"bucket_selector": {\n  "buckets_path": { "${1:k}": "${2:agg>metric}" },\n  "script": "${3:params.k > 0}"\n}', detail: '按表达式过滤桶' },
  bucket_sort:    { text: '"bucket_sort": {\n  "sort": [ { "${1:agg}": { "order": "desc" } } ]\n}',                     detail: '对桶排序/截断' },
  normalize:      { text: '"normalize": {\n  "buckets_path": "${1:agg>metric}",\n  "method": "${2|min_max,z_score,percent_of_sum,mean,softmax|}"\n}', detail: '桶指标归一化' },
};
export const ROOT_KEYS = [
  'query', 'sort', 'aggs', '_source', 'highlight', 'from', 'size', 'track_total_hits',
  /* 1138：树已支持的结构化顶层键——原始 DSL 手写不再只能盲打 */
  'post_filter', 'knn', 'collapse', 'rescore', 'retriever', 'suggest', 'script_fields', 'runtime_mappings', 'search_after', 'min_score',
  /* 1439：lint 的 ROOT_KEY_WHITELIST 早已接受、补全却从不提供的合法根键——
     同一件事两种待遇：写出来不报错，想补全却没有。 */
  'aggregations', 'pit', 'docvalue_fields', 'stored_fields', 'fields', 'indices_boost',
  'search_type', 'terminate_after', 'timeout', 'explain', 'version', 'seq_no_primary_term',
  'track_scores', 'slice', 'routing', 'preference', 'ext', 'stats', 'profile',
];
/**
 * 1439：检索器变体补全（8.14+ 的 retriever 面）。
 * 此前 retriever 只有根键骨架（内部写死 standard），用户进到 retriever 体内按 Ctrl+Space
 * 什么都拿不到——而产品本身支持 9 种变体（RETRIEVER_META）。
 * 骨架以产品自己的序列化形态为准；aggCompletionWide1439 之外的
 * retrieverCompletion1439 会逐条喂给 parseTree，防止骨架与解析器漂移。
 */
export const RETRIEVER_SNIPPETS: Record<string, { text: string; detail: string }> = {
  standard:                { text: '"standard": {\n  "query": { "match_all": {} }\n}', detail: '标准 BM25 检索' },
  knn:                     { text: '"knn": {\n  "field": "${1:vectorField}",\n  "query_vector": [${2:0.1}, ${3:0.2}],\n  "k": ${4:10},\n  "num_candidates": ${5:100}\n}', detail: '向量近邻召回' },
  rrf:                     { text: '"rrf": {\n  "retrievers": [\n    { "standard": { "query": { "match_all": {} } } },\n    { "standard": { "query": { "match_all": {} } } }\n  ],\n  "rank_constant": ${1:60}\n}', detail: 'RRF 倒数排名融合（多路召回）' },
  linear:                  { text: '"linear": {\n  "retrievers": [\n    { "retriever": { "standard": { "query": { "match_all": {} } } }, "weight": ${1:1} }\n  ],\n  "normalizer": "${2|none,minmax,l2_norm|}"\n}', detail: '线性加权融合' },
  text_similarity_reranker: { text: '"text_similarity_reranker": {\n  "retriever": { "standard": { "query": { "match_all": {} } } },\n  "field": "${1:field}",\n  "inference_id": "${2:modelId}",\n  "inference_text": "${3:text}"\n}', detail: '文本相似度重排' },
  rule:                    { text: '"rule": {\n  "ruleset_id": "${1:rulesetId}"\n}', detail: '规则路由（按 ruleset 改写）' },
  pinned:                  { text: '"pinned": {\n  "docs": [ { "_id": "${1:docId}", "_index": "${2:index}" } ],\n  "retriever": { "standard": { "query": { "match_all": {} } } }\n}', detail: '置顶优选（指定文档排最前）' },
  diversify:               { text: '"diversify": {\n  "retriever": { "standard": { "query": { "match_all": {} } } },\n  "field": "${1:vectorField}",\n  "lambda": ${2:0.5}\n}', detail: 'MMR 多样性重排' },
  rescorer:                { text: '"rescorer": {\n  "retriever": { "standard": { "query": { "match_all": {} } } },\n  "rescore": { "window_size": ${1:50} }\n}', detail: '重打分' },
};
/**
 * 1439：建议器类型补全（suggest.<名> {} 内）。
 * 产品注册了 3 种建议器（SUGGESTER_TYPES：term/phrase/completion），根键骨架只写死 term；
 * 光标进到建议器对象里按 Ctrl+Space 此前什么也拿不到。
 */
export const SUGGESTER_SNIPPETS: Record<string, { text: string; detail: string }> = {
  term:       { text: '"term": {\n  "field": "${1:field}"\n}', detail: '纠错 term 建议器' },
  phrase:     { text: '"phrase": {\n  "field": "${1:field}",\n  "size": ${2:5}\n}', detail: '短语 phrase 建议器' },
  completion: { text: '"completion": {\n  "field": "${1:suggestField}"\n}', detail: '自动补全 completion 建议器' },
};
/**
 * 1439：聚合体内部可补全的键——字段键 + AGG_BODY_PARAMS 参数键 + 嵌套 aggs。
 * 字段键与构建器同源（queryAstOps.FIELD_BODY_AGGS / PATH_BODY_AGGS），
 * 参数键与 GenericParams 同源，避免「界面有输入框、编辑时却补不出来」。
 */
export function aggBodyKeys(op: string): Array<{ key: string; insert: string; detail: string }> {
  const out: Array<{ key: string; insert: string; detail: string }> = [];
  if (PATH_BODY_AGGS.has(op)) out.push({ key: 'path', insert: '"path": "${1:path}"', detail: '嵌套文档路径' });
  else if (FIELD_BODY_AGGS.has(op)) out.push({ key: 'field', insert: '"field": "${1:field}"', detail: '聚合字段' });
  for (const p of AGG_BODY_PARAMS[op] || []) {
    const opts = p.options || [];
    const ph = p.kind === 'number' ? '${1:10}'
      : p.kind === 'boolean' ? '${1|true,false|}'
      /* 枚举取的都是字符串值（map / min_max / mmr…）——必须带引号，否则插出来是裸词 */
      : p.kind === 'enum' && opts.length ? '"${1|' + opts.join(',') + '|}"'
      : p.kind === 'json' ? '${1:{}}'
      : p.kind === 'json-array' ? '${1:[]}'
      : '"${1:text}"';
    out.push({ key: p.key, insert: `"${p.key}": ${ph}`, detail: p.kind });
  }
  /* 1439：每个聚合体都允许 meta（原样回显的元数据），此前补不出来 */
  out.push({ key: 'meta', insert: '"meta": {\n  ${0}\n}', detail: '聚合元数据（原样回显）' });
  out.push({ key: 'aggs', insert: '"aggs": {\n  ${0}\n}', detail: '嵌套子聚合' });
  return out;
}

/* 2.6.0 root 键骨架（spec ）：每键定制值形态，detail 一句话（H 发现性）。 query/aggs/highlight 对象容器；sort 数组（多字段通用）；_source 数组；from/size 数字；track_total_hits choice。
 1138：补树已支持的结构化顶层键（查询后置过滤 / 顶层向量 / 折叠 / 重打分 / 检索器 / 建议器 / 脚本字段 / 运行时字段 / 深分页 / 最低分）。 */
export const ROOT_KEY_SNIPPETS: Record<string, { text: string; detail: string }> = {
  query:            { text: '"query": {\n  ${0}\n}',                                        detail: '查询主体' },
  sort:             { text: '"sort": [\n  { "${1:field}": { "order": "${2|desc,asc|}" } }\n]', detail: '排序' },
  aggs:             { text: '"aggs": {\n  ${0}\n}',                                         detail: '聚合统计' },
  _source:          { text: '"_source": ["${1:field}"]',                                    detail: '返回字段裁剪' },
  highlight:        { text: '"highlight": {\n  "fields": {\n    "${1:field}": {}\n  }\n}',  detail: '高亮' },
  from:             { text: '"from": ${1:0}',                                               detail: '分页起点' },
  size:             { text: '"size": ${1:10}',                                              detail: '分页大小' },
  track_total_hits: { text: '"track_total_hits": ${1|true,false|}',                         detail: '精确总数统计' },
  post_filter:      { text: '"post_filter": {\n  "term": { "${1:field}": "${2:value}" }\n}', detail: '查询后过滤（不影响聚合）' },
  knn:              { text: '"knn": {\n  "field": "${1:vectorField}",\n  "query_vector": [],\n  "k": ${2:10},\n  "num_candidates": ${3:100}\n}', detail: '顶层向量近邻检索' },
  collapse:         { text: '"collapse": {\n  "field": "${1:field}"\n}',                    detail: '按字段折叠去重' },
  rescore:          { text: '"rescore": {\n  "window_size": ${1:50},\n  "query": {\n    "rescore_query": { "match_all": {} },\n    "query_weight": 0.7,\n    "rescore_query_weight": 1.2\n  }\n}', detail: '二阶段重打分' },
  retriever:        { text: '"retriever": {\n  "standard": {\n    "query": { "match_all": {} }\n  }\n}', detail: '检索器（8.14+ 检索面）' },
  suggest:          { text: '"suggest": {\n  "${1:my_suggest}": {\n    "text": "${2:value}",\n    "term": { "field": "${3:field}" }\n  }\n}', detail: '建议器（拼写/词项）' },
  script_fields:    { text: '"script_fields": {\n  "${1:my_field}": {\n    "script": { "source": "${2:params.factor}" }\n  }\n}', detail: '脚本计算字段' },
  runtime_mappings: { text: '"runtime_mappings": {\n  "${1:runtime_field}": {\n    "type": "${2|keyword,long,double,date,boolean|}",\n    "script": { "source": "${3:emit(params.x)}" }\n  }\n}', detail: '运行时字段' },
  search_after:     { text: '"search_after": ["${1:value}"]',                              detail: '深分页游标' },
  min_score:        { text: '"min_score": ${1:0}',                                          detail: '最低评分过滤' },
  /* 1439：lint 白名单已接受的合法根键，补全补齐 */
  aggregations:     { text: '"aggregations": {\n  ${0}\n}',                                 detail: '聚合统计（aggs 的别名）' },
  pit:              { text: '"pit": {\n  "id": "${1:pitId}",\n  "keep_alive": "${2:1m}"\n}',   detail: '时间点（PIT）检索' },
  docvalue_fields:  { text: '"docvalue_fields": [ "${1:field}" ]',                          detail: '按列存取值（doc_values）返回字段' },
  stored_fields:    { text: '"stored_fields": [ "${1:field}" ]',                            detail: '返回 stored 字段' },
  fields:           { text: '"fields": [ "${1:field}" ]',                                   detail: 'fields API 返回字段' },
  indices_boost:    { text: '"indices_boost": [ { "${1:index}": ${2:1.2} } ]',               detail: '按索引加权' },
  search_type:      { text: '"search_type": "${1|query_then_fetch,dfs_query_then_fetch|}"',  detail: '搜索类型（打分一致性/两阶段）' },
  terminate_after:  { text: '"terminate_after": ${1:1000}',                                 detail: '最多检查 N 篇后提前结束' },
  timeout:          { text: '"timeout": "${1:1s}"',                                         detail: '搜索超时（到时返回部分结果）' },
  explain:          { text: '"explain": ${1|true,false|}',                                  detail: '返回打分解释' },
  version:          { text: '"version": ${1|true,false|}',                                  detail: '返回文档版本号' },
  seq_no_primary_term: { text: '"seq_no_primary_term": ${1|true,false|}',                   detail: '返回 seq_no / primary_term（乐观并发）' },
  track_scores:     { text: '"track_scores": ${1|true,false|}',                             detail: '排序时仍计算得分' },
  slice:            { text: '"slice": {\n  "field": "${1:_id}",\n  "id": ${2:0},\n  "max": ${3:2}\n}', detail: '切片并行检索' },
  routing:          { text: '"routing": "${1:routing}"',                                     detail: '路由值（定向分片）' },
  preference:       { text: '"preference": "${1|_local,_primary,_only_local|}"',             detail: '分片偏好（缓存/主副选择）' },
  ext:              { text: '"ext": {\n  ${0}\n}',                                          detail: '搜索扩展参数（插件用）' },
  stats:            { text: '"stats": [ "${1:group}" ]',                                    detail: '统计分组标签（打点用）' },
  profile:          { text: '"profile": ${1|true,false|}',                                  detail: '耗时剖析（profile 树）' },
};

/** search 体根键候选（嵌套 search body 区域与 W6 根档共用同一目录） */
export function searchRootKeyItems(): AssistItem[] {
  return ROOT_KEYS.map(k => ({
    label: k, detail: ROOT_KEY_SNIPPETS[k].detail, snippet: true, insertText: ROOT_KEY_SNIPPETS[k].text,
  }));
}
/** 叶子查询子句（值位是字段名对象）。
 2.6.0：exists 移出——其键位钉死 "field"（exists-key 档），出字段名档是语义误导。
 1439：改由 OPS_META.form==='field' 派生——match_phrase_prefix / intervals / span_term /
 text_expansion / geo_* / shape 等同类子句此前不在册，其体里敲引号给的是 query-type（算子
 骨架写进字段位必非法）。单一真源派生，新增字段形态算子自动并档。 */
const FIELD_CLAUSES: ReadonlySet<string> = new Set(
  Object.entries(OPS_META).filter(([op, meta]) => meta.form === 'field' && op !== 'exists').map(([op]) => op),
);

/* ═══ 1439：子句体键位补全（非字段形态）═══
   表内是官方体的结构键；queryBodyKeys 再并上 OPS_META/WRAP_PARAMS/MULTI_META 的参数键，
   参数表扩容时补全自动跟随，不另抄一份。 */
export interface BodyKey { key: string; insert: string; detail: string }
const B = (key: string, insert: string, detail: string): BodyKey => ({ key, insert, detail });
const NAME_KEY = B('_name', '"_name": "${1:name}"', '命名查询（命中归因）');

export const QUERY_BODY_KEYS: Record<string, BodyKey[]> = {
  bool: [
    B('must', '"must": [\n  ${0}\n]', '全部必须匹配（参与评分）'),
    B('filter', '"filter": [\n  ${0}\n]', '全部必须匹配（不计分，可缓存）'),
    B('should', '"should": [\n  ${0}\n]', '满足任一（配合 minimum_should_match）'),
    B('must_not', '"must_not": [\n  ${0}\n]', '全部必须不匹配'),
    B('minimum_should_match', '"minimum_should_match": "${1:1}"', 'should 至少满足的个数/百分比'),
    B('boost', '"boost": ${1:1}', '加权'),
    NAME_KEY,
  ],
  constant_score: [B('filter', '"filter": {\n  ${0}\n}', '计分来源查询（恒定分）'), B('boost', '"boost": ${1:1}', '恒定分'), NAME_KEY],
  dis_max: [B('queries', '"queries": [\n  ${0}\n]', '子查询列表（取最高分）'), B('tie_breaker', '"tie_breaker": ${1:0.7}', '近似命中的折算系数'), B('boost', '"boost": ${1:1}', '加权')],
  function_score: [
    B('query', '"query": {\n  ${0}\n}', '基础查询（可选）'),
    B('functions', '"functions": [\n  ${0}\n]', '评分函数列表'),
    B('boost', '"boost": ${1:1}', '全局加权'),
    B('boost_mode', '"boost_mode": "${1|multiply,replace,sum,avg,max,min|}"', '函数分与查询分的合并方式'),
    B('score_mode', '"score_mode": "${1|multiply,sum,avg,first,max,min|}"', '多个函数分的合并方式'),
    B('min_score', '"min_score": ${1:0}', '低于此分的命中丢弃'),
    B('max_boost', '"max_boost": ${1:10}', '函数分上限'),
  ],
  /* function_score.functions[] 元素（数组帧 lastKey='functions'） */
  __function__: [
    B('filter', '"filter": {\n  ${0}\n}', '只对该查询命中的文档生效'),
    B('weight', '"weight": ${1:1}', '固定权重'),
    B('random_score', '"random_score": { "seed": ${1:1}, "field": "${2:_seq_no}" }', '随机分（可复现要固定 seed）'),
    B('script_score', '"script_score": { "script": { "source": "${1:params.w ?? 1}" } }', '脚本分'),
    B('field_value_factor', '"field_value_factor": { "field": "${1:field}", "factor": ${2:1}, "missing": ${3:1} }', '字段值转分'),
    B('gauss', '"gauss": { "${1:field}": { "origin": "${2:0}", "scale": "${3:10}" } }', '高斯衰减'),
    B('linear', '"linear": { "${1:field}": { "origin": "${2:0}", "scale": "${3:10}" } }', '线性衰减'),
    B('exp', '"exp": { "${1:field}": { "origin": "${2:0}", "scale": "${3:10}" } }', '指数衰减'),
  ],
  boosting: [B('positive', '"positive": {\n  ${0}\n}', '必须匹配的正例'), B('negative', '"negative": {\n  ${0}\n}', '匹配则降权'), B('negative_boost', '"negative_boost": ${1:0.5}', '反例降权系数')],
  script_score: [B('query', '"query": {\n  ${0}\n}', '基础查询'), B('script', '"script": { "source": "${1:_score}" }', '评分脚本'), B('min_score', '"min_score": ${1:0}', '最低分')],
  pinned: [
    B('ids', '"ids": [${1:\"id\"}]', '置顶文档 ID'),
    B('docs', '"docs": [\n  { "_id": "${1:id}", "_index": "${2:index}" }\n]', '跨索引置顶文档'),
    B('organic', '"organic": {\n  ${0}\n}', '其余文档的召回查询'),
    B('boost', '"boost": ${1:1}', '置顶文档加权'),
  ],
  nested: [
    B('path', '"path": "${1:path}"', '嵌套文档路径'),
    B('query', '"query": {\n  ${0}\n}', '嵌套文档内的查询'),
    B('score_mode', '"score_mode": "${1|avg,sum,max,min,none|}"', '多根文档评分合并'),
    B('ignore_unmapped', '"ignore_unmapped": ${1|false,true|}', '路径未映射时忽略'),
  ],
  has_child: [
    B('type', '"type": "${1:childType}"', '子文档 join 名'),
    B('query', '"query": {\n  ${0}\n}', '对子文档的查询'),
    B('score_mode', '"score_mode": "${1|avg,sum,max,min,none|}"', '多个子文档的评分合并'),
    B('min_children', '"min_children": ${1:1}', '至少命中几个子文档'),
    B('max_children', '"max_children": ${1:10}', '至多命中几个子文档'),
    B('ignore_unmapped', '"ignore_unmapped": ${1|false,true|}', '类型未映射时忽略'),
  ],
  has_parent: [
    B('parent_type', '"parent_type": "${1:parentType}"', '父文档 join 名'),
    B('query', '"query": {\n  ${0}\n}', '对父文档的查询'),
    B('score_mode', '"score_mode": "${1|none,score|}"', '父文档评分是否计入'),
    B('ignore_unmapped', '"ignore_unmapped": ${1|false,true|}', '类型未映射时忽略'),
  ],
  multi_match: [
    B('query', '"query": "${1:value}"', '检索文本'),
    B('fields', '"fields": ["${1:field}"]', '参与检索的字段（可用 field^2 加权）'),
    B('type', '"type": "${1|best_fields,most_fields,cross_fields,phrase,phrase_prefix,bool_prefix|}"', '匹配策略'),
  ],
  query_string: [
    B('query', '"query": "${1:value}"', '查询串（支持 AND/OR/字段:值）'),
    B('default_field', '"default_field": "${1:field}"', '未写字段时的默认字段'),
    B('fields', '"fields": ["${1:field}"]', '搜索字段列表'),
  ],
  simple_query_string: [
    B('query', '"query": "${1:+value -exclude}"', '简单查询串（+/-/短语/通配）'),
    B('fields', '"fields": ["${1:field}"]', '搜索字段列表'),
  ],
  combined_fields: [
    B('query', '"query": "${1:value}"', '检索文本'),
    B('fields', '"fields": ["${1:field}"]', '组合检索的字段'),
  ],
  more_like_this: [
    B('fields', '"fields": ["${1:field}"]', '相似度比较字段'),
    B('like', '"like": "${1:text}"', '示例文本/文档'),
    B('ids', '"ids": [${1:\"id\"}]', '以这些文档为示例'),
  ],
  ids: [B('values', '"values": ["${1:id}"]', '文档 ID 列表')],
  script: [B('script', '"script": { "source": "${1:params._source}" }', '过滤脚本')],
  wrapper: [B('query', '"query": "${1:base64}"', 'Base64 编码的查询')],
  percolate: [B('field', '"field": "${1:queryField}"', 'percolator 字段'), B('document', '"document": {\n  ${0}\n}', '要反查的文档')],
  rule: [B('ruleset_id', '"ruleset_id": "${1:ruleset}"', '规则集 ID'), B('match_criteria', '"match_criteria": {\n  ${0}\n}', '规则匹配条件'), B('match_predicate', '"match_predicate": {\n  ${0}\n}', '规则命中后的查询')],
  template: [B('id', '"id": "${1:templateId}"', '搜索模板 ID'), B('params', '"params": {\n  ${0}\n}', '模板参数')],
  parent_id: [B('type', '"type": "${1:parentType}"', '父文档 join 名'), B('id', '"id": "${1:parentId}"', '父文档 ID')],
  type: [B('value', '"value": "${1:type}"', '7.x 映射类型名')],
  rank_feature: [B('field', '"field": "${1:rankField}"', '特征字段'), B('boost', '"boost": ${1:1}', '加权'), B('saturation', '"saturation": { "pivot": ${1:1} }', '饱和函数'), B('log', '"log": { "scaling_factor": ${1:1} }', '对数函数'), B('sigmoid', '"sigmoid": { "pivot": ${1:1}, "exponent": ${2:1} }', 'S 型函数'), B('linear', '"linear": {}', '线性函数')],
  distance_feature: [B('field', '"field": "${1:field}"', '距离特征字段'), B('origin', '"origin": "${1:now}"', '原点'), B('pivot', '"pivot": "${1:7d}"', '距离尺度'), B('boost', '"boost": ${1:1}', '加权')],
  knn: [
    B('field', '"field": "${1:vectorField}"', '向量字段'),
    B('query_vector', '"query_vector": [${1:0.1}]', '查询向量'),
    B('k', '"k": ${1:10}', '返回近邻数'),
    B('num_candidates', '"num_candidates": ${1:100}', '每分片候选数'),
    B('filter', '"filter": {\n  ${0}\n}', '近邻过滤查询'),
    B('similarity', '"similarity": ${1:0.8}', '相似度下限'),
    B('boost', '"boost": ${1:1}', '加权'),
  ],
  semantic: [B('field', '"field": "${1:semanticField}"', '语义字段'), B('query', '"query": "${1:text}"', '语义检索文本')],
  sparse_vector: [B('field', '"field": "${1:sparseField}"', '稀疏向量字段'), B('query_vector', '"query_vector": { "${1:token}": ${2:0.5} }', '稀疏查询向量')],
  bitmap_terms: [B('field', '"field": "${1:field}"', '字段'), B('value', '"value": "${1:base64}"', 'Base64 位图')],
  span_near: [B('clauses', '"clauses": [\n  ${0}\n]', '子跨度列表'), B('slop', '"slop": ${1:1}', '允许的最大间隔'), B('in_order', '"in_order": ${1|true,false|}', '是否要求顺序')],
  span_or: [B('clauses', '"clauses": [\n  ${0}\n]', '任一命中的子跨度')],
  span_not: [B('include', '"include": {\n  ${0}\n}', '包含跨度'), B('exclude', '"exclude": {\n  ${0}\n}', '排除跨度')],
  span_first: [B('match', '"match": {\n  ${0}\n}', '内部跨度'), B('end', '"end": ${1:3}', '必须出现在前 N 个位置')],
  span_containing: [B('little', '"little": {\n  ${0}\n}', '内部跨度'), B('big', '"big": {\n  ${0}\n}', '外部跨度')],
  span_within: [B('little', '"little": {\n  ${0}\n}', '内部跨度'), B('big', '"big": {\n  ${0}\n}', '外部跨度')],
  span_multi: [B('match', '"match": {\n  ${0}\n}', '多词查询（term/prefix/wildcard 等）')],
  span_field_masking: [B('query', '"query": {\n  ${0}\n}', '被掩码的查询'), B('field', '"field": "${1:field}"', '掩码字段')],
  match_all: [B('boost', '"boost": ${1:1}', '加权'), NAME_KEY],
  /* inner_hits：nested / has_child / collapse / top_hits 共用（父键判定见 dslContext） */
  inner_hits: [
    B('from', '"from": ${1:0}', '组内跳过条数'),
    B('size', '"size": ${1:3}', '组内返回条数'),
    B('name', '"name": "${1:hits}"', '结果里的命名（拿回 inner_hits）'),
    B('sort', '"sort": [\n  ${0}\n]', '组内排序'),
    B('_source', '"_source": ${1|false,true|}', '组内返回字段'),
    B('highlight', '"highlight": {\n  ${0}\n}', '组内高亮'),
  ],
  rescore: [
    B('window_size', '"window_size": ${1:50}', '前 N 条参与重排'),
    B('query', '"query": {\n  ${0}\n}', '重排查询（配合 rescore_query）'),
    B('query_weight', '"query_weight": ${1:1}', '原分权重'),
    B('rescore_query', '"rescore_query": {\n  ${0}\n}', '重排查询'),
    B('rescore_query_weight', '"rescore_query_weight": ${1:1}', '重排分权重'),
    B('score_mode', '"score_mode": "${1|total,multiply,avg,max,min|}"', '合并方式'),
  ],
  pit: [B('id', '"id": "${1:pitId}"', 'Point-in-time ID'), B('keep_alive', '"keep_alive": "${1:1m}"', '保活时长')],
  /* function_score.functions[] 里的 decay / random_score / field_value_factor 体 */
  gauss: [B('origin', '"origin": "${1:0}"', '原点'), B('scale', '"scale": "${1:10}"', '衰减尺度'), B('offset', '"offset": ${1:0}', '无衰减区间'), B('decay', '"decay": ${1:0.5}', '衰减到该比例')],
  linear: [B('origin', '"origin": "${1:0}"', '原点'), B('scale', '"scale": "${1:10}"', '衰减尺度'), B('offset', '"offset": ${1:0}', '无衰减区间'), B('decay', '"decay": ${1:0.5}', '衰减到该比例')],
  exp: [B('origin', '"origin": "${1:0}"', '原点'), B('scale', '"scale": "${1:10}"', '衰减尺度'), B('offset', '"offset": ${1:0}', '无衰减区间'), B('decay', '"decay": ${1:0.5}', '衰减到该比例')],
  random_score: [B('seed', '"seed": ${1:1}', '随机种子（固定后结果可复现）'), B('field', '"field": "${1:_seq_no}"', '按该字段值参与随机')],
  field_value_factor: [B('field', '"field": "${1:field}"', '取值字段'), B('factor', '"factor": ${1:1}', '放大系数'), B('modifier', '"modifier": "${1|none,log,log1p,log2p,ln,ln1p,ln2p,square,sqrt,reciprocal|}"', '取值变换'), B('missing', '"missing": ${1:1}', '缺值时的默认值')],
  /* 合成档：根层容器体（owner 键判定） */
  __script_field__: [B('script', '"script": {\n  ${0}\n}', '脚本（source/lang/params）')],
  __script__: [B('source', '"source": "${1:doc[\'field\'].value}"', '脚本源码'), B('lang', '"lang": "${1:painless}"', '脚本语言'), B('params', '"params": {\n  ${0}\n}', '脚本参数'), B('id', '"id": "${1:storedScriptId}"', '已存脚本 ID')],
  __runtime_field__: [B('type', '"type": "${1|keyword,long,double,date,boolean,ip|}"', '运行时字段类型'), B('script', '"script": {\n  ${0}\n}', '取值脚本'), B('format', '"format": "${1:yyyy-MM-dd}"', 'date 格式')],
  /* highlight.fields.<字段>.{} 的字段级配置（比根层 highlight 体少了 fields） */
  __highlight_field__: [
    B('type', '"type": "${1|unified,plain,fvh|}"', '该字段的高亮器'),
    B('fragment_size', '"fragment_size": ${1:100}', '片段长度'),
    B('number_of_fragments', '"number_of_fragments": ${1:3}', '片段数'),
    B('pre_tags', '"pre_tags": ["${1:<em>}"]', '前置标记'),
    B('post_tags', '"post_tags": ["${1:</em>}"]', '后置标记'),
    B('require_field_match', '"require_field_match": ${1|false,true|}', '是否只高亮命中字段'),
    B('no_match_size', '"no_match_size": ${1:0}', '未命中时返回的片段长度'),
    B('boundary_scanner', '"boundary_scanner": "${1|sentence,word|}"', '片段边界扫描'),
  ],
  collapse: [B('field', '"field": "${1:field}"', '折叠字段（每个值只留一条）'), B('inner_hits', '"inner_hits": { "name": "${1:group}", "size": ${2:1} }', '折叠组内命中')],
  /* _source 对象形态（裁剪返回字段）；串/数组形态走数组白名单轨 */
  _source: [
    B('includes', '"includes": [\n  "${1:field}"\n]', '只返回这些字段（支持通配）'),
    B('excludes', '"excludes": [\n  "${1:field}"\n]', '排除这些字段（支持通配）'),
    B('include', '"include": ["${1:field}"]', '旧式写法：只返回这些字段'),
    B('exclude', '"exclude": ["${1:field}"]', '旧式写法：排除这些字段'),
  ],
  highlight: [
    B('fields', '"fields": {\n  ${0}\n}', '高亮字段'),
    B('type', '"type": "${1|unified,plain,fvh|}"', '高亮器类型'),
    B('pre_tags', '"pre_tags": ["${1:<em>}"]', '前置标记'),
    B('post_tags', '"post_tags": ["${1:</em>}"]', '后置标记'),
    B('require_field_match', '"require_field_match": ${1|false,true|}', '是否只高亮命中的字段'),
    B('number_of_fragments', '"number_of_fragments": ${1:3}', '片段数'),
    B('fragment_size', '"fragment_size": ${1:100}', '片段长度'),
  ],
};

/** 参数 → 键骨架（与 aggBodyKeys 同手法；只给键位，值形态按 kind 给默认占位） */
function paramInsert(p: ParamMeta): string {
  if (p.kind === 'number') return '"' + p.key + '": ${1:10}';
  if (p.kind === 'boolean') return '"' + p.key + '": ${1|true,false|}';
  if (p.kind === 'enum') return '"' + p.key + '": "${1|' + (p.options || []).join(',') + '|}"';
  if (p.kind === 'json') return '"' + p.key + '": {\n  ${0}\n}';
  if (p.kind === 'json-array') return '"' + p.key + '": [\n  ${0}\n]';
  return '"' + p.key + '": "${1:' + p.key + '}"';
}

/** 子句体键位（结构键 + 参数表并集）——参数表扩容自动跟随，不另抄清单 */
export function queryBodyKeys(op: string): BodyKey[] {
  const out = [...(QUERY_BODY_KEYS[op] || [])];
  const seen = new Set(out.map(x => x.key));
  const params: ParamMeta[] = [
    ...(OPS_META[op]?.params || []),
    ...(WRAP_PARAMS[op] || []),
    ...(MULTI_META[op]?.params || []),
  ];
  for (const p of params) {
    if (seen.has(p.key)) continue;
    out.push({ key: p.key, insert: paramInsert(p), detail: '可选参数' });
    seen.add(p.key);
  }
  return out;
}

/* 字段子句的字段配置对象键（match.<field>.{query/operator} / fuzzy.<field>.{value/…}）——
   字段名是自由键，配置键才是可枚举的；此前这里同样回 query-type。 */
export const CLAUSE_VALUE_KEYS: Record<string, BodyKey[]> = {
  match: [
    B('query', '"query": "${1:value}"', '检索文本'),
    B('operator', '"operator": "${1|and,or|}"', '词项逻辑'),
    B('fuzziness', '"fuzziness": "${1:AUTO}"', '模糊度'),
    B('minimum_should_match', '"minimum_should_match": "${1:1}"', '至少命中词数'),
    B('analyzer', '"analyzer": "${1:standard}"', '分词器'),
    B('boost', '"boost": ${1:1}', '加权'),
  ],
  match_phrase: [B('query', '"query": "${1:value}"', '短语文本'), B('slop', '"slop": ${1:0}', '允许的词间间隔'), B('boost', '"boost": ${1:1}', '加权')],
  match_phrase_prefix: [B('query', '"query": "${1:value}"', '短语前缀文本'), B('max_expansions', '"max_expansions": ${1:50}', '前缀展开上限'), B('slop', '"slop": ${1:0}', '允许的词间间隔')],
  match_bool_prefix: [B('query', '"query": "${1:value}"', '文本（末词按前缀）'), B('operator', '"operator": "${1|and,or|}"', '词项逻辑')],
  term: [B('value', '"value": "${1:value}"', '精确值'), B('case_insensitive', '"case_insensitive": ${1|true,false|}', '忽略大小写'), B('boost', '"boost": ${1:1}', '加权')],
  prefix: [B('value', '"value": "${1:prefix}"', '前缀'), B('case_insensitive', '"case_insensitive": ${1|true,false|}', '忽略大小写')],
  wildcard: [B('value', '"value": "${1:pref*}"', '通配模式'), B('case_insensitive', '"case_insensitive": ${1|true,false|}', '忽略大小写'), B('rewrite', '"rewrite": "${1:constant_score}"', '重写策略')],
  regexp: [B('value', '"value": "${1:pattern.*}"', '正则'), B('flags', '"flags": "${1:ALL}"', '正则选项'), B('max_determinized_states', '"max_determinized_states": ${1:10000}', '自动机状态上限')],
  fuzzy: [B('value', '"value": "${1:value}"', '目标词'), B('fuzziness', '"fuzziness": "${1:AUTO}"', '模糊度'), B('prefix_length', '"prefix_length": ${1:0}', '前缀不变长度'), B('transpositions', '"transpositions": ${1|true,false|}', '允许换位')],
  span_term: [B('value', '"value": "${1:term}"', '词项')],
  intervals: [
    B('match', '"match": { "query": "${1:value}" }', '匹配文本'),
    B('all_of', '"all_of": {\n  "ordered": ${1|true,false|},\n  "intervals": [\n    ${0}\n  ]\n}', '有序/无序全部命中'),
    B('any_of', '"any_of": { "intervals": [\n  ${0}\n] }', '任一命中'),
    B('prefix', '"prefix": { "prefix": "${1:pre}" }', '前缀'),
    B('wildcard', '"wildcard": { "pattern": "${1:pre*}" }', '通配'),
    B('fuzzy', '"fuzzy": { "term": "${1:term}" }', '模糊'),
    B('filter', '"filter": { "script": { "source": "true" } }', '脚本过滤'),
  ],
  geo_shape: [B('shape', '"shape": {\n  ${0}\n}', '形状对象'), B('relation', '"relation": "${1|INTERSECTS,DISJOINT,WITHIN|}"', '空间关系')],
  geo_bounding_box: [B('top_left', '"top_left": { "lat": ${1:0}, "lon": ${2:0} }', '左上角点'), B('bottom_right', '"bottom_right": { "lat": ${1:0}, "lon": ${2:0} }', '右下角点')],
  geo_polygon: [B('points', '"points": [\n  { "lat": ${1:0}, "lon": ${2:0} }\n]', '多边形顶点')],
  text_expansion: [B('model_id', '"model_id": "${1:model}"', '推理模型 ID'), B('model_text', '"model_text": "${1:text}"', '待扩展文本')],
};

/** 字段配置键位（结构键 + OPS_META 参数并集，同上不另抄清单） */
export function clauseValueKeys(op: string): BodyKey[] {
  const out = [...(CLAUSE_VALUE_KEYS[op] || [])];
  const seen = new Set(out.map(x => x.key));
  for (const p of OPS_META[op]?.params || []) {
    if (seen.has(p.key)) continue;
    out.push({ key: p.key, insert: paramInsert(p), detail: '可选参数' });
    seen.add(p.key);
  }
  return out;
}

/* 检索器变体体键（结构键 + RETRIEVER_PARAMS 参数并集） */
const RETRIEVER_STRUCT: Record<string, BodyKey[]> = {
  standard: [B('query', '"query": {\n  ${0}\n}', '召回查询（BM25）')],
  knn: [B('field', '"field": "${1:vectorField}"', '向量字段'), B('query_vector', '"query_vector": [${1:0.1}]', '查询向量'), B('filter', '"filter": {\n  ${0}\n}', '近邻过滤查询')],
  rrf: [B('retrievers', '"retrievers": [\n  ${0}\n]', '参与融合的子检索器')],
  linear: [B('retrievers', '"retrievers": [\n  { "retriever": {}, "weight": ${1:1} }\n]', '线性加权的子检索器（带 weight）')],
  text_similarity_reranker: [B('retriever', '"retriever": {\n  ${0}\n}', '召回源检索器')],
  rule: [B('retriever', '"retriever": {\n  ${0}\n}', '召回源检索器（可缺席）'), B('match_criteria', '"match_criteria": {\n  ${0}\n}', '规则匹配条件')],
  pinned: [B('retriever', '"retriever": {\n  ${0}\n}', '召回源检索器'), B('docs', '"docs": [\n  ${0}\n]', '置顶文档'), B('ids', '"ids": [${1:\"id\"}]', '置顶文档 ID')],
  diversify: [B('retriever', '"retriever": {\n  ${0}\n}', '召回源检索器'), B('query_vector', '"query_vector": [${1:0.1}]', '多样性参考向量')],
  rescorer: [B('retriever', '"retriever": {\n  ${0}\n}', '召回源检索器'), B('rescore', '"rescore": {\n  ${0}\n}', '重打分体')],
};
export function retrieverBodyKeys(op: string): BodyKey[] {
  const out = [...(RETRIEVER_STRUCT[op] || [])];
  const seen = new Set(out.map(x => x.key));
  for (const p of RETRIEVER_PARAMS[op] || []) {
    if (seen.has(p.key)) continue;
    out.push({ key: p.key, insert: paramInsert(p), detail: '可选参数' });
    seen.add(p.key);
  }
  return out;
}

/* 建议器体键（suggest.<名>.<term|phrase|completion>.{}）——此前该层什么都不出 */
export const SUGGEST_BODY_KEYS: Record<string, BodyKey[]> = {
  term: [
    B('field', '"field": "${1:field}"', '候选来源字段'),
    B('text', '"text": "${1:query}"', '输入文本'),
    B('prefix', '"prefix": "${1:prefix}"', '前缀（优先于 text）'),
    B('suggest_mode', '"suggest_mode": "${1|missing,popular,always|}"', '建议策略'),
    B('min_word_length', '"min_word_length": ${1:3}', '最短词长'),
    B('max_edits', '"max_edits": ${1:2}', '最大编辑距离'),
    B('sort', '"sort": "${1|score,frequency|}"', '候选排序'),
    B('size', '"size": ${1:5}', '每个词的建议数'),
    B('analyzer', '"analyzer": "${1:standard}"', '分词器'),
  ],
  phrase: [
    B('field', '"field": "${1:field}"', '候选来源字段'),
    B('text', '"text": "${1:query}"', '输入文本'),
    B('prefix', '"prefix": "${1:prefix}"', '前缀（优先于 text）'),
    B('gram_size', '"gram_size": ${1:3}', 'n-gram 大小'),
    B('analyzer', '"analyzer": "${1:standard}"', '分词器'),
    B('highlight', '"highlight": { "pre_tag": "${1:<em>}", "post_tag": "${2:</em>}" }', '候选中的纠错高亮'),
    B('collate', '"collate": {\n  ${0}\n}', '候选校验查询'),
    B('size', '"size": ${1:5}', '候选数'),
    B('max_errors', '"max_errors": ${1:1}', '最大错误数'),
  ],
  completion: [
    B('field', '"field": "${1:suggestField}"', 'completion 字段'),
    B('text', '"text": "${1:query}"', '输入文本'),
    B('prefix', '"prefix": "${1:prefix}"', '前缀（优先于 text）'),
    B('contexts', '"contexts": {\n  ${0}\n}', '上下文过滤（category/geo）'),
    B('fuzzy', '"fuzzy": { "fuzziness": ${1:1} }', '模糊匹配'),
    B('skip_duplicates', '"skip_duplicates": ${1|true,false|}', '同文本去重'),
    B('size', '"size": ${1:5}', '候选数'),
    B('analyzer', '"analyzer": "${1:simple}"', '输入分词器'),
    B('search_analyzer', '"search_analyzer": "${1:simple}"', '索引侧分词器'),
  ],
};
export function suggesterBodyKeys(op: string): BodyKey[] {
  return [...(SUGGEST_BODY_KEYS[op] || [])];
}

/* 数组键链白名单位（对标 Kibana sort/_source 补全）。两类白名单各管一个位：
 - 元素对象键位（"sort": [{ "<光标" }]）：数组属主键 ∈ DSL_ARRAY_OBJKEY_CHAINS（=sort，
 排序字段位；top_hits 等嵌套 sort 同构命中），dslContext 出 array-elem-key 档；
 - 元素串位（"_source": ["<光标"]）：数组属主键 ∈ DSL_ARRAY_ELEM_CHAINS（=_source，
 返回字段裁剪），dslKeyGuard 首元素位按白名单回传键链、续元素位走既有 arrayElem 口，
 消费侧出 fields() 字段候选。
 白名单外数组（terms 值/must/ids/filter 元素等）维持既有压制零增量——540/543 契约钉的是
 值位 regime 与 terms 值数组元素位（dslValueTiers540 C 段/544 C 段既有断言），键链白名单
 是新增位，两既有钉面不沾。⚠ dslArrayElemFieldAt 本体零改动（dslValueTiers544 B 段把
 ('_source', null)→null 钉死，_source 走本白名单新轨，不共函数）。 */
const DSL_ARRAY_OBJKEY_CHAINS = new Set(['sort', 'fields']);
/* 'sort'：简写串形态（"sort": ["ts"] / top_hits.sort）元素就是字段名——1439 补 */
export const DSL_ARRAY_ELEM_CHAINS = new Set(['_source', 'stored_fields', 'docvalue_fields', 'fields', 'includes', 'excludes', 'sort']);

type Frame = { type: '{' | '['; lastKey: string | null; start: number };

/* 引号是否被转义：紧邻的反斜杠 run 长度为奇数才算转义（偶数含 0 → \\ 自身是转义反斜杠，其后的引号仍关闭字符串）。
 单一真源：luceneContext / MonacoEditor（dslKeyGuard、scanStringEnd）复用，口径不各自重写。 */
export function isEscapedQuote(s: string, j: number): boolean {
  let n = 0;
  for (let k = j - 1; k >= 0 && s[k] === '\\'; k--) n++;
  return n % 2 === 1;
}

/** 注释跳过：text[i]==='/' 且非字符串内时，行注释跳到行尾、块注释跳到结束标记之后。
 返回注释结束后的下一个下标（exclusive，即继续扫描的起点）；非注释返回 -1。 */
export function commentEnd(text: string, i: number): number {
  if (i < 0 || i + 1 >= text.length || text[i] !== '/') return -1;
  if (text[i + 1] === '/') {
    let j = i + 2;
    while (j < text.length && text[j] !== '\n') j++;
    return j;
  }
  if (text[i + 1] === '*') {
    let j = i + 2;
    while (j + 1 < text.length && !(text[j] === '*' && text[j + 1] === '/')) j++;
    return j + 2;
  }
  return -1;
}

/**
 * 1439：光标是否在**值位**（`"key": |` 的冒号之后）。
 * 聚合体/建议器/检索器的键补全只看栈结构会把值位也当键位
 * （`{"aggs":{"a":{"terms":{"field": "` 会错误地给出参数键）。判据：取当前串的开引号
 * （不在串内则取光标前）往前看最后一个非空字符是不是冒号。
 */
function atValuePosition(text: string, inStr: boolean): boolean {
  let i = text.length - 1;
  if (inStr) {
    while (i >= 0 && !(text[i] === '"' && !isEscapedQuote(text, i))) i--;
    i--;
  }
  while (i >= 0 && /\s/.test(text[i])) i--;
  return i >= 0 && text[i] === ':';
}

/* terms.order 还能按同实例下的子聚合排序，但 ES 只接受**单值数值度量**
   （single-value numeric metric）；桶聚合/top_hits/stats 这类写进去会被拒。 */
const ORDERABLE_SUB_AGG_TYPES = new Set([
  'avg', 'min', 'max', 'sum', 'cardinality', 'value_count',
  'median_absolute_deviation', 'weighted_avg',
]);

/** 从聚合实例对象（instanceStart 处的 `{`）扫出它自己的 aggs 容器里的子聚合名与类型。
    只认单值数值度量；实例内更深层的 aggs、数组元素、字符串值都不会误收。 */
function aggOrderSubAggsAt(doc: string, instanceStart: number): Array<{ name: string; type: string }> {
  type F = { key: string | null; parent: number; firstKey: string | null };
  /* all 保留全部节点（含已闭合的 aggs 容器）；open 只存仍开着的节点下标 */
  const all: F[] = [{ key: null, parent: -1, firstKey: null }];
  const open: number[] = [0];
  let inStr = false; let cur = ''; let pending: string | null = null;
  for (let i = instanceStart + 1; i < doc.length; i++) {
    const ch = doc[i];
    if (inStr) {
      if (ch === '"' && !isEscapedQuote(doc, i)) {
        inStr = false;
        let j = i + 1;
        while (j < doc.length && /\s/.test(doc[j])) j++;
        if (doc[j] === ':') {
          const top = all[open[open.length - 1]];
          if (top.firstKey === null) top.firstKey = cur;
          pending = cur;
        }
      } else cur += ch;
      continue;
    }
    const cEnd = commentEnd(doc, i);
    if (cEnd !== -1) { i = cEnd - 1; continue; }
    if (ch === '"') { inStr = true; cur = ''; continue; }
    if (ch === '{') {
      all.push({ key: pending, parent: open[open.length - 1], firstKey: null });
      open.push(all.length - 1);
      pending = null;
      continue;
    }
    if (ch === '}') {
      if (open.length === 1) break; /* 实例对象闭合，后面的结构与本实例无关 */
      open.pop(); pending = null;
      continue;
    }
    if (!/[\s:]/.test(ch)) pending = null; /* 键后面不是对象（字符串/数组/数字）→ 不挂到下一帧 */
  }
  const aggsIdx = all.findIndex(f => f.parent === 0 && (f.key === 'aggs' || f.key === 'aggregations'));
  if (aggsIdx < 0) return [];
  const out: Array<{ name: string; type: string }> = [];
  const seen = new Set<string>();
  for (const f of all) {
    if (f.parent !== aggsIdx || !f.key || !f.firstKey || seen.has(f.key)) continue;
    if (!ORDERABLE_SUB_AGG_TYPES.has(f.firstKey)) continue;
    seen.add(f.key);
    out.push({ name: f.key, type: f.firstKey });
  }
  return out;
}

export function dslContext(doc: string, offset: number): DslCtx {
  const text = doc.slice(0, Math.max(0, Math.min(offset, doc.length)));
  const stack: Frame[] = [];
  let inStr = false; let curKey = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '"' && !isEscapedQuote(text, i)) {
        inStr = false;
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        if (text[j] === ':' && stack.length) stack[stack.length - 1].lastKey = curKey;
      } else curKey += ch;
      continue;
    }
    const cEnd = commentEnd(text, i);
    if (cEnd !== -1) { i = cEnd - 1; continue; }  // for 的 i++ 会让下次从 cEnd 开始
    if (ch === '"') { inStr = true; curKey = ''; continue; }
    if (ch === '{') stack.push({ type: '{', lastKey: null, start: i });
    else if (ch === '[') stack.push({ type: '[', lastKey: null, start: i });
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (!stack.length) return { kind: 'root' };
  const keys = stack.map(f => f.lastKey);
  /* 1439：值位（冒号之后）不出键位档——否则 `"field": "` 这种位置会被当成键位 */
  const valuePos = atValuePosition(text, inStr);
  let qIdx = keys.lastIndexOf('query');
  /* 1138：post_filter / 顶层 knn.filter 也是查询容器——此前只认 query 键，
     这两处合法查询位不出 query-type/字段候选。顶层 knn 是首选 kNN 形态。 */
  if (qIdx < 0) {
    const pf = keys.lastIndexOf('post_filter');
    if (pf >= 0 && pf < stack.length - 1) qIdx = pf;
    else {
      const knn = keys.lastIndexOf('knn');
      const knnFilter = keys.lastIndexOf('filter');
      if (knn >= 0 && knnFilter > knn && knnFilter < stack.length - 1) qIdx = knnFilter;
      /* 1439：顶层 filter 也是查询容器（SQL 体的 "filter" 是 Query DSL；
         别名 filter 同形）——此前这里零候选。只认根层，避免 aggs.filter 等深层误扩 */
      else if (keys[0] === 'filter' && stack.length > 1) qIdx = 0;
      /* 1439：_field_caps / _terms_enum 的 index_filter 是 Query DSL——同样回落查询补全 */
      else if (keys[0] === 'index_filter' && stack.length > 1) qIdx = 0;
    }
  }
  /* 在 query 内 ⟺ 某层帧 lastKey='query' 且其上方还有帧（query 值容器未闭合）。
 qIdx 即栈顶 → query 值已闭合（或尚在值位前），光标回到 query 所在层。 */
  const inQuery = qIdx >= 0 && qIdx < stack.length - 1;
  if (!inQuery) {
    /* 2.6.0 聚合上下文（spec ）：lastIndexOf 取最近 aggs/aggregations 帧——嵌套聚合天然支持。
 innerA.length===1 → aggs 容器键位（agg-name，实例自由命名）；
 ===2 → 实例值对象键位（agg-type，聚合类型骨架）。 */
    const aIdx = Math.max(keys.lastIndexOf('aggs'), keys.lastIndexOf('aggregations'));
    if (aIdx >= 0 && aIdx < stack.length - 1) {
      const innerA = stack.slice(aIdx + 1);
      if (innerA.length === 1 && innerA[0].type === '{') return { kind: 'agg-name' };
      if (innerA.length === 2 && innerA[1].type === '{') return { kind: 'agg-type' };
      /* 1439：聚合体内部键位（aggs → 实例名 → 类型键 → body {}）——
         此前这里什么都没有，Ctrl+Space 只给文档里出现过的词（a/aggs/terms），
         真实参数键（size/min_doc_count/field…）一个也补不出来。 */
      if (innerA.length === 3 && innerA[2].type === '{' && innerA[1].lastKey && !valuePos) {
        /* filter 聚合的体是**查询子句**（{"filter":{"term":{…}}}），不是聚合参数——
           这里必须出 query-type（match/term/bool…），否则只剩一个 aggs 候选。 */
        if (innerA[1].lastKey === 'filter') return { kind: 'query-type' };
        return { kind: 'agg-body-key', op: innerA[1].lastKey };
      }
      /* 1439：terms / multi_terms 的 order 对象键位——排序依据只有 _count/_key 系，
         此前这层什么都不出（只能凭记忆）。innerA[1]=聚合类型帧。 */
      if (innerA.length === 4 && innerA[3].type === '{' && !valuePos
          && (innerA[1].lastKey === 'terms' || innerA[1].lastKey === 'multi_terms')) {
        return {
          kind: 'agg-order-key',
          /* multi_terms 的 order 只认 _count/_key 系，子聚合名只有 terms 支持 */
          subAggs: innerA[1].lastKey === 'terms' ? aggOrderSubAggsAt(doc, innerA[1].start) : [],
        };
      }
      /* 1439：同一 order 对象的**值位**给方向 asc/desc（键位补完就该补方向） */
      if (innerA.length === 4 && valuePos
          && (innerA[1].lastKey === 'terms' || innerA[1].lastKey === 'multi_terms')) {
        return { kind: 'agg-order-dir' };
      }
      /* 1439：filters 聚合的**具名子过滤器体**同样是查询：
         {"filters":{"filters":{"x":{ <cursor> }}}} → aggs → filters(类型) → filters(参数) → 名 → {}
         命名位本身（再上一层的 { 仍在 filters 参数对象里）不出 query-type。 */
      if (stack.length >= 5 && stack[stack.length - 1].type === '{'
          && stack[stack.length - 3].lastKey === 'filters'
          && stack[stack.length - 4].lastKey === 'filters' && !valuePos) {
        return { kind: 'query-type' };
      }
    }
    /* 1439：排序链两个位置此前只给文档词——
       · 简写方向值 {"sort":[{"title":" → asc/desc
       · 字段配置键 {"sort":[{"title":{ → order/mode/missing/unmapped_type/nested */
    if (valuePos && stack.length >= 3 && stack[stack.length - 1].type === '{'
        && stack[stack.length - 2].type === '[' && stack[stack.length - 3].lastKey === 'sort') {
      return { kind: 'sort-order' };
    }
    if (!valuePos && stack.length >= 4 && stack[stack.length - 1].type === '{'
        && stack[stack.length - 2].type === '{' && stack[stack.length - 3].type === '['
        && stack[stack.length - 4].lastKey === 'sort') {
      return { kind: 'sort-opt-key' };
    }
    /* 1439：highlight.fields 的键是**字段名**——此前这里只给文档里出现过的词，
       而高亮字段必须来自 mapping（打错就是静默不高亮）。 */
    if (!valuePos && stack.length >= 3 && stack[stack.length - 1].type === '{'
        && keys[keys.length - 2] === 'fields' && keys[keys.length - 3] === 'highlight') {
      return { kind: 'field-key' };
    }
    /* 1439：建议器类型键位——suggest → 建议器名 → {} 的内层键位（与 aggs 同形） */
    const sIdx = keys.lastIndexOf('suggest');
    if (sIdx >= 0 && sIdx < stack.length - 1) {
      const innerS = stack.slice(sIdx + 1);
      if (innerS.length === 2 && innerS[1].type === '{' && !valuePos) return { kind: 'suggester-type' };
    }
    /* 1439：检索器变体键位（8.14+ retriever 面）。
       · 顶层/嵌套：光标在 retriever 的值对象里（keys 末位是 retriever，栈顶是它刚开的 {）
       · 列表元素：rrf.retrievers[] / linear.retrievers[] 的元素对象键位——但 linear 的元素
         必须是 {retriever, weight} 包裹，那里给裸变体键会产生非法 DSL，故按父键排除。 */
    const rIdx = keys.lastIndexOf('retriever');
    if (rIdx >= 0) {
      const topF = stack[stack.length - 1];
      if (rIdx === stack.length - 2 && topF.type === '{' && !valuePos) return { kind: 'retriever-type' };
      if (stack.length >= 4 && topF.type === '{'
          && stack[stack.length - 2].type === '['
          && stack[stack.length - 3].lastKey === 'retrievers'
          && stack[stack.length - 4].lastKey !== 'linear' && !valuePos) return { kind: 'retriever-type' };
      /* 1439：检索器变体体键位——retriever.standard.{query}、retriever.knn.{field/query_vector}；
         此前这层什么都不出（Ctrl+Space 只有文档词）。 */
      if (rIdx === stack.length - 3) {
        const variant = stack[rIdx + 1].lastKey;
        if (variant && RETRIEVER_STRUCT[variant] && topF.type === '{' && !valuePos) {
          return { kind: 'retriever-body-key', op: variant };
        }
      }
    }
    /* 1439：根层/嵌套容器的体键位——collapse/highlight/knn/rescore/pit/inner_hits，
       以及 script_fields / runtime_mappings 下的自由字段体（合成键）。owner 键 = 栈顶容器
       的上一层帧 lastKey；此前这些位置一律 none。 */
    if (stack[stack.length - 1].type === '{' && !valuePos) {
      /* opening = 打开栈顶对象的那把键；container = 再上层的容器键（自由字段名容器用） */
      const opening = stack.length >= 2 ? stack[stack.length - 2].lastKey : null;
      const container = stack.length >= 3 ? stack[stack.length - 3].lastKey : null;
      /* 建议器体必须先判：suggest.<名>.<term|…>.{} 的 opening 是建议器类型名，
         落到同名查询子句表会给出 value/fuzziness 之类错误的键。 */
      const sIdx2 = keys.lastIndexOf('suggest');
      if (sIdx2 >= 0 && keys.length >= sIdx2 + 3 && opening && SUGGEST_BODY_KEYS[opening]) {
        return { kind: 'suggester-body-key', op: opening };
      }
      if (opening === 'script') return { kind: 'query-body-key', op: '__script__' };
      if (opening && QUERY_BODY_KEYS[opening]) return { kind: 'query-body-key', op: opening };
      if (container === 'script_fields') return { kind: 'query-body-key', op: '__script_field__' };
      /* highlight.fields.<字段>.{} —— 字段级高亮配置（fragment_size/pre_tags…） */
      if (container === 'fields' && stack.length >= 4 && stack[stack.length - 4].lastKey === 'highlight') {
        return { kind: 'query-body-key', op: '__highlight_field__' };
      }
      if (container === 'runtime_mappings') return { kind: 'query-body-key', op: '__runtime_field__' };
    }
    /* 数组元素对象键位（键链白名单位）——栈顶 { 的下层是 [ 数组帧、数组帧属主键
 ∈ DSL_ARRAY_OBJKEY_CHAINS（=sort，排序字段键位；top_hits 等嵌套 sort 同构命中）。
 白名单外数组（must/filter 等元素对象）不在此出层，既有 query-type/field 口径零变化；
 sort 元素对象内再开对象（"order": 位）栈顶下层是 { 不是 [，不命中——540 钉 none 面不沾。 */
    if (stack.length >= 3) {
      const topF = stack[stack.length - 1];
      const arrF = stack[stack.length - 2];
      const ownerKey = stack[stack.length - 3].lastKey;
      if (topF.type === '{' && arrF.type === '[' && ownerKey && DSL_ARRAY_OBJKEY_CHAINS.has(ownerKey)) {
        return { kind: 'array-elem-key', owner: ownerKey };
      }
    }
    /* 仅剩根帧 → 根层键位（query 闭合后回根层同口径）；更深但不在 query/aggs → 不出层 */
    return stack.length === 1 && stack[0].type === '{' ? { kind: 'root' } : { kind: 'none' };
  }
  /* range-op ⟺ range → 字段名 → { 三层（inner 尾三帧：range帧/字段帧/栈顶{）——
 操作符位出 gte/gt/lt/lte，替换旧「兜底 query-type」的误导出档 */
  const inner = stack.slice(qIdx + 1);
  if (inner.length >= 3) {
    const rangeFrame = inner[inner.length - 3];
    const fieldFrame = inner[inner.length - 2];
    const top = inner[inner.length - 1];
    if (top.type === '{' && rangeFrame.lastKey === 'range' && fieldFrame.lastKey) {
      return { kind: 'range-op' };
    }
  }
  /* 字段名位 ⟺ 栈顶是 { 且紧邻下层帧的最近键是叶子子句——栈顶即该子句的值对象。
 不看栈顶自身 lastKey：已填字段名（'match:{"title":"x", |'）不丢 field 上下文 */
  if (inner.length >= 2) {
    const clauseFrame = inner[inner.length - 2];
    const top = inner[inner.length - 1];
    if (top.type === '{' && clauseFrame.lastKey && FIELD_CLAUSES.has(clauseFrame.lastKey)) {
      return { kind: 'field', clause: clauseFrame.lastKey };
    }
    /* exists-key：exists 值对象键位钉死 "field"（2.6.0 语义纠错，spec 规则 4） */
    if (top.type === '{' && clauseFrame.lastKey === 'exists') {
      return { kind: 'exists-key' };
    }
    /* 1439：字段子句的字段配置对象——{"match":{"title":{ <光标> }}} 是配 query/operator
       的位置，此前回 query-type（键位给出 bool/term 等算子骨架，写进去必非法）。 */
    if (top.type === '{' && inner.length >= 3) {
      const op = inner[inner.length - 3].lastKey;
      if (op && CLAUSE_VALUE_KEYS[op]) return { kind: 'clause-field-key', op };
    }
    /* 1439：子句体键位——bool 的 must/filter、nested 的 path/query、multi_match 的
       query/fields、ids 的 values…；此前一律 query-type。函数数组元素单独一档
       （frame 是数组帧，"functions" 不是子句名）。 */
    if (top.type === '{') {
      /* 数组帧自身的 lastKey 恒 null——属主键在下层帧（"functions": [ 的 'functions'） */
      if (clauseFrame.type === '[' && inner.length >= 3 && inner[inner.length - 3].lastKey === 'functions') {
        return { kind: 'query-body-key', op: '__function__' };
      }
      const op = clauseFrame.lastKey;
      if (op && QUERY_BODY_KEYS[op]) return { kind: 'query-body-key', op };
      /* function_score.functions[] 的函数体（gauss/linear/exp.<字段>.{}）——
         函数名在数组元素帧上，字段名在它下一层，普通子句判定看不到 */
      if (inner.length >= 5) {
        const fnFrame = inner[inner.length - 3];
        const arrFrame = inner[inner.length - 4];
        /* 数组帧的属主键在下一层帧上（"functions": [ 的 'functions'）——
           函数体可能嵌在 bool 元素里，不能假设 function_score 帧固定相对位置 */
        if (arrFrame.type === '[' && inner[inner.length - 5].lastKey === 'functions'
            && fnFrame.lastKey && QUERY_BODY_KEYS[fnFrame.lastKey]) {
          return { kind: 'query-body-key', op: fnFrame.lastKey };
        }
      }
    }
  }
  return { kind: 'query-type' };
}

/* DSL 字段位算子→类型亲和置顶序（纯函数，零 UI 变化——只调序不改候选集）。
 typePriorityForOp 的置顶档按「族」描述（text/keyword/number/date…），族展开为具体 mapping
 类型供字段清单 rank：族表对齐本仓既有口径——数值族九种（LuceneInput NUMERIC_TYPES 同表）、
 keyword 族含 wildcard（queryAstOps.opsForType keyword||wildcard 同分支）、date 族含
 date_nanos（MAPPING_TYPES 在册）；表外键兜底原样进序（typePriorityForOp 将来直出具体类型不破）。
 field 档候选按 ctx.clause（该子句值位同级 op 键）取亲和序：命中类型排前（保 prio 原序），
 未命中垫底（同档保原序）；无类型倾向算子 prio 空 → 原序直通。 */
const AFFINITY_FAMILIES: Record<string, string[]> = {
  text: ['text', 'annotated_text'],
  /* 两族改吃 queryAstOps 单源（值与原 literal 逐字同形）——keyword 三员直用；
 number 九口径=十口径滤 token_count（分词计数无 range 精确语义，AFFINITY 序零变） */
  keyword: KEYWORD_VALUE_TYPES,
  number: NUMERIC_VALUE_TYPES.filter(t => t !== 'token_count'),
  date: ['date', 'date_nanos'],
  boolean: ['boolean'],
  ip: ['ip'],
};

/** 子句算子 → 字段位置顶具体类型序（typePriorityForOp 族展开；无类型倾向算子返回 []） */
export function dslFieldAffinityTypes(op: string): string[] {
  const out: string[] = [];
  for (const fam of typePriorityForOp(op)) {
    for (const t of AFFINITY_FAMILIES[fam] || [fam]) if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** 字段候选按当前子句算子的类型亲和度置顶（稳定排序：命中亲和类型排前且保持 prio 原序，
 同档/未命中保原序——只改序不改候选集；exists 等无倾向算子原序直通） */
export function orderFieldsByClauseOp<T extends { type: string }>(fields: T[], clause: string): T[] {
  const prio = dslFieldAffinityTypes(clause);
  const rank = (t: string) => { const i = prio.indexOf(t); return i === -1 ? prio.length : i; };
  return fields
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f.type) - rank(b.f.type) || a.i - b.i)
    .map(x => x.f);
}

/* DSL 字段位算子→类型置顶序（原始序版）——MonacoEditor 本地 orderFieldsByType
 原样收口进册（原地 diff 裁定：与 orderFieldsByClauseOp 语义**有差**，不合并）。
 本函数直消费 typePriorityForOp 的原始序、不做亲和族展开：term 位 type='wildcard'
 字段不命中（keyword 本名独占置顶）、range 位 date_nanos 不命中（date 本名才命中）；
 orderFieldsByClauseOp 走 dslFieldAffinityTypes 族展开，两版各有消费面。
 排序稳定性/未知算子行为与族展开版逐字节同构：map-index 稳定排序、
 prio 空（exists/未知算子）→ rank 恒 0 → 原序直通。 */
export function orderFieldsByTypeForOp<T extends { type: string }>(fields: T[], op: string): T[] {
  const prio = typePriorityForOp(op);
  const rank = (t: string) => { const i = prio.indexOf(t); return i === -1 ? prio.length : i; };
  return fields
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f.type) - rank(b.f.type) || a.i - b.i)
    .map(x => x.f);
}

/* DSL 值位类型档静态候选（date/ip 两档）——语义平移自 sqlCompletion.VAL_FORMAT_HINTS
 同名档（date→date-math、ip→点分字面）与 LuceneInput DATE/IP_HINTS 先例；
 只提示格式不约束输入，任意值仍可手输。表外类型不入表=消费侧维持既有压制。
 本表**保持 date/ip 两档零变动**——dslValueTiers540 B 段把表内容钉死（keyword/
 boolean/long/integer/double toBeUndefined）、C 段把 term/keyword 与 range/数值 值位压制钉死，
 且 「date-math·ip 外值形态（产品裁决）」：':' 值串位的类型档 regime 冻结。
 keyword/数值/boolean 形态档落姊妹表 DSL_ARRAY_ELEM_TYPE_HINTS（见下），仅数组元素位
 链路消费；540 契约将来演进放开后两表可并。
 同步更新修订合并 date_nanos + geo_point 两档（dslValueTiers540 B 段 toBeUndefined
 负锁同步更新注记修订， root-bare-clause 修订同款先例）——姊妹面 546/547/552/已四批
 扩档（date_nanos≡date 族、geo_point '纬度,经度'），本表的 540 收窄 regime 不再成立，
 detail 与 values 自 sqlCompletion VAL_FORMAT_HINTS 同名档逐字平移；仍只提示格式不约束输入。 */
export const DSL_VALUE_TYPE_HINTS: Record<string, { detail: string; values: string[] }> = {
  date: { detail: 'date-math 格式提示 · date', values: ['now-1d/d', 'now-1h/h'] },
  date_nanos: { detail: 'date-math 格式提示 · date_nanos', values: ['now-1d/d', 'now-1h/h'] },
  ip: { detail: '字面提示 · ip', values: ['192.168.0.1'] },
  geo_point: { detail: '字面提示 · geo_point', values: ['40.71,-74.01'] },
};

/* 数组元素位形态档（DSL_VALUE_TYPE_HINTS 的姊妹表，仅 terms 值数组续元素位链路
 消费——dslKeyGuard arrayElem 键链口）。keyword 族（含 wildcard——queryAstOps keyword||wildcard
 同分支口径）通配形态 pref*（wildcard 语义，QUERY_SNIPPETS wildcard 骨架 "${2:pref*}" 同形
 先例）、数值族八类型字面数字（整型 1/浮点 1.5，整浮分档只提示形态；AFFINITY number 族第九种
 unsigned_long 未点名不入表）、boolean true/false；detail 与 date/ip 档同形
 （'字面提示 · <type>'）。只提示形态不约束输入，任意值仍可手输。 */
export const DSL_ARRAY_ELEM_TYPE_HINTS: Record<string, { detail: string; values: string[] }> = {
  keyword: { detail: '字面提示 · keyword', values: ['pref*'] },
  wildcard: { detail: '字面提示 · wildcard', values: ['pref*'] },
  long: { detail: '字面提示 · long', values: ['1'] },
  integer: { detail: '字面提示 · integer', values: ['1'] },
  short: { detail: '字面提示 · short', values: ['1'] },
  byte: { detail: '字面提示 · byte', values: ['1'] },
  double: { detail: '字面提示 · double', values: ['1.5'] },
  float: { detail: '字面提示 · float', values: ['1.5'] },
  half_float: { detail: '字面提示 · half_float', values: ['1.5'] },
  scaled_float: { detail: '字面提示 · scaled_float', values: ['1.5'] },
  boolean: { detail: '字面提示 · boolean', values: ['true', 'false'] },
};

/** 值位字段解析（dslKeyGuard 键链 → 字段路径；非字段值位返回 null 维持压制）。
 叶子子句直挂值位（"term": { "<vk>": "<光标" ）→ 字段=vk；
 range 操作符值位（"range": { "<pk>": { "<vk>": "<光标 ）→ 字段=pk，vk 限 RANGE_OPS 四操作符
 （time_zone/format 等元键出 date-math 候选是误导）。
 aggs 的 terms/date_histogram 与查询子句撞名：解析层只出「形态上的字段名」，是否真字段
 由消费侧 fields() 精确查表把关（interval 等实例键查无此字段 → 压制）。 */
export function dslValueFieldAt(valueKey: string, parentKey: string | null, grandKey: string | null): string | null {
  if (parentKey && FIELD_CLAUSES.has(parentKey)) return valueKey;
  if (grandKey === 'range' && RANGE_OPS[valueKey] !== undefined) return parentKey;
  return null;
}

/** 数组元素位字段解析（dslValueFieldAt 的姊妹——值数组的元素串位没有「当前键」，
 字段=数组属主键。"terms": { "<field>": [ "x", "<光标" ）→ ownerKey（数组的属主键）∈ 叶子
 子句（FIELD_CLAUSES 同表）且 elemKey 非空 → 字段=elemKey；must/ids/_source/sort 等非字段
 值数组 → null 维持压制。与 dslValueFieldAt 同一哲学：解析层只出「形态上的字段名」，是否真
 字段由消费侧 fields() 精确查表把关。首元素位（'[' 左邻）是 dslValueTiers540 契约 spec 既有
 断言钉死的压制面，不在解锁面——dslKeyGuard 只对续元素位（',' 左邻且栈顶 '['）回传键链。 */
export function dslArrayElemFieldAt(elemKey: string | null, ownerKey: string | null): string | null {
  if (elemKey && ownerKey && FIELD_CLAUSES.has(ownerKey)) return elemKey;
  return null;
}

/* W6：DevTools body 端点语义分级——bodyKind 判定 + settings/mapping 档数据源。
 纯函数零请求；settings 档复用 W1 SETTINGS_CATALOG（带中文说明）。
 增 'doc' 档——文档体（GET/PUT /idx/_doc/1、_create、_source 端点）
 键位零候选（_source 字段名自由，出 root 查询键骨架是误导）、仅 field 值位白名单出字段候选。
 增 'update-body' 档——_update 的体是 {doc/upsert/script…} 结构化体（doc 内仍按裸文档压制）；
 增 'rollover-body' 档——_rollover 体按 {conditions/settings/mappings/aliases} 分区给键。
 增 'analyze' 档——_analyze body（视图侧 bodyKind: () => 'analyze' 直传，
 不吃 bodyKindForPath 分派）；键位出 ANALYZE_KEY_SNIPPETS 八键骨架，
 值位分派见 MonacoEditor computeSuggestions analyze 分支。 */
export type BodyKind = 'search' | 'settings' | 'mapping' | 'template' | 'doc' | 'analyze' | 'index-body' | 'alias-body' | 'aliases-body' | 'reindex-body' | 'sql-body' | 'update-body' | 'rollover-body' | 'dbq-body' | 'ubq-body' | 'query-body' | 'template-search-body' | 'mget-body' | 'stored-script-body' | 'script-execute-body' | 'scroll-body' | 'clear-scroll-body' | 'termvectors-body' | 'mtermvectors-body' | 'msearch-body' | 'msearch-template-body' | 'bulk-body' | 'field-caps-body' | 'terms-enum-body' | 'rank-eval-body' | 'eql-body' | 'cluster-settings-body' | 'reroute-body' | 'allocation-explain-body'
| 'snapshot-repo-body' | 'snapshot-create-body' | 'snapshot-restore-body' | 'slm-policy-body' | 'ilm-policy-body' | 'watch-body'
| 'security-role-body' | 'security-user-body' | 'security-role-mapping-body' | 'security-api-key-body' | 'ingest-pipeline-body' | 'ingest-simulate-body' | 'enrich-policy-body' | 'transform-body' | 'rollup-job-body' | 'ml-datafeed-body' | 'ml-job-body'
| 'ml-filter-body' | 'ml-calendar-body' | 'ml-calendar-events-body' | 'graph-explore-body'
| 'ccr-follow-body' | 'ccr-auto-follow-body' | 'security-api-key-grant-body' | 'license-body'
| 'security-api-key-query-body' | 'security-api-key-invalidate-body' | 'ml-filter-update-body'
| 'security-cross-cluster-api-key-body' | 'watch-execute-body'
| 'security-privilege-body' | 'ilm-move-body' | 'snapshot-clone-body' | 'watch-inline-execute-body'
| 'snapshot-mount-body' | 'nodes-reload-secure-settings-body' | 'none';

/* _analyze body 键骨架（analyze 档键位候选，snippet+detail 与 W6 三档同形态）。
 analyzer/field 互斥（二选一）；filter/char_filter 是数组骨架。 */
export const ANALYZE_KEY_SNIPPETS: Record<string, { text: string; detail: string }> = {
  analyzer:    { text: '"analyzer": "${1:standard}"',              detail: '指定分词器（内置名或自定义组件名）' },
  text:        { text: '"text": "${1:待分词文本}"',                  detail: '待分词文本（与 field 二选一）' },
  field:       { text: '"field": "${1:field}"',                    detail: '用该字段的分词链分词（与 analyzer 二选一）' },
  tokenizer:   { text: '"tokenizer": "${1:standard}"',             detail: '覆盖 tokenizer（内置名或自定义组件名）' },
  filter:      { text: '"filter": [\n  "${1:lowercase}"\n]',       detail: '覆盖 filter 链（数组）' },
  char_filter: { text: '"char_filter": [\n  "${1:html_strip}"\n]', detail: '覆盖 char_filter 链（数组）' },
  normalizer:  { text: '"normalizer": "${1:lowercase}"',           detail: 'keyword 字段的归一器' },
  explain:     { text: '"explain": ${1|true,false|}',              detail: '输出分词过程明细（每个 token 经过的组件）' },
};

/* analyzer/search_analyzer/normalizer/tokenizer 值位内置清单（analyze 档）。
 ik_* 拆两个实名（console 目标集群标配插件分词器）；实名自定义组件由视图侧
 dslAssist.analyzers() 通道并入（与 mapping 档 524+1 通道同一闭包契约），缺席=纯内置。 */
export const BUILTIN_ANALYZERS = ['standard', 'simple', 'whitespace', 'stop', 'keyword', 'pattern', 'fingerprint', 'ik_max_word', 'ik_smart'];

/* analysis 内置组件三张同族表（与 BUILTIN_ANALYZERS 同位置同风格——
 AnalyzerLab 自定义组合 tokenizer/char_filter/filter 三输入 datalist 候选源，各归其位，
 不再与 analyzer 名混表）。只做提示零请求；缺席=自定义组件名（视图侧 analyzers() 通道
 并入先例同轨，后续消费方照此并）。ik 族照附（插件分词组件，console 目标集群标配）。 */
export const BUILTIN_TOKENIZERS = ['standard', 'keyword', 'whitespace', 'letter', 'lowercase', 'ngram', 'edge_ngram', 'path_hierarchy', 'pattern', 'ik_max_word', 'ik_smart'];
export const BUILTIN_CHAR_FILTERS = ['html_strip', 'mapping', 'pattern_replace'];
export const BUILTIN_TOKEN_FILTERS = ['lowercase', 'stop', 'asciifolding', 'stemmer', 'synonym', 'synonym_graph', 'trim', 'unique', 'truncate', 'word_delimiter', 'shingle', 'snowball', 'ik_max_word', 'ik_smart'];

/* analysis 内置组件名中文释义表（AnalyzerLab 四 datalist option 挂 title——
 「候选只有英文名不知是干嘛的」根治面；esEnumZh 面向字段类型不掺 analysis 组件，本表
 随四张 BUILTIN_* 同放此处）。键覆盖 BUILTIN_ANALYZERS/TOKENIZERS/CHAR_FILTERS/
 TOKEN_FILTERS 四表全员；表外键回落空串（消费侧 `|| ''`，缺席零扰动零误挂）。 */
export const ANALYZER_COMPONENT_ZH: Record<string, string> = {
  standard: '标准分词器：Unicode 词边界切分，中英文通用',
  simple: 'simple：非字母字符切分并转小写',
  whitespace: 'whitespace：仅按空白切分，不做小写化',
  stop: 'stop：小写化并移除停用词（the/a/…）',
  keyword: 'keyword：整串作为单个词元，不切分',
  pattern: 'pattern：按正则匹配到的分隔切分',
  fingerprint: 'fingerprint：排序去重后拼接成单词元（指纹）',
  ik_max_word: 'ik 最细粒度切分：尽可能多地输出组合词',
  ik_smart: 'ik 智能切分：粗粒度，歧义最少',
  letter: 'letter：非字母字符切分',
  lowercase: 'lowercase：非字母切分并转小写（tokenizer）',
  ngram: 'ngram：滑动窗口切出任意 n 元片段',
  edge_ngram: 'edge_ngram：只从前缀方向切 n 元（前缀搜索）',
  path_hierarchy: 'path_hierarchy：按路径分隔符切层级（a/b/c → a、a/b、a/b/c）',
  html_strip: 'html_strip：剥除 HTML 标签只留文本',
  mapping: 'mapping（char_filter）：按映射表替换指定字符串',
  pattern_replace: 'pattern_replace：按正则定位并替换片段',
  asciifolding: 'asciifolding：带音标字符转 ASCII（é → e）',
  stemmer: 'stemmer：词干化（还原词的原形）',
  snowball: 'snowball：Snowball 算法词干化',
  synonym: 'synonym：同义词归一（单词形态）',
  synonym_graph: 'synonym_graph：图结构同义词（支持多词同义）',
  trim: 'trim：去掉词元首尾空白',
  unique: 'unique：去掉重复词元',
  truncate: 'truncate：超长词元截断',
  word_delimiter: 'word_delimiter：按大小写/数字/连字符边界拆分复合词',
  shingle: 'shingle：相邻词元组合成词组（bigram 等）',
};

/* analyzer 高频参数中文词表（AnalysisSettingsView 条目展开参数释义串消费，
 「analysis 组件参数只见英文名不知作用」根治面）。键=自定义组件配置体高频出现的参数名；
 词表外键回落空串（消费侧 filter 后拼串，零扰动零误挂）。 */
export const ANALYSIS_PARAM_ZH: Record<string, string> = {
  analyzer: '分词器（分析入口，与 tokenizer 二选一）',
  search_analyzer: '查询侧分词器（缺省沿用索引侧 analyzer）',
  tokenizer: '切词器（把字符流切成词元）',
  filter: '词元过滤器链（数组，按序生效）',
  char_filter: '字符过滤器链（数组，切词前改写字符流）',
  normalizer: '归一器（keyword 字段的规范化管线）',
  max_token_length: '单个词元最大长度（超长切分）',
  synonyms_path: '同义词库路径（相对 config/）',
  stopwords: '停用词清单（_none_ 关闭或语言名）',
  stopwords_path: '停用词文件路径（相对 config/）',
  mapping: '字符映射表（mapping 型 char_filter 的替换对）',
  aliases: '词干规则别名（stemmer/snowball 的同义形态）',
  type: '组件类型（custom 或内置名）',
  preserve_original: '保留原词（词干/去重等过滤器是否保留原始词元）',
  /* 参数词表扩容（ngram/edge_ngram/shingle/pattern_replace/stemmer 高频参数，
 AnalysisSettingsView 条目展开释义串同通道消费；表外键回落空串零扰动） */
  min_gram: '最小词元长度（ngram/edge_ngram 切分下限）',
  max_gram: '最大词元长度（ngram/edge_ngram 切分上限）',
  pattern: '匹配正则（pattern_replace/pattern_capture 按它定位片段）',
  replacement: '替换串（pattern_replace 命中后的改写结果）',
  flags: '正则标志（CASE_INSENSITIVE / MULTILINE 等）',
  language: '词干化语言（stemmer/snowball，如 english）',
  stem_exclusion: '词干排除词表（在册词不做词干化）',
  max_shingle_size: '组合词元最大个数（shingle 拼接上限）',
  min_shingle_size: '组合词元最小个数（shingle 拼接下限）',
  separator: '组合词元连接符（shingle 默认空格）',
};

/** 端点 path → body 语义档。自由路径默认 search（补全只是建议，零降级）。 */
export function bodyKindForPath(rawPath: string, method = ''): BodyKind {
  const p = (rawPath || '').split('?')[0].toLowerCase();
  /* 1439：_bulk 是 NDJSON（动作行 + 文档行）——动作行给动作/元数据键；文档行是裸文档不出键 */
  if (/(^|\/)_bulk(\/|$)/.test(p)) return 'bulk-body';
  /* doc 档四端点（带斜杠前缀防误伤——'_update/' 不吃 _update_by_query（后者是
 search 族，dslCompletionContext.spec 既有断言钉死），'/_source' 尾形态与 /_doc/1/_source 双保险）
 _update 体是 {doc/upsert/script…} 的结构化体，不是裸文档——单列 update-body 档。 */
  /* 段精确：/<索引>/_update/<id>——不能只认 '/_update/'，否则 _transform/<id>/_update、
     _ml/filters/<id>/_update 这类更新体（根键完全不同）会被抢成文档更新体。 */
  if (/(^|\/)_update\/[^/]+\/?$/.test(p)) return 'update-body';
  /* 自增 ID 的 POST /<索引>/_doc 没有尾斜杠：此前漏档落 search，文档体被当查询体
     给出 query/sort/aggs 并误报根键——段尾精确匹配补上。 */
  if (/(^|\/)_doc\/?$/.test(p) || p.includes('/_doc/') || p.includes('/_create/')
      || /(^|\/)_source(\/|$)/.test(p)) return 'doc';
  /* 1439：这些端点的体不是 search body——此前一律给 query/sort/aggs 骨架
     （模板体里出 match：写下去就是 ES 400；analyze 体里出 query：同样的错） */
  if (/(^|\/)_analyze(\/|$)/.test(p)) return 'analyze';
  /* 段精确：索引名里含 _index_template/_component_template/_template 不能被当成模板端点 */
  if (/(^|\/)_index_template(\/|$)/.test(p) || /(^|\/)_component_template(\/|$)/.test(p)
      || /(^|\/)_template(\/|$)/.test(p)) return 'template';
  /* 1439：_cluster/settings 的体是 {persistent,transient} 两层集群设置，
     不是 search 体也不是索引设置体——默认档此前给 query/sort/aggs，写下去 ES 直接拒。 */
  if (/(^|\/)_cluster\/settings(\/|$)/.test(p)) return 'cluster-settings-body';
  /* 1439：_cluster/reroute 的体是 {commands:[{move|allocate_*|cancel:{…}}]}；
     allocation/explain 的体是 {index,shard,primary,…}——默认 search 档给 query/aggs 都是非法键。 */
  if (/(^|\/)_cluster\/reroute(\/|$)/.test(p)) return 'reroute-body';
  if (/(^|\/)_cluster\/allocation\/explain(\/|$)/.test(p)) return 'allocation-explain-body';
  /* 1439：_snapshot 三个写体——注册仓库（PUT /_snapshot/<repo>）、创建快照
     （PUT|POST /_snapshot/<repo>/<snap>）、恢复（POST …/_restore）。
     其余 _snapshot 子路径（_status/GET/DELETE）无体，不抢 search 默认档。 */
  /* 1439：SLM 策略体（PUT /_slm/policy/<id>）是 {schedule,name,repository,config,retention} */
  if (method.toUpperCase() === 'PUT' && /(^|\/)_slm\/policy\/[^/]+(\/|$)/.test(p)) return 'slm-policy-body';
  /* 1439：ILM 策略体（PUT /_ilm/policy/<id>，6.x 兼容 _xpack/ilm）是
     {policy:{phases:{hot|warm|cold|frozen|delete:{min_age,actions}}}} */
  if (method.toUpperCase() === 'PUT' && /(^|\/)_(?:xpack\/)?ilm\/policy\/[^/]+(\/|$)/.test(p)) return 'ilm-policy-body';
  /* 1439：ILM 手动推进体（POST /_ilm/move/<index>）是 {current_step,next_step}，
     每步 {phase,action,name}——与策略体不同档。 */
  if (method.toUpperCase() === 'POST' && /(^|\/)_(?:xpack\/)?ilm\/move\/[^/]+(\/|$)/.test(p)) return 'ilm-move-body';
  /* 1439：Watcher watch 体（PUT /_watcher/watch/<id>，6.x 兼容 _xpack/watcher）：
     {trigger,input,condition,actions,metadata,throttle_period} */
  /* 1439：试跑 watch（POST /_watcher/watch/<id>/_execute）体是
     {trigger_data,alternative_input,ignore_condition,action_modes,record_execution}。
     必须先于 watch 定义规则判定，否则 POST watch 定义会吞掉 _execute。 */
  if (method.toUpperCase() === 'POST'
      && /(^|\/)_(?:xpack\/)?watcher\/watch\/[^/]+\/_execute\/?$/.test(p)) return 'watch-execute-body';
  /* 1439：内联试跑（POST /_watcher/watch/_execute）体多一层 watch 定义：
     {watch,trigger_data,alternative_input,ignore_condition,action_modes,record_execution}。 */
  if (method.toUpperCase() === 'POST'
      && /(^|\/)_(?:xpack\/)?watcher\/watch\/_execute\/?$/.test(p)) return 'watch-inline-execute-body';
  /* 1439：watch 定义体（PUT|POST /_watcher/watch/<id>，官方 spec 两种方法都收）；
     段尾精确，_execute 由上面的动作子路由先接。 */
  if ((method.toUpperCase() === 'PUT' || method.toUpperCase() === 'POST')
      && /(^|\/)_(?:xpack\/)?watcher\/watch\/[^/]+\/?$/.test(p)) return 'watch-body';
  /* 1439：安全体系写体（PUT/POST /_security/<resource>/<name>）——各自根键与 SQL 查询无关 */
  const secMethod = method.toUpperCase();
  if (secMethod === 'PUT' || secMethod === 'POST') {
    if (/(^|\/)_(?:xpack\/)?security\/role\/[^/]+(\/|$)/.test(p)) return 'security-role-body';
    if (/(^|\/)_(?:xpack\/)?security\/user\/[^/]+(\/|$)/.test(p)) return 'security-user-body';
    if (/(^|\/)_(?:xpack\/)?security\/role_mapping\/[^/]+(\/|$)/.test(p)) return 'security-role-mapping-body';
  }
  /* 1439：创建 API Key 官方 spec 同时接受 PUT/POST（路径 /_security/api_key） */
  if ((secMethod === 'PUT' || secMethod === 'POST')
      && /(^|\/)_(?:xpack\/)?security\/api_key\/?$/.test(p)) return 'security-api-key-body';
  /* 1439：代授 API Key（POST /_security/api_key/grant）体是
     {grant_type,access_token|username+password,api_key}——与创建体根键不同。 */
  if (secMethod === 'POST' && /(^|\/)_(?:xpack\/)?security\/api_key\/grant\/?$/.test(p)) return 'security-api-key-grant-body';
  /* 1439：API Key 检索体（GET|POST /_security/_query/api_key）是 {query,from,size}——
     query 内是 Query DSL，根键不含 sort/aggs。 */
  if ((secMethod === 'GET' || secMethod === 'POST')
      && /(^|\/)_(?:xpack\/)?security\/_query\/api_key\/?$/.test(p)) return 'security-api-key-query-body';
  /* 1439：吊销 API Key（DELETE /_security/api_key）体是 {ids,name,owner,realm_name,username} */
  if (secMethod === 'DELETE' && /(^|\/)_(?:xpack\/)?security\/api_key\/?$/.test(p)) return 'security-api-key-invalidate-body';
  /* 1439：跨集群 API Key 体（POST /_security/cross_cluster/api_key）是
     {name,access:{search:[…],replication:[…]},expiration,metadata}。 */
  if (secMethod === 'POST' && /(^|\/)_(?:xpack\/)?security\/cross_cluster\/api_key\/?$/.test(p)) return 'security-cross-cluster-api-key-body';
  /* 1439：应用权限体（PUT|POST /_security/privilege）是两层动态映射：
     {<application>: {<privilege>: {actions, metadata}}}——根层与权限名都非固定键。 */
  if ((secMethod === 'PUT' || secMethod === 'POST')
      && /(^|\/)_(?:xpack\/)?security\/privilege\/?$/.test(p)) return 'security-privilege-body';
  /* 1439：Ingest 管道体（PUT /_ingest/pipeline/<id>）是 {description,version,processors,on_failure,_meta}；
     _simulate（POST）是另一种体，不并进本档。 */
  if (method.toUpperCase() === 'PUT' && /(^|\/)_ingest\/pipeline\/[^/]+(\/|$)/.test(p)) return 'ingest-pipeline-body';
  /* 1439：管道试跑体（POST /_ingest/pipeline[_/<id>]/_simulate）：{pipeline?,docs,verbose} */
  if (method.toUpperCase() === 'POST' && /(^|\/)_ingest\/pipeline\/(?:[^/]+\/)?_simulate(\/|$)/.test(p)) return 'ingest-simulate-body';
  /* 1439：Enrich 策略体（PUT /_enrich/policy/<name>）：match / geo_match / range 三型 */
  if (method.toUpperCase() === 'PUT' && /(^|\/)_enrich\/policy\/[^/]+(\/|$)/.test(p)) return 'enrich-policy-body';
  /* 1439：Transform 体（PUT /_transform/<id>，兼容 _transform/transforms/<id>）：
     {source,dest,pivot|latest,sync,retention_policy,…}；_start/_stop 是 POST，不并进本档。 */
  if (method.toUpperCase() === 'PUT' && /(^|\/)_transform\/(?:transforms\/)?[^/]+(\/|$)/.test(p)) return 'transform-body';
  /* 1439：预览未创建作业（POST /_transform/_preview）与更新作业
     （POST /_transform/<id>/_update）体同为 transform 定义档；
     已存作业的 POST /<id>/_preview 无体，不并档。 */
  if (method.toUpperCase() === 'POST' && /(^|\/)_transform\/_preview\/?$/.test(p)) return 'transform-body';
  if (method.toUpperCase() === 'POST'
      && /(^|\/)_transform\/(?:transforms\/)?[^/]+\/_update\/?$/.test(p)) return 'transform-body';
  /* 1439：Rollup 作业体（PUT /_rollup/job/<id>，6.x 兼容 _xpack/rollup）：
     {index_pattern,rollup_index,cron,page_size,groups,metrics,…} */
  if (method.toUpperCase() === 'PUT' && /(^|\/)_(?:xpack\/)?rollup\/job\/[^/]+(\/|$)/.test(p)) return 'rollup-job-body';
  /* 1439：ML 数据馈送体（PUT /_ml/datafeeds/<id>，6.x 兼容 _xpack/ml）：
     {job_id,indexes,query,frequency,scroll_size,chunking_config,…} */
  if (method.toUpperCase() === 'PUT' && /(^|\/)_(?:xpack\/)?ml\/datafeeds\/[^/]+(\/|$)/.test(p)) return 'ml-datafeed-body';
  /* 1439：ML 异常检测作业体（PUT /_ml/anomaly_detectors/<id>，6.x 兼容 _xpack/ml）：
     {analysis_config,analysis_limits,data_description,…}；_update 是 POST，不并进本档。 */
  if (method.toUpperCase() === 'PUT' && /(^|\/)_(?:xpack\/)?ml\/anomaly_detectors\/[^/]+(\/|$)/.test(p)) return 'ml-job-body';
  /* 1439：ML 过滤器体（PUT /_ml/filters/<id>）是 {description,items}；
     ML 日历体（PUT /_ml/calendars/<id>）是 {job_ids,description}；
     日历事件（POST /_ml/calendars/<id>/events）是 {events:[…]}——事件体先于日历体判定。 */
  if (method.toUpperCase() === 'PUT' && /(^|\/)_(?:xpack\/)?ml\/filters\/[^/]+\/?$/.test(p)) return 'ml-filter-body';
  /* 1439：ML 过滤器更新体（POST /_ml/filters/<id>/_update）是 {description,add_items,remove_items} */
  if (method.toUpperCase() === 'POST' && /(^|\/)_(?:xpack\/)?ml\/filters\/[^/]+\/_update\/?$/.test(p)) return 'ml-filter-update-body';
  if (method.toUpperCase() === 'POST' && /(^|\/)_(?:xpack\/)?ml\/calendars\/[^/]+\/events\/?$/.test(p)) return 'ml-calendar-events-body';
  if (method.toUpperCase() === 'PUT' && /(^|\/)_(?:xpack\/)?ml\/calendars\/[^/]+\/?$/.test(p)) return 'ml-calendar-body';
  /* 1439：Graph 探索体（POST /<索引>/_graph/explore）是 {query,vertices,connections,controls}——
     根键不是 search 档，且 query/hop.query 内要回落整棵查询补全。 */
  if (method.toUpperCase() === 'POST' && /(^|\/)_graph\/explore(\/|$)/.test(p)) return 'graph-explore-body';
  /* 1439：CCR 跟随体（PUT /<索引>/_ccr/follow）与自动跟随模式
     （PUT /_ccr/auto_follow/<cluster>）各自根键，不是 search 体。 */
  if (method.toUpperCase() === 'PUT' && /(^|\/)_ccr\/follow(\/|$)/.test(p)) return 'ccr-follow-body';
  if (method.toUpperCase() === 'PUT' && /(^|\/)_ccr\/auto_follow\/[^/]+(\/|$)/.test(p)) return 'ccr-auto-follow-body';
  /* 1439：许可证更新体（PUT|POST /_license）是 {license|licenses:[…]}；
     start_trial/start_basic 的 acknowledge 是查询参数，不含在本档。 */
  if ((secMethod === 'PUT' || secMethod === 'POST') && /(^|\/)_license\/?$/.test(p)) return 'license-body';
  /* 1439：重载节点密钥库（POST /_nodes[/<node_id>]/reload_secure_settings）体是
     {secure_settings_password}——默认 search 档会给 query/aggs 全非法键。 */
  if (method.toUpperCase() === 'POST'
      && /(^|\/)_nodes\/(?:[^/]+\/)?reload_secure_settings\/?$/.test(p)) return 'nodes-reload-secure-settings-body';
  if (p.includes('/_snapshot/')) {
    const segs = p.split('/').filter(Boolean);
    const si = segs.indexOf('_snapshot');
    const after = si >= 0 ? segs.length - si - 1 : -1;
    const m = method.toUpperCase();
    if (after === 1 && (m === 'PUT' || m === 'POST') && !segs[si + 1].startsWith('_')) return 'snapshot-repo-body';
    if (after === 2 && (m === 'PUT' || m === 'POST')
        && !segs[si + 1].startsWith('_') && !segs[si + 2].startsWith('_')) return 'snapshot-create-body';
    if (after === 3 && m === 'POST' && segs[si + 3] === '_restore') return 'snapshot-restore-body';
    /* 1439：克隆快照（PUT /_snapshot/<repo>/<snap>/_clone/<target>）体是
       {indices,index_settings,ignore_index_settings}；目标快照名在路径上。 */
    if (after === 4 && m === 'PUT' && segs[si + 3] === '_clone') return 'snapshot-clone-body';
    /* 1439：挂载快照（POST /_snapshot/<repo>/<snap>/_mount）体是
       {index,renamed_index,index_settings,ignore_index_settings,storage} */
    if (after === 3 && m === 'POST' && segs[si + 3] === '_mount') return 'snapshot-mount-body';
  }
  /* 段精确：只能认路径里的 _settings / _mapping 段。
     子串口径会把 /_nodes/reload_secure_settings、/_security/role_mapping 误吃。 */
  if (/(^|\/)_settings(\/|$)/.test(p)) return 'settings';
  if (/(^|\/)_mapping(\/|$)/.test(p)) return 'mapping';
  /* 1439：PUT /<索引名> = 创建索引——体是 {settings, mappings, aliases}，不是 search body。
     索引名允许下划线（my_index），只排除以 _ 开头的系统路径；此前 [^\/_]+ 把带下划线
     的索引全漏成 search 档。 */
  if (method.toUpperCase() === 'PUT' && /^\/[^/]+$/.test(p) && !/^\/_/.test(p)) return 'index-body';
  /* 1439：PUT /<索引名>/_alias/<别名> 的体是别名配置（filter/routing/is_write_index…） */
  if (p.includes('/_alias/')) return 'alias-body';
  /* 1439：_reindex 的体是 {source,dest,script,…}，不是 search body 也不是纯无档 */
  if (/(^|\/)_reindex(\/|$)/.test(p)) return 'reindex-body';
  /* 1439：_sql（含 _sql/translate）的体是 {query:"SELECT …"}，不是 search body */
  if (/(^|\/)_sql(\/|$)/.test(p)) return 'sql-body';
  /* 1439：_eql/search 的 query 是 EQL 串（不是 {match…}），filter 才是 Query DSL——
     默认 search 档会在 query 值位给 DSL 算子，写进去 ES 直接解析失败。 */
  if (/(^|\/)_eql\/search(\/|$)/.test(p)) return 'eql-body';
  /* 1439：_rollover 的体是 {conditions,settings,mappings,aliases}，不是无档 */
  if (/(^|\/)_rollover(\/|$)/.test(p)) return 'rollover-body';
  /* 1439：按查询删/改的体是 {query,max_docs,…}——query 内要回落到整棵查询补全 */
  if (/(^|\/)_delete_by_query(\/|$)/.test(p)) return 'dbq-body';
  if (/(^|\/)_update_by_query(\/|$)/.test(p)) return 'ubq-body';
  /* 1439：_msearch 头行是请求头对象（index/search_type/routing…），下文查询体行回落 search；
     /_msearch/template 头行同款、体行给模板 id/source/params */
  if (/(^|\/)_msearch\/template(\/|$)/.test(p)) return 'msearch-template-body';
  if (/(^|\/)_msearch(\/|$)/.test(p)) return 'msearch-body';
  /* 1439：执行/渲染模板的体是 {id|source, params}，不是 search 体 */
  if (/(^|\/)_(search|render)\/template(\/|$)/.test(p)) return 'template-search-body';
  /* 1439：只收 query 的端点——给 sort/aggs/size 都是非法根键 */
  if (/(^|\/)_count(\/|$)/.test(p) || /(^|\/)_explain(\/|$)/.test(p)
      || /(^|\/)_validate\/query(\/|$)/.test(p)) return 'query-body';
  /* 1439：_mget 的体是 {docs:[{_index,_id,…}]} 或 {ids:[…]}——结构化体，不是无档 */
  if (/(^|\/)_mget(\/|$)/.test(p)) return 'mget-body';
  /* 1439：执行脚本 POST /_scripts/<id>/[_<context>/]_execute 的体是 {script,context,context_setup} */
  if (method.toUpperCase() === 'POST'
      && /(^|\/)_scripts\/[^/]+\/(?:[^/]+\/)?_execute(\/|$)/.test(p)) return 'script-execute-body';
  /* 1439：PUT|POST /_scripts/<id>[/<context>] 存脚本的体是 {script:{lang,source,params}}；
     _execute 是执行脚本，体形态不同，按段排除（脚本 id 含 _execute 不误伤）。
     官方 REST spec 的 put_script 同时接受 PUT/POST。 */
  if ((method.toUpperCase() === 'PUT' || method.toUpperCase() === 'POST')
      && /(^|\/)_scripts\/[^/]+(\/|$)/.test(p)
      && !/(^|\/)_execute(\/|$)/.test(p)) return 'stored-script-body';
  /* 1439：POST /_aliases 的体是 {actions:[{add|remove|remove_index:{…}}]}——结构化体 */
  if (/(^|\/)_aliases(\/|$)/.test(p)) return 'aliases-body';
  /* 1439：游标翻页/清理的体是 {scroll,scroll_id}/{scroll_id}，不是无档 */
  if (/(^|\/)_clear_scroll(\/|$)/.test(p)) return 'clear-scroll-body';
  /* 同一路径按方法分档：DELETE /_search/scroll 是清理（只收 scroll_id），
     POST/GET 才是续翻（scroll + scroll_id）。 */
  if (/(^|\/)_search\/scroll(\/|$)/.test(p)) {
    return method.toUpperCase() === 'DELETE' ? 'clear-scroll-body' : 'scroll-body';
  }
  /* 1439：词项向量两端点的体是结构化配置（mtermvectors 先判，避免被 termvectors 吞） */
  if (/(^|\/)_mtermvectors(\/|$)/.test(p)) return 'mtermvectors-body';
  if (/(^|\/)_termvectors(\/|$)/.test(p)) return 'termvectors-body';
  /* 1439：_field_caps / _terms_enum 的体是检索能力/词项枚举配置，不是 search 体；
     index_filter 内的查询由 dslContext 根级查询容器识别后回落 */
  if (/(^|\/)_field_caps(\/|$)/.test(p)) return 'field-caps-body';
  if (/(^|\/)_terms_enum(\/|$)/.test(p)) return 'terms-enum-body';
  /* 1439：_rank_eval 的体是 {requests, metric}，不是 search 体 */
  if (/(^|\/)_rank_eval(\/|$)/.test(p)) return 'rank-eval-body';
  if (p.includes('/_scripts') || p.includes('/_script/')
      || p.includes('/_close') || p.includes('/_open') || p.includes('/_forcemerge')) return 'none';
  return 'search';
}

/** 体编辑器语言：_bulk 与 _msearch 族是 NDJSON（每行一个独立 JSON），其余 json。
    DevTools 与 REST 两页同源（此前 REST 的 bulk 体被当普通 JSON 高亮/报错）。 */
export function bodyLangForPath(rawPath: string): 'ndjson' | 'json' {
  const p = (rawPath || '').split('?')[0].toLowerCase();
  return /(^|\/)_bulk(\/|$)/.test(p) || /(^|\/)_msearch(\/|$)/.test(p) ? 'ndjson' : 'json';
}

/** _msearch 头行键（每一对：头行 + 查询体行） */
export function msearchHeaderKeyItems(): AssistItem[] {
  return [
    { label: 'index', detail: '检索目标索引（可数组或用逗号分隔）', snippet: true, insertText: '"index": "${1:my-index}"' },
    { label: 'search_type', detail: '查询类型（默认 query_then_fetch）', snippet: true,
      insertText: '"search_type": "${1|query_then_fetch,dfs_query_then_fetch|}"' },
    { label: 'routing', detail: '检索路由值', snippet: true, insertText: '"routing": "${1:routing}"' },
    { label: 'preference', detail: '副本偏好（如 _local）', snippet: true, insertText: '"preference": "${1:_local}"' },
    { label: 'ignore_unavailable', detail: '索引缺失时是否跳过', snippet: true, insertText: '"ignore_unavailable": ${1|true,false|}' },
    { label: 'allow_no_indices', detail: '通配无匹配时是否报错', snippet: true, insertText: '"allow_no_indices": ${1|true,false|}' },
    { label: 'expand_wildcards', detail: '通配展开范围', snippet: true, insertText: '"expand_wildcards": "${1|open,closed,none,all|}"' },
    { label: 'ccs_minimize_roundtrips', detail: '跨集群检索减少往返', snippet: true,
      insertText: '"ccs_minimize_roundtrips": ${1|true,false|}' },
  ];
}

/** 光标所在 _msearch 行是否为头行——非空行计数偶数（按「头+体」单行对，与 ndjsonLint 同口径）。 */
export function msearchHeaderLineAt(doc: string, offset: number): boolean {
  const cursor = Math.max(0, Math.min(offset, doc.length));
  const lineStart = doc.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
  const prior = doc.slice(0, lineStart).split('\n').filter(l => l.trim().length > 0).length;
  return prior % 2 === 0;
}

/** _msearch/template 体行键（模板执行参数） */
export function msearchTemplateBodyKeyItems(): AssistItem[] {
  return [
    { label: 'id', detail: '已存搜索模板 id（与 source 二选一）', snippet: true, insertText: '"id": "${1:my-template}"' },
    { label: 'source', detail: '内联 Mustache 模板', snippet: true, insertText: '"source": {\n  ${0}\n}' },
    { label: 'params', detail: '模板参数', snippet: true, insertText: '"params": {\n  ${0}\n}' },
  ];
}

/** _bulk 动作键（动作行顶层） */
export const BULK_ACTIONS = ['index', 'create', 'update', 'delete'] as const;

export function bulkActionKeyItems(): AssistItem[] {
  return [
    { label: 'index', detail: '写入/覆盖文档', snippet: true,
      insertText: '"index": { "_index": "${1:my-index}", "_id": "${2:1}" }' },
    { label: 'create', detail: '仅新建（已存在则失败）', snippet: true,
      insertText: '"create": { "_index": "${1:my-index}", "_id": "${2:1}" }' },
    { label: 'update', detail: '部分更新（下一行 {"doc": …}）', snippet: true,
      insertText: '"update": { "_index": "${1:my-index}", "_id": "${2:1}" }' },
    { label: 'delete', detail: '删除（不带文档行）', snippet: true,
      insertText: '"delete": { "_index": "${1:my-index}", "_id": "${2:1}" }' },
  ];
}

/** 动作行的元数据键；update 动作另有 retry_on_conflict */
export function bulkActionMetaKeyItems(op: string): AssistItem[] {
  const base: AssistItem[] = [
    { label: '_index', detail: '目标索引', snippet: true, insertText: '"_index": "${1:my-index}"' },
    { label: '_id', detail: '文档 id', snippet: true, insertText: '"_id": "${1:1}"' },
    { label: 'routing', detail: '路由值', snippet: true, insertText: '"routing": "${1:routing}"' },
    { label: 'version', detail: '期望版本', snippet: true, insertText: '"version": ${1:1}' },
    { label: 'version_type', detail: '版本类型', snippet: true, insertText: '"version_type": "${1|internal,external|}"' },
    { label: 'if_seq_no', detail: '并发控制：序号', snippet: true, insertText: '"if_seq_no": ${1:1}' },
    { label: 'if_primary_term', detail: '并发控制：主任期', snippet: true, insertText: '"if_primary_term": ${1:1}' },
  ];
  if (op === 'update') {
    base.push({ label: 'retry_on_conflict', detail: '版本冲突重试次数', snippet: true,
      insertText: '"retry_on_conflict": ${1:3}' });
  }
  return base;
}

/** 当前 _bulk 行类型：动作行 / 文档行（delete 动作不带文档行，沿用 ndjsonLint 状态机口径） */
export function bulkLineKindAt(doc: string, offset: number = doc.length): 'action' | 'doc' {
  const cursor = Math.max(0, Math.min(offset, doc.length));
  const lineStart = doc.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
  const prior = doc.slice(0, lineStart).split('\n').map(l => l.trim()).filter(Boolean);
  let expectDoc = false;
  for (const line of prior) {
    if (expectDoc) { expectDoc = false; continue; }
    let obj: any = null;
    try { obj = JSON.parse(line); } catch { continue; }
    const op = obj && typeof obj === 'object' ? BULK_ACTIONS.find(k => k in obj) : undefined;
    expectDoc = !!op && op !== 'delete';
  }
  return expectDoc ? 'doc' : 'action';
}

/** 动作行内层对象（{"update": {"…）的动作名；非该形态返回 null */
export function bulkActionMetaAt(doc: string, offset: number = doc.length): string | null {
  const stack = frameKeysAt(doc, offset);
  if (stack.length < 2) return null;
  const k = stack[0];
  return k && (BULK_ACTIONS as readonly string[]).includes(k) ? k : null;
}

/** 字段能力体（GET/POST /<索引>/_field_caps）的根键 */
export function fieldCapsBodyKeyItems(): AssistItem[] {
  return [
    { label: 'fields', detail: '要查询能力的字段（数组，可用通配）', snippet: true, insertText: '"fields": ["${1:field}"]' },
    { label: 'index_filter', detail: '只看命中文档的字段能力（Query DSL）', snippet: true,
      insertText: '"index_filter": {\n  ${0}\n}' },
    { label: 'runtime_mappings', detail: '本次查询的运行时字段', snippet: true,
      insertText: '"runtime_mappings": {\n  ${0}\n}' },
  ];
}

/** 词项枚举体（POST /<索引>/_terms_enum）的根键 */
export function termsEnumBodyKeyItems(): AssistItem[] {
  return [
    { label: 'field', detail: '枚举哪个字段的词项', snippet: true, insertText: '"field": "${1:field}"' },
    { label: 'string', detail: '前缀/模糊串', snippet: true, insertText: '"string": "${1:prefix}"' },
    { label: 'size', detail: '最多返回多少个词项', snippet: true, insertText: '"size": ${1:10}' },
    { label: 'case_insensitive', detail: '大小写不敏感', snippet: true, insertText: '"case_insensitive": ${1|true,false|}' },
    { label: 'index_filter', detail: '只看命中文档（Query DSL）', snippet: true, insertText: '"index_filter": {\n  ${0}\n}' },
    { label: 'timeout', detail: '超时时间', snippet: true, insertText: '"timeout": "${1:1s}"' },
    { label: 'search_after', detail: '翻页游标（上一页最后的词项）', snippet: true, insertText: '"search_after": "${1:term}"' },
  ];
}

/** field-caps / terms-enum 的区域：根层 / index_filter（查询，回落 search）/ 深层 */
export function indexFilterRegionAt(doc: string, offset: number = doc.length): 'root' | 'query' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'index_filter') return 'query';
  return 'deep';
}

/** 排序评估体（POST /_rank_eval）的根键 */
export function rankEvalBodyKeyItems(): AssistItem[] {
  return [
    { label: 'requests', detail: '命名排序评估请求（每项含 request/ratings）', snippet: true,
      insertText: '"requests": {\n  "${1:query}": {\n    "request": { "query": { "match_all": {} } },\n    "ratings": []\n  }\n}' },
    { label: 'metric', detail: '评估指标（dcg/ndcg/precision/recall/mean_reciprocal_rank）', snippet: true,
      insertText: '"metric": {\n  "${1|dcg,ndcg,precision,recall,mean_reciprocal_rank|}": {}\n}' },
  ];
}

/** 评估请求项的键 */
export function rankEvalRequestKeyItems(): AssistItem[] {
  return [
    { label: 'request', detail: '搜索请求体（query/size/sort…）', snippet: true,
      insertText: '"request": {\n  "query": { "match_all": {} }\n}' },
    { label: 'ratings', detail: '评分（文档 id 与评分对）', snippet: true,
      insertText: '"ratings": [\n  { "_index": "${1:my-index}", "_id": "${2:1}", "rating": ${3:1} }\n]' },
  ];
}

/** metric 对象的指标键 */
export function rankEvalMetricKeyItems(): AssistItem[] {
  return [
    { label: 'dcg', detail: '折损累计增益', snippet: true,
      insertText: '"dcg": {\n  "k": ${1:10},\n  "normalize": ${2|false,true|}\n}' },
    { label: 'ndcg', detail: '归一化折损累计增益', snippet: true,
      insertText: '"ndcg": {\n  "k": ${1:10},\n  "normalize": ${2|false,true|}\n}' },
    { label: 'precision', detail: '前 k 命中精度', snippet: true, insertText: '"precision": {\n  "k": ${1:10}\n}' },
    { label: 'recall', detail: '前 k 召回', snippet: true, insertText: '"recall": {\n  "k": ${1:10}\n}' },
    { label: 'mean_reciprocal_rank', detail: '平均倒数排名', snippet: true, insertText: '"mean_reciprocal_rank": {}' },
  ];
}

/** 排序评估体区域：根 / requests 项 / metric 对象 / 深层（request 内部属搜索请求体，暂不出档） */
export function rankEvalRegionAt(doc: string, offset: number = doc.length): 'root' | 'request-item' | 'metric' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'requests' && stack.length === 3) return 'request-item';
  if (stack[0] === 'metric' && stack.length === 2) return 'metric';
  return 'deep';
}

/** 补全项统一形态：insertText 已是完整插入串（含引号/snippet 语法），provider 直接消费 */
export type AssistItem = { label: string; detail?: string; insertText: string; snippet?: boolean };

/* painless 字段访问提取（hover 用纯函数，Monaco 不初始化也可断言）。
 光标 offset 落在 doc['f'] / ctx['f'] 的 'f' 单引号串内（起始引号后到闭引号前，贴闭引号也算）
 → 返回 f；否则 null。左扫最近的开引号（遇 [ ] " 换行即断——painless 字段名不含引号、
 单行字面量），右扫闭引号同口径；前缀核对其前必为 '['，再往前的标识符须是 doc/ctx。 */
export function painlessFieldAt(doc: string, offset: number): string | null {
  const cursor = Math.max(0, Math.min(offset, doc.length));
  let start = -1;
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = doc[i];
    if (ch === "'") { start = i; break; }
    if (ch === '\n' || ch === '[' || ch === ']' || ch === '"') return null;
  }
  if (start < 0 || cursor <= start) return null;
  let end = -1;
  for (let j = cursor; j < doc.length; j++) {
    if (doc[j] === "'") { end = j; break; }
    if (doc[j] === '\n') return null;
  }
  if (end < 0) return null;
  if (start === 0 || doc[start - 1] !== '[') return null;
  let k = start - 2;
  while (k >= 0 && /\w/.test(doc[k])) k--;
  const ident = doc.slice(k + 1, start - 1);
  if (ident !== 'doc' && ident !== 'ctx') return null;
  return doc.slice(start + 1, end);
}

export function settingsKeyItems(): AssistItem[] {
  return SETTINGS_CATALOG.map(s => ({
    label: s.key,
    detail: `${s.desc}（例：${s.example}）`,
    insertText: '"' + s.key + '"',
  }));
}

/** 集群设置体（PUT /_cluster/settings）的根键：持久层与临时层 */
export function clusterSettingsBodyKeyItems(): AssistItem[] {
  return [
    { label: 'persistent', detail: '持久化集群设置（重启后仍生效）', snippet: true,
      insertText: '"persistent": {\n  ${0}\n}' },
    { label: 'transient', detail: '临时集群设置（重启后丢失）', snippet: true,
      insertText: '"transient": {\n  ${0}\n}' },
  ];
}

/** persistent/transient 内的集群设置键（CLUSTER_SETTINGS_CATALOG 派生，解释+示例进 detail） */
export function clusterSettingsKeyItems(): AssistItem[] {
  return CLUSTER_SETTINGS_CATALOG.map(s => ({
    label: s.key,
    detail: `${s.desc}（例：${s.example}）`,
    insertText: '"' + s.key + '"',
  }));
}

/** 集群设置体区域：根层给 persistent/transient；两层设置对象内给设置键；更深层不出键 */
export function clusterSettingsRegionAt(doc: string, offset: number): 'root' | 'settings' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if ((stack[0] === 'persistent' || stack[0] === 'transient') && stack.length === 2) return 'settings';
  return 'deep';
}

/** _cluster/reroute 的合法命令（ES 官方五种） */
export const REROUTE_COMMANDS = ['move', 'cancel', 'allocate_replica', 'allocate_stale_primary', 'allocate_empty_primary'] as const;

/** 分片重路由体（POST /_cluster/reroute）的根键 */
export function rerouteBodyKeyItems(): AssistItem[] {
  return [
    { label: 'commands', detail: '一条或多条重路由命令', snippet: true,
      insertText: '"commands": [\n  {\n    "move": { "index": "${1:my-index}", "shard": ${2:0}, "from_node": "${3:node-a}", "to_node": "${4:node-b}" }\n  }\n]' },
  ];
}

/** commands[] 元素的命令键 */
export function rerouteCommandKeyItems(): AssistItem[] {
  return [
    { label: 'move', detail: '把分片从一个节点迁到另一个节点', snippet: true,
      insertText: '"move": { "index": "${1:my-index}", "shard": ${2:0}, "from_node": "${3:node-a}", "to_node": "${4:node-b}" }' },
    { label: 'cancel', detail: '取消分片的正在进行的分配/恢复', snippet: true,
      insertText: '"cancel": { "index": "${1:my-index}", "shard": ${2:0}, "node": "${3:node-a}" }' },
    { label: 'allocate_replica', detail: '给未分配副本指定节点', snippet: true,
      insertText: '"allocate_replica": { "index": "${1:my-index}", "shard": ${2:0}, "node": "${3:node-a}" }' },
    { label: 'allocate_stale_primary', detail: '用陈旧副本强制分配主分片（可能丢数据）', snippet: true,
      insertText: '"allocate_stale_primary": { "index": "${1:my-index}", "shard": ${2:0}, "node": "${3:node-a}", "accept_data_loss": true }' },
    { label: 'allocate_empty_primary', detail: '用空分片强制分配主分片（数据丢失）', snippet: true,
      insertText: '"allocate_empty_primary": { "index": "${1:my-index}", "shard": ${2:0}, "node": "${3:node-a}", "accept_data_loss": true }' },
  ];
}

/** 命令参数键——五种命令的官方参数集不同（move 有 from/to，cancel 有 allow_primary…） */
export function rerouteCommandParamKeyItems(cmd: string): AssistItem[] {
  const base: AssistItem[] = [
    { label: 'index', detail: '目标索引', snippet: true, insertText: '"index": "${1:my-index}"' },
    { label: 'shard', detail: '分片序号', snippet: true, insertText: '"shard": ${1:0}' },
  ];
  if (cmd === 'move') {
    return [...base,
      { label: 'from_node', detail: '迁出节点', snippet: true, insertText: '"from_node": "${1:node-a}"' },
      { label: 'to_node', detail: '迁入节点', snippet: true, insertText: '"to_node": "${1:node-b}"' }];
  }
  if (cmd === 'cancel') {
    return [...base,
      { label: 'node', detail: '取消该节点上的分配/恢复', snippet: true, insertText: '"node": "${1:node-a}"' },
      { label: 'allow_primary', detail: '允许取消主分片恢复（默认 false）', snippet: true, insertText: '"allow_primary": ${1|true,false|}' }];
  }
  const alloc: AssistItem[] = [...base, { label: 'node', detail: '目标节点', snippet: true, insertText: '"node": "${1:node-a}"' }];
  if (cmd === 'allocate_stale_primary' || cmd === 'allocate_empty_primary') {
    alloc.push({ label: 'accept_data_loss', detail: '确认接受数据丢失（必填 true）', snippet: true,
      insertText: '"accept_data_loss": ${1|true,false|}' });
  }
  return alloc;
}

/** 重路由体区域：根层给 commands；命令对象内给命令键；命令参数对象内给参数键 */
export function rerouteRegionAt(doc: string, offset: number): 'root' | 'command' | 'params' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'commands' && stack.length === 3) return 'command';
  if (stack[0] === 'commands' && stack.length === 4
      && stack[2] && (REROUTE_COMMANDS as readonly string[]).includes(stack[2])) return 'params';
  return 'deep';
}

/** params 区域当前命令名（非 params 区域返回空串） */
export function rerouteCommandNameAt(doc: string, offset: number): string {
  const stack = frameKeysAt(doc, offset);
  return stack[0] === 'commands' && stack.length >= 4 ? (stack[2] ?? '') : '';
}

/** 快照仓库类型（内置 + 常见官方插件；最终以集群已装插件为准，仅作候选） */
export const SNAPSHOT_REPO_TYPES: Array<{ label: string; detail: string }> = [
  { label: 'fs', detail: '共享文件系统（需 path.repo）' },
  { label: 'url', detail: '只读 URL 仓库（http/https/file）' },
  { label: 's3', detail: 'AWS S3（repository-s3 插件）' },
  { label: 'gcs', detail: 'Google Cloud Storage（repository-gcs 插件）' },
  { label: 'azure', detail: 'Azure Blob（repository-azure 插件）' },
  { label: 'hdfs', detail: 'HDFS（repository-hdfs 插件）' },
];

/** 注册快照仓库体（PUT /_snapshot/<repo>）的根键 */
export function snapshotRepoBodyKeyItems(): AssistItem[] {
  return [
    { label: 'type', detail: '仓库类型（fs/url/s3/gcs/azure/hdfs）', snippet: true, insertText: '"type": "${1|fs,url,s3,gcs,azure,hdfs|}"' },
    { label: 'settings', detail: '仓库连接/存储参数（location、bucket、base_path…）', snippet: true,
      insertText: '"settings": {\n  ${0}\n}' },
    { label: 'verify', detail: '注册时校验仓库可读写（默认 true）', snippet: true, insertText: '"verify": ${1|true,false|}' },
  ];
}

/** 创建快照体（PUT/POST /_snapshot/<repo>/<snap>）的根键 */
export function snapshotCreateBodyKeyItems(): AssistItem[] {
  return [
    { label: 'indices', detail: '要包含的索引（支持通配/逗号串或数组，省略=全部）', snippet: true,
      insertText: '"indices": "${1:*}"' },
    { label: 'ignore_unavailable', detail: '忽略不存在的索引', snippet: true, insertText: '"ignore_unavailable": ${1|true,false|}' },
    { label: 'include_global_state', detail: '包含集群全局状态（模板/持久设置等）', snippet: true,
      insertText: '"include_global_state": ${1|false,true|}' },
    { label: 'partial', detail: '允许部分分片缺失的快照（默认 false）', snippet: true, insertText: '"partial": ${1|false,true|}' },
    { label: 'metadata', detail: '附加到快照的自定义元数据', snippet: true, insertText: '"metadata": {\n  ${0}\n}' },
    { label: 'feature_states', detail: '要包含的功能状态（如 geoip）', snippet: true, insertText: '"feature_states": ["${1:geoip}"]' },
  ];
}

/** 恢复快照体（POST /_snapshot/<repo>/<snap>/_restore）的根键 */
export function snapshotRestoreBodyKeyItems(): AssistItem[] {
  return [
    { label: 'indices', detail: '要恢复的索引（省略=全部）', snippet: true, insertText: '"indices": "${1:*}"' },
    { label: 'ignore_unavailable', detail: '忽略快照中不存在的索引', snippet: true, insertText: '"ignore_unavailable": ${1|true,false|}' },
    { label: 'include_global_state', detail: '恢复集群全局状态（高危：会覆盖当前集群状态）', snippet: true,
      insertText: '"include_global_state": ${1|false,true|}' },
    { label: 'partial', detail: '允许部分恢复', snippet: true, insertText: '"partial": ${1|false,true|}' },
    { label: 'rename_pattern', detail: '索引重命名正则（源名匹配）', snippet: true, insertText: '"rename_pattern": "${1:(.+)}"' },
    { label: 'rename_replacement', detail: '重命名替换串（$1 引用分组）', snippet: true,
      insertText: '"rename_replacement": "${1:restored_$1}"' },
    { label: 'include_aliases', detail: '同时恢复别名', snippet: true, insertText: '"include_aliases": ${1|true,false|}' },
    { label: 'index_settings', detail: '恢复时覆盖的索引设置', snippet: true, insertText: '"index_settings": {\n  ${0}\n}' },
    { label: 'ignore_index_settings', detail: '恢复时忽略的索引设置键', snippet: true,
      insertText: '"ignore_index_settings": ["${1:index.refresh_interval}"]' },
    { label: 'feature_states', detail: '要恢复的功能状态', snippet: true, insertText: '"feature_states": ["${1:geoip}"]' },
  ];
}

/** SLM 策略体（PUT /_slm/policy/<id>）的根键 */
export function slmPolicyBodyKeyItems(): AssistItem[] {
  return [
    { label: 'schedule', detail: '执行计划（cron，如 0 30 1 * * ?）', snippet: true, insertText: '"schedule": "${1:0 30 1 * * ?}"' },
    { label: 'name', detail: '快照名模板（支持 <date-{now/d}> 等日期数学）', snippet: true,
      insertText: '"name": "${1:<snapshot-{now/d}>}"' },
    { label: 'repository', detail: '目标快照仓库', snippet: true, insertText: '"repository": "${1:my_repo}"' },
    { label: 'config', detail: '快照内容配置（索引/全局状态等）', snippet: true, insertText: '"config": {\n  ${0}\n}' },
    { label: 'retention', detail: '保留策略（过期时间/最大最小份数）', snippet: true, insertText: '"retention": {\n  ${0}\n}' },
  ];
}

/** SLM config 对象的键（与创建快照体同源语义） */
export function slmConfigKeyItems(): AssistItem[] {
  return [
    { label: 'indices', detail: '要包含的索引（通配/逗号串或数组）', snippet: true, insertText: '"indices": "${1:*}"' },
    { label: 'ignore_unavailable', detail: '忽略不存在的索引', snippet: true, insertText: '"ignore_unavailable": ${1|true,false|}' },
    { label: 'include_global_state', detail: '包含集群全局状态', snippet: true, insertText: '"include_global_state": ${1|false,true|}' },
    { label: 'partial', detail: '允许部分分片缺失的快照', snippet: true, insertText: '"partial": ${1|false,true|}' },
    { label: 'metadata', detail: '附加到快照的自定义元数据', snippet: true, insertText: '"metadata": {\n  ${0}\n}' },
    { label: 'feature_states', detail: '要包含的功能状态（如 geoip）', snippet: true, insertText: '"feature_states": ["${1:geoip}"]' },
  ];
}

/** SLM retention 对象的键 */
export function slmRetentionKeyItems(): AssistItem[] {
  return [
    { label: 'expire_after', detail: '保留时长（如 30d；到期删除）', snippet: true, insertText: '"expire_after": "${1:30d}"' },
    { label: 'min_count', detail: '最少保留份数（即使过期也保留）', snippet: true, insertText: '"min_count": ${1:5}' },
    { label: 'max_count', detail: '最多保留份数（超出删除最旧）', snippet: true, insertText: '"max_count": ${1:50}' },
  ];
}

/** SLM 策略体区域：根层 / config / retention / 更深 */
export function slmPolicyRegionAt(doc: string, offset: number): 'root' | 'config' | 'retention' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'config' && stack.length === 2) return 'config';
  if (stack[0] === 'retention' && stack.length === 2) return 'retention';
  return 'deep';
}

/** ILM 五个官方阶段 */
export const ILM_PHASE_NAMES = ['hot', 'warm', 'cold', 'frozen', 'delete'] as const;
/** 阶段对象允许的配置键 */
export const ILM_PHASE_CONFIG_KEYS = ['min_age', 'actions'] as const;
/** ILM 动作全集（lint 白名单；补全只为常用动作给骨架） */
export const ILM_ACTIONS = [
  'rollover', 'forcemerge', 'shrink', 'allocate', 'freeze', 'unfreeze', 'delete',
  'set_priority', 'searchable_snapshot', 'readonly', 'unfollow', 'wait_for_snapshot',
  'migrate', 'downsample',
] as const;

/** ILM 策略体（PUT /_ilm/policy/<id>）的根键 */
export function ilmPolicyBodyKeyItems(): AssistItem[] {
  return [
    { label: 'policy', detail: '生命周期策略（内含 phases）', snippet: true, insertText: '"policy": {\n  ${0}\n}' },
  ];
}

/** policy 对象内：阶段表 */
export function ilmPolicyKeyItems(): AssistItem[] {
  return [
    { label: 'phases', detail: '阶段表（hot/warm/cold/frozen/delete）', snippet: true,
      insertText: '"phases": {\n  ${0}\n}' },
  ];
}

/** phases 对象的阶段键（每个阶段值对象含 min_age/actions） */
export function ilmPhaseKeyItems(): AssistItem[] {
  return [
    { label: 'hot', detail: '热阶段（写入/滚动）', snippet: true,
      insertText: '"hot": {\n  "actions": {\n    "rollover": { "max_size": "${1:50gb}", "max_age": "${2:30d}" }\n  }\n}' },
    { label: 'warm', detail: '温阶段（合并/降副本）', snippet: true,
      insertText: '"warm": {\n  "min_age": "${1:30d}",\n  "actions": {\n    "forcemerge": { "max_num_segments": ${2:1} }\n  }\n}' },
    { label: 'cold', detail: '冷阶段（冻结/可搜索快照）', snippet: true,
      insertText: '"cold": {\n  "min_age": "${1:60d}",\n  "actions": {\n    "set_priority": { "priority": ${2:0} }\n  }\n}' },
    { label: 'frozen', detail: '冻结阶段（部分/完全冻结）', snippet: true,
      insertText: '"frozen": {\n  "min_age": "${1:90d}",\n  "actions": {\n    "searchable_snapshot": { "snapshot_repository": "${2:my_repo}" }\n  }\n}' },
    { label: 'delete', detail: '删除阶段（到期删除）', snippet: true,
      insertText: '"delete": {\n  "min_age": "${1:180d}",\n  "actions": { "delete": {} }\n}' },
  ];
}

/** 阶段对象内的配置键 */
export function ilmPhaseConfigKeyItems(): AssistItem[] {
  return [
    { label: 'min_age', detail: '进入该阶段的最小年龄（如 30d/12h/0ms）', snippet: true, insertText: '"min_age": "${1:30d}"' },
    { label: 'actions', detail: '该阶段要执行的动作', snippet: true, insertText: '"actions": {\n  ${0}\n}' },
  ];
}

/** actions 对象的动作键（常用动作给可接受骨架） */
export function ilmActionKeyItems(): AssistItem[] {
  const skeleton: Record<string, { text: string; detail: string }> = {
    rollover: { text: '"rollover": { "max_size": "${1:50gb}", "max_age": "${2:30d}" }', detail: '滚动到新索引' },
    forcemerge: { text: '"forcemerge": { "max_num_segments": ${1:1} }', detail: '强制合并段' },
    shrink: { text: '"shrink": { "number_of_shards": ${1:1} }', detail: '缩减主分片数' },
    allocate: { text: '"allocate": { "number_of_replicas": ${1:1}, "total_shards_per_node": ${2:-1} }', detail: '调整副本/分片分配' },
    freeze: { text: '"freeze": {}', detail: '冻结索引（关闭写入释放内存）' },
    unfreeze: { text: '"unfreeze": {}', detail: '取消冻结索引（恢复写入）' },
    delete: { text: '"delete": {}', detail: '删除索引（不可恢复）' },
    set_priority: { text: '"set_priority": { "priority": ${1:50} }', detail: '调整恢复优先级' },
    searchable_snapshot: { text: '"searchable_snapshot": { "snapshot_repository": "${1:my_repo}" }', detail: '转可搜索快照' },
    readonly: { text: '"readonly": {}', detail: '设为只读' },
    unfollow: { text: '"unfollow": {}', detail: '停止跟随远程集群' },
    wait_for_snapshot: { text: '"wait_for_snapshot": { "policy": "${1:my_policy}" }', detail: '等待指定 SLM 快照' },
    migrate: { text: '"migrate": { "number_of_replicas": ${1:1} }', detail: '迁移分片（旧版）' },
    downsample: { text: '"downsample": { "fixed_interval": "${1:1d}" }', detail: '降采样时间序列索引' },
  };
  return (ILM_ACTIONS as readonly string[]).map(a => ({
    label: a,
    detail: skeleton[a]?.detail ?? 'ILM 动作',
    snippet: true,
    insertText: skeleton[a]?.text ?? '"' + a + '": {\n  ${0}\n}',
  }));
}

/** ILM 策略体区域：根 / policy / phases 阶段表 / 阶段对象 / actions */
export function ilmPolicyRegionAt(doc: string, offset: number): 'root' | 'policy' | 'phases' | 'phase' | 'actions' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] !== 'policy') return 'deep';
  if (stack.length === 2) return 'policy';
  if (stack[1] !== 'phases') return 'deep';
  if (stack.length === 3) return 'phases';
  if (stack.length === 4 && stack[2] && (ILM_PHASE_NAMES as readonly string[]).includes(stack[2])) return 'phase';
  if (stack.length === 5 && stack[2] && (ILM_PHASE_NAMES as readonly string[]).includes(stack[2])
      && stack[3] === 'actions') return 'actions';
  return 'deep';
}

/** Watcher watch 的触发器类型 / 调度类型 / 输入 / 条件 / 动作类型（lint 白名单同源） */
export const WATCH_TRIGGER_TYPES = ['schedule', 'chain'] as const;
export const WATCH_SCHEDULE_TYPES = ['interval', 'cron', 'daily', 'hourly', 'weekly', 'monthly', 'yearly'] as const;
export const WATCH_INPUT_TYPES = ['search', 'simple', 'http', 'chain'] as const;
export const WATCH_CONDITION_TYPES = ['always', 'never', 'compare', 'array_compare', 'script'] as const;
export const WATCH_ACTION_TYPES = ['email', 'webhook', 'index', 'logging', 'slack', 'pagerduty', 'jira'] as const;

/** Watcher watch 体（PUT /_watcher/watch/<id>）的根键 */
export function watchBodyKeyItems(): AssistItem[] {
  return [
    { label: 'trigger', detail: '触发方式（schedule/chain）', snippet: true,
      insertText: '"trigger": { "schedule": { "interval": "${1:5m}" } }' },
    { label: 'input', detail: '输入（search/simple/http/chain）', snippet: true,
      insertText: '"input": {\n  "search": {\n    "request": { "indices": ["${1:logs-*}"], "body": { "query": { "match_all": {} } } }\n  }\n}' },
    { label: 'condition', detail: '执行条件（always/never/compare/script…）', snippet: true,
      insertText: '"condition": { "compare": { "ctx.payload.hits.total": { "gt": ${1:0} } } }' },
    { label: 'actions', detail: '动作（动作名自由命名，值为动作类型）', snippet: true,
      insertText: '"actions": {\n  "notify": {\n    "logging": { "text": "${1:watch fired}" }\n  }\n}' },
    { label: 'metadata', detail: '附加到 watch 的自定义元数据', snippet: true, insertText: '"metadata": {\n  ${0}\n}' },
    { label: 'throttle_period', detail: '动作节流窗口（如 5m；窗口内只执行一次）', snippet: true,
      insertText: '"throttle_period": "${1:5m}"' },
  ];
}

/** trigger 对象的触发器类型 */
export function watchTriggerKeyItems(): AssistItem[] {
  return [
    { label: 'schedule', detail: '定时触发（interval/cron/日历）', snippet: true,
      insertText: '"schedule": { "interval": "${1:5m}" }' },
    { label: 'chain', detail: '链式触发（前序 watch 完成后触发）', snippet: true,
      insertText: '"chain": [\n  { "inputs": ["${1:first_watch}"], "trigger": { "schedule": { "interval": "${2:5m}" } } }\n]' },
  ];
}

/** trigger.chain[] 元素的键 */
export function watchChainTriggerKeyItems(): AssistItem[] {
  return [
    { label: 'inputs', detail: '前序 input 名称清单（按序执行）', snippet: true, insertText: '"inputs": ["${1:first_input}"]' },
    { label: 'trigger', detail: '链式触发器内的定时调度', snippet: true,
      insertText: '"trigger": { "schedule": { "interval": "${1:5m}" } }' },
  ];
}

/** 链式触发器内层 trigger 对象只接受 schedule 键 */
export function watchChainNestedTriggerKeyItems(): AssistItem[] {
  return watchTriggerKeyItems().filter(i => i.label === 'schedule');
}

/** schedule 对象的调度键 */
export function watchScheduleKeyItems(): AssistItem[] {
  return [
    { label: 'interval', detail: '固定间隔（如 5m/30s）', snippet: true, insertText: '"interval": "${1:5m}"' },
    { label: 'cron', detail: 'cron 表达式（如 0 0/5 * * * ?）', snippet: true, insertText: '"cron": "${1:0 0/5 * * * ?}"' },
    { label: 'daily', detail: '每天固定时刻', snippet: true, insertText: '"daily": { "at": ["${1:12:00}"] }' },
    { label: 'hourly', detail: '每小时固定分钟', snippet: true, insertText: '"hourly": { "minute": [${1:0}] }' },
    { label: 'weekly', detail: '每周固定时刻', snippet: true, insertText: '"weekly": { "on": ["${1:monday}"], "at": ["${2:12:00}"] }' },
    { label: 'monthly', detail: '每月固定日/时刻', snippet: true, insertText: '"monthly": { "on": [${1:1}], "at": ["${2:12:00}"] }' },
    { label: 'yearly', detail: '每年固定月/日/时刻', snippet: true, insertText: '"yearly": { "in": ["${1:january}"], "on": [${2:1}], "at": ["${3:12:00}"] }' },
  ];
}

/** input 对象的输入类型 */
export function watchInputKeyItems(): AssistItem[] {
  return [
    { label: 'search', detail: '执行一次检索作为 payload', snippet: true,
      insertText: '"search": {\n  "request": { "indices": ["${1:logs-*}"], "body": { "query": { "match_all": {} } } }\n}' },
    { label: 'simple', detail: '静态 payload（不请求 ES）', snippet: true, insertText: '"simple": {\n  ${0}\n}' },
    { label: 'http', detail: '调用外部 HTTP 接口', snippet: true,
      insertText: '"http": { "request": { "host": "${1:example.com}", "port": ${2:443}, "scheme": "${3:https}", "path": "${4:/}" } }' },
    { label: 'chain', detail: '串联多个输入', snippet: true, insertText: '"chain": { "inputs": [\n  ${0}\n] }' },
  ];
}

/** condition 对象的条件类型 */
export function watchConditionKeyItems(): AssistItem[] {
  return [
    { label: 'always', detail: '恒真（每次触发都执行动作）', snippet: true, insertText: '"always": {}' },
    { label: 'never', detail: '恒假（只记录不执行）', snippet: true, insertText: '"never": {}' },
    { label: 'compare', detail: '比较 payload 路径与值', snippet: true,
      insertText: '"compare": { "ctx.payload.hits.total": { "gt": ${1:0} } }' },
    { label: 'array_compare', detail: '比较数组元素', snippet: true,
      insertText: '"array_compare": { "ctx.payload.hits.hits": { "path": "${1:_source.level}", "gte": "${2:error}" } }' },
    { label: 'script', detail: '用脚本判定', snippet: true,
      insertText: '"script": { "source": "${1:return ctx.payload.hits.total > 0}" }' },
  ];
}

/** actions.<名> 对象内的动作类型 */
export function watchActionTypeKeyItems(): AssistItem[] {
  return [
    { label: 'email', detail: '发邮件（需配置邮件账户）', snippet: true,
      insertText: '"email": { "to": "${1:ops@example.com}", "subject": "${2:watch fired}", "body": { "text": "${3:detail}" } }' },
    { label: 'webhook', detail: 'POST 到外部 URL', snippet: true,
      insertText: '"webhook": { "method": "${1:POST}", "url": "${2:https://example.com/hook}", "body": "${3:payload}" }' },
    { label: 'index', detail: '把 payload 写入索引', snippet: true,
      insertText: '"index": { "index": "${1:watch-results}", "doc_id": "${2:{{ctx.watch_id}}}" }' },
    { label: 'logging', detail: '写一条日志（最简，便于验证）', snippet: true,
      insertText: '"logging": { "text": "${1:watch fired}" }' },
    { label: 'slack', detail: '发 Slack 消息', snippet: true,
      insertText: '"slack": { "message": { "text": "${1:watch fired}" } }' },
    { label: 'pagerduty', detail: '触发 PagerDuty 事件', snippet: true,
      insertText: '"pagerduty": { "event_type": "${1:trigger}", "description": "${2:watch fired}" }' },
    { label: 'jira', detail: '创建 Jira 工单', snippet: true,
      insertText: '"jira": { "fields": { "project": { "key": "${1:OPS}" }, "issuetype": { "name": "${2:Task}" }, "summary": "${3:watch fired}" } }' },
  ];
}

/** condition.<类型> 对象的参数键（script 复用脚本体目录；compare 是动态表达式） */
export function watchConditionParamsKeyItems(type: string): AssistItem[] {
  return type === 'script' ? scriptObjectKeyItems() : [];
}

/** array_compare 的 ctx 路径对象键：path + 条件算子 */
export function watchArrayCompareKeyItems(): AssistItem[] {
  return [
    { label: 'path', detail: '数组元素的取值路径（如 _source.status）', snippet: true, insertText: '"path": "${1:_source.status}"' },
    { label: 'eq', detail: '等于（quantifier + value）', snippet: true,
      insertText: '"eq": { "quantifier": "${1|some,all|}", "value": "${2:error}" }' },
    { label: 'not_eq', detail: '不等于', snippet: true,
      insertText: '"not_eq": { "quantifier": "${1|some,all|}", "value": "${2:error}" }' },
    { label: 'lt', detail: '小于', snippet: true,
      insertText: '"lt": { "quantifier": "${1|some,all|}", "value": ${2:0} }' },
    { label: 'gt', detail: '大于', snippet: true,
      insertText: '"gt": { "quantifier": "${1|some,all|}", "value": ${2:0} }' },
    { label: 'lte', detail: '小于等于', snippet: true,
      insertText: '"lte": { "quantifier": "${1|some,all|}", "value": ${2:0} }' },
    { label: 'gte', detail: '大于等于', snippet: true,
      insertText: '"gte": { "quantifier": "${1|some,all|}", "value": ${2:0} }' },
  ];
}

/** array_compare 条件算子对象的键 */
export function watchArrayCompareOpKeyItems(): AssistItem[] {
  return [
    { label: 'quantifier', detail: '量词（some=任一 / all=全部）', snippet: true, insertText: '"quantifier": "${1|some,all|}"' },
    { label: 'value', detail: '比较值', snippet: true, insertText: '"value": "${1:error}"' },
  ];
}

/** HTTP 请求定义（webhook 动作与 input.http.request 共用） */
export function httpRequestKeyItems(): AssistItem[] {
  return [
    { label: 'url', detail: '完整 URL（与 scheme/host/path 二选一）', snippet: true, insertText: '"url": "${1:https://example.com/hook}"' },
    { label: 'method', detail: 'HTTP 方法', snippet: true, insertText: '"method": "${1|POST,GET,PUT,DELETE|}"' },
    { label: 'scheme', detail: '协议', snippet: true, insertText: '"scheme": "${1|https,http|}"' },
    { label: 'host', detail: '主机名', snippet: true, insertText: '"host": "${1:example.com}"' },
    { label: 'port', detail: '端口', snippet: true, insertText: '"port": ${1:443}' },
    { label: 'path', detail: '路径', snippet: true, insertText: '"path": "${1:/hook}"' },
    { label: 'params', detail: '查询参数', snippet: true, insertText: '"params": {\n  "${1:key}": "${2:value}"\n}' },
    { label: 'headers', detail: '请求头', snippet: true, insertText: '"headers": {\n  "${1:Content-Type}": "${2:application/json}"\n}' },
    { label: 'body', detail: '请求体（字符串，常配 mustache）', snippet: true, insertText: '"body": "${1:{{ctx.payload}}}"' },
    { label: 'auth', detail: '认证（basic 等）', snippet: true, insertText: '"auth": {\n  ${0}\n}' },
    { label: 'connection_timeout', detail: '连接超时', snippet: true, insertText: '"connection_timeout": "${1:10s}"' },
    { label: 'read_timeout', detail: '读取超时', snippet: true, insertText: '"read_timeout": "${1:10s}"' },
    { label: 'proxy', detail: '代理配置', snippet: true, insertText: '"proxy": {\n  ${0}\n}' },
  ];
}

/** HTTP basic 认证对象的键 */
export function httpAuthBasicKeyItems(): AssistItem[] {
  return [
    { label: 'username', detail: 'Basic 认证用户名', snippet: true, insertText: '"username": "${1:user}"' },
    { label: 'password', detail: 'Basic 认证密码', snippet: true, insertText: '"password": "${1:secret}"' },
  ];
}

/** HTTP 代理对象的键 */
export function httpProxyKeyItems(): AssistItem[] {
  return [
    { label: 'host', detail: '代理主机', snippet: true, insertText: '"host": "${1:proxy.example.com}"' },
    { label: 'port', detail: '代理端口', snippet: true, insertText: '"port": ${1:8080}' },
  ];
}

/** input.http 对象的键 */
export function watchHttpInputKeyItems(): AssistItem[] {
  return [
    { label: 'request', detail: 'HTTP 请求定义（url/method/headers/body…）', snippet: true,
      insertText: '"request": {\n  "url": "${1:https://example.com/input}"\n}' },
    { label: 'extract', detail: '从响应中提取的字段清单', snippet: true, insertText: '"extract": ["${1:field}"]' },
    { label: 'response_content_type', detail: '响应内容类型', snippet: true,
      insertText: '"response_content_type": "${1|json,yaml,text|}"' },
  ];
}

/** input.chain 对象的键 */
export function watchChainInputKeyItems(): AssistItem[] {
  return [
    { label: 'inputs', detail: '串联的命名输入（每项一个 input 定义）', snippet: true,
      insertText: '"inputs": [\n  { "${1:first}": { "simple": {} } }\n]' },
  ];
}

/** input.search 对象的键 */
export function watchSearchInputKeyItems(): AssistItem[] {
  return [
    { label: 'request', detail: '检索请求定义（indices/body/template…）', snippet: true,
      insertText: '"request": {\n  "indices": ["${1:logs-*}"],\n  "body": { "query": { "match_all": {} } }\n}' },
    { label: 'extract', detail: '从命中中提取的字段清单', snippet: true, insertText: '"extract": ["${1:field}"]' },
    { label: 'timeout', detail: '检索超时', snippet: true, insertText: '"timeout": "${1:1m}"' },
  ];
}

/** input.search.request 对象的键 */
export function watchSearchRequestKeyItems(): AssistItem[] {
  return [
    { label: 'indices', detail: '检索目标索引（数组/通配）', snippet: true, insertText: '"indices": ["${1:logs-*}"]' },
    { label: 'body', detail: '检索体（query/sort/aggs…）', snippet: true, insertText: '"body": {\n  ${0}\n}' },
    { label: 'template', detail: '检索模板（id/source/params）', snippet: true,
      insertText: '"template": { "id": "${1:my-template}" }' },
    { label: 'search_type', detail: '查询类型', snippet: true,
      insertText: '"search_type": "${1|query_then_fetch,dfs_query_then_fetch|}"' },
    { label: 'indices_options', detail: '索引选项（通配展开/忽略缺失）', snippet: true,
      insertText: '"indices_options": {\n  "expand_wildcards": ["${1:open}"],\n  "ignore_unavailable": ${2|true,false|}\n}' },
    { label: 'rest_total_hits_as_int', detail: 'hits.total 以整数返回', snippet: true,
      insertText: '"rest_total_hits_as_int": ${1|false,true|}' },
  ];
}

/** actions.<名>.<类型> 对象的参数键（按动作类型；官方 spec 字段） */
export function watchActionParamsKeyItems(type: string): AssistItem[] {
  switch (type) {
    case 'index': return [
      { label: 'index', detail: '写入目标索引（可含日期数学）', snippet: true, insertText: '"index": "${1:watch-results}"' },
      { label: 'doc_id', detail: '文档 id（可含 mustache 变量）', snippet: true, insertText: '"doc_id": "${1:{{ctx.watch_id}}}"' },
      { label: 'refresh', detail: '写入后刷新策略', snippet: true, insertText: '"refresh": "${1|false,true,wait_for|}"' },
      { label: 'op_type', detail: '写入形态（create=已存在则失败）', snippet: true, insertText: '"op_type": "${1|create,index|}"' },
      { label: 'timeout', detail: '写入超时', snippet: true, insertText: '"timeout": "${1:60s}"' },
      { label: 'execution_time_field', detail: '执行时间写入的字段名', snippet: true,
        insertText: '"execution_time_field": "${1:execution_time}"' },
    ];
    case 'logging': return [
      { label: 'level', detail: '日志级别', snippet: true, insertText: '"level": "${1|info,warn,error,debug|}"' },
      { label: 'text', detail: '日志正文（可含 mustache）', snippet: true, insertText: '"text": "${1:watch fired}"' },
      { label: 'category', detail: '日志分类（logger 后缀）', snippet: true, insertText: '"category": "${1:watch}"' },
    ];
    case 'email': return [
      { label: 'to', detail: '收件人（数组或逗号串）', snippet: true, insertText: '"to": ["${1:ops@example.com}"]' },
      { label: 'subject', detail: '邮件主题（可含 mustache）', snippet: true, insertText: '"subject": "${1:watch fired}"' },
      { label: 'body', detail: '邮件正文（text/html）', snippet: true, insertText: '"body": { "text": "${1:detail}" }' },
      { label: 'from', detail: '发件人（覆盖账户默认）', snippet: true, insertText: '"from": "${1:watcher@example.com}"' },
      { label: 'cc', detail: '抄送', snippet: true, insertText: '"cc": ["${1:cc@example.com}"]' },
      { label: 'bcc', detail: '密送', snippet: true, insertText: '"bcc": ["${1:bcc@example.com}"]' },
      { label: 'reply_to', detail: '回复地址', snippet: true, insertText: '"reply_to": "${1:reply@example.com}"' },
      { label: 'priority', detail: '邮件优先级', snippet: true, insertText: '"priority": "${1|normal,lowest,low,high,highest|}"' },
      { label: 'attachments', detail: '附件（http/reporting/data 三类）', snippet: true, insertText: '"attachments": {\n  ${0}\n}' },
    ];
    case 'webhook': return httpRequestKeyItems();
    case 'slack': return [
      { label: 'account', detail: 'Slack 账户（省略用默认）', snippet: true, insertText: '"account": "${1:slack-account}"' },
      { label: 'message', detail: '消息体（text/from/to/attachments）', snippet: true,
        insertText: '"message": {\n  "text": "${1:watch fired}"\n}' },
    ];
    case 'pagerduty': return [
      { label: 'account', detail: 'PagerDuty 账户（省略用默认）', snippet: true, insertText: '"account": "${1:pagerduty-account}"' },
      { label: 'description', detail: '事件描述', snippet: true, insertText: '"description": "${1:watch fired}"' },
      { label: 'incident_key', detail: '事件去重键（同名事件合并）', snippet: true, insertText: '"incident_key": "${1:{{ctx.watch_id}}}"' },
      { label: 'event_type', detail: '事件类型（trigger/resolve/acknowledge）', snippet: true,
        insertText: '"event_type": "${1|trigger,resolve,acknowledge|}"' },
      { label: 'client', detail: '客户端名称', snippet: true, insertText: '"client": "${1:watcher}"' },
      { label: 'client_url', detail: '客户端链接', snippet: true, insertText: '"client_url": "${1:https://example.com}"' },
      { label: 'attach_payload', detail: '附带完整 payload', snippet: true, insertText: '"attach_payload": ${1|false,true|}' },
      { label: 'contexts', detail: '上下文链接清单', snippet: true, insertText: '"contexts": [\n  ${0}\n]' },
      { label: 'proxy', detail: '代理配置', snippet: true, insertText: '"proxy": {\n  ${0}\n}' },
    ];
    case 'jira': return [
      { label: 'account', detail: 'Jira 账户（省略用默认）', snippet: true, insertText: '"account": "${1:jira-account}"' },
      { label: 'fields', detail: '工单字段（project/issuetype/summary…）', snippet: true,
        insertText: '"fields": {\n  "project": { "key": "${1:OPS}" },\n  "issuetype": { "name": "${2:Task}" },\n  "summary": "${3:watch fired}"\n}' },
    ];
    default: return [];
  }
}

/** email 动作 body 对象的键 */
export function watchEmailBodyKeyItems(): AssistItem[] {
  return [
    { label: 'text', detail: '纯文本正文（可含 mustache）', snippet: true, insertText: '"text": "${1:detail}"' },
    { label: 'html', detail: 'HTML 正文（可含 mustache）', snippet: true, insertText: '"html": "${1:<p>detail</p>}"' },
  ];
}

/** slack 动作 message 对象的键 */
export function watchSlackMessageKeyItems(): AssistItem[] {
  return [
    { label: 'text', detail: '消息正文（可含 mustache）', snippet: true, insertText: '"text": "${1:watch fired}"' },
    { label: 'from', detail: '发送者显示名', snippet: true, insertText: '"from": "${1:watcher}"' },
    { label: 'to', detail: '接收频道/用户清单', snippet: true, insertText: '"to": ["${1:#alerts}"]' },
    { label: 'attachments', detail: 'Slack 附件清单', snippet: true, insertText: '"attachments": [\n  ${0}\n]' },
  ];
}

/** email 动作 attachments.<名> 对象的键 */
export function watchEmailAttachmentKeyItems(): AssistItem[] {
  return [
    { label: 'http', detail: 'HTTP 拉取附件', snippet: true,
      insertText: '"http": { "request": { "url": "${1:https://example.com/report.pdf}" } }' },
    { label: 'reporting', detail: 'Kibana 报表附件', snippet: true,
      insertText: '"reporting": { "url": "${1:https://kibana/report.pdf}" }' },
    { label: 'data', detail: '数据附件（JSON/YAML）', snippet: true, insertText: '"data": { "format": "${1|json,yaml|}" }' },
  ];
}

/** email attachments.<名>.http 的键 */
export function watchEmailHttpAttachmentKeyItems(): AssistItem[] {
  return [
    { label: 'content_type', detail: '附件 MIME 类型', snippet: true, insertText: '"content_type": "${1:application/pdf}"' },
    { label: 'inline', detail: '是否内嵌显示', snippet: true, insertText: '"inline": ${1|false,true|}' },
    { label: 'request', detail: 'HTTP 请求定义（url/method/headers…）', snippet: true,
      insertText: '"request": {\n  "url": "${1:https://example.com/report.pdf}"\n}' },
  ];
}

/** email attachments.<名>.reporting 的键 */
export function watchEmailReportingAttachmentKeyItems(): AssistItem[] {
  return [
    { label: 'url', detail: '报表下载地址', snippet: true, insertText: '"url": "${1:https://kibana/report.pdf}"' },
    { label: 'inline', detail: '是否内嵌显示', snippet: true, insertText: '"inline": ${1|false,true|}' },
    { label: 'retries', detail: '下载重试次数', snippet: true, insertText: '"retries": ${1:3}' },
    { label: 'interval', detail: '重试间隔', snippet: true, insertText: '"interval": "${1:10s}"' },
    { label: 'request', detail: 'HTTP 请求定义', snippet: true, insertText: '"request": {\n  ${0}\n}' },
  ];
}

/** email attachments.<名>.data 的键 */
export function watchEmailDataAttachmentKeyItems(): AssistItem[] {
  return [
    { label: 'format', detail: '数据格式（json/yaml）', snippet: true, insertText: '"format": "${1|json,yaml|}"' },
  ];
}

/** slack 动作 attachments[] 元素的键 */
export function watchSlackAttachmentKeyItems(): AssistItem[] {
  return [
    { label: 'title', detail: '附件标题', snippet: true, insertText: '"title": "${1:watch fired}"' },
    { label: 'text', detail: '附件正文', snippet: true, insertText: '"text": "${1:detail}"' },
    { label: 'author_name', detail: '作者名', snippet: true, insertText: '"author_name": "${1:watcher}"' },
    { label: 'author_link', detail: '作者链接', snippet: true, insertText: '"author_link": "${1:https://example.com}"' },
    { label: 'author_icon', detail: '作者头像', snippet: true, insertText: '"author_icon": "${1:https://example.com/a.png}"' },
    { label: 'color', detail: '侧边颜色（如 danger/good/#ff0000）', snippet: true, insertText: '"color": "${1:danger}"' },
    { label: 'fallback', detail: '纯文本回退摘要', snippet: true, insertText: '"fallback": "${1:watch fired}"' },
    { label: 'fields', detail: '字段列表（title/value/short）', snippet: true,
      insertText: '"fields": [\n  { "title": "${1:Field}", "value": "${2:value}", "short": ${3|true,false|} }\n]' },
    { label: 'footer', detail: '页脚文字', snippet: true, insertText: '"footer": "${1:watcher}"' },
    { label: 'footer_icon', detail: '页脚图标', snippet: true, insertText: '"footer_icon": "${1:https://example.com/f.png}"' },
    { label: 'image_url', detail: '大图地址', snippet: true, insertText: '"image_url": "${1:https://example.com/img.png}"' },
    { label: 'pretext', detail: '正文前导文字', snippet: true, insertText: '"pretext": "${1:alert}"' },
    { label: 'thumb_url', detail: '缩略图地址', snippet: true, insertText: '"thumb_url": "${1:https://example.com/t.png}"' },
    { label: 'title_link', detail: '标题链接', snippet: true, insertText: '"title_link": "${1:https://example.com}"' },
    { label: 'ts', detail: '时间戳（epoch 秒）', snippet: true, insertText: '"ts": ${1:1700000000}' },
  ];
}

/** slack attachment fields[] 元素的键 */
export function watchSlackAttachmentFieldKeyItems(): AssistItem[] {
  return [
    { label: 'short', detail: '是否半宽显示', snippet: true, insertText: '"short": ${1|true,false|}' },
    { label: 'title', detail: '字段标题', snippet: true, insertText: '"title": "${1:Field}"' },
    { label: 'value', detail: '字段值', snippet: true, insertText: '"value": "${1:value}"' },
  ];
}

/** jira 动作 fields 对象的键 */
export function watchJiraFieldsKeyItems(): AssistItem[] {
  return [
    { label: 'project', detail: '目标项目（key）', snippet: true, insertText: '"project": { "key": "${1:OPS}" }' },
    { label: 'issuetype', detail: '工单类型（name）', snippet: true, insertText: '"issuetype": { "name": "${1:Task}" }' },
    { label: 'summary', detail: '工单标题', snippet: true, insertText: '"summary": "${1:watch fired}"' },
    { label: 'description', detail: '工单描述', snippet: true, insertText: '"description": "${1:detail}"' },
    { label: 'labels', detail: '标签清单', snippet: true, insertText: '"labels": ["${1:watcher}"]' },
    { label: 'priority', detail: '优先级（name）', snippet: true, insertText: '"priority": { "name": "${1:High}" }' },
    { label: 'assignee', detail: '经办人（name）', snippet: true, insertText: '"assignee": { "name": "${1:jdoe}" }' },
    { label: 'reporter', detail: '报告人（name）', snippet: true, insertText: '"reporter": { "name": "${1:watcher}" }' },
  ];
}

/** pagerduty contexts[] 元素的键 */
export function watchPagerdutyContextKeyItems(): AssistItem[] {
  return [
    { label: 'type', detail: '上下文类型（link/image）', snippet: true, insertText: '"type": "${1|link,image|}"' },
    { label: 'href', detail: '上下文链接', snippet: true, insertText: '"href": "${1:https://example.com}"' },
    { label: 'src', detail: '图片地址（type=image 时）', snippet: true, insertText: '"src": "${1:https://example.com/a.png}"' },
  ];
}

/** 按栈定位 condition 类型并给参数键（兼容内联试跑的 watch 前缀） */
export function watchConditionParamsKeyItemsAt(doc: string, offset: number): AssistItem[] {
  const stack = frameKeysAt(doc, offset);
  const ci = stack.indexOf('condition');
  if (ci < 0) return [];
  const type = stack[ci + 1];
  if (!type || stack.length !== ci + 3) return [];
  return watchConditionParamsKeyItems(type);
}

/** 按栈定位动作类型并给参数键（actions.<名>.<类型>；兼容 watch 前缀） */
export function watchActionParamsKeyItemsAt(doc: string, offset: number): AssistItem[] {
  const stack = frameKeysAt(doc, offset);
  const ai = stack.indexOf('actions');
  if (ai < 0) return [];
  const type = stack[ai + 2];
  if (!type || stack.length !== ai + 4) return [];
  return watchActionParamsKeyItems(type);
}

/** Watcher 体区域：根 / 触发器 / 调度 / 输入 / 条件 / 动作类型；更深层不出键 */
export function watchRegionAt(doc: string, offset: number):
  'root' | 'trigger' | 'schedule' | 'input' | 'search-input' | 'search-request'
  | 'search-body' | 'search-query' | 'http-input' | 'http-request'
  | 'chain-input-container' | 'chain-input'
  | 'chain-trigger' | 'chain-trigger-container'
  | 'condition' | 'condition-params' | 'array-compare-body' | 'array-compare-op'
  | 'action' | 'action-params'
  | 'action-email-body' | 'action-slack-message' | 'action-jira-fields'
  | 'email-attachment' | 'email-att-http' | 'email-att-reporting' | 'email-att-data'
  | 'slack-attachment' | 'slack-attachment-field'
  | 'http-auth-basic' | 'http-proxy' | 'pagerduty-context' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'trigger') {
    if (stack.length === 2) return 'trigger';
    if (stack.length === 3 && stack[1] === 'schedule') return 'schedule';
    if (stack[1] === 'chain') {
      if (stack.length === 4) return 'chain-trigger';
      if (stack.length === 5 && stack[3] === 'trigger') return 'chain-trigger-container';
      if (stack.length === 6 && stack[3] === 'trigger' && stack[4] === 'schedule') return 'schedule';
    }
    return 'deep';
  }
  if (stack[0] === 'input') {
    if (stack.length === 2) return 'input';
    if (stack[1] === 'search') {
      /* input.search.request.body 是整棵 search body：根层给 search 根键，query 子树回落查询补全 */
      if (stack[2] === 'request' && stack[3] === 'body') {
        if (stack.length === 5) return 'search-body';
        if (stack.includes('query')) return 'search-query';
      }
      if (stack.length === 3) return 'search-input';
      if (stack.length === 4 && stack[2] === 'request') return 'search-request';
      return 'deep';
    }
    if (stack[1] === 'http') {
      if (stack.length === 3) return 'http-input';
      if (stack.length === 4 && stack[2] === 'request') return 'http-request';
      if (stack.length === 6 && stack[2] === 'request' && stack[3] === 'auth' && stack[4] === 'basic') {
        return 'http-auth-basic';
      }
      if (stack.length === 5 && stack[2] === 'request' && stack[3] === 'proxy') return 'http-proxy';
    }
    if (stack[1] === 'chain') {
      if (stack.length === 3) return 'chain-input-container';
      /* inputs 元素是「命名输入」对象：名字动态，名字值里再给 input 类型 */
      if (stack.length === 6 && stack[2] === 'inputs' && stack[3] === null && stack[4] && stack[5] === null) {
        return 'chain-input';
      }
    }
    return 'deep';
  }
  if (stack[0] === 'condition') {
    if (stack.length === 2) return 'condition';
    if (stack.length === 3) return 'condition-params';
    if (stack[1] === 'array_compare') {
      if (stack.length === 4) return 'array-compare-body';
      if (stack.length === 5 && stack[3] !== 'path') return 'array-compare-op';
    }
    return 'deep';
  }
  if (stack[0] === 'actions') {
    if (stack.length === 3) return 'action';
    if (stack.length === 4) return 'action-params';
    if (stack.length === 5 && stack[2] === 'email' && stack[3] === 'body') return 'action-email-body';
    if (stack.length === 5 && stack[2] === 'slack' && stack[3] === 'message') return 'action-slack-message';
    if (stack.length === 5 && stack[2] === 'jira' && stack[3] === 'fields') return 'action-jira-fields';
    if (stack[2] === 'email' && stack[3] === 'attachments') {
      if (stack.length === 6) return 'email-attachment';
      if (stack.length === 7 && stack[5] === 'http') return 'email-att-http';
      if (stack.length === 7 && stack[5] === 'reporting') return 'email-att-reporting';
      if (stack.length === 7 && stack[5] === 'data') return 'email-att-data';
      if (stack.length === 8 && (stack[5] === 'http' || stack[5] === 'reporting') && stack[6] === 'request') {
        return 'http-request';
      }
    }
    if (stack.length === 6 && stack[2] === 'webhook' && stack[3] === 'auth' && stack[4] === 'basic') {
      return 'http-auth-basic';
    }
    if (stack.length === 5 && stack[2] === 'webhook' && stack[3] === 'proxy') return 'http-proxy';
    if (stack.length === 6 && stack[2] === 'pagerduty' && stack[3] === 'contexts') return 'pagerduty-context';
    if (stack.length === 7 && stack[2] === 'slack' && stack[3] === 'message' && stack[4] === 'attachments') {
      return 'slack-attachment';
    }
    if (stack.length === 9 && stack[2] === 'slack' && stack[3] === 'message'
        && stack[4] === 'attachments' && stack[6] === 'fields') return 'slack-attachment-field';
    return 'deep';
  }
  return 'deep';
}

/** 安全角色体（PUT/POST /_security/role/<name>）的根键 */
export function securityRoleBodyKeyItems(): AssistItem[] {
  return [
    { label: 'cluster', detail: '集群级权限（monitor/manage_index_templates…）', snippet: true,
      insertText: '"cluster": ["${1:monitor}"]' },
    { label: 'indices', detail: '索引权限组（索引模式 + 权限 + 字段/查询限制）', snippet: true,
      insertText: '"indices": [\n  {\n    "names": ["${1:logs-*}"],\n    "privileges": ["${2:read}"]\n  }\n]' },
    { label: 'applications', detail: '应用权限（application/privileges/resources）', snippet: true,
      insertText: '"applications": [\n  {\n    "application": "${1:my-app}",\n    "privileges": ["${2:read}"],\n    "resources": ["*"]\n  }\n]' },
    { label: 'global', detail: '全局权限（请求感知，当前支持 application.manage 等）', snippet: true,
      insertText: '"global": {\n  "application": {\n    "manage": ["${1:myapp}"]\n  }\n}' },
    { label: 'run_as', detail: '允许代表其执行请求的用户', snippet: true, insertText: '"run_as": ["${1:user1}"]' },
    { label: 'metadata', detail: '附加到角色的自定义元数据', snippet: true, insertText: '"metadata": {\n  ${0}\n}' },
    { label: 'transient_metadata', detail: '临时元数据（启用/禁用等）', snippet: true,
      insertText: '"transient_metadata": {\n  ${0}\n}' },
  ];
}

/** indices[] 元素的键 */
export function securityRoleIndexKeyItems(): AssistItem[] {
  return [
    { label: 'names', detail: '索引/索引模式（支持通配）', snippet: true, insertText: '"names": ["${1:logs-*}"],\n    "privileges": ["${2:read}"]' },
    { label: 'privileges', detail: '索引权限（read/write/manage/view_index_metadata…）', snippet: true,
      insertText: '"privileges": ["${1:read}"]' },
    { label: 'field_security', detail: '字段级安全（grant/except）', snippet: true,
      insertText: '"field_security": {\n  "grant": ["${1:*}"],\n  "except": []\n}' },
    { label: 'query', detail: '文档级查询限制（Query DSL 或 JSON 串）', snippet: true, insertText: '"query": {\n  ${0}\n}' },
    { label: 'allow_restricted_indices', detail: '允许访问受限系统索引（默认 false）', snippet: true,
      insertText: '"allow_restricted_indices": ${1|false,true|}' },
  ];
}

/** indices[].field_security 的键 */
export function securityRoleFieldSecurityKeyItems(): AssistItem[] {
  return [
    { label: 'grant', detail: '允许访问的字段（支持通配）', snippet: true, insertText: '"grant": ["${1:*}"],\n  "except": []' },
    { label: 'except', detail: '从 grant 中排除的字段', snippet: true, insertText: '"except": ["${1:secret_field}"]' },
  ];
}

/** applications[] 元素的键 */
export function securityRoleAppKeyItems(): AssistItem[] {
  return [
    { label: 'application', detail: '应用名（如 kibana）', snippet: true, insertText: '"application": "${1:my-app}"' },
    { label: 'privileges', detail: '应用内权限', snippet: true, insertText: '"privileges": ["${1:read}"]' },
    { label: 'resources', detail: '资源范围（* 或具体对象）', snippet: true, insertText: '"resources": ["${1:*}"]' },
  ];
}

/** 安全角色体区域：根 / indices 元素 / field_security / applications 元素 */
export function securityRoleRegionAt(doc: string, offset: number):
  'root' | 'index' | 'field-security' | 'query' | 'app' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  /* indices[] 里的 query 是整棵 Query DSL——回落到查询补全 */
  if (stack[0] === 'indices' && stack.includes('query')) return 'query';
  if (stack[0] === 'indices' && stack.length === 3) return 'index';
  if (stack[0] === 'indices' && stack.length === 4 && stack[2] === 'field_security') return 'field-security';
  if (stack[0] === 'applications' && stack.length === 3) return 'app';
  return 'deep';
}

/** 安全用户体（PUT/POST /_security/user/<name>）的根键 */
export function securityUserBodyKeyItems(): AssistItem[] {
  return [
    { label: 'password', detail: '明文密码（服务端哈希后存储；与 password_hash 二选一）', snippet: true,
      insertText: '"password": "${1:change-me}"' },
    { label: 'password_hash', detail: '已哈希密码（bcrypt），批量创建时用', snippet: true,
      insertText: '"password_hash": "${1:$2a$10$...}"' },
    { label: 'roles', detail: '授予的角色清单', snippet: true, insertText: '"roles": ["${1:viewer}"]' },
    { label: 'full_name', detail: '显示名', snippet: true, insertText: '"full_name": "${1:张三}"' },
    { label: 'email', detail: '邮箱', snippet: true, insertText: '"email": "${1:user@example.com}"' },
    { label: 'metadata', detail: '附加到用户的自定义元数据', snippet: true, insertText: '"metadata": {\n  ${0}\n}' },
    { label: 'enabled', detail: '是否启用（默认 true）', snippet: true, insertText: '"enabled": ${1|true,false|}' },
    { label: 'role_templates', detail: '角色模板（按模板动态解析角色）', snippet: true,
      insertText: '"role_templates": [\n  {\n    "template": { "source": "${1:mustache-template}" },\n    "format": "${2|string,json|}"\n  }\n]' },
  ];
}

/** 安全用户体区域：根 / role_templates 元素 */
export function securityUserRegionAt(doc: string, offset: number):
  'root' | 'role-template' | 'template-script' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'role_templates') {
    if (stack.length === 3) return 'role-template';
    if (stack.length === 4 && stack[2] === 'template') return 'template-script';
  }
  return 'deep';
}

/** role_templates[] 元素的键 */
export function securityRoleTemplateKeyItems(): AssistItem[] {
  return [
    { label: 'template', detail: '模板对象（source 为 Mustache 表达式）', snippet: true,
      insertText: '"template": { "source": "${1:mustache-template}" }' },
    { label: 'format', detail: '模板输出格式（string/json）', snippet: true, insertText: '"format": "${1|string,json|}"' },
  ];
}

/** 角色映射体（PUT/POST /_security/role_mapping/<name>）的根键 */
export function securityRoleMappingBodyKeyItems(): AssistItem[] {
  return [
    { label: 'roles', detail: '匹配时授予的角色清单', snippet: true, insertText: '"roles": ["${1:viewer}"]' },
    { label: 'enabled', detail: '是否启用该映射（默认 true）', snippet: true, insertText: '"enabled": ${1|true,false|}' },
    { label: 'rules', detail: '匹配规则（field/all/any/except…）', snippet: true,
      insertText: '"rules": {\n  "field": { "${1:username}": "${2:jdoe}" }\n}' },
    { label: 'role_templates', detail: '角色模板（按模板动态解析角色）', snippet: true,
      insertText: '"role_templates": [\n  {\n    "template": { "source": "${1:mustache-template}" },\n    "format": "${2|string,json|}"\n  }\n]' },
    { label: 'run_as', detail: '允许映射用户以这些身份运行', snippet: true, insertText: '"run_as": ["${1:user}"]' },
    { label: 'metadata', detail: '附加到映射的自定义元数据', snippet: true, insertText: '"metadata": {\n  ${0}\n}' },
  ];
}

/** 角色映射 rules 对象与 all/any 元素的规则键 */
export function securityRoleMappingRuleKeyItems(): AssistItem[] {
  return [
    { label: 'field', detail: '字段匹配（字段名 → 值）', snippet: true,
      insertText: '"field": { "${1:username}": "${2:jdoe}" }' },
    { label: 'all', detail: '全部子规则满足', snippet: true,
      insertText: '"all": [\n  { "field": { "${1:username}": "${2:jdoe}" } }\n]' },
    { label: 'any', detail: '任一子规则满足', snippet: true,
      insertText: '"any": [\n  { "field": { "${1:username}": "${2:jdoe}" } }\n]' },
    { label: 'except', detail: '排除子规则', snippet: true,
      insertText: '"except": { "field": { "${1:username}": "${2:jdoe}" } }' },
  ];
}

/** 角色映射区域：根 / rules 对象 / all/any 元素·except 对象 / 更深 */
export function securityRoleMappingRegionAt(doc: string, offset: number):
  'root' | 'rules' | 'rule' | 'role-template' | 'template-script' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'rules') {
    if (stack.length === 2) return 'rules';
    if (stack.length === 4 && (stack[1] === 'all' || stack[1] === 'any')) return 'rule';
    if (stack.length === 3 && stack[1] === 'except') return 'rule';
    return 'deep';
  }
  if (stack[0] === 'role_templates') {
    if (stack.length === 3) return 'role-template';
    if (stack.length === 4 && stack[2] === 'template') return 'template-script';
  }
  return 'deep';
}

/** API Key 创建体（POST /_security/api_key）的根键 */
export function securityApiKeyBodyKeyItems(): AssistItem[] {
  return [
    { label: 'name', detail: 'API Key 名称（便于识别/吊销）', snippet: true, insertText: '"name": "${1:my-api-key}"' },
    { label: 'expiration', detail: '有效期（如 1d/30d；省略=不过期）', snippet: true, insertText: '"expiration": "${1:1d}"' },
    { label: 'role_descriptors', detail: '该 Key 的角色权限（结构同安全角色体）', snippet: true,
      insertText: '"role_descriptors": {\n  ${0}\n}' },
    { label: 'metadata', detail: '附加到 Key 的自定义元数据', snippet: true, insertText: '"metadata": {\n  ${0}\n}' },
  ];
}

/** API Key 体区域：根 / role_descriptors 里的角色定义 / 更深（角色名是动态键） */
export function securityApiKeyRegionAt(doc: string, offset: number): 'root' | 'role' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'role_descriptors' && stack.length === 3) return 'role';
  return 'deep';
}

/** Ingest 处理器全目录（lint 白名单；补全为常用处理器给可接受骨架） */
export const INGEST_PROCESSOR_TYPES = [
  'append', 'attachment', 'bytes', 'circle', 'community_id', 'convert', 'csv', 'date',
  'date_index_name', 'dissect', 'dot_expander', 'drop', 'enrich', 'fail', 'fingerprint',
  'foreach', 'geoip', 'grok', 'gsub', 'html_strip', 'inference', 'ip_location', 'join', 'json',
  'kv', 'lowercase', 'network_direction', 'pipeline', 'redact', 'registered_domain', 'remove',
  'rename', 'reroute', 'script', 'set', 'set_security_user', 'sort', 'split', 'trim',
  'uppercase', 'uri_parts', 'user_agent',
] as const;
/** 处理器对象的公共开关（与处理器类型并存，lint 不得误报） */
export const INGEST_PROCESSOR_COMMON_KEYS = ['tag', 'description', 'if', 'ignore_failure', 'on_failure'] as const;

/** Ingest 管道体（PUT /_ingest/pipeline/<id>）的根键 */
export function ingestPipelineBodyKeyItems(): AssistItem[] {
  return [
    { label: 'description', detail: '管道用途说明', snippet: true, insertText: '"description": "${1:parse logs}"' },
    { label: 'version', detail: '管道版本号（便于回滚识别）', snippet: true, insertText: '"version": ${1:1}' },
    { label: 'processors', detail: '处理器链（按序执行）', snippet: true,
      insertText: '"processors": [\n  {\n    "set": { "field": "${1:field}", "value": "${2:value}" }\n  }\n]' },
    { label: 'on_failure', detail: '任一处理器失败时执行的动作链', snippet: true,
      insertText: '"on_failure": [\n  { "set": { "field": "error.message", "value": "{{ _ingest.on_failure_message }}" } }\n]' },
    { label: '_meta', detail: '管道的自定义元数据', snippet: true, insertText: '"_meta": {\n  ${0}\n}' },
  ];
}

/** processors[] / on_failure 里可用的处理器类型（常用类型带参数骨架） */
export function ingestProcessorKeyItems(): AssistItem[] {
  const skeleton: Record<string, { text: string; detail: string }> = {
    set: { text: '"set": { "field": "${1:field}", "value": "${2:value}" }', detail: '设置字段值' },
    rename: { text: '"rename": { "field": "${1:old_field}", "target_field": "${2:new_field}" }', detail: '重命名字段' },
    remove: { text: '"remove": { "field": "${1:field}" }', detail: '删除字段' },
    convert: { text: '"convert": { "field": "${1:field}", "type": "${2|integer,long,float,double,string,boolean,ip|}" }', detail: '类型转换' },
    date: { text: '"date": { "field": "${1:timestamp}", "formats": ["${2:ISO8601}"] }', detail: '日期解析' },
    grok: { text: '"grok": { "field": "${1:message}", "patterns": ["${2:pattern}"] }', detail: 'grok 正则解析' },
    dissect: { text: '"dissect": { "field": "${1:message}", "pattern": "${2:pattern}" }', detail: 'dissect 分隔解析' },
    json: { text: '"json": { "field": "${1:message}", "target_field": "${2:json}" }', detail: 'JSON 字符串展开' },
    kv: { text: '"kv": { "field": "${1:message}" }', detail: '键值对解析' },
    csv: { text: '"csv": { "field": "${1:message}", "target_fields": ["${2:col1}", "${3:col2}"] }', detail: 'CSV 解析' },
    lowercase: { text: '"lowercase": { "field": "${1:field}" }', detail: '转小写' },
    uppercase: { text: '"uppercase": { "field": "${1:field}" }', detail: '转大写' },
    trim: { text: '"trim": { "field": "${1:field}" }', detail: '去首尾空白' },
    split: { text: '"split": { "field": "${1:field}", "separator": "${2:,}" }', detail: '按分隔符拆成数组' },
    join: { text: '"join": { "field": "${1:field}", "separator": "${2:,}" }', detail: '数组拼成字符串' },
    script: { text: '"script": { "lang": "${1:painless}", "source": "${2:ctx.field = ctx.field.toUpperCase()}" }', detail: '脚本处理' },
    pipeline: { text: '"pipeline": { "name": "${1:my-pipeline}" }', detail: '调用另一条管道' },
    foreach: { text: '"foreach": { "field": "${1:field}", "processor": { "set": { "field": "_ingest._value", "value": "${2:value}" } } }', detail: '对数组元素逐个处理' },
    fail: { text: '"fail": { "message": "${1:ingest failed}" }', detail: '主动失败' },
    drop: { text: '"drop": {}', detail: '丢弃文档' },
    append: { text: '"append": { "field": "${1:field}", "value": "${2:value}" }', detail: '追加值到数组' },
    enrich: { text: '"enrich": { "policy_name": "${1:my-policy}", "field": "${2:field}", "target_field": "${3:enriched}" }', detail: 'enrich 策略关联' },
    geoip: { text: '"geoip": { "field": "${1:ip}", "target_field": "${2:geoip}" }', detail: 'IP 地理位置' },
    user_agent: { text: '"user_agent": { "field": "${1:user_agent}" }', detail: 'UA 解析' },
    uri_parts: { text: '"uri_parts": { "field": "${1:url}" }', detail: 'URL 拆解' },
    registered_domain: { text: '"registered_domain": { "field": "${1:host}" }', detail: '注册域提取' },
    dot_expander: { text: '"dot_expander": { "field": "${1:field.with.dots}" }', detail: '点号字段展开' },
    gsub: { text: '"gsub": { "field": "${1:field}", "pattern": "${2:pattern}", "replacement": "${3:_}" }', detail: '正则替换' },
    inference: { text: '"inference": { "model_id": "${1:model}", "field_map": {} }', detail: '推理模型' },
    redact: { text: '"redact": { "field": "${1:field}" }', detail: '敏感信息脱敏' },
  };
  const extra: Record<string, string> = {
    attachment: '附件元数据提取', bytes: '字节数处理', circle: '圆形地理区域', community_id: '网络流 community_id',
    date_index_name: '按日期路由索引名', fingerprint: '内容指纹', html_strip: 'HTML 标签剥离',
    ip_location: 'IP 位置字段', network_direction: '网络方向判定', reroute: '改路由/索引',
    set_security_user: '设置安全用户上下文', sort: '数组排序',
  };
  /* 高频处理器置顶（补全面板首屏就是 set/rename/…，其余按目录序跟随） */
  const priority = ['set', 'rename', 'remove', 'convert', 'date', 'grok', 'dissect', 'json', 'script', 'pipeline', 'foreach'];
  const ordered = [
    ...priority.filter(t => (INGEST_PROCESSOR_TYPES as readonly string[]).includes(t)),
    ...(INGEST_PROCESSOR_TYPES as readonly string[]).filter(t => !priority.includes(t)),
  ];
  return ordered.map(t => {
    const sk = skeleton[t];
    return {
      label: t,
      detail: sk?.detail ?? extra[t] ?? 'Ingest 处理器',
      snippet: true,
      insertText: sk?.text ?? '"' + t + '": {\n  ${0}\n}',
    };
  });
}

/** Ingest 体区域：根 / processors[] 元素 / on_failure（数组元素或单对象）；更深不出键 */
export function ingestPipelineRegionAt(doc: string, offset: number): 'root' | 'processor' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'processors' && stack.length === 3) return 'processor';
  if (stack[0] === 'on_failure' && (stack.length === 2 || stack.length === 3)) return 'processor';
  return 'deep';
}

/** Enrich 策略三型（match / geo_match / range） */
export const ENRICH_POLICY_TYPES = ['match', 'geo_match', 'range'] as const;

/** Enrich 策略体（PUT /_enrich/policy/<name>）的根键 */
export function enrichPolicyBodyKeyItems(): AssistItem[] {
  return [
    { label: 'match', detail: '按字段等值匹配源索引', snippet: true,
      insertText: '"match": {\n  "indices": ["${1:source-index}"],\n  "match_field": "${2:key}",\n  "enrich_fields": ["${3:value}"]\n}' },
    { label: 'geo_match', detail: '按地理形状匹配', snippet: true,
      insertText: '"geo_match": {\n  "indices": ["${1:source-index}"],\n  "match_field": "${2:location}",\n  "enrich_fields": ["${3:value}"]\n}' },
    { label: 'range', detail: '按数值区间匹配', snippet: true,
      insertText: '"range": {\n  "indices": ["${1:source-index}"],\n  "match_field": "${2:range_field}",\n  "enrich_fields": ["${3:value}"]\n}' },
  ];
}

/** match / geo_match 策略对象内的键 */
export function enrichMatchPolicyKeyItems(): AssistItem[] {
  return [
    { label: 'indices', detail: '源索引（可数组/通配；单索引只读）', snippet: true, insertText: '"indices": ["${1:source-index}"]' },
    { label: 'query', detail: '源索引过滤查询（Query DSL）', snippet: true, insertText: '"query": {\n  ${0}\n}' },
    { label: 'match_field', detail: '用于匹配的字段', snippet: true, insertText: '"match_field": "${1:key}"' },
    { label: 'enrich_fields', detail: '随命中携带的字段', snippet: true, insertText: '"enrich_fields": ["${1:value}"]' },
  ];
}

/** range 策略对象内的键 */
export function enrichRangePolicyKeyItems(): AssistItem[] {
  return [
    { label: 'indices', detail: '源索引（可数组/通配；单索引只读）', snippet: true, insertText: '"indices": ["${1:source-index}"]' },
    { label: 'query', detail: '源索引过滤查询（Query DSL）', snippet: true, insertText: '"query": {\n  ${0}\n}' },
    { label: 'field', detail: '区间字段（数值/日期）', snippet: true, insertText: '"field": "${1:range_field}"' },
    { label: 'ranges', detail: '区间定义（from/to 数组）', snippet: true,
      insertText: '"ranges": [\n  { "from": ${1:0}, "to": ${2:100} }\n]' },
    { label: 'enrich_fields', detail: '随命中携带的字段', snippet: true, insertText: '"enrich_fields": ["${1:value}"]' },
  ];
}

/** Enrich 策略体区域：根 / match·geo_match / range / query（交给查询补全）/ 更深 */
export function enrichPolicyRegionAt(doc: string, offset: number): 'root' | 'match' | 'range' | 'query' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack.length >= 3 && stack[1] === 'query'
      && (ENRICH_POLICY_TYPES as readonly string[]).includes(stack[0] ?? '')) return 'query';
  if (stack.length === 2 && (ENRICH_POLICY_TYPES as readonly string[]).includes(stack[0] ?? '')) {
    return stack[0] === 'range' ? 'range' : 'match';
  }
  return 'deep';
}

/** Transform 体（PUT /_transform/<id>）的根键 */
export function transformBodyKeyItems(): AssistItem[] {
  return [
    { label: 'source', detail: '源索引与过滤查询', snippet: true,
      insertText: '"source": {\n  "index": ["${1:logs-*}"],\n  "query": { "match_all": {} }\n}' },
    { label: 'dest', detail: '目标索引（可指定写入 pipeline）', snippet: true,
      insertText: '"dest": { "index": "${1:transformed-index}" }' },
    { label: 'pivot', detail: '透视聚合（group_by + aggregations）', snippet: true,
      insertText: '"pivot": {\n  "group_by": {\n    "${1:key}": { "terms": { "field": "${2:field}" } }\n  },\n  "aggregations": {\n    "${3:metric}": { "avg": { "field": "${4:value}" } }\n  }\n}' },
    { label: 'latest', detail: '取每个键最新文档（unique_key + sort）', snippet: true,
      insertText: '"latest": { "unique_key": "${1:id}", "sort": "${2:@timestamp}" }' },
    { label: 'sync', detail: '持续同步（time 字段与延迟）', snippet: true,
      insertText: '"sync": { "time": { "field": "${1:@timestamp}", "delay": "${2:1m}" } }' },
    { label: 'retention_policy', detail: '目标索引保留策略（max_age）', snippet: true,
      insertText: '"retention_policy": { "time": { "field": "${1:@timestamp}", "max_age": "${2:30d}" } }' },
    { label: 'description', detail: 'Transform 用途说明', snippet: true, insertText: '"description": "${1:transform logs}"' },
    { label: 'settings', detail: '执行调优（docs_per_second 等）', snippet: true, insertText: '"settings": {\n  ${0}\n}' },
    { label: 'frequency', detail: '检查源索引变化的频率（如 1m）', snippet: true, insertText: '"frequency": "${1:1m}"' },
    { label: 'max_page_search_size', detail: '单页最大检索文档数', snippet: true, insertText: '"max_page_search_size": ${1:500}' },
    { label: '_meta', detail: '自定义元数据', snippet: true, insertText: '"_meta": {\n  ${0}\n}' },
  ];
}

/** source 对象的键（query 内回落整棵查询补全） */
export function transformSourceKeyItems(): AssistItem[] {
  return [
    { label: 'index', detail: '源索引（数组/通配）', snippet: true, insertText: '"index": ["${1:logs-*}"]' },
    { label: 'query', detail: '源文档过滤（Query DSL）', snippet: true, insertText: '"query": {\n  ${0}\n}' },
    { label: 'remote', detail: '远程集群源（cluster + index）', snippet: true,
      insertText: '"remote": { "host": "${1:https://remote:9200}", "username": "${2:user}", "password": "${3:pass}", "index": ["${4:logs-*}"] }' },
  ];
}

/** dest 对象的键 */
export function transformDestKeyItems(): AssistItem[] {
  return [
    { label: 'index', detail: '目标索引名', snippet: true, insertText: '"index": "${1:transformed-index}"' },
    { label: 'pipeline', detail: '写入前经过的 ingest 管道', snippet: true, insertText: '"pipeline": "${1:my-pipeline}"' },
  ];
}

/** pivot 对象的键 */
export function transformPivotKeyItems(): AssistItem[] {
  return [
    { label: 'group_by', detail: '分组键（字段聚合）', snippet: true,
      insertText: '"group_by": {\n  "${1:key}": { "terms": { "field": "${2:field}" } }\n}' },
    { label: 'aggregations', detail: '指标聚合', snippet: true,
      insertText: '"aggregations": {\n  "${1:metric}": { "avg": { "field": "${2:value}" } }\n}' },
  ];
}

/** sync / retention_policy 的时间配置键 */
export function transformTimeKeyItems(kind: 'sync' | 'retention'): AssistItem[] {
  return [
    { label: 'time', detail: '时间字段配置', snippet: true,
      insertText: kind === 'sync'
        ? '"time": { "field": "${1:@timestamp}", "delay": "${2:1m}" }'
        : '"time": { "field": "${1:@timestamp}", "max_age": "${2:30d}" }' },
  ];
}

/** sync.time / retention_policy.time 的键 */
export function transformTimeConfigKeyItems(kind: 'sync' | 'retention'): AssistItem[] {
  return [
    { label: 'field', detail: '时间字段', snippet: true, insertText: '"field": "${1:@timestamp}"' },
    kind === 'sync'
      ? { label: 'delay', detail: '同步延迟（避免读到未完成写入）', snippet: true, insertText: '"delay": "${1:1m}"' }
      : { label: 'max_age', detail: '目标文档最长保留时间', snippet: true, insertText: '"max_age": "${1:30d}"' },
  ];
}

/** Transform 体区域：根 / source / source.query / dest / pivot / sync(.time) / retention(.time) */
export function transformRegionAt(doc: string, offset: number):
  'root' | 'source' | 'source-query' | 'dest' | 'pivot' | 'sync' | 'sync-time' | 'retention' | 'retention-time' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'source') {
    if (stack.length === 2) return 'source';
    if (stack[1] === 'query' && stack.length >= 3) return 'source-query';
    return 'deep';
  }
  if (stack[0] === 'dest' && stack.length === 2) return 'dest';
  if (stack[0] === 'pivot' && stack.length === 2) return 'pivot';
  if (stack[0] === 'sync') {
    if (stack.length === 2) return 'sync';
    if (stack[1] === 'time' && stack.length === 3) return 'sync-time';
    return 'deep';
  }
  if (stack[0] === 'retention_policy') {
    if (stack.length === 2) return 'retention';
    if (stack[1] === 'time' && stack.length === 3) return 'retention-time';
    return 'deep';
  }
  return 'deep';
}

/** Rollup 分组类型（date_histogram / terms / histogram） */
export const ROLLUP_GROUP_TYPES = ['date_histogram', 'terms', 'histogram'] as const;

/** Rollup 作业体（PUT /_rollup/job/<id>）的根键 */
export function rollupJobBodyKeyItems(): AssistItem[] {
  return [
    { label: 'index_pattern', detail: '源索引模式（单一索引/通配）', snippet: true, insertText: '"index_pattern": "${1:logs-*}"' },
    { label: 'rollup_index', detail: '汇总结果索引（独立索引）', snippet: true, insertText: '"rollup_index": "${1:logs-rollup}"' },
    { label: 'cron', detail: '执行计划（cron）', snippet: true, insertText: '"cron": "${1:0 */30 * * * ?}"' },
    { label: 'page_size', detail: '每批处理文档数', snippet: true, insertText: '"page_size": ${1:1000}' },
    { label: 'groups', detail: '分组维度（时间/字段）', snippet: true,
      insertText: '"groups": {\n  "date_histogram": {\n    "field": "${1:@timestamp}",\n    "calendar_interval": "${2:1h}"\n  },\n  "terms": {\n    "fields": ["${3:host}"]\n  }\n}' },
    { label: 'metrics', detail: '指标字段与聚合', snippet: true,
      insertText: '"metrics": [\n  { "field": "${1:bytes}", "metrics": ["${2:min}", "${3:max}", "${4:sum}"] }\n]' },
    { label: 'timeout', detail: '单批处理超时（如 20s）', snippet: true, insertText: '"timeout": "${1:20s}"' },
    { label: 'headers', detail: '请求头（跨集群/安全场景）', snippet: true, insertText: '"headers": {\n  ${0}\n}' },
  ];
}

/** groups 对象的分组类型 */
export function rollupGroupsKeyItems(): AssistItem[] {
  return [
    { label: 'date_histogram', detail: '时间桶分组', snippet: true,
      insertText: '"date_histogram": { "field": "${1:@timestamp}", "calendar_interval": "${2:1h}" }' },
    { label: 'terms', detail: '字段值分组', snippet: true, insertText: '"terms": { "fields": ["${1:host}"] }' },
    { label: 'histogram', detail: '数值区间分组', snippet: true,
      insertText: '"histogram": { "fields": ["${1:latency}"], "interval": ${2:100} }' },
  ];
}

/** date_histogram 分组的键 */
export function rollupDateGroupKeyItems(): AssistItem[] {
  return [
    { label: 'field', detail: '时间字段', snippet: true, insertText: '"field": "${1:@timestamp}"' },
    { label: 'calendar_interval', detail: '日历区间（1m/1h/1d…）', snippet: true, insertText: '"calendar_interval": "${1:1h}"' },
    { label: 'fixed_interval', detail: '固定区间（30s/5m…）', snippet: true, insertText: '"fixed_interval": "${1:30m}"' },
    { label: 'time_zone', detail: '时区（影响日历分桶边界）', snippet: true, insertText: '"time_zone": "${1:UTC}"' },
  ];
}

/** terms / histogram 分组的键 */
export function rollupFieldGroupKeyItems(kind: 'terms' | 'histogram'): AssistItem[] {
  return [
    { label: 'fields', detail: '分组字段（数组）', snippet: true, insertText: '"fields": ["${1:host}"]' },
    ...(kind === 'histogram'
      ? [{ label: 'interval', detail: '区间宽度', snippet: true, insertText: '"interval": ${1:100}' }]
      : []),
  ];
}

/** metrics[] 元素的键 */
export function rollupMetricKeyItems(): AssistItem[] {
  return [
    { label: 'field', detail: '指标字段', snippet: true, insertText: '"field": "${1:bytes}"' },
    { label: 'metrics', detail: '统计方式（min/max/sum/value_count/avg）', snippet: true,
      insertText: '"metrics": ["${1:min}", "${2:max}", "${3:sum}"]' },
  ];
}

/** Rollup 体区域：根 / groups / 分组类型 / metrics 元素 / 更深 */
export function rollupRegionAt(doc: string, offset: number):
  'root' | 'groups' | 'date-group' | 'terms-group' | 'histogram-group' | 'metric' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'groups') {
    if (stack.length === 2) return 'groups';
    if (stack.length === 3) {
      if (stack[1] === 'date_histogram') return 'date-group';
      if (stack[1] === 'terms') return 'terms-group';
      if (stack[1] === 'histogram') return 'histogram-group';
    }
    return 'deep';
  }
  if (stack[0] === 'metrics' && stack.length === 3) return 'metric';
  return 'deep';
}

/** ML 数据馈送体（PUT /_ml/datafeeds/<id>）的根键 */
export function mlDatafeedBodyKeyItems(): AssistItem[] {
  return [
    { label: 'job_id', detail: '关联的异常检测作业 id', snippet: true, insertText: '"job_id": "${1:my-job}"' },
    { label: 'indexes', detail: '源索引（数组/通配）', snippet: true, insertText: '"indexes": ["${1:logs-*}"]' },
    { label: 'query', detail: '取数过滤查询（Query DSL）', snippet: true, insertText: '"query": {\n  ${0}\n}' },
    { label: 'query_delay', detail: '额外查询延迟（等待迟到数据）', snippet: true, insertText: '"query_delay": "${1:60s}"' },
    { label: 'frequency', detail: '取数频率（默认等于 bucket_span）', snippet: true, insertText: '"frequency": "${1:60s}"' },
    { label: 'scroll_size', detail: '单次滚动取数条数', snippet: true, insertText: '"scroll_size": ${1:1000}' },
    { label: 'aggregations', detail: '取数聚合（summary 作业配合 summary_count_field_name）', snippet: true,
      insertText: '"aggregations": {\n  ${0}\n}' },
    { label: 'script_fields', detail: '取数时计算的脚本字段', snippet: true, insertText: '"script_fields": {\n  ${0}\n}' },
    { label: 'max_empty_searches', detail: '连续空搜索上限（summary 作业）', snippet: true,
      insertText: '"max_empty_searches": ${1:10}' },
    { label: 'delayed_data_check_config', detail: '延迟数据检查（enabled/check_window）', snippet: true,
      insertText: '"delayed_data_check_config": { "enabled": ${1|true,false|}, "check_window": "${2:1h}" }' },
    { label: 'chunking_config', detail: '分块模式（auto/manual/off）', snippet: true,
      insertText: '"chunking_config": { "mode": "${1|auto,manual,off|}" }' },
    { label: 'indices_options', detail: '索引选项（通配展开/忽略缺失）', snippet: true,
      insertText: '"indices_options": {\n  "expand_wildcards": ["${1:open}"],\n  "ignore_unavailable": ${2|true,false|}\n}' },
    { label: 'runtime_mappings', detail: '取数时生效的运行时字段', snippet: true, insertText: '"runtime_mappings": {\n  ${0}\n}' },
    { label: 'headers', detail: '请求头（安全/跨集群场景）', snippet: true, insertText: '"headers": {\n  ${0}\n}' },
  ];
}

/** delayed_data_check_config 的键 */
export function mlDelayedCheckKeyItems(): AssistItem[] {
  return [
    { label: 'enabled', detail: '启用延迟数据检查', snippet: true, insertText: '"enabled": ${1|true,false|}' },
    { label: 'check_window', detail: '检查窗口（窗口内无数据则告警）', snippet: true, insertText: '"check_window": "${1:1h}"' },
  ];
}

/** chunking_config 的键 */
export function mlChunkingKeyItems(): AssistItem[] {
  return [
    { label: 'mode', detail: '分块模式（auto/manual/off）', snippet: true, insertText: '"mode": "${1|auto,manual,off|}"' },
    { label: 'time_span', detail: 'manual 模式下的分块时间跨度', snippet: true, insertText: '"time_span": "${1:3h}"' },
  ];
}

/** indices_options 的键 */
export function mlIndicesOptionsKeyItems(): AssistItem[] {
  return [
    { label: 'expand_wildcards', detail: '通配展开范围（open/closed/hidden/none/all）', snippet: true,
      insertText: '"expand_wildcards": ["${1|open,closed,hidden,none,all|}"]' },
    { label: 'ignore_unavailable', detail: '忽略不存在的索引', snippet: true, insertText: '"ignore_unavailable": ${1|true,false|}' },
    { label: 'allow_no_indices', detail: '通配无匹配时不报错', snippet: true, insertText: '"allow_no_indices": ${1|true,false|}' },
  ];
}

/** ML 数据馈送体区域：根 / query（交给查询补全）/ 延迟检查 / 分块 / 索引选项 / 更深 */
export function mlDatafeedRegionAt(doc: string, offset: number):
  'root' | 'query' | 'delayed' | 'chunking' | 'indices' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'query' && stack.length >= 2) return 'query';
  if (stack[0] === 'delayed_data_check_config' && stack.length === 2) return 'delayed';
  if (stack[0] === 'chunking_config' && stack.length === 2) return 'chunking';
  if (stack[0] === 'indices_options' && stack.length === 2) return 'indices';
  return 'deep';
}

/** ML 异常检测作业体（PUT /_ml/anomaly_detectors/<id>）的根键 */
export function mlJobBodyKeyItems(): AssistItem[] {
  return [
    { label: 'job_id', detail: '作业 id（省略则用路径上的 id）', snippet: true, insertText: '"job_id": "${1:latency-job}"' },
    { label: 'analysis_config', detail: '分析配置（bucket_span + detectors，作业核心）', snippet: true,
      insertText: '"analysis_config": {\n  "bucket_span": "${1:15m}",\n  "detectors": [\n    { "function": "${2:mean}", "field_name": "${3:responsetime}" }\n  ]\n}' },
    { label: 'analysis_limits', detail: '资源上限（模型内存/分类示例数）', snippet: true,
      insertText: '"analysis_limits": {\n  "model_memory_limit": "${1:1024mb}",\n  "categorization_examples_limit": ${2:4}\n}' },
    { label: 'data_description', detail: '时间字段描述（time_field 必填）', snippet: true,
      insertText: '"data_description": { "time_field": "${1:@timestamp}" }' },
    { label: 'description', detail: '作业用途说明', snippet: true, insertText: '"description": "${1:latency anomaly job}"' },
    { label: 'groups', detail: '作业分组（便于批量管理）', snippet: true, insertText: '"groups": ["${1:default}"]' },
    { label: 'background_persist_interval', detail: '后台持久化间隔（如 1h）', snippet: true,
      insertText: '"background_persist_interval": "${1:1h}"' },
    { label: 'model_plot_config', detail: '模型绘图（enabled/terms）', snippet: true,
      insertText: '"model_plot_config": { "enabled": ${1|true,false|} }' },
    { label: 'model_snapshot_retention_days', detail: '模型快照保留天数', snippet: true, insertText: '"model_snapshot_retention_days": ${1:10}' },
    { label: 'daily_model_snapshot_retention_after_days', detail: '近期快照按天保留天数', snippet: true,
      insertText: '"daily_model_snapshot_retention_after_days": ${1:1}' },
    { label: 'renormalization_window_days', detail: '分数重归一化窗口（天）', snippet: true,
      insertText: '"renormalization_window_days": ${1:30}' },
    { label: 'results_retention_days', detail: '结果保留天数（不填=永久）', snippet: true,
      insertText: '"results_retention_days": ${1:30}' },
    { label: 'results_index_name', detail: '结果索引名（shared=共用索引）', snippet: true, insertText: '"results_index_name": "${1:shared}"' },
    { label: 'allow_lazy_open', detail: '允许惰性打开（不预加载模型）', snippet: true, insertText: '"allow_lazy_open": ${1|false,true|}' },
    { label: 'custom_settings', detail: '自定义设置（结果索引等）', snippet: true, insertText: '"custom_settings": {\n  ${0}\n}' },
    { label: 'datafeed_config', detail: '同时创建数据馈送（取数配置）', snippet: true,
      insertText: '"datafeed_config": {\n  "indices": ["${1:logs-*}"],\n  "query": { "match_all": {} }\n}' },
  ];
}

/** analysis_config 的键 */
export function mlAnalysisConfigKeyItems(): AssistItem[] {
  return [
    { label: 'bucket_span', detail: '桶跨度（如 15m；决定分析粒度）', snippet: true, insertText: '"bucket_span": "${1:15m}"' },
    { label: 'latency', detail: '额外延迟（等待迟到数据）', snippet: true, insertText: '"latency": "${1:0s}"' },
    { label: 'detectors', detail: '检测器列表（function + field_name）', snippet: true,
      insertText: '"detectors": [\n  { "function": "${1:mean}", "field_name": "${2:responsetime}" }\n]' },
    { label: 'influencers', detail: '影响因子字段（用于结果解释）', snippet: true, insertText: '"influencers": ["${1:airline}"]' },
    { label: 'categorization_field_name', detail: '分类字段（消息聚类）', snippet: true,
      insertText: '"categorization_field_name": "${1:message}"' },
    { label: 'categorization_filters', detail: '分类过滤模式', snippet: true, insertText: '"categorization_filters": ["${1:pattern}"]' },
    { label: 'summary_count_field_name', detail: '预聚合计数字段（datafeed 聚合场景）', snippet: true,
      insertText: '"summary_count_field_name": "${1:doc_count}"' },
  ];
}

/** detectors[] 元素的键 */
export function mlDetectorKeyItems(): AssistItem[] {
  return [
    { label: 'function', detail: '检测函数（mean/min/max/sum/count/rare/distinct_count…）', snippet: true,
      insertText: '"function": "${1|mean,min,max,sum,count,non_zero_count,distinct_count,rare,low_count,high_count,low_mean,high_mean,info_content,time_of_day,time_of_week|}"' },
    { label: 'field_name', detail: '被分析字段', snippet: true, insertText: '"field_name": "${1:responsetime}"' },
    { label: 'by_field_name', detail: '按该字段分组分别建模', snippet: true, insertText: '"by_field_name": "${1:airline}"' },
    { label: 'over_field_name', detail: '总体对比字段', snippet: true, insertText: '"over_field_name": "${1:clientip}"' },
    { label: 'partition_field_name', detail: '分区字段（每个分区独立建模）', snippet: true,
      insertText: '"partition_field_name": "${1:region}"' },
    { label: 'detector_description', detail: '检测器说明', snippet: true, insertText: '"detector_description": "${1:mean latency}"' },
    { label: 'exclude_frequent', detail: '排除高频值（all/none/by/over）', snippet: true,
      insertText: '"exclude_frequent": "${1|all,none,by,over|}"' },
    { label: 'use_null', detail: '缺失值是否作为独立值', snippet: true, insertText: '"use_null": ${1|false,true|}' },
  ];
}

/** analysis_limits 的键 */
export function mlAnalysisLimitsKeyItems(): AssistItem[] {
  return [
    { label: 'model_memory_limit', detail: '模型内存上限（如 1024mb）', snippet: true, insertText: '"model_memory_limit": "${1:1024mb}"' },
    { label: 'categorization_examples_limit', detail: '分类示例保留条数', snippet: true, insertText: '"categorization_examples_limit": ${1:4}' },
  ];
}

/** data_description 的键 */
export function mlDataDescriptionKeyItems(): AssistItem[] {
  return [
    { label: 'time_field', detail: '时间戳字段（必填）', snippet: true, insertText: '"time_field": "${1:@timestamp}"' },
    { label: 'time_format', detail: '时间格式（epoch_ms 或自定义 pattern）', snippet: true, insertText: '"time_format": "${1:epoch_ms}"' },
  ];
}

/** ML 作业体区域：根 / analysis_config / detectors 元素 / analysis_limits / data_description */
export function mlJobRegionAt(doc: string, offset: number):
  'root' | 'analysis-config' | 'detector' | 'analysis-limits' | 'data-description' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'analysis_config') {
    if (stack.length === 2) return 'analysis-config';
    /* detectors[] 元素对象：['analysis_config','detectors',<array>,null] */
    if (stack[1] === 'detectors' && stack.length === 4) return 'detector';
    return 'deep';
  }
  if (stack[0] === 'analysis_limits' && stack.length === 2) return 'analysis-limits';
  if (stack[0] === 'data_description' && stack.length === 2) return 'data-description';
  return 'deep';
}

/** ML 过滤器体（PUT /_ml/filters/<id>）的根键 */
export function mlFilterBodyKeyItems(): AssistItem[] {
  return [
    { label: 'description', detail: '过滤器用途说明', snippet: true, insertText: '"description": "${1:safe domains}"' },
    { label: 'items', detail: '条目清单（支持首尾通配 *，上限 10000）', snippet: true,
      insertText: '"items": ["${1:*.example.com}"]' },
  ];
}

/** ML 过滤器更新体（POST /_ml/filters/<id>/_update）的根键 */
export function mlFilterUpdateBodyKeyItems(): AssistItem[] {
  return [
    { label: 'description', detail: '过滤器用途说明（覆盖）', snippet: true, insertText: '"description": "${1:safe domains}"' },
    { label: 'add_items', detail: '新增条目（支持首尾通配 *）', snippet: true, insertText: '"add_items": ["${1:*.example.com}"]' },
    { label: 'remove_items', detail: '移除条目', snippet: true, insertText: '"remove_items": ["${1:*.old.com}"]' },
  ];
}

/** ML 日历体（PUT /_ml/calendars/<id>）的根键 */
export function mlCalendarBodyKeyItems(): AssistItem[] {
  return [
    { label: 'job_ids', detail: '关联的异常检测作业 id 清单', snippet: true, insertText: '"job_ids": ["${1:my-job}"]' },
    { label: 'description', detail: '日历用途说明', snippet: true, insertText: '"description": "${1:planned outages}"' },
  ];
}

/** ML 日历事件体（POST /_ml/calendars/<id>/events）的根键 */
export function mlCalendarEventsBodyKeyItems(): AssistItem[] {
  return [
    { label: 'events', detail: '计划事件（起止时间 + 跳过策略）', snippet: true,
      insertText: '"events": [\n  {\n    "description": "${1:maintenance}",\n    "start_time": ${2:1700000000000},\n    "end_time": ${3:1700003600000}\n  }\n]' },
  ];
}

/** 日历 events[] 元素的键（CalendarEvent） */
export function mlCalendarEventKeyItems(): AssistItem[] {
  return [
    { label: 'description', detail: '事件说明', snippet: true, insertText: '"description": "${1:maintenance}"' },
    { label: 'start_time', detail: '开始时间（epoch 毫秒或 ISO 8601）', snippet: true, insertText: '"start_time": ${1:1700000000000}' },
    { label: 'end_time', detail: '结束时间（epoch 毫秒或 ISO 8601）', snippet: true, insertText: '"end_time": ${1:1700003600000}' },
    { label: 'skip_result', detail: '事件期内不产生异常结果', snippet: true, insertText: '"skip_result": ${1|true,false|}' },
    { label: 'skip_model_update', detail: '事件期内不更新模型', snippet: true, insertText: '"skip_model_update": ${1|true,false|}' },
    { label: 'force_time_shift', detail: '时间平移秒数（如夏令时调整）', snippet: true, insertText: '"force_time_shift": ${1:3600}' },
  ];
}

/** 日历事件体区域：根 / events 元素 / 更深 */
export function mlCalendarEventsRegionAt(doc: string, offset: number): 'root' | 'event' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'events' && stack.length === 3) return 'event';
  return 'deep';
}

/** Graph 探索体（POST /<索引>/_graph/explore）的根键 */
export function graphExploreBodyKeyItems(): AssistItem[] {
  return [
    { label: 'query', detail: '种子查询（任意合法 Query DSL）', snippet: true, insertText: '"query": {\n  ${0}\n}' },
    { label: 'vertices', detail: '起始顶点字段（field/size/阈值）', snippet: true,
      insertText: '"vertices": [\n  { "field": "${1:product}", "size": ${2:5} }\n]' },
    { label: 'connections', detail: '关联边探索（hop 可嵌套）', snippet: true,
      insertText: '"connections": {\n  "vertices": [\n    { "field": "${1:query.raw}", "size": ${2:5} }\n  ]\n}' },
    { label: 'controls', detail: '探索控制（采样/超时/显著性）', snippet: true,
      insertText: '"controls": {\n  "sample_size": ${1:100},\n  "use_significance": ${2|true,false|}\n}' },
  ];
}

/** Graph 顶点定义（vertices[] 元素）的键 */
export function graphVertexKeyItems(): AssistItem[] {
  return [
    { label: 'field', detail: '抽取词项的字段', snippet: true, insertText: '"field": "${1:product}"' },
    { label: 'size', detail: '每个字段最多返回的顶点数', snippet: true, insertText: '"size": ${1:5}' },
    { label: 'min_doc_count', detail: '全局成对出现的最小文档数', snippet: true, insertText: '"min_doc_count": ${1:3}' },
    { label: 'shard_min_doc_count', detail: '单分片成对出现的最小文档数', snippet: true,
      insertText: '"shard_min_doc_count": ${1:2}' },
    { label: 'include', detail: '包含的起始词项（term/boost）', snippet: true,
      insertText: '"include": [\n  { "term": "${1:elasticsearch}", "boost": ${2:1.0} }\n]' },
    { label: 'exclude', detail: '排除的词项', snippet: true, insertText: '"exclude": ["${1:excluded-term}"]' },
  ];
}

/** Graph controls 的键 */
export function graphControlsKeyItems(): AssistItem[] {
  return [
    { label: 'sample_size', detail: '每次 hop 每分片采样的文档数', snippet: true, insertText: '"sample_size": ${1:100}' },
    { label: 'timeout', detail: '探索超时（如 1s）', snippet: true, insertText: '"timeout": "${1:1s}"' },
    { label: 'use_significance', detail: '只保留显著关联的词项', snippet: true, insertText: '"use_significance": ${1|true,false|}' },
    { label: 'sample_diversity', detail: '采样多样性（field + max_docs_per_value）', snippet: true,
      insertText: '"sample_diversity": { "field": "${1:category}", "max_docs_per_value": ${2:1} }' },
  ];
}

/** sample_diversity 的键 */
export function graphSampleDiversityKeyItems(): AssistItem[] {
  return [
    { label: 'field', detail: '用于多样性的单值字段', snippet: true, insertText: '"field": "${1:category}"' },
    { label: 'max_docs_per_value', detail: '每个值最多保留的文档数', snippet: true, insertText: '"max_docs_per_value": ${1:1}' },
  ];
}

/** Graph hop（connections 对象）的键；hop 可递归嵌套 */
export function graphHopKeyItems(): AssistItem[] {
  return [
    { label: 'vertices', detail: '本跳要抽取的字段', snippet: true,
      insertText: '"vertices": [\n  { "field": "${1:product}", "size": ${2:5} }\n]' },
    { label: 'query', detail: '引导查询（约束本跳探索）', snippet: true, insertText: '"query": {\n  ${0}\n}' },
    { label: 'connections', detail: '再下一跳（同结构，可嵌套）', snippet: true,
      insertText: '"connections": {\n  "vertices": [\n    { "field": "${1:query.raw}", "size": ${2:5} }\n  ]\n}' },
  ];
}

/** Graph 探索体区域：根 / query（回落查询补全）/ 顶点元素 / controls / 多样性 / hop / 更深 */
export function graphExploreRegionAt(doc: string, offset: number):
  'root' | 'query' | 'vertex' | 'controls' | 'sample-diversity' | 'hop' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  /* 根 query 与 hop.query 内都是整棵 Query DSL */
  if (stack.includes('query')) return 'query';
  if (stack.length >= 2 && stack[stack.length - 2] === 'controls' && stack[stack.length - 1] === null) return 'controls';
  if (stack.length >= 2 && stack[stack.length - 2] === 'sample_diversity' && stack[stack.length - 1] === null) return 'sample-diversity';
  if (stack.length >= 2 && stack[stack.length - 2] === 'connections' && stack[stack.length - 1] === null) return 'hop';
  if (stack.length >= 3 && stack[stack.length - 1] === null && stack[stack.length - 2] === null
      && stack[stack.length - 3] === 'vertices') return 'vertex';
  return 'deep';
}

/** CCR 跟随/自动跟随共用的调优键 */
export function ccrTuningKeyItems(): AssistItem[] {
  return [
    { label: 'max_outstanding_read_requests', detail: '远端集群最大未完成读请求数', snippet: true,
      insertText: '"max_outstanding_read_requests": ${1:12}' },
    { label: 'max_outstanding_write_requests', detail: '跟随侧最大未完成写请求数', snippet: true,
      insertText: '"max_outstanding_write_requests": ${1:9}' },
    { label: 'max_read_request_operation_count', detail: '单次读取的最大操作数', snippet: true,
      insertText: '"max_read_request_operation_count": ${1:5120}' },
    { label: 'max_read_request_size', detail: '单次读取的最大字节量', snippet: true, insertText: '"max_read_request_size": "${1:32mb}"' },
    { label: 'max_retry_delay', detail: '异常重试的最大退避时间', snippet: true, insertText: '"max_retry_delay": "${1:500ms}"' },
    { label: 'max_write_buffer_count', detail: '待写操作队列上限（条数）', snippet: true, insertText: '"max_write_buffer_count": ${1:2147483647}' },
    { label: 'max_write_buffer_size', detail: '待写操作队列上限（字节）', snippet: true, insertText: '"max_write_buffer_size": "${1:512mb}"' },
    { label: 'max_write_request_operation_count', detail: '单次批量写的最大操作数', snippet: true,
      insertText: '"max_write_request_operation_count": ${1:5120}' },
    { label: 'max_write_request_size', detail: '单次批量写的最大字节量', snippet: true, insertText: '"max_write_request_size": "${1:9223372036854775807b}"' },
    { label: 'read_poll_timeout', detail: '远端拉取新操作的轮询超时', snippet: true, insertText: '"read_poll_timeout": "${1:1m}"' },
    { label: 'settings', detail: '覆盖 leader 索引的设置', snippet: true, insertText: '"settings": {\n  ${0}\n}' },
  ];
}

/** CCR 跟随体（PUT /<索引>/_ccr/follow）的根键 */
export function ccrFollowBodyKeyItems(): AssistItem[] {
  return [
    { label: 'remote_cluster', detail: '远端集群别名', snippet: true, insertText: '"remote_cluster": "${1:leader_cluster}"' },
    { label: 'leader_index', detail: '远端被跟随的索引名', snippet: true, insertText: '"leader_index": "${1:leader-index}"' },
    { label: 'data_stream_name', detail: 'leader 为数据流时的本地数据流名', snippet: true,
      insertText: '"data_stream_name": "${1:follower-stream}"' },
    ...ccrTuningKeyItems(),
  ];
}

/** CCR 自动跟随模式（PUT /_ccr/auto_follow/<cluster>）的根键 */
export function ccrAutoFollowBodyKeyItems(): AssistItem[] {
  return [
    { label: 'remote_cluster', detail: '远端集群别名', snippet: true, insertText: '"remote_cluster": "${1:leader_cluster}"' },
    { label: 'follow_index_pattern', detail: '跟随索引命名模板（{{leader_index}} 可用）', snippet: true,
      insertText: '"follow_index_pattern": "{{leader_index}}-follower"' },
    { label: 'leader_index_patterns', detail: '匹配远端索引的模式清单', snippet: true,
      insertText: '"leader_index_patterns": ["${1:logs-*}"]' },
    { label: 'leader_index_exclusion_patterns', detail: '排除的远端索引模式', snippet: true,
      insertText: '"leader_index_exclusion_patterns": ["${1:*-test}"]' },
    ...ccrTuningKeyItems(),
  ];
}

/** 代授 API Key 体（POST /_security/api_key/grant）的根键 */
export function securityApiKeyGrantBodyKeyItems(): AssistItem[] {
  return [
    { label: 'grant_type', detail: '授权方式（access_token / password）', snippet: true,
      insertText: '"grant_type": "${1|access_token,password|}"' },
    { label: 'access_token', detail: 'access_token 方式的访问令牌', snippet: true, insertText: '"access_token": "${1:token}"' },
    { label: 'username', detail: 'password 方式的用户名', snippet: true, insertText: '"username": "${1:jdoe}"' },
    { label: 'password', detail: 'password 方式的密码', snippet: true, insertText: '"password": "${1:secret}"' },
    { label: 'api_key', detail: '要创建的 API Key 参数', snippet: true,
      insertText: '"api_key": {\n  "name": "${1:granted-key}"\n}' },
  ];
}

/** 代授体里 api_key 对象的键（与创建体同口径） */
export function securityApiKeyGrantKeyItems(): AssistItem[] {
  return securityApiKeyBodyKeyItems();
}

/** 代授体区域：根 / api_key 对象 / api_key.role_descriptors 里的角色定义 / 更深 */
export function securityApiKeyGrantRegionAt(doc: string, offset: number):
  'root' | 'api-key' | 'role' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'api_key' && stack.length === 2) return 'api-key';
  if (stack[0] === 'api_key' && stack[1] === 'role_descriptors' && stack.length === 4) return 'role';
  return 'deep';
}

/** API Key 检索体（GET|POST /_security/_query/api_key）的根键 */
export function securityApiKeyQueryBodyKeyItems(): AssistItem[] {
  return [
    { label: 'query', detail: 'API Key 查询条件（Query DSL 子集）', snippet: true, insertText: '"query": {\n  ${0}\n}' },
    { label: 'from', detail: '分页起点', snippet: true, insertText: '"from": ${1:0}' },
    { label: 'size', detail: '返回条数', snippet: true, insertText: '"size": ${1:10}' },
    { label: 'sort', detail: '排序（API Key 公共字段，如 creation/name/expiration）', snippet: true,
      insertText: '"sort": [ { "${1:creation}": { "order": "desc" } } ]' },
    { label: 'search_after', detail: '深分页游标（上一页最后一条的排序值）', snippet: true,
      insertText: '"search_after": ["${1:value}"]' },
    { label: 'aggregations', detail: '聚合（对 API Key 公共字段）', snippet: true,
      insertText: '"aggregations": {\n  ${0}\n}' },
    { label: 'aggs', detail: '聚合简写（与 aggregations 等价）', snippet: true, insertText: '"aggs": {\n  ${0}\n}' },
  ];
}

/** API Key 检索体区域：根 / query（回落整棵查询补全）/ 更深 */
export function securityApiKeyQueryRegionAt(doc: string, offset: number): 'root' | 'query' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack.includes('query')) return 'query';
  return 'deep';
}

/** 吊销 API Key 体（DELETE /_security/api_key）的根键 */
export function securityApiKeyInvalidateBodyKeyItems(): AssistItem[] {
  return [
    { label: 'ids', detail: '按 Key id 吊销', snippet: true, insertText: '"ids": ["${1:key-id}"]' },
    { label: 'name', detail: '按 Key 名称吊销', snippet: true, insertText: '"name": "${1:my-api-key}"' },
    { label: 'owner', detail: '只吊销当前用户拥有的 Key', snippet: true, insertText: '"owner": ${1|true,false|}' },
    { label: 'realm_name', detail: '按认证域过滤', snippet: true, insertText: '"realm_name": "${1:native1}"' },
    { label: 'username', detail: '按用户名过滤', snippet: true, insertText: '"username": "${1:myuser}"' },
  ];
}

/** 跨集群 API Key 体（POST /_security/cross_cluster/api_key）的根键 */
export function securityCrossClusterApiKeyBodyKeyItems(): AssistItem[] {
  return [
    { label: 'name', detail: '跨集群 Key 名称', snippet: true, insertText: '"name": "${1:ccs-key}"' },
    { label: 'access', detail: '跨集群访问范围（search / replication）', snippet: true,
      insertText: '"access": {\n  "search": [ { "names": ["${1:logs-*}"] } ]\n}' },
    { label: 'expiration', detail: '有效期（如 1d/30d；省略=不过期）', snippet: true, insertText: '"expiration": "${1:1d}"' },
    { label: 'metadata', detail: '附加到 Key 的自定义元数据', snippet: true, insertText: '"metadata": {\n  ${0}\n}' },
  ];
}

/** 跨集群 Key 的 access 对象键 */
export function securityCrossClusterAccessKeyItems(): AssistItem[] {
  return [
    { label: 'search', detail: '可搜索的远端索引', snippet: true, insertText: '"search": [ { "names": ["${1:logs-*}"] } ]' },
    { label: 'replication', detail: '可复制的远端索引', snippet: true, insertText: '"replication": [ { "names": ["${1:archive-*}"] } ]' },
  ];
}

/** access.search / access.replication 元素（远端索引权限）的键 */
export function securityCrossClusterAccessEntryKeyItems(): AssistItem[] {
  return [
    { label: 'names', detail: '索引/数据流名清单', snippet: true, insertText: '"names": ["${1:logs-*}"]' },
    { label: 'field_security', detail: '字段级权限（grant/except）', snippet: true,
      insertText: '"field_security": { "grant": ["${1:*}"] }' },
    { label: 'query', detail: '文档级查询限制（Query DSL）', snippet: true, insertText: '"query": { "match_all": {} }' },
  ];
}

/** 跨集群 Key 体区域：根 / access / access 元素 / 更深 */
export function securityCrossClusterApiKeyRegionAt(doc: string, offset: number):
  'root' | 'access' | 'entry' | 'query' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  /* access.<search|replication>[] 元素里的 query 是 Query DSL */
  if (stack[0] === 'access' && stack.includes('query')) return 'query';
  if (stack[0] === 'access' && stack.length === 2) return 'access';
  if (stack[0] === 'access' && (stack[1] === 'search' || stack[1] === 'replication') && stack.length === 4) return 'entry';
  return 'deep';
}

/** 试跑 Watch 体（POST /_watcher/watch/<id>/_execute）的根键 */
export function watchExecuteBodyKeyItems(): AssistItem[] {
  return [
    { label: 'trigger_data', detail: '模拟触发数据（triggered_time/scheduled_time）', snippet: true,
      insertText: '"trigger_data": {\n  "triggered_time": "${1:now}"\n}' },
    { label: 'alternative_input', detail: '替换 watch 输入（试跑不同数据）', snippet: true,
      insertText: '"alternative_input": {\n  ${0}\n}' },
    { label: 'ignore_condition', detail: '忽略 condition（强制继续动作）', snippet: true,
      insertText: '"ignore_condition": ${1|false,true|}' },
    { label: 'action_modes', detail: '逐动作执行模式（force_execute/simulate/skip…）', snippet: true,
      insertText: '"action_modes": {\n  "${1:notify}": "${2|force_execute,simulate,skip,execute,force_simulate|}"\n}' },
    { label: 'record_execution', detail: '是否记录本次执行', snippet: true,
      insertText: '"record_execution": ${1|false,true|}' },
    { label: 'simulated_actions', detail: '模拟动作（指定 actions 或 use_all）', snippet: true,
      insertText: '"simulated_actions": { "use_all": ${1|true,false|} }' },
  ];
}

/** 应用权限体（PUT|POST /_security/privilege）骨架：应用名/权限名都是动态键 */
export function securityPrivilegeBodyKeyItems(): AssistItem[] {
  return [
    { label: 'myapp', detail: '应用名 → 权限名 → {actions, metadata}（两层键均自定）', snippet: true,
      insertText: '"${1:myapp}": {\n  "${2:read}": {\n    "actions": ["${3:read}"]\n  }\n}' },
  ];
}

/** 应用权限条目（<privilege> 对象）的键 */
export function securityPrivilegeEntryKeyItems(): AssistItem[] {
  return [
    { label: 'actions', detail: '该应用权限包含的动作清单', snippet: true, insertText: '"actions": ["${1:read}"]' },
    { label: 'metadata', detail: '应用自定义元数据', snippet: true, insertText: '"metadata": {\n  ${0}\n}' },
  ];
}

/** 应用权限体区域：根 / 应用层（权限名动态）/ 权限条目 / 更深 */
export function securityPrivilegeRegionAt(doc: string, offset: number):
  'root' | 'app' | 'privilege' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack.length === 2) return 'app';
  if (stack.length === 3) return 'privilege';
  return 'deep';
}

/** ILM 手动推进体（POST /_ilm/move/<索引>）的根键 */
export function ilmMoveBodyKeyItems(): AssistItem[] {
  return [
    { label: 'current_step', detail: '当前步骤（phase/action/name）', snippet: true,
      insertText: '"current_step": {\n  "phase": "${1:hot}",\n  "action": "${2:rollover}"\n}' },
    { label: 'next_step', detail: '目标步骤（phase/action/name）', snippet: true,
      insertText: '"next_step": {\n  "phase": "${1:hot}",\n  "action": "${2:rollover}",\n  "name": "${3:attempt_rollover}"\n}' },
  ];
}

/** current_step / next_step 的键 */
export function ilmMoveStepKeyItems(): AssistItem[] {
  return [
    { label: 'phase', detail: '阶段名', snippet: true, insertText: '"phase": "${1|hot,warm,cold,frozen,delete|}"' },
    { label: 'action', detail: '动作名（rollover/forcemerge/…）', snippet: true, insertText: '"action": "${1:rollover}"' },
    { label: 'name', detail: '动作实例名（可省略）', snippet: true, insertText: '"name": "${1:attempt_rollover}"' },
  ];
}

/** ILM 推进体区域：根 / 步骤对象 / 更深 */
export function ilmMoveRegionAt(doc: string, offset: number): 'root' | 'step' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if ((stack[0] === 'current_step' || stack[0] === 'next_step') && stack.length === 2) return 'step';
  return 'deep';
}

/** 克隆快照体（PUT /_snapshot/<repo>/<snap>/_clone）的根键 */
export function snapshotCloneBodyKeyItems(): AssistItem[] {
  return [
    { label: 'indices', detail: '要复制的索引（逗号分隔/通配）', snippet: true, insertText: '"indices": "${1:logs-*}"' },
    { label: 'index_settings', detail: '克隆时覆盖的索引设置', snippet: true, insertText: '"index_settings": {\n  ${0}\n}' },
    { label: 'ignore_index_settings', detail: '忽略的索引设置清单', snippet: true,
      insertText: '"ignore_index_settings": ["${1:index.refresh_interval}"]' },
  ];
}

/** 内联试跑 Watch 体（POST /_watcher/watch/_execute）的根键 */
export function watchInlineExecuteBodyKeyItems(): AssistItem[] {
  return [
    { label: 'watch', detail: '内联 Watch 定义（trigger/input/condition/actions）', snippet: true,
      insertText: '"watch": {\n  "trigger": { "schedule": { "interval": "5m" } },\n  "input": { "simple": {} },\n  "condition": { "always": {} },\n  "actions": { "log": { "logging": { "text": "fired" } } }\n}' },
    ...watchExecuteBodyKeyItems(),
  ];
}

/** 内联试跑体区域：根 / watch 定义（复用 watch 各子区）/ 更深 */
export function watchInlineExecuteRegionAt(doc: string, offset: number):
  'root' | 'watch' | 'watch-trigger' | 'watch-schedule' | 'watch-input' | 'search-input' | 'search-request'
  | 'watch-search-body' | 'watch-search-query' | 'http-input' | 'http-request'
  | 'chain-input-container' | 'chain-input'
  | 'chain-trigger' | 'chain-trigger-container'
  | 'watch-condition' | 'condition-params' | 'array-compare-body' | 'array-compare-op'
  | 'watch-action' | 'action-params'
  | 'action-email-body' | 'action-slack-message' | 'action-jira-fields'
  | 'email-attachment' | 'email-att-http' | 'email-att-reporting' | 'email-att-data'
  | 'slack-attachment' | 'slack-attachment-field'
  | 'http-auth-basic' | 'http-proxy' | 'pagerduty-context' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] !== 'watch') return 'deep';
  if (stack.length === 2) return 'watch';
  if (stack[1] === 'trigger') {
    if (stack.length === 3) return 'watch-trigger';
    if (stack.length === 4 && stack[2] === 'schedule') return 'watch-schedule';
    if (stack[2] === 'chain') {
      if (stack.length === 5) return 'chain-trigger';
      if (stack.length === 6 && stack[4] === 'trigger') return 'chain-trigger-container';
      if (stack.length === 7 && stack[4] === 'trigger' && stack[5] === 'schedule') return 'watch-schedule';
    }
    return 'deep';
  }
  if (stack[1] === 'input') {
    if (stack.length === 3) return 'watch-input';
    if (stack[2] === 'search') {
      /* watch.input.search.request.body 同样是 search body：根层给根键，query 子树回落查询 */
      if (stack[3] === 'request' && stack[4] === 'body') {
        if (stack.length === 6) return 'watch-search-body';
        if (stack.includes('query')) return 'watch-search-query';
      }
      if (stack.length === 4) return 'search-input';
      if (stack.length === 5 && stack[3] === 'request') return 'search-request';
      return 'deep';
    }
    if (stack[2] === 'http') {
      if (stack.length === 4) return 'http-input';
      if (stack.length === 5 && stack[3] === 'request') return 'http-request';
      if (stack.length === 7 && stack[3] === 'request' && stack[4] === 'auth' && stack[5] === 'basic') {
        return 'http-auth-basic';
      }
      if (stack.length === 6 && stack[3] === 'request' && stack[4] === 'proxy') return 'http-proxy';
    }
    if (stack[2] === 'chain') {
      if (stack.length === 4) return 'chain-input-container';
      if (stack.length === 7 && stack[3] === 'inputs' && stack[4] === null && stack[5] && stack[6] === null) {
        return 'chain-input';
      }
    }
    return 'deep';
  }
  if (stack[1] === 'condition') {
    if (stack.length === 3) return 'watch-condition';
    if (stack.length === 4) return 'condition-params';
    if (stack[2] === 'array_compare') {
      if (stack.length === 5) return 'array-compare-body';
      if (stack.length === 6 && stack[4] !== 'path') return 'array-compare-op';
    }
    return 'deep';
  }
  if (stack[1] === 'actions') {
    if (stack.length === 4) return 'watch-action';
    if (stack.length === 5) return 'action-params';
    if (stack.length === 6 && stack[3] === 'email' && stack[4] === 'body') return 'action-email-body';
    if (stack.length === 6 && stack[3] === 'slack' && stack[4] === 'message') return 'action-slack-message';
    if (stack.length === 6 && stack[3] === 'jira' && stack[4] === 'fields') return 'action-jira-fields';
    if (stack[3] === 'email' && stack[4] === 'attachments') {
      if (stack.length === 7) return 'email-attachment';
      if (stack.length === 8 && stack[6] === 'http') return 'email-att-http';
      if (stack.length === 8 && stack[6] === 'reporting') return 'email-att-reporting';
      if (stack.length === 8 && stack[6] === 'data') return 'email-att-data';
      if (stack.length === 9 && (stack[6] === 'http' || stack[6] === 'reporting') && stack[7] === 'request') {
        return 'http-request';
      }
    }
    if (stack.length === 7 && stack[3] === 'webhook' && stack[4] === 'auth' && stack[5] === 'basic') {
      return 'http-auth-basic';
    }
    if (stack.length === 6 && stack[3] === 'webhook' && stack[4] === 'proxy') return 'http-proxy';
    if (stack.length === 7 && stack[3] === 'pagerduty' && stack[4] === 'contexts') return 'pagerduty-context';
    if (stack.length === 8 && stack[3] === 'slack' && stack[4] === 'message' && stack[5] === 'attachments') {
      return 'slack-attachment';
    }
    if (stack.length === 10 && stack[3] === 'slack' && stack[4] === 'message'
        && stack[5] === 'attachments' && stack[7] === 'fields') return 'slack-attachment-field';
    return 'deep';
  }
  return 'deep';
}

/** 挂载快照体（POST /_snapshot/<repo>/<snap>/_mount）的根键 */
export function snapshotMountBodyKeyItems(): AssistItem[] {
  return [
    { label: 'index', detail: '快照中要挂载的索引', snippet: true, insertText: '"index": "${1:logs}"' },
    { label: 'renamed_index', detail: '挂载后的索引名（省略沿用原名）', snippet: true, insertText: '"renamed_index": "${1:logs-restored}"' },
    { label: 'index_settings', detail: '挂载时覆盖的索引设置', snippet: true, insertText: '"index_settings": {\n  ${0}\n}' },
    { label: 'ignore_index_settings', detail: '忽略的索引设置清单', snippet: true,
      insertText: '"ignore_index_settings": ["${1:index.refresh_interval}"]' },
    { label: 'storage', detail: '存储方式（shared_cache 共享缓存 / full_copy 完整副本）', snippet: true,
      insertText: '"storage": "${1|shared_cache,full_copy|}"' },
  ];
}

/** 重载节点密钥库体（POST /_nodes[/<node_id>]/reload_secure_settings）的根键 */
export function nodesReloadSecureSettingsBodyKeyItems(): AssistItem[] {
  return [
    { label: 'secure_settings_password', detail: '密钥库密码（无密码库可省略）', snippet: true,
      insertText: '"secure_settings_password": "${1:keystore-password}"' },
  ];
}

/** 许可证更新体（PUT|POST /_license）的根键 */
export function licenseBodyKeyItems(): AssistItem[] {
  return [
    { label: 'licenses', detail: '许可证清单（多张许可）', snippet: true,
      insertText: '"licenses": [\n  {\n    "uid": "${1:license-uid}",\n    "type": "${2|enterprise,platinum,gold,silver,standard,basic,trial,dev|}",\n    "issue_date_in_millis": ${3:1700000000000},\n    "expiry_date_in_millis": ${4:1800000000000},\n    "issued_to": "${5:company}",\n    "issuer": "${6:elastic}",\n    "signature": "${7:signature}"\n  }\n]' },
    { label: 'license', detail: '单张许可证（与 licenses 二选一）', snippet: true,
      insertText: '"license": {\n  "uid": "${1:license-uid}",\n  "type": "${2|enterprise,platinum,gold,silver,standard,basic,trial,dev|}",\n  "issue_date_in_millis": ${3:1700000000000},\n  "expiry_date_in_millis": ${4:1800000000000},\n  "issued_to": "${5:company}",\n  "issuer": "${6:elastic}",\n  "signature": "${7:signature}"\n}' },
  ];
}

/** 许可证条目的键 */
export function licenseEntryKeyItems(): AssistItem[] {
  return [
    { label: 'uid', detail: '许可证唯一标识', snippet: true, insertText: '"uid": "${1:license-uid}"' },
    { label: 'type', detail: '许可证级别', snippet: true,
      insertText: '"type": "${1|enterprise,platinum,gold,silver,standard,basic,trial,dev|}"' },
    { label: 'issue_date_in_millis', detail: '签发时间（epoch 毫秒）', snippet: true, insertText: '"issue_date_in_millis": ${1:1700000000000}' },
    { label: 'expiry_date_in_millis', detail: '到期时间（epoch 毫秒）', snippet: true, insertText: '"expiry_date_in_millis": ${1:1800000000000}' },
    { label: 'start_date_in_millis', detail: '生效时间（epoch 毫秒，可选）', snippet: true, insertText: '"start_date_in_millis": ${1:1700000000000}' },
    { label: 'issued_to', detail: '被授权方', snippet: true, insertText: '"issued_to": "${1:company}"' },
    { label: 'issuer', detail: '签发方', snippet: true, insertText: '"issuer": "${1:elastic}"' },
    { label: 'max_nodes', detail: '最大节点数', snippet: true, insertText: '"max_nodes": ${1:100}' },
    { label: 'max_resource_units', detail: '最大资源单元数（企业版）', snippet: true, insertText: '"max_resource_units": ${1:200}' },
    { label: 'signature', detail: '许可证签名', snippet: true, insertText: '"signature": "${1:signature}"' },
  ];
}

/** 许可证体区域：根 / 许可证条目（licenses[] 元素或 license 对象）/ 更深 */
export function licenseRegionAt(doc: string, offset: number): 'root' | 'entry' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'license' && stack.length === 2) return 'entry';
  if (stack[0] === 'licenses' && stack.length === 3) return 'entry';
  return 'deep';
}

/** 管道试跑体（POST /_ingest/pipeline[_/<id>]/_simulate）的根键 */
export function ingestSimulateBodyKeyItems(): AssistItem[] {
  return [
    { label: 'pipeline', detail: '内联管道定义（省略则用路径上的已存管道）', snippet: true,
      insertText: '"pipeline": {\n  "processors": [\n    { "set": { "field": "${1:field}", "value": "${2:value}" } }\n  ]\n}' },
    { label: 'docs', detail: '待试跑文档（_source 为文档内容）', snippet: true,
      insertText: '"docs": [\n  {\n    "_source": { "${1:field}": "${2:value}" }\n  }\n]' },
    { label: 'verbose', detail: '返回每个处理器的中间结果', snippet: true, insertText: '"verbose": ${1|true,false|}' },
  ];
}

/** 试跑 docs[] 元素的键 */
export function ingestSimulateDocKeyItems(): AssistItem[] {
  return [
    { label: '_index', detail: '模拟文档所属索引', snippet: true, insertText: '"_index": "${1:my-index}"' },
    { label: '_id', detail: '模拟文档 id', snippet: true, insertText: '"_id": "${1:1}"' },
    { label: '_source', detail: '文档内容', snippet: true, insertText: '"_source": {\n  ${0}\n}' },
    { label: '_routing', detail: '路由值', snippet: true, insertText: '"_routing": "${1:routing}"' },
  ];
}

/** 管道试跑体区域：根 / pipeline / pipeline.processors·on_failure / docs 元素 / 更深 */
export function ingestSimulateRegionAt(doc: string, offset: number):
  'root' | 'pipeline' | 'pipeline-processor' | 'doc' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'pipeline') {
    if (stack.length === 2) return 'pipeline';
    if (stack[1] === 'processors' && stack.length === 4) return 'pipeline-processor';
    if (stack[1] === 'on_failure' && (stack.length === 3 || stack.length === 4)) return 'pipeline-processor';
    return 'deep';
  }
  if (stack[0] === 'docs' && stack.length === 3) return 'doc';
  return 'deep';
}

/** 分片分配诊断体（POST /_cluster/allocation/explain）的根键 */
export function allocationExplainBodyKeyItems(): AssistItem[] {
  return [
    { label: 'index', detail: '目标索引（省略则诊断第一个未分配分片）', snippet: true, insertText: '"index": "${1:my-index}"' },
    { label: 'shard', detail: '分片序号', snippet: true, insertText: '"shard": ${1:0}' },
    { label: 'primary', detail: '是否诊断主分片', snippet: true, insertText: '"primary": ${1|true,false|}' },
    { label: 'current_node', detail: '假设分片当前所在节点（模拟分配）', snippet: true, insertText: '"current_node": "${1:node-a}"' },
    { label: 'include_disk_info', detail: '返回磁盘用量信息', snippet: true, insertText: '"include_disk_info": ${1|true,false|}' },
    { label: 'include_yes_decisions', detail: '返回「允许分配」的决策明细', snippet: true,
      insertText: '"include_yes_decisions": ${1|true,false|}' },
  ];
}

/** 核心字段类型目录（ES 8.x mapping 文档）——补全、mapping-type lint、
    设计器类型下拉三处共用单源。1439：此前是 18 项残缺表，设计器另抄 24 项
    （还写着并不存在的裸 `range`，选了就产 ES 400 的非法 mapping）。 */
export const MAPPING_TYPES = [
  /* 字符串族 */
  'text', 'keyword', 'constant_keyword', 'wildcard', 'match_only_text',
  'search_as_you_type', 'annotated_text', 'semantic_text',
  /* 数值族 */
  'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float',
  'scaled_float', 'unsigned_long', 'token_count',
  /* 日期 / 布尔 / IP */
  'date', 'date_nanos', 'boolean', 'ip',
  /* 范围族（裸 range 不是合法类型名） */
  'integer_range', 'long_range', 'float_range', 'double_range', 'date_range', 'ip_range',
  /* 结构化 */
  'object', 'nested', 'flattened', 'join', 'alias', 'version',
  'aggregate_metric_double', 'histogram',
  /* 地理 / 形状 */
  'geo_point', 'geo_shape', 'shape', 'point',
  /* 特化 */
  'binary', 'completion', 'percolator', 'rank_feature', 'rank_features',
  'dense_vector', 'sparse_vector',
];

export function mappingKeyItems(): AssistItem[] {
  return [
    { label: 'properties', detail: '字段映射集合', snippet: true,
      insertText: '"properties": {\n  "${1:field}": { "type": "${2:keyword}" }\n}' },
    { label: 'dynamic', detail: '动态映射策略（true/false/strict）', snippet: true,
      insertText: '"dynamic": "${1|true,false,strict|}"' },
    { label: 'type', detail: '字段类型', snippet: true,
      insertText: '"type": "${1|keyword,text,long,integer,double,date,boolean,ip,object,nested|}"' },
    { label: 'fields', detail: '多字段（子字段）', snippet: true,
      insertText: '"fields": {\n  "${1:sub}": { "type": "${2:keyword}" }\n}' },
  ];
}

/** runtime_mappings 字段配置的 type 值域——官方 runtime 字段支持的类型 */
export const RUNTIME_FIELD_TYPES: Array<{ label: string; detail: string }> = [
  { label: 'boolean', detail: '布尔' },
  { label: 'composite', detail: '组合（多字段脚本，8.10+）' },
  { label: 'date', detail: '日期' },
  { label: 'double', detail: '双精度浮点' },
  { label: 'geo_point', detail: '地理点' },
  { label: 'ip', detail: 'IP 地址' },
  { label: 'keyword', detail: '关键字' },
  { label: 'long', detail: '长整型' },
  { label: 'lookup', detail: '查表（需 index + lookup 配置）' },
];

/** 光标是否在 runtime_mappings.<字段>.{} 的 "type" 值位（search / SQL 体的运行时字段） */
export function runtimeFieldTypeAt(doc: string, offset: number = doc.length): boolean {
  const stack = frameKeysAt(doc, offset);
  const i = stack.lastIndexOf('runtime_mappings');
  if (i < 0) return false;
  return i + 2 === stack.length - 1 && stack[stack.length - 1] === 'type' && !!stack[i + 1];
}

/** 光标是否已在 runtime_mappings 的字段配置内（SQL 体借此跳过 W6，走通用 runtime 键值档） */
export function inRuntimeMappingsAt(doc: string, offset: number = doc.length): boolean {
  const stack = frameKeysAt(doc, offset);
  const i = stack.lastIndexOf('runtime_mappings');
  return i >= 0 && i < stack.length - 1;
}

/** 单个字段的 mapping 配置键（properties.<字段>.{} / fields.<子域>.{} 内）——
    此前这层仍给 properties/dynamic 等顶层键，analyzer/format/ignore_above 一个都补不出。 */
export function mappingFieldKeyItems(): AssistItem[] {
  return [
    { label: 'type', detail: '字段类型', snippet: true,
      insertText: '"type": "${1|text,keyword,long,integer,double,float,date,boolean,ip,object,nested|}"' },
    { label: 'analyzer', detail: '索引分词器', snippet: true, insertText: '"analyzer": "${1:standard}"' },
    { label: 'search_analyzer', detail: '检索分词器', snippet: true, insertText: '"search_analyzer": "${1:standard}"' },
    { label: 'normalizer', detail: 'keyword 归一化器', snippet: true, insertText: '"normalizer": "${1:lowercase}"' },
    { label: 'format', detail: '日期格式（date 字段）', snippet: true, insertText: '"format": "${1:yyyy-MM-dd HH:mm:ss}"' },
    { label: 'ignore_above', detail: '超过该长度的值不索引（keyword）', snippet: true, insertText: '"ignore_above": ${1:256}' },
    { label: 'ignore_malformed', detail: '类型不符的值忽略而非报错', snippet: true, insertText: '"ignore_malformed": ${1|false,true|}' },
    { label: 'index', detail: '是否索引（false=不可检索）', snippet: true, insertText: '"index": ${1|true,false|}' },
    { label: 'doc_values', detail: '列式存储（排序/聚合依赖）', snippet: true, insertText: '"doc_values": ${1|true,false|}' },
    { label: 'null_value', detail: '显式 null 的替代值', snippet: true, insertText: '"null_value": "${1:NULL}"' },
    { label: 'copy_to', detail: '复制到组合字段', snippet: true, insertText: '"copy_to": ["${1:all_text}"]' },
    { label: 'fields', detail: '多字段（子字段）', snippet: true,
      insertText: '"fields": {\n  "${1:keyword}": { "type": "keyword" }\n}' },
    { label: 'properties', detail: '子字段映射（object/nested）', snippet: true,
      insertText: '"properties": {\n  ${0}\n}' },
    { label: 'dynamic', detail: '对象的动态映射策略', snippet: true,
      insertText: '"dynamic": "${1|true,false,strict|}"' },
    { label: 'enabled', detail: 'object 是否解析（false=整对象原样存档）', snippet: true, insertText: '"enabled": ${1|true,false|}' },
    { label: 'index_options', detail: '倒排索引选项（text）', snippet: true,
      insertText: '"index_options": "${1|docs,freqs,positions,offsets|}"' },
    { label: 'norms', detail: '是否存评分归一因子', snippet: true, insertText: '"norms": ${1|true,false|}' },
    { label: 'store', detail: '是否单独存储字段值', snippet: true, insertText: '"store": ${1|false,true|}' },
  ];
}

/** 光标是否在「单个字段配置对象」里（properties.<字段>.{} / fields.<子域>.{}，可多层嵌套）。
    只做结构判定——调用方仅在 mapping 档消费（search 的 highlight.fields 同形但另有语义）。 */
export function mappingFieldConfigAt(doc: string, offset: number): boolean {
  const stack = frameKeysAt(doc, offset);
  if (stack.length < 3) return false;
  const owner = stack[stack.length - 3];
  const field = stack[stack.length - 2];
  return (owner === 'properties' || owner === 'fields') && !!field;
}

/* snippet 缩进适配：monaco 多行 snippet 插入是字面量替换，不会叠加当前行缩进——
 深层嵌套位（如 must 数组内，8 列）选骨架后后续行塌到字面量固定 2/0 列（真机实锤）。
 统一口径：换行后叠加「range 起点行前导空白」，snippet 相对缩进保留。 */
/** 取 offset 所在行的前导空白（单行文档/行首非空白 → ''，消费处原样返回零影响） */
export function lineIndentAt(doc: string, offset: number): string {
  const lineStart = doc.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  const m = /^[ \t]*/.exec(doc.slice(lineStart));
  return m ? m[0] : '';
}
/** snippet 后续行叠加缩进：\n → \n+indent；空缩进原样返回（单行文档不动字面量） */
export function reindentSnippet(text: string, indent: string): string {
  if (!indent) return text;
  return text.replace(/\n/g, '\n' + indent);
}

/** 索引模板体内的语义区域（1439）：模板的 template.settings/mappings 里应给设置键/映射键，
    而不是继续给模板八键。扫描口径与 dslContext 同源（注释跳过、转义引号判定共享）。
    'none' = template.aliases（别名体是自由配置，不出键档）。 */
function frameKeysAt(doc: string, offset: number): Array<string | null> {
  const text = doc.slice(0, Math.max(0, Math.min(offset, doc.length)));
  const stack: Array<string | null> = [];
  let inStr = false; let curKey = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '"' && !isEscapedQuote(text, i)) {
        inStr = false;
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        if (text[j] === ':' && stack.length) stack[stack.length - 1] = curKey;
      } else curKey += ch;
      continue;
    }
    const cEnd = commentEnd(text, i);
    if (cEnd !== -1) { i = cEnd - 1; continue; }
    if (ch === '"') { inStr = true; curKey = ''; continue; }
    if (ch === '{' || ch === '[') stack.push(null);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  return stack;
}

export function templateRegionAt(doc: string, offset: number): 'template' | 'settings' | 'mapping' | 'aliases' {
  const stack = frameKeysAt(doc, offset);
  const t = stack.lastIndexOf('template');
  if (t < 0) return 'template';
  const sub = t + 1 < stack.length ? stack[t + 1] : null;
  if (sub === 'settings') return 'settings';
  if (sub === 'mappings' || sub === 'mapping') return 'mapping';
  if (sub === 'aliases') return 'aliases';
  return 'template';
}

/** 创建索引体（PUT /<索引名>）的语义区域：settings/mappings/aliases 三块各自给对应键档。 */
export function indexBodyRegionAt(doc: string, offset: number): 'root' | 'settings' | 'mapping' | 'aliases' {
  const stack = frameKeysAt(doc, offset);
  const rootKey = stack[0] ?? null;
  if (rootKey === 'settings') return 'settings';
  if (rootKey === 'mappings' || rootKey === 'mapping') return 'mapping';
  if (rootKey === 'aliases') return 'aliases';
  return 'root';
}

/** 创建索引体的顶层键（settings/mappings/aliases） */
export function indexBodyKeyItems(): AssistItem[] {
  return [
    { label: 'settings', detail: '索引设置（分片/副本/刷新间隔…）', snippet: true,
      insertText: '"settings": {\n  ${0}\n}' },
    { label: 'mappings', detail: '字段映射', snippet: true,
      insertText: '"mappings": {\n  "properties": {\n    ${0}\n  }\n}' },
    { label: 'aliases', detail: '别名', snippet: true,
      insertText: '"aliases": {\n  ${0}\n}' },
  ];
}

/** 别名配置键（template.aliases.<名>.{} / PUT /idx/_alias/<名> 的体） */
export function aliasKeyItems(): AssistItem[] {
  return [
    { label: 'filter', detail: '别名过滤查询（只有命中的文档能通过别名访问）', snippet: true,
      insertText: '"filter": {\n  ${0}\n}' },
    { label: 'index_routing', detail: '写入路由值', snippet: true, insertText: '"index_routing": "${1:routing}"' },
    { label: 'routing', detail: '读写路由值', snippet: true, insertText: '"routing": "${1:routing}"' },
    { label: 'search_routing', detail: '检索路由值', snippet: true, insertText: '"search_routing": "${1:routing}"' },
    { label: 'is_write_index', detail: '是否作为该别名的写索引', snippet: true, insertText: '"is_write_index": ${1|true,false|}' },
    { label: 'is_hidden', detail: '别名是否隐藏', snippet: true, insertText: '"is_hidden": ${1|false,true|}' },
  ];
}

/** SQL 体（_sql / _sql/translate）的键——官方 8.x SQL 搜索 API 的全部体字段 */
export function sqlBodyKeyItems(): AssistItem[] {
  return [
    { label: 'query', detail: 'SQL 语句', snippet: true,
      insertText: '"query": "SELECT * FROM ${1:my-index} LIMIT 10"' },
    { label: 'fetch_size', detail: '每批返回行数（游标分页）', snippet: true, insertText: '"fetch_size": ${1:1000}' },
    { label: 'time_zone', detail: '时区（日期函数按它解释）', snippet: true, insertText: '"time_zone": "${1:UTC}"' },
    { label: 'columnar', detail: '列式返回（true=按列组织）', snippet: true, insertText: '"columnar": ${1|false,true|}' },
    { label: 'params', detail: '参数化查询的命名参数（?name）', snippet: true,
      insertText: '"params": {\n  ${0}\n}' },
    { label: 'runtime_mappings', detail: '本次查询的运行时字段', snippet: true,
      insertText: '"runtime_mappings": {\n  ${0}\n}' },
    { label: 'filter', detail: '对结果再做 Query DSL 过滤', snippet: true,
      insertText: '"filter": {\n  ${0}\n}' },
    { label: 'field_multi_value_leniency', detail: '数组字段遇到多值时是否放宽', snippet: true,
      insertText: '"field_multi_value_leniency": ${1|false,true|}' },
    { label: 'allow_partial_search_results', detail: '分片超时/失败时是否返回部分结果', snippet: true,
      insertText: '"allow_partial_search_results": ${1|true,false|}' },
    { label: 'keep_alive', detail: '异步/同步搜索结果的保留时长', snippet: true, insertText: '"keep_alive": "${1:1m}"' },
    { label: 'keep_on_completion', detail: '同步等待时也把结果存起来（配合 wait_for_completion_timeout）', snippet: true,
      insertText: '"keep_on_completion": ${1|false,true|}' },
    { label: 'wait_for_completion_timeout', detail: '超过该时长转异步（返回 id）', snippet: true,
      insertText: '"wait_for_completion_timeout": "${1:1s}"' },
    { label: 'page_timeout', detail: '游标翻页的最短保留时长', snippet: true, insertText: '"page_timeout": "${1:1m}"' },
    { label: 'request_timeout', detail: '整个请求的超时', snippet: true, insertText: '"request_timeout": "${1:30s}"' },
    { label: 'catalog', detail: '查询默认集群（仅本地数据）', snippet: true, insertText: '"catalog": "${1:my-cluster}"' },
    { label: 'cursor', detail: '翻页游标（上次响应里的 cursor）', snippet: true, insertText: '"cursor": "${1:cursor}"' },
    { label: 'index_include_frozen', detail: '是否允许查询冻结索引', snippet: true,
      insertText: '"index_include_frozen": ${1|false,true|}' },
  ];
}

/** "query": 值位的 SQL 骨架。text 是**已按 JSON 串转义**的 SQL（索引名带 \\"），
    消费侧再包一层引号即可安全落进 JSON。 */
export const SQL_VALUE_SNIPPETS: Array<{ label: string; text: string; detail: string }> = [
  { label: 'SELECT *', text: 'SELECT * FROM \\"my-index\\" LIMIT 100', detail: '取前 100 行' },
  { label: 'SELECT WHERE', text: 'SELECT * FROM \\"my-index\\" WHERE field = \'x\' LIMIT 100', detail: '带条件过滤' },
  { label: 'SELECT GROUP BY', text: 'SELECT field, COUNT(*) AS c FROM \\"my-index\\" GROUP BY field LIMIT 100', detail: '分组计数' },
];

/** SQL 串**中途**的关键字/函数候选——值位已有内容时只插入不替换（此前整串被骨架覆盖）。
    文本不含引号/反斜杠，落进 JSON 串内始终安全。 */
export const SQL_KEYWORD_SNIPPETS: Array<{ label: string; text: string; detail: string }> = [
  { label: 'WHERE', text: 'WHERE ', detail: '条件' },
  { label: 'AND', text: 'AND ', detail: '与' },
  { label: 'OR', text: 'OR ', detail: '或' },
  { label: 'NOT', text: 'NOT ', detail: '取反' },
  { label: 'GROUP BY', text: 'GROUP BY ', detail: '分组' },
  { label: 'HAVING', text: 'HAVING ', detail: '分组后过滤' },
  { label: 'ORDER BY', text: 'ORDER BY ', detail: '排序' },
  { label: 'LIMIT', text: 'LIMIT ', detail: '限制行数' },
  { label: 'JOIN', text: 'JOIN ', detail: '连接' },
  { label: 'LIKE', text: 'LIKE ', detail: '模式匹配' },
  { label: 'IN', text: 'IN (', detail: '集合' },
  { label: 'IS NULL', text: 'IS NULL', detail: '空值判断' },
  { label: 'BETWEEN', text: 'BETWEEN ', detail: '区间' },
  { label: 'COUNT(*)', text: 'COUNT(*)', detail: '计数' },
  { label: 'AVG(', text: 'AVG(', detail: '平均' },
  { label: 'SUM(', text: 'SUM(', detail: '求和' },
  { label: 'MIN(', text: 'MIN(', detail: '最小' },
  { label: 'MAX(', text: 'MAX(', detail: '最大' },
];

/** 更新文档体（POST/PUT /<索引>/_update/<id>）的根键 */
export function updateBodyKeyItems(): AssistItem[] {
  return [
    { label: 'doc', detail: '需要部分更新的字段', snippet: true, insertText: '"doc": {\n  ${0}\n}' },
    { label: 'upsert', detail: '文档不存在时插入的全文', snippet: true, insertText: '"upsert": {\n  ${0}\n}' },
    { label: 'doc_as_upsert', detail: '不存在时把 doc 当 upsert 写入', snippet: true,
      insertText: '"doc_as_upsert": ${1|true,false|}' },
    { label: 'script', detail: '脚本更新（与 doc 二选一）', snippet: true,
      insertText: '"script": {\n  "source": "${1:ctx._source.field = params.value}"\n}' },
    { label: 'scripted_upsert', detail: '文档不存在时脚本照常执行（配合 upsert）', snippet: true,
      insertText: '"scripted_upsert": ${1|false,true|}' },
    { label: 'detect_noop', detail: '内容无变化时不写（默认 true）', snippet: true,
      insertText: '"detect_noop": ${1|true,false|}' },
    { label: '_source', detail: '响应里是否回源文档', snippet: true, insertText: '"_source": ${1|true,false|}' },
  ];
}

/** 更新体里 script 对象的键（source/id 二选一，lang 默认 painless） */
export function scriptObjectKeyItems(): AssistItem[] {
  return [
    { label: 'source', detail: 'painless 脚本文本', snippet: true,
      insertText: '"source": "${1:ctx._source.field = params.value}"' },
    { label: 'lang', detail: '脚本语言（默认 painless）', snippet: true, insertText: '"lang": "${1:painless}"' },
    { label: 'params', detail: '脚本参数', snippet: true, insertText: '"params": {\n  ${0}\n}' },
    { label: 'id', detail: '引用已存脚本（与 source 二选一）', snippet: true, insertText: '"id": "${1:my-script}"' },
  ];
}

/** 更新体区域：根层给根键；doc/upsert 内是裸文档（不给键）；script 内给脚本键；
    更深层（script.params 里的任意参数名）不给。 */
export function updateBodyRegionAt(doc: string, offset: number): 'root' | 'doc' | 'script' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  const rootKey = stack[0] ?? null;
  if (rootKey === 'doc' || rootKey === 'upsert') return 'doc';
  if (rootKey === 'script') return stack.length === 2 ? 'script' : 'deep';
  return 'deep';
}

/** 滚动索引体（POST /<别名>/_rollover）的根键 */
export function rolloverBodyKeyItems(): AssistItem[] {
  return [
    { label: 'conditions', detail: '滚动条件（满足任一即滚）', snippet: true,
      insertText: '"conditions": {\n  "max_age": "${1:7d}"\n}' },
    { label: 'settings', detail: '新索引的设置', snippet: true, insertText: '"settings": {\n  ${0}\n}' },
    { label: 'mappings', detail: '新索引的字段映射', snippet: true,
      insertText: '"mappings": {\n  "properties": {\n    ${0}\n  }\n}' },
    { label: 'aliases', detail: '新索引的别名配置', snippet: true, insertText: '"aliases": {\n  ${0}\n}' },
  ];
}

/** rollover 的 conditions 键——只认 max_*（min_* 是 ILM 的条件，rollover API 不认） */
export function rolloverConditionKeyItems(): AssistItem[] {
  return [
    { label: 'max_age', detail: '索引最大年龄（时间串）', snippet: true, insertText: '"max_age": "${1:7d}"' },
    { label: 'max_docs', detail: '索引最大文档数', snippet: true, insertText: '"max_docs": ${1:1000000}' },
    { label: 'max_size', detail: '索引最大总大小', snippet: true, insertText: '"max_size": "${1:50gb}"' },
    { label: 'max_primary_shard_size', detail: '单主分片最大大小', snippet: true,
      insertText: '"max_primary_shard_size": "${1:50gb}"' },
    { label: 'max_primary_shard_docs', detail: '单主分片最大文档数', snippet: true,
      insertText: '"max_primary_shard_docs": ${1:200000}' },
  ];
}

/** 滚动索引体区域：settings/mappings/aliases 各自给对应键档，conditions 给条件键，
    更深层（conditions 内部、别名词条内部）由调用方压制。 */
export function rolloverBodyRegionAt(doc: string, offset: number):
  'root' | 'conditions' | 'settings' | 'mapping' | 'aliases' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  const rootKey = stack[0] ?? null;
  if (rootKey === 'conditions') return stack.length === 2 ? 'conditions' : 'deep';
  if (rootKey === 'settings') return 'settings';
  if (rootKey === 'mappings' || rootKey === 'mapping') return 'mapping';
  if (rootKey === 'aliases') return 'aliases';
  return 'deep';
}

/** 按查询删除体（POST /<索引>/_delete_by_query）的根键——官方体字段只有这四类，
    conflicts/refresh/requests_per_second 是 URL 参数不是体字段。 */
export function dbqBodyKeyItems(): AssistItem[] {
  return [
    { label: 'query', detail: '选择要删除的文档', snippet: true,
      insertText: '"query": {\n  "match_all": {}\n}' },
    { label: 'max_docs', detail: '最多删除多少条', snippet: true, insertText: '"max_docs": ${1:1000}' },
    { label: 'slices', detail: '并行切片数（auto 或数字）', snippet: true, insertText: '"slices": "${1:auto}"' },
    { label: 'slice', detail: '手工切片（id/max 自己分配）', snippet: true,
      insertText: '"slice": {\n  "id": ${1:0},\n  "max": ${2:2}\n}' },
  ];
}

/** 按查询更新体（POST /<索引>/_update_by_query）的根键——比 DBQ 多 script 与 pipeline。 */
export function ubqBodyKeyItems(): AssistItem[] {
  return [
    { label: 'query', detail: '选择要更新的文档', snippet: true,
      insertText: '"query": {\n  "match_all": {}\n}' },
    { label: 'script', detail: '对命中文档执行的脚本', snippet: true,
      insertText: '"script": {\n  "source": "${1:ctx._source.field = params.value}"\n}' },
    { label: 'max_docs', detail: '最多更新多少条', snippet: true, insertText: '"max_docs": ${1:1000}' },
    { label: 'pipeline', detail: '写入前经过的 ingest pipeline', snippet: true, insertText: '"pipeline": "${1:my-pipeline}"' },
    { label: 'slices', detail: '并行切片数（auto 或数字）', snippet: true, insertText: '"slices": "${1:auto}"' },
  ];
}

/** 按查询删/改体的区域：根层给根键；query 内交给 search 三档（整棵查询补全）；
    script 内给脚本键（仅 UBQ 有 script）；更深层不出档。 */
export function queryWriteRegionAt(doc: string, offset: number): 'root' | 'query' | 'script' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  const rootKey = stack[0] ?? null;
  if (rootKey === 'query') return 'query';
  if (rootKey === 'script') return stack.length === 2 ? 'script' : 'deep';
  return 'deep';
}

/** 只收 query 的体（_count / _explain / _validate/query）——根键只有一个 query，
    sort/aggs/size 等写进去 ES 直接 400。 */
export function queryOnlyBodyKeyItems(): AssistItem[] {
  return [
    { label: 'query', detail: '查询条件（此体只有 query 一个根键）', snippet: true,
      insertText: '"query": {\n  ${0}\n}' },
  ];
}

/** EQL 检索体（POST /<索引>/_eql/search）的根键——query 是 EQL 串，
    filter 才是 Query DSL；其余键控制时间字段/分页/异步结果保留。 */
export function eqlBodyKeyItems(): AssistItem[] {
  return [
    { label: 'query', detail: 'EQL 查询串（如 any where true / process where …）', snippet: true,
      insertText: '"query": "${1:any where true}"' },
    { label: 'filter', detail: 'Query DSL 过滤（与 EQL 结果取交集）', snippet: true,
      insertText: '"filter": {\n  ${0}\n}' },
    { label: 'case_sensitive', detail: '字符串比较是否区分大小写（默认 false）', snippet: true,
      insertText: '"case_sensitive": ${1|true,false|}' },
    { label: 'event_category_field', detail: '事件类别字段（默认 event.category）', snippet: true,
      insertText: '"event_category_field": "${1:event.category}"' },
    { label: 'timestamp_field', detail: '时间戳字段（默认 @timestamp）', snippet: true,
      insertText: '"timestamp_field": "${1:@timestamp}"' },
    { label: 'tiebreaker_field', detail: '排序去重字段（时间戳相同时的稳定序）', snippet: true,
      insertText: '"tiebreaker_field": "${1:event.id}"' },
    { label: 'size', detail: '每页事件数（默认 10）', snippet: true, insertText: '"size": ${1:10}' },
    { label: 'fields', detail: '随结果返回的字段清单', snippet: true, insertText: '"fields": ["${1:field}"]' },
    { label: 'max_samples_per_key', detail: 'sample 查询每个键的最大事件数', snippet: true,
      insertText: '"max_samples_per_key": ${1:10}' },
    { label: 'keep_alive', detail: '异步结果保留时间（如 5d；到期后结果被清理）', snippet: true,
      insertText: '"keep_alive": "${1:5d}"' },
    { label: 'keep_on_completion', detail: '查询完成后是否保留结果（默认 false）', snippet: true,
      insertText: '"keep_on_completion": ${1|true,false|}' },
    { label: 'wait_for_completion_timeout', detail: '同步等待上限，超时转异步', snippet: true,
      insertText: '"wait_for_completion_timeout": "${1:1s}"' },
    { label: 'allow_partial_sequence_results', detail: 'sequence 分片缺失时是否返回部分结果', snippet: true,
      insertText: '"allow_partial_sequence_results": ${1|false,true|}' },
    { label: 'result_position', detail: '结果位置（tail 默认 / head）', snippet: true,
      insertText: '"result_position": "${1|tail,head|}"' },
    { label: 'runtime_mappings', detail: '运行时字段（只在本查询生效）', snippet: true,
      insertText: '"runtime_mappings": {\n  ${0}\n}' },
  ];
}

/** EQL query 串的起步骨架（值位插入；含引号的文本由 Monaco 侧按 JSON 串转义） */
export const EQL_VALUE_SNIPPETS: Array<{ label: string; text: string; detail: string }> = [
  { label: 'any where', text: 'any where true', detail: '任意事件（EQL 最小查询）' },
  { label: 'process where', text: 'process where process.name == "cmd.exe"', detail: '进程事件过滤' },
  { label: 'sequence by', text: 'sequence by process.entity_id [process where true] [network where true]',
    detail: '按键排序的有序事件序列（可配 with maxspan）' },
  { label: 'sample by', text: 'sample by process.entity_id [process where true]',
    detail: '按键采样事件（每键最多 max_samples_per_key 条）' },
];

/** EQL 串中段的语法关键字（光标处插入，不替换已有内容） */
export const EQL_KEYWORD_SNIPPETS: Array<{ label: string; text: string; detail: string }> = [
  { label: 'where', text: 'where ', detail: '事件类别后的过滤条件' },
  { label: 'and', text: ' and ', detail: '条件与' },
  { label: 'or', text: ' or ', detail: '条件或' },
  { label: 'not', text: 'not ', detail: '条件取反' },
  { label: 'by', text: ' by ', detail: 'sequence/sample 的分组键' },
  { label: 'with maxspan=', text: 'with maxspan=', detail: '序列最大时间跨度（如 5m）' },
  { label: 'until', text: ' until ', detail: '序列终止条件' },
];

/** 执行/渲染模板体（_search/template、_render/template）：id 与 source 二选一 + params */
export function templateSearchBodyKeyItems(): AssistItem[] {
  return [
    { label: 'id', detail: '已存模板 id（与 source 二选一）', snippet: true, insertText: '"id": "${1:my-template}"' },
    { label: 'source', detail: '内联 Mustache 模板', snippet: true, insertText: '"source": {\n  ${0}\n}' },
    { label: 'params', detail: '模板参数', snippet: true, insertText: '"params": {\n  ${0}\n}' },
  ];
}

/** 只有根层的体：根键位 → root，进入任一子对象 → deep（不再给根键） */
export function rootOnlyRegionAt(doc: string, offset: number): 'root' | 'deep' {
  return frameKeysAt(doc, offset).length <= 1 ? 'root' : 'deep';
}

/** 多文档取回体（GET/POST /<索引>/_mget、/_mget）的根键：docs 与 ids 二选一 */
export function mgetBodyKeyItems(): AssistItem[] {
  return [
    { label: 'docs', detail: '按 _index/_id 精确取回多篇文档', snippet: true,
      insertText: '"docs": [\n  {\n    "_index": "${1:my-index}",\n    "_id": "${2:1}"\n  }\n]' },
    { label: 'ids', detail: '按 id 批量取回（索引由路径或下面 index 指定）', snippet: true,
      insertText: '"ids": ["${1:1}"]' },
  ];
}

/** _mget docs[] 元素键——官方多取 API 允许的文档级参数 */
export function mgetDocKeyItems(): AssistItem[] {
  return [
    { label: '_index', detail: '文档所在索引（路径无索引时必填）', snippet: true, insertText: '"_index": "${1:my-index}"' },
    { label: '_id', detail: '文档 id', snippet: true, insertText: '"_id": "${1:1}"' },
    { label: 'routing', detail: '取回时使用的路由值', snippet: true, insertText: '"routing": "${1:routing}"' },
    { label: '_source', detail: '是否/如何回源字段', snippet: true, insertText: '"_source": ${1|true,false|}' },
    { label: 'stored_fields', detail: '返回的 stored 字段', snippet: true, insertText: '"stored_fields": ["${1:field}"]' },
    { label: 'version', detail: '期望版本（配合 version_type）', snippet: true, insertText: '"version": ${1:1}' },
    { label: 'version_type', detail: '版本类型（internal/external）', snippet: true,
      insertText: '"version_type": "${1|internal,external|}"' },
  ];
}

/** _mget 体区域：根层给 docs/ids；docs 数组元素对象内给文档级键；ids 数组/更深层不出键 */
export function mgetRegionAt(doc: string, offset: number): 'root' | 'doc' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack.length === 3 && stack[0] === 'docs') return 'doc';
  return 'deep';
}

/** 存脚本体（PUT /_scripts/<id>）的根键 */
export function storedScriptBodyKeyItems(): AssistItem[] {
  return [
    { label: 'script', detail: '脚本对象（lang + source）', snippet: true,
      insertText: '"script": {\n  "lang": "${1:painless}",\n  "source": "${2:ctx._source.field = 1}"\n}' },
  ];
}

/** 存脚本体里 script 对象的键——官方只有 lang/source/params（id 是引用别的脚本，存自身无意义） */
export function storedScriptKeyItems(): AssistItem[] {
  return [
    { label: 'lang', detail: '脚本语言（默认 painless）', snippet: true, insertText: '"lang": "${1:painless}"' },
    { label: 'source', detail: '脚本文本', snippet: true, insertText: '"source": "${1:ctx._source.field = 1}"' },
    { label: 'params', detail: '脚本参数默认值', snippet: true, insertText: '"params": {\n  ${0}\n}' },
  ];
}

/** 执行脚本体（POST /_scripts/<id>/_execute）的根键 */
export function scriptExecuteBodyKeyItems(): AssistItem[] {
  return [
    { label: 'script', detail: '要执行的 Painless 脚本', snippet: true,
      insertText: '"script": {\n  "source": "${1:return 1;}"\n}' },
    { label: 'context', detail: '执行上下文（painless_test/score/filter…）', snippet: true,
      insertText: '"context": "${1:painless_test}"' },
    { label: 'context_setup', detail: '上下文初始化参数（如 index/document）', snippet: true,
      insertText: '"context_setup": {\n  ${0}\n}' },
  ];
}

/** 存脚本体区域：根层 / script 对象 / 更深层（params 内自由命名） */
export function storedScriptRegionAt(doc: string, offset: number): 'root' | 'script' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'script') return stack.length === 2 ? 'script' : 'deep';
  return 'deep';
}

/** 结构化体里值域封闭的键 → 值位枚举候选（quoted=串值需加引号）。
    只用于 W6 结构化体分派；search 体的 _source 等形态更多，不走本表。 */
export const STRUCTURED_VALUE_ENUMS: Record<string, { values: string[]; quoted: boolean; detail: string }> = {
  version_type: { values: ['internal', 'external', 'external_gte'], quoted: true, detail: '版本类型' },
  slices: { values: ['auto'], quoted: true, detail: '自动切片（也可填数字）' },
  is_write_index: { values: ['true', 'false'], quoted: false, detail: '写索引开关' },
  is_hidden: { values: ['true', 'false'], quoted: false, detail: '隐藏别名开关' },
  must_exist: { values: ['true', 'false'], quoted: false, detail: '不存在时报错' },
  detect_noop: { values: ['true', 'false'], quoted: false, detail: '无变化不写' },
  scripted_upsert: { values: ['true', 'false'], quoted: false, detail: '文档不存在时脚本照常执行' },
  doc_as_upsert: { values: ['true', 'false'], quoted: false, detail: 'doc 作为 upsert 写入' },
  columnar: { values: ['true', 'false'], quoted: false, detail: '列式返回' },
  field_multi_value_leniency: { values: ['true', 'false'], quoted: false, detail: '多值字段放宽' },
  allow_partial_search_results: { values: ['true', 'false'], quoted: false, detail: '允许部分结果' },
  keep_on_completion: { values: ['true', 'false'], quoted: false, detail: '完成后保留结果' },
  case_sensitive: { values: ['false', 'true'], quoted: false, detail: 'EQL 字符串比较区分大小写' },
  allow_primary: { values: ['true', 'false'], quoted: false, detail: '允许取消主分片恢复' },
  accept_data_loss: { values: ['true', 'false'], quoted: false, detail: '确认接受数据丢失' },
  primary: { values: ['true', 'false'], quoted: false, detail: '主分片' },
  include_disk_info: { values: ['true', 'false'], quoted: false, detail: '含磁盘用量' },
  include_yes_decisions: { values: ['true', 'false'], quoted: false, detail: '含允许分配的决策明细' },
  verify: { values: ['true', 'false'], quoted: false, detail: '注册仓库时校验可读写' },
  ignore_unavailable: { values: ['true', 'false'], quoted: false, detail: '忽略不存在的索引' },
  include_global_state: { values: ['false', 'true'], quoted: false, detail: '包含集群全局状态（高危）' },
  partial: { values: ['false', 'true'], quoted: false, detail: '允许部分分片/恢复' },
  include_aliases: { values: ['true', 'false'], quoted: false, detail: '恢复时包含别名' },
  enabled: { values: ['true', 'false'], quoted: false, detail: '是否启用' },
  allow_restricted_indices: { values: ['false', 'true'], quoted: false, detail: '允许访问受限系统索引' },
  allow_lazy_open: { values: ['false', 'true'], quoted: false, detail: '允许惰性打开作业' },
  use_null: { values: ['false', 'true'], quoted: false, detail: '缺失值作为独立值' },
  verbose: { values: ['true', 'false'], quoted: false, detail: '返回处理器中间结果' },
  exclude_frequent: { values: ['all', 'none', 'by', 'over'], quoted: true, detail: '排除高频值范围' },
  index_include_frozen: { values: ['true', 'false'], quoted: false, detail: '含冻结索引' },
  _source: { values: ['true', 'false'], quoted: false, detail: '回源开关（也可传字段数组）' },
  offsets: { values: ['false', 'true'], quoted: false, detail: '返回词项偏移' },
  positions: { values: ['false', 'true'], quoted: false, detail: '返回词项位置' },
  term_statistics: { values: ['false', 'true'], quoted: false, detail: '词项全局统计' },
  field_statistics: { values: ['true', 'false'], quoted: false, detail: '字段级统计' },
  op_type: { values: ['index', 'create'], quoted: true, detail: '写入形态（create=已存在则失败）' },
  context: { values: ['painless_test', 'score', 'filter'], quoted: true, detail: '脚本执行上下文' },
  grant_type: { values: ['access_token', 'password'], quoted: true, detail: '代授 API Key 的授权方式' },
  skip_result: { values: ['true', 'false'], quoted: false, detail: '事件期内不产生异常结果' },
  skip_model_update: { values: ['true', 'false'], quoted: false, detail: '事件期内不更新模型' },
  use_significance: { values: ['true', 'false'], quoted: false, detail: 'Graph 只保留显著关联' },
  owner: { values: ['true', 'false'], quoted: false, detail: '只吊销当前用户拥有的 API Key' },
  ignore_condition: { values: ['false', 'true'], quoted: false, detail: '试跑 Watch 时忽略条件' },
  record_execution: { values: ['false', 'true'], quoted: false, detail: '是否记录本次 Watch 执行' },
  storage: { values: ['shared_cache', 'full_copy'], quoted: true, detail: '挂载快照的存储方式' },
  allow_partial_sequence_results: { values: ['false', 'true'], quoted: false, detail: 'EQL sequence 允许部分分片结果' },
  result_position: { values: ['tail', 'head'], quoted: true, detail: 'EQL 结果位置' },
};

/** SQL 体的区域：根层给 SQL 键；filter 内是 Query DSL（回落到整棵查询补全）；其余子对象不出键 */
export function sqlFilterRegionAt(doc: string, offset: number): 'root' | 'query' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack[0] === 'filter') return 'query';
  return 'deep';
}

/** EQL 体（_eql/search）的 filter 同样是根级 Query DSL——区域判定与 SQL 体同形 */
export function eqlFilterRegionAt(doc: string, offset: number): 'root' | 'query' | 'deep' {
  return sqlFilterRegionAt(doc, offset);
}

/** 别名批量动作体（POST /_aliases）的根键 */
export function aliasesBodyKeyItems(): AssistItem[] {
  return [
    { label: 'actions', detail: '一条或多条别名动作', snippet: true,
      insertText: '"actions": [\n  { "add": { "index": "${1:my-index}", "alias": "${2:my-alias}" } }\n]' },
  ];
}

/** actions[] 元素的动作键 */
export function aliasActionKeyItems(): AssistItem[] {
  return [
    { label: 'add', detail: '给索引加别名（可带 filter/routing）', snippet: true,
      insertText: '"add": {\n  "index": "${1:my-index}",\n  "alias": "${2:my-alias}"\n}' },
    { label: 'remove', detail: '移除索引上的别名', snippet: true,
      insertText: '"remove": {\n  "index": "${1:my-index}",\n  "alias": "${2:my-alias}"\n}' },
    { label: 'remove_index', detail: '连索引一起删除（危险）', snippet: true,
      insertText: '"remove_index": {\n  "index": "${1:my-index}"\n}' },
  ];
}

/** add 动作的配置键（官方 add 支持别名过滤/路由/写索引等） */
export function aliasAddConfigKeyItems(): AssistItem[] {
  return [
    { label: 'index', detail: '目标索引', snippet: true, insertText: '"index": "${1:my-index}"' },
    { label: 'indices', detail: '多个目标索引', snippet: true, insertText: '"indices": ["${1:my-index}"]' },
    { label: 'alias', detail: '别名', snippet: true, insertText: '"alias": "${1:my-alias}"' },
    { label: 'aliases', detail: '多个别名', snippet: true, insertText: '"aliases": ["${1:my-alias}"]' },
    { label: 'filter', detail: '别名过滤查询（只透出命中文档）', snippet: true, insertText: '"filter": {\n  ${0}\n}' },
    { label: 'routing', detail: '读写路由值', snippet: true, insertText: '"routing": "${1:routing}"' },
    { label: 'index_routing', detail: '写入路由值', snippet: true, insertText: '"index_routing": "${1:routing}"' },
    { label: 'search_routing', detail: '检索路由值', snippet: true, insertText: '"search_routing": "${1:routing}"' },
    { label: 'is_write_index', detail: '是否作为该别名的写索引', snippet: true,
      insertText: '"is_write_index": ${1|true,false|}' },
    { label: 'is_hidden', detail: '别名是否隐藏', snippet: true, insertText: '"is_hidden": ${1|false,true|}' },
    { label: 'must_exist', detail: '目标索引/别名不存在时是否报错', snippet: true,
      insertText: '"must_exist": ${1|false,true|}' },
  ];
}

/** remove 动作的配置键（只到索引/别名粒度） */
export function aliasRemoveConfigKeyItems(): AssistItem[] {
  return [
    { label: 'index', detail: '目标索引', snippet: true, insertText: '"index": "${1:my-index}"' },
    { label: 'indices', detail: '多个目标索引', snippet: true, insertText: '"indices": ["${1:my-index}"]' },
    { label: 'alias', detail: '别名', snippet: true, insertText: '"alias": "${1:my-alias}"' },
    { label: 'aliases', detail: '多个别名', snippet: true, insertText: '"aliases": ["${1:my-alias}"]' },
    { label: 'must_exist', detail: '目标不存在时是否报错', snippet: true, insertText: '"must_exist": ${1|false,true|}' },
  ];
}

/** remove_index 动作的配置键（只认索引） */
export function aliasRemoveIndexConfigKeyItems(): AssistItem[] {
  return [
    { label: 'index', detail: '要删除的索引', snippet: true, insertText: '"index": "${1:my-index}"' },
    { label: 'indices', detail: '要删除的多个索引', snippet: true, insertText: '"indices": ["${1:my-index}"]' },
  ];
}

/** 别名动作体区域：根 actions / actions 元素动作键 / 各动作配置对象 / 更深层 */
export function aliasesBodyRegionAt(doc: string, offset: number):
  'root' | 'action' | 'config-add' | 'config-remove' | 'config-remove-index' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  if (stack.length === 3 && stack[0] === 'actions') return 'action';
  if (stack.length === 4 && stack[0] === 'actions') {
    if (stack[2] === 'add') return 'config-add';
    if (stack[2] === 'remove') return 'config-remove';
    if (stack[2] === 'remove_index') return 'config-remove-index';
  }
  return 'deep';
}

/** 游标翻页体（GET/POST /_search/scroll）：scroll 时长 + scroll_id */
export function scrollBodyKeyItems(): AssistItem[] {
  return [
    { label: 'scroll', detail: '保持游标的时长（如 1m/30s）', snippet: true, insertText: '"scroll": "${1:1m}"' },
    { label: 'scroll_id', detail: '上一页返回的游标 id', snippet: true, insertText: '"scroll_id": "${1:scroll-id}"' },
  ];
}

/** 清理游标体（DELETE/POST /_clear_scroll）：scroll_id（可传数组） */
export function clearScrollBodyKeyItems(): AssistItem[] {
  return [
    { label: 'scroll_id', detail: '要清理的游标 id（可数组）', snippet: true,
      insertText: '"scroll_id": ["${1:scroll-id}"]' },
  ];
}

/** 词项向量体（GET/POST /<索引>/_termvectors/<id>）的配置键 */
export function termvectorsKeyItems(): AssistItem[] {
  return [
    { label: 'fields', detail: '要统计的字段（数组）', snippet: true, insertText: '"fields": ["${1:field}"]' },
    { label: 'doc', detail: '直接给文档内容（不按 id 取）', snippet: true, insertText: '"doc": {\n  ${0}\n}' },
    { label: 'filter', detail: '词项过滤（频率/长度区间）', snippet: true,
      insertText: '"filter": {\n  "min_term_freq": ${1:1},\n  "max_num_terms": ${2:25}\n}' },
    { label: 'offsets', detail: '返回词项偏移', snippet: true, insertText: '"offsets": ${1|false,true|}' },
    { label: 'positions', detail: '返回词项位置', snippet: true, insertText: '"positions": ${1|false,true|}' },
    { label: 'term_statistics', detail: '返回词项全局统计', snippet: true, insertText: '"term_statistics": ${1|false,true|}' },
    { label: 'field_statistics', detail: '返回字段级统计', snippet: true, insertText: '"field_statistics": ${1|true,false|}' },
    { label: 'per_field_analyzer', detail: '按字段指定分词器', snippet: true,
      insertText: '"per_field_analyzer": {\n  "${1:field}": "${2:standard}"\n}' },
    { label: 'routing', detail: '取文档的路由值', snippet: true, insertText: '"routing": "${1:routing}"' },
    { label: 'version', detail: '期望版本', snippet: true, insertText: '"version": ${1:1}' },
    { label: 'version_type', detail: '版本类型', snippet: true, insertText: '"version_type": "${1|internal,external|}"' },
  ];
}

/** 多词项向量体的根键 */
export function mtermvectorsBodyKeyItems(): AssistItem[] {
  return [
    { label: 'docs', detail: '按 _index/_id 批量取词项向量', snippet: true,
      insertText: '"docs": [\n  {\n    "_index": "${1:my-index}",\n    "_id": "${2:1}"\n  }\n]' },
    { label: 'ids', detail: '按 id 批量取（索引由路径指定）', snippet: true, insertText: '"ids": ["${1:1}"]' },
  ];
}

/** 多词项向量体 docs[] 元素键：_index/_id + 单文档的全部配置键 */
export function mtermvectorsDocKeyItems(): AssistItem[] {
  return [
    { label: '_index', detail: '文档所在索引（路径无索引时必填）', snippet: true, insertText: '"_index": "${1:my-index}"' },
    { label: '_id', detail: '文档 id', snippet: true, insertText: '"_id": "${1:1}"' },
    ...termvectorsKeyItems(),
  ];
}

/* 结构体根键清单——与补全目录同源（目录改名时 lint 白名单自动跟随），
   DevTools dtLint 对未知根键给「ES 会拒绝」告警。 */
export const updateBodyRootKeys = updateBodyKeyItems().map(i => i.label);
export const rolloverBodyRootKeys = rolloverBodyKeyItems().map(i => i.label);
export const rolloverConditionKeys = rolloverConditionKeyItems().map(i => i.label);
export const dbqBodyRootKeys = dbqBodyKeyItems().map(i => i.label);
export const ubqBodyRootKeys = ubqBodyKeyItems().map(i => i.label);
export const queryOnlyBodyRootKeys = queryOnlyBodyKeyItems().map(i => i.label);
export const templateSearchBodyRootKeys = templateSearchBodyKeyItems().map(i => i.label);
export const sqlBodyRootKeys = sqlBodyKeyItems().map(i => i.label);
export const mgetBodyRootKeys = mgetBodyKeyItems().map(i => i.label);
export const storedScriptBodyRootKeys = storedScriptBodyKeyItems().map(i => i.label);
export const scriptExecuteBodyRootKeys = scriptExecuteBodyKeyItems().map(i => i.label);
export const aliasesBodyRootKeys = aliasesBodyKeyItems().map(i => i.label);
export const scrollBodyRootKeys = scrollBodyKeyItems().map(i => i.label);
export const clearScrollBodyRootKeys = clearScrollBodyKeyItems().map(i => i.label);
export const termvectorsBodyRootKeys = termvectorsKeyItems().map(i => i.label);
export const mtermvectorsBodyRootKeys = mtermvectorsBodyKeyItems().map(i => i.label);
export const reindexBodyRootKeys = reindexBodyKeyItems('root').map(i => i.label);
export const fieldCapsBodyRootKeys = fieldCapsBodyKeyItems().map(i => i.label);
export const termsEnumBodyRootKeys = termsEnumBodyKeyItems().map(i => i.label);
export const rankEvalBodyRootKeys = rankEvalBodyKeyItems().map(i => i.label);
export const eqlBodyRootKeys = eqlBodyKeyItems().map(i => i.label);
export const clusterSettingsBodyRootKeys = clusterSettingsBodyKeyItems().map(i => i.label);
export const rerouteBodyRootKeys = rerouteBodyKeyItems().map(i => i.label);
export const allocationExplainBodyRootKeys = allocationExplainBodyKeyItems().map(i => i.label);
export const snapshotRepoBodyRootKeys = snapshotRepoBodyKeyItems().map(i => i.label);
export const snapshotCreateBodyRootKeys = snapshotCreateBodyKeyItems().map(i => i.label);
export const snapshotRestoreBodyRootKeys = snapshotRestoreBodyKeyItems().map(i => i.label);
export const slmPolicyBodyRootKeys = slmPolicyBodyKeyItems().map(i => i.label);
export const slmConfigKeys = slmConfigKeyItems().map(i => i.label);
export const slmRetentionKeys = slmRetentionKeyItems().map(i => i.label);
export const ilmPolicyBodyRootKeys = ilmPolicyBodyKeyItems().map(i => i.label);
export const ilmPolicyKeys = ilmPolicyKeyItems().map(i => i.label);
export const ilmActionKeys = [...ILM_ACTIONS];
export const watchBodyRootKeys = watchBodyKeyItems().map(i => i.label);
export const securityRoleBodyRootKeys = securityRoleBodyKeyItems().map(i => i.label);
export const securityRoleIndexKeys = securityRoleIndexKeyItems().map(i => i.label);
export const securityRoleFieldSecurityKeys = securityRoleFieldSecurityKeyItems().map(i => i.label);
export const securityRoleAppKeys = securityRoleAppKeyItems().map(i => i.label);
export const securityUserBodyRootKeys = securityUserBodyKeyItems().map(i => i.label);
export const securityRoleTemplateKeys = securityRoleTemplateKeyItems().map(i => i.label);
export const securityRoleMappingBodyRootKeys = securityRoleMappingBodyKeyItems().map(i => i.label);
export const securityApiKeyBodyRootKeys = securityApiKeyBodyKeyItems().map(i => i.label);
export const ingestPipelineBodyRootKeys = ingestPipelineBodyKeyItems().map(i => i.label);
export const ingestProcessorLintKeys = [...INGEST_PROCESSOR_TYPES, ...INGEST_PROCESSOR_COMMON_KEYS];
export const ingestSimulateBodyRootKeys = ingestSimulateBodyKeyItems().map(i => i.label);
export const ingestSimulateDocKeys = ingestSimulateDocKeyItems().map(i => i.label);
export const enrichPolicyBodyRootKeys = enrichPolicyBodyKeyItems().map(i => i.label);
export const enrichMatchKeys = enrichMatchPolicyKeyItems().map(i => i.label);
export const enrichRangeKeys = enrichRangePolicyKeyItems().map(i => i.label);
export const transformBodyRootKeys = transformBodyKeyItems().map(i => i.label);
export const transformSourceKeys = transformSourceKeyItems().map(i => i.label);
export const transformDestKeys = transformDestKeyItems().map(i => i.label);
export const transformPivotKeys = transformPivotKeyItems().map(i => i.label);
export const transformSyncKeys = transformTimeKeyItems('sync').map(i => i.label);
export const transformSyncTimeKeys = transformTimeConfigKeyItems('sync').map(i => i.label);
export const transformRetentionKeys = transformTimeKeyItems('retention').map(i => i.label);
export const transformRetentionTimeKeys = transformTimeConfigKeyItems('retention').map(i => i.label);
export const rollupJobBodyRootKeys = rollupJobBodyKeyItems().map(i => i.label);
export const rollupGroupKeys = rollupGroupsKeyItems().map(i => i.label);
export const rollupDateGroupKeys = rollupDateGroupKeyItems().map(i => i.label);
export const rollupTermsGroupKeys = rollupFieldGroupKeyItems('terms').map(i => i.label);
export const rollupHistogramGroupKeys = rollupFieldGroupKeyItems('histogram').map(i => i.label);
export const rollupMetricKeys = rollupMetricKeyItems().map(i => i.label);
export const mlDatafeedBodyRootKeys = mlDatafeedBodyKeyItems().map(i => i.label);
export const mlDelayedKeys = mlDelayedCheckKeyItems().map(i => i.label);
export const mlChunkingKeys = mlChunkingKeyItems().map(i => i.label);
export const mlIndicesOptionsKeys = mlIndicesOptionsKeyItems().map(i => i.label);
export const mlJobBodyRootKeys = mlJobBodyKeyItems().map(i => i.label);
export const mlAnalysisConfigKeys = mlAnalysisConfigKeyItems().map(i => i.label);
export const mlDetectorKeys = mlDetectorKeyItems().map(i => i.label);
export const mlAnalysisLimitsKeys = mlAnalysisLimitsKeyItems().map(i => i.label);
export const mlDataDescriptionKeys = mlDataDescriptionKeyItems().map(i => i.label);
export const mlFilterBodyRootKeys = mlFilterBodyKeyItems().map(i => i.label);
export const mlCalendarBodyRootKeys = mlCalendarBodyKeyItems().map(i => i.label);
export const mlCalendarEventsBodyRootKeys = mlCalendarEventsBodyKeyItems().map(i => i.label);
export const mlCalendarEventKeys = mlCalendarEventKeyItems().map(i => i.label);
export const graphExploreBodyRootKeys = graphExploreBodyKeyItems().map(i => i.label);
export const graphVertexKeys = graphVertexKeyItems().map(i => i.label);
export const graphControlsKeys = graphControlsKeyItems().map(i => i.label);
export const graphSampleDiversityKeys = graphSampleDiversityKeyItems().map(i => i.label);
export const graphHopKeys = graphHopKeyItems().map(i => i.label);
export const ccrFollowBodyRootKeys = ccrFollowBodyKeyItems().map(i => i.label);
export const ccrAutoFollowBodyRootKeys = ccrAutoFollowBodyKeyItems().map(i => i.label);
export const securityApiKeyGrantBodyRootKeys = securityApiKeyGrantBodyKeyItems().map(i => i.label);
export const securityApiKeyGrantKeys = securityApiKeyGrantKeyItems().map(i => i.label);
export const licenseBodyRootKeys = licenseBodyKeyItems().map(i => i.label);
export const licenseEntryKeys = licenseEntryKeyItems().map(i => i.label);
export const securityApiKeyQueryBodyRootKeys = securityApiKeyQueryBodyKeyItems().map(i => i.label);
export const securityApiKeyInvalidateBodyRootKeys = securityApiKeyInvalidateBodyKeyItems().map(i => i.label);
export const mlFilterUpdateBodyRootKeys = mlFilterUpdateBodyKeyItems().map(i => i.label);
export const securityCrossClusterApiKeyBodyRootKeys = securityCrossClusterApiKeyBodyKeyItems().map(i => i.label);
export const securityCrossClusterAccessKeys = securityCrossClusterAccessKeyItems().map(i => i.label);
export const securityCrossClusterAccessEntryKeys = securityCrossClusterAccessEntryKeyItems().map(i => i.label);
export const watchExecuteBodyRootKeys = watchExecuteBodyKeyItems().map(i => i.label);
export const securityPrivilegeEntryKeys = securityPrivilegeEntryKeyItems().map(i => i.label);
export const ilmMoveBodyRootKeys = ilmMoveBodyKeyItems().map(i => i.label);
export const ilmMoveStepKeys = ilmMoveStepKeyItems().map(i => i.label);
export const snapshotCloneBodyRootKeys = snapshotCloneBodyKeyItems().map(i => i.label);
export const watchInlineExecuteBodyRootKeys = watchInlineExecuteBodyKeyItems().map(i => i.label);
export const snapshotMountBodyRootKeys = snapshotMountBodyKeyItems().map(i => i.label);
export const nodesReloadSecureSettingsBodyRootKeys = nodesReloadSecureSettingsBodyKeyItems().map(i => i.label);

/** 重建索引体（POST /_reindex）的区域：根层 / source 体 / dest 体；更深层（source.query、
    source.sort 元素等）返回 'deep'——那些位置给本表键是误导，直接不出档。 */
export function reindexBodyRegionAt(doc: string, offset: number):
  'root' | 'source' | 'dest' | 'script' | 'query' | 'sort' | 'source-fields' | 'deep' {
  const stack = frameKeysAt(doc, offset);
  if (stack.length <= 1) return 'root';
  const k0 = stack[0];
  if (k0 === 'source') {
    if (stack.length === 2) return 'source';
    /* 1439：source.query 内是整棵 Query DSL——回落到查询补全，不再当深层压掉 */
    if (stack[1] === 'query') return 'query';
    /* 1439：source.sort / source._source 的**串元素**位是字段名位；对象元素位不出档 */
    if (stack[1] === 'sort') return stack.length === 3 ? 'sort' : 'deep';
    if (stack[1] === '_source') return stack.length === 3 ? 'source-fields' : 'deep';
    return 'deep';
  }
  if (k0 === 'dest') return stack.length === 2 ? 'dest' : 'deep';
  /* 1439：根层 script 对象给脚本键（source/lang/params/id） */
  if (k0 === 'script') return stack.length === 2 ? 'script' : 'deep';
  return 'root';
}

/** 重建索引体的键（根层 / source 体 / dest 体 / script 对象四档） */
export function reindexBodyKeyItems(region: 'root' | 'source' | 'dest' | 'script' | 'query' | 'sort' | 'source-fields' | 'deep'): AssistItem[] {
  if (region === 'deep' || region === 'query' || region === 'sort' || region === 'source-fields') return [];
  if (region === 'script') return scriptObjectKeyItems();
  if (region === 'source') {
    return [
      { label: 'index', detail: '源索引（可写单名或数组）', snippet: true, insertText: '"index": "${1:src-index}"' },
      { label: 'query', detail: '只重建命中的文档（查询体）', snippet: true, insertText: '"query": {\n  ${0}\n}' },
      { label: 'size', detail: '每批处理的文档数', snippet: true, insertText: '"size": ${1:1000}' },
      { label: '_source', detail: '取哪些源字段', snippet: true, insertText: '"_source": ["${1:field}"]' },
      { label: 'sort', detail: '处理顺序', snippet: true, insertText: '"sort": [\n  ${0}\n]' },
      { label: 'remote', detail: '跨集群重建（远端连接与索引）', snippet: true, insertText: '"remote": {\n  "host": "${1:http://remote:9200}"\n}' },
    ];
  }
  if (region === 'dest') {
    return [
      { label: 'index', detail: '目标索引名', snippet: true, insertText: '"index": "${1:dst-index}"' },
      { label: 'op_type', detail: '写入形态（create=已存在则失败）', snippet: true, insertText: '"op_type": "${1|index,create|}"' },
      { label: 'pipeline', detail: '写入管道', snippet: true, insertText: '"pipeline": "${1:pipeline}"' },
      { label: 'routing', detail: '写入路由', snippet: true, insertText: '"routing": "${1:routing}"' },
      { label: 'version_type', detail: '版本冲突策略', snippet: true, insertText: '"version_type": "${1|internal,external|}"' },
    ];
  }
  return [
    { label: 'source', detail: '源索引与查询', snippet: true,
      insertText: '"source": {\n  "index": "${1:src-index}"\n}' },
    { label: 'dest', detail: '目标索引', snippet: true,
      insertText: '"dest": {\n  "index": "${1:dst-index}"\n}' },
    { label: 'script', detail: '重建时改写文档的脚本', snippet: true, insertText: '"script": {\n  ${0}\n}' },
    { label: 'conflicts', detail: '版本冲突处理（proceed 覆盖 / abort 中止）', snippet: true, insertText: '"conflicts": "${1|proceed,abort|}"' },
    { label: 'max_docs', detail: '最多重建多少条', snippet: true, insertText: '"max_docs": ${1:1000}' },
    { label: 'size', detail: '每批处理的文档数', snippet: true, insertText: '"size": ${1:1000}' },
  ];
}

/** 光标是否在「某个别名的配置对象」里（aliases.<名>.{}）——命名位不出键档 */
export function aliasConfigAt(doc: string, offset: number): boolean {
  const stack = frameKeysAt(doc, offset);
  if (stack.length < 3) return false;
  return stack[stack.length - 3] === 'aliases' && !!stack[stack.length - 2];
}

/* ux2 ：index_template / component_template body 键档（TemplatesView editBody 用）。
 八键全 snippet 骨架——模板 body 键集封闭且层级固定，骨架比裸键名省事；
 component_template 同用（其 body={ template: {...} } 子集，容器骨架兼容）。 */
export function templateKeyItems(): AssistItem[] {
  return [
    { label: 'index_patterns', detail: '索引名匹配模式（新索引自动套用本模板）', snippet: true,
      insertText: '"index_patterns": ["${1:logs-*}"]' },
    { label: 'priority', detail: '模板优先级（多模板命中时大者胜）', snippet: true,
      insertText: '"priority": ${1:100}' },
    { label: 'template', detail: '模板主体容器（settings/mappings/aliases 都装在这里面）', snippet: true,
      insertText: '"template": {\n  "settings": {\n    "${1:number_of_shards}": "${2:1}"\n  },\n  "mappings": {\n    "properties": {\n      "${3:field}": { "type": "${4:keyword}" }\n    }\n  }\n}' },
    { label: 'settings', detail: '索引设置容器（number_of_shards/number_of_replicas 等）', snippet: true,
      insertText: '"settings": {\n  "number_of_shards": "${1:1}",\n  "number_of_replicas": "${2:1}"\n}' },
    { label: 'mappings', detail: '字段映射容器（properties 结构）', snippet: true,
      insertText: '"mappings": {\n  "properties": {\n    "${1:field}": { "type": "${2:keyword}" }\n  }\n}' },
    { label: 'aliases', detail: '索引别名容器（新索引自动挂别名）', snippet: true,
      insertText: '"aliases": {\n  "${1:alias}": {}\n}' },
    { label: 'composed_of', detail: '组合 component_template 名清单（按序叠加）', snippet: true,
      insertText: '"composed_of": ["${1:component-template}"]' },
    { label: 'data_stream', detail: '开启数据流（模板命中建为 data stream）', snippet: true,
      insertText: '"data_stream": {}' },
    { label: 'version', detail: '模板版本号（便于识别迭代）', snippet: true, insertText: '"version": ${1:1}' },
    { label: '_meta', detail: '模板自定义元数据（用途/负责人等备注）', snippet: true,
      insertText: '"_meta": {\n  "${1:description}": "${2:用途说明}"\n}' },
  ];
}

/* 2.6.0 逗号自适应（spec ）：补全 insertText 的前/后逗号由上下文定。
 prefix：range 起点左扫跳空白——'{'/'['/','/文首 → ''；其余（'}'/']'/闭合串/字面量）→ ','。
 suffix：range 终点右扫跳空白——'"'（后跟兄弟键）→ ','；'}'/']'/EOF/残缺 → ''（宁缺毋滥，绝不产 trailing comma）。
 调用方保证光标在键位（dslKeyGuard 已压值位/数组裸元素位），故 ':' 左邻落「其余补前逗号」分支不可达。
 JSONC 注释透明：左/右扫均跳过行注释与块注释（字符串内不算，见 commentEnd 调用前置 inStr）。 */
function prevCodeChar(doc: string, start: number): string {
  let left = '';
  let inStr = false;
  for (let i = 0; i < start; i++) {
    const ch = doc[i];
    if (inStr) {
      if (ch === '"' && !isEscapedQuote(doc, i)) { inStr = false; left = '"'; }
      continue;
    }
    const cEnd = commentEnd(doc, i);
    if (cEnd !== -1) { i = cEnd - 1; continue; }
    if (ch === '"') { inStr = true; continue; }
    if (/\s/.test(ch)) continue;
    left = ch;
  }
  return left;
}
function nextCodeChar(doc: string, start: number): string {
  for (let i = start; i < doc.length; i++) {
    if (/\s/.test(doc[i])) continue;
    const cEnd = commentEnd(doc, i);
    if (cEnd !== -1) { i = cEnd - 1; continue; }
    return doc[i];
  }
  return '';
}
export function commaAffixes(doc: string, start: number, end: number): { prefix: string; suffix: string } {
  const left = prevCodeChar(doc, Math.max(0, start));
  const prefix = (left === '' || left === '{' || left === '[' || left === ',') ? '' : ',';
  const right = nextCodeChar(doc, Math.max(0, Math.min(end, doc.length)));
  const suffix = right === '"' ? ',' : '';
  return { prefix, suffix };
}
