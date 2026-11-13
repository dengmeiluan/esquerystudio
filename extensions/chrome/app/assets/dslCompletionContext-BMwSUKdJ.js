import{bH as v,bI as D,bJ as G,bK as Y,bL as H,bM as Q,bN as W,bO as V,bP as J,bQ as Z}from"./index-Be6PRRUV.js";const R=[{key:"refresh_interval",desc:"刷新间隔",example:"1s / 30s / -1（禁用）",dynamic:!0},{key:"number_of_replicas",desc:"副本数",example:"0 / 1 / 2",dynamic:!0},{key:"auto_expand_replicas",desc:"副本自动扩展（随数据节点数伸缩）",example:"0-1 / 0-all / false",dynamic:!0},{key:"priority",desc:"恢复优先级（越大越先恢复）",example:"1 / 10",dynamic:!0},{key:"hidden",desc:"隐藏索引（通配符查询不匹配）",example:"true / false",dynamic:!0},{key:"max_result_window",desc:"深分页窗口上限",example:"10000",dynamic:!0},{key:"max_inner_result_window",desc:"inner_hits 深分页窗口上限",example:"100",dynamic:!0},{key:"max_script_fields",desc:"单次查询 script_fields 上限",example:"32",dynamic:!0},{key:"max_terms_count",desc:"terms 查询最大词数",example:"65536",dynamic:!0},{key:"max_regex_length",desc:"regexp 查询正则长度上限",example:"1000",dynamic:!0},{key:"highlight.max_analyzed_offset",desc:"高亮分析长度上限",example:"1000000",dynamic:!0},{key:"blocks.read_only",desc:"整索引只读（含元数据）",example:"true / false",dynamic:!0},{key:"blocks.read_only_allow_delete",desc:"只读但允许删除（磁盘水位保护用）",example:"true / false",dynamic:!0},{key:"blocks.write",desc:"禁写（允许读与元数据变更）",example:"true / false",dynamic:!0},{key:"blocks.read",desc:"禁读",example:"true / false",dynamic:!0},{key:"blocks.metadata",desc:"禁读写元数据",example:"true / false",dynamic:!0},{key:"routing.allocation.enable",desc:"分片分配开关",example:"all / none / primaries / new_primaries",dynamic:!0},{key:"routing.allocation.total_shards_per_node",desc:"单节点分片上限",example:"100",dynamic:!0},{key:"gc_deletes",desc:"删除墓碑保留时长（防版本号冲突）",example:"60s / 30s",dynamic:!0},{key:"soft_deletes.retention_lease.period",desc:"软删除保留租约（增量恢复窗口）",example:"12h / 24h",dynamic:!0},{key:"translog.durability",desc:"translog 持久化策略",example:"request / async",dynamic:!0},{key:"translog.sync_interval",desc:"async 模式下 translog 刷盘间隔",example:"5s / 30s",dynamic:!0},{key:"merge.policy.segments_per_tier",desc:"每层段数（合并策略，调小查询更快）",example:"10",dynamic:!0},{key:"merge.policy.max_merged_segment",desc:"最大合并段大小",example:"5gb",dynamic:!0},{key:"indexing.slowlog.threshold.index.warn",desc:"索引慢日志 warn 阈值",example:"10s",dynamic:!0},{key:"indexing.slowlog.threshold.index.info",desc:"索引慢日志 info 阈值",example:"5s",dynamic:!0},{key:"search.slowlog.threshold.query.warn",desc:"查询慢日志 warn 阈值",example:"10s",dynamic:!0},{key:"search.slowlog.threshold.fetch.warn",desc:"fetch 阶段慢日志 warn 阈值",example:"1s",dynamic:!0},{key:"mapping.total_fields.limit",desc:"字段总数上限（防 mapping 爆炸）",example:"1000 / 2000",dynamic:!0},{key:"mapping.nested_objects.limit",desc:"单文档嵌套对象数上限",example:"10000",dynamic:!0},{key:"mapping.depth.limit",desc:"字段嵌套深度上限",example:"20",dynamic:!0},{key:"unassigned.node_left.delayed_timeout",desc:"节点离线后副本延迟恢复时长（防分片风暴，到点才真正重建）",example:"1d / 5d",dynamic:!0},{key:"max_refresh_listeners",desc:"刷新监听并发上限（等待新可见点的请求排队额度）",example:"1000 / -1（不限）",dynamic:!0},{key:"default_pipeline",desc:"默认 ingest 管道（写入自动走该管道加工，_none 关闭）",example:"my-pipeline / _none",dynamic:!0},{key:"final_pipeline",desc:"最终 ingest 管道（default_pipeline 之后兜底执行）",example:"my-pipeline / _none",dynamic:!0},{key:"lifecycle.name",desc:"索引挂接的 ILM 生命周期策略名",example:"logs-policy / _none",dynamic:!0},{key:"lifecycle.rollover_alias",desc:"ILM rollover 使用的写别名",example:"logs-alias",dynamic:!0},{key:"merge.scheduler.max_thread_count",desc:"段合并线程数上限（机械盘调小防拖垮 IO）",example:"1 / 4",dynamic:!0},{key:"number_of_shards",desc:"主分片数（静态，建索引后不可改）",example:"1 / 3",dynamic:!1},{key:"codec",desc:"存储压缩算法",example:"default / best_compression",dynamic:!1},{key:"analysis.analyzer.*",desc:"自定义分析器（建索引时或 closed 状态设置）",example:'{"type":"custom","tokenizer":"standard"}',dynamic:!1},{key:"soft_deletes.enabled",desc:"软删除开关（建索引时定，影响增量恢复/CCR）",example:"true（默认）/ false",dynamic:!1},{key:"sort.field",desc:"默认排序字段（index.sort.field，静态建索引时定）",example:"ts",dynamic:!1},{key:"sort.order",desc:"默认排序方向（index.sort.order，与 sort.field 配套）",example:"asc / desc",dynamic:!1},{key:"store.type",desc:"存储类型（建索引时定，open 索引不可改）",example:"fs / niofs / mmapfs / hybridfs",dynamic:!1}],X=[{key:"cluster.routing.allocation.enable",desc:"分片分配开关",example:"all / primaries / new_primaries / replicas / none",dynamic:!0},{key:"cluster.routing.rebalance.enable",desc:"分片再平衡开关",example:"all / primaries / replicas / none",dynamic:!0},{key:"cluster.routing.allocation.awareness.attributes",desc:"机架/可用区感知属性（强制副本跨属性分布）",example:"rack_id / zone",dynamic:!0},{key:"cluster.routing.allocation.disk.threshold_enabled",desc:"磁盘水位保护开关",example:"true / false",dynamic:!0},{key:"cluster.routing.allocation.disk.watermark.low",desc:"磁盘低水位（低于此值不再分配新分片）",example:"85% / 100gb",dynamic:!0},{key:"cluster.routing.allocation.disk.watermark.high",desc:"磁盘高水位（高于此值开始迁出分片）",example:"90% / 50gb",dynamic:!0},{key:"cluster.routing.allocation.disk.watermark.flood_stage",desc:"磁盘洪泛水位（超限索引转只读，清盘后须手工解除）",example:"95% / 20gb",dynamic:!0},{key:"cluster.max_shards_per_node",desc:"单节点分片总数上限（含 closed 索引，防分片爆炸）",example:"1000",dynamic:!0},{key:"cluster.blocks.read_only",desc:"整个集群只读（升级/救援用，用完记得置 null 回退）",example:"true / false",dynamic:!0},{key:"indices.recovery.max_bytes_per_sec",desc:"恢复/重建拷贝限速（0 = 不限）",example:"40mb / 200mb / 0",dynamic:!0},{key:"indices.breaker.total.limit",desc:"总断路器内存上限（真实内存口径）",example:"70% / 95%",dynamic:!0},{key:"indices.breaker.fielddata.limit",desc:"fielddata 断路器堆占比上限",example:"40%",dynamic:!0},{key:"indices.breaker.request.limit",desc:"request 断路器堆占比上限",example:"60%",dynamic:!0},{key:"indices.queries.cache.size",desc:"节点查询缓存堆占比上限",example:"10%",dynamic:!0},{key:"indices.fielddata.cache.size",desc:"fielddata 堆缓存占比上限（默认无界，建议显式设限防 OOM）",example:"20% / 40%",dynamic:!0},{key:"cluster.routing.allocation.balance.index",desc:"按索引均衡权重因子（各索引在节点间的分片数拉平倾向，默认 0.5）",example:"0.5",dynamic:!0},{key:"cluster.routing.allocation.balance.shard",desc:"按总分片数均衡权重因子（节点总分片数拉平倾向，默认 0.45）",example:"0.45",dynamic:!0},{key:"search.max_buckets",desc:"单次请求聚合桶数上限（防大聚合拖垮节点）",example:"65536 / 100000",dynamic:!0},{key:"search.default_search_timeout",desc:"搜索默认超时（-1 = 不限，慎用）",example:"30s / -1",dynamic:!0},{key:"action.destructive_requires_name",desc:"删除索引禁用通配符（必须显式索引名，防误删）",example:"true / false",dynamic:!0},{key:"action.auto_create_index",desc:"写入时自动建索引白名单（false 全禁）",example:"true / false / +logs*,-secret*",dynamic:!0},{key:"logger.org.elasticsearch",desc:"ES 主日志级别临时调整（排查完记得还原）",example:"DEBUG / INFO / WARN",dynamic:!0},{key:"logger.org.elasticsearch.discovery",desc:"ES discovery 子日志级别临时调整",example:"DEBUG / INFO / WARN",dynamic:!0},{key:"discovery.zen.minimum_master_nodes",desc:"主节点法定数（7.x 遗留键：已由集群自动维护，一般无需手设）",example:"2 / -1",dynamic:!1}];function Zt(t){const n=(t||"").toLowerCase();return R.filter(e=>!n||e.key.toLowerCase().includes(n)||e.desc.toLowerCase().includes(n)).sort((e,a)=>{const r=e.key.toLowerCase().startsWith(n)?0:1,s=a.key.toLowerCase().startsWith(n)?0:1;return r-s||e.key.localeCompare(a.key)}).slice(0,30)}const Xt={match:'"match": {\n  "${1:field}": "${2:value}"\n}',match_phrase:'"match_phrase": {\n  "${1:field}": "${2:value}"\n}',term:'"term": {\n  "${1:field}": "${2:value}"\n}',terms:'"terms": {\n  "${1:field}": ["${2:value}"]\n}',range:`"range": {
  "\${1:field}": {
    "gte": "\${2:now-1d/d}",
    "lt": "\${3:now/d}"
  }
}`,exists:`"exists": {
  "field": "\${1:field}"
}`,wildcard:'"wildcard": {\n  "${1:field}": "${2:pref*}"\n}',bool:`"bool": {
  "must": [
    \${0}
  ],
  "filter": [],
  "should": [],
  "must_not": []
}`,match_all:'"match_all": {}',match_none:'"match_none": {}',match_phrase_prefix:'"match_phrase_prefix": {\n  "${1:field}": "${2:value}"\n}',prefix:'"prefix": {\n  "${1:field}": "${2:prefix}"\n}',regexp:'"regexp": {\n  "${1:field}": "${2:pattern.*}"\n}',fuzzy:`"fuzzy": {
  "\${1:field}": {
    "value": "\${2:value}"
  }
}`,match_bool_prefix:'"match_bool_prefix": {\n  "${1:field}": "${2:value}"\n}',terms_set:'"terms_set": {\n  "${1:field}": ["${2:value}"],\n  "minimum_should_match_field": "${3:countField}"\n}',bitmap_terms:`"bitmap_terms": {
  "field": "\${1:field}",
  "value": "\${2:value}"
}`,multi_match:`"multi_match": {
  "query": "\${1:value}",
  "fields": ["\${2:field}"]
}`,query_string:`"query_string": {
  "query": "\${1:value}",
  "default_field": "\${2:field}"
}`,simple_query_string:`"simple_query_string": {
  "query": "\${1:value}",
  "fields": ["\${2:field}"]
}`,combined_fields:`"combined_fields": {
  "query": "\${1:value}",
  "fields": ["\${2:field}"]
}`,more_like_this:`"more_like_this": {
  "fields": ["\${1:field}"],
  "like": "\${2:text}"
}`,intervals:`"intervals": {
  "\${1:field}": {
    "match": { "query": "\${2:value}" }
  }
}`,ids:`"ids": {
  "values": ["\${1:id}"]
}`,rank_feature:`"rank_feature": {
  "field": "\${1:rankField}",
  "boost": \${2:1}
}`,distance_feature:`"distance_feature": {
  "field": "\${1:dateField}",
  "pivot": "\${2:7d}",
  "origin": "\${3:now}"
}`,semantic:`"semantic": {
  "field": "\${1:semanticField}",
  "query": "\${2:text}"
}`,sparse_vector:`"sparse_vector": {
  "field": "\${1:vectorField}",
  "query_vector": {}
}`,knn:`"knn": {
  "field": "\${1:vectorField}",
  "query_vector": [],
  "k": \${2:10},
  "num_candidates": \${3:100}
}`,text_expansion:`"text_expansion": {
  "\${1:sparseField}": {
    "model_id": "\${2:model}",
    "model_text": "\${3:text}"
  }
}`,weighted_tokens:`"weighted_tokens": {
  "\${1:sparseField}": {
    "tokens": { "\${2:token}": \${3:0.5} }
  }
}`,geo_distance:'"geo_distance": {\n  "distance": "${1:10km}",\n  "${2:location}": { "lat": ${3:39.9}, "lon": ${4:116.4} }\n}',geo_bounding_box:'"geo_bounding_box": {\n  "${1:location}": {\n    "top_left": { "lat": ${2:40}, "lon": ${3:116} },\n    "bottom_right": { "lat": ${4:39}, "lon": ${5:117} }\n  }\n}',geo_polygon:`"geo_polygon": {
  "\${1:location}": {
    "points": [
      { "lat": \${2:39}, "lon": \${3:116} },
      { "lat": \${4:40}, "lon": \${5:117} }
    ]
  }
}`,geo_shape:`"geo_shape": {
  "\${1:location}": {
    "shape": { "type": "point", "coordinates": [\${2:116.4}, \${3:39.9}] },
    "relation": "intersects"
  }
}`,geo_grid:'"geo_grid": {\n  "${1:location}": { "${2|geohash,geotile,geohex|}": "${3:u0}" }\n}',shape:`"shape": {
  "\${1:shapeField}": {
    "shape": { "type": "point", "coordinates": [\${2:116.4}, \${3:39.9}] },
    "relation": "intersects"
  }
}`,nested:'"nested": {\n  "path": "${1:path}",\n  "query": { "match": { "${2:field}": "${3:value}" } }\n}',has_child:`"has_child": {
  "type": "\${1:childType}",
  "query": { "match_all": {} }
}`,has_parent:`"has_parent": {
  "parent_type": "\${1:parentType}",
  "query": { "match_all": {} }
}`,parent_id:`"parent_id": {
  "type": "\${1:parentType}",
  "id": "\${2:parentId}"
}`,constant_score:`"constant_score": {
  "filter": { "match_all": {} },
  "boost": \${2:1}
}`,function_score:`"function_score": {
  "query": { "match_all": {} },
  "functions": [
    { "weight": \${1:1} }
  ],
  "boost_mode": "multiply"
}`,script_score:`"script_score": {
  "query": { "match_all": {} },
  "script": { "source": "\${1:params.factor}" },
  "min_score": \${2:0}
}`,dis_max:`"dis_max": {
  "queries": [
    { "match_all": {} }
  ],
  "tie_breaker": \${2:0.7}
}`,boosting:`"boosting": {
  "positive": { "match_all": {} },
  "negative": { "match_none": {} },
  "negative_boost": \${3:0.5}
}`,pinned:`"pinned": {
  "ids": ["\${1:id}"],
  "organic": { "match_all": {} }
}`,span_near:`"span_near": {
  "clauses": [
    { "span_term": { "\${1:field}": { "term": "\${2:value}" } } }
  ],
  "slop": \${3:1},
  "in_order": true
}`,span_or:`"span_or": {
  "clauses": [
    { "span_term": { "\${1:field}": { "term": "\${2:value}" } } }
  ]
}`,span_not:'"span_not": {\n  "include": { "span_term": { "${1:field}": { "term": "${2:value}" } } },\n  "exclude": { "span_term": { "${3:field2}": { "term": "${4:value2}" } } }\n}',span_first:'"span_first": {\n  "match": { "span_term": { "${1:field}": { "term": "${2:value}" } } },\n  "end": ${3:3}\n}',span_containing:`"span_containing": {
  "little": { "span_term": { "\${1:field}": { "term": "\${2:value}" } } },
  "big": { "span_near": { "clauses": [], "slop": 1, "in_order": true } }
}`,span_within:`"span_within": {
  "little": { "span_term": { "\${1:field}": { "term": "\${2:value}" } } },
  "big": { "span_near": { "clauses": [], "slop": 1, "in_order": true } }
}`,span_term:'"span_term": {\n  "${1:field}": { "term": "${2:value}" }\n}',span_gap:'"span_gap": {\n  "${1:field}": ${2:1}\n}',span_multi:'"span_multi": {\n  "match": { "prefix": { "${1:field}": "${2:value}" } }\n}',span_field_masking:'"span_field_masking": {\n  "query": { "span_term": { "${1:field}": { "term": "${2:value}" } } },\n  "field": "${3:maskField}"\n}',percolate:'"percolate": {\n  "field": "${1:queryField}",\n  "document": { "${2:field}": "${3:value}" }\n}',script:`"script": {
  "script": { "source": "doc['\${1:field}'].value > 0" }
}`,wrapper:`"wrapper": {
  "query": "\${1:base64}"
}`,rule:'"rule": {\n  "ruleset_id": "${1:ruleset}",\n  "match_criteria": { "${2:field}": "${3:value}" }\n}',type:`"type": {
  "value": "\${1:docType}"
}`,template:`"template": {
  "id": "\${1:templateId}",
  "params": {}
}`};function ei(t){return t==="bool"?"布尔组合":V(t)}const ee={gte:"now-1d/d",gt:"now-1d/d",lt:"now/d",lte:"now/d"},ti={terms:{text:`"terms": {
  "field": "\${1:field}",
  "size": \${2:10}
}`,detail:"分组统计（按字段值分桶）"},avg:{text:'"avg": { "field": "${1:field}" }',detail:"平均值"},sum:{text:'"sum": { "field": "${1:field}" }',detail:"求和"},min:{text:'"min": { "field": "${1:field}" }',detail:"最小值"},max:{text:'"max": { "field": "${1:field}" }',detail:"最大值"},stats:{text:'"stats": { "field": "${1:field}" }',detail:"count/min/max/avg/sum 一次全出"},cardinality:{text:'"cardinality": { "field": "${1:field}" }',detail:"去重计数"},date_histogram:{text:`"date_histogram": {
  "field": "\${1:dateField}",
  "calendar_interval": "\${2|1d,1h,1w,1M|}"
}`,detail:"时间直方图（按间隔分桶）"},date_range:{text:`"date_range": {
  "field": "\${1:dateField}",
  "ranges": [
    { "from": "\${2:now-7d/d}", "to": "\${3:now/d}" }
  ]
}`,detail:"时间范围分桶"},top_hits:{text:`"top_hits": {
  "size": \${1:3},
  "sort": [
    { "\${2:field}": { "order": "\${3:desc}" } }
  ]
}`,detail:"每桶取 TopN 文档"},aggs:{text:`"aggs": {
  \${0}
}`,detail:"嵌套子聚合"},value_count:{text:'"value_count": { "field": "${1:field}" }',detail:"计数（含重复）"},percentiles:{text:'"percentiles": { "field": "${1:field}", "percents": [${2:50}, ${3:95}] }',detail:"分位数"},percentile_ranks:{text:'"percentile_ranks": { "field": "${1:field}", "values": [${2:50}] }',detail:"给定值的百分位排名"},extended_stats:{text:'"extended_stats": { "field": "${1:field}" }',detail:"扩展统计（含方差/标准差）"},median_absolute_deviation:{text:'"median_absolute_deviation": { "field": "${1:field}" }',detail:"中位数绝对偏差（离群诊断）"},boxplot:{text:'"boxplot": { "field": "${1:field}" }',detail:"箱线图统计（四分位）"},string_stats:{text:'"string_stats": { "field": "${1:field}" }',detail:"字符串统计（长度/熵）"},matrix_stats:{text:'"matrix_stats": { "fields": ["${1:field}", "${2:field2}"] }',detail:"多字段协方差矩阵"},weighted_avg:{text:`"weighted_avg": {
  "value": { "field": "\${1:valueField}" },
  "weight": { "field": "\${2:weightField}" }
}`,detail:"加权平均"},t_test:{text:`"t_test": {
  "a": { "field": "\${1:aField}" },
  "b": { "field": "\${2:bField}" }
}`,detail:"两样本 t 检验"},rate:{text:`"rate": {
  "field": "\${1:dateField}",
  "unit": "\${2|second,minute,hour,day,week,month,year|}"
}`,detail:"按时间单位的速率"},histogram:{text:`"histogram": {
  "field": "\${1:field}",
  "interval": \${2:10}
}`,detail:"数值直方图（固定区间分桶）"},range:{text:`"range": {
  "field": "\${1:field}",
  "ranges": [
    { "to": \${2:100} },
    { "from": \${2:100} }
  ]
}`,detail:"数值范围分桶"},variable_width_histogram:{text:`"variable_width_histogram": {
  "field": "\${1:field}",
  "buckets": \${2:10}
}`,detail:"按分布自适应的数值分桶"},auto_date_histogram:{text:`"auto_date_histogram": {
  "field": "\${1:dateField}",
  "buckets": \${2:10}
}`,detail:"自动选间隔的时间直方图"},missing:{text:'"missing": { "field": "${1:field}" }',detail:"字段缺失的文档数"},filter:{text:'"filter": { "term": { "${1:field}": "${2:value}" } }',detail:"单过滤器分桶"},filters:{text:`"filters": {
  "filters": {
    "\${1:name}": { "term": { "\${2:field}": "\${3:value}" } }
  }
}`,detail:"多过滤器命名分桶"},global:{text:'"global": {}',detail:"全局桶（不受查询过滤影响）"},nested:{text:'"nested": { "path": "${1:path}" }',detail:"进入 nested 文档聚合"},reverse_nested:{text:'"reverse_nested": {}',detail:"回到父文档聚合"},children:{text:'"children": { "type": "${1:childType}" }',detail:"按子文档类型分桶"},parent:{text:'"parent": { "type": "${1:parentType}" }',detail:"按父文档类型分桶"},sampler:{text:'"sampler": { "shard_size": ${1:100} }',detail:"采样后聚合（降开销）"},random_sampler:{text:'"random_sampler": { "probability": ${1:0.1} }',detail:"随机采样（可重复）"},diversified_sampler:{text:`"diversified_sampler": {
  "field": "\${1:field}",
  "shard_size": \${2:100}
}`,detail:"按字段去重的采样"},composite:{text:`"composite": {
  "sources": [
    { "\${1:name}": { "terms": { "field": "\${2:field}" } } }
  ],
  "size": \${3:10}
}`,detail:"复合分桶（多键分页遍历）"},multi_terms:{text:`"multi_terms": {
  "terms": [
    { "field": "\${1:field}" },
    { "field": "\${2:field2}" }
  ]
}`,detail:"多字段组合分桶"},adjacency_matrix:{text:`"adjacency_matrix": {
  "filters": {
    "\${1:g1}": { "term": { "\${2:field}": "\${3:value}" } }
  }
}`,detail:"过滤器两两相邻矩阵"},frequent_item_sets:{text:`"frequent_item_sets": {
  "fields": ["\${1:field}"],
  "minimum_set_size": \${2:2}
}`,detail:"频繁项集挖掘"},significant_terms:{text:`"significant_terms": {
  "field": "\${1:field}",
  "size": \${2:10}
}`,detail:"显著词项（对比背景集）"},significant_text:{text:'"significant_text": { "field": "${1:textField}" }',detail:"显著文本片段"},rare_terms:{text:'"rare_terms": { "field": "${1:field}" }',detail:"稀有词项分桶"},top_metrics:{text:`"top_metrics": {
  "metrics": [ { "field": "\${1:field}" } ],
  "sort": [ { "\${2:sortField}": "desc" } ]
}`,detail:"按排序取同桶内极值字段"},geo_bounds:{text:'"geo_bounds": { "field": "${1:location}" }',detail:"地理包围盒"},geo_centroid:{text:'"geo_centroid": { "field": "${1:location}" }',detail:"地理质心"},geo_distance:{text:'"geo_distance": {\n  "field": "${1:location}",\n  "origin": { "lat": ${2:0}, "lon": ${3:0} },\n  "unit": "${4:km}"\n}',detail:"距离分桶"},geo_line:{text:`"geo_line": {
  "point": { "field": "\${1:location}" },
  "sort": { "field": "\${2:timeField}" }
}`,detail:"轨迹线（按时间排序的坐标）"},geohash_grid:{text:`"geohash_grid": {
  "field": "\${1:location}",
  "precision": \${2:5}
}`,detail:"geohash 网格分桶"},geotile_grid:{text:`"geotile_grid": {
  "field": "\${1:location}",
  "precision": \${2:7}
}`,detail:"geotile 网格分桶"},geohex_grid:{text:`"geohex_grid": {
  "field": "\${1:location}",
  "precision": \${2:4}
}`,detail:"geohex 网格分桶"},ip_range:{text:`"ip_range": {
  "field": "\${1:ip}",
  "ranges": [ { "to": "\${2:10.0.0.255}" } ]
}`,detail:"IP 段分桶"},categorize_text:{text:'"categorize_text": { "field": "${1:message}" }',detail:"文本自动分类分桶"},inference:{text:'"inference": { "model_id": "${1:modelId}" }',detail:"推理结果分桶（ML）"},scripted_metric:{text:`"scripted_metric": {
  "init_script": "\${1:state.n = 0}",
  "map_script": "\${2:state.n += 1}",
  "combine_script": "\${3:return state.n}",
  "reduce_script": "\${4:return states.sum()}"
}`,detail:"脚本自定义指标"},stats_bucket:{text:'"stats_bucket": { "buckets_path": "${1:agg>metric}" }',detail:"对兄弟桶统计做统计"},extended_stats_bucket:{text:'"extended_stats_bucket": { "buckets_path": "${1:agg>metric}" }',detail:"对兄弟桶做扩展统计"},avg_bucket:{text:'"avg_bucket": { "buckets_path": "${1:agg>metric}" }',detail:"对兄弟桶求均值"},sum_bucket:{text:'"sum_bucket": { "buckets_path": "${1:agg>metric}" }',detail:"对兄弟桶求和"},min_bucket:{text:'"min_bucket": { "buckets_path": "${1:agg>metric}" }',detail:"对兄弟桶求最小"},max_bucket:{text:'"max_bucket": { "buckets_path": "${1:agg>metric}" }',detail:"对兄弟桶求最大"},percentiles_bucket:{text:'"percentiles_bucket": { "buckets_path": "${1:agg>metric}" }',detail:"对兄弟桶求分位"},derivative:{text:'"derivative": { "buckets_path": "${1:agg>metric}" }',detail:"相邻桶差值"},cumulative_sum:{text:'"cumulative_sum": { "buckets_path": "${1:agg>metric}" }',detail:"累计和"},cumulative_cardinality:{text:'"cumulative_cardinality": { "buckets_path": "${1:agg>metric}" }',detail:"累计去重数"},serial_diff:{text:`"serial_diff": {
  "buckets_path": "\${1:agg>metric}",
  "lag": \${2:1}
}`,detail:"按滞后期求差"},moving_avg:{text:`"moving_avg": {
  "buckets_path": "\${1:agg>metric}",
  "window": \${2:5}
}`,detail:"滑动平均（已废弃，建议 moving_fn）"},moving_fn:{text:`"moving_fn": {
  "buckets_path": "\${1:agg>metric}",
  "window": \${2:5},
  "script": "\${3:MovingFunctions.unweightedAvg(values)}"
}`,detail:"滑动函数"},moving_percentiles:{text:`"moving_percentiles": {
  "buckets_path": "\${1:agg>metric}",
  "window": \${2:5},
  "percents": [\${3:50}]
}`,detail:"滑动分位数"},bucket_script:{text:'"bucket_script": {\n  "buckets_path": { "${1:k}": "${2:agg>metric}" },\n  "script": "${3:params.k * 2}"\n}',detail:"按同桶指标算表达式"},bucket_selector:{text:'"bucket_selector": {\n  "buckets_path": { "${1:k}": "${2:agg>metric}" },\n  "script": "${3:params.k > 0}"\n}',detail:"按表达式过滤桶"},bucket_sort:{text:`"bucket_sort": {
  "sort": [ { "\${1:agg}": { "order": "desc" } } ]
}`,detail:"对桶排序/截断"},normalize:{text:`"normalize": {
  "buckets_path": "\${1:agg>metric}",
  "method": "\${2|min_max,z_score,percent_of_sum,mean,softmax|}"
}`,detail:"桶指标归一化"}},te=["query","sort","aggs","_source","highlight","from","size","track_total_hits","post_filter","knn","collapse","rescore","retriever","suggest","script_fields","runtime_mappings","search_after","min_score","aggregations","pit","docvalue_fields","stored_fields","fields","indices_boost","search_type","terminate_after","timeout","explain","version","seq_no_primary_term","track_scores","slice","routing","preference","ext","stats","profile"],ii={standard:{text:`"standard": {
  "query": { "match_all": {} }
}`,detail:"标准 BM25 检索"},knn:{text:'"knn": {\n  "field": "${1:vectorField}",\n  "query_vector": [${2:0.1}, ${3:0.2}],\n  "k": ${4:10},\n  "num_candidates": ${5:100}\n}',detail:"向量近邻召回"},rrf:{text:`"rrf": {
  "retrievers": [
    { "standard": { "query": { "match_all": {} } } },
    { "standard": { "query": { "match_all": {} } } }
  ],
  "rank_constant": \${1:60}
}`,detail:"RRF 倒数排名融合（多路召回）"},linear:{text:`"linear": {
  "retrievers": [
    { "retriever": { "standard": { "query": { "match_all": {} } } }, "weight": \${1:1} }
  ],
  "normalizer": "\${2|none,minmax,l2_norm|}"
}`,detail:"线性加权融合"},text_similarity_reranker:{text:`"text_similarity_reranker": {
  "retriever": { "standard": { "query": { "match_all": {} } } },
  "field": "\${1:field}",
  "inference_id": "\${2:modelId}",
  "inference_text": "\${3:text}"
}`,detail:"文本相似度重排"},rule:{text:`"rule": {
  "ruleset_id": "\${1:rulesetId}"
}`,detail:"规则路由（按 ruleset 改写）"},pinned:{text:`"pinned": {
  "docs": [ { "_id": "\${1:docId}", "_index": "\${2:index}" } ],
  "retriever": { "standard": { "query": { "match_all": {} } } }
}`,detail:"置顶优选（指定文档排最前）"},diversify:{text:`"diversify": {
  "retriever": { "standard": { "query": { "match_all": {} } } },
  "field": "\${1:vectorField}",
  "lambda": \${2:0.5}
}`,detail:"MMR 多样性重排"},rescorer:{text:`"rescorer": {
  "retriever": { "standard": { "query": { "match_all": {} } } },
  "rescore": { "window_size": \${1:50} }
}`,detail:"重打分"}},ni={term:{text:`"term": {
  "field": "\${1:field}"
}`,detail:"纠错 term 建议器"},phrase:{text:`"phrase": {
  "field": "\${1:field}",
  "size": \${2:5}
}`,detail:"短语 phrase 建议器"},completion:{text:`"completion": {
  "field": "\${1:suggestField}"
}`,detail:"自动补全 completion 建议器"}};function ai(t){const n=[];H.has(t)?n.push({key:"path",insert:'"path": "${1:path}"',detail:"嵌套文档路径"}):Q.has(t)&&n.push({key:"field",insert:'"field": "${1:field}"',detail:"聚合字段"});for(const e of W[t]||[]){const a=e.options||[],r=e.kind==="number"?"${1:10}":e.kind==="boolean"?"${1|true,false|}":e.kind==="enum"&&a.length?'"${1|'+a.join(",")+'|}"':e.kind==="json"?"${1:{}}":e.kind==="json-array"?"${1:[]}":'"${1:text}"';n.push({key:e.key,insert:`"${e.key}": ${r}`,detail:e.kind})}return n.push({key:"meta",insert:`"meta": {
  \${0}
}`,detail:"聚合元数据（原样回显）"}),n.push({key:"aggs",insert:`"aggs": {
  \${0}
}`,detail:"嵌套子聚合"}),n}const K={query:{text:`"query": {
  \${0}
}`,detail:"查询主体"},sort:{text:'"sort": [\n  { "${1:field}": { "order": "${2|desc,asc|}" } }\n]',detail:"排序"},aggs:{text:`"aggs": {
  \${0}
}`,detail:"聚合统计"},_source:{text:'"_source": ["${1:field}"]',detail:"返回字段裁剪"},highlight:{text:`"highlight": {
  "fields": {
    "\${1:field}": {}
  }
}`,detail:"高亮"},from:{text:'"from": ${1:0}',detail:"分页起点"},size:{text:'"size": ${1:10}',detail:"分页大小"},track_total_hits:{text:'"track_total_hits": ${1|true,false|}',detail:"精确总数统计"},post_filter:{text:'"post_filter": {\n  "term": { "${1:field}": "${2:value}" }\n}',detail:"查询后过滤（不影响聚合）"},knn:{text:`"knn": {
  "field": "\${1:vectorField}",
  "query_vector": [],
  "k": \${2:10},
  "num_candidates": \${3:100}
}`,detail:"顶层向量近邻检索"},collapse:{text:`"collapse": {
  "field": "\${1:field}"
}`,detail:"按字段折叠去重"},rescore:{text:`"rescore": {
  "window_size": \${1:50},
  "query": {
    "rescore_query": { "match_all": {} },
    "query_weight": 0.7,
    "rescore_query_weight": 1.2
  }
}`,detail:"二阶段重打分"},retriever:{text:`"retriever": {
  "standard": {
    "query": { "match_all": {} }
  }
}`,detail:"检索器（8.14+ 检索面）"},suggest:{text:`"suggest": {
  "\${1:my_suggest}": {
    "text": "\${2:value}",
    "term": { "field": "\${3:field}" }
  }
}`,detail:"建议器（拼写/词项）"},script_fields:{text:`"script_fields": {
  "\${1:my_field}": {
    "script": { "source": "\${2:params.factor}" }
  }
}`,detail:"脚本计算字段"},runtime_mappings:{text:`"runtime_mappings": {
  "\${1:runtime_field}": {
    "type": "\${2|keyword,long,double,date,boolean|}",
    "script": { "source": "\${3:emit(params.x)}" }
  }
}`,detail:"运行时字段"},search_after:{text:'"search_after": ["${1:value}"]',detail:"深分页游标"},min_score:{text:'"min_score": ${1:0}',detail:"最低评分过滤"},aggregations:{text:`"aggregations": {
  \${0}
}`,detail:"聚合统计（aggs 的别名）"},pit:{text:`"pit": {
  "id": "\${1:pitId}",
  "keep_alive": "\${2:1m}"
}`,detail:"时间点（PIT）检索"},docvalue_fields:{text:'"docvalue_fields": [ "${1:field}" ]',detail:"按列存取值（doc_values）返回字段"},stored_fields:{text:'"stored_fields": [ "${1:field}" ]',detail:"返回 stored 字段"},fields:{text:'"fields": [ "${1:field}" ]',detail:"fields API 返回字段"},indices_boost:{text:'"indices_boost": [ { "${1:index}": ${2:1.2} } ]',detail:"按索引加权"},search_type:{text:'"search_type": "${1|query_then_fetch,dfs_query_then_fetch|}"',detail:"搜索类型（打分一致性/两阶段）"},terminate_after:{text:'"terminate_after": ${1:1000}',detail:"最多检查 N 篇后提前结束"},timeout:{text:'"timeout": "${1:1s}"',detail:"搜索超时（到时返回部分结果）"},explain:{text:'"explain": ${1|true,false|}',detail:"返回打分解释"},version:{text:'"version": ${1|true,false|}',detail:"返回文档版本号"},seq_no_primary_term:{text:'"seq_no_primary_term": ${1|true,false|}',detail:"返回 seq_no / primary_term（乐观并发）"},track_scores:{text:'"track_scores": ${1|true,false|}',detail:"排序时仍计算得分"},slice:{text:`"slice": {
  "field": "\${1:_id}",
  "id": \${2:0},
  "max": \${3:2}
}`,detail:"切片并行检索"},routing:{text:'"routing": "${1:routing}"',detail:"路由值（定向分片）"},preference:{text:'"preference": "${1|_local,_primary,_only_local|}"',detail:"分片偏好（缓存/主副选择）"},ext:{text:`"ext": {
  \${0}
}`,detail:"搜索扩展参数（插件用）"},stats:{text:'"stats": [ "${1:group}" ]',detail:"统计分组标签（打点用）"},profile:{text:'"profile": ${1|true,false|}',detail:"耗时剖析（profile 树）"}};function ri(){return te.map(t=>({label:t,detail:K[t].detail,snippet:!0,insertText:K[t].text}))}const w=new Set(Object.entries(v).filter(([t,n])=>n.form==="field"&&t!=="exists").map(([t])=>t)),i=(t,n,e)=>({key:t,insert:n,detail:e}),T=i("_name",'"_name": "${1:name}"',"命名查询（命中归因）"),h={bool:[i("must",`"must": [
  \${0}
]`,"全部必须匹配（参与评分）"),i("filter",`"filter": [
  \${0}
]`,"全部必须匹配（不计分，可缓存）"),i("should",`"should": [
  \${0}
]`,"满足任一（配合 minimum_should_match）"),i("must_not",`"must_not": [
  \${0}
]`,"全部必须不匹配"),i("minimum_should_match",'"minimum_should_match": "${1:1}"',"should 至少满足的个数/百分比"),i("boost",'"boost": ${1:1}',"加权"),T],constant_score:[i("filter",`"filter": {
  \${0}
}`,"计分来源查询（恒定分）"),i("boost",'"boost": ${1:1}',"恒定分"),T],dis_max:[i("queries",`"queries": [
  \${0}
]`,"子查询列表（取最高分）"),i("tie_breaker",'"tie_breaker": ${1:0.7}',"近似命中的折算系数"),i("boost",'"boost": ${1:1}',"加权")],function_score:[i("query",`"query": {
  \${0}
}`,"基础查询（可选）"),i("functions",`"functions": [
  \${0}
]`,"评分函数列表"),i("boost",'"boost": ${1:1}',"全局加权"),i("boost_mode",'"boost_mode": "${1|multiply,replace,sum,avg,max,min|}"',"函数分与查询分的合并方式"),i("score_mode",'"score_mode": "${1|multiply,sum,avg,first,max,min|}"',"多个函数分的合并方式"),i("min_score",'"min_score": ${1:0}',"低于此分的命中丢弃"),i("max_boost",'"max_boost": ${1:10}',"函数分上限")],__function__:[i("filter",`"filter": {
  \${0}
}`,"只对该查询命中的文档生效"),i("weight",'"weight": ${1:1}',"固定权重"),i("random_score",'"random_score": { "seed": ${1:1}, "field": "${2:_seq_no}" }',"随机分（可复现要固定 seed）"),i("script_score",'"script_score": { "script": { "source": "${1:params.w ?? 1}" } }',"脚本分"),i("field_value_factor",'"field_value_factor": { "field": "${1:field}", "factor": ${2:1}, "missing": ${3:1} }',"字段值转分"),i("gauss",'"gauss": { "${1:field}": { "origin": "${2:0}", "scale": "${3:10}" } }',"高斯衰减"),i("linear",'"linear": { "${1:field}": { "origin": "${2:0}", "scale": "${3:10}" } }',"线性衰减"),i("exp",'"exp": { "${1:field}": { "origin": "${2:0}", "scale": "${3:10}" } }',"指数衰减")],boosting:[i("positive",`"positive": {
  \${0}
}`,"必须匹配的正例"),i("negative",`"negative": {
  \${0}
}`,"匹配则降权"),i("negative_boost",'"negative_boost": ${1:0.5}',"反例降权系数")],script_score:[i("query",`"query": {
  \${0}
}`,"基础查询"),i("script",'"script": { "source": "${1:_score}" }',"评分脚本"),i("min_score",'"min_score": ${1:0}',"最低分")],pinned:[i("ids",'"ids": [${1:"id"}]',"置顶文档 ID"),i("docs",'"docs": [\n  { "_id": "${1:id}", "_index": "${2:index}" }\n]',"跨索引置顶文档"),i("organic",`"organic": {
  \${0}
}`,"其余文档的召回查询"),i("boost",'"boost": ${1:1}',"置顶文档加权")],nested:[i("path",'"path": "${1:path}"',"嵌套文档路径"),i("query",`"query": {
  \${0}
}`,"嵌套文档内的查询"),i("score_mode",'"score_mode": "${1|avg,sum,max,min,none|}"',"多根文档评分合并"),i("ignore_unmapped",'"ignore_unmapped": ${1|false,true|}',"路径未映射时忽略")],has_child:[i("type",'"type": "${1:childType}"',"子文档 join 名"),i("query",`"query": {
  \${0}
}`,"对子文档的查询"),i("score_mode",'"score_mode": "${1|avg,sum,max,min,none|}"',"多个子文档的评分合并"),i("min_children",'"min_children": ${1:1}',"至少命中几个子文档"),i("max_children",'"max_children": ${1:10}',"至多命中几个子文档"),i("ignore_unmapped",'"ignore_unmapped": ${1|false,true|}',"类型未映射时忽略")],has_parent:[i("parent_type",'"parent_type": "${1:parentType}"',"父文档 join 名"),i("query",`"query": {
  \${0}
}`,"对父文档的查询"),i("score_mode",'"score_mode": "${1|none,score|}"',"父文档评分是否计入"),i("ignore_unmapped",'"ignore_unmapped": ${1|false,true|}',"类型未映射时忽略")],multi_match:[i("query",'"query": "${1:value}"',"检索文本"),i("fields",'"fields": ["${1:field}"]',"参与检索的字段（可用 field^2 加权）"),i("type",'"type": "${1|best_fields,most_fields,cross_fields,phrase,phrase_prefix,bool_prefix|}"',"匹配策略")],query_string:[i("query",'"query": "${1:value}"',"查询串（支持 AND/OR/字段:值）"),i("default_field",'"default_field": "${1:field}"',"未写字段时的默认字段"),i("fields",'"fields": ["${1:field}"]',"搜索字段列表")],simple_query_string:[i("query",'"query": "${1:+value -exclude}"',"简单查询串（+/-/短语/通配）"),i("fields",'"fields": ["${1:field}"]',"搜索字段列表")],combined_fields:[i("query",'"query": "${1:value}"',"检索文本"),i("fields",'"fields": ["${1:field}"]',"组合检索的字段")],more_like_this:[i("fields",'"fields": ["${1:field}"]',"相似度比较字段"),i("like",'"like": "${1:text}"',"示例文本/文档"),i("ids",'"ids": [${1:"id"}]',"以这些文档为示例")],ids:[i("values",'"values": ["${1:id}"]',"文档 ID 列表")],script:[i("script",'"script": { "source": "${1:params._source}" }',"过滤脚本")],wrapper:[i("query",'"query": "${1:base64}"',"Base64 编码的查询")],percolate:[i("field",'"field": "${1:queryField}"',"percolator 字段"),i("document",`"document": {
  \${0}
}`,"要反查的文档")],rule:[i("ruleset_id",'"ruleset_id": "${1:ruleset}"',"规则集 ID"),i("match_criteria",`"match_criteria": {
  \${0}
}`,"规则匹配条件"),i("match_predicate",`"match_predicate": {
  \${0}
}`,"规则命中后的查询")],template:[i("id",'"id": "${1:templateId}"',"搜索模板 ID"),i("params",`"params": {
  \${0}
}`,"模板参数")],parent_id:[i("type",'"type": "${1:parentType}"',"父文档 join 名"),i("id",'"id": "${1:parentId}"',"父文档 ID")],type:[i("value",'"value": "${1:type}"',"7.x 映射类型名")],rank_feature:[i("field",'"field": "${1:rankField}"',"特征字段"),i("boost",'"boost": ${1:1}',"加权"),i("saturation",'"saturation": { "pivot": ${1:1} }',"饱和函数"),i("log",'"log": { "scaling_factor": ${1:1} }',"对数函数"),i("sigmoid",'"sigmoid": { "pivot": ${1:1}, "exponent": ${2:1} }',"S 型函数"),i("linear",'"linear": {}',"线性函数")],distance_feature:[i("field",'"field": "${1:field}"',"距离特征字段"),i("origin",'"origin": "${1:now}"',"原点"),i("pivot",'"pivot": "${1:7d}"',"距离尺度"),i("boost",'"boost": ${1:1}',"加权")],knn:[i("field",'"field": "${1:vectorField}"',"向量字段"),i("query_vector",'"query_vector": [${1:0.1}]',"查询向量"),i("k",'"k": ${1:10}',"返回近邻数"),i("num_candidates",'"num_candidates": ${1:100}',"每分片候选数"),i("filter",`"filter": {
  \${0}
}`,"近邻过滤查询"),i("similarity",'"similarity": ${1:0.8}',"相似度下限"),i("boost",'"boost": ${1:1}',"加权")],semantic:[i("field",'"field": "${1:semanticField}"',"语义字段"),i("query",'"query": "${1:text}"',"语义检索文本")],sparse_vector:[i("field",'"field": "${1:sparseField}"',"稀疏向量字段"),i("query_vector",'"query_vector": { "${1:token}": ${2:0.5} }',"稀疏查询向量")],bitmap_terms:[i("field",'"field": "${1:field}"',"字段"),i("value",'"value": "${1:base64}"',"Base64 位图")],span_near:[i("clauses",`"clauses": [
  \${0}
]`,"子跨度列表"),i("slop",'"slop": ${1:1}',"允许的最大间隔"),i("in_order",'"in_order": ${1|true,false|}',"是否要求顺序")],span_or:[i("clauses",`"clauses": [
  \${0}
]`,"任一命中的子跨度")],span_not:[i("include",`"include": {
  \${0}
}`,"包含跨度"),i("exclude",`"exclude": {
  \${0}
}`,"排除跨度")],span_first:[i("match",`"match": {
  \${0}
}`,"内部跨度"),i("end",'"end": ${1:3}',"必须出现在前 N 个位置")],span_containing:[i("little",`"little": {
  \${0}
}`,"内部跨度"),i("big",`"big": {
  \${0}
}`,"外部跨度")],span_within:[i("little",`"little": {
  \${0}
}`,"内部跨度"),i("big",`"big": {
  \${0}
}`,"外部跨度")],span_multi:[i("match",`"match": {
  \${0}
}`,"多词查询（term/prefix/wildcard 等）")],span_field_masking:[i("query",`"query": {
  \${0}
}`,"被掩码的查询"),i("field",'"field": "${1:field}"',"掩码字段")],match_all:[i("boost",'"boost": ${1:1}',"加权"),T],inner_hits:[i("from",'"from": ${1:0}',"组内跳过条数"),i("size",'"size": ${1:3}',"组内返回条数"),i("name",'"name": "${1:hits}"',"结果里的命名（拿回 inner_hits）"),i("sort",`"sort": [
  \${0}
]`,"组内排序"),i("_source",'"_source": ${1|false,true|}',"组内返回字段"),i("highlight",`"highlight": {
  \${0}
}`,"组内高亮")],rescore:[i("window_size",'"window_size": ${1:50}',"前 N 条参与重排"),i("query",`"query": {
  \${0}
}`,"重排查询（配合 rescore_query）"),i("query_weight",'"query_weight": ${1:1}',"原分权重"),i("rescore_query",`"rescore_query": {
  \${0}
}`,"重排查询"),i("rescore_query_weight",'"rescore_query_weight": ${1:1}',"重排分权重"),i("score_mode",'"score_mode": "${1|total,multiply,avg,max,min|}"',"合并方式")],pit:[i("id",'"id": "${1:pitId}"',"Point-in-time ID"),i("keep_alive",'"keep_alive": "${1:1m}"',"保活时长")],gauss:[i("origin",'"origin": "${1:0}"',"原点"),i("scale",'"scale": "${1:10}"',"衰减尺度"),i("offset",'"offset": ${1:0}',"无衰减区间"),i("decay",'"decay": ${1:0.5}',"衰减到该比例")],linear:[i("origin",'"origin": "${1:0}"',"原点"),i("scale",'"scale": "${1:10}"',"衰减尺度"),i("offset",'"offset": ${1:0}',"无衰减区间"),i("decay",'"decay": ${1:0.5}',"衰减到该比例")],exp:[i("origin",'"origin": "${1:0}"',"原点"),i("scale",'"scale": "${1:10}"',"衰减尺度"),i("offset",'"offset": ${1:0}',"无衰减区间"),i("decay",'"decay": ${1:0.5}',"衰减到该比例")],random_score:[i("seed",'"seed": ${1:1}',"随机种子（固定后结果可复现）"),i("field",'"field": "${1:_seq_no}"',"按该字段值参与随机")],field_value_factor:[i("field",'"field": "${1:field}"',"取值字段"),i("factor",'"factor": ${1:1}',"放大系数"),i("modifier",'"modifier": "${1|none,log,log1p,log2p,ln,ln1p,ln2p,square,sqrt,reciprocal|}"',"取值变换"),i("missing",'"missing": ${1:1}',"缺值时的默认值")],__script_field__:[i("script",`"script": {
  \${0}
}`,"脚本（source/lang/params）")],__script__:[i("source",`"source": "\${1:doc['field'].value}"`,"脚本源码"),i("lang",'"lang": "${1:painless}"',"脚本语言"),i("params",`"params": {
  \${0}
}`,"脚本参数"),i("id",'"id": "${1:storedScriptId}"',"已存脚本 ID")],__runtime_field__:[i("type",'"type": "${1|keyword,long,double,date,boolean,ip|}"',"运行时字段类型"),i("script",`"script": {
  \${0}
}`,"取值脚本"),i("format",'"format": "${1:yyyy-MM-dd}"',"date 格式")],__highlight_field__:[i("type",'"type": "${1|unified,plain,fvh|}"',"该字段的高亮器"),i("fragment_size",'"fragment_size": ${1:100}',"片段长度"),i("number_of_fragments",'"number_of_fragments": ${1:3}',"片段数"),i("pre_tags",'"pre_tags": ["${1:<em>}"]',"前置标记"),i("post_tags",'"post_tags": ["${1:</em>}"]',"后置标记"),i("require_field_match",'"require_field_match": ${1|false,true|}',"是否只高亮命中字段"),i("no_match_size",'"no_match_size": ${1:0}',"未命中时返回的片段长度"),i("boundary_scanner",'"boundary_scanner": "${1|sentence,word|}"',"片段边界扫描")],collapse:[i("field",'"field": "${1:field}"',"折叠字段（每个值只留一条）"),i("inner_hits",'"inner_hits": { "name": "${1:group}", "size": ${2:1} }',"折叠组内命中")],_source:[i("includes",`"includes": [
  "\${1:field}"
]`,"只返回这些字段（支持通配）"),i("excludes",`"excludes": [
  "\${1:field}"
]`,"排除这些字段（支持通配）"),i("include",'"include": ["${1:field}"]',"旧式写法：只返回这些字段"),i("exclude",'"exclude": ["${1:field}"]',"旧式写法：排除这些字段")],highlight:[i("fields",`"fields": {
  \${0}
}`,"高亮字段"),i("type",'"type": "${1|unified,plain,fvh|}"',"高亮器类型"),i("pre_tags",'"pre_tags": ["${1:<em>}"]',"前置标记"),i("post_tags",'"post_tags": ["${1:</em>}"]',"后置标记"),i("require_field_match",'"require_field_match": ${1|false,true|}',"是否只高亮命中的字段"),i("number_of_fragments",'"number_of_fragments": ${1:3}',"片段数"),i("fragment_size",'"fragment_size": ${1:100}',"片段长度")]};function q(t){return t.kind==="number"?'"'+t.key+'": ${1:10}':t.kind==="boolean"?'"'+t.key+'": ${1|true,false|}':t.kind==="enum"?'"'+t.key+'": "${1|'+(t.options||[]).join(",")+'|}"':t.kind==="json"?'"'+t.key+`": {
  \${0}
}`:t.kind==="json-array"?'"'+t.key+`": [
  \${0}
]`:'"'+t.key+'": "${1:'+t.key+'}"'}function si(t){var r,s;const n=[...h[t]||[]],e=new Set(n.map(l=>l.key)),a=[...((r=v[t])==null?void 0:r.params)||[],...D[t]||[],...((s=G[t])==null?void 0:s.params)||[]];for(const l of a)e.has(l.key)||(n.push({key:l.key,insert:q(l),detail:"可选参数"}),e.add(l.key));return n}const E={match:[i("query",'"query": "${1:value}"',"检索文本"),i("operator",'"operator": "${1|and,or|}"',"词项逻辑"),i("fuzziness",'"fuzziness": "${1:AUTO}"',"模糊度"),i("minimum_should_match",'"minimum_should_match": "${1:1}"',"至少命中词数"),i("analyzer",'"analyzer": "${1:standard}"',"分词器"),i("boost",'"boost": ${1:1}',"加权")],match_phrase:[i("query",'"query": "${1:value}"',"短语文本"),i("slop",'"slop": ${1:0}',"允许的词间间隔"),i("boost",'"boost": ${1:1}',"加权")],match_phrase_prefix:[i("query",'"query": "${1:value}"',"短语前缀文本"),i("max_expansions",'"max_expansions": ${1:50}',"前缀展开上限"),i("slop",'"slop": ${1:0}',"允许的词间间隔")],match_bool_prefix:[i("query",'"query": "${1:value}"',"文本（末词按前缀）"),i("operator",'"operator": "${1|and,or|}"',"词项逻辑")],term:[i("value",'"value": "${1:value}"',"精确值"),i("case_insensitive",'"case_insensitive": ${1|true,false|}',"忽略大小写"),i("boost",'"boost": ${1:1}',"加权")],prefix:[i("value",'"value": "${1:prefix}"',"前缀"),i("case_insensitive",'"case_insensitive": ${1|true,false|}',"忽略大小写")],wildcard:[i("value",'"value": "${1:pref*}"',"通配模式"),i("case_insensitive",'"case_insensitive": ${1|true,false|}',"忽略大小写"),i("rewrite",'"rewrite": "${1:constant_score}"',"重写策略")],regexp:[i("value",'"value": "${1:pattern.*}"',"正则"),i("flags",'"flags": "${1:ALL}"',"正则选项"),i("max_determinized_states",'"max_determinized_states": ${1:10000}',"自动机状态上限")],fuzzy:[i("value",'"value": "${1:value}"',"目标词"),i("fuzziness",'"fuzziness": "${1:AUTO}"',"模糊度"),i("prefix_length",'"prefix_length": ${1:0}',"前缀不变长度"),i("transpositions",'"transpositions": ${1|true,false|}',"允许换位")],span_term:[i("value",'"value": "${1:term}"',"词项")],intervals:[i("match",'"match": { "query": "${1:value}" }',"匹配文本"),i("all_of",`"all_of": {
  "ordered": \${1|true,false|},
  "intervals": [
    \${0}
  ]
}`,"有序/无序全部命中"),i("any_of",`"any_of": { "intervals": [
  \${0}
] }`,"任一命中"),i("prefix",'"prefix": { "prefix": "${1:pre}" }',"前缀"),i("wildcard",'"wildcard": { "pattern": "${1:pre*}" }',"通配"),i("fuzzy",'"fuzzy": { "term": "${1:term}" }',"模糊"),i("filter",'"filter": { "script": { "source": "true" } }',"脚本过滤")],geo_shape:[i("shape",`"shape": {
  \${0}
}`,"形状对象"),i("relation",'"relation": "${1|INTERSECTS,DISJOINT,WITHIN|}"',"空间关系")],geo_bounding_box:[i("top_left",'"top_left": { "lat": ${1:0}, "lon": ${2:0} }',"左上角点"),i("bottom_right",'"bottom_right": { "lat": ${1:0}, "lon": ${2:0} }',"右下角点")],geo_polygon:[i("points",'"points": [\n  { "lat": ${1:0}, "lon": ${2:0} }\n]',"多边形顶点")],text_expansion:[i("model_id",'"model_id": "${1:model}"',"推理模型 ID"),i("model_text",'"model_text": "${1:text}"',"待扩展文本")]};function li(t){var a;const n=[...E[t]||[]],e=new Set(n.map(r=>r.key));for(const r of((a=v[t])==null?void 0:a.params)||[])e.has(r.key)||(n.push({key:r.key,insert:q(r),detail:"可选参数"}),e.add(r.key));return n}const A={standard:[i("query",`"query": {
  \${0}
}`,"召回查询（BM25）")],knn:[i("field",'"field": "${1:vectorField}"',"向量字段"),i("query_vector",'"query_vector": [${1:0.1}]',"查询向量"),i("filter",`"filter": {
  \${0}
}`,"近邻过滤查询")],rrf:[i("retrievers",`"retrievers": [
  \${0}
]`,"参与融合的子检索器")],linear:[i("retrievers",`"retrievers": [
  { "retriever": {}, "weight": \${1:1} }
]`,"线性加权的子检索器（带 weight）")],text_similarity_reranker:[i("retriever",`"retriever": {
  \${0}
}`,"召回源检索器")],rule:[i("retriever",`"retriever": {
  \${0}
}`,"召回源检索器（可缺席）"),i("match_criteria",`"match_criteria": {
  \${0}
}`,"规则匹配条件")],pinned:[i("retriever",`"retriever": {
  \${0}
}`,"召回源检索器"),i("docs",`"docs": [
  \${0}
]`,"置顶文档"),i("ids",'"ids": [${1:"id"}]',"置顶文档 ID")],diversify:[i("retriever",`"retriever": {
  \${0}
}`,"召回源检索器"),i("query_vector",'"query_vector": [${1:0.1}]',"多样性参考向量")],rescorer:[i("retriever",`"retriever": {
  \${0}
}`,"召回源检索器"),i("rescore",`"rescore": {
  \${0}
}`,"重打分体")]};function oi(t){const n=[...A[t]||[]],e=new Set(n.map(a=>a.key));for(const a of Y[t]||[])e.has(a.key)||(n.push({key:a.key,insert:q(a),detail:"可选参数"}),e.add(a.key));return n}const z={term:[i("field",'"field": "${1:field}"',"候选来源字段"),i("text",'"text": "${1:query}"',"输入文本"),i("prefix",'"prefix": "${1:prefix}"',"前缀（优先于 text）"),i("suggest_mode",'"suggest_mode": "${1|missing,popular,always|}"',"建议策略"),i("min_word_length",'"min_word_length": ${1:3}',"最短词长"),i("max_edits",'"max_edits": ${1:2}',"最大编辑距离"),i("sort",'"sort": "${1|score,frequency|}"',"候选排序"),i("size",'"size": ${1:5}',"每个词的建议数"),i("analyzer",'"analyzer": "${1:standard}"',"分词器")],phrase:[i("field",'"field": "${1:field}"',"候选来源字段"),i("text",'"text": "${1:query}"',"输入文本"),i("prefix",'"prefix": "${1:prefix}"',"前缀（优先于 text）"),i("gram_size",'"gram_size": ${1:3}',"n-gram 大小"),i("analyzer",'"analyzer": "${1:standard}"',"分词器"),i("highlight",'"highlight": { "pre_tag": "${1:<em>}", "post_tag": "${2:</em>}" }',"候选中的纠错高亮"),i("collate",`"collate": {
  \${0}
}`,"候选校验查询"),i("size",'"size": ${1:5}',"候选数"),i("max_errors",'"max_errors": ${1:1}',"最大错误数")],completion:[i("field",'"field": "${1:suggestField}"',"completion 字段"),i("text",'"text": "${1:query}"',"输入文本"),i("prefix",'"prefix": "${1:prefix}"',"前缀（优先于 text）"),i("contexts",`"contexts": {
  \${0}
}`,"上下文过滤（category/geo）"),i("fuzzy",'"fuzzy": { "fuzziness": ${1:1} }',"模糊匹配"),i("skip_duplicates",'"skip_duplicates": ${1|true,false|}',"同文本去重"),i("size",'"size": ${1:5}',"候选数"),i("analyzer",'"analyzer": "${1:simple}"',"输入分词器"),i("search_analyzer",'"search_analyzer": "${1:simple}"',"索引侧分词器")]};function di(t){return[...z[t]||[]]}const ie=new Set(["sort","fields"]),pi=new Set(["_source","stored_fields","docvalue_fields","fields","includes","excludes","sort"]);function g(t,n){let e=0;for(let a=n-1;a>=0&&t[a]==="\\";a--)e++;return e%2===1}function b(t,n){if(n<0||n+1>=t.length||t[n]!=="/")return-1;if(t[n+1]==="/"){let e=n+2;for(;e<t.length&&t[e]!==`
`;)e++;return e}if(t[n+1]==="*"){let e=n+2;for(;e+1<t.length&&!(t[e]==="*"&&t[e+1]==="/");)e++;return e+2}return-1}function ne(t,n){let e=t.length-1;if(n){for(;e>=0&&!(t[e]==='"'&&!g(t,e));)e--;e--}for(;e>=0&&/\s/.test(t[e]);)e--;return e>=0&&t[e]===":"}const ae=new Set(["avg","min","max","sum","cardinality","value_count","median_absolute_deviation","weighted_avg"]);function re(t,n){const e=[{key:null,parent:-1,firstKey:null}],a=[0];let r=!1,s="",l=null;for(let p=n+1;p<t.length;p++){const c=t[p];if(r){if(c==='"'&&!g(t,p)){r=!1;let m=p+1;for(;m<t.length&&/\s/.test(t[m]);)m++;if(t[m]===":"){const d=e[a[a.length-1]];d.firstKey===null&&(d.firstKey=s),l=s}}else s+=c;continue}const _=b(t,p);if(_!==-1){p=_-1;continue}if(c==='"'){r=!0,s="";continue}if(c==="{"){e.push({key:l,parent:a[a.length-1],firstKey:null}),a.push(e.length-1),l=null;continue}if(c==="}"){if(a.length===1)break;a.pop(),l=null;continue}/[\s:]/.test(c)||(l=null)}const o=e.findIndex(p=>p.parent===0&&(p.key==="aggs"||p.key==="aggregations"));if(o<0)return[];const f=[],y=new Set;for(const p of e)p.parent!==o||!p.key||!p.firstKey||y.has(p.key)||ae.has(p.firstKey)&&(y.add(p.key),f.push({name:p.key,type:p.firstKey}));return f}function ui(t,n){const e=t.slice(0,Math.max(0,Math.min(n,t.length))),a=[];let r=!1,s="";for(let c=0;c<e.length;c++){const _=e[c];if(r){if(_==='"'&&!g(e,c)){r=!1;let d=c+1;for(;d<e.length&&/\s/.test(e[d]);)d++;e[d]===":"&&a.length&&(a[a.length-1].lastKey=s)}else s+=_;continue}const m=b(e,c);if(m!==-1){c=m-1;continue}if(_==='"'){r=!0,s="";continue}_==="{"?a.push({type:"{",lastKey:null,start:c}):_==="["?a.push({type:"[",lastKey:null,start:c}):(_==="}"||_==="]")&&a.pop()}if(!a.length)return{kind:"root"};const l=a.map(c=>c.lastKey),o=ne(e,r);let f=l.lastIndexOf("query");if(f<0){const c=l.lastIndexOf("post_filter");if(c>=0&&c<a.length-1)f=c;else{const _=l.lastIndexOf("knn"),m=l.lastIndexOf("filter");_>=0&&m>_&&m<a.length-1?f=m:(l[0]==="filter"&&a.length>1||l[0]==="index_filter"&&a.length>1)&&(f=0)}}if(!(f>=0&&f<a.length-1)){const c=Math.max(l.lastIndexOf("aggs"),l.lastIndexOf("aggregations"));if(c>=0&&c<a.length-1){const d=a.slice(c+1);if(d.length===1&&d[0].type==="{")return{kind:"agg-name"};if(d.length===2&&d[1].type==="{")return{kind:"agg-type"};if(d.length===3&&d[2].type==="{"&&d[1].lastKey&&!o)return d[1].lastKey==="filter"?{kind:"query-type"}:{kind:"agg-body-key",op:d[1].lastKey};if(d.length===4&&d[3].type==="{"&&!o&&(d[1].lastKey==="terms"||d[1].lastKey==="multi_terms"))return{kind:"agg-order-key",subAggs:d[1].lastKey==="terms"?re(t,d[1].start):[]};if(d.length===4&&o&&(d[1].lastKey==="terms"||d[1].lastKey==="multi_terms"))return{kind:"agg-order-dir"};if(a.length>=5&&a[a.length-1].type==="{"&&a[a.length-3].lastKey==="filters"&&a[a.length-4].lastKey==="filters"&&!o)return{kind:"query-type"}}if(o&&a.length>=3&&a[a.length-1].type==="{"&&a[a.length-2].type==="["&&a[a.length-3].lastKey==="sort")return{kind:"sort-order"};if(!o&&a.length>=4&&a[a.length-1].type==="{"&&a[a.length-2].type==="{"&&a[a.length-3].type==="["&&a[a.length-4].lastKey==="sort")return{kind:"sort-opt-key"};if(!o&&a.length>=3&&a[a.length-1].type==="{"&&l[l.length-2]==="fields"&&l[l.length-3]==="highlight")return{kind:"field-key"};const _=l.lastIndexOf("suggest");if(_>=0&&_<a.length-1){const d=a.slice(_+1);if(d.length===2&&d[1].type==="{"&&!o)return{kind:"suggester-type"}}const m=l.lastIndexOf("retriever");if(m>=0){const d=a[a.length-1];if(m===a.length-2&&d.type==="{"&&!o)return{kind:"retriever-type"};if(a.length>=4&&d.type==="{"&&a[a.length-2].type==="["&&a[a.length-3].lastKey==="retrievers"&&a[a.length-4].lastKey!=="linear"&&!o)return{kind:"retriever-type"};if(m===a.length-3){const x=a[m+1].lastKey;if(x&&A[x]&&d.type==="{"&&!o)return{kind:"retriever-body-key",op:x}}}if(a[a.length-1].type==="{"&&!o){const d=a.length>=2?a[a.length-2].lastKey:null,x=a.length>=3?a[a.length-3].lastKey:null,$=l.lastIndexOf("suggest");if($>=0&&l.length>=$+3&&d&&z[d])return{kind:"suggester-body-key",op:d};if(d==="script")return{kind:"query-body-key",op:"__script__"};if(d&&h[d])return{kind:"query-body-key",op:d};if(x==="script_fields")return{kind:"query-body-key",op:"__script_field__"};if(x==="fields"&&a.length>=4&&a[a.length-4].lastKey==="highlight")return{kind:"query-body-key",op:"__highlight_field__"};if(x==="runtime_mappings")return{kind:"query-body-key",op:"__runtime_field__"}}if(a.length>=3){const d=a[a.length-1],x=a[a.length-2],$=a[a.length-3].lastKey;if(d.type==="{"&&x.type==="["&&$&&ie.has($))return{kind:"array-elem-key",owner:$}}return a.length===1&&a[0].type==="{"?{kind:"root"}:{kind:"none"}}const p=a.slice(f+1);if(p.length>=3){const c=p[p.length-3],_=p[p.length-2];if(p[p.length-1].type==="{"&&c.lastKey==="range"&&_.lastKey)return{kind:"range-op"}}if(p.length>=2){const c=p[p.length-2],_=p[p.length-1];if(_.type==="{"&&c.lastKey&&w.has(c.lastKey))return{kind:"field",clause:c.lastKey};if(_.type==="{"&&c.lastKey==="exists")return{kind:"exists-key"};if(_.type==="{"&&p.length>=3){const m=p[p.length-3].lastKey;if(m&&E[m])return{kind:"clause-field-key",op:m}}if(_.type==="{"){if(c.type==="["&&p.length>=3&&p[p.length-3].lastKey==="functions")return{kind:"query-body-key",op:"__function__"};const m=c.lastKey;if(m&&h[m])return{kind:"query-body-key",op:m};if(p.length>=5){const d=p[p.length-3];if(p[p.length-4].type==="["&&p[p.length-5].lastKey==="functions"&&d.lastKey&&h[d.lastKey])return{kind:"query-body-key",op:d.lastKey}}}}return{kind:"query-type"}}Z.filter(t=>t!=="token_count");function ci(t,n){const e=J(n),a=r=>{const s=e.indexOf(r);return s===-1?e.length:s};return t.map((r,s)=>({f:r,i:s})).sort((r,s)=>a(r.f.type)-a(s.f.type)||r.i-s.i).map(r=>r.f)}const mi={date:{detail:"date-math 格式提示 · date",values:["now-1d/d","now-1h/h"]},date_nanos:{detail:"date-math 格式提示 · date_nanos",values:["now-1d/d","now-1h/h"]},ip:{detail:"字面提示 · ip",values:["192.168.0.1"]},geo_point:{detail:"字面提示 · geo_point",values:["40.71,-74.01"]}},_i={keyword:{detail:"字面提示 · keyword",values:["pref*"]},wildcard:{detail:"字面提示 · wildcard",values:["pref*"]},long:{detail:"字面提示 · long",values:["1"]},integer:{detail:"字面提示 · integer",values:["1"]},short:{detail:"字面提示 · short",values:["1"]},byte:{detail:"字面提示 · byte",values:["1"]},double:{detail:"字面提示 · double",values:["1.5"]},float:{detail:"字面提示 · float",values:["1.5"]},half_float:{detail:"字面提示 · half_float",values:["1.5"]},scaled_float:{detail:"字面提示 · scaled_float",values:["1.5"]},boolean:{detail:"字面提示 · boolean",values:["true","false"]}};function fi(t,n,e){return n&&w.has(n)?t:e==="range"&&ee[t]!==void 0?n:null}function yi(t,n){return t&&n&&w.has(n)?t:null}const xi={analyzer:{text:'"analyzer": "${1:standard}"',detail:"指定分词器（内置名或自定义组件名）"},text:{text:'"text": "${1:待分词文本}"',detail:"待分词文本（与 field 二选一）"},field:{text:'"field": "${1:field}"',detail:"用该字段的分词链分词（与 analyzer 二选一）"},tokenizer:{text:'"tokenizer": "${1:standard}"',detail:"覆盖 tokenizer（内置名或自定义组件名）"},filter:{text:`"filter": [
  "\${1:lowercase}"
]`,detail:"覆盖 filter 链（数组）"},char_filter:{text:`"char_filter": [
  "\${1:html_strip}"
]`,detail:"覆盖 char_filter 链（数组）"},normalizer:{text:'"normalizer": "${1:lowercase}"',detail:"keyword 字段的归一器"},explain:{text:'"explain": ${1|true,false|}',detail:"输出分词过程明细（每个 token 经过的组件）"}},$i=["standard","simple","whitespace","stop","keyword","pattern","fingerprint","ik_max_word","ik_smart"],gi=["standard","keyword","whitespace","letter","lowercase","ngram","edge_ngram","path_hierarchy","pattern","ik_max_word","ik_smart"],bi=["html_strip","mapping","pattern_replace"],hi=["lowercase","stop","asciifolding","stemmer","synonym","synonym_graph","trim","unique","truncate","word_delimiter","shingle","snowball","ik_max_word","ik_smart"],Ti={standard:"标准分词器：Unicode 词边界切分，中英文通用",simple:"simple：非字母字符切分并转小写",whitespace:"whitespace：仅按空白切分，不做小写化",stop:"stop：小写化并移除停用词（the/a/…）",keyword:"keyword：整串作为单个词元，不切分",pattern:"pattern：按正则匹配到的分隔切分",fingerprint:"fingerprint：排序去重后拼接成单词元（指纹）",ik_max_word:"ik 最细粒度切分：尽可能多地输出组合词",ik_smart:"ik 智能切分：粗粒度，歧义最少",letter:"letter：非字母字符切分",lowercase:"lowercase：非字母切分并转小写（tokenizer）",ngram:"ngram：滑动窗口切出任意 n 元片段",edge_ngram:"edge_ngram：只从前缀方向切 n 元（前缀搜索）",path_hierarchy:"path_hierarchy：按路径分隔符切层级（a/b/c → a、a/b、a/b/c）",html_strip:"html_strip：剥除 HTML 标签只留文本",mapping:"mapping（char_filter）：按映射表替换指定字符串",pattern_replace:"pattern_replace：按正则定位并替换片段",asciifolding:"asciifolding：带音标字符转 ASCII（é → e）",stemmer:"stemmer：词干化（还原词的原形）",snowball:"snowball：Snowball 算法词干化",synonym:"synonym：同义词归一（单词形态）",synonym_graph:"synonym_graph：图结构同义词（支持多词同义）",trim:"trim：去掉词元首尾空白",unique:"unique：去掉重复词元",truncate:"truncate：超长词元截断",word_delimiter:"word_delimiter：按大小写/数字/连字符边界拆分复合词",shingle:"shingle：相邻词元组合成词组（bigram 等）"},ki={analyzer:"分词器（分析入口，与 tokenizer 二选一）",search_analyzer:"查询侧分词器（缺省沿用索引侧 analyzer）",tokenizer:"切词器（把字符流切成词元）",filter:"词元过滤器链（数组，按序生效）",char_filter:"字符过滤器链（数组，切词前改写字符流）",normalizer:"归一器（keyword 字段的规范化管线）",max_token_length:"单个词元最大长度（超长切分）",synonyms_path:"同义词库路径（相对 config/）",stopwords:"停用词清单（_none_ 关闭或语言名）",stopwords_path:"停用词文件路径（相对 config/）",mapping:"字符映射表（mapping 型 char_filter 的替换对）",aliases:"词干规则别名（stemmer/snowball 的同义形态）",type:"组件类型（custom 或内置名）",preserve_original:"保留原词（词干/去重等过滤器是否保留原始词元）",min_gram:"最小词元长度（ngram/edge_ngram 切分下限）",max_gram:"最大词元长度（ngram/edge_ngram 切分上限）",pattern:"匹配正则（pattern_replace/pattern_capture 按它定位片段）",replacement:"替换串（pattern_replace 命中后的改写结果）",flags:"正则标志（CASE_INSENSITIVE / MULTILINE 等）",language:"词干化语言（stemmer/snowball，如 english）",stem_exclusion:"词干排除词表（在册词不做词干化）",max_shingle_size:"组合词元最大个数（shingle 拼接上限）",min_shingle_size:"组合词元最小个数（shingle 拼接下限）",separator:"组合词元连接符（shingle 默认空格）"};function vi(t,n=""){const e=(t||"").split("?")[0].toLowerCase();if(/(^|\/)_bulk(\/|$)/.test(e))return"bulk-body";if(/(^|\/)_update\/[^/]+\/?$/.test(e))return"update-body";if(/(^|\/)_doc\/?$/.test(e)||e.includes("/_doc/")||e.includes("/_create/")||/(^|\/)_source(\/|$)/.test(e))return"doc";if(/(^|\/)_analyze(\/|$)/.test(e))return"analyze";if(/(^|\/)_index_template(\/|$)/.test(e)||/(^|\/)_component_template(\/|$)/.test(e)||/(^|\/)_template(\/|$)/.test(e))return"template";if(/(^|\/)_cluster\/settings(\/|$)/.test(e))return"cluster-settings-body";if(/(^|\/)_cluster\/reroute(\/|$)/.test(e))return"reroute-body";if(/(^|\/)_cluster\/allocation\/explain(\/|$)/.test(e))return"allocation-explain-body";if(n.toUpperCase()==="PUT"&&/(^|\/)_slm\/policy\/[^/]+(\/|$)/.test(e))return"slm-policy-body";if(n.toUpperCase()==="PUT"&&/(^|\/)_(?:xpack\/)?ilm\/policy\/[^/]+(\/|$)/.test(e))return"ilm-policy-body";if(n.toUpperCase()==="POST"&&/(^|\/)_(?:xpack\/)?ilm\/move\/[^/]+(\/|$)/.test(e))return"ilm-move-body";if(n.toUpperCase()==="POST"&&/(^|\/)_(?:xpack\/)?watcher\/watch\/[^/]+\/_execute\/?$/.test(e))return"watch-execute-body";if(n.toUpperCase()==="POST"&&/(^|\/)_(?:xpack\/)?watcher\/watch\/_execute\/?$/.test(e))return"watch-inline-execute-body";if((n.toUpperCase()==="PUT"||n.toUpperCase()==="POST")&&/(^|\/)_(?:xpack\/)?watcher\/watch\/[^/]+\/?$/.test(e))return"watch-body";const a=n.toUpperCase();if(a==="PUT"||a==="POST"){if(/(^|\/)_(?:xpack\/)?security\/role\/[^/]+(\/|$)/.test(e))return"security-role-body";if(/(^|\/)_(?:xpack\/)?security\/user\/[^/]+(\/|$)/.test(e))return"security-user-body";if(/(^|\/)_(?:xpack\/)?security\/role_mapping\/[^/]+(\/|$)/.test(e))return"security-role-mapping-body"}if((a==="PUT"||a==="POST")&&/(^|\/)_(?:xpack\/)?security\/api_key\/?$/.test(e))return"security-api-key-body";if(a==="POST"&&/(^|\/)_(?:xpack\/)?security\/api_key\/grant\/?$/.test(e))return"security-api-key-grant-body";if((a==="GET"||a==="POST")&&/(^|\/)_(?:xpack\/)?security\/_query\/api_key\/?$/.test(e))return"security-api-key-query-body";if(a==="DELETE"&&/(^|\/)_(?:xpack\/)?security\/api_key\/?$/.test(e))return"security-api-key-invalidate-body";if(a==="POST"&&/(^|\/)_(?:xpack\/)?security\/cross_cluster\/api_key\/?$/.test(e))return"security-cross-cluster-api-key-body";if((a==="PUT"||a==="POST")&&/(^|\/)_(?:xpack\/)?security\/privilege\/?$/.test(e))return"security-privilege-body";if(n.toUpperCase()==="PUT"&&/(^|\/)_ingest\/pipeline\/[^/]+(\/|$)/.test(e))return"ingest-pipeline-body";if(n.toUpperCase()==="POST"&&/(^|\/)_ingest\/pipeline\/(?:[^/]+\/)?_simulate(\/|$)/.test(e))return"ingest-simulate-body";if(n.toUpperCase()==="PUT"&&/(^|\/)_enrich\/policy\/[^/]+(\/|$)/.test(e))return"enrich-policy-body";if(n.toUpperCase()==="PUT"&&/(^|\/)_transform\/(?:transforms\/)?[^/]+(\/|$)/.test(e)||n.toUpperCase()==="POST"&&/(^|\/)_transform\/_preview\/?$/.test(e)||n.toUpperCase()==="POST"&&/(^|\/)_transform\/(?:transforms\/)?[^/]+\/_update\/?$/.test(e))return"transform-body";if(n.toUpperCase()==="PUT"&&/(^|\/)_(?:xpack\/)?rollup\/job\/[^/]+(\/|$)/.test(e))return"rollup-job-body";if(n.toUpperCase()==="PUT"&&/(^|\/)_(?:xpack\/)?ml\/datafeeds\/[^/]+(\/|$)/.test(e))return"ml-datafeed-body";if(n.toUpperCase()==="PUT"&&/(^|\/)_(?:xpack\/)?ml\/anomaly_detectors\/[^/]+(\/|$)/.test(e))return"ml-job-body";if(n.toUpperCase()==="PUT"&&/(^|\/)_(?:xpack\/)?ml\/filters\/[^/]+\/?$/.test(e))return"ml-filter-body";if(n.toUpperCase()==="POST"&&/(^|\/)_(?:xpack\/)?ml\/filters\/[^/]+\/_update\/?$/.test(e))return"ml-filter-update-body";if(n.toUpperCase()==="POST"&&/(^|\/)_(?:xpack\/)?ml\/calendars\/[^/]+\/events\/?$/.test(e))return"ml-calendar-events-body";if(n.toUpperCase()==="PUT"&&/(^|\/)_(?:xpack\/)?ml\/calendars\/[^/]+\/?$/.test(e))return"ml-calendar-body";if(n.toUpperCase()==="POST"&&/(^|\/)_graph\/explore(\/|$)/.test(e))return"graph-explore-body";if(n.toUpperCase()==="PUT"&&/(^|\/)_ccr\/follow(\/|$)/.test(e))return"ccr-follow-body";if(n.toUpperCase()==="PUT"&&/(^|\/)_ccr\/auto_follow\/[^/]+(\/|$)/.test(e))return"ccr-auto-follow-body";if((a==="PUT"||a==="POST")&&/(^|\/)_license\/?$/.test(e))return"license-body";if(n.toUpperCase()==="POST"&&/(^|\/)_nodes\/(?:[^/]+\/)?reload_secure_settings\/?$/.test(e))return"nodes-reload-secure-settings-body";if(e.includes("/_snapshot/")){const r=e.split("/").filter(Boolean),s=r.indexOf("_snapshot"),l=s>=0?r.length-s-1:-1,o=n.toUpperCase();if(l===1&&(o==="PUT"||o==="POST")&&!r[s+1].startsWith("_"))return"snapshot-repo-body";if(l===2&&(o==="PUT"||o==="POST")&&!r[s+1].startsWith("_")&&!r[s+2].startsWith("_"))return"snapshot-create-body";if(l===3&&o==="POST"&&r[s+3]==="_restore")return"snapshot-restore-body";if(l===4&&o==="PUT"&&r[s+3]==="_clone")return"snapshot-clone-body";if(l===3&&o==="POST"&&r[s+3]==="_mount")return"snapshot-mount-body"}return/(^|\/)_settings(\/|$)/.test(e)?"settings":/(^|\/)_mapping(\/|$)/.test(e)?"mapping":n.toUpperCase()==="PUT"&&/^\/[^/]+$/.test(e)&&!/^\/_/.test(e)?"index-body":e.includes("/_alias/")?"alias-body":/(^|\/)_reindex(\/|$)/.test(e)?"reindex-body":/(^|\/)_sql(\/|$)/.test(e)?"sql-body":/(^|\/)_eql\/search(\/|$)/.test(e)?"eql-body":/(^|\/)_rollover(\/|$)/.test(e)?"rollover-body":/(^|\/)_delete_by_query(\/|$)/.test(e)?"dbq-body":/(^|\/)_update_by_query(\/|$)/.test(e)?"ubq-body":/(^|\/)_msearch\/template(\/|$)/.test(e)?"msearch-template-body":/(^|\/)_msearch(\/|$)/.test(e)?"msearch-body":/(^|\/)_(search|render)\/template(\/|$)/.test(e)?"template-search-body":/(^|\/)_count(\/|$)/.test(e)||/(^|\/)_explain(\/|$)/.test(e)||/(^|\/)_validate\/query(\/|$)/.test(e)?"query-body":/(^|\/)_mget(\/|$)/.test(e)?"mget-body":n.toUpperCase()==="POST"&&/(^|\/)_scripts\/[^/]+\/(?:[^/]+\/)?_execute(\/|$)/.test(e)?"script-execute-body":(n.toUpperCase()==="PUT"||n.toUpperCase()==="POST")&&/(^|\/)_scripts\/[^/]+(\/|$)/.test(e)&&!/(^|\/)_execute(\/|$)/.test(e)?"stored-script-body":/(^|\/)_aliases(\/|$)/.test(e)?"aliases-body":/(^|\/)_clear_scroll(\/|$)/.test(e)?"clear-scroll-body":/(^|\/)_search\/scroll(\/|$)/.test(e)?n.toUpperCase()==="DELETE"?"clear-scroll-body":"scroll-body":/(^|\/)_mtermvectors(\/|$)/.test(e)?"mtermvectors-body":/(^|\/)_termvectors(\/|$)/.test(e)?"termvectors-body":/(^|\/)_field_caps(\/|$)/.test(e)?"field-caps-body":/(^|\/)_terms_enum(\/|$)/.test(e)?"terms-enum-body":/(^|\/)_rank_eval(\/|$)/.test(e)?"rank-eval-body":e.includes("/_scripts")||e.includes("/_script/")||e.includes("/_close")||e.includes("/_open")||e.includes("/_forcemerge")?"none":"search"}function wi(t){const n=(t||"").split("?")[0].toLowerCase();return/(^|\/)_bulk(\/|$)/.test(n)||/(^|\/)_msearch(\/|$)/.test(n)?"ndjson":"json"}function qi(){return[{label:"index",detail:"检索目标索引（可数组或用逗号分隔）",snippet:!0,insertText:'"index": "${1:my-index}"'},{label:"search_type",detail:"查询类型（默认 query_then_fetch）",snippet:!0,insertText:'"search_type": "${1|query_then_fetch,dfs_query_then_fetch|}"'},{label:"routing",detail:"检索路由值",snippet:!0,insertText:'"routing": "${1:routing}"'},{label:"preference",detail:"副本偏好（如 _local）",snippet:!0,insertText:'"preference": "${1:_local}"'},{label:"ignore_unavailable",detail:"索引缺失时是否跳过",snippet:!0,insertText:'"ignore_unavailable": ${1|true,false|}'},{label:"allow_no_indices",detail:"通配无匹配时是否报错",snippet:!0,insertText:'"allow_no_indices": ${1|true,false|}'},{label:"expand_wildcards",detail:"通配展开范围",snippet:!0,insertText:'"expand_wildcards": "${1|open,closed,none,all|}"'},{label:"ccs_minimize_roundtrips",detail:"跨集群检索减少往返",snippet:!0,insertText:'"ccs_minimize_roundtrips": ${1|true,false|}'}]}function Ki(t,n){const e=Math.max(0,Math.min(n,t.length)),a=t.lastIndexOf(`
`,Math.max(0,e-1))+1;return t.slice(0,a).split(`
`).filter(s=>s.trim().length>0).length%2===0}function Ii(){return[{label:"id",detail:"已存搜索模板 id（与 source 二选一）",snippet:!0,insertText:'"id": "${1:my-template}"'},{label:"source",detail:"内联 Mustache 模板",snippet:!0,insertText:`"source": {
  \${0}
}`},{label:"params",detail:"模板参数",snippet:!0,insertText:`"params": {
  \${0}
}`}]}const P=["index","create","update","delete"];function Si(){return[{label:"index",detail:"写入/覆盖文档",snippet:!0,insertText:'"index": { "_index": "${1:my-index}", "_id": "${2:1}" }'},{label:"create",detail:"仅新建（已存在则失败）",snippet:!0,insertText:'"create": { "_index": "${1:my-index}", "_id": "${2:1}" }'},{label:"update",detail:'部分更新（下一行 {"doc": …}）',snippet:!0,insertText:'"update": { "_index": "${1:my-index}", "_id": "${2:1}" }'},{label:"delete",detail:"删除（不带文档行）",snippet:!0,insertText:'"delete": { "_index": "${1:my-index}", "_id": "${2:1}" }'}]}function Ri(t){const n=[{label:"_index",detail:"目标索引",snippet:!0,insertText:'"_index": "${1:my-index}"'},{label:"_id",detail:"文档 id",snippet:!0,insertText:'"_id": "${1:1}"'},{label:"routing",detail:"路由值",snippet:!0,insertText:'"routing": "${1:routing}"'},{label:"version",detail:"期望版本",snippet:!0,insertText:'"version": ${1:1}'},{label:"version_type",detail:"版本类型",snippet:!0,insertText:'"version_type": "${1|internal,external|}"'},{label:"if_seq_no",detail:"并发控制：序号",snippet:!0,insertText:'"if_seq_no": ${1:1}'},{label:"if_primary_term",detail:"并发控制：主任期",snippet:!0,insertText:'"if_primary_term": ${1:1}'}];return t==="update"&&n.push({label:"retry_on_conflict",detail:"版本冲突重试次数",snippet:!0,insertText:'"retry_on_conflict": ${1:3}'}),n}function Ei(t,n=t.length){const e=Math.max(0,Math.min(n,t.length)),a=t.lastIndexOf(`
`,Math.max(0,e-1))+1,r=t.slice(0,a).split(`
`).map(l=>l.trim()).filter(Boolean);let s=!1;for(const l of r){if(s){s=!1;continue}let o=null;try{o=JSON.parse(l)}catch{continue}const f=o&&typeof o=="object"?P.find(y=>y in o):void 0;s=!!f&&f!=="delete"}return s?"doc":"action"}function Ai(t,n=t.length){const e=u(t,n);if(e.length<2)return null;const a=e[0];return a&&P.includes(a)?a:null}function se(){return[{label:"fields",detail:"要查询能力的字段（数组，可用通配）",snippet:!0,insertText:'"fields": ["${1:field}"]'},{label:"index_filter",detail:"只看命中文档的字段能力（Query DSL）",snippet:!0,insertText:`"index_filter": {
  \${0}
}`},{label:"runtime_mappings",detail:"本次查询的运行时字段",snippet:!0,insertText:`"runtime_mappings": {
  \${0}
}`}]}function le(){return[{label:"field",detail:"枚举哪个字段的词项",snippet:!0,insertText:'"field": "${1:field}"'},{label:"string",detail:"前缀/模糊串",snippet:!0,insertText:'"string": "${1:prefix}"'},{label:"size",detail:"最多返回多少个词项",snippet:!0,insertText:'"size": ${1:10}'},{label:"case_insensitive",detail:"大小写不敏感",snippet:!0,insertText:'"case_insensitive": ${1|true,false|}'},{label:"index_filter",detail:"只看命中文档（Query DSL）",snippet:!0,insertText:`"index_filter": {
  \${0}
}`},{label:"timeout",detail:"超时时间",snippet:!0,insertText:'"timeout": "${1:1s}"'},{label:"search_after",detail:"翻页游标（上一页最后的词项）",snippet:!0,insertText:'"search_after": "${1:term}"'}]}function zi(t,n=t.length){const e=u(t,n);return e.length<=1?"root":e[0]==="index_filter"?"query":"deep"}function oe(){return[{label:"requests",detail:"命名排序评估请求（每项含 request/ratings）",snippet:!0,insertText:`"requests": {
  "\${1:query}": {
    "request": { "query": { "match_all": {} } },
    "ratings": []
  }
}`},{label:"metric",detail:"评估指标（dcg/ndcg/precision/recall/mean_reciprocal_rank）",snippet:!0,insertText:`"metric": {
  "\${1|dcg,ndcg,precision,recall,mean_reciprocal_rank|}": {}
}`}]}function Pi(){return[{label:"request",detail:"搜索请求体（query/size/sort…）",snippet:!0,insertText:`"request": {
  "query": { "match_all": {} }
}`},{label:"ratings",detail:"评分（文档 id 与评分对）",snippet:!0,insertText:'"ratings": [\n  { "_index": "${1:my-index}", "_id": "${2:1}", "rating": ${3:1} }\n]'}]}function Bi(){return[{label:"dcg",detail:"折损累计增益",snippet:!0,insertText:`"dcg": {
  "k": \${1:10},
  "normalize": \${2|false,true|}
}`},{label:"ndcg",detail:"归一化折损累计增益",snippet:!0,insertText:`"ndcg": {
  "k": \${1:10},
  "normalize": \${2|false,true|}
}`},{label:"precision",detail:"前 k 命中精度",snippet:!0,insertText:`"precision": {
  "k": \${1:10}
}`},{label:"recall",detail:"前 k 召回",snippet:!0,insertText:`"recall": {
  "k": \${1:10}
}`},{label:"mean_reciprocal_rank",detail:"平均倒数排名",snippet:!0,insertText:'"mean_reciprocal_rank": {}'}]}function Ci(t,n=t.length){const e=u(t,n);return e.length<=1?"root":e[0]==="requests"&&e.length===3?"request-item":e[0]==="metric"&&e.length===2?"metric":"deep"}function Oi(t,n){const e=Math.max(0,Math.min(n,t.length));let a=-1;for(let o=e-1;o>=0;o--){const f=t[o];if(f==="'"){a=o;break}if(f===`
`||f==="["||f==="]"||f==='"')return null}if(a<0||e<=a)return null;let r=-1;for(let o=e;o<t.length;o++){if(t[o]==="'"){r=o;break}if(t[o]===`
`)return null}if(r<0||a===0||t[a-1]!=="[")return null;let s=a-2;for(;s>=0&&/\w/.test(t[s]);)s--;const l=t.slice(s+1,a-1);return l!=="doc"&&l!=="ctx"?null:t.slice(a+1,r)}function Li(){return R.map(t=>({label:t.key,detail:`${t.desc}（例：${t.example}）`,insertText:'"'+t.key+'"'}))}function de(){return[{label:"persistent",detail:"持久化集群设置（重启后仍生效）",snippet:!0,insertText:`"persistent": {
  \${0}
}`},{label:"transient",detail:"临时集群设置（重启后丢失）",snippet:!0,insertText:`"transient": {
  \${0}
}`}]}function Ui(){return X.map(t=>({label:t.key,detail:`${t.desc}（例：${t.example}）`,insertText:'"'+t.key+'"'}))}function Mi(t,n){const e=u(t,n);return e.length<=1?"root":(e[0]==="persistent"||e[0]==="transient")&&e.length===2?"settings":"deep"}const pe=["move","cancel","allocate_replica","allocate_stale_primary","allocate_empty_primary"];function ue(){return[{label:"commands",detail:"一条或多条重路由命令",snippet:!0,insertText:'"commands": [\n  {\n    "move": { "index": "${1:my-index}", "shard": ${2:0}, "from_node": "${3:node-a}", "to_node": "${4:node-b}" }\n  }\n]'}]}function Ni(){return[{label:"move",detail:"把分片从一个节点迁到另一个节点",snippet:!0,insertText:'"move": { "index": "${1:my-index}", "shard": ${2:0}, "from_node": "${3:node-a}", "to_node": "${4:node-b}" }'},{label:"cancel",detail:"取消分片的正在进行的分配/恢复",snippet:!0,insertText:'"cancel": { "index": "${1:my-index}", "shard": ${2:0}, "node": "${3:node-a}" }'},{label:"allocate_replica",detail:"给未分配副本指定节点",snippet:!0,insertText:'"allocate_replica": { "index": "${1:my-index}", "shard": ${2:0}, "node": "${3:node-a}" }'},{label:"allocate_stale_primary",detail:"用陈旧副本强制分配主分片（可能丢数据）",snippet:!0,insertText:'"allocate_stale_primary": { "index": "${1:my-index}", "shard": ${2:0}, "node": "${3:node-a}", "accept_data_loss": true }'},{label:"allocate_empty_primary",detail:"用空分片强制分配主分片（数据丢失）",snippet:!0,insertText:'"allocate_empty_primary": { "index": "${1:my-index}", "shard": ${2:0}, "node": "${3:node-a}", "accept_data_loss": true }'}]}function Fi(t){const n=[{label:"index",detail:"目标索引",snippet:!0,insertText:'"index": "${1:my-index}"'},{label:"shard",detail:"分片序号",snippet:!0,insertText:'"shard": ${1:0}'}];if(t==="move")return[...n,{label:"from_node",detail:"迁出节点",snippet:!0,insertText:'"from_node": "${1:node-a}"'},{label:"to_node",detail:"迁入节点",snippet:!0,insertText:'"to_node": "${1:node-b}"'}];if(t==="cancel")return[...n,{label:"node",detail:"取消该节点上的分配/恢复",snippet:!0,insertText:'"node": "${1:node-a}"'},{label:"allow_primary",detail:"允许取消主分片恢复（默认 false）",snippet:!0,insertText:'"allow_primary": ${1|true,false|}'}];const e=[...n,{label:"node",detail:"目标节点",snippet:!0,insertText:'"node": "${1:node-a}"'}];return(t==="allocate_stale_primary"||t==="allocate_empty_primary")&&e.push({label:"accept_data_loss",detail:"确认接受数据丢失（必填 true）",snippet:!0,insertText:'"accept_data_loss": ${1|true,false|}'}),e}function ji(t,n){const e=u(t,n);return e.length<=1?"root":e[0]==="commands"&&e.length===3?"command":e[0]==="commands"&&e.length===4&&e[2]&&pe.includes(e[2])?"params":"deep"}function Di(t,n){const e=u(t,n);return e[0]==="commands"&&e.length>=4?e[2]??"":""}const Gi=[{label:"fs",detail:"共享文件系统（需 path.repo）"},{label:"url",detail:"只读 URL 仓库（http/https/file）"},{label:"s3",detail:"AWS S3（repository-s3 插件）"},{label:"gcs",detail:"Google Cloud Storage（repository-gcs 插件）"},{label:"azure",detail:"Azure Blob（repository-azure 插件）"},{label:"hdfs",detail:"HDFS（repository-hdfs 插件）"}];function ce(){return[{label:"type",detail:"仓库类型（fs/url/s3/gcs/azure/hdfs）",snippet:!0,insertText:'"type": "${1|fs,url,s3,gcs,azure,hdfs|}"'},{label:"settings",detail:"仓库连接/存储参数（location、bucket、base_path…）",snippet:!0,insertText:`"settings": {
  \${0}
}`},{label:"verify",detail:"注册时校验仓库可读写（默认 true）",snippet:!0,insertText:'"verify": ${1|true,false|}'}]}function me(){return[{label:"indices",detail:"要包含的索引（支持通配/逗号串或数组，省略=全部）",snippet:!0,insertText:'"indices": "${1:*}"'},{label:"ignore_unavailable",detail:"忽略不存在的索引",snippet:!0,insertText:'"ignore_unavailable": ${1|true,false|}'},{label:"include_global_state",detail:"包含集群全局状态（模板/持久设置等）",snippet:!0,insertText:'"include_global_state": ${1|false,true|}'},{label:"partial",detail:"允许部分分片缺失的快照（默认 false）",snippet:!0,insertText:'"partial": ${1|false,true|}'},{label:"metadata",detail:"附加到快照的自定义元数据",snippet:!0,insertText:`"metadata": {
  \${0}
}`},{label:"feature_states",detail:"要包含的功能状态（如 geoip）",snippet:!0,insertText:'"feature_states": ["${1:geoip}"]'}]}function _e(){return[{label:"indices",detail:"要恢复的索引（省略=全部）",snippet:!0,insertText:'"indices": "${1:*}"'},{label:"ignore_unavailable",detail:"忽略快照中不存在的索引",snippet:!0,insertText:'"ignore_unavailable": ${1|true,false|}'},{label:"include_global_state",detail:"恢复集群全局状态（高危：会覆盖当前集群状态）",snippet:!0,insertText:'"include_global_state": ${1|false,true|}'},{label:"partial",detail:"允许部分恢复",snippet:!0,insertText:'"partial": ${1|false,true|}'},{label:"rename_pattern",detail:"索引重命名正则（源名匹配）",snippet:!0,insertText:'"rename_pattern": "${1:(.+)}"'},{label:"rename_replacement",detail:"重命名替换串（$1 引用分组）",snippet:!0,insertText:'"rename_replacement": "${1:restored_$1}"'},{label:"include_aliases",detail:"同时恢复别名",snippet:!0,insertText:'"include_aliases": ${1|true,false|}'},{label:"index_settings",detail:"恢复时覆盖的索引设置",snippet:!0,insertText:`"index_settings": {
  \${0}
}`},{label:"ignore_index_settings",detail:"恢复时忽略的索引设置键",snippet:!0,insertText:'"ignore_index_settings": ["${1:index.refresh_interval}"]'},{label:"feature_states",detail:"要恢复的功能状态",snippet:!0,insertText:'"feature_states": ["${1:geoip}"]'}]}function fe(){return[{label:"schedule",detail:"执行计划（cron，如 0 30 1 * * ?）",snippet:!0,insertText:'"schedule": "${1:0 30 1 * * ?}"'},{label:"name",detail:"快照名模板（支持 <date-{now/d}> 等日期数学）",snippet:!0,insertText:'"name": "${1:<snapshot-{now/d}>}"'},{label:"repository",detail:"目标快照仓库",snippet:!0,insertText:'"repository": "${1:my_repo}"'},{label:"config",detail:"快照内容配置（索引/全局状态等）",snippet:!0,insertText:`"config": {
  \${0}
}`},{label:"retention",detail:"保留策略（过期时间/最大最小份数）",snippet:!0,insertText:`"retention": {
  \${0}
}`}]}function ye(){return[{label:"indices",detail:"要包含的索引（通配/逗号串或数组）",snippet:!0,insertText:'"indices": "${1:*}"'},{label:"ignore_unavailable",detail:"忽略不存在的索引",snippet:!0,insertText:'"ignore_unavailable": ${1|true,false|}'},{label:"include_global_state",detail:"包含集群全局状态",snippet:!0,insertText:'"include_global_state": ${1|false,true|}'},{label:"partial",detail:"允许部分分片缺失的快照",snippet:!0,insertText:'"partial": ${1|false,true|}'},{label:"metadata",detail:"附加到快照的自定义元数据",snippet:!0,insertText:`"metadata": {
  \${0}
}`},{label:"feature_states",detail:"要包含的功能状态（如 geoip）",snippet:!0,insertText:'"feature_states": ["${1:geoip}"]'}]}function xe(){return[{label:"expire_after",detail:"保留时长（如 30d；到期删除）",snippet:!0,insertText:'"expire_after": "${1:30d}"'},{label:"min_count",detail:"最少保留份数（即使过期也保留）",snippet:!0,insertText:'"min_count": ${1:5}'},{label:"max_count",detail:"最多保留份数（超出删除最旧）",snippet:!0,insertText:'"max_count": ${1:50}'}]}function Yi(t,n){const e=u(t,n);return e.length<=1?"root":e[0]==="config"&&e.length===2?"config":e[0]==="retention"&&e.length===2?"retention":"deep"}const I=["hot","warm","cold","frozen","delete"],Hi=["min_age","actions"],B=["rollover","forcemerge","shrink","allocate","freeze","unfreeze","delete","set_priority","searchable_snapshot","readonly","unfollow","wait_for_snapshot","migrate","downsample"];function $e(){return[{label:"policy",detail:"生命周期策略（内含 phases）",snippet:!0,insertText:`"policy": {
  \${0}
}`}]}function ge(){return[{label:"phases",detail:"阶段表（hot/warm/cold/frozen/delete）",snippet:!0,insertText:`"phases": {
  \${0}
}`}]}function Qi(){return[{label:"hot",detail:"热阶段（写入/滚动）",snippet:!0,insertText:`"hot": {
  "actions": {
    "rollover": { "max_size": "\${1:50gb}", "max_age": "\${2:30d}" }
  }
}`},{label:"warm",detail:"温阶段（合并/降副本）",snippet:!0,insertText:`"warm": {
  "min_age": "\${1:30d}",
  "actions": {
    "forcemerge": { "max_num_segments": \${2:1} }
  }
}`},{label:"cold",detail:"冷阶段（冻结/可搜索快照）",snippet:!0,insertText:`"cold": {
  "min_age": "\${1:60d}",
  "actions": {
    "set_priority": { "priority": \${2:0} }
  }
}`},{label:"frozen",detail:"冻结阶段（部分/完全冻结）",snippet:!0,insertText:`"frozen": {
  "min_age": "\${1:90d}",
  "actions": {
    "searchable_snapshot": { "snapshot_repository": "\${2:my_repo}" }
  }
}`},{label:"delete",detail:"删除阶段（到期删除）",snippet:!0,insertText:`"delete": {
  "min_age": "\${1:180d}",
  "actions": { "delete": {} }
}`}]}function Wi(){return[{label:"min_age",detail:"进入该阶段的最小年龄（如 30d/12h/0ms）",snippet:!0,insertText:'"min_age": "${1:30d}"'},{label:"actions",detail:"该阶段要执行的动作",snippet:!0,insertText:`"actions": {
  \${0}
}`}]}function Vi(){const t={rollover:{text:'"rollover": { "max_size": "${1:50gb}", "max_age": "${2:30d}" }',detail:"滚动到新索引"},forcemerge:{text:'"forcemerge": { "max_num_segments": ${1:1} }',detail:"强制合并段"},shrink:{text:'"shrink": { "number_of_shards": ${1:1} }',detail:"缩减主分片数"},allocate:{text:'"allocate": { "number_of_replicas": ${1:1}, "total_shards_per_node": ${2:-1} }',detail:"调整副本/分片分配"},freeze:{text:'"freeze": {}',detail:"冻结索引（关闭写入释放内存）"},unfreeze:{text:'"unfreeze": {}',detail:"取消冻结索引（恢复写入）"},delete:{text:'"delete": {}',detail:"删除索引（不可恢复）"},set_priority:{text:'"set_priority": { "priority": ${1:50} }',detail:"调整恢复优先级"},searchable_snapshot:{text:'"searchable_snapshot": { "snapshot_repository": "${1:my_repo}" }',detail:"转可搜索快照"},readonly:{text:'"readonly": {}',detail:"设为只读"},unfollow:{text:'"unfollow": {}',detail:"停止跟随远程集群"},wait_for_snapshot:{text:'"wait_for_snapshot": { "policy": "${1:my_policy}" }',detail:"等待指定 SLM 快照"},migrate:{text:'"migrate": { "number_of_replicas": ${1:1} }',detail:"迁移分片（旧版）"},downsample:{text:'"downsample": { "fixed_interval": "${1:1d}" }',detail:"降采样时间序列索引"}};return B.map(n=>{var e,a;return{label:n,detail:((e=t[n])==null?void 0:e.detail)??"ILM 动作",snippet:!0,insertText:((a=t[n])==null?void 0:a.text)??'"'+n+`": {
  \${0}
}`}})}function Ji(t,n){const e=u(t,n);return e.length<=1?"root":e[0]!=="policy"?"deep":e.length===2?"policy":e[1]!=="phases"?"deep":e.length===3?"phases":e.length===4&&e[2]&&I.includes(e[2])?"phase":e.length===5&&e[2]&&I.includes(e[2])&&e[3]==="actions"?"actions":"deep"}const Zi=["schedule","chain"],Xi=["interval","cron","daily","hourly","weekly","monthly","yearly"],en=["search","simple","http","chain"],tn=["always","never","compare","array_compare","script"],nn=["email","webhook","index","logging","slack","pagerduty","jira"];function be(){return[{label:"trigger",detail:"触发方式（schedule/chain）",snippet:!0,insertText:'"trigger": { "schedule": { "interval": "${1:5m}" } }'},{label:"input",detail:"输入（search/simple/http/chain）",snippet:!0,insertText:`"input": {
  "search": {
    "request": { "indices": ["\${1:logs-*}"], "body": { "query": { "match_all": {} } } }
  }
}`},{label:"condition",detail:"执行条件（always/never/compare/script…）",snippet:!0,insertText:'"condition": { "compare": { "ctx.payload.hits.total": { "gt": ${1:0} } } }'},{label:"actions",detail:"动作（动作名自由命名，值为动作类型）",snippet:!0,insertText:`"actions": {
  "notify": {
    "logging": { "text": "\${1:watch fired}" }
  }
}`},{label:"metadata",detail:"附加到 watch 的自定义元数据",snippet:!0,insertText:`"metadata": {
  \${0}
}`},{label:"throttle_period",detail:"动作节流窗口（如 5m；窗口内只执行一次）",snippet:!0,insertText:'"throttle_period": "${1:5m}"'}]}function he(){return[{label:"schedule",detail:"定时触发（interval/cron/日历）",snippet:!0,insertText:'"schedule": { "interval": "${1:5m}" }'},{label:"chain",detail:"链式触发（前序 watch 完成后触发）",snippet:!0,insertText:'"chain": [\n  { "inputs": ["${1:first_watch}"], "trigger": { "schedule": { "interval": "${2:5m}" } } }\n]'}]}function an(){return[{label:"inputs",detail:"前序 input 名称清单（按序执行）",snippet:!0,insertText:'"inputs": ["${1:first_input}"]'},{label:"trigger",detail:"链式触发器内的定时调度",snippet:!0,insertText:'"trigger": { "schedule": { "interval": "${1:5m}" } }'}]}function rn(){return he().filter(t=>t.label==="schedule")}function sn(){return[{label:"interval",detail:"固定间隔（如 5m/30s）",snippet:!0,insertText:'"interval": "${1:5m}"'},{label:"cron",detail:"cron 表达式（如 0 0/5 * * * ?）",snippet:!0,insertText:'"cron": "${1:0 0/5 * * * ?}"'},{label:"daily",detail:"每天固定时刻",snippet:!0,insertText:'"daily": { "at": ["${1:12:00}"] }'},{label:"hourly",detail:"每小时固定分钟",snippet:!0,insertText:'"hourly": { "minute": [${1:0}] }'},{label:"weekly",detail:"每周固定时刻",snippet:!0,insertText:'"weekly": { "on": ["${1:monday}"], "at": ["${2:12:00}"] }'},{label:"monthly",detail:"每月固定日/时刻",snippet:!0,insertText:'"monthly": { "on": [${1:1}], "at": ["${2:12:00}"] }'},{label:"yearly",detail:"每年固定月/日/时刻",snippet:!0,insertText:'"yearly": { "in": ["${1:january}"], "on": [${2:1}], "at": ["${3:12:00}"] }'}]}function ln(){return[{label:"search",detail:"执行一次检索作为 payload",snippet:!0,insertText:`"search": {
  "request": { "indices": ["\${1:logs-*}"], "body": { "query": { "match_all": {} } } }
}`},{label:"simple",detail:"静态 payload（不请求 ES）",snippet:!0,insertText:`"simple": {
  \${0}
}`},{label:"http",detail:"调用外部 HTTP 接口",snippet:!0,insertText:'"http": { "request": { "host": "${1:example.com}", "port": ${2:443}, "scheme": "${3:https}", "path": "${4:/}" } }'},{label:"chain",detail:"串联多个输入",snippet:!0,insertText:`"chain": { "inputs": [
  \${0}
] }`}]}function on(){return[{label:"always",detail:"恒真（每次触发都执行动作）",snippet:!0,insertText:'"always": {}'},{label:"never",detail:"恒假（只记录不执行）",snippet:!0,insertText:'"never": {}'},{label:"compare",detail:"比较 payload 路径与值",snippet:!0,insertText:'"compare": { "ctx.payload.hits.total": { "gt": ${1:0} } }'},{label:"array_compare",detail:"比较数组元素",snippet:!0,insertText:'"array_compare": { "ctx.payload.hits.hits": { "path": "${1:_source.level}", "gte": "${2:error}" } }'},{label:"script",detail:"用脚本判定",snippet:!0,insertText:'"script": { "source": "${1:return ctx.payload.hits.total > 0}" }'}]}function dn(){return[{label:"email",detail:"发邮件（需配置邮件账户）",snippet:!0,insertText:'"email": { "to": "${1:ops@example.com}", "subject": "${2:watch fired}", "body": { "text": "${3:detail}" } }'},{label:"webhook",detail:"POST 到外部 URL",snippet:!0,insertText:'"webhook": { "method": "${1:POST}", "url": "${2:https://example.com/hook}", "body": "${3:payload}" }'},{label:"index",detail:"把 payload 写入索引",snippet:!0,insertText:'"index": { "index": "${1:watch-results}", "doc_id": "${2:{{ctx.watch_id}}}" }'},{label:"logging",detail:"写一条日志（最简，便于验证）",snippet:!0,insertText:'"logging": { "text": "${1:watch fired}" }'},{label:"slack",detail:"发 Slack 消息",snippet:!0,insertText:'"slack": { "message": { "text": "${1:watch fired}" } }'},{label:"pagerduty",detail:"触发 PagerDuty 事件",snippet:!0,insertText:'"pagerduty": { "event_type": "${1:trigger}", "description": "${2:watch fired}" }'},{label:"jira",detail:"创建 Jira 工单",snippet:!0,insertText:'"jira": { "fields": { "project": { "key": "${1:OPS}" }, "issuetype": { "name": "${2:Task}" }, "summary": "${3:watch fired}" } }'}]}function Te(t){return t==="script"?F():[]}function pn(){return[{label:"path",detail:"数组元素的取值路径（如 _source.status）",snippet:!0,insertText:'"path": "${1:_source.status}"'},{label:"eq",detail:"等于（quantifier + value）",snippet:!0,insertText:'"eq": { "quantifier": "${1|some,all|}", "value": "${2:error}" }'},{label:"not_eq",detail:"不等于",snippet:!0,insertText:'"not_eq": { "quantifier": "${1|some,all|}", "value": "${2:error}" }'},{label:"lt",detail:"小于",snippet:!0,insertText:'"lt": { "quantifier": "${1|some,all|}", "value": ${2:0} }'},{label:"gt",detail:"大于",snippet:!0,insertText:'"gt": { "quantifier": "${1|some,all|}", "value": ${2:0} }'},{label:"lte",detail:"小于等于",snippet:!0,insertText:'"lte": { "quantifier": "${1|some,all|}", "value": ${2:0} }'},{label:"gte",detail:"大于等于",snippet:!0,insertText:'"gte": { "quantifier": "${1|some,all|}", "value": ${2:0} }'}]}function un(){return[{label:"quantifier",detail:"量词（some=任一 / all=全部）",snippet:!0,insertText:'"quantifier": "${1|some,all|}"'},{label:"value",detail:"比较值",snippet:!0,insertText:'"value": "${1:error}"'}]}function ke(){return[{label:"url",detail:"完整 URL（与 scheme/host/path 二选一）",snippet:!0,insertText:'"url": "${1:https://example.com/hook}"'},{label:"method",detail:"HTTP 方法",snippet:!0,insertText:'"method": "${1|POST,GET,PUT,DELETE|}"'},{label:"scheme",detail:"协议",snippet:!0,insertText:'"scheme": "${1|https,http|}"'},{label:"host",detail:"主机名",snippet:!0,insertText:'"host": "${1:example.com}"'},{label:"port",detail:"端口",snippet:!0,insertText:'"port": ${1:443}'},{label:"path",detail:"路径",snippet:!0,insertText:'"path": "${1:/hook}"'},{label:"params",detail:"查询参数",snippet:!0,insertText:'"params": {\n  "${1:key}": "${2:value}"\n}'},{label:"headers",detail:"请求头",snippet:!0,insertText:'"headers": {\n  "${1:Content-Type}": "${2:application/json}"\n}'},{label:"body",detail:"请求体（字符串，常配 mustache）",snippet:!0,insertText:'"body": "${1:{{ctx.payload}}}"'},{label:"auth",detail:"认证（basic 等）",snippet:!0,insertText:`"auth": {
  \${0}
}`},{label:"connection_timeout",detail:"连接超时",snippet:!0,insertText:'"connection_timeout": "${1:10s}"'},{label:"read_timeout",detail:"读取超时",snippet:!0,insertText:'"read_timeout": "${1:10s}"'},{label:"proxy",detail:"代理配置",snippet:!0,insertText:`"proxy": {
  \${0}
}`}]}function cn(){return[{label:"username",detail:"Basic 认证用户名",snippet:!0,insertText:'"username": "${1:user}"'},{label:"password",detail:"Basic 认证密码",snippet:!0,insertText:'"password": "${1:secret}"'}]}function mn(){return[{label:"host",detail:"代理主机",snippet:!0,insertText:'"host": "${1:proxy.example.com}"'},{label:"port",detail:"代理端口",snippet:!0,insertText:'"port": ${1:8080}'}]}function _n(){return[{label:"request",detail:"HTTP 请求定义（url/method/headers/body…）",snippet:!0,insertText:`"request": {
  "url": "\${1:https://example.com/input}"
}`},{label:"extract",detail:"从响应中提取的字段清单",snippet:!0,insertText:'"extract": ["${1:field}"]'},{label:"response_content_type",detail:"响应内容类型",snippet:!0,insertText:'"response_content_type": "${1|json,yaml,text|}"'}]}function fn(){return[{label:"inputs",detail:"串联的命名输入（每项一个 input 定义）",snippet:!0,insertText:`"inputs": [
  { "\${1:first}": { "simple": {} } }
]`}]}function yn(){return[{label:"request",detail:"检索请求定义（indices/body/template…）",snippet:!0,insertText:`"request": {
  "indices": ["\${1:logs-*}"],
  "body": { "query": { "match_all": {} } }
}`},{label:"extract",detail:"从命中中提取的字段清单",snippet:!0,insertText:'"extract": ["${1:field}"]'},{label:"timeout",detail:"检索超时",snippet:!0,insertText:'"timeout": "${1:1m}"'}]}function xn(){return[{label:"indices",detail:"检索目标索引（数组/通配）",snippet:!0,insertText:'"indices": ["${1:logs-*}"]'},{label:"body",detail:"检索体（query/sort/aggs…）",snippet:!0,insertText:`"body": {
  \${0}
}`},{label:"template",detail:"检索模板（id/source/params）",snippet:!0,insertText:'"template": { "id": "${1:my-template}" }'},{label:"search_type",detail:"查询类型",snippet:!0,insertText:'"search_type": "${1|query_then_fetch,dfs_query_then_fetch|}"'},{label:"indices_options",detail:"索引选项（通配展开/忽略缺失）",snippet:!0,insertText:`"indices_options": {
  "expand_wildcards": ["\${1:open}"],
  "ignore_unavailable": \${2|true,false|}
}`},{label:"rest_total_hits_as_int",detail:"hits.total 以整数返回",snippet:!0,insertText:'"rest_total_hits_as_int": ${1|false,true|}'}]}function ve(t){switch(t){case"index":return[{label:"index",detail:"写入目标索引（可含日期数学）",snippet:!0,insertText:'"index": "${1:watch-results}"'},{label:"doc_id",detail:"文档 id（可含 mustache 变量）",snippet:!0,insertText:'"doc_id": "${1:{{ctx.watch_id}}}"'},{label:"refresh",detail:"写入后刷新策略",snippet:!0,insertText:'"refresh": "${1|false,true,wait_for|}"'},{label:"op_type",detail:"写入形态（create=已存在则失败）",snippet:!0,insertText:'"op_type": "${1|create,index|}"'},{label:"timeout",detail:"写入超时",snippet:!0,insertText:'"timeout": "${1:60s}"'},{label:"execution_time_field",detail:"执行时间写入的字段名",snippet:!0,insertText:'"execution_time_field": "${1:execution_time}"'}];case"logging":return[{label:"level",detail:"日志级别",snippet:!0,insertText:'"level": "${1|info,warn,error,debug|}"'},{label:"text",detail:"日志正文（可含 mustache）",snippet:!0,insertText:'"text": "${1:watch fired}"'},{label:"category",detail:"日志分类（logger 后缀）",snippet:!0,insertText:'"category": "${1:watch}"'}];case"email":return[{label:"to",detail:"收件人（数组或逗号串）",snippet:!0,insertText:'"to": ["${1:ops@example.com}"]'},{label:"subject",detail:"邮件主题（可含 mustache）",snippet:!0,insertText:'"subject": "${1:watch fired}"'},{label:"body",detail:"邮件正文（text/html）",snippet:!0,insertText:'"body": { "text": "${1:detail}" }'},{label:"from",detail:"发件人（覆盖账户默认）",snippet:!0,insertText:'"from": "${1:watcher@example.com}"'},{label:"cc",detail:"抄送",snippet:!0,insertText:'"cc": ["${1:cc@example.com}"]'},{label:"bcc",detail:"密送",snippet:!0,insertText:'"bcc": ["${1:bcc@example.com}"]'},{label:"reply_to",detail:"回复地址",snippet:!0,insertText:'"reply_to": "${1:reply@example.com}"'},{label:"priority",detail:"邮件优先级",snippet:!0,insertText:'"priority": "${1|normal,lowest,low,high,highest|}"'},{label:"attachments",detail:"附件（http/reporting/data 三类）",snippet:!0,insertText:`"attachments": {
  \${0}
}`}];case"webhook":return ke();case"slack":return[{label:"account",detail:"Slack 账户（省略用默认）",snippet:!0,insertText:'"account": "${1:slack-account}"'},{label:"message",detail:"消息体（text/from/to/attachments）",snippet:!0,insertText:`"message": {
  "text": "\${1:watch fired}"
}`}];case"pagerduty":return[{label:"account",detail:"PagerDuty 账户（省略用默认）",snippet:!0,insertText:'"account": "${1:pagerduty-account}"'},{label:"description",detail:"事件描述",snippet:!0,insertText:'"description": "${1:watch fired}"'},{label:"incident_key",detail:"事件去重键（同名事件合并）",snippet:!0,insertText:'"incident_key": "${1:{{ctx.watch_id}}}"'},{label:"event_type",detail:"事件类型（trigger/resolve/acknowledge）",snippet:!0,insertText:'"event_type": "${1|trigger,resolve,acknowledge|}"'},{label:"client",detail:"客户端名称",snippet:!0,insertText:'"client": "${1:watcher}"'},{label:"client_url",detail:"客户端链接",snippet:!0,insertText:'"client_url": "${1:https://example.com}"'},{label:"attach_payload",detail:"附带完整 payload",snippet:!0,insertText:'"attach_payload": ${1|false,true|}'},{label:"contexts",detail:"上下文链接清单",snippet:!0,insertText:`"contexts": [
  \${0}
]`},{label:"proxy",detail:"代理配置",snippet:!0,insertText:`"proxy": {
  \${0}
}`}];case"jira":return[{label:"account",detail:"Jira 账户（省略用默认）",snippet:!0,insertText:'"account": "${1:jira-account}"'},{label:"fields",detail:"工单字段（project/issuetype/summary…）",snippet:!0,insertText:`"fields": {
  "project": { "key": "\${1:OPS}" },
  "issuetype": { "name": "\${2:Task}" },
  "summary": "\${3:watch fired}"
}`}];default:return[]}}function $n(){return[{label:"text",detail:"纯文本正文（可含 mustache）",snippet:!0,insertText:'"text": "${1:detail}"'},{label:"html",detail:"HTML 正文（可含 mustache）",snippet:!0,insertText:'"html": "${1:<p>detail</p>}"'}]}function gn(){return[{label:"text",detail:"消息正文（可含 mustache）",snippet:!0,insertText:'"text": "${1:watch fired}"'},{label:"from",detail:"发送者显示名",snippet:!0,insertText:'"from": "${1:watcher}"'},{label:"to",detail:"接收频道/用户清单",snippet:!0,insertText:'"to": ["${1:#alerts}"]'},{label:"attachments",detail:"Slack 附件清单",snippet:!0,insertText:`"attachments": [
  \${0}
]`}]}function bn(){return[{label:"http",detail:"HTTP 拉取附件",snippet:!0,insertText:'"http": { "request": { "url": "${1:https://example.com/report.pdf}" } }'},{label:"reporting",detail:"Kibana 报表附件",snippet:!0,insertText:'"reporting": { "url": "${1:https://kibana/report.pdf}" }'},{label:"data",detail:"数据附件（JSON/YAML）",snippet:!0,insertText:'"data": { "format": "${1|json,yaml|}" }'}]}function hn(){return[{label:"content_type",detail:"附件 MIME 类型",snippet:!0,insertText:'"content_type": "${1:application/pdf}"'},{label:"inline",detail:"是否内嵌显示",snippet:!0,insertText:'"inline": ${1|false,true|}'},{label:"request",detail:"HTTP 请求定义（url/method/headers…）",snippet:!0,insertText:`"request": {
  "url": "\${1:https://example.com/report.pdf}"
}`}]}function Tn(){return[{label:"url",detail:"报表下载地址",snippet:!0,insertText:'"url": "${1:https://kibana/report.pdf}"'},{label:"inline",detail:"是否内嵌显示",snippet:!0,insertText:'"inline": ${1|false,true|}'},{label:"retries",detail:"下载重试次数",snippet:!0,insertText:'"retries": ${1:3}'},{label:"interval",detail:"重试间隔",snippet:!0,insertText:'"interval": "${1:10s}"'},{label:"request",detail:"HTTP 请求定义",snippet:!0,insertText:`"request": {
  \${0}
}`}]}function kn(){return[{label:"format",detail:"数据格式（json/yaml）",snippet:!0,insertText:'"format": "${1|json,yaml|}"'}]}function vn(){return[{label:"title",detail:"附件标题",snippet:!0,insertText:'"title": "${1:watch fired}"'},{label:"text",detail:"附件正文",snippet:!0,insertText:'"text": "${1:detail}"'},{label:"author_name",detail:"作者名",snippet:!0,insertText:'"author_name": "${1:watcher}"'},{label:"author_link",detail:"作者链接",snippet:!0,insertText:'"author_link": "${1:https://example.com}"'},{label:"author_icon",detail:"作者头像",snippet:!0,insertText:'"author_icon": "${1:https://example.com/a.png}"'},{label:"color",detail:"侧边颜色（如 danger/good/#ff0000）",snippet:!0,insertText:'"color": "${1:danger}"'},{label:"fallback",detail:"纯文本回退摘要",snippet:!0,insertText:'"fallback": "${1:watch fired}"'},{label:"fields",detail:"字段列表（title/value/short）",snippet:!0,insertText:'"fields": [\n  { "title": "${1:Field}", "value": "${2:value}", "short": ${3|true,false|} }\n]'},{label:"footer",detail:"页脚文字",snippet:!0,insertText:'"footer": "${1:watcher}"'},{label:"footer_icon",detail:"页脚图标",snippet:!0,insertText:'"footer_icon": "${1:https://example.com/f.png}"'},{label:"image_url",detail:"大图地址",snippet:!0,insertText:'"image_url": "${1:https://example.com/img.png}"'},{label:"pretext",detail:"正文前导文字",snippet:!0,insertText:'"pretext": "${1:alert}"'},{label:"thumb_url",detail:"缩略图地址",snippet:!0,insertText:'"thumb_url": "${1:https://example.com/t.png}"'},{label:"title_link",detail:"标题链接",snippet:!0,insertText:'"title_link": "${1:https://example.com}"'},{label:"ts",detail:"时间戳（epoch 秒）",snippet:!0,insertText:'"ts": ${1:1700000000}'}]}function wn(){return[{label:"short",detail:"是否半宽显示",snippet:!0,insertText:'"short": ${1|true,false|}'},{label:"title",detail:"字段标题",snippet:!0,insertText:'"title": "${1:Field}"'},{label:"value",detail:"字段值",snippet:!0,insertText:'"value": "${1:value}"'}]}function qn(){return[{label:"project",detail:"目标项目（key）",snippet:!0,insertText:'"project": { "key": "${1:OPS}" }'},{label:"issuetype",detail:"工单类型（name）",snippet:!0,insertText:'"issuetype": { "name": "${1:Task}" }'},{label:"summary",detail:"工单标题",snippet:!0,insertText:'"summary": "${1:watch fired}"'},{label:"description",detail:"工单描述",snippet:!0,insertText:'"description": "${1:detail}"'},{label:"labels",detail:"标签清单",snippet:!0,insertText:'"labels": ["${1:watcher}"]'},{label:"priority",detail:"优先级（name）",snippet:!0,insertText:'"priority": { "name": "${1:High}" }'},{label:"assignee",detail:"经办人（name）",snippet:!0,insertText:'"assignee": { "name": "${1:jdoe}" }'},{label:"reporter",detail:"报告人（name）",snippet:!0,insertText:'"reporter": { "name": "${1:watcher}" }'}]}function Kn(){return[{label:"type",detail:"上下文类型（link/image）",snippet:!0,insertText:'"type": "${1|link,image|}"'},{label:"href",detail:"上下文链接",snippet:!0,insertText:'"href": "${1:https://example.com}"'},{label:"src",detail:"图片地址（type=image 时）",snippet:!0,insertText:'"src": "${1:https://example.com/a.png}"'}]}function In(t,n){const e=u(t,n),a=e.indexOf("condition");if(a<0)return[];const r=e[a+1];return!r||e.length!==a+3?[]:Te(r)}function Sn(t,n){const e=u(t,n),a=e.indexOf("actions");if(a<0)return[];const r=e[a+2];return!r||e.length!==a+4?[]:ve(r)}function Rn(t,n){const e=u(t,n);if(e.length<=1)return"root";if(e[0]==="trigger"){if(e.length===2)return"trigger";if(e.length===3&&e[1]==="schedule")return"schedule";if(e[1]==="chain"){if(e.length===4)return"chain-trigger";if(e.length===5&&e[3]==="trigger")return"chain-trigger-container";if(e.length===6&&e[3]==="trigger"&&e[4]==="schedule")return"schedule"}return"deep"}if(e[0]==="input"){if(e.length===2)return"input";if(e[1]==="search"){if(e[2]==="request"&&e[3]==="body"){if(e.length===5)return"search-body";if(e.includes("query"))return"search-query"}return e.length===3?"search-input":e.length===4&&e[2]==="request"?"search-request":"deep"}if(e[1]==="http"){if(e.length===3)return"http-input";if(e.length===4&&e[2]==="request")return"http-request";if(e.length===6&&e[2]==="request"&&e[3]==="auth"&&e[4]==="basic")return"http-auth-basic";if(e.length===5&&e[2]==="request"&&e[3]==="proxy")return"http-proxy"}if(e[1]==="chain"){if(e.length===3)return"chain-input-container";if(e.length===6&&e[2]==="inputs"&&e[3]===null&&e[4]&&e[5]===null)return"chain-input"}return"deep"}if(e[0]==="condition"){if(e.length===2)return"condition";if(e.length===3)return"condition-params";if(e[1]==="array_compare"){if(e.length===4)return"array-compare-body";if(e.length===5&&e[3]!=="path")return"array-compare-op"}return"deep"}if(e[0]==="actions"){if(e.length===3)return"action";if(e.length===4)return"action-params";if(e.length===5&&e[2]==="email"&&e[3]==="body")return"action-email-body";if(e.length===5&&e[2]==="slack"&&e[3]==="message")return"action-slack-message";if(e.length===5&&e[2]==="jira"&&e[3]==="fields")return"action-jira-fields";if(e[2]==="email"&&e[3]==="attachments"){if(e.length===6)return"email-attachment";if(e.length===7&&e[5]==="http")return"email-att-http";if(e.length===7&&e[5]==="reporting")return"email-att-reporting";if(e.length===7&&e[5]==="data")return"email-att-data";if(e.length===8&&(e[5]==="http"||e[5]==="reporting")&&e[6]==="request")return"http-request"}return e.length===6&&e[2]==="webhook"&&e[3]==="auth"&&e[4]==="basic"?"http-auth-basic":e.length===5&&e[2]==="webhook"&&e[3]==="proxy"?"http-proxy":e.length===6&&e[2]==="pagerduty"&&e[3]==="contexts"?"pagerduty-context":e.length===7&&e[2]==="slack"&&e[3]==="message"&&e[4]==="attachments"?"slack-attachment":e.length===9&&e[2]==="slack"&&e[3]==="message"&&e[4]==="attachments"&&e[6]==="fields"?"slack-attachment-field":"deep"}return"deep"}function we(){return[{label:"cluster",detail:"集群级权限（monitor/manage_index_templates…）",snippet:!0,insertText:'"cluster": ["${1:monitor}"]'},{label:"indices",detail:"索引权限组（索引模式 + 权限 + 字段/查询限制）",snippet:!0,insertText:`"indices": [
  {
    "names": ["\${1:logs-*}"],
    "privileges": ["\${2:read}"]
  }
]`},{label:"applications",detail:"应用权限（application/privileges/resources）",snippet:!0,insertText:`"applications": [
  {
    "application": "\${1:my-app}",
    "privileges": ["\${2:read}"],
    "resources": ["*"]
  }
]`},{label:"global",detail:"全局权限（请求感知，当前支持 application.manage 等）",snippet:!0,insertText:`"global": {
  "application": {
    "manage": ["\${1:myapp}"]
  }
}`},{label:"run_as",detail:"允许代表其执行请求的用户",snippet:!0,insertText:'"run_as": ["${1:user1}"]'},{label:"metadata",detail:"附加到角色的自定义元数据",snippet:!0,insertText:`"metadata": {
  \${0}
}`},{label:"transient_metadata",detail:"临时元数据（启用/禁用等）",snippet:!0,insertText:`"transient_metadata": {
  \${0}
}`}]}function qe(){return[{label:"names",detail:"索引/索引模式（支持通配）",snippet:!0,insertText:'"names": ["${1:logs-*}"],\n    "privileges": ["${2:read}"]'},{label:"privileges",detail:"索引权限（read/write/manage/view_index_metadata…）",snippet:!0,insertText:'"privileges": ["${1:read}"]'},{label:"field_security",detail:"字段级安全（grant/except）",snippet:!0,insertText:`"field_security": {
  "grant": ["\${1:*}"],
  "except": []
}`},{label:"query",detail:"文档级查询限制（Query DSL 或 JSON 串）",snippet:!0,insertText:`"query": {
  \${0}
}`},{label:"allow_restricted_indices",detail:"允许访问受限系统索引（默认 false）",snippet:!0,insertText:'"allow_restricted_indices": ${1|false,true|}'}]}function Ke(){return[{label:"grant",detail:"允许访问的字段（支持通配）",snippet:!0,insertText:'"grant": ["${1:*}"],\n  "except": []'},{label:"except",detail:"从 grant 中排除的字段",snippet:!0,insertText:'"except": ["${1:secret_field}"]'}]}function Ie(){return[{label:"application",detail:"应用名（如 kibana）",snippet:!0,insertText:'"application": "${1:my-app}"'},{label:"privileges",detail:"应用内权限",snippet:!0,insertText:'"privileges": ["${1:read}"]'},{label:"resources",detail:"资源范围（* 或具体对象）",snippet:!0,insertText:'"resources": ["${1:*}"]'}]}function En(t,n){const e=u(t,n);return e.length<=1?"root":e[0]==="indices"&&e.includes("query")?"query":e[0]==="indices"&&e.length===3?"index":e[0]==="indices"&&e.length===4&&e[2]==="field_security"?"field-security":e[0]==="applications"&&e.length===3?"app":"deep"}function Se(){return[{label:"password",detail:"明文密码（服务端哈希后存储；与 password_hash 二选一）",snippet:!0,insertText:'"password": "${1:change-me}"'},{label:"password_hash",detail:"已哈希密码（bcrypt），批量创建时用",snippet:!0,insertText:'"password_hash": "${1:$2a$10$...}"'},{label:"roles",detail:"授予的角色清单",snippet:!0,insertText:'"roles": ["${1:viewer}"]'},{label:"full_name",detail:"显示名",snippet:!0,insertText:'"full_name": "${1:张三}"'},{label:"email",detail:"邮箱",snippet:!0,insertText:'"email": "${1:user@example.com}"'},{label:"metadata",detail:"附加到用户的自定义元数据",snippet:!0,insertText:`"metadata": {
  \${0}
}`},{label:"enabled",detail:"是否启用（默认 true）",snippet:!0,insertText:'"enabled": ${1|true,false|}'},{label:"role_templates",detail:"角色模板（按模板动态解析角色）",snippet:!0,insertText:`"role_templates": [
  {
    "template": { "source": "\${1:mustache-template}" },
    "format": "\${2|string,json|}"
  }
]`}]}function An(t,n){const e=u(t,n);if(e.length<=1)return"root";if(e[0]==="role_templates"){if(e.length===3)return"role-template";if(e.length===4&&e[2]==="template")return"template-script"}return"deep"}function Re(){return[{label:"template",detail:"模板对象（source 为 Mustache 表达式）",snippet:!0,insertText:'"template": { "source": "${1:mustache-template}" }'},{label:"format",detail:"模板输出格式（string/json）",snippet:!0,insertText:'"format": "${1|string,json|}"'}]}function Ee(){return[{label:"roles",detail:"匹配时授予的角色清单",snippet:!0,insertText:'"roles": ["${1:viewer}"]'},{label:"enabled",detail:"是否启用该映射（默认 true）",snippet:!0,insertText:'"enabled": ${1|true,false|}'},{label:"rules",detail:"匹配规则（field/all/any/except…）",snippet:!0,insertText:'"rules": {\n  "field": { "${1:username}": "${2:jdoe}" }\n}'},{label:"role_templates",detail:"角色模板（按模板动态解析角色）",snippet:!0,insertText:`"role_templates": [
  {
    "template": { "source": "\${1:mustache-template}" },
    "format": "\${2|string,json|}"
  }
]`},{label:"run_as",detail:"允许映射用户以这些身份运行",snippet:!0,insertText:'"run_as": ["${1:user}"]'},{label:"metadata",detail:"附加到映射的自定义元数据",snippet:!0,insertText:`"metadata": {
  \${0}
}`}]}function zn(){return[{label:"field",detail:"字段匹配（字段名 → 值）",snippet:!0,insertText:'"field": { "${1:username}": "${2:jdoe}" }'},{label:"all",detail:"全部子规则满足",snippet:!0,insertText:'"all": [\n  { "field": { "${1:username}": "${2:jdoe}" } }\n]'},{label:"any",detail:"任一子规则满足",snippet:!0,insertText:'"any": [\n  { "field": { "${1:username}": "${2:jdoe}" } }\n]'},{label:"except",detail:"排除子规则",snippet:!0,insertText:'"except": { "field": { "${1:username}": "${2:jdoe}" } }'}]}function Pn(t,n){const e=u(t,n);if(e.length<=1)return"root";if(e[0]==="rules")return e.length===2?"rules":e.length===4&&(e[1]==="all"||e[1]==="any")||e.length===3&&e[1]==="except"?"rule":"deep";if(e[0]==="role_templates"){if(e.length===3)return"role-template";if(e.length===4&&e[2]==="template")return"template-script"}return"deep"}function C(){return[{label:"name",detail:"API Key 名称（便于识别/吊销）",snippet:!0,insertText:'"name": "${1:my-api-key}"'},{label:"expiration",detail:"有效期（如 1d/30d；省略=不过期）",snippet:!0,insertText:'"expiration": "${1:1d}"'},{label:"role_descriptors",detail:"该 Key 的角色权限（结构同安全角色体）",snippet:!0,insertText:`"role_descriptors": {
  \${0}
}`},{label:"metadata",detail:"附加到 Key 的自定义元数据",snippet:!0,insertText:`"metadata": {
  \${0}
}`}]}function Bn(t,n){const e=u(t,n);return e.length<=1?"root":e[0]==="role_descriptors"&&e.length===3?"role":"deep"}const k=["append","attachment","bytes","circle","community_id","convert","csv","date","date_index_name","dissect","dot_expander","drop","enrich","fail","fingerprint","foreach","geoip","grok","gsub","html_strip","inference","ip_location","join","json","kv","lowercase","network_direction","pipeline","redact","registered_domain","remove","rename","reroute","script","set","set_security_user","sort","split","trim","uppercase","uri_parts","user_agent"],Ae=["tag","description","if","ignore_failure","on_failure"];function ze(){return[{label:"description",detail:"管道用途说明",snippet:!0,insertText:'"description": "${1:parse logs}"'},{label:"version",detail:"管道版本号（便于回滚识别）",snippet:!0,insertText:'"version": ${1:1}'},{label:"processors",detail:"处理器链（按序执行）",snippet:!0,insertText:`"processors": [
  {
    "set": { "field": "\${1:field}", "value": "\${2:value}" }
  }
]`},{label:"on_failure",detail:"任一处理器失败时执行的动作链",snippet:!0,insertText:`"on_failure": [
  { "set": { "field": "error.message", "value": "{{ _ingest.on_failure_message }}" } }
]`},{label:"_meta",detail:"管道的自定义元数据",snippet:!0,insertText:`"_meta": {
  \${0}
}`}]}function Cn(){const t={set:{text:'"set": { "field": "${1:field}", "value": "${2:value}" }',detail:"设置字段值"},rename:{text:'"rename": { "field": "${1:old_field}", "target_field": "${2:new_field}" }',detail:"重命名字段"},remove:{text:'"remove": { "field": "${1:field}" }',detail:"删除字段"},convert:{text:'"convert": { "field": "${1:field}", "type": "${2|integer,long,float,double,string,boolean,ip|}" }',detail:"类型转换"},date:{text:'"date": { "field": "${1:timestamp}", "formats": ["${2:ISO8601}"] }',detail:"日期解析"},grok:{text:'"grok": { "field": "${1:message}", "patterns": ["${2:pattern}"] }',detail:"grok 正则解析"},dissect:{text:'"dissect": { "field": "${1:message}", "pattern": "${2:pattern}" }',detail:"dissect 分隔解析"},json:{text:'"json": { "field": "${1:message}", "target_field": "${2:json}" }',detail:"JSON 字符串展开"},kv:{text:'"kv": { "field": "${1:message}" }',detail:"键值对解析"},csv:{text:'"csv": { "field": "${1:message}", "target_fields": ["${2:col1}", "${3:col2}"] }',detail:"CSV 解析"},lowercase:{text:'"lowercase": { "field": "${1:field}" }',detail:"转小写"},uppercase:{text:'"uppercase": { "field": "${1:field}" }',detail:"转大写"},trim:{text:'"trim": { "field": "${1:field}" }',detail:"去首尾空白"},split:{text:'"split": { "field": "${1:field}", "separator": "${2:,}" }',detail:"按分隔符拆成数组"},join:{text:'"join": { "field": "${1:field}", "separator": "${2:,}" }',detail:"数组拼成字符串"},script:{text:'"script": { "lang": "${1:painless}", "source": "${2:ctx.field = ctx.field.toUpperCase()}" }',detail:"脚本处理"},pipeline:{text:'"pipeline": { "name": "${1:my-pipeline}" }',detail:"调用另一条管道"},foreach:{text:'"foreach": { "field": "${1:field}", "processor": { "set": { "field": "_ingest._value", "value": "${2:value}" } } }',detail:"对数组元素逐个处理"},fail:{text:'"fail": { "message": "${1:ingest failed}" }',detail:"主动失败"},drop:{text:'"drop": {}',detail:"丢弃文档"},append:{text:'"append": { "field": "${1:field}", "value": "${2:value}" }',detail:"追加值到数组"},enrich:{text:'"enrich": { "policy_name": "${1:my-policy}", "field": "${2:field}", "target_field": "${3:enriched}" }',detail:"enrich 策略关联"},geoip:{text:'"geoip": { "field": "${1:ip}", "target_field": "${2:geoip}" }',detail:"IP 地理位置"},user_agent:{text:'"user_agent": { "field": "${1:user_agent}" }',detail:"UA 解析"},uri_parts:{text:'"uri_parts": { "field": "${1:url}" }',detail:"URL 拆解"},registered_domain:{text:'"registered_domain": { "field": "${1:host}" }',detail:"注册域提取"},dot_expander:{text:'"dot_expander": { "field": "${1:field.with.dots}" }',detail:"点号字段展开"},gsub:{text:'"gsub": { "field": "${1:field}", "pattern": "${2:pattern}", "replacement": "${3:_}" }',detail:"正则替换"},inference:{text:'"inference": { "model_id": "${1:model}", "field_map": {} }',detail:"推理模型"},redact:{text:'"redact": { "field": "${1:field}" }',detail:"敏感信息脱敏"}},n={attachment:"附件元数据提取",bytes:"字节数处理",circle:"圆形地理区域",community_id:"网络流 community_id",date_index_name:"按日期路由索引名",fingerprint:"内容指纹",html_strip:"HTML 标签剥离",ip_location:"IP 位置字段",network_direction:"网络方向判定",reroute:"改路由/索引",set_security_user:"设置安全用户上下文",sort:"数组排序"},e=["set","rename","remove","convert","date","grok","dissect","json","script","pipeline","foreach"];return[...e.filter(r=>k.includes(r)),...k.filter(r=>!e.includes(r))].map(r=>{const s=t[r];return{label:r,detail:(s==null?void 0:s.detail)??n[r]??"Ingest 处理器",snippet:!0,insertText:(s==null?void 0:s.text)??'"'+r+`": {
  \${0}
}`}})}function On(t,n){const e=u(t,n);return e.length<=1?"root":e[0]==="processors"&&e.length===3||e[0]==="on_failure"&&(e.length===2||e.length===3)?"processor":"deep"}const S=["match","geo_match","range"];function Pe(){return[{label:"match",detail:"按字段等值匹配源索引",snippet:!0,insertText:`"match": {
  "indices": ["\${1:source-index}"],
  "match_field": "\${2:key}",
  "enrich_fields": ["\${3:value}"]
}`},{label:"geo_match",detail:"按地理形状匹配",snippet:!0,insertText:`"geo_match": {
  "indices": ["\${1:source-index}"],
  "match_field": "\${2:location}",
  "enrich_fields": ["\${3:value}"]
}`},{label:"range",detail:"按数值区间匹配",snippet:!0,insertText:`"range": {
  "indices": ["\${1:source-index}"],
  "match_field": "\${2:range_field}",
  "enrich_fields": ["\${3:value}"]
}`}]}function Be(){return[{label:"indices",detail:"源索引（可数组/通配；单索引只读）",snippet:!0,insertText:'"indices": ["${1:source-index}"]'},{label:"query",detail:"源索引过滤查询（Query DSL）",snippet:!0,insertText:`"query": {
  \${0}
}`},{label:"match_field",detail:"用于匹配的字段",snippet:!0,insertText:'"match_field": "${1:key}"'},{label:"enrich_fields",detail:"随命中携带的字段",snippet:!0,insertText:'"enrich_fields": ["${1:value}"]'}]}function Ce(){return[{label:"indices",detail:"源索引（可数组/通配；单索引只读）",snippet:!0,insertText:'"indices": ["${1:source-index}"]'},{label:"query",detail:"源索引过滤查询（Query DSL）",snippet:!0,insertText:`"query": {
  \${0}
}`},{label:"field",detail:"区间字段（数值/日期）",snippet:!0,insertText:'"field": "${1:range_field}"'},{label:"ranges",detail:"区间定义（from/to 数组）",snippet:!0,insertText:'"ranges": [\n  { "from": ${1:0}, "to": ${2:100} }\n]'},{label:"enrich_fields",detail:"随命中携带的字段",snippet:!0,insertText:'"enrich_fields": ["${1:value}"]'}]}function Ln(t,n){const e=u(t,n);return e.length<=1?"root":e.length>=3&&e[1]==="query"&&S.includes(e[0]??"")?"query":e.length===2&&S.includes(e[0]??"")?e[0]==="range"?"range":"match":"deep"}function Oe(){return[{label:"source",detail:"源索引与过滤查询",snippet:!0,insertText:`"source": {
  "index": ["\${1:logs-*}"],
  "query": { "match_all": {} }
}`},{label:"dest",detail:"目标索引（可指定写入 pipeline）",snippet:!0,insertText:'"dest": { "index": "${1:transformed-index}" }'},{label:"pivot",detail:"透视聚合（group_by + aggregations）",snippet:!0,insertText:`"pivot": {
  "group_by": {
    "\${1:key}": { "terms": { "field": "\${2:field}" } }
  },
  "aggregations": {
    "\${3:metric}": { "avg": { "field": "\${4:value}" } }
  }
}`},{label:"latest",detail:"取每个键最新文档（unique_key + sort）",snippet:!0,insertText:'"latest": { "unique_key": "${1:id}", "sort": "${2:@timestamp}" }'},{label:"sync",detail:"持续同步（time 字段与延迟）",snippet:!0,insertText:'"sync": { "time": { "field": "${1:@timestamp}", "delay": "${2:1m}" } }'},{label:"retention_policy",detail:"目标索引保留策略（max_age）",snippet:!0,insertText:'"retention_policy": { "time": { "field": "${1:@timestamp}", "max_age": "${2:30d}" } }'},{label:"description",detail:"Transform 用途说明",snippet:!0,insertText:'"description": "${1:transform logs}"'},{label:"settings",detail:"执行调优（docs_per_second 等）",snippet:!0,insertText:`"settings": {
  \${0}
}`},{label:"frequency",detail:"检查源索引变化的频率（如 1m）",snippet:!0,insertText:'"frequency": "${1:1m}"'},{label:"max_page_search_size",detail:"单页最大检索文档数",snippet:!0,insertText:'"max_page_search_size": ${1:500}'},{label:"_meta",detail:"自定义元数据",snippet:!0,insertText:`"_meta": {
  \${0}
}`}]}function Le(){return[{label:"index",detail:"源索引（数组/通配）",snippet:!0,insertText:'"index": ["${1:logs-*}"]'},{label:"query",detail:"源文档过滤（Query DSL）",snippet:!0,insertText:`"query": {
  \${0}
}`},{label:"remote",detail:"远程集群源（cluster + index）",snippet:!0,insertText:'"remote": { "host": "${1:https://remote:9200}", "username": "${2:user}", "password": "${3:pass}", "index": ["${4:logs-*}"] }'}]}function Ue(){return[{label:"index",detail:"目标索引名",snippet:!0,insertText:'"index": "${1:transformed-index}"'},{label:"pipeline",detail:"写入前经过的 ingest 管道",snippet:!0,insertText:'"pipeline": "${1:my-pipeline}"'}]}function Me(){return[{label:"group_by",detail:"分组键（字段聚合）",snippet:!0,insertText:'"group_by": {\n  "${1:key}": { "terms": { "field": "${2:field}" } }\n}'},{label:"aggregations",detail:"指标聚合",snippet:!0,insertText:'"aggregations": {\n  "${1:metric}": { "avg": { "field": "${2:value}" } }\n}'}]}function O(t){return[{label:"time",detail:"时间字段配置",snippet:!0,insertText:t==="sync"?'"time": { "field": "${1:@timestamp}", "delay": "${2:1m}" }':'"time": { "field": "${1:@timestamp}", "max_age": "${2:30d}" }'}]}function L(t){return[{label:"field",detail:"时间字段",snippet:!0,insertText:'"field": "${1:@timestamp}"'},t==="sync"?{label:"delay",detail:"同步延迟（避免读到未完成写入）",snippet:!0,insertText:'"delay": "${1:1m}"'}:{label:"max_age",detail:"目标文档最长保留时间",snippet:!0,insertText:'"max_age": "${1:30d}"'}]}function Un(t,n){const e=u(t,n);return e.length<=1?"root":e[0]==="source"?e.length===2?"source":e[1]==="query"&&e.length>=3?"source-query":"deep":e[0]==="dest"&&e.length===2?"dest":e[0]==="pivot"&&e.length===2?"pivot":e[0]==="sync"?e.length===2?"sync":e[1]==="time"&&e.length===3?"sync-time":"deep":e[0]==="retention_policy"?e.length===2?"retention":e[1]==="time"&&e.length===3?"retention-time":"deep":"deep"}function Ne(){return[{label:"index_pattern",detail:"源索引模式（单一索引/通配）",snippet:!0,insertText:'"index_pattern": "${1:logs-*}"'},{label:"rollup_index",detail:"汇总结果索引（独立索引）",snippet:!0,insertText:'"rollup_index": "${1:logs-rollup}"'},{label:"cron",detail:"执行计划（cron）",snippet:!0,insertText:'"cron": "${1:0 */30 * * * ?}"'},{label:"page_size",detail:"每批处理文档数",snippet:!0,insertText:'"page_size": ${1:1000}'},{label:"groups",detail:"分组维度（时间/字段）",snippet:!0,insertText:`"groups": {
  "date_histogram": {
    "field": "\${1:@timestamp}",
    "calendar_interval": "\${2:1h}"
  },
  "terms": {
    "fields": ["\${3:host}"]
  }
}`},{label:"metrics",detail:"指标字段与聚合",snippet:!0,insertText:'"metrics": [\n  { "field": "${1:bytes}", "metrics": ["${2:min}", "${3:max}", "${4:sum}"] }\n]'},{label:"timeout",detail:"单批处理超时（如 20s）",snippet:!0,insertText:'"timeout": "${1:20s}"'},{label:"headers",detail:"请求头（跨集群/安全场景）",snippet:!0,insertText:`"headers": {
  \${0}
}`}]}function Fe(){return[{label:"date_histogram",detail:"时间桶分组",snippet:!0,insertText:'"date_histogram": { "field": "${1:@timestamp}", "calendar_interval": "${2:1h}" }'},{label:"terms",detail:"字段值分组",snippet:!0,insertText:'"terms": { "fields": ["${1:host}"] }'},{label:"histogram",detail:"数值区间分组",snippet:!0,insertText:'"histogram": { "fields": ["${1:latency}"], "interval": ${2:100} }'}]}function je(){return[{label:"field",detail:"时间字段",snippet:!0,insertText:'"field": "${1:@timestamp}"'},{label:"calendar_interval",detail:"日历区间（1m/1h/1d…）",snippet:!0,insertText:'"calendar_interval": "${1:1h}"'},{label:"fixed_interval",detail:"固定区间（30s/5m…）",snippet:!0,insertText:'"fixed_interval": "${1:30m}"'},{label:"time_zone",detail:"时区（影响日历分桶边界）",snippet:!0,insertText:'"time_zone": "${1:UTC}"'}]}function U(t){return[{label:"fields",detail:"分组字段（数组）",snippet:!0,insertText:'"fields": ["${1:host}"]'},...t==="histogram"?[{label:"interval",detail:"区间宽度",snippet:!0,insertText:'"interval": ${1:100}'}]:[]]}function De(){return[{label:"field",detail:"指标字段",snippet:!0,insertText:'"field": "${1:bytes}"'},{label:"metrics",detail:"统计方式（min/max/sum/value_count/avg）",snippet:!0,insertText:'"metrics": ["${1:min}", "${2:max}", "${3:sum}"]'}]}function Mn(t,n){const e=u(t,n);if(e.length<=1)return"root";if(e[0]==="groups"){if(e.length===2)return"groups";if(e.length===3){if(e[1]==="date_histogram")return"date-group";if(e[1]==="terms")return"terms-group";if(e[1]==="histogram")return"histogram-group"}return"deep"}return e[0]==="metrics"&&e.length===3?"metric":"deep"}function Ge(){return[{label:"job_id",detail:"关联的异常检测作业 id",snippet:!0,insertText:'"job_id": "${1:my-job}"'},{label:"indexes",detail:"源索引（数组/通配）",snippet:!0,insertText:'"indexes": ["${1:logs-*}"]'},{label:"query",detail:"取数过滤查询（Query DSL）",snippet:!0,insertText:`"query": {
  \${0}
}`},{label:"query_delay",detail:"额外查询延迟（等待迟到数据）",snippet:!0,insertText:'"query_delay": "${1:60s}"'},{label:"frequency",detail:"取数频率（默认等于 bucket_span）",snippet:!0,insertText:'"frequency": "${1:60s}"'},{label:"scroll_size",detail:"单次滚动取数条数",snippet:!0,insertText:'"scroll_size": ${1:1000}'},{label:"aggregations",detail:"取数聚合（summary 作业配合 summary_count_field_name）",snippet:!0,insertText:`"aggregations": {
  \${0}
}`},{label:"script_fields",detail:"取数时计算的脚本字段",snippet:!0,insertText:`"script_fields": {
  \${0}
}`},{label:"max_empty_searches",detail:"连续空搜索上限（summary 作业）",snippet:!0,insertText:'"max_empty_searches": ${1:10}'},{label:"delayed_data_check_config",detail:"延迟数据检查（enabled/check_window）",snippet:!0,insertText:'"delayed_data_check_config": { "enabled": ${1|true,false|}, "check_window": "${2:1h}" }'},{label:"chunking_config",detail:"分块模式（auto/manual/off）",snippet:!0,insertText:'"chunking_config": { "mode": "${1|auto,manual,off|}" }'},{label:"indices_options",detail:"索引选项（通配展开/忽略缺失）",snippet:!0,insertText:`"indices_options": {
  "expand_wildcards": ["\${1:open}"],
  "ignore_unavailable": \${2|true,false|}
}`},{label:"runtime_mappings",detail:"取数时生效的运行时字段",snippet:!0,insertText:`"runtime_mappings": {
  \${0}
}`},{label:"headers",detail:"请求头（安全/跨集群场景）",snippet:!0,insertText:`"headers": {
  \${0}
}`}]}function Ye(){return[{label:"enabled",detail:"启用延迟数据检查",snippet:!0,insertText:'"enabled": ${1|true,false|}'},{label:"check_window",detail:"检查窗口（窗口内无数据则告警）",snippet:!0,insertText:'"check_window": "${1:1h}"'}]}function He(){return[{label:"mode",detail:"分块模式（auto/manual/off）",snippet:!0,insertText:'"mode": "${1|auto,manual,off|}"'},{label:"time_span",detail:"manual 模式下的分块时间跨度",snippet:!0,insertText:'"time_span": "${1:3h}"'}]}function Qe(){return[{label:"expand_wildcards",detail:"通配展开范围（open/closed/hidden/none/all）",snippet:!0,insertText:'"expand_wildcards": ["${1|open,closed,hidden,none,all|}"]'},{label:"ignore_unavailable",detail:"忽略不存在的索引",snippet:!0,insertText:'"ignore_unavailable": ${1|true,false|}'},{label:"allow_no_indices",detail:"通配无匹配时不报错",snippet:!0,insertText:'"allow_no_indices": ${1|true,false|}'}]}function Nn(t,n){const e=u(t,n);return e.length<=1?"root":e[0]==="query"&&e.length>=2?"query":e[0]==="delayed_data_check_config"&&e.length===2?"delayed":e[0]==="chunking_config"&&e.length===2?"chunking":e[0]==="indices_options"&&e.length===2?"indices":"deep"}function We(){return[{label:"job_id",detail:"作业 id（省略则用路径上的 id）",snippet:!0,insertText:'"job_id": "${1:latency-job}"'},{label:"analysis_config",detail:"分析配置（bucket_span + detectors，作业核心）",snippet:!0,insertText:`"analysis_config": {
  "bucket_span": "\${1:15m}",
  "detectors": [
    { "function": "\${2:mean}", "field_name": "\${3:responsetime}" }
  ]
}`},{label:"analysis_limits",detail:"资源上限（模型内存/分类示例数）",snippet:!0,insertText:`"analysis_limits": {
  "model_memory_limit": "\${1:1024mb}",
  "categorization_examples_limit": \${2:4}
}`},{label:"data_description",detail:"时间字段描述（time_field 必填）",snippet:!0,insertText:'"data_description": { "time_field": "${1:@timestamp}" }'},{label:"description",detail:"作业用途说明",snippet:!0,insertText:'"description": "${1:latency anomaly job}"'},{label:"groups",detail:"作业分组（便于批量管理）",snippet:!0,insertText:'"groups": ["${1:default}"]'},{label:"background_persist_interval",detail:"后台持久化间隔（如 1h）",snippet:!0,insertText:'"background_persist_interval": "${1:1h}"'},{label:"model_plot_config",detail:"模型绘图（enabled/terms）",snippet:!0,insertText:'"model_plot_config": { "enabled": ${1|true,false|} }'},{label:"model_snapshot_retention_days",detail:"模型快照保留天数",snippet:!0,insertText:'"model_snapshot_retention_days": ${1:10}'},{label:"daily_model_snapshot_retention_after_days",detail:"近期快照按天保留天数",snippet:!0,insertText:'"daily_model_snapshot_retention_after_days": ${1:1}'},{label:"renormalization_window_days",detail:"分数重归一化窗口（天）",snippet:!0,insertText:'"renormalization_window_days": ${1:30}'},{label:"results_retention_days",detail:"结果保留天数（不填=永久）",snippet:!0,insertText:'"results_retention_days": ${1:30}'},{label:"results_index_name",detail:"结果索引名（shared=共用索引）",snippet:!0,insertText:'"results_index_name": "${1:shared}"'},{label:"allow_lazy_open",detail:"允许惰性打开（不预加载模型）",snippet:!0,insertText:'"allow_lazy_open": ${1|false,true|}'},{label:"custom_settings",detail:"自定义设置（结果索引等）",snippet:!0,insertText:`"custom_settings": {
  \${0}
}`},{label:"datafeed_config",detail:"同时创建数据馈送（取数配置）",snippet:!0,insertText:`"datafeed_config": {
  "indices": ["\${1:logs-*}"],
  "query": { "match_all": {} }
}`}]}function Ve(){return[{label:"bucket_span",detail:"桶跨度（如 15m；决定分析粒度）",snippet:!0,insertText:'"bucket_span": "${1:15m}"'},{label:"latency",detail:"额外延迟（等待迟到数据）",snippet:!0,insertText:'"latency": "${1:0s}"'},{label:"detectors",detail:"检测器列表（function + field_name）",snippet:!0,insertText:'"detectors": [\n  { "function": "${1:mean}", "field_name": "${2:responsetime}" }\n]'},{label:"influencers",detail:"影响因子字段（用于结果解释）",snippet:!0,insertText:'"influencers": ["${1:airline}"]'},{label:"categorization_field_name",detail:"分类字段（消息聚类）",snippet:!0,insertText:'"categorization_field_name": "${1:message}"'},{label:"categorization_filters",detail:"分类过滤模式",snippet:!0,insertText:'"categorization_filters": ["${1:pattern}"]'},{label:"summary_count_field_name",detail:"预聚合计数字段（datafeed 聚合场景）",snippet:!0,insertText:'"summary_count_field_name": "${1:doc_count}"'}]}function Je(){return[{label:"function",detail:"检测函数（mean/min/max/sum/count/rare/distinct_count…）",snippet:!0,insertText:'"function": "${1|mean,min,max,sum,count,non_zero_count,distinct_count,rare,low_count,high_count,low_mean,high_mean,info_content,time_of_day,time_of_week|}"'},{label:"field_name",detail:"被分析字段",snippet:!0,insertText:'"field_name": "${1:responsetime}"'},{label:"by_field_name",detail:"按该字段分组分别建模",snippet:!0,insertText:'"by_field_name": "${1:airline}"'},{label:"over_field_name",detail:"总体对比字段",snippet:!0,insertText:'"over_field_name": "${1:clientip}"'},{label:"partition_field_name",detail:"分区字段（每个分区独立建模）",snippet:!0,insertText:'"partition_field_name": "${1:region}"'},{label:"detector_description",detail:"检测器说明",snippet:!0,insertText:'"detector_description": "${1:mean latency}"'},{label:"exclude_frequent",detail:"排除高频值（all/none/by/over）",snippet:!0,insertText:'"exclude_frequent": "${1|all,none,by,over|}"'},{label:"use_null",detail:"缺失值是否作为独立值",snippet:!0,insertText:'"use_null": ${1|false,true|}'}]}function Ze(){return[{label:"model_memory_limit",detail:"模型内存上限（如 1024mb）",snippet:!0,insertText:'"model_memory_limit": "${1:1024mb}"'},{label:"categorization_examples_limit",detail:"分类示例保留条数",snippet:!0,insertText:'"categorization_examples_limit": ${1:4}'}]}function Xe(){return[{label:"time_field",detail:"时间戳字段（必填）",snippet:!0,insertText:'"time_field": "${1:@timestamp}"'},{label:"time_format",detail:"时间格式（epoch_ms 或自定义 pattern）",snippet:!0,insertText:'"time_format": "${1:epoch_ms}"'}]}function Fn(t,n){const e=u(t,n);return e.length<=1?"root":e[0]==="analysis_config"?e.length===2?"analysis-config":e[1]==="detectors"&&e.length===4?"detector":"deep":e[0]==="analysis_limits"&&e.length===2?"analysis-limits":e[0]==="data_description"&&e.length===2?"data-description":"deep"}function et(){return[{label:"description",detail:"过滤器用途说明",snippet:!0,insertText:'"description": "${1:safe domains}"'},{label:"items",detail:"条目清单（支持首尾通配 *，上限 10000）",snippet:!0,insertText:'"items": ["${1:*.example.com}"]'}]}function tt(){return[{label:"description",detail:"过滤器用途说明（覆盖）",snippet:!0,insertText:'"description": "${1:safe domains}"'},{label:"add_items",detail:"新增条目（支持首尾通配 *）",snippet:!0,insertText:'"add_items": ["${1:*.example.com}"]'},{label:"remove_items",detail:"移除条目",snippet:!0,insertText:'"remove_items": ["${1:*.old.com}"]'}]}function it(){return[{label:"job_ids",detail:"关联的异常检测作业 id 清单",snippet:!0,insertText:'"job_ids": ["${1:my-job}"]'},{label:"description",detail:"日历用途说明",snippet:!0,insertText:'"description": "${1:planned outages}"'}]}function nt(){return[{label:"events",detail:"计划事件（起止时间 + 跳过策略）",snippet:!0,insertText:`"events": [
  {
    "description": "\${1:maintenance}",
    "start_time": \${2:1700000000000},
    "end_time": \${3:1700003600000}
  }
]`}]}function at(){return[{label:"description",detail:"事件说明",snippet:!0,insertText:'"description": "${1:maintenance}"'},{label:"start_time",detail:"开始时间（epoch 毫秒或 ISO 8601）",snippet:!0,insertText:'"start_time": ${1:1700000000000}'},{label:"end_time",detail:"结束时间（epoch 毫秒或 ISO 8601）",snippet:!0,insertText:'"end_time": ${1:1700003600000}'},{label:"skip_result",detail:"事件期内不产生异常结果",snippet:!0,insertText:'"skip_result": ${1|true,false|}'},{label:"skip_model_update",detail:"事件期内不更新模型",snippet:!0,insertText:'"skip_model_update": ${1|true,false|}'},{label:"force_time_shift",detail:"时间平移秒数（如夏令时调整）",snippet:!0,insertText:'"force_time_shift": ${1:3600}'}]}function jn(t,n){const e=u(t,n);return e.length<=1?"root":e[0]==="events"&&e.length===3?"event":"deep"}function rt(){return[{label:"query",detail:"种子查询（任意合法 Query DSL）",snippet:!0,insertText:`"query": {
  \${0}
}`},{label:"vertices",detail:"起始顶点字段（field/size/阈值）",snippet:!0,insertText:'"vertices": [\n  { "field": "${1:product}", "size": ${2:5} }\n]'},{label:"connections",detail:"关联边探索（hop 可嵌套）",snippet:!0,insertText:`"connections": {
  "vertices": [
    { "field": "\${1:query.raw}", "size": \${2:5} }
  ]
}`},{label:"controls",detail:"探索控制（采样/超时/显著性）",snippet:!0,insertText:`"controls": {
  "sample_size": \${1:100},
  "use_significance": \${2|true,false|}
}`}]}function st(){return[{label:"field",detail:"抽取词项的字段",snippet:!0,insertText:'"field": "${1:product}"'},{label:"size",detail:"每个字段最多返回的顶点数",snippet:!0,insertText:'"size": ${1:5}'},{label:"min_doc_count",detail:"全局成对出现的最小文档数",snippet:!0,insertText:'"min_doc_count": ${1:3}'},{label:"shard_min_doc_count",detail:"单分片成对出现的最小文档数",snippet:!0,insertText:'"shard_min_doc_count": ${1:2}'},{label:"include",detail:"包含的起始词项（term/boost）",snippet:!0,insertText:'"include": [\n  { "term": "${1:elasticsearch}", "boost": ${2:1.0} }\n]'},{label:"exclude",detail:"排除的词项",snippet:!0,insertText:'"exclude": ["${1:excluded-term}"]'}]}function lt(){return[{label:"sample_size",detail:"每次 hop 每分片采样的文档数",snippet:!0,insertText:'"sample_size": ${1:100}'},{label:"timeout",detail:"探索超时（如 1s）",snippet:!0,insertText:'"timeout": "${1:1s}"'},{label:"use_significance",detail:"只保留显著关联的词项",snippet:!0,insertText:'"use_significance": ${1|true,false|}'},{label:"sample_diversity",detail:"采样多样性（field + max_docs_per_value）",snippet:!0,insertText:'"sample_diversity": { "field": "${1:category}", "max_docs_per_value": ${2:1} }'}]}function ot(){return[{label:"field",detail:"用于多样性的单值字段",snippet:!0,insertText:'"field": "${1:category}"'},{label:"max_docs_per_value",detail:"每个值最多保留的文档数",snippet:!0,insertText:'"max_docs_per_value": ${1:1}'}]}function dt(){return[{label:"vertices",detail:"本跳要抽取的字段",snippet:!0,insertText:'"vertices": [\n  { "field": "${1:product}", "size": ${2:5} }\n]'},{label:"query",detail:"引导查询（约束本跳探索）",snippet:!0,insertText:`"query": {
  \${0}
}`},{label:"connections",detail:"再下一跳（同结构，可嵌套）",snippet:!0,insertText:`"connections": {
  "vertices": [
    { "field": "\${1:query.raw}", "size": \${2:5} }
  ]
}`}]}function Dn(t,n){const e=u(t,n);return e.length<=1?"root":e.includes("query")?"query":e.length>=2&&e[e.length-2]==="controls"&&e[e.length-1]===null?"controls":e.length>=2&&e[e.length-2]==="sample_diversity"&&e[e.length-1]===null?"sample-diversity":e.length>=2&&e[e.length-2]==="connections"&&e[e.length-1]===null?"hop":e.length>=3&&e[e.length-1]===null&&e[e.length-2]===null&&e[e.length-3]==="vertices"?"vertex":"deep"}function M(){return[{label:"max_outstanding_read_requests",detail:"远端集群最大未完成读请求数",snippet:!0,insertText:'"max_outstanding_read_requests": ${1:12}'},{label:"max_outstanding_write_requests",detail:"跟随侧最大未完成写请求数",snippet:!0,insertText:'"max_outstanding_write_requests": ${1:9}'},{label:"max_read_request_operation_count",detail:"单次读取的最大操作数",snippet:!0,insertText:'"max_read_request_operation_count": ${1:5120}'},{label:"max_read_request_size",detail:"单次读取的最大字节量",snippet:!0,insertText:'"max_read_request_size": "${1:32mb}"'},{label:"max_retry_delay",detail:"异常重试的最大退避时间",snippet:!0,insertText:'"max_retry_delay": "${1:500ms}"'},{label:"max_write_buffer_count",detail:"待写操作队列上限（条数）",snippet:!0,insertText:'"max_write_buffer_count": ${1:2147483647}'},{label:"max_write_buffer_size",detail:"待写操作队列上限（字节）",snippet:!0,insertText:'"max_write_buffer_size": "${1:512mb}"'},{label:"max_write_request_operation_count",detail:"单次批量写的最大操作数",snippet:!0,insertText:'"max_write_request_operation_count": ${1:5120}'},{label:"max_write_request_size",detail:"单次批量写的最大字节量",snippet:!0,insertText:'"max_write_request_size": "${1:9223372036854775807b}"'},{label:"read_poll_timeout",detail:"远端拉取新操作的轮询超时",snippet:!0,insertText:'"read_poll_timeout": "${1:1m}"'},{label:"settings",detail:"覆盖 leader 索引的设置",snippet:!0,insertText:`"settings": {
  \${0}
}`}]}function pt(){return[{label:"remote_cluster",detail:"远端集群别名",snippet:!0,insertText:'"remote_cluster": "${1:leader_cluster}"'},{label:"leader_index",detail:"远端被跟随的索引名",snippet:!0,insertText:'"leader_index": "${1:leader-index}"'},{label:"data_stream_name",detail:"leader 为数据流时的本地数据流名",snippet:!0,insertText:'"data_stream_name": "${1:follower-stream}"'},...M()]}function ut(){return[{label:"remote_cluster",detail:"远端集群别名",snippet:!0,insertText:'"remote_cluster": "${1:leader_cluster}"'},{label:"follow_index_pattern",detail:"跟随索引命名模板（{{leader_index}} 可用）",snippet:!0,insertText:'"follow_index_pattern": "{{leader_index}}-follower"'},{label:"leader_index_patterns",detail:"匹配远端索引的模式清单",snippet:!0,insertText:'"leader_index_patterns": ["${1:logs-*}"]'},{label:"leader_index_exclusion_patterns",detail:"排除的远端索引模式",snippet:!0,insertText:'"leader_index_exclusion_patterns": ["${1:*-test}"]'},...M()]}function ct(){return[{label:"grant_type",detail:"授权方式（access_token / password）",snippet:!0,insertText:'"grant_type": "${1|access_token,password|}"'},{label:"access_token",detail:"access_token 方式的访问令牌",snippet:!0,insertText:'"access_token": "${1:token}"'},{label:"username",detail:"password 方式的用户名",snippet:!0,insertText:'"username": "${1:jdoe}"'},{label:"password",detail:"password 方式的密码",snippet:!0,insertText:'"password": "${1:secret}"'},{label:"api_key",detail:"要创建的 API Key 参数",snippet:!0,insertText:`"api_key": {
  "name": "\${1:granted-key}"
}`}]}function mt(){return C()}function Gn(t,n){const e=u(t,n);return e.length<=1?"root":e[0]==="api_key"&&e.length===2?"api-key":e[0]==="api_key"&&e[1]==="role_descriptors"&&e.length===4?"role":"deep"}function _t(){return[{label:"query",detail:"API Key 查询条件（Query DSL 子集）",snippet:!0,insertText:`"query": {
  \${0}
}`},{label:"from",detail:"分页起点",snippet:!0,insertText:'"from": ${1:0}'},{label:"size",detail:"返回条数",snippet:!0,insertText:'"size": ${1:10}'},{label:"sort",detail:"排序（API Key 公共字段，如 creation/name/expiration）",snippet:!0,insertText:'"sort": [ { "${1:creation}": { "order": "desc" } } ]'},{label:"search_after",detail:"深分页游标（上一页最后一条的排序值）",snippet:!0,insertText:'"search_after": ["${1:value}"]'},{label:"aggregations",detail:"聚合（对 API Key 公共字段）",snippet:!0,insertText:`"aggregations": {
  \${0}
}`},{label:"aggs",detail:"聚合简写（与 aggregations 等价）",snippet:!0,insertText:`"aggs": {
  \${0}
}`}]}function Yn(t,n){const e=u(t,n);return e.length<=1?"root":e.includes("query")?"query":"deep"}function ft(){return[{label:"ids",detail:"按 Key id 吊销",snippet:!0,insertText:'"ids": ["${1:key-id}"]'},{label:"name",detail:"按 Key 名称吊销",snippet:!0,insertText:'"name": "${1:my-api-key}"'},{label:"owner",detail:"只吊销当前用户拥有的 Key",snippet:!0,insertText:'"owner": ${1|true,false|}'},{label:"realm_name",detail:"按认证域过滤",snippet:!0,insertText:'"realm_name": "${1:native1}"'},{label:"username",detail:"按用户名过滤",snippet:!0,insertText:'"username": "${1:myuser}"'}]}function yt(){return[{label:"name",detail:"跨集群 Key 名称",snippet:!0,insertText:'"name": "${1:ccs-key}"'},{label:"access",detail:"跨集群访问范围（search / replication）",snippet:!0,insertText:`"access": {
  "search": [ { "names": ["\${1:logs-*}"] } ]
}`},{label:"expiration",detail:"有效期（如 1d/30d；省略=不过期）",snippet:!0,insertText:'"expiration": "${1:1d}"'},{label:"metadata",detail:"附加到 Key 的自定义元数据",snippet:!0,insertText:`"metadata": {
  \${0}
}`}]}function xt(){return[{label:"search",detail:"可搜索的远端索引",snippet:!0,insertText:'"search": [ { "names": ["${1:logs-*}"] } ]'},{label:"replication",detail:"可复制的远端索引",snippet:!0,insertText:'"replication": [ { "names": ["${1:archive-*}"] } ]'}]}function $t(){return[{label:"names",detail:"索引/数据流名清单",snippet:!0,insertText:'"names": ["${1:logs-*}"]'},{label:"field_security",detail:"字段级权限（grant/except）",snippet:!0,insertText:'"field_security": { "grant": ["${1:*}"] }'},{label:"query",detail:"文档级查询限制（Query DSL）",snippet:!0,insertText:'"query": { "match_all": {} }'}]}function Hn(t,n){const e=u(t,n);return e.length<=1?"root":e[0]==="access"&&e.includes("query")?"query":e[0]==="access"&&e.length===2?"access":e[0]==="access"&&(e[1]==="search"||e[1]==="replication")&&e.length===4?"entry":"deep"}function N(){return[{label:"trigger_data",detail:"模拟触发数据（triggered_time/scheduled_time）",snippet:!0,insertText:`"trigger_data": {
  "triggered_time": "\${1:now}"
}`},{label:"alternative_input",detail:"替换 watch 输入（试跑不同数据）",snippet:!0,insertText:`"alternative_input": {
  \${0}
}`},{label:"ignore_condition",detail:"忽略 condition（强制继续动作）",snippet:!0,insertText:'"ignore_condition": ${1|false,true|}'},{label:"action_modes",detail:"逐动作执行模式（force_execute/simulate/skip…）",snippet:!0,insertText:'"action_modes": {\n  "${1:notify}": "${2|force_execute,simulate,skip,execute,force_simulate|}"\n}'},{label:"record_execution",detail:"是否记录本次执行",snippet:!0,insertText:'"record_execution": ${1|false,true|}'},{label:"simulated_actions",detail:"模拟动作（指定 actions 或 use_all）",snippet:!0,insertText:'"simulated_actions": { "use_all": ${1|true,false|} }'}]}function Qn(){return[{label:"myapp",detail:"应用名 → 权限名 → {actions, metadata}（两层键均自定）",snippet:!0,insertText:`"\${1:myapp}": {
  "\${2:read}": {
    "actions": ["\${3:read}"]
  }
}`}]}function gt(){return[{label:"actions",detail:"该应用权限包含的动作清单",snippet:!0,insertText:'"actions": ["${1:read}"]'},{label:"metadata",detail:"应用自定义元数据",snippet:!0,insertText:`"metadata": {
  \${0}
}`}]}function Wn(t,n){const e=u(t,n);return e.length<=1?"root":e.length===2?"app":e.length===3?"privilege":"deep"}function bt(){return[{label:"current_step",detail:"当前步骤（phase/action/name）",snippet:!0,insertText:`"current_step": {
  "phase": "\${1:hot}",
  "action": "\${2:rollover}"
}`},{label:"next_step",detail:"目标步骤（phase/action/name）",snippet:!0,insertText:`"next_step": {
  "phase": "\${1:hot}",
  "action": "\${2:rollover}",
  "name": "\${3:attempt_rollover}"
}`}]}function ht(){return[{label:"phase",detail:"阶段名",snippet:!0,insertText:'"phase": "${1|hot,warm,cold,frozen,delete|}"'},{label:"action",detail:"动作名（rollover/forcemerge/…）",snippet:!0,insertText:'"action": "${1:rollover}"'},{label:"name",detail:"动作实例名（可省略）",snippet:!0,insertText:'"name": "${1:attempt_rollover}"'}]}function Vn(t,n){const e=u(t,n);return e.length<=1?"root":(e[0]==="current_step"||e[0]==="next_step")&&e.length===2?"step":"deep"}function Tt(){return[{label:"indices",detail:"要复制的索引（逗号分隔/通配）",snippet:!0,insertText:'"indices": "${1:logs-*}"'},{label:"index_settings",detail:"克隆时覆盖的索引设置",snippet:!0,insertText:`"index_settings": {
  \${0}
}`},{label:"ignore_index_settings",detail:"忽略的索引设置清单",snippet:!0,insertText:'"ignore_index_settings": ["${1:index.refresh_interval}"]'}]}function kt(){return[{label:"watch",detail:"内联 Watch 定义（trigger/input/condition/actions）",snippet:!0,insertText:`"watch": {
  "trigger": { "schedule": { "interval": "5m" } },
  "input": { "simple": {} },
  "condition": { "always": {} },
  "actions": { "log": { "logging": { "text": "fired" } } }
}`},...N()]}function Jn(t,n){const e=u(t,n);if(e.length<=1)return"root";if(e[0]!=="watch")return"deep";if(e.length===2)return"watch";if(e[1]==="trigger"){if(e.length===3)return"watch-trigger";if(e.length===4&&e[2]==="schedule")return"watch-schedule";if(e[2]==="chain"){if(e.length===5)return"chain-trigger";if(e.length===6&&e[4]==="trigger")return"chain-trigger-container";if(e.length===7&&e[4]==="trigger"&&e[5]==="schedule")return"watch-schedule"}return"deep"}if(e[1]==="input"){if(e.length===3)return"watch-input";if(e[2]==="search"){if(e[3]==="request"&&e[4]==="body"){if(e.length===6)return"watch-search-body";if(e.includes("query"))return"watch-search-query"}return e.length===4?"search-input":e.length===5&&e[3]==="request"?"search-request":"deep"}if(e[2]==="http"){if(e.length===4)return"http-input";if(e.length===5&&e[3]==="request")return"http-request";if(e.length===7&&e[3]==="request"&&e[4]==="auth"&&e[5]==="basic")return"http-auth-basic";if(e.length===6&&e[3]==="request"&&e[4]==="proxy")return"http-proxy"}if(e[2]==="chain"){if(e.length===4)return"chain-input-container";if(e.length===7&&e[3]==="inputs"&&e[4]===null&&e[5]&&e[6]===null)return"chain-input"}return"deep"}if(e[1]==="condition"){if(e.length===3)return"watch-condition";if(e.length===4)return"condition-params";if(e[2]==="array_compare"){if(e.length===5)return"array-compare-body";if(e.length===6&&e[4]!=="path")return"array-compare-op"}return"deep"}if(e[1]==="actions"){if(e.length===4)return"watch-action";if(e.length===5)return"action-params";if(e.length===6&&e[3]==="email"&&e[4]==="body")return"action-email-body";if(e.length===6&&e[3]==="slack"&&e[4]==="message")return"action-slack-message";if(e.length===6&&e[3]==="jira"&&e[4]==="fields")return"action-jira-fields";if(e[3]==="email"&&e[4]==="attachments"){if(e.length===7)return"email-attachment";if(e.length===8&&e[6]==="http")return"email-att-http";if(e.length===8&&e[6]==="reporting")return"email-att-reporting";if(e.length===8&&e[6]==="data")return"email-att-data";if(e.length===9&&(e[6]==="http"||e[6]==="reporting")&&e[7]==="request")return"http-request"}return e.length===7&&e[3]==="webhook"&&e[4]==="auth"&&e[5]==="basic"?"http-auth-basic":e.length===6&&e[3]==="webhook"&&e[4]==="proxy"?"http-proxy":e.length===7&&e[3]==="pagerduty"&&e[4]==="contexts"?"pagerduty-context":e.length===8&&e[3]==="slack"&&e[4]==="message"&&e[5]==="attachments"?"slack-attachment":e.length===10&&e[3]==="slack"&&e[4]==="message"&&e[5]==="attachments"&&e[7]==="fields"?"slack-attachment-field":"deep"}return"deep"}function vt(){return[{label:"index",detail:"快照中要挂载的索引",snippet:!0,insertText:'"index": "${1:logs}"'},{label:"renamed_index",detail:"挂载后的索引名（省略沿用原名）",snippet:!0,insertText:'"renamed_index": "${1:logs-restored}"'},{label:"index_settings",detail:"挂载时覆盖的索引设置",snippet:!0,insertText:`"index_settings": {
  \${0}
}`},{label:"ignore_index_settings",detail:"忽略的索引设置清单",snippet:!0,insertText:'"ignore_index_settings": ["${1:index.refresh_interval}"]'},{label:"storage",detail:"存储方式（shared_cache 共享缓存 / full_copy 完整副本）",snippet:!0,insertText:'"storage": "${1|shared_cache,full_copy|}"'}]}function wt(){return[{label:"secure_settings_password",detail:"密钥库密码（无密码库可省略）",snippet:!0,insertText:'"secure_settings_password": "${1:keystore-password}"'}]}function qt(){return[{label:"licenses",detail:"许可证清单（多张许可）",snippet:!0,insertText:`"licenses": [
  {
    "uid": "\${1:license-uid}",
    "type": "\${2|enterprise,platinum,gold,silver,standard,basic,trial,dev|}",
    "issue_date_in_millis": \${3:1700000000000},
    "expiry_date_in_millis": \${4:1800000000000},
    "issued_to": "\${5:company}",
    "issuer": "\${6:elastic}",
    "signature": "\${7:signature}"
  }
]`},{label:"license",detail:"单张许可证（与 licenses 二选一）",snippet:!0,insertText:`"license": {
  "uid": "\${1:license-uid}",
  "type": "\${2|enterprise,platinum,gold,silver,standard,basic,trial,dev|}",
  "issue_date_in_millis": \${3:1700000000000},
  "expiry_date_in_millis": \${4:1800000000000},
  "issued_to": "\${5:company}",
  "issuer": "\${6:elastic}",
  "signature": "\${7:signature}"
}`}]}function Kt(){return[{label:"uid",detail:"许可证唯一标识",snippet:!0,insertText:'"uid": "${1:license-uid}"'},{label:"type",detail:"许可证级别",snippet:!0,insertText:'"type": "${1|enterprise,platinum,gold,silver,standard,basic,trial,dev|}"'},{label:"issue_date_in_millis",detail:"签发时间（epoch 毫秒）",snippet:!0,insertText:'"issue_date_in_millis": ${1:1700000000000}'},{label:"expiry_date_in_millis",detail:"到期时间（epoch 毫秒）",snippet:!0,insertText:'"expiry_date_in_millis": ${1:1800000000000}'},{label:"start_date_in_millis",detail:"生效时间（epoch 毫秒，可选）",snippet:!0,insertText:'"start_date_in_millis": ${1:1700000000000}'},{label:"issued_to",detail:"被授权方",snippet:!0,insertText:'"issued_to": "${1:company}"'},{label:"issuer",detail:"签发方",snippet:!0,insertText:'"issuer": "${1:elastic}"'},{label:"max_nodes",detail:"最大节点数",snippet:!0,insertText:'"max_nodes": ${1:100}'},{label:"max_resource_units",detail:"最大资源单元数（企业版）",snippet:!0,insertText:'"max_resource_units": ${1:200}'},{label:"signature",detail:"许可证签名",snippet:!0,insertText:'"signature": "${1:signature}"'}]}function Zn(t,n){const e=u(t,n);return e.length<=1?"root":e[0]==="license"&&e.length===2||e[0]==="licenses"&&e.length===3?"entry":"deep"}function It(){return[{label:"pipeline",detail:"内联管道定义（省略则用路径上的已存管道）",snippet:!0,insertText:`"pipeline": {
  "processors": [
    { "set": { "field": "\${1:field}", "value": "\${2:value}" } }
  ]
}`},{label:"docs",detail:"待试跑文档（_source 为文档内容）",snippet:!0,insertText:`"docs": [
  {
    "_source": { "\${1:field}": "\${2:value}" }
  }
]`},{label:"verbose",detail:"返回每个处理器的中间结果",snippet:!0,insertText:'"verbose": ${1|true,false|}'}]}function St(){return[{label:"_index",detail:"模拟文档所属索引",snippet:!0,insertText:'"_index": "${1:my-index}"'},{label:"_id",detail:"模拟文档 id",snippet:!0,insertText:'"_id": "${1:1}"'},{label:"_source",detail:"文档内容",snippet:!0,insertText:`"_source": {
  \${0}
}`},{label:"_routing",detail:"路由值",snippet:!0,insertText:'"_routing": "${1:routing}"'}]}function Xn(t,n){const e=u(t,n);return e.length<=1?"root":e[0]==="pipeline"?e.length===2?"pipeline":e[1]==="processors"&&e.length===4||e[1]==="on_failure"&&(e.length===3||e.length===4)?"pipeline-processor":"deep":e[0]==="docs"&&e.length===3?"doc":"deep"}function Rt(){return[{label:"index",detail:"目标索引（省略则诊断第一个未分配分片）",snippet:!0,insertText:'"index": "${1:my-index}"'},{label:"shard",detail:"分片序号",snippet:!0,insertText:'"shard": ${1:0}'},{label:"primary",detail:"是否诊断主分片",snippet:!0,insertText:'"primary": ${1|true,false|}'},{label:"current_node",detail:"假设分片当前所在节点（模拟分配）",snippet:!0,insertText:'"current_node": "${1:node-a}"'},{label:"include_disk_info",detail:"返回磁盘用量信息",snippet:!0,insertText:'"include_disk_info": ${1|true,false|}'},{label:"include_yes_decisions",detail:"返回「允许分配」的决策明细",snippet:!0,insertText:'"include_yes_decisions": ${1|true,false|}'}]}const ea=["text","keyword","constant_keyword","wildcard","match_only_text","search_as_you_type","annotated_text","semantic_text","long","integer","short","byte","double","float","half_float","scaled_float","unsigned_long","token_count","date","date_nanos","boolean","ip","integer_range","long_range","float_range","double_range","date_range","ip_range","object","nested","flattened","join","alias","version","aggregate_metric_double","histogram","geo_point","geo_shape","shape","point","binary","completion","percolator","rank_feature","rank_features","dense_vector","sparse_vector"];function ta(){return[{label:"properties",detail:"字段映射集合",snippet:!0,insertText:'"properties": {\n  "${1:field}": { "type": "${2:keyword}" }\n}'},{label:"dynamic",detail:"动态映射策略（true/false/strict）",snippet:!0,insertText:'"dynamic": "${1|true,false,strict|}"'},{label:"type",detail:"字段类型",snippet:!0,insertText:'"type": "${1|keyword,text,long,integer,double,date,boolean,ip,object,nested|}"'},{label:"fields",detail:"多字段（子字段）",snippet:!0,insertText:'"fields": {\n  "${1:sub}": { "type": "${2:keyword}" }\n}'}]}const ia=[{label:"boolean",detail:"布尔"},{label:"composite",detail:"组合（多字段脚本，8.10+）"},{label:"date",detail:"日期"},{label:"double",detail:"双精度浮点"},{label:"geo_point",detail:"地理点"},{label:"ip",detail:"IP 地址"},{label:"keyword",detail:"关键字"},{label:"long",detail:"长整型"},{label:"lookup",detail:"查表（需 index + lookup 配置）"}];function na(t,n=t.length){const e=u(t,n),a=e.lastIndexOf("runtime_mappings");return a<0?!1:a+2===e.length-1&&e[e.length-1]==="type"&&!!e[a+1]}function aa(t,n=t.length){const e=u(t,n),a=e.lastIndexOf("runtime_mappings");return a>=0&&a<e.length-1}function ra(){return[{label:"type",detail:"字段类型",snippet:!0,insertText:'"type": "${1|text,keyword,long,integer,double,float,date,boolean,ip,object,nested|}"'},{label:"analyzer",detail:"索引分词器",snippet:!0,insertText:'"analyzer": "${1:standard}"'},{label:"search_analyzer",detail:"检索分词器",snippet:!0,insertText:'"search_analyzer": "${1:standard}"'},{label:"normalizer",detail:"keyword 归一化器",snippet:!0,insertText:'"normalizer": "${1:lowercase}"'},{label:"format",detail:"日期格式（date 字段）",snippet:!0,insertText:'"format": "${1:yyyy-MM-dd HH:mm:ss}"'},{label:"ignore_above",detail:"超过该长度的值不索引（keyword）",snippet:!0,insertText:'"ignore_above": ${1:256}'},{label:"ignore_malformed",detail:"类型不符的值忽略而非报错",snippet:!0,insertText:'"ignore_malformed": ${1|false,true|}'},{label:"index",detail:"是否索引（false=不可检索）",snippet:!0,insertText:'"index": ${1|true,false|}'},{label:"doc_values",detail:"列式存储（排序/聚合依赖）",snippet:!0,insertText:'"doc_values": ${1|true,false|}'},{label:"null_value",detail:"显式 null 的替代值",snippet:!0,insertText:'"null_value": "${1:NULL}"'},{label:"copy_to",detail:"复制到组合字段",snippet:!0,insertText:'"copy_to": ["${1:all_text}"]'},{label:"fields",detail:"多字段（子字段）",snippet:!0,insertText:`"fields": {
  "\${1:keyword}": { "type": "keyword" }
}`},{label:"properties",detail:"子字段映射（object/nested）",snippet:!0,insertText:`"properties": {
  \${0}
}`},{label:"dynamic",detail:"对象的动态映射策略",snippet:!0,insertText:'"dynamic": "${1|true,false,strict|}"'},{label:"enabled",detail:"object 是否解析（false=整对象原样存档）",snippet:!0,insertText:'"enabled": ${1|true,false|}'},{label:"index_options",detail:"倒排索引选项（text）",snippet:!0,insertText:'"index_options": "${1|docs,freqs,positions,offsets|}"'},{label:"norms",detail:"是否存评分归一因子",snippet:!0,insertText:'"norms": ${1|true,false|}'},{label:"store",detail:"是否单独存储字段值",snippet:!0,insertText:'"store": ${1|false,true|}'}]}function sa(t,n){const e=u(t,n);if(e.length<3)return!1;const a=e[e.length-3],r=e[e.length-2];return(a==="properties"||a==="fields")&&!!r}function la(t,n){const e=t.lastIndexOf(`
`,Math.max(0,n-1))+1,a=/^[ \t]*/.exec(t.slice(e));return a?a[0]:""}function oa(t,n){return n?t.replace(/\n/g,`
`+n):t}function u(t,n){const e=t.slice(0,Math.max(0,Math.min(n,t.length))),a=[];let r=!1,s="";for(let l=0;l<e.length;l++){const o=e[l];if(r){if(o==='"'&&!g(e,l)){r=!1;let y=l+1;for(;y<e.length&&/\s/.test(e[y]);)y++;e[y]===":"&&a.length&&(a[a.length-1]=s)}else s+=o;continue}const f=b(e,l);if(f!==-1){l=f-1;continue}if(o==='"'){r=!0,s="";continue}o==="{"||o==="["?a.push(null):(o==="}"||o==="]")&&a.pop()}return a}function da(t,n){const e=u(t,n),a=e.lastIndexOf("template");if(a<0)return"template";const r=a+1<e.length?e[a+1]:null;return r==="settings"?"settings":r==="mappings"||r==="mapping"?"mapping":r==="aliases"?"aliases":"template"}function pa(t,n){const a=u(t,n)[0]??null;return a==="settings"?"settings":a==="mappings"||a==="mapping"?"mapping":a==="aliases"?"aliases":"root"}function ua(){return[{label:"settings",detail:"索引设置（分片/副本/刷新间隔…）",snippet:!0,insertText:`"settings": {
  \${0}
}`},{label:"mappings",detail:"字段映射",snippet:!0,insertText:`"mappings": {
  "properties": {
    \${0}
  }
}`},{label:"aliases",detail:"别名",snippet:!0,insertText:`"aliases": {
  \${0}
}`}]}function ca(){return[{label:"filter",detail:"别名过滤查询（只有命中的文档能通过别名访问）",snippet:!0,insertText:`"filter": {
  \${0}
}`},{label:"index_routing",detail:"写入路由值",snippet:!0,insertText:'"index_routing": "${1:routing}"'},{label:"routing",detail:"读写路由值",snippet:!0,insertText:'"routing": "${1:routing}"'},{label:"search_routing",detail:"检索路由值",snippet:!0,insertText:'"search_routing": "${1:routing}"'},{label:"is_write_index",detail:"是否作为该别名的写索引",snippet:!0,insertText:'"is_write_index": ${1|true,false|}'},{label:"is_hidden",detail:"别名是否隐藏",snippet:!0,insertText:'"is_hidden": ${1|false,true|}'}]}function Et(){return[{label:"query",detail:"SQL 语句",snippet:!0,insertText:'"query": "SELECT * FROM ${1:my-index} LIMIT 10"'},{label:"fetch_size",detail:"每批返回行数（游标分页）",snippet:!0,insertText:'"fetch_size": ${1:1000}'},{label:"time_zone",detail:"时区（日期函数按它解释）",snippet:!0,insertText:'"time_zone": "${1:UTC}"'},{label:"columnar",detail:"列式返回（true=按列组织）",snippet:!0,insertText:'"columnar": ${1|false,true|}'},{label:"params",detail:"参数化查询的命名参数（?name）",snippet:!0,insertText:`"params": {
  \${0}
}`},{label:"runtime_mappings",detail:"本次查询的运行时字段",snippet:!0,insertText:`"runtime_mappings": {
  \${0}
}`},{label:"filter",detail:"对结果再做 Query DSL 过滤",snippet:!0,insertText:`"filter": {
  \${0}
}`},{label:"field_multi_value_leniency",detail:"数组字段遇到多值时是否放宽",snippet:!0,insertText:'"field_multi_value_leniency": ${1|false,true|}'},{label:"allow_partial_search_results",detail:"分片超时/失败时是否返回部分结果",snippet:!0,insertText:'"allow_partial_search_results": ${1|true,false|}'},{label:"keep_alive",detail:"异步/同步搜索结果的保留时长",snippet:!0,insertText:'"keep_alive": "${1:1m}"'},{label:"keep_on_completion",detail:"同步等待时也把结果存起来（配合 wait_for_completion_timeout）",snippet:!0,insertText:'"keep_on_completion": ${1|false,true|}'},{label:"wait_for_completion_timeout",detail:"超过该时长转异步（返回 id）",snippet:!0,insertText:'"wait_for_completion_timeout": "${1:1s}"'},{label:"page_timeout",detail:"游标翻页的最短保留时长",snippet:!0,insertText:'"page_timeout": "${1:1m}"'},{label:"request_timeout",detail:"整个请求的超时",snippet:!0,insertText:'"request_timeout": "${1:30s}"'},{label:"catalog",detail:"查询默认集群（仅本地数据）",snippet:!0,insertText:'"catalog": "${1:my-cluster}"'},{label:"cursor",detail:"翻页游标（上次响应里的 cursor）",snippet:!0,insertText:'"cursor": "${1:cursor}"'},{label:"index_include_frozen",detail:"是否允许查询冻结索引",snippet:!0,insertText:'"index_include_frozen": ${1|false,true|}'}]}const ma=[{label:"SELECT *",text:'SELECT * FROM \\"my-index\\" LIMIT 100',detail:"取前 100 行"},{label:"SELECT WHERE",text:`SELECT * FROM \\"my-index\\" WHERE field = 'x' LIMIT 100`,detail:"带条件过滤"},{label:"SELECT GROUP BY",text:'SELECT field, COUNT(*) AS c FROM \\"my-index\\" GROUP BY field LIMIT 100',detail:"分组计数"}],_a=[{label:"WHERE",text:"WHERE ",detail:"条件"},{label:"AND",text:"AND ",detail:"与"},{label:"OR",text:"OR ",detail:"或"},{label:"NOT",text:"NOT ",detail:"取反"},{label:"GROUP BY",text:"GROUP BY ",detail:"分组"},{label:"HAVING",text:"HAVING ",detail:"分组后过滤"},{label:"ORDER BY",text:"ORDER BY ",detail:"排序"},{label:"LIMIT",text:"LIMIT ",detail:"限制行数"},{label:"JOIN",text:"JOIN ",detail:"连接"},{label:"LIKE",text:"LIKE ",detail:"模式匹配"},{label:"IN",text:"IN (",detail:"集合"},{label:"IS NULL",text:"IS NULL",detail:"空值判断"},{label:"BETWEEN",text:"BETWEEN ",detail:"区间"},{label:"COUNT(*)",text:"COUNT(*)",detail:"计数"},{label:"AVG(",text:"AVG(",detail:"平均"},{label:"SUM(",text:"SUM(",detail:"求和"},{label:"MIN(",text:"MIN(",detail:"最小"},{label:"MAX(",text:"MAX(",detail:"最大"}];function At(){return[{label:"doc",detail:"需要部分更新的字段",snippet:!0,insertText:`"doc": {
  \${0}
}`},{label:"upsert",detail:"文档不存在时插入的全文",snippet:!0,insertText:`"upsert": {
  \${0}
}`},{label:"doc_as_upsert",detail:"不存在时把 doc 当 upsert 写入",snippet:!0,insertText:'"doc_as_upsert": ${1|true,false|}'},{label:"script",detail:"脚本更新（与 doc 二选一）",snippet:!0,insertText:`"script": {
  "source": "\${1:ctx._source.field = params.value}"
}`},{label:"scripted_upsert",detail:"文档不存在时脚本照常执行（配合 upsert）",snippet:!0,insertText:'"scripted_upsert": ${1|false,true|}'},{label:"detect_noop",detail:"内容无变化时不写（默认 true）",snippet:!0,insertText:'"detect_noop": ${1|true,false|}'},{label:"_source",detail:"响应里是否回源文档",snippet:!0,insertText:'"_source": ${1|true,false|}'}]}function F(){return[{label:"source",detail:"painless 脚本文本",snippet:!0,insertText:'"source": "${1:ctx._source.field = params.value}"'},{label:"lang",detail:"脚本语言（默认 painless）",snippet:!0,insertText:'"lang": "${1:painless}"'},{label:"params",detail:"脚本参数",snippet:!0,insertText:`"params": {
  \${0}
}`},{label:"id",detail:"引用已存脚本（与 source 二选一）",snippet:!0,insertText:'"id": "${1:my-script}"'}]}function fa(t,n){const e=u(t,n);if(e.length<=1)return"root";const a=e[0]??null;return a==="doc"||a==="upsert"?"doc":a==="script"&&e.length===2?"script":"deep"}function zt(){return[{label:"conditions",detail:"滚动条件（满足任一即滚）",snippet:!0,insertText:`"conditions": {
  "max_age": "\${1:7d}"
}`},{label:"settings",detail:"新索引的设置",snippet:!0,insertText:`"settings": {
  \${0}
}`},{label:"mappings",detail:"新索引的字段映射",snippet:!0,insertText:`"mappings": {
  "properties": {
    \${0}
  }
}`},{label:"aliases",detail:"新索引的别名配置",snippet:!0,insertText:`"aliases": {
  \${0}
}`}]}function Pt(){return[{label:"max_age",detail:"索引最大年龄（时间串）",snippet:!0,insertText:'"max_age": "${1:7d}"'},{label:"max_docs",detail:"索引最大文档数",snippet:!0,insertText:'"max_docs": ${1:1000000}'},{label:"max_size",detail:"索引最大总大小",snippet:!0,insertText:'"max_size": "${1:50gb}"'},{label:"max_primary_shard_size",detail:"单主分片最大大小",snippet:!0,insertText:'"max_primary_shard_size": "${1:50gb}"'},{label:"max_primary_shard_docs",detail:"单主分片最大文档数",snippet:!0,insertText:'"max_primary_shard_docs": ${1:200000}'}]}function ya(t,n){const e=u(t,n);if(e.length<=1)return"root";const a=e[0]??null;return a==="conditions"?e.length===2?"conditions":"deep":a==="settings"?"settings":a==="mappings"||a==="mapping"?"mapping":a==="aliases"?"aliases":"deep"}function Bt(){return[{label:"query",detail:"选择要删除的文档",snippet:!0,insertText:`"query": {
  "match_all": {}
}`},{label:"max_docs",detail:"最多删除多少条",snippet:!0,insertText:'"max_docs": ${1:1000}'},{label:"slices",detail:"并行切片数（auto 或数字）",snippet:!0,insertText:'"slices": "${1:auto}"'},{label:"slice",detail:"手工切片（id/max 自己分配）",snippet:!0,insertText:`"slice": {
  "id": \${1:0},
  "max": \${2:2}
}`}]}function Ct(){return[{label:"query",detail:"选择要更新的文档",snippet:!0,insertText:`"query": {
  "match_all": {}
}`},{label:"script",detail:"对命中文档执行的脚本",snippet:!0,insertText:`"script": {
  "source": "\${1:ctx._source.field = params.value}"
}`},{label:"max_docs",detail:"最多更新多少条",snippet:!0,insertText:'"max_docs": ${1:1000}'},{label:"pipeline",detail:"写入前经过的 ingest pipeline",snippet:!0,insertText:'"pipeline": "${1:my-pipeline}"'},{label:"slices",detail:"并行切片数（auto 或数字）",snippet:!0,insertText:'"slices": "${1:auto}"'}]}function xa(t,n){const e=u(t,n);if(e.length<=1)return"root";const a=e[0]??null;return a==="query"?"query":a==="script"&&e.length===2?"script":"deep"}function Ot(){return[{label:"query",detail:"查询条件（此体只有 query 一个根键）",snippet:!0,insertText:`"query": {
  \${0}
}`}]}function Lt(){return[{label:"query",detail:"EQL 查询串（如 any where true / process where …）",snippet:!0,insertText:'"query": "${1:any where true}"'},{label:"filter",detail:"Query DSL 过滤（与 EQL 结果取交集）",snippet:!0,insertText:`"filter": {
  \${0}
}`},{label:"case_sensitive",detail:"字符串比较是否区分大小写（默认 false）",snippet:!0,insertText:'"case_sensitive": ${1|true,false|}'},{label:"event_category_field",detail:"事件类别字段（默认 event.category）",snippet:!0,insertText:'"event_category_field": "${1:event.category}"'},{label:"timestamp_field",detail:"时间戳字段（默认 @timestamp）",snippet:!0,insertText:'"timestamp_field": "${1:@timestamp}"'},{label:"tiebreaker_field",detail:"排序去重字段（时间戳相同时的稳定序）",snippet:!0,insertText:'"tiebreaker_field": "${1:event.id}"'},{label:"size",detail:"每页事件数（默认 10）",snippet:!0,insertText:'"size": ${1:10}'},{label:"fields",detail:"随结果返回的字段清单",snippet:!0,insertText:'"fields": ["${1:field}"]'},{label:"max_samples_per_key",detail:"sample 查询每个键的最大事件数",snippet:!0,insertText:'"max_samples_per_key": ${1:10}'},{label:"keep_alive",detail:"异步结果保留时间（如 5d；到期后结果被清理）",snippet:!0,insertText:'"keep_alive": "${1:5d}"'},{label:"keep_on_completion",detail:"查询完成后是否保留结果（默认 false）",snippet:!0,insertText:'"keep_on_completion": ${1|true,false|}'},{label:"wait_for_completion_timeout",detail:"同步等待上限，超时转异步",snippet:!0,insertText:'"wait_for_completion_timeout": "${1:1s}"'},{label:"allow_partial_sequence_results",detail:"sequence 分片缺失时是否返回部分结果",snippet:!0,insertText:'"allow_partial_sequence_results": ${1|false,true|}'},{label:"result_position",detail:"结果位置（tail 默认 / head）",snippet:!0,insertText:'"result_position": "${1|tail,head|}"'},{label:"runtime_mappings",detail:"运行时字段（只在本查询生效）",snippet:!0,insertText:`"runtime_mappings": {
  \${0}
}`}]}const $a=[{label:"any where",text:"any where true",detail:"任意事件（EQL 最小查询）"},{label:"process where",text:'process where process.name == "cmd.exe"',detail:"进程事件过滤"},{label:"sequence by",text:"sequence by process.entity_id [process where true] [network where true]",detail:"按键排序的有序事件序列（可配 with maxspan）"},{label:"sample by",text:"sample by process.entity_id [process where true]",detail:"按键采样事件（每键最多 max_samples_per_key 条）"}],ga=[{label:"where",text:"where ",detail:"事件类别后的过滤条件"},{label:"and",text:" and ",detail:"条件与"},{label:"or",text:" or ",detail:"条件或"},{label:"not",text:"not ",detail:"条件取反"},{label:"by",text:" by ",detail:"sequence/sample 的分组键"},{label:"with maxspan=",text:"with maxspan=",detail:"序列最大时间跨度（如 5m）"},{label:"until",text:" until ",detail:"序列终止条件"}];function Ut(){return[{label:"id",detail:"已存模板 id（与 source 二选一）",snippet:!0,insertText:'"id": "${1:my-template}"'},{label:"source",detail:"内联 Mustache 模板",snippet:!0,insertText:`"source": {
  \${0}
}`},{label:"params",detail:"模板参数",snippet:!0,insertText:`"params": {
  \${0}
}`}]}function ba(t,n){return u(t,n).length<=1?"root":"deep"}function Mt(){return[{label:"docs",detail:"按 _index/_id 精确取回多篇文档",snippet:!0,insertText:`"docs": [
  {
    "_index": "\${1:my-index}",
    "_id": "\${2:1}"
  }
]`},{label:"ids",detail:"按 id 批量取回（索引由路径或下面 index 指定）",snippet:!0,insertText:'"ids": ["${1:1}"]'}]}function ha(){return[{label:"_index",detail:"文档所在索引（路径无索引时必填）",snippet:!0,insertText:'"_index": "${1:my-index}"'},{label:"_id",detail:"文档 id",snippet:!0,insertText:'"_id": "${1:1}"'},{label:"routing",detail:"取回时使用的路由值",snippet:!0,insertText:'"routing": "${1:routing}"'},{label:"_source",detail:"是否/如何回源字段",snippet:!0,insertText:'"_source": ${1|true,false|}'},{label:"stored_fields",detail:"返回的 stored 字段",snippet:!0,insertText:'"stored_fields": ["${1:field}"]'},{label:"version",detail:"期望版本（配合 version_type）",snippet:!0,insertText:'"version": ${1:1}'},{label:"version_type",detail:"版本类型（internal/external）",snippet:!0,insertText:'"version_type": "${1|internal,external|}"'}]}function Ta(t,n){const e=u(t,n);return e.length<=1?"root":e.length===3&&e[0]==="docs"?"doc":"deep"}function Nt(){return[{label:"script",detail:"脚本对象（lang + source）",snippet:!0,insertText:`"script": {
  "lang": "\${1:painless}",
  "source": "\${2:ctx._source.field = 1}"
}`}]}function ka(){return[{label:"lang",detail:"脚本语言（默认 painless）",snippet:!0,insertText:'"lang": "${1:painless}"'},{label:"source",detail:"脚本文本",snippet:!0,insertText:'"source": "${1:ctx._source.field = 1}"'},{label:"params",detail:"脚本参数默认值",snippet:!0,insertText:`"params": {
  \${0}
}`}]}function Ft(){return[{label:"script",detail:"要执行的 Painless 脚本",snippet:!0,insertText:`"script": {
  "source": "\${1:return 1;}"
}`},{label:"context",detail:"执行上下文（painless_test/score/filter…）",snippet:!0,insertText:'"context": "${1:painless_test}"'},{label:"context_setup",detail:"上下文初始化参数（如 index/document）",snippet:!0,insertText:`"context_setup": {
  \${0}
}`}]}function va(t,n){const e=u(t,n);return e.length<=1?"root":e[0]==="script"&&e.length===2?"script":"deep"}const wa={version_type:{values:["internal","external","external_gte"],quoted:!0,detail:"版本类型"},slices:{values:["auto"],quoted:!0,detail:"自动切片（也可填数字）"},is_write_index:{values:["true","false"],quoted:!1,detail:"写索引开关"},is_hidden:{values:["true","false"],quoted:!1,detail:"隐藏别名开关"},must_exist:{values:["true","false"],quoted:!1,detail:"不存在时报错"},detect_noop:{values:["true","false"],quoted:!1,detail:"无变化不写"},scripted_upsert:{values:["true","false"],quoted:!1,detail:"文档不存在时脚本照常执行"},doc_as_upsert:{values:["true","false"],quoted:!1,detail:"doc 作为 upsert 写入"},columnar:{values:["true","false"],quoted:!1,detail:"列式返回"},field_multi_value_leniency:{values:["true","false"],quoted:!1,detail:"多值字段放宽"},allow_partial_search_results:{values:["true","false"],quoted:!1,detail:"允许部分结果"},keep_on_completion:{values:["true","false"],quoted:!1,detail:"完成后保留结果"},case_sensitive:{values:["false","true"],quoted:!1,detail:"EQL 字符串比较区分大小写"},allow_primary:{values:["true","false"],quoted:!1,detail:"允许取消主分片恢复"},accept_data_loss:{values:["true","false"],quoted:!1,detail:"确认接受数据丢失"},primary:{values:["true","false"],quoted:!1,detail:"主分片"},include_disk_info:{values:["true","false"],quoted:!1,detail:"含磁盘用量"},include_yes_decisions:{values:["true","false"],quoted:!1,detail:"含允许分配的决策明细"},verify:{values:["true","false"],quoted:!1,detail:"注册仓库时校验可读写"},ignore_unavailable:{values:["true","false"],quoted:!1,detail:"忽略不存在的索引"},include_global_state:{values:["false","true"],quoted:!1,detail:"包含集群全局状态（高危）"},partial:{values:["false","true"],quoted:!1,detail:"允许部分分片/恢复"},include_aliases:{values:["true","false"],quoted:!1,detail:"恢复时包含别名"},enabled:{values:["true","false"],quoted:!1,detail:"是否启用"},allow_restricted_indices:{values:["false","true"],quoted:!1,detail:"允许访问受限系统索引"},allow_lazy_open:{values:["false","true"],quoted:!1,detail:"允许惰性打开作业"},use_null:{values:["false","true"],quoted:!1,detail:"缺失值作为独立值"},verbose:{values:["true","false"],quoted:!1,detail:"返回处理器中间结果"},exclude_frequent:{values:["all","none","by","over"],quoted:!0,detail:"排除高频值范围"},index_include_frozen:{values:["true","false"],quoted:!1,detail:"含冻结索引"},_source:{values:["true","false"],quoted:!1,detail:"回源开关（也可传字段数组）"},offsets:{values:["false","true"],quoted:!1,detail:"返回词项偏移"},positions:{values:["false","true"],quoted:!1,detail:"返回词项位置"},term_statistics:{values:["false","true"],quoted:!1,detail:"词项全局统计"},field_statistics:{values:["true","false"],quoted:!1,detail:"字段级统计"},op_type:{values:["index","create"],quoted:!0,detail:"写入形态（create=已存在则失败）"},context:{values:["painless_test","score","filter"],quoted:!0,detail:"脚本执行上下文"},grant_type:{values:["access_token","password"],quoted:!0,detail:"代授 API Key 的授权方式"},skip_result:{values:["true","false"],quoted:!1,detail:"事件期内不产生异常结果"},skip_model_update:{values:["true","false"],quoted:!1,detail:"事件期内不更新模型"},use_significance:{values:["true","false"],quoted:!1,detail:"Graph 只保留显著关联"},owner:{values:["true","false"],quoted:!1,detail:"只吊销当前用户拥有的 API Key"},ignore_condition:{values:["false","true"],quoted:!1,detail:"试跑 Watch 时忽略条件"},record_execution:{values:["false","true"],quoted:!1,detail:"是否记录本次 Watch 执行"},storage:{values:["shared_cache","full_copy"],quoted:!0,detail:"挂载快照的存储方式"},allow_partial_sequence_results:{values:["false","true"],quoted:!1,detail:"EQL sequence 允许部分分片结果"},result_position:{values:["tail","head"],quoted:!0,detail:"EQL 结果位置"}};function jt(t,n){const e=u(t,n);return e.length<=1?"root":e[0]==="filter"?"query":"deep"}function qa(t,n){return jt(t,n)}function Dt(){return[{label:"actions",detail:"一条或多条别名动作",snippet:!0,insertText:'"actions": [\n  { "add": { "index": "${1:my-index}", "alias": "${2:my-alias}" } }\n]'}]}function Ka(){return[{label:"add",detail:"给索引加别名（可带 filter/routing）",snippet:!0,insertText:`"add": {
  "index": "\${1:my-index}",
  "alias": "\${2:my-alias}"
}`},{label:"remove",detail:"移除索引上的别名",snippet:!0,insertText:`"remove": {
  "index": "\${1:my-index}",
  "alias": "\${2:my-alias}"
}`},{label:"remove_index",detail:"连索引一起删除（危险）",snippet:!0,insertText:`"remove_index": {
  "index": "\${1:my-index}"
}`}]}function Ia(){return[{label:"index",detail:"目标索引",snippet:!0,insertText:'"index": "${1:my-index}"'},{label:"indices",detail:"多个目标索引",snippet:!0,insertText:'"indices": ["${1:my-index}"]'},{label:"alias",detail:"别名",snippet:!0,insertText:'"alias": "${1:my-alias}"'},{label:"aliases",detail:"多个别名",snippet:!0,insertText:'"aliases": ["${1:my-alias}"]'},{label:"filter",detail:"别名过滤查询（只透出命中文档）",snippet:!0,insertText:`"filter": {
  \${0}
}`},{label:"routing",detail:"读写路由值",snippet:!0,insertText:'"routing": "${1:routing}"'},{label:"index_routing",detail:"写入路由值",snippet:!0,insertText:'"index_routing": "${1:routing}"'},{label:"search_routing",detail:"检索路由值",snippet:!0,insertText:'"search_routing": "${1:routing}"'},{label:"is_write_index",detail:"是否作为该别名的写索引",snippet:!0,insertText:'"is_write_index": ${1|true,false|}'},{label:"is_hidden",detail:"别名是否隐藏",snippet:!0,insertText:'"is_hidden": ${1|false,true|}'},{label:"must_exist",detail:"目标索引/别名不存在时是否报错",snippet:!0,insertText:'"must_exist": ${1|false,true|}'}]}function Sa(){return[{label:"index",detail:"目标索引",snippet:!0,insertText:'"index": "${1:my-index}"'},{label:"indices",detail:"多个目标索引",snippet:!0,insertText:'"indices": ["${1:my-index}"]'},{label:"alias",detail:"别名",snippet:!0,insertText:'"alias": "${1:my-alias}"'},{label:"aliases",detail:"多个别名",snippet:!0,insertText:'"aliases": ["${1:my-alias}"]'},{label:"must_exist",detail:"目标不存在时是否报错",snippet:!0,insertText:'"must_exist": ${1|false,true|}'}]}function Ra(){return[{label:"index",detail:"要删除的索引",snippet:!0,insertText:'"index": "${1:my-index}"'},{label:"indices",detail:"要删除的多个索引",snippet:!0,insertText:'"indices": ["${1:my-index}"]'}]}function Ea(t,n){const e=u(t,n);if(e.length<=1)return"root";if(e.length===3&&e[0]==="actions")return"action";if(e.length===4&&e[0]==="actions"){if(e[2]==="add")return"config-add";if(e[2]==="remove")return"config-remove";if(e[2]==="remove_index")return"config-remove-index"}return"deep"}function Gt(){return[{label:"scroll",detail:"保持游标的时长（如 1m/30s）",snippet:!0,insertText:'"scroll": "${1:1m}"'},{label:"scroll_id",detail:"上一页返回的游标 id",snippet:!0,insertText:'"scroll_id": "${1:scroll-id}"'}]}function Yt(){return[{label:"scroll_id",detail:"要清理的游标 id（可数组）",snippet:!0,insertText:'"scroll_id": ["${1:scroll-id}"]'}]}function j(){return[{label:"fields",detail:"要统计的字段（数组）",snippet:!0,insertText:'"fields": ["${1:field}"]'},{label:"doc",detail:"直接给文档内容（不按 id 取）",snippet:!0,insertText:`"doc": {
  \${0}
}`},{label:"filter",detail:"词项过滤（频率/长度区间）",snippet:!0,insertText:`"filter": {
  "min_term_freq": \${1:1},
  "max_num_terms": \${2:25}
}`},{label:"offsets",detail:"返回词项偏移",snippet:!0,insertText:'"offsets": ${1|false,true|}'},{label:"positions",detail:"返回词项位置",snippet:!0,insertText:'"positions": ${1|false,true|}'},{label:"term_statistics",detail:"返回词项全局统计",snippet:!0,insertText:'"term_statistics": ${1|false,true|}'},{label:"field_statistics",detail:"返回字段级统计",snippet:!0,insertText:'"field_statistics": ${1|true,false|}'},{label:"per_field_analyzer",detail:"按字段指定分词器",snippet:!0,insertText:'"per_field_analyzer": {\n  "${1:field}": "${2:standard}"\n}'},{label:"routing",detail:"取文档的路由值",snippet:!0,insertText:'"routing": "${1:routing}"'},{label:"version",detail:"期望版本",snippet:!0,insertText:'"version": ${1:1}'},{label:"version_type",detail:"版本类型",snippet:!0,insertText:'"version_type": "${1|internal,external|}"'}]}function Ht(){return[{label:"docs",detail:"按 _index/_id 批量取词项向量",snippet:!0,insertText:`"docs": [
  {
    "_index": "\${1:my-index}",
    "_id": "\${2:1}"
  }
]`},{label:"ids",detail:"按 id 批量取（索引由路径指定）",snippet:!0,insertText:'"ids": ["${1:1}"]'}]}function Aa(){return[{label:"_index",detail:"文档所在索引（路径无索引时必填）",snippet:!0,insertText:'"_index": "${1:my-index}"'},{label:"_id",detail:"文档 id",snippet:!0,insertText:'"_id": "${1:1}"'},...j()]}const za=At().map(t=>t.label),Pa=zt().map(t=>t.label),Ba=Pt().map(t=>t.label),Ca=Bt().map(t=>t.label),Oa=Ct().map(t=>t.label),La=Ot().map(t=>t.label),Ua=Ut().map(t=>t.label),Ma=Et().map(t=>t.label),Na=Mt().map(t=>t.label),Fa=Nt().map(t=>t.label),ja=Ft().map(t=>t.label),Da=Dt().map(t=>t.label),Ga=Gt().map(t=>t.label),Ya=Yt().map(t=>t.label),Ha=j().map(t=>t.label),Qa=Ht().map(t=>t.label),Wa=Qt("root").map(t=>t.label),Va=se().map(t=>t.label),Ja=le().map(t=>t.label),Za=oe().map(t=>t.label),Xa=Lt().map(t=>t.label),er=de().map(t=>t.label),tr=ue().map(t=>t.label),ir=Rt().map(t=>t.label),nr=ce().map(t=>t.label),ar=me().map(t=>t.label),rr=_e().map(t=>t.label),sr=fe().map(t=>t.label),lr=ye().map(t=>t.label),or=xe().map(t=>t.label),dr=$e().map(t=>t.label),pr=ge().map(t=>t.label),ur=[...B],cr=be().map(t=>t.label),mr=we().map(t=>t.label),_r=qe().map(t=>t.label),fr=Ke().map(t=>t.label),yr=Ie().map(t=>t.label),xr=Se().map(t=>t.label),$r=Re().map(t=>t.label),gr=Ee().map(t=>t.label),br=C().map(t=>t.label),hr=ze().map(t=>t.label),Tr=[...k,...Ae],kr=It().map(t=>t.label),vr=St().map(t=>t.label),wr=Pe().map(t=>t.label),qr=Be().map(t=>t.label),Kr=Ce().map(t=>t.label),Ir=Oe().map(t=>t.label),Sr=Le().map(t=>t.label),Rr=Ue().map(t=>t.label),Er=Me().map(t=>t.label),Ar=O("sync").map(t=>t.label),zr=L("sync").map(t=>t.label),Pr=O("retention").map(t=>t.label),Br=L("retention").map(t=>t.label),Cr=Ne().map(t=>t.label),Or=Fe().map(t=>t.label),Lr=je().map(t=>t.label),Ur=U("terms").map(t=>t.label),Mr=U("histogram").map(t=>t.label),Nr=De().map(t=>t.label),Fr=Ge().map(t=>t.label),jr=Ye().map(t=>t.label),Dr=He().map(t=>t.label),Gr=Qe().map(t=>t.label),Yr=We().map(t=>t.label),Hr=Ve().map(t=>t.label),Qr=Je().map(t=>t.label),Wr=Ze().map(t=>t.label),Vr=Xe().map(t=>t.label),Jr=et().map(t=>t.label),Zr=it().map(t=>t.label),Xr=nt().map(t=>t.label),es=at().map(t=>t.label),ts=rt().map(t=>t.label),is=st().map(t=>t.label),ns=lt().map(t=>t.label),as=ot().map(t=>t.label),rs=dt().map(t=>t.label),ss=pt().map(t=>t.label),ls=ut().map(t=>t.label),os=ct().map(t=>t.label),ds=mt().map(t=>t.label),ps=qt().map(t=>t.label),us=Kt().map(t=>t.label),cs=_t().map(t=>t.label),ms=ft().map(t=>t.label),_s=tt().map(t=>t.label),fs=yt().map(t=>t.label),ys=xt().map(t=>t.label),xs=$t().map(t=>t.label),$s=N().map(t=>t.label),gs=gt().map(t=>t.label),bs=bt().map(t=>t.label),hs=ht().map(t=>t.label),Ts=Tt().map(t=>t.label),ks=kt().map(t=>t.label),vs=vt().map(t=>t.label),ws=wt().map(t=>t.label);function qs(t,n){const e=u(t,n);if(e.length<=1)return"root";const a=e[0];return a==="source"?e.length===2?"source":e[1]==="query"?"query":e[1]==="sort"?e.length===3?"sort":"deep":e[1]==="_source"&&e.length===3?"source-fields":"deep":a==="dest"?e.length===2?"dest":"deep":a==="script"?e.length===2?"script":"deep":"root"}function Qt(t){return t==="deep"||t==="query"||t==="sort"||t==="source-fields"?[]:t==="script"?F():t==="source"?[{label:"index",detail:"源索引（可写单名或数组）",snippet:!0,insertText:'"index": "${1:src-index}"'},{label:"query",detail:"只重建命中的文档（查询体）",snippet:!0,insertText:`"query": {
  \${0}
}`},{label:"size",detail:"每批处理的文档数",snippet:!0,insertText:'"size": ${1:1000}'},{label:"_source",detail:"取哪些源字段",snippet:!0,insertText:'"_source": ["${1:field}"]'},{label:"sort",detail:"处理顺序",snippet:!0,insertText:`"sort": [
  \${0}
]`},{label:"remote",detail:"跨集群重建（远端连接与索引）",snippet:!0,insertText:`"remote": {
  "host": "\${1:http://remote:9200}"
}`}]:t==="dest"?[{label:"index",detail:"目标索引名",snippet:!0,insertText:'"index": "${1:dst-index}"'},{label:"op_type",detail:"写入形态（create=已存在则失败）",snippet:!0,insertText:'"op_type": "${1|index,create|}"'},{label:"pipeline",detail:"写入管道",snippet:!0,insertText:'"pipeline": "${1:pipeline}"'},{label:"routing",detail:"写入路由",snippet:!0,insertText:'"routing": "${1:routing}"'},{label:"version_type",detail:"版本冲突策略",snippet:!0,insertText:'"version_type": "${1|internal,external|}"'}]:[{label:"source",detail:"源索引与查询",snippet:!0,insertText:`"source": {
  "index": "\${1:src-index}"
}`},{label:"dest",detail:"目标索引",snippet:!0,insertText:`"dest": {
  "index": "\${1:dst-index}"
}`},{label:"script",detail:"重建时改写文档的脚本",snippet:!0,insertText:`"script": {
  \${0}
}`},{label:"conflicts",detail:"版本冲突处理（proceed 覆盖 / abort 中止）",snippet:!0,insertText:'"conflicts": "${1|proceed,abort|}"'},{label:"max_docs",detail:"最多重建多少条",snippet:!0,insertText:'"max_docs": ${1:1000}'},{label:"size",detail:"每批处理的文档数",snippet:!0,insertText:'"size": ${1:1000}'}]}function Ks(t,n){const e=u(t,n);return e.length<3?!1:e[e.length-3]==="aliases"&&!!e[e.length-2]}function Is(){return[{label:"index_patterns",detail:"索引名匹配模式（新索引自动套用本模板）",snippet:!0,insertText:'"index_patterns": ["${1:logs-*}"]'},{label:"priority",detail:"模板优先级（多模板命中时大者胜）",snippet:!0,insertText:'"priority": ${1:100}'},{label:"template",detail:"模板主体容器（settings/mappings/aliases 都装在这里面）",snippet:!0,insertText:`"template": {
  "settings": {
    "\${1:number_of_shards}": "\${2:1}"
  },
  "mappings": {
    "properties": {
      "\${3:field}": { "type": "\${4:keyword}" }
    }
  }
}`},{label:"settings",detail:"索引设置容器（number_of_shards/number_of_replicas 等）",snippet:!0,insertText:`"settings": {
  "number_of_shards": "\${1:1}",
  "number_of_replicas": "\${2:1}"
}`},{label:"mappings",detail:"字段映射容器（properties 结构）",snippet:!0,insertText:`"mappings": {
  "properties": {
    "\${1:field}": { "type": "\${2:keyword}" }
  }
}`},{label:"aliases",detail:"索引别名容器（新索引自动挂别名）",snippet:!0,insertText:`"aliases": {
  "\${1:alias}": {}
}`},{label:"composed_of",detail:"组合 component_template 名清单（按序叠加）",snippet:!0,insertText:'"composed_of": ["${1:component-template}"]'},{label:"data_stream",detail:"开启数据流（模板命中建为 data stream）",snippet:!0,insertText:'"data_stream": {}'},{label:"version",detail:"模板版本号（便于识别迭代）",snippet:!0,insertText:'"version": ${1:1}'},{label:"_meta",detail:"模板自定义元数据（用途/负责人等备注）",snippet:!0,insertText:'"_meta": {\n  "${1:description}": "${2:用途说明}"\n}'}]}function Wt(t,n){let e="",a=!1;for(let r=0;r<n;r++){const s=t[r];if(a){s==='"'&&!g(t,r)&&(a=!1,e='"');continue}const l=b(t,r);if(l!==-1){r=l-1;continue}if(s==='"'){a=!0;continue}/\s/.test(s)||(e=s)}return e}function Vt(t,n){for(let e=n;e<t.length;e++){if(/\s/.test(t[e]))continue;const a=b(t,e);if(a!==-1){e=a-1;continue}return t[e]}return""}function Ss(t,n,e){const a=Wt(t,Math.max(0,n)),r=a===""||a==="{"||a==="["||a===","?"":",",l=Vt(t,Math.max(0,Math.min(e,t.length)))==='"'?",":"";return{prefix:r,suffix:l}}export{Dn as $,xi as A,$i as B,X as C,Mi as D,ji as E,Yi as F,Ji as G,Rn as H,En as I,An as J,Pn as K,On as L,ea as M,Xn as N,Ln as O,Un as P,Mn as Q,ia as R,R as S,Nn as T,Fn as U,Vn as V,Wn as W,Yn as X,Hn as Y,Jn as Z,jn as _,wi as a,cn as a$,Bn as a0,Gn as a1,Zn as a2,va as a3,Ea as a4,qs as a5,aa as a6,zi as a7,Ci as a8,_a as a9,Wi as aA,Vi as aB,be as aC,he as aD,sn as aE,an as aF,rn as aG,ln as aH,yn as aI,xn as aJ,_n as aK,ke as aL,fn as aM,ri as aN,on as aO,In as aP,pn as aQ,un as aR,dn as aS,Sn as aT,$n as aU,gn as aV,qn as aW,bn as aX,hn as aY,Tn as aZ,kn as a_,ma as aa,ga as ab,$a as ac,Gi as ad,wa as ae,fa as af,ya as ag,Li as ah,Et as ai,Lt as aj,de as ak,Ui as al,ue as am,Ni as an,Fi as ao,Di as ap,Rt as aq,ce as ar,me as as,_e as at,fe as au,ye as av,xe as aw,$e as ax,ge as ay,Qi as az,vi as b,gt as b$,mn as b0,Kn as b1,vn as b2,wn as b3,we as b4,qe as b5,Ke as b6,Ie as b7,Se as b8,Re as b9,We as bA,Ve as bB,Je as bC,Ze as bD,Xe as bE,et as bF,tt as bG,it as bH,nt as bI,at as bJ,rt as bK,st as bL,lt as bM,ot as bN,dt as bO,pt as bP,ut as bQ,ct as bR,mt as bS,_t as bT,ft as bU,yt as bV,xt as bW,$t as bX,N as bY,kt as bZ,Qn as b_,F as ba,Ee as bb,zn as bc,C as bd,ze as be,Cn as bf,It as bg,St as bh,Pe as bi,Be as bj,Ce as bk,Oe as bl,Le as bm,Ue as bn,Me as bo,O as bp,L as bq,Ne as br,Fe as bs,je as bt,U as bu,De as bv,Ge as bw,Ye as bx,He as by,Qe as bz,fi as c,ki as c$,bt as c0,ht as c1,Tt as c2,vt as c3,wt as c4,qt as c5,Kt as c6,Nt as c7,ka as c8,Ft as c9,Bi as cA,Qt as cB,ca as cC,ua as cD,Is as cE,ui as cF,pi as cG,mi as cH,_i as cI,ti as cJ,si as cK,li as cL,oi as cM,di as cN,ai as cO,ni as cP,ii as cQ,te as cR,K as cS,Xt as cT,ei as cU,ee as cV,oa as cW,ci as cX,Ri as cY,Si as cZ,Ks as c_,At as ca,zt as cb,Pt as cc,sa as cd,ra as ce,ta as cf,Bt as cg,Ct as ch,Ot as ci,Ut as cj,Mt as ck,ha as cl,Dt as cm,Ka as cn,Ia as co,Sa as cp,Ra as cq,Gt as cr,Yt as cs,j as ct,Ht as cu,Aa as cv,se as cw,le as cx,oe as cy,Pi as cz,yi as d,bs as d$,P as d0,Cr as d1,Or as d2,ps as d3,mr as d4,is as d5,ts as d6,ns as d7,as as d8,Xr as d9,Lr as dA,Ur as dB,Mr as dC,Nr as dD,us as dE,os as dF,ds as dG,ls as dH,ss as dI,rs as dJ,es as dK,Zr as dL,_s as dM,Jr as dN,Qr as dO,Fr as dP,jr as dQ,Dr as dR,Gr as dS,wr as dT,qr as dU,Kr as dV,Tr as dW,vr as dX,ws as dY,vs as dZ,Ts as d_,Yr as da,Hr as db,Wr as dc,Vr as dd,kr as de,hr as df,ks as dg,cr as dh,Zi as di,Xi as dj,en as dk,tn as dl,fs as dm,ys as dn,xr as dp,dr as dq,pr as dr,Ir as ds,Sr as dt,Rr as du,Er as dv,Ar as dw,zr as dx,Pr as dy,Br as dz,b as e,hs as e0,gs as e1,nn as e2,$s as e3,xs as e4,ms as e5,cs as e6,br as e7,gr as e8,$r as e9,Fa as eA,Na as eB,Ma as eC,Ua as eD,La as eE,Pa as eF,Ba as eG,za as eH,Oa as eI,Ca as eJ,Ti as eK,_r as ea,fr as eb,yr as ec,I as ed,Hi as ee,ur as ef,sr as eg,lr as eh,or as ei,rr as ej,ar as ek,nr as el,ir as em,tr as en,er as eo,Xa as ep,Za as eq,Ja as er,Va as es,Wa as et,Qa as eu,Ha as ev,Ya as ew,Ga as ex,Da as ey,ja as ez,Zt as f,gi as g,hi as h,g as i,bi as j,Ss as k,la as l,Ki as m,qi as n,Ii as o,Oi as p,Ei as q,na as r,Ai as s,pa as t,da as u,xa as v,ba as w,Ta as x,jt as y,qa as z};
