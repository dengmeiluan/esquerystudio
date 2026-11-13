/**
 * W1 ：索引设置键静态目录（ES 7.10 文档口径）+ 模糊过滤纯函数。
 *
 * dynamic 标注口径：
 * true = 动态键，可 PUT /{index}/_settings 热更（open 索引）；
 * false = 静态键，建索引时设定（analysis.* 亦可在 closed 索引上设置）。
 *
 * 该目录只做补全提示（零请求）；变更真实去向仍由后端 settings-impact 判定。
 */

export type SettingEntry = {
  /** 索引级 setting 键（去 index. 前缀口径，与视图 normalize 一致） */
  key: string;
  /** 中文简明说明 */
  desc: string;
  /** 取值示例 */
  example: string;
  /** true=可热更；false=静态（建索引时 / closed 状态设置） */
  dynamic: boolean;
};

export const SETTINGS_CATALOG: SettingEntry[] = [
  /* ---- 动态键（PUT _settings 即生效） ---- */
  { key: 'refresh_interval', desc: '刷新间隔', example: '1s / 30s / -1（禁用）', dynamic: true },
  { key: 'number_of_replicas', desc: '副本数', example: '0 / 1 / 2', dynamic: true },
  { key: 'auto_expand_replicas', desc: '副本自动扩展（随数据节点数伸缩）', example: '0-1 / 0-all / false', dynamic: true },
  { key: 'priority', desc: '恢复优先级（越大越先恢复）', example: '1 / 10', dynamic: true },
  { key: 'hidden', desc: '隐藏索引（通配符查询不匹配）', example: 'true / false', dynamic: true },
  { key: 'max_result_window', desc: '深分页窗口上限', example: '10000', dynamic: true },
  { key: 'max_inner_result_window', desc: 'inner_hits 深分页窗口上限', example: '100', dynamic: true },
  { key: 'max_script_fields', desc: '单次查询 script_fields 上限', example: '32', dynamic: true },
  { key: 'max_terms_count', desc: 'terms 查询最大词数', example: '65536', dynamic: true },
  { key: 'max_regex_length', desc: 'regexp 查询正则长度上限', example: '1000', dynamic: true },
  { key: 'highlight.max_analyzed_offset', desc: '高亮分析长度上限', example: '1000000', dynamic: true },
  { key: 'blocks.read_only', desc: '整索引只读（含元数据）', example: 'true / false', dynamic: true },
  { key: 'blocks.read_only_allow_delete', desc: '只读但允许删除（磁盘水位保护用）', example: 'true / false', dynamic: true },
  { key: 'blocks.write', desc: '禁写（允许读与元数据变更）', example: 'true / false', dynamic: true },
  { key: 'blocks.read', desc: '禁读', example: 'true / false', dynamic: true },
  { key: 'blocks.metadata', desc: '禁读写元数据', example: 'true / false', dynamic: true },
  { key: 'routing.allocation.enable', desc: '分片分配开关', example: 'all / none / primaries / new_primaries', dynamic: true },
  { key: 'routing.allocation.total_shards_per_node', desc: '单节点分片上限', example: '100', dynamic: true },
  { key: 'gc_deletes', desc: '删除墓碑保留时长（防版本号冲突）', example: '60s / 30s', dynamic: true },
  { key: 'soft_deletes.retention_lease.period', desc: '软删除保留租约（增量恢复窗口）', example: '12h / 24h', dynamic: true },
  { key: 'translog.durability', desc: 'translog 持久化策略', example: 'request / async', dynamic: true },
  { key: 'translog.sync_interval', desc: 'async 模式下 translog 刷盘间隔', example: '5s / 30s', dynamic: true },
  { key: 'merge.policy.segments_per_tier', desc: '每层段数（合并策略，调小查询更快）', example: '10', dynamic: true },
  { key: 'merge.policy.max_merged_segment', desc: '最大合并段大小', example: '5gb', dynamic: true },
  { key: 'indexing.slowlog.threshold.index.warn', desc: '索引慢日志 warn 阈值', example: '10s', dynamic: true },
  { key: 'indexing.slowlog.threshold.index.info', desc: '索引慢日志 info 阈值', example: '5s', dynamic: true },
  { key: 'search.slowlog.threshold.query.warn', desc: '查询慢日志 warn 阈值', example: '10s', dynamic: true },
  { key: 'search.slowlog.threshold.fetch.warn', desc: 'fetch 阶段慢日志 warn 阈值', example: '1s', dynamic: true },
  { key: 'mapping.total_fields.limit', desc: '字段总数上限（防 mapping 爆炸）', example: '1000 / 2000', dynamic: true },
  { key: 'mapping.nested_objects.limit', desc: '单文档嵌套对象数上限', example: '10000', dynamic: true },
  { key: 'mapping.depth.limit', desc: '字段嵌套深度上限', example: '20', dynamic: true },
  { key: 'unassigned.node_left.delayed_timeout', desc: '节点离线后副本延迟恢复时长（防分片风暴，到点才真正重建）', example: '1d / 5d', dynamic: true },
  { key: 'max_refresh_listeners', desc: '刷新监听并发上限（等待新可见点的请求排队额度）', example: '1000 / -1（不限）', dynamic: true },
  /* ingest 管道 / ILM 挂接 / merge 调度（键名以 ES 官方为准） */
  { key: 'default_pipeline', desc: '默认 ingest 管道（写入自动走该管道加工，_none 关闭）', example: 'my-pipeline / _none', dynamic: true },
  { key: 'final_pipeline', desc: '最终 ingest 管道（default_pipeline 之后兜底执行）', example: 'my-pipeline / _none', dynamic: true },
  { key: 'lifecycle.name', desc: '索引挂接的 ILM 生命周期策略名', example: 'logs-policy / _none', dynamic: true },
  { key: 'lifecycle.rollover_alias', desc: 'ILM rollover 使用的写别名', example: 'logs-alias', dynamic: true },
  { key: 'merge.scheduler.max_thread_count', desc: '段合并线程数上限（机械盘调小防拖垮 IO）', example: '1 / 4', dynamic: true },

  /* ---- 静态键（建索引时设定；analysis.* 可在 closed 索引上设置） ---- */
  { key: 'number_of_shards', desc: '主分片数（静态，建索引后不可改）', example: '1 / 3', dynamic: false },
  { key: 'codec', desc: '存储压缩算法', example: 'default / best_compression', dynamic: false },
  { key: 'analysis.analyzer.*', desc: '自定义分析器（建索引时或 closed 状态设置）', example: '{"type":"custom","tokenizer":"standard"}', dynamic: false },
  { key: 'soft_deletes.enabled', desc: '软删除开关（建索引时定，影响增量恢复/CCR）', example: 'true（默认）/ false', dynamic: false },
  /* 默认排序两键（ES 键名 index.sort.field / index.sort.order；本目录键口径
 去 index. 前缀，IndexSettingsView normKey 消费零视图改动）。静态键：建索引时定，写入后不可改。 */
  { key: 'sort.field', desc: '默认排序字段（index.sort.field，静态建索引时定）', example: 'ts', dynamic: false },
  { key: 'sort.order', desc: '默认排序方向（index.sort.order，与 sort.field 配套）', example: 'asc / desc', dynamic: false },
  /* 存储类型（静态，open 索引不可热更） */
  { key: 'store.type', desc: '存储类型（建索引时定，open 索引不可改）', example: 'fs / niofs / mmapfs / hybridfs', dynamic: false },
];

/**
 * 集群级设置键中文目录（_cluster/settings persistent/transient 口径）。
 * 字段结构对齐 SETTINGS_CATALOG（desc 中文 + example + dynamic）；
 * dynamic 口径本目录换轨定义：true = 可经 _cluster/settings API 热更；
 * false = 节点级/遗留键（discovery.zen.* 在 7.x 已由集群自动维护，列册只为悬停不空白）。
 * 消费面：ClusterSettingsView 设置行 input :title 悬停释义（精确匹配，零请求）。
 */
export const CLUSTER_SETTINGS_CATALOG: SettingEntry[] = [
  /* ---- 路由与分配 ---- */
  { key: 'cluster.routing.allocation.enable', desc: '分片分配开关', example: 'all / primaries / new_primaries / replicas / none', dynamic: true },
  { key: 'cluster.routing.rebalance.enable', desc: '分片再平衡开关', example: 'all / primaries / replicas / none', dynamic: true },
  { key: 'cluster.routing.allocation.awareness.attributes', desc: '机架/可用区感知属性（强制副本跨属性分布）', example: 'rack_id / zone', dynamic: true },
  { key: 'cluster.routing.allocation.disk.threshold_enabled', desc: '磁盘水位保护开关', example: 'true / false', dynamic: true },
  { key: 'cluster.routing.allocation.disk.watermark.low', desc: '磁盘低水位（低于此值不再分配新分片）', example: '85% / 100gb', dynamic: true },
  { key: 'cluster.routing.allocation.disk.watermark.high', desc: '磁盘高水位（高于此值开始迁出分片）', example: '90% / 50gb', dynamic: true },
  { key: 'cluster.routing.allocation.disk.watermark.flood_stage', desc: '磁盘洪泛水位（超限索引转只读，清盘后须手工解除）', example: '95% / 20gb', dynamic: true },
  { key: 'cluster.max_shards_per_node', desc: '单节点分片总数上限（含 closed 索引，防分片爆炸）', example: '1000', dynamic: true },
  { key: 'cluster.blocks.read_only', desc: '整个集群只读（升级/救援用，用完记得置 null 回退）', example: 'true / false', dynamic: true },
  /* ---- 索引级（集群下发作用于全部索引） ---- */
  { key: 'indices.recovery.max_bytes_per_sec', desc: '恢复/重建拷贝限速（0 = 不限）', example: '40mb / 200mb / 0', dynamic: true },
  { key: 'indices.breaker.total.limit', desc: '总断路器内存上限（真实内存口径）', example: '70% / 95%', dynamic: true },
  { key: 'indices.breaker.fielddata.limit', desc: 'fielddata 断路器堆占比上限', example: '40%', dynamic: true },
  { key: 'indices.breaker.request.limit', desc: 'request 断路器堆占比上限', example: '60%', dynamic: true },
  { key: 'indices.queries.cache.size', desc: '节点查询缓存堆占比上限', example: '10%', dynamic: true },
  /* 缓存与均衡（键名以 ES 官方为准） */
  { key: 'indices.fielddata.cache.size', desc: 'fielddata 堆缓存占比上限（默认无界，建议显式设限防 OOM）', example: '20% / 40%', dynamic: true },
  { key: 'cluster.routing.allocation.balance.index', desc: '按索引均衡权重因子（各索引在节点间的分片数拉平倾向，默认 0.5）', example: '0.5', dynamic: true },
  { key: 'cluster.routing.allocation.balance.shard', desc: '按总分片数均衡权重因子（节点总分片数拉平倾向，默认 0.45）', example: '0.45', dynamic: true },
  /* ---- 搜索与动作 ---- */
  { key: 'search.max_buckets', desc: '单次请求聚合桶数上限（防大聚合拖垮节点）', example: '65536 / 100000', dynamic: true },
  { key: 'search.default_search_timeout', desc: '搜索默认超时（-1 = 不限，慎用）', example: '30s / -1', dynamic: true },
  { key: 'action.destructive_requires_name', desc: '删除索引禁用通配符（必须显式索引名，防误删）', example: 'true / false', dynamic: true },
  { key: 'action.auto_create_index', desc: '写入时自动建索引白名单（false 全禁）', example: 'true / false / +logs*,-secret*', dynamic: true },
  /* ---- 日志与遗留 ---- */
  { key: 'logger.org.elasticsearch', desc: 'ES 主日志级别临时调整（排查完记得还原）', example: 'DEBUG / INFO / WARN', dynamic: true },
  { key: 'logger.org.elasticsearch.discovery', desc: 'ES discovery 子日志级别临时调整', example: 'DEBUG / INFO / WARN', dynamic: true },
  { key: 'discovery.zen.minimum_master_nodes', desc: '主节点法定数（7.x 遗留键：已由集群自动维护，一般无需手设）', example: '2 / -1', dynamic: false },
];

/**
 * 按键/中文说明模糊过滤，前缀命中优先，组内按 key 字母序，cap 30。
 * 空关键词返回全目录前 30 条（字母序）。
 */
export function filterSettings(kw: string): SettingEntry[] {
  const k = (kw || '').toLowerCase();
  return SETTINGS_CATALOG
    .filter(s => !k || s.key.toLowerCase().includes(k) || s.desc.toLowerCase().includes(k))
    .sort((a, b) => {
      const ra = a.key.toLowerCase().startsWith(k) ? 0 : 1;
      const rb = b.key.toLowerCase().startsWith(k) ? 0 : 1;
      return ra - rb || a.key.localeCompare(b.key);
    })
    .slice(0, 30);
}
