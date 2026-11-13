/* 查询体参数注册表（query 之外的检索级顶层键）——单源供三处消费：
   ① queryAst.parseTree/serializeTree 的结构化分账（这些键不再落 extras 键值表）；
   ② RootExtrasPane「查询参数」分区的 schema 驱动表单；
   ③ querySentence 摘要条的尾部元信息（取前 N 条 / 排序 / 游标）。
   只登记「有稳定语义、值得给具名控件」的键；其余键仍走 extras 原样保留（零丢失）。 */

export type SearchParamKind = 'number' | 'boolean' | 'string' | 'json' | 'booleanNumber';

export interface SearchParamMeta {
  key: string;
  label: string;
  kind: SearchParamKind;
  group: string;
  hint: string;
  /** 空值语义：true = 移除该键（默认行为）；false 的键保留（无） */
  placeholder?: string;
}

/* 顺序即序列化书写顺序（DSL 文本稳定、审阅友好）：翻页 → 返回面 → 评分 → 性能 → 分布式 → 元数据 */
export const SEARCH_PARAMS: SearchParamMeta[] = [
  { key: 'search_after', label: '游标翻页', kind: 'json', group: '翻页与总量',
    hint: '上一页最后一条的排序值数组，配合唯一序 sort 深翻页（不会像 from+size 那样越翻越慢）', placeholder: '[1690000000000, "doc-9"]' },
  { key: 'track_total_hits', label: '精确总数', kind: 'booleanNumber', group: '翻页与总量',
    hint: '默认只统计到 10000 条；true = 精确全量，数字 = 统计到该上限为止（性能与准确性的折中）' },
  { key: 'terminate_after', label: '提前终止', kind: 'number', group: '翻页与总量',
    hint: '每个分片最多收集 N 条就返回（结果不完整，用于「有没有数据」这类探针查询）' },

  { key: 'fields', label: '返回字段', kind: 'json', group: '返回面',
    hint: 'fields API：按字段返回值（支持通配与 format），与 _source 并行生效', placeholder: '["title", "*.created_at"]' },
  { key: 'docvalue_fields', label: 'docvalue 字段', kind: 'json', group: '返回面',
    hint: '从 doc_values 列存取字段（排序/聚合字段零 _source 开销）', placeholder: '["created_at", { "field": "price", "format": "0.00" }]' },
  { key: 'stored_fields', label: 'stored 字段', kind: 'json', group: '返回面',
    hint: '只取 mapping 里 store:true 的字段（_source 关闭时仍可取）', placeholder: '["title"]' },

  { key: 'min_score', label: '最低评分', kind: 'number', group: '评分',
    hint: '丢弃 _score 低于该值的命中；常配合 function_score 调相关性阈值' },
  { key: 'track_scores', label: '保留评分', kind: 'boolean', group: '评分',
    hint: '按字段排序时仍计算 _score（默认排序会跳过评分以省算力）' },
  { key: 'explain', label: '评分解释', kind: 'boolean', group: '评分',
    hint: '每条命中附带 _explanation（排查「为什么这条排前面」）' },

  { key: 'timeout', label: '超时', kind: 'string', group: '性能与调试',
    hint: '查询级超时（如 1s / 500ms）；超时返回已收集的部分结果，不报错', placeholder: '1s' },
  { key: 'profile', label: '性能剖析', kind: 'boolean', group: '性能与调试',
    hint: '返回每个查询节点的耗时与 Lucene 调用明细（调优用，开销较大）' },
  { key: 'stats', label: '统计标签', kind: 'json', group: '性能与调试',
    hint: '给本次请求打标签，会出现在 _cluster/stats 与慢查询日志里', placeholder: '["order-search"]' },

  { key: 'indices_boost', label: '索引加权', kind: 'json', group: '分布式',
    hint: '跨索引检索时按索引加权（数组或对象形态）', placeholder: '[{ "logs-2026": 2 }, { "logs-2025": 1 }]' },
  { key: 'slice', label: '切片并行', kind: 'json', group: '分布式',
    hint: '把一次大查询切成 max 片、本次取第 id 片（手工并行导出）', placeholder: '{ "id": 0, "max": 4 }' },
  { key: 'pit', label: '时间点', kind: 'json', group: '分布式',
    hint: 'Point-in-Time：一致快照下深翻页；带 pit 时可省略 index', placeholder: '{ "id": "…", "keep_alive": "1m" }' },

  /* 1047：多路召回融合与插件扩展——此前只能落 extras 键值表。 */
  { key: 'sub_searches', label: '子搜索', kind: 'json', group: '融合与重排',
    hint: '与 query 互斥：多路召回各自写 query/knn，再由 rank 融合（ES 8.14+）', placeholder: '[{ "query": { "match_all": {} } }]' },
  { key: 'rank', label: '排名融合', kind: 'json', group: '融合与重排',
    hint: '配合 sub_searches 的 RRF 融合配置（rank_constant / rank_window_size）', placeholder: '{ "rrf": { "rank_constant": 60, "rank_window_size": 100 } }' },
  { key: 'ext', label: '搜索扩展', kind: 'json', group: '融合与重排',
    hint: '插件定义的搜索扩展段，对象按原样透传给 ES', placeholder: '{ "plugin_key": { } }' },

  { key: 'version', label: '返回版本号', kind: 'boolean', group: '元数据',
    hint: '命中里返回 _version（乐观并发排查）' },
  { key: 'seq_no_primary_term', label: '返回序号', kind: 'boolean', group: '元数据',
    hint: '命中里返回 _seq_no / _primary_term（并发写校验）' },
];

export const SEARCH_PARAM_KEYS: ReadonlySet<string> = new Set(SEARCH_PARAMS.map(p => p.key));

/** 序列化书写顺序（注册顺序；未注册的查询体参数按插入序殿后） */
export const SEARCH_PARAM_ORDER: readonly string[] = SEARCH_PARAMS.map(p => p.key);

export const SEARCH_PARAM_META: Record<string, SearchParamMeta> =
  Object.fromEntries(SEARCH_PARAMS.map(p => [p.key, p]));

/** 分组序（UI 分区渲染用；同组键保持注册顺序） */
export const SEARCH_PARAM_GROUPS: Array<{ group: string; items: SearchParamMeta[] }> = (() => {
  const out: Array<{ group: string; items: SearchParamMeta[] }> = [];
  for (const p of SEARCH_PARAMS) {
    let g = out.find(x => x.group === p.group);
    if (!g) { g = { group: p.group, items: [] }; out.push(g); }
    g.items.push(p);
  }
  return out;
})();

/* ═══ 1063：搜索请求级 URL 参数（不是 DSL body）═══
   ES 官方把 routing / preference / search_type / allow_partial_search_results /
   ignore_unavailable / expand_wildcards 定义为查询串参数；写进 body 会被 ES 拒绝。
   此前 preference / allow_partial_search_results 被误登记为 body 键——现移出注册表，
   由「请求选项」面板单独编辑，执行时拼到 _search 的 URL 上（后端白名单校验）。
   注意：粘贴的 body 若含这些键会落 extras 原样保真，不再冒充合法 body 键。 */
export interface RequestParamMeta {
  key: string;
  label: string;
  kind: 'string' | 'enum';
  hint: string;
  placeholder?: string;
  options?: string[];
}
export const REQUEST_PARAMS: RequestParamMeta[] = [
  { key: 'routing', label: '路由值', kind: 'string', hint: '自定义路由（join/父子文档常按主体路由）：只决定落到哪个分片，不改变查询语义', placeholder: '主体 ID' },
  { key: 'preference', label: '分片偏好', kind: 'string', hint: '_local / _primary / 自定义串：复用分片缓存或固定副本', placeholder: '_local' },
  { key: 'search_type', label: '搜索类型', kind: 'enum', options: ['query_then_fetch', 'dfs_query_then_fetch'],
    hint: 'dfs_query_then_fetch 先全局统计词频再打分（小索引相关性更稳，开销更高）' },
  { key: 'allow_partial_search_results', label: '允许部分结果', kind: 'enum', options: ['true', 'false'],
    hint: '分片失败时返回部分结果（默认 true）；false 则整体报错' },
  { key: 'ignore_unavailable', label: '忽略不可用索引', kind: 'enum', options: ['true', 'false'],
    hint: '通配索引里有已关闭/缺失索引时是否忽略（默认 false）' },
  { key: 'expand_wildcards', label: '通配展开', kind: 'string', placeholder: 'open,hidden',
    hint: '通配索引匹配哪些状态：open / closed / hidden / none / all（可逗号组合，如 open,hidden）' },
];
export const REQUEST_PARAM_KEYS: ReadonlySet<string> = new Set(REQUEST_PARAMS.map(p => p.key));
