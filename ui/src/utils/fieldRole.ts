/* 字段业务角色推断（纯函数，零 UI/零请求）——只吃 mapping 的字段名 + 类型，
   不假设任何生产索引名或业务字段一定存在；推断不出就落 other，行为退回 opsForType。
   用途：
   ① FieldSelect/FieldPicker 候选排序：同一 mapping 类型内，先给「本算子语义最相关」的角色；
   ② 新条件默认算子：identifier→term、text→match、metric→range、date→range…
   ③ 中文业务词别名：输入「主体/公告/研报/债券/舆情」时展开到常见英文字段词根。
   宁缺勿错：角色只影响排序与默认值，不隐藏字段、不伪造字段。 */

export type FieldRole =
  | 'identifier' | 'entity' | 'text' | 'date' | 'category'
  | 'metric' | 'geo' | 'vector' | 'boolean' | 'other';

const TEXT_HINT = /(title|name|summary|abstract|content|description|desc|scope|body|text|remark|comment|reason|address)$/i;
/* 标题/名称/摘要属于“短标识性文本”，角色归 entity；content/body 等长正文归 text */
const NAME_HINT = /(title|name|summary|abstract|subject|label)$/i;
const IDENTIFIER_HINT = /(^|_)(id|ids|code|no|number|uuid|key|sn)$/i;
const ENTITY_HINT = /(entity|company|issuer|announcer|subject|organ|org|person|analyst|author|related|party|counterparty|institution|agency)/i;
const CATEGORY_HINT = /(status|state|type|kind|category|rating|level|polarity|sentiment|industry|market|region|province|city|area|topic|tag|source|channel|currency|exchange|board|default_flag|is_)/i;
const METRIC_HINT = /(amount|score|rate|capital|count|price|ratio|percent|pct|total|sum|avg|max|min|balance|volume|quantity|page_count|coupon|outstanding|revenue|profit|risk)/i;
const DATE_HINT = /(time|date|_at|_on|timestamp|created|updated|published|expire|maturity|issue)/i;

/** 1069 续：字段名是否带主体/机构词根（issuer_type/company_industry 这类「主体的属性」
 * 虽是分类，但不应在「某主体的分类构成」里被选成分类维度——过滤到单一主体后它是常量）。 */
export function hasEntityStem(path: string): boolean {
  const leaf = String(path || '').split('.').pop() || String(path || '');
  return ENTITY_HINT.test(leaf);
}

export function fieldRoleOf(path: string, type?: string): FieldRole {
  const t = String(type || '').toLowerCase();
  const leaf = String(path || '').split('.').pop() || String(path || '');
  if (t === 'date' || t === 'date_nanos' || t === 'date_range') return 'date';
  if (t === 'boolean') return 'boolean';
  if (t === 'match_only_text' || t === 'search_as_you_type') return 'text';
  if (t === 'semantic_text') return 'vector';
  if (t.startsWith('geo_') || t === 'shape' || t === 'point') return 'geo';
  if (t === 'dense_vector' || t === 'sparse_vector' || t === 'rank_feature' || t === 'rank_features' || t === 'semantic') return 'vector';
  if (t === 'object' || t === 'nested') return 'other';
  if (t === 'text' || t === 'match_only_text' || t === 'search_as_you_type') {
    /* text 字段里仍分「名称/标题」与「正文」：前者适合短语/精确加权，后者适合全文 */
    return NAME_HINT.test(leaf) || ENTITY_HINT.test(leaf) ? 'entity' : 'text';
  }
  if (t === 'keyword' || t === 'constant_keyword' || t === 'wildcard' || t === 'ip' || t === 'version') {
    if (IDENTIFIER_HINT.test(leaf) || /(code|id)$/i.test(leaf)) return 'identifier';
    /* 1069 续：分类词根优先于「名称」词根——issuer_type / company_industry / source_name /
       industry_name 都是分类维度，不能因为带 name/type 的实体前缀被抬成主体字段
       （否则主体 Top/每主体最新会绑到 issuer_type 这类字段上）。 */
    if (CATEGORY_HINT.test(leaf)) return 'category';
    /* keyword 的 name/title/subject 同 text 语义 = 主体/名称（分组、精确查找的最常见入口）； */
    if (ENTITY_HINT.test(leaf) || NAME_HINT.test(leaf)) return 'entity';
    if (t === 'ip') return 'category';
    return 'category';
  }
  if (t === 'long' || t === 'integer' || t === 'short' || t === 'byte' || t === 'double'
    || t === 'float' || t === 'half_float' || t === 'scaled_float' || t === 'unsigned_long'
    || t === 'token_count') {
    if (IDENTIFIER_HINT.test(leaf)) return 'identifier';
    if (METRIC_HINT.test(leaf)) return 'metric';
    return 'metric';
  }
  /* 无 mapping 类型：只靠字段名给弱角色（仍只影响排序） */
  if (IDENTIFIER_HINT.test(leaf)) return 'identifier';
  if (DATE_HINT.test(leaf)) return 'date';
  if (ENTITY_HINT.test(leaf)) return 'entity';
  if (TEXT_HINT.test(leaf)) return 'text';
  if (METRIC_HINT.test(leaf)) return 'metric';
  if (CATEGORY_HINT.test(leaf)) return 'category';
  return 'other';
}

/* 算子 → 角色优先序（只排序，不过滤；未列算子返回 [] = 不干预） */
export function rolePriorityForOp(op: string): FieldRole[] {
  if (op === 'match' || op === 'match_phrase' || op === 'match_phrase_prefix' || op === 'match_bool_prefix'
    || op === 'multi_match' || op === 'combined_fields' || op === 'query_string' || op === 'simple_query_string'
    || op === 'more_like_this' || op === 'intervals') {
    return ['text', 'entity', 'category', 'identifier', 'other'];
  }
  if (op === 'term' || op === 'fuzzy' || op === 'regexp' || op === 'prefix' || op === 'wildcard') {
    return ['identifier', 'entity', 'category', 'text', 'other'];
  }
  if (op === 'terms' || op === 'terms_set' || op === 'bitmap_terms') {
    return ['category', 'entity', 'identifier', 'other'];
  }
  if (op === 'range') return ['date', 'metric', 'identifier', 'other'];
  if (op.startsWith('geo_') || op === 'distance_feature' || op === 'shape') return ['geo'];
  if (op === 'knn' || op === 'sparse_vector' || op === 'semantic' || op === 'text_expansion'
    || op === 'weighted_tokens' || op === 'rank_feature') return ['vector'];
  if (op === 'exists') return ['identifier', 'entity', 'date', 'category', 'metric', 'text', 'other'];
  return [];
}

/** 新条件默认算子（角色感知；未识别类型回落 opsForType[0]） */
export function defaultOpForField(path: string, type?: string): string {
  const t = String(type || '').toLowerCase();
  if (t === 'date' || t === 'date_nanos' || t.endsWith('_range')) return 'range';
  if (t === 'boolean') return 'term';
  if (t === 'geo_point') return 'geo_distance';
  if (t === 'geo_shape') return 'geo_shape';
  if (t === 'dense_vector') return 'knn';
  if (t === 'sparse_vector') return 'sparse_vector';
  if (t === 'semantic_text') return 'semantic';
  if (t === 'rank_feature' || t === 'rank_features') return 'rank_feature';
  if (t === 'text' || t === 'match_only_text' || t === 'search_as_you_type') return 'match';
  if (t === 'ip' || t === 'version') return 'term';
  if (t === 'percolator') return 'percolate';
  if (t === 'join') return 'parent_id';
  /* 1422：容器字段（object / nested）没有可直接查询的值——官方只在叶子路径上建索引，
     对容器路径做 term 必然零命中或报错。此前落 term，用户点一下就得到注定失败的查询。
     容器上唯一有意义的默认是 exists（该字段有子值）。nested 想按内部字段查，
     用户应选具体叶子路径（如 products.color）。 */
  if (t === 'object' || t === 'nested') return 'exists';
  const role = fieldRoleOf(path, type);
  /* 1411：无 mapping 类型时，角色同样决定默认算子——date 词根字段给 range
     （publish_time 这类在 mapping 未加载时此前落 term，用户还得手动换算子），
     metric 已有同款兜底。entity/identifier/category 仍给 term（精确命中语义）。 */
  if (role === 'metric' || role === 'date') return 'range';
  return 'term';
}

/* 中文业务词 → 字段词根（只用于零直配时的候选扩展；不生成任何字段） */
export const FIELD_ALIASES: Record<string, string[]> = {
  主体: ['entity', 'company', 'issuer', 'announcer', 'subject', 'related', 'party'],
  企业: ['entity', 'company', 'issuer', 'enterprise'],
  公司: ['company', 'entity', 'issuer'],
  名称: ['name'],
  标题: ['title', 'name'],
  代码: ['code', 'id'],
  编号: ['no', 'code', 'id'],
  时间: ['time', 'date', 'published', 'publish', 'event', 'created', 'updated'],
  日期: ['date', 'time', 'published', 'event'],
  公告: ['announcement', 'notice', 'bulletin'],
  研报: ['report', 'research', 'paper'],
  报告: ['report', 'summary'],
  债券: ['bond', 'issuer', 'coupon', 'maturity'],
  舆情: ['sentiment', 'news', 'opinion', 'public'],
  新闻: ['news', 'sentiment'],
  情绪: ['sentiment', 'polarity'],
  情感: ['sentiment', 'polarity'],
  行业: ['industry', 'sector'],
  评级: ['rating', 'credit'],
  信用: ['credit', 'rating'],
  地区: ['region', 'province', 'city', 'area'],
  省份: ['province', 'region'],
  金额: ['amount', 'capital', 'price', 'value'],
  规模: ['amount', 'outstanding', 'capital', 'volume'],
  利率: ['rate', 'coupon'],
  工商: ['business', 'registration', 'legal', 'credit'],
  注册: ['registration', 'capital', 'code'],
  法人: ['legal', 'representative', 'person'],
  风险: ['risk', 'default', 'danger', 'status'],
  状态: ['status', 'state'],
  来源: ['source', 'channel'],
  标签: ['tag', 'label', 'topic'],
  内容: ['content', 'body', 'text'],
  摘要: ['summary', 'abstract', 'desc'],
};

/** 查询词命中中文业务别名时返回展开词根（最长别名优先，最多 2 组） */
export function aliasStemsFor(query: string): string[] {
  const q = String(query || '').trim();
  if (!q) return [];
  const hits: Array<[string, string[]]> = [];
  for (const [k, v] of Object.entries(FIELD_ALIASES)) if (q.includes(k)) hits.push([k, v]);
  hits.sort((a, b) => b[0].length - a[0].length);
  const out: string[] = [];
  for (const [, stems] of hits.slice(0, 2)) for (const s of stems) if (!out.includes(s)) out.push(s);
  return out;
}
