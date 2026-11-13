/* W1：算子元数据注册表。form 指示 body 形态：
 'field' = {op:{field:…}} 单字段形态；'fields' = {op:{mainKey:…,fields:[…],…}} 多字段形态；
 'named' = {op:{fieldKey:'字段名',mainKey:…,…}} 具名字段键形态（query_string/percolate）；
 'none' = 无字段，主值直接挂 body（ids/script/wrapper）。
 wrap 指示 field 形态 inner 主值键：'value'（term 系）/ 'query'（match 系）/
 'none'（inner 整体即值，range/terms/对象值算子）。
 mainKey 是 fields/named/none 形态 body 顶层主值键（match_all/match_none 走既有特判豁免）。
 params 是具名常用参数 → ClauseNode 渲染具名控件；其余参数走「更多参数」递归键值表。 */
/* json=对象型参数（新建给 `{}`）；json-array=数组型参数（新建给 `[]`）。
 两者都走 JSON 文本框编辑，区别只在**新建默认值**——给数组型键塞 `{}` 会被 ES 直接拒
 （top_metrics.metrics、matrix_stats.fields、bucket_sort.sort 都要求数组）。 */
export interface ParamMeta { key: string; kind: 'number' | 'text' | 'boolean' | 'enum' | 'json' | 'json-array'; options?: string[] }
interface OpMeta {
  form: 'field' | 'fields' | 'named' | 'none';
  wrap?: 'value' | 'query' | 'none';
  valueKey?: string;   // wrap value/query 的主值键名覆盖（默认 'value'/'query'；span_term 用 'term'）
  mainKey?: string;
  fieldKey?: string;
  label: string;
  types?: string[];   // 适合的 mapping 类型组：text/keyword/number/date/boolean/ip
  params?: ParamMeta[];
}

/* 值类型族单源（本文件零依赖，可被 sqlCompletion/dslCompletionContext/
 LuceneInput 等四处 literal 同源消费——keyword 族三员即 sqlCompletion.KEYWORD_VALUE_TYPES
 原表逐字同形；数值族十口径=551/ sqlCompletion.NUMERIC_HINT_TYPES 与 LuceneInput
 NUMERIC_TYPES 原表逐字同形，含 token_count 分词计数数值语义） */
export const KEYWORD_VALUE_TYPES = ['keyword', 'wildcard', 'constant_keyword'];
export const NUMERIC_VALUE_TYPES = ['long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'unsigned_long', 'token_count'];
/* 数值字段族（去掉分词计数 token_count）——构建器值提示/聚合置顶/排序置顶/lint 判型共用单源；
   1439：构建器两处与排序置顶此前是 8 项手抄表，漏 unsigned_long。 */
export const NUMERIC_FIELD_TYPES: string[] = NUMERIC_VALUE_TYPES.filter(t => t !== 'token_count');

/* 可排序字段类型（Lucene 排序行 / PIT 排序行 / 构建器排序与折叠行共用单源）：
   有 doc_values、ES 不会因 fielddata 400 的类型。text 需开 fielddata（默认关）不进表；
   wildcard / ip 等官方排序语义未明示的类型宁缺勿错不列（手输仍可）。
   1439：此前三处各抄一份——PIT 与构建器漏 unsigned_long、三处都漏 date_nanos
   （官方 sort 文档明确可排序）。 */
export const SORTABLE_FIELD_TYPES: string[] = [
  'keyword', 'date', 'date_nanos', 'boolean',
  ...NUMERIC_VALUE_TYPES.filter(t => t !== 'token_count'),
];

/* NUM 补 unsigned_long（数值族九口径——AFFINITY_FAMILIES.number/LuceneInput
 NUMERIC_TYPES/sqlCompletion 数值档同表九种，此前 opsForType 对 unsigned_long 字段只推荐 exists）
 本表改吃 NUMERIC_VALUE_TYPES 单源滤 token_count（分词计数无 term/range 精确语义，
 维持 ['exists'] 兜底——opsForType 行为零变） */
const NUM = NUMERIC_VALUE_TYPES.filter(t => t !== 'token_count');

export const OPS_META: Record<string, OpMeta> = {
  match_all: { form: 'none', label: '全部文档' },
  match_none: { form: 'none', label: '不匹配任何' },
  term: { form: 'field', wrap: 'value', label: '精确匹配', types: ['keyword', 'number', 'boolean', 'ip'],
    params: [{ key: 'case_insensitive', kind: 'boolean' }, { key: 'boost', kind: 'number' }] },
  terms: { form: 'field', wrap: 'none', label: '多值精确', types: ['keyword', 'number', 'ip'],
    params: [{ key: 'boost', kind: 'number' }] },
  /* types 含 keyword：match 在 keyword 字段上不分词，行为≈term（保留入口，选它不算错配） */
  match: { form: 'field', wrap: 'query', label: '全文匹配', types: ['text', 'keyword'],
    params: [{ key: 'operator', kind: 'enum', options: ['and', 'or'] }, { key: 'fuzziness', kind: 'text' },
      { key: 'minimum_should_match', kind: 'text' }, { key: 'analyzer', kind: 'text' },
      { key: 'zero_terms_query', kind: 'enum', options: ['none', 'all'] },
      { key: 'lenient', kind: 'boolean' }, { key: 'prefix_length', kind: 'number' },
      { key: 'max_expansions', kind: 'number' }, { key: 'fuzzy_transpositions', kind: 'boolean' },
      { key: 'fuzzy_rewrite', kind: 'text' }, { key: 'auto_generate_synonyms_phrase_query', kind: 'boolean' },
      { key: 'boost', kind: 'number' }] },
  match_phrase: { form: 'field', wrap: 'query', label: '短语匹配', types: ['text'],
    params: [{ key: 'slop', kind: 'number' }, { key: 'analyzer', kind: 'text' },
      { key: 'zero_terms_query', kind: 'enum', options: ['none', 'all'] }, { key: 'boost', kind: 'number' }] },
  match_phrase_prefix: { form: 'field', wrap: 'query', label: '短语前缀', types: ['text'],
    params: [{ key: 'max_expansions', kind: 'number' }, { key: 'slop', kind: 'number' }, { key: 'analyzer', kind: 'text' },
      { key: 'zero_terms_query', kind: 'enum', options: ['none', 'all'] }, { key: 'boost', kind: 'number' }] },
  range: { form: 'field', wrap: 'none', label: '范围', types: ['number', 'date', 'ip'],
    params: [{ key: 'relation', kind: 'enum', options: ['WITHIN', 'INTERSECTS', 'CONTAINS'] },
      { key: 'time_zone', kind: 'text' }, { key: 'format', kind: 'text' }, { key: 'boost', kind: 'number' }] },
  exists: { form: 'field', wrap: 'none', label: '字段存在', params: [{ key: 'boost', kind: 'number' }] },
  prefix: { form: 'field', wrap: 'value', label: '前缀', types: ['keyword', 'text'],
    params: [{ key: 'case_insensitive', kind: 'boolean' }, { key: 'boost', kind: 'number' }] },
  wildcard: { form: 'field', wrap: 'value', label: '通配符', types: ['keyword', 'text', 'wildcard'],
    params: [{ key: 'case_insensitive', kind: 'boolean' }, { key: 'boost', kind: 'number' }] },
  regexp: { form: 'field', wrap: 'value', label: '正则', types: ['keyword', 'text'],
    params: [{ key: 'flags', kind: 'text' }, { key: 'max_determinized_states', kind: 'number' },
      { key: 'case_insensitive', kind: 'boolean' }, { key: 'boost', kind: 'number' }] },
  fuzzy: { form: 'field', wrap: 'value', label: '模糊', types: ['keyword', 'text'],
    params: [{ key: 'fuzziness', kind: 'text' }, { key: 'prefix_length', kind: 'number' },
      { key: 'max_expansions', kind: 'number' }, { key: 'transpositions', kind: 'boolean' }, { key: 'boost', kind: 'number' }] },
  /* ═══ 富表单算子扩充：12 → 35。对象值算子（wrap:'none' 且值是对象）
   在 ClauseNode 值位渲染递归键值子表（GenericParams），geo 系/terms_set/intervals/
   percolate 的复杂 body 不再落 raw 键值大表。多字段/具名字段/无字段形态由
   form + mainKey/fieldKey 驱动 parse/ser 对称投影，往返无损契约不变。 ═══ */
  match_bool_prefix: { form: 'field', wrap: 'query', label: '前缀全文', types: ['text', 'keyword'],
    params: [{ key: 'operator', kind: 'enum', options: ['and', 'or'] }, { key: 'fuzziness', kind: 'text' },
      { key: 'minimum_should_match', kind: 'text' }, { key: 'analyzer', kind: 'text' },
      { key: 'lenient', kind: 'boolean' }, { key: 'prefix_length', kind: 'number' },
      { key: 'max_expansions', kind: 'number' }, { key: 'fuzzy_transpositions', kind: 'boolean' },
      { key: 'fuzzy_rewrite', kind: 'text' }, { key: 'boost', kind: 'number' }] },
  /* 1119：官方体 {field: [词项…], minimum_should_match_field|script}——字段键持数组、
   * 两个 msm 键与字段同层（不是字段内部）；注册 params 后 parse 走「字段 + 兄弟参数」
   * 富表单，不再整条落 raw，构建器也不会把 msm 写进字段对象。 */
  terms_set: { form: 'field', wrap: 'none', label: '多值命中数', types: ['keyword', 'text', 'long', 'integer'],
    params: [{ key: 'minimum_should_match_field', kind: 'text' }, { key: 'minimum_should_match_script', kind: 'json' }] },
  /* 1045：官方 rank_feature 体是 {field, boost}——具名字段键形态；boost 是主值位，
     saturation/log 等对象参数走「更多参数」。旧 field/value 投影会把 field 当字段名。 */
  rank_feature: { form: 'named', mainKey: 'boost', fieldKey: 'field', label: '排序特征', types: ['rank_feature', 'rank_features'] },
  geo_distance: { form: 'field', wrap: 'none', label: '地理距离', types: ['geo_point'],
    params: [{ key: 'validation_method', kind: 'enum', options: ['STRICT', 'IGNORE_MALFORMED', 'COERCE'] }] },
  geo_bounding_box: { form: 'field', wrap: 'none', label: '地理矩形', types: ['geo_point'],
    params: [{ key: 'validation_method', kind: 'enum', options: ['STRICT', 'IGNORE_MALFORMED', 'COERCE'] }] },
  geo_polygon: { form: 'field', wrap: 'none', label: '地理多边形', types: ['geo_point'] },
  geo_shape: { form: 'field', wrap: 'none', label: '地理形状', types: ['geo_shape', 'geo_point'],
    params: [{ key: 'relation', kind: 'enum', options: ['INTERSECTS', 'DISJOINT', 'WITHIN'] },
      { key: 'orientation', kind: 'text' }, { key: 'ignore_unmapped', kind: 'boolean' }] },
  intervals: { form: 'field', wrap: 'none', label: '间隔规则', types: ['text'] },
  multi_match: { form: 'fields', mainKey: 'query', label: '多字段全文', types: ['text', 'keyword'],
    params: [{ key: 'type', kind: 'enum', options: ['best_fields', 'most_fields', 'cross_fields', 'phrase', 'phrase_prefix', 'bool_prefix'] },
      { key: 'operator', kind: 'enum', options: ['and', 'or'] }, { key: 'fuzziness', kind: 'text' },
      { key: 'tie_breaker', kind: 'number' }, { key: 'slop', kind: 'number' }, { key: 'minimum_should_match', kind: 'text' },
      { key: 'analyzer', kind: 'text' }, { key: 'lenient', kind: 'boolean' },
      { key: 'zero_terms_query', kind: 'enum', options: ['none', 'all'] },
      { key: 'prefix_length', kind: 'number' }, { key: 'max_expansions', kind: 'number' },
      { key: 'fuzzy_transpositions', kind: 'boolean' }, { key: 'fuzzy_rewrite', kind: 'text' },
      { key: 'auto_generate_synonyms_phrase_query', kind: 'boolean' }, { key: 'boost', kind: 'number' }] },
  query_string: { form: 'named', mainKey: 'query', fieldKey: 'default_field', label: '查询串', types: ['text', 'keyword'],
    params: [{ key: 'default_operator', kind: 'enum', options: ['and', 'or'] }, { key: 'fuzziness', kind: 'text' },
      { key: 'tie_breaker', kind: 'number' }, { key: 'minimum_should_match', kind: 'text' }, { key: 'analyzer', kind: 'text' },
      { key: 'phrase_slop', kind: 'number' }, { key: 'analyze_wildcard', kind: 'boolean' }, { key: 'lenient', kind: 'boolean' },
      { key: 'allow_leading_wildcard', kind: 'boolean' }, { key: 'enable_position_increments', kind: 'boolean' },
      { key: 'fuzzy_prefix_length', kind: 'number' }, { key: 'fuzzy_max_expansions', kind: 'number' },
      { key: 'fuzzy_transpositions', kind: 'boolean' }, { key: 'fuzzy_rewrite', kind: 'text' },
      { key: 'quote_analyzer', kind: 'text' }, { key: 'quote_field_suffix', kind: 'text' },
      { key: 'auto_generate_synonyms_phrase_query', kind: 'boolean' },
      { key: 'boost', kind: 'number' }] },
  simple_query_string: { form: 'fields', mainKey: 'query', label: '简单查询串', types: ['text', 'keyword'],
    params: [{ key: 'default_operator', kind: 'enum', options: ['and', 'or'] }, { key: 'flags', kind: 'text' },
      { key: 'minimum_should_match', kind: 'text' }, { key: 'analyzer', kind: 'text' },
      { key: 'analyze_wildcard', kind: 'boolean' },
      { key: 'fuzzy_prefix_length', kind: 'number' }, { key: 'fuzzy_max_expansions', kind: 'number' },
      { key: 'fuzzy_transpositions', kind: 'boolean' }, { key: 'quote_field_suffix', kind: 'text' },
      { key: 'auto_generate_synonyms_phrase_query', kind: 'boolean' },
      { key: 'lenient', kind: 'boolean' }, { key: 'boost', kind: 'number' }] },
  combined_fields: { form: 'fields', mainKey: 'query', label: '组合字段', types: ['text', 'keyword'],
    params: [{ key: 'operator', kind: 'enum', options: ['and', 'or'] }, { key: 'minimum_should_match', kind: 'text' },
      { key: 'auto_generate_synonyms_phrase_query', kind: 'boolean' }, { key: 'boost', kind: 'number' }] },
  more_like_this: { form: 'fields', mainKey: 'like', label: '更多相似', types: ['text'],
    params: [{ key: 'analyzer', kind: 'text' }, { key: 'minimum_should_match', kind: 'text' },
      { key: 'max_query_terms', kind: 'number' }, { key: 'min_term_freq', kind: 'number' },
      { key: 'min_doc_freq', kind: 'number' }, { key: 'max_doc_freq', kind: 'number' },
      { key: 'min_word_length', kind: 'number' }, { key: 'max_word_length', kind: 'number' },
      { key: 'stop_words', kind: 'text' }, { key: 'boost', kind: 'number' }] },
  ids: { form: 'none', mainKey: 'values', label: '文档 ID' },
  script: { form: 'none', mainKey: 'script', label: '脚本过滤' },
  wrapper: { form: 'none', mainKey: 'query', label: '二进制包装' },
  percolate: { form: 'named', mainKey: 'document', fieldKey: 'field', label: '反查文档', types: ['percolator'] },
  /* distance_feature 散层 {field, pivot, queries} 走 named 投影（fieldKey 固定 'field'、
   主值取 pivot——纯结构投影，无损优先） */
  distance_feature: { form: 'named', mainKey: 'pivot', fieldKey: 'field', label: '特征距离', types: ['date', 'date_nanos', 'geo_point'],
    params: [{ key: 'origin', kind: 'text' }, { key: 'boost', kind: 'number' }] },
  /* parent_id：join 族第三员（has_child/has_parent 姊妹，无子查询的叶子形态）——
   官方体 {type: 父类型, id: 父文档 id}，没有 field 键；旧 named 投影会写出未知 field。 */
  parent_id: { form: 'none', mainKey: 'id', label: '按父文档 ID',
    params: [{ key: 'type', kind: 'text' }] },
  /* ═══ span 跨度系（精确位置控制的底层查询，配 span_near 组合使用） ═══ */
  span_term: { form: 'field', wrap: 'value', valueKey: 'term', label: '跨度词', types: ['text'] },
  /* ═══ 987：ES 8.x 新算子补齐（DSL 全量覆盖）。geo 网格 /
   shape 字段 / 向量与语义四员（named 投影）/ 对象值两员。 ═══
   1045：撤 match_int_prefix（官方 full-text 清单无此算子，写出即 no [query] registered）。
   补 bitmap_terms（9.0 term-level）：{field, value} 具名字段形态。 */
  bitmap_terms: { form: 'named', mainKey: 'value', fieldKey: 'field', label: '位图词项',
    types: ['keyword', 'long', 'integer'] },
  geo_grid: { form: 'field', wrap: 'none', label: '地理网格', types: ['geo_point', 'geo_shape'] },
  shape: { form: 'field', wrap: 'none', label: '形状过滤', types: ['shape', 'geo_shape'],
    params: [{ key: 'relation', kind: 'enum', options: ['INTERSECTS', 'DISJOINT', 'WITHIN'] },
      { key: 'orientation', kind: 'text' }, { key: 'ignore_unmapped', kind: 'boolean' }] },
  /* 1000：检索器检索面 */
  semantic: { form: 'named', mainKey: 'query', fieldKey: 'field', label: '语义查询', types: ['semantic_text'] },
  /* 1045：官方键是 query_vector（单数）；复数键会被 ES 当未知参数拒绝 */
  sparse_vector: { form: 'named', mainKey: 'query_vector', fieldKey: 'field', label: '稀疏向量', types: ['sparse_vector'] },
  knn: { form: 'named', mainKey: 'query_vector', fieldKey: 'field', label: '向量近邻', types: ['dense_vector'],
    params: [{ key: 'k', kind: 'number' }, { key: 'num_candidates', kind: 'number' }, { key: 'similarity', kind: 'number' },
      { key: 'filter', kind: 'json' }, { key: 'boost', kind: 'number' }] },
  /* 1045：boost 属于字段值对象内部（{field:{model_id,…,boost}}）；旧 params 会把它
     写到字段键同层，ES 直接拒。值对象由对象值子表编辑，boost 可在其中加键。 */
  text_expansion: { form: 'field', wrap: 'none', label: '文本扩展', types: ['text', 'sparse_vector'] },
  weighted_tokens: { form: 'field', wrap: 'none', label: '加权词元', types: ['sparse_vector'] },
  /* 999/1045：span_gap 官方体是 {<字段>: width}——field 形态，不是 width 主值键；
     span_near.clauses 内的间隙占位（独立出现时 ES 拒绝——树不拦，ES 报错即教育） */
  span_gap: { form: 'field', wrap: 'none', label: '跨度间隙' },
  /* 999：rule（8.14+ 检索规则）——ruleset_id 主值，match_criteria / match_predicate 走参数表 */
  rule: { form: 'none', mainKey: 'ruleset_id', label: '规则查询' },
  /* 1030：注册表全量收官两员。type = 7.x 遗留映射类型过滤（8.x 已移除，老集群仍可达）；
   template = 搜索模板查询（body 是 id/name/source 任一形态 + params，主值取 id——
   id 缺席形态 value=undefined、其余键整体进 params 保真，序列化 undefined 键
   JSON.stringify 自然剔除，往返零丢失）。none 形态：parse/ser 零特判，注册即得富表单 */
  type: { form: 'none', mainKey: 'value', label: '类型过滤（7.x 遗留）', params: [{ key: 'boost', kind: 'number' }] },
  template: { form: 'none', mainKey: 'id', label: '搜索模板' },
};

/* 字段类型 → 推荐算子（ClauseNode 算子下拉：推荐的排前，其余富表单算子分组列后，均可选） */
export function opsForType(type: string | undefined): string[] {
  if (!type) return ['exists'];
  if (type === 'text') return ['match', 'match_phrase', 'match_phrase_prefix', 'wildcard', 'prefix', 'regexp', 'fuzzy', 'exists'];
  if (type === 'keyword' || type === 'wildcard') return ['term', 'terms', 'prefix', 'wildcard', 'regexp', 'fuzzy', 'match', 'exists'];
  /* 1395：constant_keyword 是 keyword 的特化（官方：「a specialization of the keyword field
     for the case that all documents in the index have the same value」，并明确可以
     「filter on a constant keyword」）。此前没有分支 → 落兜底 ['exists']，选完字段只看到
     「字段存在」，与 shape 同类的「支持读改、不支持新建」缺口。
     它与 keyword 的差别只在写入侧（值恒定），查询语义完全一致，故共用 keyword 族。 */
  if (type === 'constant_keyword') return ['term', 'terms', 'prefix', 'wildcard', 'regexp', 'fuzzy', 'match', 'exists'];
  if (NUM.includes(type)) return ['term', 'terms', 'range', 'exists'];
  /* 548 B：date 分支并入 date_nanos（纳秒精度同族——此前落兜底 ['exists']，range 推荐缺失） */
  if (type === 'date' || type === 'date_nanos') return ['range', 'exists'];
  /* 1045：range 家族（integer_range/long_range/float_range/double_range/ip_range/date_range）
     的值是区间对象，range 是唯一语义入口；此前统一落 exists。 */
  if (type.endsWith('_range')) return ['range', 'exists'];
  if (type === 'boolean') return ['term', 'exists'];
  if (type === 'ip') return ['term', 'range', 'exists'];
  if (type === 'geo_point') return ['geo_distance', 'geo_bounding_box', 'geo_polygon', 'exists'];
  if (type === 'geo_shape') return ['geo_shape', 'exists'];
  /* 1382：shape 类型此前落兜底 ['exists']——OPS_META.shape 早已注册且声明 types 含 shape，
     选完 shape 字段却只看到「字段存在」，读成「不支持」（实报同类缺口 1199）。 */
  if (type === 'shape') return ['shape', 'exists'];
  if (type === 'rank_feature') return ['rank_feature', 'exists'];
  /* rank_features 是 mapping 类型（多特征对象），查询入口仍是 rank_feature */
  if (type === 'rank_features') return ['rank_feature', 'exists'];
  /* 998：flattened 字段（整对象当一字段检索）——term/match 两档是官方推荐入口 */
  if (type === 'flattened') return ['term', 'match', 'exists'];
  /* 1045：新型全文/语义/特殊 mapping 类型的推荐入口 */
  if (type === 'match_only_text' || type === 'search_as_you_type') return ['match', 'match_phrase', 'match_phrase_prefix', 'exists'];
  if (type === 'semantic_text') return ['semantic', 'match', 'exists'];
  if (type === 'version') return ['term', 'exists'];
  if (type === 'percolator') return ['percolate', 'exists'];
  if (type === 'join') return ['parent_id', 'exists'];
  /* 987：dense_vector 推荐向量近邻（knn 查询级形态），sparse_vector 推荐稀疏向量 */
  if (type === 'dense_vector') return ['knn', 'exists'];
  if (type === 'sparse_vector') return ['sparse_vector', 'exists'];
  return ['exists'];
}

export const RICH_OPS: string[] = Object.keys(OPS_META);

/* ═══ 998：高特异算子（字段类型不符 = 查询必空/报错）═══
 geo 系 / 形状 / 特征 / 向量族只在对应 mapping 类型上有意义——字段选择器据此收窄候选
 （typeFilter），用户不再在 3000 个字段里翻 geo_point。其余算子维持「只置顶不过滤」：
 term 打在 text 字段、range 打在 keyword 字段都仍有合法语义（字典序/分词），强行过滤反而挡路。 */
export const STRICT_TYPE_OPS: ReadonlySet<string> = new Set([
  'geo_distance', 'geo_bounding_box', 'geo_polygon', 'geo_shape', 'geo_grid', 'shape',
  'rank_feature', 'knn', 'sparse_vector', 'distance_feature', 'intervals',
  /* 1124：字段类型唯一/高特异的稀疏算子——此前不过滤，percolator/semantic_text/
     sparse_vector 字段会被几百个无关字段淹没；这些算子选错类型必 400/零命中。 */
  'percolate', 'semantic', 'text_expansion', 'weighted_tokens',
]);

/** 算子的字段候选类型过滤（未登记/非高特异 → undefined = 不过滤） */
export function typeFilterForOp(op: string): string[] | undefined {
  if (!STRICT_TYPE_OPS.has(op)) return undefined;
  const t = OPS_META[op]?.types;
  return t && t.length ? t : undefined;
}

/* 算子场景 → 字段候选类型置顶序（ClauseNode fieldTypePriority 消费，DSL/非 Vue
 语境也可直接复用）。term/terms/prefix/wildcard 精确语义 keyword 优先；
 range 数值/时间语义 date+数值族优先；match 系全文语义 text+keyword；
 R4：match_phrase_prefix 并入 match 系、regexp/fuzzy → keyword+text（与 OPS_META.types
 对齐；ClauseNode 值候选档 includes('keyword') 随之放行，历史值 datalist 白得）；
 985：match_bool_prefix 并入 match 系同档；其余算子无类型倾向，空数组 = FieldSelect
 归一 null 纯 rank 平铺。只调候选分组排序，不改候选集（fieldPickerPenetration 契约）。 */
export function typePriorityForOp(op: string): string[] {
  if (op === 'term' || op === 'terms' || op === 'prefix' || op === 'wildcard') return ['keyword'];
  /* range 序补 unsigned_long（数值族第九种——AFFINITY_FAMILIES.number 同表口径；
   此前编辑器补全排序 orderFieldsByTypeForOp 与 sqlCompletion ORDER BY 加权两条链漏置顶）
   548 B：再补 date_nanos（紧跟 date 位置——opsForType date 分支并档同步；dslValueTiers545 /
   lintExpand530 两处精确锁同步更新） */
  if (op === 'range') return ['date', 'date_nanos', 'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'unsigned_long'];
  if (op === 'match' || op === 'match_phrase' || op === 'match_phrase_prefix' || op === 'multi_match' || op === 'query_string' || op === 'match_bool_prefix') return ['text', 'keyword'];
  /* R4：regexp/fuzzy 补档（与 OPS_META.types ['keyword','text'] 对齐）——
   ClauseNode 值候选档判定 includes('keyword') 命中，历史值 datalist 白得（语义成立）。 */
  if (op === 'regexp' || op === 'fuzzy') return ['keyword', 'text'];
  return [];
}

/* ═══ 985：复合容器（wrap 扩员 + multi）标签/分区中文 ═══
 wrap 标签与 WrapNodeRow 既有本地表逐字同形（nested 三员），新增四员复合包装；
 multi 标签/分区供 MultiNodeRow 头部与子查询分区头消费。 */
export const WRAP_LABELS: Record<string, string> = {
  nested: '嵌套', has_child: '子文档', has_parent: '父文档',
  constant_score: '恒定评分', function_score: '评分函数', script_score: '脚本评分', pinned: '置顶优选',
  span_first: '首跨度', span_multi: '跨度多匹配',
  span_field_masking: '字段掩码跨度',
};

/* ═══ 999：wrap 容器具名参数表（WrapNodeRow 参数面板 schema 源）═══
   与 OPS_META.params 同一 ParamMeta 形态——enum 档在 GenericParams 渲染为下拉，
   其余档维持自由表但键名在册可查。pinned / span_multi / span_field_masking 不登记：
   它们的剩余键全是结构位（ids/docs/organic、match、query/field），登记反而误导。 */
export const WRAP_PARAMS: Record<string, ParamMeta[]> = {
  nested: [{ key: 'inner_hits', kind: 'json' }, { key: 'score_mode', kind: 'enum', options: ['avg', 'sum', 'max', 'min', 'none'] }, { key: 'ignore_unmapped', kind: 'boolean' }],
  has_child: [{ key: 'inner_hits', kind: 'json' }, { key: 'score_mode', kind: 'enum', options: ['avg', 'sum', 'max', 'min', 'none'] },
    { key: 'min_children', kind: 'number' }, { key: 'max_children', kind: 'number' }, { key: 'ignore_unmapped', kind: 'boolean' }],
  has_parent: [{ key: 'inner_hits', kind: 'json' }, { key: 'score_mode', kind: 'enum', options: ['none', 'score'] }, { key: 'ignore_unmapped', kind: 'boolean' }],
  constant_score: [{ key: 'boost', kind: 'number' }],
  function_score: [{ key: 'boost', kind: 'number' }, { key: 'boost_mode', kind: 'enum', options: ['multiply', 'replace', 'sum', 'avg', 'max', 'min'] },
    { key: 'score_mode', kind: 'enum', options: ['multiply', 'sum', 'avg', 'first', 'max', 'min'] },
    { key: 'min_score', kind: 'number' }, { key: 'max_boost', kind: 'number' }],
  script_score: [{ key: 'min_score', kind: 'number' }],
  span_first: [{ key: 'end', kind: 'number' }],
};
export const MULTI_LABELS: Record<string, string> = {
  boosting: '正负加权', dis_max: '多查询取最大',
  span_near: '近邻跨度', span_or: '任一跨度', span_not: '排除跨度',
  span_containing: '包含跨度', span_within: '位于其中',
};
export function labelOfOp(op: string): string {
  return OPS_META[op]?.label || WRAP_LABELS[op] || MULTI_LABELS[op] || op;
}
/* 1120：换算子时的参数清洗——旧算子参数不属于新算子 schema 即丢弃（并保留 _name），
 否则 match 的 operator/fuzziness 切到 term 会写出非法体（ES 400）。distance_feature
 的 origin 为必填，给 now 让新条件可直接跑（pivot 默认值由节点工厂/ClauseNode 给 7d）。
 1152：wrap 族参数表在 WRAP_PARAMS（nested/has_child/function_score/script_score…），
 只查 OPS_META 会把 script_score 的 min_score、nested 的 score_mode/inner_hits 等
 合法参数当作「旧算子参数」静默丢掉——两表并集才是完整 schema。
 1199：多容器族（boosting / dis_max / span_near / span_not …）的 schema 在 MULTI_META.params，
 它们**没有** OPS_META 条目，于是 span_near 的 slop/in_order、dis_max 的 tie_breaker、
 boosting 的 negative_boost 在切到这些算子时被当成旧算子参数清空——用户刚配好的参数凭空消失。
 三表并集才是完整 schema（同一 bug 家族的第二例，1152 当时只补了 WRAP_PARAMS）。 */
export function paramsForOp(op: string, old: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(['_name',
    ...(OPS_META[op]?.params || []).map(p => p.key),
    ...(WRAP_PARAMS[op] || []).map(p => p.key),
    ...(MULTI_META[op]?.params || []).map(p => p.key)]);
  const kept: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(old || {})) if (allowed.has(k)) kept[k] = v;
  if (op === 'distance_feature' && !('origin' in kept)) kept.origin = 'now';
  return kept;
}

/* ═══ 998：算子语义族（交互层配色/分组共用，纯语义零 UI 依赖）═══
   text=全文检索（分词相关性）/ exact=精确命中（词项与集合）/ range=范围与存在 /
   geo=空间 / vector=向量与语义 / span=跨度位置 / script=脚本与评分包装 / struct=结构占位。
   算子下拉胶囊与「+ 高级」菜单按族着色，用户不用读完整名字就能判断「这是哪一类条件」。 */
export type OpFamily = 'text' | 'exact' | 'range' | 'geo' | 'vector' | 'span' | 'script' | 'struct';
export function opFamilyOf(op: string): OpFamily {
  if (op === 'match_all' || op === 'match_none') return 'struct';
  if (op.startsWith('span_')) return 'span';
  if (op.startsWith('geo_') || op === 'shape' || op === 'distance_feature') return 'geo';
  if (op === 'knn' || op === 'sparse_vector') return 'vector';
  if (op.startsWith('match') || op === 'multi_match' || op === 'query_string' || op === 'simple_query_string'
    || op === 'combined_fields' || op === 'more_like_this' || op === 'intervals'
    || op === 'semantic' || op === 'text_expansion' || op === 'weighted_tokens') return 'text';
  if (op === 'range' || op === 'exists') return 'range';
  if (op === 'script' || op === 'script_score' || op === 'wrapper' || op === 'percolate' || op === 'rule'
    || op === 'template'
    || op === 'function_score' || op === 'constant_score' || op === 'boosting' || op === 'dis_max'
    || op === 'pinned' || op === 'rank_feature') return 'script';
  return 'exact';
}

/* multi 容器元数据：keys = 子查询分区键（键序即序列化序）；arrKeys = 恒数组形态键
 （makeNodeByOp 的 arrForm 初值）；partLabel = 分区头中文；params = 具名参数 schema。 */
export const MULTI_META: Record<string, { keys: string[]; arrKeys: string[]; partLabel: Record<string, string>; params?: ParamMeta[] }> = {
  boosting: { keys: ['positive', 'negative'], arrKeys: [], partLabel: { positive: '正例 positive', negative: '反例 negative' },
    params: [{ key: 'negative_boost', kind: 'number' }, { key: 'boost', kind: 'number' }] },
  dis_max: { keys: ['queries'], arrKeys: ['queries'], partLabel: { queries: '查询列表 queries' },
    params: [{ key: 'tie_breaker', kind: 'number' }, { key: 'boost', kind: 'number' }] },
  span_near: { keys: ['clauses'], arrKeys: ['clauses'], partLabel: { clauses: '子跨度 clauses' },
    params: [{ key: 'slop', kind: 'number' }, { key: 'in_order', kind: 'boolean' }] },
  span_or: { keys: ['clauses'], arrKeys: ['clauses'], partLabel: { clauses: '子跨度 clauses' } },
  span_not: { keys: ['include', 'exclude'], arrKeys: [], partLabel: { include: '包含 include', exclude: '排除 exclude' },
    params: [{ key: 'dist', kind: 'number' }, { key: 'pre', kind: 'number' }, { key: 'post', kind: 'number' }] },
  span_containing: { keys: ['little', 'big'], arrKeys: [], partLabel: { little: '小跨度 little', big: '大跨度 big' } },
  span_within: { keys: ['little', 'big'], arrKeys: [], partLabel: { little: '内部 little', big: '外部 big' } },
};

/* ═══ 1000：retriever 检索器元数据（8.14+ 顶层检索面，query 的继任写法）═══
   kind 指示变体形态：'query'=bm25 内嵌 QueryNode 树；'flat'=knn 平面（field+query_vector+参数）；
   'list'=子检索器数组（listKey；wrapped=true 为 linear 的每子项 {retriever,weight} 包裹形态）；
   'child'=单子检索器（text_similarity_reranker 重排源 / rule 回退）。 */
export interface RetrieverMeta {
  label: string; kind: 'query' | 'flat' | 'list' | 'child';
  listKey?: string; wrapped?: boolean;
  /** 子检索器键名（默认 retriever；pinned 等官方形态同键） */
  childKey?: string;
  /** 子检索器可缺席（rule 可按 match_criteria 独立路由）；其余 child 变体必填 */
  childOptional?: boolean;
  /** 子检索器负责召回时使用的字段位（knn/tsr/diversify） */
  fieldTypes?: string[];
}
export const RETRIEVER_META: Record<string, RetrieverMeta> = {
  /* 1045：官方变体名是 standard（BM25 标准检索），bm25 不是注册键——写出即整键无效 */
  standard: { label: '标准 BM25 检索', kind: 'query' },
  knn: { label: '向量近邻', kind: 'flat' },
  rrf: { label: 'RRF 融合', kind: 'list', listKey: 'retrievers' },
  text_similarity_reranker: { label: '文本相似重排', kind: 'child' },
  rule: { label: '规则路由', kind: 'child', childOptional: true },
  /* 1045：官方数组键 retrievers（不是 retrieve）；子项仍为 {retriever, weight…} 包裹 */
  linear: { label: '线性加权', kind: 'list', listKey: 'retrievers', wrapped: true },
  /* 1047：官方高级检索器三员——pinned（置顶 docs/ids + 召回源）、
     diversify（MMR 多样性 + 向量字段）、rescorer（rescore 体 + 召回源）。
     docs/ids/rescore/query_vector 属结构体，RetrieverEditor 专用 JSON 位编辑。 */
  pinned: { label: '置顶优选', kind: 'child' },
  diversify: { label: '多样性 MMR', kind: 'child', fieldTypes: ['dense_vector'] },
  rescorer: { label: '重打分', kind: 'child' },
};
/* 各变体具名常用参数（GenericParams schema 源；knn 的 field/query_vector 是结构位不在此表） */
export const RETRIEVER_PARAMS: Record<string, ParamMeta[]> = {
  standard: [{ key: 'k', kind: 'number' }],
  knn: [{ key: 'k', kind: 'number' }, { key: 'num_candidates', kind: 'number' },
    { key: 'similarity', kind: 'number' }, { key: 'boost', kind: 'number' }],
  rrf: [{ key: 'rank_constant', kind: 'number' }, { key: 'rank_window_size', kind: 'number' }],
  text_similarity_reranker: [{ key: 'inference_text', kind: 'text' }, { key: 'inference_id', kind: 'text' },
    { key: 'rank_window_size', kind: 'number' }, { key: 'min_score', kind: 'number' }],
  rule: [{ key: 'ruleset_id', kind: 'text' }],
  linear: [
    { key: 'normalizer', kind: 'enum', options: ['none', 'minmax', 'l2_norm'] },
    { key: 'rank_window_size', kind: 'number' }, { key: 'min_score', kind: 'number' },
  ],
  /* pinned 的 docs/ids 与 rescorer 的 rescore 是结构体，走专用 JSON 位（不在表内）；
     diversify 的 query_vector 同理由 JSON 位承担。 */
  pinned: [],
  diversify: [
    { key: 'type', kind: 'enum', options: ['mmr'] },
    { key: 'lambda', kind: 'number' }, { key: 'size', kind: 'number' },
  ],
  rescorer: [],
};

/* 高级算子分组（BoolGroupNode「+ 高级」菜单与 ClauseNode 下拉分组共用同源序）。
 全部成员必须是 OPS_META 或 WRAP_LABELS/MULTI_LABELS 已注册算子。 */
export const ADV_MENU: Array<{ group: string; ops: string[] }> = [
  /* 1372：match_all / match_none 此前**没有任何新建入口**——能解析、能渲染（ClauseNode 有
     「（无值）」分支）、能往返，但「+ 条件」默认落 match_all、算子下拉又只列字段算子，
     于是「想要一个 match_none」只能手写 DSL。这正是 1199 记录过的同一类缺口（读改支持、
     新建不支持）。单列一组：它们不是字段算子，是整条查询的基准档，混进字段族反而误导。 */
  { group: '无条件与无结果', ops: ['match_all', 'match_none'] },
  { group: '全文检索', ops: ['multi_match', 'query_string', 'simple_query_string', 'combined_fields', 'match_bool_prefix', 'more_like_this', 'intervals'] },
  { group: '精确与集合', ops: ['ids', 'terms_set', 'bitmap_terms', 'parent_id', 'type'] },
  /* 1199 续：wrap 容器族（nested / has_child / has_parent）此前**没有任何新建入口**——
     有渲染器（WrapNodeRow）、有参数表（WRAP_PARAMS）、能无损往返，但「+ 条件」与算子下拉里
     都找不到它们，用户只能先手写 DSL 才用得上。这是「双向映射不全面」最典型的一种：
     支持读、支持改，就是不支持新建。单列一组（关系与嵌套）而不是塞进「复合容器」——
     join 族的两个算子要选 join 字段、nested 要选路径，心智上与评分包装不同。 */
  { group: '关系与嵌套', ops: ['nested', 'has_child', 'has_parent'] },
  { group: '地理位置', ops: ['geo_distance', 'geo_bounding_box', 'geo_polygon', 'geo_shape', 'geo_grid', 'shape', 'distance_feature'] },
  { group: '跨度位置', ops: ['span_near', 'span_or', 'span_not', 'span_first', 'span_containing', 'span_within', 'span_term', 'span_gap', 'span_multi', 'span_field_masking'] },
  { group: '向量与语义', ops: ['knn', 'sparse_vector', 'text_expansion', 'weighted_tokens', 'semantic'] },
  { group: '脚本与其他', ops: ['script', 'wrapper', 'percolate', 'rule', 'template', 'rank_feature'] },
  { group: '复合容器', ops: ['constant_score', 'boosting', 'dis_max', 'function_score', 'script_score', 'pinned'] },
];

/* W2：聚合类型建议表（datalist 自由输入的建议项——不限制输入，任何 ES 聚合名都可手输） */
/* 1033：_name 命名查询——所有查询子句通用的 ES 能力（执行时命中归因：响应
   matched_queries 回告哪个命名条件命中，复杂查询调试核心手段）。参数面板恒在
   建议末位（配 schema 键提示可发现性），零注册表膨胀（不逐算子复制 params 清单）；
   _name 落 node.params 直通往返，AST 零改动。 */
export const NAME_PARAM: ParamMeta = { key: '_name', kind: 'text' };

/* 1040：bool 组具名参数 schema——minimum_should_match 支持数值与百分比两形态
   （text 档不约束），boost 全组加权；配 1032 schema 键提示可发现性 */
export const BOOL_PARAMS: ParamMeta[] = [
  { key: 'minimum_should_match', kind: 'text' },
  { key: 'boost', kind: 'number' },
];

/* 1439：聚合体的「字段键」集合从 AggTreeNode 上收到这里——
 补全（dslCompletionContext.aggBodyKeys）与构建器字段选择器必须用同一份清单，
 否则一边给字段选择器、另一边补不出这个键。 */
export const FIELD_BODY_AGGS: ReadonlySet<string> = new Set(['terms', 'histogram', 'date_histogram', 'range', 'date_range', 'avg', 'max', 'min', 'sum', 'stats', 'cardinality', 'value_count', 'percentiles', 'percentile_ranks', 'extended_stats', 'significant_terms', 'significant_text', 'rare_terms', 'missing', 'geo_bounds', 'geo_centroid', 'weighted_avg', 'median_absolute_deviation', 'boxplot', 'string_stats', 'auto_date_histogram', 'ip_range', 'variable_width_histogram', 'geohash_grid', 'geotile_grid', 'geohex_grid', 'geo_distance', 'rate',
  /* 1439：官方体就是 {field} 却没登记 → 字段行退化成裸文本输入（同屏 terms 有选择器）。
     categorize_text: {"categorize_text":{"field":"message"}}；
     diversified_sampler: {"diversified_sampler":{"field":"author"}}（field 可选，
     没有该键时这里不会凭空加行——isFieldKey 只升级已有键）。 */
  'categorize_text', 'diversified_sampler']);
/* nested / reverse_nested 的字段键是 path（嵌套文档路径），不是 field */
export const PATH_BODY_AGGS: ReadonlySet<string> = new Set(['nested', 'reverse_nested']);

export const AGG_OPS: Record<string, string> = {
  terms: 'Terms 分组', date_histogram: '日期直方图', histogram: '数值直方图',
  range: '范围分组', date_range: '日期范围', filters: '多过滤分组', filter: '单过滤',
  avg: '平均值', sum: '求和', min: '最小', max: '最大', cardinality: '去重计数',
  value_count: '计数', stats: '统计', extended_stats: '扩展统计', percentiles: '百分位',
  percentile_ranks: '百分位排名', significant_terms: '显著词项', rare_terms: '稀有词项',
  sampler: '采样', diversified_sampler: '多样化采样', random_sampler: '随机采样',
  top_hits: 'Top 文档', top_metrics: 'Top 指标', missing: '缺值聚合',
  geo_bounds: '地理边界', geo_centroid: '地理质心', composite: '复合分桶',
  scripted_metric: '脚本聚合', median_absolute_deviation: '绝对中位差',
  boxplot: '箱线图', string_stats: '字符串统计', weighted_avg: '加权平均',
  nested: '嵌套', reverse_nested: '反嵌套',
  /* 1030：聚合建议表全量补齐——管道族（对既有桶结果做二次计算）、地理网格族、
   杂项桶/度量族。建议不限制：任何 ES 聚合名都可手输（AggTreeNode datalist 语义）。 */
  global: '全局桶', children: '子文档桶', parent: '父文档桶',
  multi_terms: '多词项分组', adjacency_matrix: '邻接矩阵',
  auto_date_histogram: '自适应日期直方图', significant_text: '显著词文本',
  ip_range: 'IP 范围', variable_width_histogram: '变宽数值直方图',
  geo_distance: '地理距离桶', geohash_grid: 'Geohash 网格',
  geotile_grid: 'Geotile 网格', geohex_grid: 'Geohex 网格', geo_line: '地理轨迹',
  rate: '速率', matrix_stats: '矩阵统计', t_test: 'T 检验',
  categorize_text: '文本归类', frequent_item_sets: '频繁项集', inference: '推理',
  bucket_script: '桶脚本', bucket_selector: '桶选择', bucket_sort: '桶排序',
  cumulative_cardinality: '累计去重', cumulative_sum: '累计求和',
  derivative: '导数', extended_stats_bucket: '桶扩展统计',
  moving_fn: '移动函数', moving_percentiles: '移动百分位', moving_avg: '移动平均（旧）',
  normalize: '归一化', percentiles_bucket: '桶百分位', serial_diff: '串行差分',
  stats_bucket: '桶统计',
  /* 1439：官方桶均值/求和/最小/最大四员（与 stats_bucket 同族）此前两表都缺 */
  avg_bucket: '桶均值（管道）', sum_bucket: '桶求和（管道）',
  min_bucket: '桶最小（管道）', max_bucket: '桶最大（管道）',
};

/* 1030：gap_policy 三档全族单源（管道聚合对空桶的取数策略） */
const GAP_POLICY: string[] = ['skip', 'insert_zeros', 'keep_values'];

/* ═══ 1031：suggester 类型注册表（搜索建议 suggest 项的 suggester 体编辑面）═══
   suggest 项 rest = { <类型键>: {field,size,…} } 单类型键形态——SuggesterEditor 做类型
   切换 + 类型体 schema 编辑；rest 结构零改动（AST SuggestItem 直通），本表只供投影。
   field 行由 GenericParams field-keys 机制渲染 FieldSelect，不在此表。 */
export const SUGGESTER_TYPES: Record<string, string> = {
  term: '纠错 term',
  phrase: '短语 phrase',
  completion: '补全 completion',
};
export const SUGGESTER_PARAMS: Record<string, ParamMeta[]> = {
  term: [
    { key: 'size', kind: 'number' },
    { key: 'suggest_mode', kind: 'enum', options: ['missing', 'popular', 'always'] },
    { key: 'string_distance', kind: 'enum', options: ['internal', 'damerau_levenshtein', 'levenshtein', 'jaro_winkler', 'ngram'] },
    { key: 'max_edits', kind: 'number' },
    { key: 'prefix_length', kind: 'number' },
    { key: 'min_word_length', kind: 'number' },
    { key: 'shard_size', kind: 'number' },
  ],
  phrase: [
    { key: 'size', kind: 'number' },
    { key: 'gram_size', kind: 'number' },
    { key: 'confidence', kind: 'number' },
    { key: 'max_errors', kind: 'number' },
    { key: 'real_word_error_likelihood', kind: 'number' },
    { key: 'separator', kind: 'text' },
  ],
  completion: [
    { key: 'size', kind: 'number' },
    { key: 'skip_duplicates', kind: 'boolean' },
  ],
};

/* 1020：常用聚合 body 具名参数 schema（GenericParams 消费——具名键升类型化输入/枚举下拉，
 与 WRAP_PARAMS 同语言）。field 由 field-keys 行内 FieldSelect 权威编辑不在此表；
 未登记键维持自由表（加键零丢失）；未登记聚合类型零 schema = 裸表（现状不变）。 */
export const AGG_BODY_PARAMS: Record<string, ParamMeta[]> = {
  terms: [
    { key: 'size', kind: 'number' }, { key: 'min_doc_count', kind: 'number' },
    { key: 'missing', kind: 'text' },
    { key: 'execution_hint', kind: 'enum', options: ['map', 'global_ordinals', 'term_ordinals'] },
    /* 1439：官方标量参数补齐（order/ranges 等结构键仍由专用面板承担） */
    { key: 'shard_size', kind: 'number' }, { key: 'shard_min_doc_count', kind: 'number' },
    { key: 'include', kind: 'text' }, { key: 'exclude', kind: 'text' },
    { key: 'show_term_doc_count_error', kind: 'boolean' },
    { key: 'collect_mode', kind: 'enum', options: ['breadth_first', 'depth_first'] },
  ],
  date_histogram: [
    { key: 'calendar_interval', kind: 'text' }, { key: 'fixed_interval', kind: 'text' },
    { key: 'format', kind: 'text' }, { key: 'min_doc_count', kind: 'number' },
    { key: 'offset', kind: 'text' }, { key: 'time_zone', kind: 'text' },
    { key: 'keyed', kind: 'boolean' },
  ],
  histogram: [
    { key: 'interval', kind: 'number' }, { key: 'min_doc_count', kind: 'number' },
    { key: 'offset', kind: 'number' }, { key: 'keyed', kind: 'boolean' },
  ],
  range: [{ key: 'keyed', kind: 'boolean' }],
  /* 1022：date_range（ranges 由 AggRangesPanel 权威编辑）/ filters（buckets 由 AggFiltersPanel） */
  date_range: [
    { key: 'format', kind: 'text' }, { key: 'time_zone', kind: 'text' }, { key: 'keyed', kind: 'boolean' },
  ],
  filters: [
    { key: 'other_bucket', kind: 'boolean' }, { key: 'other_bucket_key', kind: 'text' },
  ],
  /* 1026：低频族补录（percents/values 数组键留自由表——数组编辑非单值档） */
  percentiles: [
    { key: 'keyed', kind: 'boolean' },
    { key: 'tdigest', kind: 'boolean' }, { key: 'compression', kind: 'number' },
    { key: 'hdr', kind: 'boolean' }, { key: 'number_of_sigmas', kind: 'number' },
  ],
  percentile_ranks: [{ key: 'keyed', kind: 'boolean' }],
  extended_stats: [{ key: 'sigma', kind: 'number' }],
  significant_terms: [
    { key: 'size', kind: 'number' }, { key: 'min_doc_count', kind: 'number' },
    { key: 'exclude_frequent', kind: 'boolean' },
    { key: 'shard_size', kind: 'number' },
  ],
  rare_terms: [{ key: 'max_doc_count', kind: 'number' }],
  sampler: [{ key: 'shard_size', kind: 'number' }],
  diversified_sampler: [{ key: 'shard_size', kind: 'number' }],
  /* ES 7.1+ 的随机采样聚合（与 sampler 的 shard_size 取样不同：按 probability 概率抽）。
     官方只有这两个标量键；seed 用于结果可复现。 */
  random_sampler: [{ key: 'probability', kind: 'number' }, { key: 'seed', kind: 'number' }],
  avg: [{ key: 'missing', kind: 'number' }],
  sum: [{ key: 'missing', kind: 'number' }],
  min: [{ key: 'missing', kind: 'number' }],
  max: [{ key: 'missing', kind: 'number' }],
  cardinality: [{ key: 'precision_threshold', kind: 'number' }],
  top_hits: [
    { key: 'size', kind: 'number' }, { key: 'from', kind: 'number' },
    /* 1439：官方标量开关补齐（sort/_source/highlight 等结构键由自由表或面板承担） */
    { key: 'track_scores', kind: 'boolean' }, { key: 'explain', kind: 'boolean' },
    { key: 'version', kind: 'boolean' },
  ],
  /* 1201：三个「必填主键不在自由表里就会被当普通键手打」的聚合——
     stats 与 avg/min/max 同族（field 由 FIELD_BODY_AGGS 给选择器，这里只剩 missing）；
     top_metrics 主键是 metrics 数组 + sort 数组（数组键留自由表，size 与 missing 升具名）；
     matrix_stats 主键是 fields 数组（同上，只把 mode 提成枚举）。 */
  stats: [{ key: 'missing', kind: 'number' }],
  /* top_metrics 的两个必填/高频键都是对象语义：metrics 收单个对象或对象数组（官方两者都收），
     sort 收单个对象。这里用 json-array 给 metrics（新建 `[]` 比 `{}` 更接近官方示例），
     sort 用 json（`{}`）。missing 不是 top_metrics 的顶层键（它在 metrics 项内），不登记。 */
  top_metrics: [
    { key: 'metrics', kind: 'json-array' }, { key: 'sort', kind: 'json' },
    { key: 'size', kind: 'number' },
  ],
  /* matrix_stats 的必填主键是 fields 数组（字段名串数组），mode 五档、missing 是字段→值映射 */
  matrix_stats: [
    { key: 'fields', kind: 'json-array' },
    { key: 'mode', kind: 'enum', options: ['avg', 'min', 'max', 'sum', 'median'] },
    { key: 'missing', kind: 'json' },
  ],
  /* 1030：管道族与地理网格族 schema——buckets_path（管道输入引用）升具名文本档，
   gap_policy 三档全族统一枚举；script/buckets 数组键（bucket_script.script、
   bucket_sort.sort、percentiles_bucket.percents）维持自由表零丢失 */
  geohash_grid: [{ key: 'precision', kind: 'number' }, { key: 'size', kind: 'number' }],
  geotile_grid: [{ key: 'precision', kind: 'number' }, { key: 'size', kind: 'number' }],
  geohex_grid: [{ key: 'precision', kind: 'number' }, { key: 'size', kind: 'number' }],
  auto_date_histogram: [
    { key: 'buckets', kind: 'number' }, { key: 'format', kind: 'text' }, { key: 'min_doc_count', kind: 'number' },
  ],
  ip_range: [{ key: 'keyed', kind: 'boolean' }],
  variable_width_histogram: [{ key: 'buckets', kind: 'number' }],
  significant_text: [{ key: 'size', kind: 'number' }, { key: 'min_doc_count', kind: 'number' }],
  adjacency_matrix: [{ key: 'separator', kind: 'text' }],
  rate: [
    { key: 'unit', kind: 'text' },
    { key: 'mode', kind: 'enum', options: ['sum', 'min', 'max', 'avg'] },
  ],
  derivative: [
    { key: 'buckets_path', kind: 'text' }, { key: 'unit', kind: 'text' },
    { key: 'gap_policy', kind: 'enum', options: GAP_POLICY },
  ],
  cumulative_sum: [{ key: 'buckets_path', kind: 'text' }, { key: 'format', kind: 'text' }],
  cumulative_cardinality: [{ key: 'buckets_path', kind: 'text' }, { key: 'precision_threshold', kind: 'number' }],
  /* bucket_script 官方参数只有 buckets_path + script（gap_policy 是 bucket_selector 的，
     加到这里会被 ES 当未知键拒绝；spec 里有一条正面锁）。 */
  bucket_script: [{ key: 'buckets_path', kind: 'text' }, { key: 'script', kind: 'text' }],
  bucket_selector: [
    { key: 'buckets_path', kind: 'text' }, { key: 'script', kind: 'text' },
    { key: 'gap_policy', kind: 'enum', options: GAP_POLICY },
  ],
  /* 1202：管道族的**必填主键**此前全在自由表里手打，新建后根本配不出能跑的聚合：
     · bucket_script / bucket_selector 官方体必须同时有 buckets_path 与 script——只登记了前者；
     · bucket_sort 必须给 sort（规则数组）；size/from 才是常调标量——此前只登记 gap_policy；
     · cumulative_cardinality 是管道聚合，必须给 buckets_path——此前只登记 precision_threshold。
     处理口径：标量键（script/size/from）升具名档；**数组键（sort）刻意不登记**——
     GenericParams 的 json 档新建时默认 `{}`，而 bucket_sort.sort 要的是数组，
     登记进去等于给一个 ES 会拒的默认值；留在自由表里由用户写 `[{...}]` 反而安全。 */
  bucket_sort: [
    { key: 'size', kind: 'number' }, { key: 'from', kind: 'number' },
    { key: 'gap_policy', kind: 'enum', options: GAP_POLICY },
  ],
  extended_stats_bucket: [
    { key: 'buckets_path', kind: 'text' }, { key: 'sigma', kind: 'number' },
    { key: 'gap_policy', kind: 'enum', options: GAP_POLICY },
  ],
  stats_bucket: [{ key: 'buckets_path', kind: 'text' }, { key: 'gap_policy', kind: 'enum', options: GAP_POLICY }],
  percentiles_bucket: [{ key: 'buckets_path', kind: 'text' }, { key: 'gap_policy', kind: 'enum', options: GAP_POLICY }],
  avg_bucket: [{ key: 'buckets_path', kind: 'text' }, { key: 'gap_policy', kind: 'enum', options: GAP_POLICY }, { key: 'format', kind: 'text' }],
  sum_bucket: [{ key: 'buckets_path', kind: 'text' }, { key: 'gap_policy', kind: 'enum', options: GAP_POLICY }, { key: 'format', kind: 'text' }],
  min_bucket: [{ key: 'buckets_path', kind: 'text' }, { key: 'gap_policy', kind: 'enum', options: GAP_POLICY }, { key: 'format', kind: 'text' }],
  max_bucket: [{ key: 'buckets_path', kind: 'text' }, { key: 'gap_policy', kind: 'enum', options: GAP_POLICY }, { key: 'format', kind: 'text' }],
  moving_fn: [
    { key: 'buckets_path', kind: 'text' }, { key: 'window', kind: 'number' }, { key: 'shift', kind: 'number' },
    { key: 'gap_policy', kind: 'enum', options: GAP_POLICY },
  ],
  moving_percentiles: [
    { key: 'buckets_path', kind: 'text' }, { key: 'window', kind: 'number' }, { key: 'shift', kind: 'number' },
  ],
  moving_avg: [
    { key: 'buckets_path', kind: 'text' }, { key: 'window', kind: 'number' },
    { key: 'gap_policy', kind: 'enum', options: GAP_POLICY },
  ],
  serial_diff: [
    { key: 'buckets_path', kind: 'text' }, { key: 'lag', kind: 'number' },
    { key: 'gap_policy', kind: 'enum', options: GAP_POLICY },
  ],
  normalize: [
    { key: 'buckets_path', kind: 'text' },
    { key: 'mode', kind: 'enum', options: ['percent_of_sum', 'mean_of_values', 'median_of_values', 'sum_of_values'] },
  ],
  /* 1039：多键分组与复合分桶的 size（1032 schema 键提示对未入体键的建议通道覆盖） */
  multi_terms: [{ key: 'size', kind: 'number' }],
  composite: [{ key: 'size', kind: 'number' }],

  /* ═══ 聚合参数 schema 补齐：此前 21 个算子在这里没有条目，参数只能靠用户手打自由表。
     下面只登记**官方文档存在的标量/枚举键**，形状不确定或必须数组的键一律留在自由表
     （原因：json 档新建时给 `{}`，登记数组型键等于给一个 ES 会拒的默认值）。
     field / path 不在表内——由 AggTreeNode 的 FIELD_BODY_AGGS / PATH_BODY_AGGS 给字段选择器。 */

  /* filter：唯一的体是 query 子句（树形编辑，不是标量），无标量可登记 */
  filter: [],
  /* nested / reverse_nested：唯一参数是 path（由 PATH_BODY_AGGS 给字段选择器） */
  nested: [],
  reverse_nested: [],
  /* global：官方无参数 */
  global: [],
  /* value_count / geo_centroid：官方参数只有 field（已由字段选择器覆盖） */
  value_count: [],
  geo_centroid: [],

  string_stats: [{ key: 'show_distribution', kind: 'boolean' }, { key: 'missing', kind: 'text' }],
  missing: [{ key: 'missing', kind: 'text' }],
  median_absolute_deviation: [{ key: 'missing', kind: 'number' }, { key: 'compression', kind: 'number' }],
  boxplot: [{ key: 'missing', kind: 'number' }, { key: 'compression', kind: 'number' }],
  geo_bounds: [{ key: 'wrap_longitude', kind: 'boolean' }],

  /* 两个「必填主键是对象」的聚合：value/weight 与 a/b 都是 {field,…} 对象，
     GenericParams 的 json 档新建时给空对象 `{}`（不是 ES 会拒的标量），用户补 field 即可。
     这一条比「什么都不给、全靠手打」更有发现性——用户能看到缺的是哪两个键。 */
  weighted_avg: [
    { key: 'value', kind: 'json' }, { key: 'weight', kind: 'json' },
    { key: 'format', kind: 'text' },
  ],
  t_test: [
    { key: 'a', kind: 'json' }, { key: 'b', kind: 'json' },
    {
      key: 'type', kind: 'enum',
      options: ['heteroscedastic', 'homoscedastic', 'paired'],
    },
  ],

  /* scripted_metric 的四个生命周期脚本都是必填字符串（map/combine/reduce）——
     script 档给具名文本行，比在自由表里逐个手打键名快得多 */
  scripted_metric: [
    { key: 'init_script', kind: 'text' }, { key: 'map_script', kind: 'text' },
    { key: 'combine_script', kind: 'text' }, { key: 'reduce_script', kind: 'text' },
  ],

  /* 地理网格/距离桶的框选与精度（field 由字段选择器给） */
  geo_distance: [
    { key: 'origin', kind: 'json' }, { key: 'unit', kind: 'text' },
    { key: 'distance_type', kind: 'enum', options: ['arc', 'plane'] },
  ],
  geo_line: [
    { key: 'sort', kind: 'json' }, { key: 'point', kind: 'json' },
    { key: 'size', kind: 'number' },
  ],

  /* children/parent 的关系类型键（type，不是 field） */
  children: [{ key: 'type', kind: 'text' }],
  parent: [{ key: 'type', kind: 'text' }],

  /* 文本归类/频繁项集/推理：只登记确定性标量 */
  categorize_text: [
    { key: 'max_matches', kind: 'number' }, { key: 'min_doc_count', kind: 'number' },
    { key: 'shard_size', kind: 'number' }, { key: 'size', kind: 'number' },
  ],
  frequent_item_sets: [
    { key: 'minimum_set_size', kind: 'number' }, { key: 'size', kind: 'number' },
  ],
  inference: [{ key: 'model_id', kind: 'text' }],
};
