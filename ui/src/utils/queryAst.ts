/* 查询 DSL ↔ 节点树双向翻译（零降级，往返无损硬契约，设计文档 ）。
 树即 AST：叶子保留原始 body（raw），富表单只是 raw 之上的透镜；
 未知/非标准形态落 raw，由 GenericNode 递归键值表单编辑——永远没有 JSON 文本块。
 W2 已富化 sort/_source/highlight/aggs 为一等解析（form/aggKey/presence 形态记忆）。
 无损契约的适用前提：合法 ES 形态。非法/退化输入按 best-effort 结构化归一，已知裁剪：
 _source:null→true；sort 非标项（多键/空对象/非标量 inner）；agg 同体双键（aggs+aggregations
 后者覆盖前者）；agg 非标 body（非对象/多 op 键多余键丢弃）；highlight 字段值非对象归一 {}；
  meta:null 丢弃。
自 998 起补两处保真：
① field 形态 inner 对象形态记忆（expanded）——{match:{f:{query:'x'}}} 不再被归一成 {match:{f:'x'}}；
② 查询体参数（min_score/search_after/fields/pit…共 18 键）一等分账 searchParams，不再落 extras 键值表。
零拷贝取舍：parse 不重造子对象（params/raw 直引原 DSL），parse 后不得 mutate 原 DSL。 */
import { OPS_META, MULTI_META, RETRIEVER_META, type ParamMeta } from './queryAstOps';
import { SEARCH_PARAM_KEYS, SEARCH_PARAM_ORDER } from './queryBodyParams';

export type Occur = 'must' | 'filter' | 'should' | 'must_not';
export const OCCURS: Occur[] = ['must', 'filter', 'should', 'must_not'];

let seq = 0;
export const nid = (): string => 'n' + (++seq).toString(36) + Math.random().toString(36).slice(2, 6);

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

export interface LeafNode {
  id: string; type: 'leaf'; op: string;
  field: string | null;          // 标准单字段形态非空；null 时 raw 为权威（fields/named/none 形态也无 field）
  fields?: string[] | null;      // form='fields' 多字段形态（multi_match 等）；null = body 无 fields 键
  value: unknown;
  params: Record<string, unknown>;
  raw: unknown;
  /** 主值键 presence 记忆（named/none/fields 形态）：false = 原 body 没有 mainKey，
   * 序列化时不写回 undefined 占位键（对象级往返无损；JSON 文本本会剔掉 undefined）。 */
  hasMain?: boolean;
  /** field 形态 inner 写法记忆：true = 原 DSL 是 {op:{field:{value|query:…}}} 对象形态，
   * false/缺省 = 标量简写 {op:{field:'x'}}。往返时按原形态写回，树编辑不再悄悄改写用户 DSL 文本。 */
  expanded?: boolean;
  /** 条件临时停用：true 时不参与序列化(不发 ES),树与 UI 保留以便再次勾选恢复 */
  disabled?: boolean;
}
export interface BoolNode {
  id: string; type: 'bool';
  children: Array<{ occur: Occur; node: QueryNode }>;
  params: Record<string, unknown>;
  /* 各 occur 分区原始是否为数组形态（往返无损：{must:{…}} vs {must:[{…}]} 须原样还原） */
  arrForm: Partial<Record<Occur, boolean>>;
}
export interface WrapNode {
  id: string; type: 'wrap'; op: string;   // nested / has_child / has_parent / constant_score / function_score / script_score / pinned
  field: string | null;                   // 路由字段（path/type/parent_type）；constant_score 等无路由字段 = null
  childKey?: string;                      // 子查询键名记忆（query/filter/organic），缺省 'query'
  child: QueryNode | null;
  params: Record<string, unknown>;
}
/* 985：多子查询容器（boosting 正负加权 / dis_max 多查询取最大）。
 同 key 多条 = 序列化聚合数组（dis_max queries）；arrForm 记忆各键原始数组形态（往返无损）。 */
export interface MultiNode {
  id: string; type: 'multi'; op: string;
  children: Array<{ key: string; node: QueryNode }>;
  params: Record<string, unknown>;
  arrForm: Partial<Record<string, boolean>>;
}
export type QueryNode = LeafNode | BoolNode | WrapNode | MultiNode;

/* W2 富化：sort/_source/highlight/aggs 一等解析（形态记忆，往返无损） */
export interface SortItem { id: string; field: string; form: 'str' | 'short' | 'full' | 'multi'; params: Record<string, unknown> }
export interface SourceSpec {
  mode: 'all' | 'none' | 'one' | 'list' | 'pattern';
  fields: string[]; includes: string[]; excludes: string[];
  hasIncludes?: boolean; hasExcludes?: boolean;
  /** 非标准/扩展键（exclude 单数、include、非数组 includes…）原样保真 */
  extra?: Record<string, unknown>;
}
export interface AggNode { id: string; name: string; op: string; body: unknown; children: AggNode[]; meta: Record<string, unknown>; aggKey: string; hasMeta?: boolean; hasKids?: boolean }
interface HighlightSpec { fields: Array<{ name: string; params: Record<string, unknown> }>; params: Record<string, unknown>; hasFields?: boolean }
/* 987：顶层键一等公民化。post_filter 直接复用 QueryNode 树（聚合后过滤可树编辑）；
 collapse = 路由字段 + 其余参数（inner_hits 落 params）；knn = 路由字段 + 向量 presence
 记忆（query_vector 键缺席形态如 query_vector_builder 不写回主值位）。畸形形态
 （collapse 数组 / knn 非对象或 field 非字符串）一律落 extras 零丢失。 */
export interface CollapseSpec { field: string; params: Record<string, unknown> }
export interface KnnSpec { field: string | null; vector: unknown; params: Record<string, unknown>; hasVector: boolean }
/* 989：suggest 一等解析。顶层 text 是 suggest 级全局参数（与建议项同名层，parse 特判
 不吞项）；建议项 = 命名键 + text 骨架 + 其余键（suggester 类型键 term/phrase/completion
 等整体落 rest 原样）。任一项 body 非对象 → 整键落 extras 零丢失。 */
export interface SuggestItem { name: string; text: unknown; hasText: boolean; rest: Record<string, unknown> }
export interface SuggestSpec { items: SuggestItem[]; globalText: unknown; hasGlobalText: boolean }
/* 991：rescore 一等解析（post_filter 姊妹键）。单对象形态结构化（window_size + query 双层）：
 rescore_query 复用 QueryNode 树编辑；query 下其余键（query_weight/rescore_query_weight）落
 params。数组多段形态首期不结构化 → 落 extras 零丢失。 */
export interface RescoreSpec { windowSize: unknown; hasWindowSize: boolean; rescoreQuery: QueryNode | null; params: Record<string, unknown> }
/* 996：script_fields / runtime_mappings 一等解析（命名键+体 同构双键）。项体原样保真
 （script source/params、type/format 等），任一项 body 非对象 → 整键落 extras 零丢失。 */
export interface NamedSpecItem { name: string; body: Record<string, unknown> }
export interface ScriptFieldsSpec { items: NamedSpecItem[] }
export interface RuntimeMappingsSpec { items: NamedSpecItem[] }

export interface QueryTree {
  root: QueryNode | null;
  postFilter: QueryNode | null;    // null = 键不存在；任何值经 parseQueryNode（__raw__ 兜底无损）
  collapse: CollapseSpec | null;
  knn: KnnSpec | null;
  /** 998：knn 数组形态（ES 8.7+ 多向量混合检索）——第 2..n 项；knn 恒为第 1 项 */
  knnExtra?: KnnSpec[];
  /** 998：原 DSL 是否数组形态（含单元素数组/空数组），序列化时原样写回 */
  knnArray?: boolean;
  suggest: SuggestSpec | null;
  rescore: RescoreSpec | null;
  /** 998：rescore 数组形态（多段重打分）——第 2..n 段；rescore 恒为第 1 段 */
  rescoreExtra?: RescoreSpec[];
  rescoreArray?: boolean;
  scriptFields: ScriptFieldsSpec | null;
  runtimeMappings: RuntimeMappingsSpec | null;
  /** 1000：检索器（8.14+ 检索面）——六变体递归结构（bm25/knn/rrf/tsr/rule/linear），
   * 见 parseRetriever/serRetriever；未注册变体/畸形体整键落 extras 零丢失 */
  retriever: RetrieverNode | null;
  size?: unknown; from?: unknown;  // 非数值也原样保留（零降级）
  sort: SortItem[] | null;         // null = 键不存在；[] = 空数组保键
  source: SourceSpec | null;
  aggs: AggNode[] | null;
  aggKey?: string;                 // 顶层 aggs/aggregations 键名记忆
  highlight: HighlightSpec | null;
  /** 998：查询体参数（min_score/search_after/fields/pit…18 键）结构化分账——
   * 键名与控件语义见 utils/queryBodyParams；不在册的键仍落 extras（零丢失）。 */
  searchParams: Record<string, unknown>;
  extras: Record<string, unknown>; // 其余顶层键原样保留
}
type ParseResult = { ok: true; tree: QueryTree } | { ok: false; reason: string };

/* 包装算子元数据：fieldKey = 路由字段键（缺省 = 无路由字段包装）；childKey = 子查询键名。
 WRAP_FIELD 保持路由字段键的兼容视图（既有消费面：builderTypePriority521 等）。 */
export interface WrapMeta { fieldKey?: string; childKey: string; childOptional?: boolean }
export const WRAP_META: Record<string, WrapMeta> = {
  nested: { fieldKey: 'path', childKey: 'query' },
  has_child: { fieldKey: 'type', childKey: 'query' },
  has_parent: { fieldKey: 'parent_type', childKey: 'query' },
  constant_score: { childKey: 'filter' },
  /* function_score 的 query 可选（functions/func 独立成体是官方合法形态）；
     其余包装容器子查询必填——缺子句时仍落 raw 权威，不在树里伪造 match_all。 */
  function_score: { childKey: 'query', childOptional: true },
  script_score: { childKey: 'query' },
  pinned: { childKey: 'organic' },
  span_first: { childKey: 'match' },
  span_multi: { childKey: 'match' },
  span_field_masking: { fieldKey: 'field', childKey: 'query' },
};
export const WRAP_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(WRAP_META).filter(([, m]) => m.fieldKey).map(([op, m]) => [op, m.fieldKey!]),
);

/* geo 系特判：body 是「字段键 + 散参数」同层（{distance, location:{…}, validation_method}）——
 值为对象的键即字段，其余散键进 params。geo_point 字段值也可以是字符串（"41,-87"），
 无对象值键时回认 location 键（该键在 geo_distance 里恒为地理值位）。 */
const FIELD_OBJ_OPS = new Set(['geo_distance', 'geo_bounding_box', 'geo_polygon', 'geo_grid', 'shape']);

/* field 形态允许与字段键同层的具名参数（terms + boost、term + case_insensitive…）。
 注册表 params 是权威来源，再补 ES 全族常见散键——字段键 = 唯一不在本表的 body 键。
 否则「字段 + 兄弟参数」会被误判非标准形态整条落 raw（合法 DSL 失去富表单）。 */
const COMMON_PARAM_KEYS: ReadonlySet<string> = new Set<string>([
  /* 只收「确定不是字段名」的散参数；field/value/query/term/type/id 等既可能是参数、
     也可能是业务字段名，收进来会把 {term:{field:'x'}} 误判成无字段形态。geo 系由
     FIELD_OBJ_OPS 单独处理，不依赖此表。 */
  '_name', 'boost', 'case_insensitive', 'rewrite',
  ...Object.values(OPS_META).flatMap(m => (m.params || []).map(p => p.key)),
]);

function parseLeaf(op: string, body: unknown): LeafNode {
  const base: LeafNode = { id: nid(), type: 'leaf', op, field: null, value: null, params: {}, raw: null };
  if (op === 'match_all' || op === 'match_none') {
    if (isObj(body)) return { ...base, value: {}, params: { ...body } };
    return { ...base, raw: body };
  }
  if (op === 'exists') {
    if (isObj(body) && typeof body.field === 'string') {
      const { field, ...rest } = body;
      return { ...base, field, params: rest };
    }
    return { ...base, raw: body };
  }
  const meta = OPS_META[op];
  if (meta?.form === 'field' && isObj(body)) {
    /* geo 系混层形态：对象值键 = 字段，其余键进 params；location 字符串值形态回认 location */
    if (FIELD_OBJ_OPS.has(op)) {
      const fk = Object.keys(body).find(k => isObj(body[k]))
        || Object.keys(body).find(k => k === 'location' && (typeof body[k] === 'string' || Array.isArray(body[k])));
      if (fk) {
        const { [fk]: value, ...rest } = body;
        return { ...base, field: fk, value, params: rest };
      }
      return { ...base, raw: body };
    }
    /* 字段键 = 唯一不属于具名参数集的 body 键。terms/term 等允许 boost/_name
       与字段键同层（ES 官方形态），旧实现要求恰一键，合法 DSL 被整条降级 raw。 */
    const fieldKeys = Object.keys(body).filter(k => !COMMON_PARAM_KEYS.has(k));
    if (fieldKeys.length === 1) {
      const field = fieldKeys[0];
      const inner = body[field];
      const params = Object.fromEntries(Object.entries(body).filter(([k]) => k !== field));
      if (meta.wrap === 'none') return { ...base, field, value: inner, params };   // range/terms/对象值：inner 整体即值
      const vk = meta.valueKey || (meta.wrap === 'query' ? 'query' : 'value');
      if (isObj(inner) && vk in inner) {
        const { [vk]: value, ...rest } = inner;
        /* 998：对象形态记忆——{term:{f:{value:'x'}}} 与 {term:{f:'x'}} 语义等价但文本不同，
          原样保留写回，避免树编辑把用户的显式形态洗成简写 */
        return { ...base, field, value, params: { ...params, ...rest }, expanded: true };
      }
      return { ...base, field, value: inner, params };
    }
    return { ...base, raw: body };
  }
  /* 多字段形态：{mainKey: 值, fields: […], …其余参数}（fields 键缺席 = null 记忆） */
  if (meta?.form === 'fields' && isObj(body)) {
    const { [meta.mainKey!]: value, fields, ...rest } = body;
    return { ...base, value, fields: Array.isArray(fields) ? fields.map(String) : null, params: rest, hasMain: meta.mainKey! in body };
  }
  /* 具名字段键形态：{fieldKey: '字段名', mainKey: 值, …其余}（fieldKey 非 string 进 params 原样） */
  if (meta?.form === 'named' && isObj(body)) {
    const { [meta.mainKey!]: value, ...rest } = body;
    const fv = rest[meta.fieldKey!];
    if (meta.fieldKey && typeof fv === 'string') {
      delete rest[meta.fieldKey];
      return { ...base, field: fv, value, params: rest, hasMain: meta.mainKey! in body };
    }
    return { ...base, value, params: rest, hasMain: meta.mainKey! in body };
  }
  /* 无字段形态：{mainKey: 值, …其余参数}（ids/script/wrapper） */
  if (meta?.form === 'none' && isObj(body)) {
    const { [meta.mainKey!]: value, ...rest } = body;
    return { ...base, value, params: rest, hasMain: meta.mainKey! in body };
  }
  return { ...base, raw: body };   // 非标准/未知 → 通用结构化节点
}

function parseBool(body: Record<string, unknown>): BoolNode {
  const n: BoolNode = { id: nid(), type: 'bool', children: [], params: {}, arrForm: {} };
  for (const [k, v] of Object.entries(body)) {
    if ((OCCURS as string[]).includes(k)) {
      n.arrForm[k as Occur] = Array.isArray(v);
      for (const item of Array.isArray(v) ? v : [v]) n.children.push({ occur: k as Occur, node: parseQueryNode(item) });
    } else n.params[k] = v;   // minimum_should_match 等
  }
  return n;
}

function parseWrap(op: string, body: Record<string, unknown>): QueryNode {
  const fm = WRAP_META[op];
  const fk = fm.fieldKey;
  const rawLeaf = (): QueryNode => ({ id: nid(), type: 'leaf', op, field: null, value: null, params: {}, raw: body });
  if (!fk) {
    /* 无路由字段包装（constant_score/function_score/script_score/pinned） */
    if (!isObj(body[fm.childKey])) {
      /* function_score 的 query 可省略（只用 functions 打分是官方形态） */
      if (fm.childOptional) {
        const { [fm.childKey]: _query, ...params } = body;
        return { id: nid(), type: 'wrap', op, field: null, childKey: fm.childKey, child: null, params };
      }
      return rawLeaf();
    }
    const { [fm.childKey]: query, ...params } = body;
    return { id: nid(), type: 'wrap', op, field: null, childKey: fm.childKey, child: parseQueryNode(query), params };
  }
  if (typeof body[fk] !== 'string' || !isObj(body[fm.childKey])) return rawLeaf();
  const { [fk]: field, [fm.childKey]: query, ...params } = body;
  return { id: nid(), type: 'wrap', op, field: field as string, childKey: fm.childKey, child: parseQueryNode(query), params };
}

function parseMulti(op: string, body: Record<string, unknown>): QueryNode {
  const meta = MULTI_META[op];
  const n: MultiNode = { id: nid(), type: 'multi', op, children: [], params: {}, arrForm: {} };
  for (const [k, v] of Object.entries(body)) {
    if (!meta.keys.includes(k)) { n.params[k] = v; continue; }
    const arr = Array.isArray(v);
    n.arrForm[k] = arr;   // 两态都记（对象形态 undefined 会让序列化无从还原单对象）
    for (const item of arr ? v : [v]) n.children.push({ key: k, node: parseQueryNode(item) });
  }
  return n;
}

export function parseQueryNode(q: unknown): QueryNode {
  if (!isObj(q)) return { id: nid(), type: 'leaf', op: '__raw__', field: null, value: null, params: {}, raw: q };
  const keys = Object.keys(q);
  if (keys.length !== 1) return { id: nid(), type: 'leaf', op: '__raw__', field: null, value: null, params: {}, raw: q };
  const op = keys[0];
  const body = q[op];
  if (op === 'bool' && isObj(body)) return parseBool(body);
  if (op in WRAP_META && isObj(body)) return parseWrap(op, body);
  if (op in MULTI_META && isObj(body)) return parseMulti(op, body);
  return parseLeaf(op, body);
}

/** 条件临时停用判定: 叶子直接标记,或 bool 组内全部子条件停用(含空组) */
function isDisabled(n: QueryNode): boolean {
  if (n.type === 'leaf') return n.disabled === true;
  if (n.type === 'bool') {
    /* 空 bool 是合法查询形态（常见于 should + minimum_should_match 骨架），
       不是「全部停用」——旧判定把它当停用整组删除，语义从全命中翻成零命中。 */
    if (!n.children.length) return false;
    const active = n.children.filter(c => !isDisabled(c.node));
    return active.length === 0;
  }
  return false;
}

export function serQueryNode(n: QueryNode): unknown {
  if (n.type === 'bool') {
    const out: Record<string, unknown> = { ...n.params };
    for (const o of OCCURS) {
      /* 临时停用(disabled)的子条件不参与序列化——「本次不参与」开关的语义核心 */
      const arr = n.children.filter(c => c.occur === o && !isDisabled(c.node)).map(c => serQueryNode(c.node));
      if (arr.length) out[o] = n.arrForm[o] === false && arr.length === 1 ? arr[0] : arr;
      else if (n.arrForm[o] === true) out[o] = [];   // 空数组形态原样保留
    }
    return { bool: out };
  }
  if (n.type === 'multi') {
    const meta = MULTI_META[n.op];
    const out: Record<string, unknown> = { ...n.params };
    for (const k of meta.keys) {
      const arr = n.children.filter(c => c.key === k).map(c => serQueryNode(c.node));
      if (!arr.length) {
        /* 空数组是合法且必需的（dis_max.queries / span_near.clauses 等必填键）；
           原形态记忆为数组时保键，否则 ES 收到缺键直接 400。 */
        if (n.arrForm[k]) out[k] = [];
        continue;
      }
      out[k] = n.arrForm[k] === false && arr.length === 1 ? arr[0] : arr;   // 原形态记忆优先（畸形输入无损）
    }
    return { [n.op]: out };
  }
  if (n.type === 'leaf' && n.disabled) return { match_none: {} };   // 停用条件单独出现在顶层时兜底为空结果(不污染查询)
  if (n.type === 'wrap') {
    const body: Record<string, unknown> = { ...n.params };
    const childKey = n.childKey || 'query';
    /* function_score 无 query 是官方形态：不伪造 match_all（会改变评分语义） */
    if (n.child) body[childKey] = serQueryNode(n.child);
    else if (!WRAP_META[n.op]?.childOptional) body[childKey] = { match_all: {} };
    if (n.field !== null) body[WRAP_META[n.op]?.fieldKey || 'path'] = n.field;
    return { [n.op]: body };
  }
  if (n.op === '__raw__') return n.raw;
  if (n.field === null && n.raw !== null) return { [n.op]: n.raw };   // 非标准形态 raw 权威优先
  if (n.op === 'match_all' || n.op === 'match_none') return { [n.op]: { ...n.params } };
  if (n.op === 'exists') return { exists: { field: n.field, ...n.params } };
  const meta = OPS_META[n.op];
  /* 多字段形态：{mainKey: 值, fields: […], …参数}（fields null = 原无键不写回） */
  if (meta?.form === 'fields') {
    const body: Record<string, unknown> = { ...(n.hasMain === false ? {} : { [meta.mainKey!]: n.value }), ...n.params };
    if (n.fields !== null && n.fields !== undefined) body.fields = [...n.fields];
    return { [n.op]: body };
  }
  /* 具名字段键形态：{fieldKey: 字段, mainKey: 值, …参数}（field null = 原无字段键不写回） */
  if (meta?.form === 'named') {
    const body: Record<string, unknown> = { ...(n.hasMain === false ? {} : { [meta.mainKey!]: n.value }), ...n.params };
    if (n.field !== null && n.field !== undefined) body[meta.fieldKey!] = n.field;
    return { [n.op]: body };
  }
  /* 无字段形态：{mainKey: 值, …参数}（hasMain=false = 原体无主值键，不写 undefined 占位） */
  if (meta?.form === 'none') {
    const body: Record<string, unknown> = { ...(n.hasMain === false ? {} : { [meta.mainKey!]: n.value }), ...n.params };
    return { [n.op]: body };
  }
  if (n.field === null) return { [n.op]: n.raw };   // 兜底：无字段的非标准富形态（理论不可达，保守还原）
  if (meta?.wrap === 'none') return { [n.op]: { ...n.params, [n.field]: n.value } };   // geo_distance 混层：散参数合回 body（terms/range params 恒空零变）
  const vk = meta?.valueKey || (meta?.wrap === 'query' ? 'query' : 'value');
  /* 998：expanded 记忆优先——无参数也写回 {value|query: …} 对象形态（原 DSL 文本不变） */
  const inner = Object.keys(n.params).length || n.expanded ? { [vk]: n.value, ...n.params } : n.value;
  return { [n.op]: { [n.field]: inner } };
}

export function parseTree(dsl: unknown): ParseResult {
  if (!isObj(dsl)) return { ok: false, reason: '根必须是 JSON 对象' };
  const tree: QueryTree = emptyTree();
  for (const [k, v] of Object.entries(dsl)) {
    if (k === 'query') tree.root = parseQueryNode(v);
    else if (k === 'size') tree.size = v;
    else if (k === 'from') tree.from = v;
    else if (k === 'sort') { if (Array.isArray(v)) tree.sort = v.map(parseSortItem); else tree.extras[k] = v; }
    else if (k === '_source') tree.source = parseSource(v);
    else if (k === 'highlight') { if (isObj(v)) tree.highlight = parseHighlight(v); else tree.extras[k] = v; }
    else if (k === 'aggs' || k === 'aggregations') { if (isObj(v)) { tree.aggs = parseAggs(v); tree.aggKey = k; } else tree.extras[k] = v; }
    /* 987：post_filter 全值走 parseQueryNode（非对象落 __raw__ 叶无损）；collapse/knn
     结构化形态不合法（field 非 string/非对象/数组）落 extras 零丢失 */
    else if (k === 'post_filter') tree.postFilter = parseQueryNode(v);
    else if (k === 'collapse') { const c = parseCollapse(v); if (c) tree.collapse = c; else tree.extras[k] = v; }
    /* 998：knn 支持 对象 / 数组（多向量混合检索）两形态；数组元素任一非法则整键落 extras 零丢失 */
    else if (k === 'knn') {
      if (Array.isArray(v)) {
        const items = v.map(x => parseKnn(x));
        if (items.every((x): x is KnnSpec => !!x)) {
          tree.knn = items[0] ?? null;
          tree.knnExtra = items.slice(1);
          tree.knnArray = true;
        } else tree.extras[k] = v;
      } else {
        const n = parseKnn(v);
        if (n) tree.knn = n; else tree.extras[k] = v;
      }
    }
    /* 989：suggest 项 body 非对象整键落 extras（零丢失），合法对象走结构化分账 */
    else if (k === 'suggest') { const s = parseSuggest(v); if (s) tree.suggest = s; else tree.extras[k] = v; }
    /* 991/998：rescore 单对象结构化；数组多段形态逐段结构化（任一非法整键 extras 零丢失） */
    else if (k === 'rescore') {
      if (Array.isArray(v)) {
        const items = v.map(x => parseRescore(x));
        if (items.length && items.every((x): x is RescoreSpec => !!x)) {
          tree.rescore = items[0];
          tree.rescoreExtra = items.slice(1);
          tree.rescoreArray = true;
        } else tree.extras[k] = v;
      } else {
        const rs = parseRescore(v);
        if (rs) tree.rescore = rs; else tree.extras[k] = v;
      }
    }
    /* 996：命名键+体 同构双键；项 body 非对象整键落 extras 零丢失 */
    else if (k === 'script_fields') { const sf = parseNamed(v); if (sf) tree.scriptFields = sf; else tree.extras[k] = v; }
    else if (k === 'runtime_mappings') { const rm = parseNamed(v); if (rm) tree.runtimeMappings = rm; else tree.extras[k] = v; }
    /* 1000：retriever 检索器（8.14+ 检索面）；未注册变体/畸形体整键落 extras 零丢失 */
    else if (k === 'retriever') { const rv = parseRetriever(v); if (rv) tree.retriever = rv; else tree.extras[k] = v; }
    /* 998：查询体参数一等分账（18 键，控件语义见 queryBodyParams）——任何值原样入账，
       不再落 extras 键值表；未注册键维持 extras 零丢失 */
    else if (SEARCH_PARAM_KEYS.has(k)) tree.searchParams[k] = v;
    else tree.extras[k] = v;
  }
  return { ok: true, tree };
}

function parseCollapse(v: unknown): CollapseSpec | null {
  if (!isObj(v) || typeof v.field !== 'string') return null;
  const { field, ...params } = v;
  return { field, params };
}
function parseNamed(v: unknown): { items: NamedSpecItem[] } | null {
  if (!isObj(v)) return null;
  const items: NamedSpecItem[] = [];
  for (const [name, body] of Object.entries(v)) {
    if (!isObj(body)) return null;
    items.push({ name, body });
  }
  return { items };
}
function parseRescore(v: unknown): RescoreSpec | null {
  if (!isObj(v) || !isObj(v.query)) return null;
  const { window_size, query, ...outerRest } = v;
  const { rescore_query, ...params } = query as Record<string, unknown>;
  if (Object.keys(outerRest).length) return null;   // query 外多余键 = 非标准形态，整键 extras 不猜
  return { windowSize: window_size, hasWindowSize: 'window_size' in v, rescoreQuery: parseQueryNode(rescore_query), params };
}
function parseSuggest(v: unknown): SuggestSpec | null {
  if (!isObj(v)) return null;
  const out: SuggestSpec = { items: [], globalText: null, hasGlobalText: false };
  for (const [name, body] of Object.entries(v)) {
    if (name === 'text') { out.globalText = body; out.hasGlobalText = true; continue; }
    if (!isObj(body)) return null;
    const { text, ...rest } = body;
    out.items.push({ name, text, hasText: 'text' in body, rest });
  }
  return out;
}
function parseKnn(v: unknown): KnnSpec | null {
  if (!isObj(v)) return null;
  const { field, query_vector, ...params } = v;
  if (field !== undefined && typeof field !== 'string') return null;
  return { field: typeof field === 'string' ? field : null, vector: query_vector, params, hasVector: 'query_vector' in v };
}

export function serializeTree(t: QueryTree): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (t.root) out.query = serQueryNode(t.root);
  if (t.size !== undefined) out.size = t.size;
  if (t.from !== undefined) out.from = t.from;
  if (t.sort !== null) out.sort = t.sort.map(serSortItem);
  if (t.source !== null) out._source = serSource(t.source);
  if (t.postFilter) out.post_filter = serQueryNode(t.postFilter);
  if (t.collapse) out.collapse = { field: t.collapse.field, ...t.collapse.params };
  /* 998：knn 两形态（对象/数组）——数组形态下空列表也保键（knn: [] 原样写回） */
  if (t.knn || (t.knnArray && t.knn === null)) {
    if (t.knnArray) {
      out.knn = [...(t.knn ? [t.knn] : []), ...(t.knnExtra || [])].map(serKnn);
    } else if (t.knn) out.knn = serKnn(t.knn);
  }
  if (t.suggest) {
    const s: Record<string, unknown> = {};
    if (t.suggest.hasGlobalText) s.text = t.suggest.globalText;
    for (const it of t.suggest.items) {
      const body: Record<string, unknown> = it.hasText ? { text: it.text } : {};
      Object.assign(body, it.rest);
      s[it.name] = body;
    }
    out.suggest = s;
  }
  if (t.scriptFields) out.script_fields = serNamed(t.scriptFields.items);
  if (t.runtimeMappings) out.runtime_mappings = serNamed(t.runtimeMappings.items);
  /* 998：rescore 两形态（单对象/数组多段） */
  if (t.rescore || (t.rescoreArray && t.rescore === null)) {
    if (t.rescoreArray) {
      out.rescore = [...(t.rescore ? [t.rescore] : []), ...(t.rescoreExtra || [])].map(serRescore);
    } else if (t.rescore) out.rescore = serRescore(t.rescore);
  }
  /* 1000：retriever 检索器 */
  if (t.retriever) out.retriever = serRetriever(t.retriever);
  if (t.aggs !== null) out[t.aggKey || 'aggs'] = serAggs(t.aggs);
  if (t.highlight !== null) out.highlight = serHighlight(t.highlight);
  /* 998：查询体参数按注册序写出（DSL 文本稳定）；未注册键（历史草稿/未来扩展）按插入序殿后 */
  for (const k of SEARCH_PARAM_ORDER) {
    if (Object.prototype.hasOwnProperty.call(t.searchParams || {}, k)) out[k] = t.searchParams[k];
  }
  for (const [k, v] of Object.entries(t.searchParams || {})) {
    if (!SEARCH_PARAM_KEYS.has(k) && !Object.prototype.hasOwnProperty.call(out, k)) out[k] = v;
  }
  for (const [k, v] of Object.entries(t.extras)) if (!Object.prototype.hasOwnProperty.call(out, k)) out[k] = v;
  return out;
}

function serNamed(items: NamedSpecItem[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const it of items) out[it.name] = { ...it.body };
  return out;
}

function serKnn(k: KnnSpec): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  if (k.field !== null) b.field = k.field;
  if (k.hasVector) b.query_vector = k.vector;
  Object.assign(b, k.params);
  return b;
}
function serRescore(rs: RescoreSpec): Record<string, unknown> {
  const q: Record<string, unknown> = { rescore_query: rs.rescoreQuery ? serQueryNode(rs.rescoreQuery) : { match_all: {} } };
  Object.assign(q, rs.params);
  const out: Record<string, unknown> = { query: q };
  if (rs.hasWindowSize) out.window_size = rs.windowSize;
  return out;
}

/* ═══ 1000：retriever 检索器（8.14+ 顶层检索面）═══
   六变体递归结构。畸形/未注册变体整键落 extras（调用方 parseTree 负责），
   本层只保证「解析成功 ⇒ 往返一致」；半成品态（如 rule 无回退子检索器）合法保留。 */
export interface RetrieverNode {
  id: string;
  op: string;
  query: QueryNode | null;           /* bm25 内嵌查询树（MiniTreeEditor 编辑） */
  child: RetrieverNode | null;       /* 单子变体：text_similarity_reranker 重排源 / rule 回退 */
  children: RetrieverNode[];         /* 数组变体：rrf.retrievers / linear.retrieve */
  childKeys: Record<string, Record<string, unknown>>;   /* linear 每子项伴随键（weight…），按子 id 记账 */
  field: string | null;              /* knn / tsr 字段（null = 键缺席） */
  value: unknown;                    /* knn.query_vector 主值 */
  hasValue: boolean;                 /* 向量键在场记忆（false = 原 DSL 无此键） */
  params: Record<string, unknown>;   /* 其余参数（k/rank_constant/text/ruleset_id/match_criteria…） */
}

export function parseRetriever(v: unknown): RetrieverNode | null {
  if (!isObj(v)) return null;
  const keys = Object.keys(v);
  if (keys.length !== 1) return null;
  const op = keys[0];
  const meta = RETRIEVER_META[op];
  const body = v[op];
  if (!meta || !isObj(body)) return null;
  const base = (): RetrieverNode => ({ id: nid(), op, query: null, child: null, children: [], childKeys: {}, field: null, value: undefined, hasValue: false, params: {} });
  if (meta.kind === 'query') {
    if (!isObj(body.query)) return null;   /* bm25 必带查询体，缺席=畸形整键 extras */
    const { query, ...rest } = body;
    return { ...base(), query: parseQueryNode(query), params: rest };
  }
  if (meta.kind === 'flat') {
    const { field, query_vector, ...rest } = body;
    if (field !== undefined && typeof field !== 'string') return null;
    return { ...base(), field: typeof field === 'string' ? field : null,
      value: query_vector, hasValue: Object.prototype.hasOwnProperty.call(body, 'query_vector'), params: rest };
  }
  if (meta.kind === 'list') {
    const list = body[meta.listKey!];
    if (!Array.isArray(list)) return null;
    const children: RetrieverNode[] = [];
    const childKeys: Record<string, Record<string, unknown>> = {};
    for (const item of list) {
      if (meta.wrapped) {
        /* linear：子项是 {retriever: {...}, weight…} 包裹——伴随键按子 id 记账，序列化时回包 */
        if (!isObj(item) || !isObj(item.retriever)) return null;
        const { retriever, ...rest } = item;
        const c = parseRetriever(retriever);
        if (!c) return null;
        children.push(c); childKeys[c.id] = rest;
      } else {
        const c = parseRetriever(item);
        if (!c) return null;
        children.push(c);
      }
    }
    const { [meta.listKey!]: _list, ...rest } = body;
    return { ...base(), children, childKeys, params: rest };
  }
  /* child 变体：tsr/pinned/diversify/rescorer 召回源 / rule 回退。
     子检索器缺席仅 rule 合法（按 match_criteria 独立路由）；其余变体缺源=畸形整键 extras。 */
  const childKey = meta.childKey || 'retriever';
  const { [childKey]: retriever, field, ...rest } = body;
  if (retriever === undefined && !meta.childOptional) return null;
  if (retriever !== undefined && !isObj(retriever)) return null;
  const c = retriever === undefined ? null : parseRetriever(retriever);
  if (retriever !== undefined && !c) return null;
  if (field !== undefined && typeof field !== 'string') return null;
  return { ...base(), child: c, field: typeof field === 'string' ? field : null, params: rest };
}

export function serRetriever(n: RetrieverNode): Record<string, unknown> {
  const meta = RETRIEVER_META[n.op];
  if (!meta) return {};   // 理论不可达（解析器不产未注册变体）
  if (meta.kind === 'query') {
    return { [n.op]: { ...n.params, query: n.query ? serQueryNode(n.query) : { match_all: {} } } };
  }
  if (meta.kind === 'flat') {
    const b: Record<string, unknown> = { ...n.params };
    if (n.field !== null) b.field = n.field;
    if (n.hasValue) b.query_vector = n.value;
    return { [n.op]: b };
  }
  if (meta.kind === 'list') {
    const arr = n.children.map(c => meta.wrapped
      ? { retriever: serRetriever(c), ...n.childKeys[c.id] }
      : serRetriever(c));
    return { [n.op]: { ...n.params, [meta.listKey!]: arr } };
  }
  const b: Record<string, unknown> = { ...n.params };
  if (n.child) b[meta.childKey || 'retriever'] = serRetriever(n.child);
  if (n.field !== null) b.field = n.field;
  return { [n.op]: b };
}

/* ---- sort：form 记忆原形态；编辑加参数后自然升级 full ---- */
function parseSortItem(v: unknown): SortItem {
  const base: SortItem = { id: nid(), field: '', form: 'full', params: {} };
  if (typeof v === 'string') return { ...base, field: v, form: 'str' };
  if (isObj(v) && Object.keys(v).length >= 1) {
    /* 998：多键排序项（{a:'asc', b:'desc'} 合并写法）整项原样保真——
       旧实现只取首键 + 首键 inner，其余键被静默丢弃（往返丢数据） */
    if (Object.keys(v).length > 1) return { ...base, form: 'multi', params: { ...v } };
    const field = Object.keys(v)[0];
    const inner = v[field];
    if (typeof inner === 'string') return { ...base, field, form: 'short', params: { order: inner } };
    if (isObj(inner)) return { ...base, field, form: 'full', params: { ...inner } };
    return { ...base, field, form: 'full', params: { value: inner } };
  }
  return { ...base, field: String(v), form: 'full', params: { value: v } };
}
function serSortItem(s: SortItem): unknown {
  if (s.form === 'multi') return { ...s.params };   // 998：多键项原样写回
  const keys = Object.keys(s.params);
  if (s.form === 'str' && keys.length === 0) return s.field;
  if (s.form === 'short' && keys.length === 1 && 'order' in s.params) return { [s.field]: s.params.order };
  return { [s.field]: { ...s.params } };
}

/* ---- _source ---- */
const strArr = (v: unknown): string[] => Array.isArray(v) ? v.map(String) : [];
function parseSource(v: unknown): SourceSpec {
  const base: SourceSpec = { mode: 'all', fields: [], includes: [], excludes: [] };
  if (v === true) return base;
  if (v === false) return { ...base, mode: 'none' };
  if (typeof v === 'string') return { ...base, mode: 'one', fields: [v] };
  if (Array.isArray(v)) return { ...base, mode: 'list', fields: v.map(String) };
  if (isObj(v)) {
    const extra: Record<string, unknown> = { ...v };
    delete extra.includes; delete extra.excludes;
    /* 非数组 includes/excludes 是合法扩展形态（如 includes:"obj.*"）：
       原值留在 extra，序列化时原样写回，不再静默变成 [] 丢数据。 */
    if ('includes' in v && !Array.isArray(v.includes)) extra.includes = v.includes;
    if ('excludes' in v && !Array.isArray(v.excludes)) extra.excludes = v.excludes;
    return {
      ...base, mode: 'pattern', includes: strArr(v.includes), excludes: strArr(v.excludes),
      hasIncludes: 'includes' in v, hasExcludes: 'excludes' in v,
      ...(Object.keys(extra).length ? { extra } : {}),
    };
  }
  return base;
}
function serSource(s: SourceSpec): unknown {
  if (s.mode === 'all') return true;
  if (s.mode === 'none') return false;
  if (s.mode === 'one') return s.fields[0] ?? '';
  if (s.mode === 'list') return [...s.fields];
  const out: Record<string, unknown> = { ...(s.extra || {}) };
  if (Array.isArray(s.extra?.includes)) delete out.includes;
  if (Array.isArray(s.extra?.excludes)) delete out.excludes;
  if (!('includes' in out) && (s.hasIncludes ?? (s.includes.length > 0))) out.includes = [...s.includes];
  if (!('excludes' in out) && (s.hasExcludes ?? (s.excludes.length > 0))) out.excludes = [...s.excludes];
  return out;   // 无 presence 键时回落 length 判断（UI 新建路径）；全空 pattern → {} 往返一致
}

/* ---- highlight ---- */
function parseHighlight(v: Record<string, unknown>): HighlightSpec {
  const h: HighlightSpec = { fields: [], params: {} };
  for (const [k, val] of Object.entries(v)) {
    if (k === 'fields' && isObj(val)) {
      h.fields = Object.entries(val).map(([name, p]) => ({ name, params: isObj(p) ? { ...p } : {} }));
      h.hasFields = true;
    } else h.params[k] = val;
  }
  return h;
}
function serHighlight(h: HighlightSpec): unknown {
  const out: Record<string, unknown> = { ...h.params };
  /* fields 键缺席形态（只配 pre_tags 等全局参数）不注入空对象——
     old impl 恒补 fields:{}，把合法请求改写成不同文本。 */
  if (h.hasFields ?? (h.fields.length > 0)) {
    const fields: Record<string, unknown> = {};
    for (const f of h.fields) fields[f.name] = { ...f.params };
    out.fields = fields;
  }
  return out;
}

/* ---- aggs：op=首个非 aggs/aggregations/meta 键；aggKey 记忆子聚合键名 ---- */
function parseAggs(v: unknown): AggNode[] {
  if (!isObj(v)) return [];
  return Object.entries(v).map(([name, body]) => parseAggNode(name, body));
}
function parseAggNode(name: string, body: unknown): AggNode {
  const n: AggNode = { id: nid(), name, op: '', body: {}, children: [], meta: {}, aggKey: 'aggs' };
  if (!isObj(body)) { n.body = body; return n; }
  const opKey = Object.keys(body).find(k => k !== 'aggs' && k !== 'aggregations' && k !== 'meta');
  if (opKey) { n.op = opKey; n.body = body[opKey]; }
  for (const k of ['aggs', 'aggregations'] as const) {
    if (isObj(body[k])) { n.aggKey = k; n.children = parseAggs(body[k]); n.hasKids = true; }
  }
  if (isObj(body.meta)) { n.meta = body.meta as Record<string, unknown>; n.hasMeta = true; }
  return n;
}
function serAggs(list: AggNode[]): Record<string, unknown> {  const out: Record<string, unknown> = {};
  for (const n of list) {
    const body: Record<string, unknown> = {};
    if (n.op) body[n.op] = n.body;
    if (n.hasKids ?? n.children.length) body[n.aggKey || 'aggs'] = serAggs(n.children);
    if (n.hasMeta ?? Object.keys(n.meta).length) body.meta = n.meta;
    out[n.name] = body;
  }
  return out;
}

/* 1351：单个聚合节点的官方形态（与整棵 aggs 走同一序列化器——复制出去贴回 DSL 必须能对上）。
   命名键包一层 `{name: body}`，和用户写进请求体的 aggregates 片段同形。 */
export function serAggNode(n: AggNode): Record<string, unknown> {
  return serAggs([n]);
}

/* ================= 树不可变操作（组件层唯一编辑入口） =================
 全部返回新树、不改入参。删除语义：root 命中回退 match_all（root 永不缺失）；
 bool 子节点直接移除；wrap 子节点置 null（序列化兜底 match_all）。 */

export function updateNodeById(root: QueryNode, id: string, fn: (n: QueryNode) => QueryNode): QueryNode {
  if (root.id === id) return fn(root);
  if (root.type === 'bool') {
    return { ...root, children: root.children.map(c => ({ occur: c.occur, node: updateNodeById(c.node, id, fn) })) };
  }
  if (root.type === 'wrap' && root.child) return { ...root, child: updateNodeById(root.child, id, fn) };
  if (root.type === 'multi') {
    return { ...root, children: root.children.map(c => ({ key: c.key, node: updateNodeById(c.node, id, fn) })) };
  }
  return root;
}

/* ═══ 1045：未填值条件判定（构建器头部计数与执行行提示共用，纯函数） ═══
   只算「需要值但值为空」的启用叶子；exists/match_all/match_none 天然无值。
   空对象（range 四格全空）与空数组（terms 无项）也算未填。 */
export function isLeafValueMissing(v: unknown): boolean {
  if (v == null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length === 0;
  return false;
}
/* 1118：rank_feature 的主值 boost 是可选的（字段本身即查询），不能按「未填值」报警；
 exists/match_all/match_none 同属天然无值。 */
const NO_VALUE_OPS: ReadonlySet<string> = new Set(['exists', 'match_all', 'match_none', 'rank_feature']);
export function countUnfilledLeaves(root: QueryNode | null): number {
  let n = 0;
  const walk = (x: QueryNode) => {
    if (x.type === 'bool') x.children.forEach(c => walk(c.node));
    else if (x.type === 'wrap') { if (x.child) walk(x.child); }
    else if (x.type === 'multi') x.children.forEach(c => walk(c.node));
    else if (!x.disabled && !NO_VALUE_OPS.has(x.op) && isLeafValueMissing(x.value)) n++;
  };
  if (root) walk(root);
  return n;
}
/* ═══ 1049：多选批量操作（纯函数）═══
   选中节点即对其整棵子树生效；祖先选中时不再下钻（调用方递归遇到选中即停），
   因此父子同选不会重复操作。删除保留父容器结构（空组由 setRoot 归一）。 */
function markLeaves(n: QueryNode, disabled: boolean): QueryNode {
  if (n.type === 'bool') return { ...n, children: n.children.map(c => ({ occur: c.occur, node: markLeaves(c.node, disabled) })) };
  if (n.type === 'wrap') return { ...n, child: n.child ? markLeaves(n.child, disabled) : null };
  if (n.type === 'multi') return { ...n, children: n.children.map(c => ({ key: c.key, node: markLeaves(c.node, disabled) })) };
  return { ...n, disabled };
}
export function setDisabledForIds(root: QueryNode, ids: ReadonlySet<string>, disabled: boolean): QueryNode {
  if (!ids.size) return root;
  if (ids.has(root.id)) return markLeaves(root, disabled);
  if (root.type === 'bool') {
    return { ...root, children: root.children.map(c => ({ occur: c.occur, node: setDisabledForIds(c.node, ids, disabled) })) };
  }
  if (root.type === 'wrap') return { ...root, child: root.child ? setDisabledForIds(root.child, ids, disabled) : null };
  if (root.type === 'multi') {
    return { ...root, children: root.children.map(c => ({ key: c.key, node: setDisabledForIds(c.node, ids, disabled) })) };
  }
  return root;
}
export function removeNodesByIds(root: QueryNode, ids: ReadonlySet<string>): QueryNode {
  if (!ids.size) return root;
  if (ids.has(root.id)) return matchAllLeafNode();
  if (root.type === 'bool') {
    return {
      ...root,
      children: root.children.filter(c => !ids.has(c.node.id))
        .map(c => ({ occur: c.occur, node: removeNodesByIds(c.node, ids) })),
    };
  }
  if (root.type === 'wrap') {
    if (!root.child) return root;
    return { ...root, child: ids.has(root.child.id) ? null : removeNodesByIds(root.child, ids) };
  }
  if (root.type === 'multi') {
    return {
      ...root,
      children: root.children.filter(c => !ids.has(c.node.id))
        .map(c => ({ key: c.key, node: removeNodesByIds(c.node, ids) })),
    };
  }
  return root;
}

/* ═══ 1051：多选批量复制 ═══
   与单行「复制」同语义：bool 子句在各自 occur 分区原位后插副本，父组选中即整棵复制，
   父子同选只复制父级（不下钻）。根选中沿用单行语义包 bool.must 两份。
   wrap 唯一槽与 multi 结构化槽（span/dis_max…）不就地复制——换槽会改语义。 */
export function duplicateNodesByIds(root: QueryNode, ids: ReadonlySet<string>): QueryNode {
  if (!ids.size) return root;
  if (ids.has(root.id)) {
    const g: BoolNode = {
      id: nid(), type: 'bool',
      children: [{ occur: 'must', node: root }, { occur: 'must', node: cloneNode(root) }],
      params: {}, arrForm: { must: true },
    };
    return g;
  }
  const walk = (n: QueryNode): QueryNode => {
    if (n.type === 'bool') {
      const children: BoolNode['children'] = [];
      for (const c of n.children) {
        if (ids.has(c.node.id)) {
          children.push({ occur: c.occur, node: c.node }, { occur: c.occur, node: cloneNode(c.node) });
        } else {
          children.push({ occur: c.occur, node: walk(c.node) });
        }
      }
      return { ...n, children };
    }
    if (n.type === 'wrap') return n.child ? { ...n, child: walk(n.child) } : n;
    if (n.type === 'multi') return { ...n, children: n.children.map(c => ({ key: c.key, node: walk(c.node) })) };
    return n;
  };
  return walk(root);
}

/* ═══ 1052：多选包成组（括号语义，往返无损） ═══
   仅接受「同一 bool 父组、同一 occur 分区」的兄弟条件：组内孩子沿用原 occur，
   组按原分区插回第一个被选位置。
   无损边界：must/filter 直接等价；should 仅限父组未设 minimum_should_match
   （包组后 should 子句数量变少，msm 口径会变）；must_not 兄弟是逐个取反，
   再包一层会变成双重否定（NOT(NOT a AND NOT b) = a OR b），一律禁用。
   wrap 唯一槽与 multi 结构化槽同理不参与。 */
interface GroupSlot { parent: BoolNode; occur: Occur; index: number; node: QueryNode }
function collectGroupSlots(root: QueryNode, ids: ReadonlySet<string>): GroupSlot[] | null {
  if (!ids.size) return null;
  const slots: GroupSlot[] = [];
  let ineligible = false;
  const walk = (n: QueryNode) => {
    if (n.type === 'bool') {
      n.children.forEach((c, i) => {
        if (ids.has(c.node.id)) slots.push({ parent: n, occur: c.occur, index: i, node: c.node });
        else walk(c.node);
      });
      return;
    }
    if (n.type === 'wrap') {
      if (!n.child) return;
      if (ids.has(n.child.id)) ineligible = true;
      else walk(n.child);
      return;
    }
    if (n.type === 'multi') {
      for (const c of n.children) {
        if (ids.has(c.node.id)) ineligible = true;
        else walk(c.node);
      }
    }
  };
  walk(root);
  if (ineligible || slots.length < 2) return null;
  const { parent, occur } = slots[0];
  if (!slots.every(s => s.parent.id === parent.id && s.occur === occur)) return null;
  if (occur === 'must_not') return null;
  if (occur === 'should' && ('minimum_should_match' in parent.params || 'MINIMUM_SHOULD_MATCH' in parent.params)) return null;
  return slots;
}
export function canGroupByIds(root: QueryNode | null, ids: ReadonlySet<string>): boolean {
  if (!root) return false;
  if (ids.has(root.id)) return root.type !== 'bool';
  return collectGroupSlots(root, ids) !== null;
}
export function groupNodesByIds(root: QueryNode, ids: ReadonlySet<string>): QueryNode {
  if (ids.has(root.id)) return root.type === 'bool' ? root : wrapInBool(root, root.id);
  const slots = collectGroupSlots(root, ids);
  if (!slots) return root;
  const { parent, occur } = slots[0];
  const group: BoolNode = {
    id: nid(), type: 'bool',
    children: slots.map(s => ({ occur, node: s.node })),
    params: {}, arrForm: { [occur]: true },
  };
  const first = Math.min(...slots.map(s => s.index));
  return updateNodeById(root, parent.id, n => {
    if (n.type !== 'bool') return n;
    const sel = new Set(slots.map(s => s.node.id));
    const rest = n.children.filter(c => !sel.has(c.node.id));
    const pos = n.children.slice(0, first).filter(c => !sel.has(c.node.id)).length;
    return { ...n, children: [...rest.slice(0, pos), { occur, node: group }, ...rest.slice(pos)] };
  });
}

export function firstUnfilledLeafId(root: QueryNode | null): string | null {
  let found: string | null = null;
  const walk = (x: QueryNode) => {
    if (found) return;
    if (x.type === 'bool') x.children.forEach(c => walk(c.node));
    else if (x.type === 'wrap') { if (x.child) walk(x.child); }
    else if (x.type === 'multi') x.children.forEach(c => walk(c.node));
    else if (!x.disabled && !NO_VALUE_OPS.has(x.op) && isLeafValueMissing(x.value)) found = x.id;
  };
  if (root) walk(root);
  return found;
}

export function findNode(root: QueryNode, id: string): QueryNode | null {
  if (root.id === id) return root;
  if (root.type === 'bool') {
    for (const c of root.children) { const r = findNode(c.node, id); if (r) return r; }
    return null;
  }
  if (root.type === 'wrap' && root.child) return findNode(root.child, id);
  if (root.type === 'multi') {
    for (const c of root.children) { const r = findNode(c.node, id); if (r) return r; }
    return null;
  }
  return null;
}

/* ancestor 的严格后代里是否含 id（不含自身）——拖拽防环用 */
function isDescendant(ancestor: QueryNode, id: string): boolean {
  const kids: QueryNode[] = ancestor.type === 'bool' ? ancestor.children.map(c => c.node)
    : ancestor.type === 'wrap' && ancestor.child ? [ancestor.child]
    : ancestor.type === 'multi' ? ancestor.children.map(c => c.node) : [];
  return kids.some(k => k.id === id || isDescendant(k, id));
}

/* 编辑致空分区连同 arrForm 标记一并消失（防序列化残留空数组键） */
function pruneArrForm(children: BoolNode['children'], arrForm: BoolNode['arrForm']): BoolNode['arrForm'] {
  const out = { ...arrForm };
  for (const o of OCCURS) if (out[o] !== undefined && !children.some(c => c.occur === o)) delete out[o];
  return out;
}

export function removeNodeById(root: QueryNode, id: string): QueryNode {
  if (root.id === id) return { id: nid(), type: 'leaf', op: 'match_all', field: null, value: {}, params: {}, raw: null };
  if (root.type === 'bool') {
    const children: BoolNode['children'] = [];
    for (const c of root.children) {
      if (c.node.id === id) continue;
      children.push({ occur: c.occur, node: removeNodeById(c.node, id) });
    }
    return { ...root, children, arrForm: pruneArrForm(children, root.arrForm) };
  }
  if (root.type === 'wrap' && root.child) {
    if (root.child.id === id) return { ...root, child: null };
    return { ...root, child: removeNodeById(root.child, id) };
  }
  if (root.type === 'multi') {
    const children = root.children.filter(c => c.node.id !== id).map(c => ({ key: c.key, node: removeNodeById(c.node, id) }));
    return { ...root, children };
  }
  return root;
}

export function insertChild(root: QueryNode, boolId: string, occur: Occur, node: QueryNode, anchorId?: string | null): QueryNode {
  return updateNodeById(root, boolId, n => {
    if (n.type !== 'bool') return n;
    if (!anchorId) return { ...n, children: [...n.children, { occur, node }] };
    /* 991 行级插入：插到同分区 anchorId 行之后；anchor 缺席/不同分区/自身 = 回落尾部追加 */
    const idx = n.children.findIndex(c => c.node.id === anchorId);
    if (idx < 0 || n.children[idx].occur !== occur || anchorId === node.id) {
      return { ...n, children: [...n.children, { occur, node }] };
    }
    const children = [...n.children.slice(0, idx + 1), { occur, node }, ...n.children.slice(idx + 1)];
    return { ...n, children };
  });
}

/* 拖拽移动：dragId → targetBoolId 的 occur 分区（anchorId 缺省 = 分区末尾；
 991 起可传同分区某子句 id = 插到该行之后，行级拖拽落点）。
 移到自身/后代、root 被拖、target 非 bool 时原样返回。 */
export function moveNode(root: QueryNode, dragId: string, targetBoolId: string, occur: Occur, anchorId?: string | null): QueryNode {
  if (dragId === targetBoolId || root.id === dragId) return root;
  const dragPre = findNode(root, dragId);
  if (anchorId && dragPre && (anchorId === dragId || isDescendant(dragPre, anchorId))) return root;
  const drag = findNode(root, dragId);
  const target = findNode(root, targetBoolId);
  if (!drag || target?.type !== 'bool' || isDescendant(drag, targetBoolId)) return root;
  const mv = insertChild(removeNodeById(root, dragId), targetBoolId, occur, drag, anchorId);
  return mv;
}

/* 包成 bool 组：{ must: [node] }（数组形态） */
export function wrapInBool(root: QueryNode, id: string): QueryNode {
  return updateNodeById(root, id, n => ({
    id: nid(), type: 'bool', children: [{ occur: 'must', node: n }], params: {}, arrForm: { must: true },
  }));
}

/* 解散 bool-in-bool：子 bool 无 params 才允许（有参数解散会静默丢参数，UI 也不给入口）。
 子句按各自 occur 并入父组原位置；父不是 bool（root/wrap）时原样返回。 */
export function dissolveBool(root: QueryNode, id: string): QueryNode {
  if (root.type === 'bool') {
    const idx = root.children.findIndex(c => c.node.id === id);
    if (idx >= 0) {
      const target = root.children[idx].node;
      if (target.type !== 'bool' || Object.keys(target.params).length) return root;
      const children = [...root.children.slice(0, idx), ...target.children, ...root.children.slice(idx + 1)];
      return { ...root, children, arrForm: pruneArrForm(children, root.arrForm) };
    }
    return { ...root, children: root.children.map(c => ({ occur: c.occur, node: dissolveBool(c.node, id) })) };
  }
  if (root.type === 'wrap' && root.child) return { ...root, child: dissolveBool(root.child, id) };
  return root;
}

/* ═══ 987：复制/原位后插（QueryTreePane 与 MiniTreeEditor 共用的树 owner 语义） ═══
 深拷贝 + id 全部重新 nid()（params/raw/value 均为 JSON 形态，JSON 深拷贝无损）；
 原位后插：bool 同 occur 分区 / multi 同 key 分区，root 命中返回 null（调用方
 自行决定包组语义——QueryTreePane 包 bool.must 双份，MiniTreeEditor 同式）。 */
export function cloneNode(n: QueryNode): QueryNode {
  const fresh = JSON.parse(JSON.stringify(n)) as QueryNode;
  const reid = (x: QueryNode): QueryNode => {
    const id = nid();
    if (x.type === 'bool') return { ...x, id, children: x.children.map(c => ({ occur: c.occur, node: reid(c.node) })) };
    if (x.type === 'wrap') return { ...x, id, child: x.child ? reid(x.child) : null };
    if (x.type === 'multi') return { ...x, id, children: x.children.map(c => ({ key: c.key, node: reid(c.node) })) };
    return { ...x, id };
  };
  return reid(fresh);
}

export function insertAfter(root: QueryNode, id: string): QueryNode {
  if (root.type === 'bool') {
    const idx = root.children.findIndex(c => c.node.id === id);
    if (idx >= 0) {
      const src = root.children[idx];
      const children = [...root.children.slice(0, idx + 1), { occur: src.occur, node: cloneNode(src.node) }, ...root.children.slice(idx + 1)];
      return { ...root, children };
    }
    return { ...root, children: root.children.map(c => ({ occur: c.occur, node: insertAfter(c.node, id) })) };
  }
  if (root.type === 'wrap' && root.child) return { ...root, child: insertAfter(root.child, id) };
  if (root.type === 'multi') {
    const idx = root.children.findIndex(c => c.node.id === id);
    if (idx >= 0) {
      const src = root.children[idx];
      const children = [...root.children.slice(0, idx + 1), { key: src.key, node: cloneNode(src.node) }, ...root.children.slice(idx + 1)];
      return { ...root, children };
    }
    return { ...root, children: root.children.map(c => ({ key: c.key, node: insertAfter(c.node, id) })) };
  }
  return root;
}

/** 1067：同一容器内键盘移动（Alt+↑/↓）——只在与当前节点同 occur 分区（multi 同 key 分区）
    的相邻兄弟间交换，跨分区/根节点/边界原样返回。组按整棵子树移动。 */
export function moveSibling(root: QueryNode, id: string, delta: -1 | 1): QueryNode {
  if (!delta || root.id === id) return root;
  if (root.type === 'bool') {
    const idx = root.children.findIndex(c => c.node.id === id);
    if (idx >= 0) {
      const occur = root.children[idx].occur;
      let swap = -1;
      for (let i = idx + delta; i >= 0 && i < root.children.length; i += delta) {
        if (root.children[i].occur === occur) { swap = i; break; }
      }
      if (swap < 0) return root;
      const children = [...root.children];
      [children[idx], children[swap]] = [children[swap], children[idx]];
      return { ...root, children };
    }
    return { ...root, children: root.children.map(c => ({ occur: c.occur, node: moveSibling(c.node, id, delta) })) };
  }
  if (root.type === 'wrap' && root.child) {
    if (root.child.id === id) return root;
    return { ...root, child: moveSibling(root.child, id, delta) };
  }
  if (root.type === 'multi') {
    const idx = root.children.findIndex(c => c.node.id === id);
    if (idx >= 0) {
      const key = root.children[idx].key;
      let swap = -1;
      for (let i = idx + delta; i >= 0 && i < root.children.length; i += delta) {
        if (root.children[i].key === key) { swap = i; break; }
      }
      if (swap < 0) return root;
      const children = [...root.children];
      [children[idx], children[swap]] = [children[swap], children[idx]];
      return { ...root, children };
    }
    return { ...root, children: root.children.map(c => ({ key: c.key, node: moveSibling(c.node, id, delta) })) };
  }
  return root;
}

export function emptyTree(): QueryTree {
  return { root: null, postFilter: null, collapse: null, knn: null, suggest: null, rescore: null, scriptFields: null, runtimeMappings: null, retriever: null, sort: null, source: null, aggs: null, highlight: null, searchParams: {}, extras: {} };
}

/* ═══ 985：高级算子空节点工厂（BoolGroupNode「+ 高级」菜单插入入口） ═══
 值初值按形态给安全档：对象值算子 {}、数组值算子 []、标量 ''。未知 op 回退 match_all。 */
export function makeNodeByOp(op: string): QueryNode {
  const empty = (): LeafNode => ({ id: nid(), type: 'leaf', op, field: null, value: '', params: {}, raw: null });
  const wm = WRAP_META[op];
  if (wm) {
    return { id: nid(), type: 'wrap', op, field: wm.fieldKey ? '' : null, childKey: wm.childKey, child: null, params: {} };
  }
  if (MULTI_META[op]) {
    const meta = MULTI_META[op];
    const children = meta.keys.map(key => ({ key, node: matchAllLeafNode() as QueryNode }));
    const arrForm: Partial<Record<string, boolean>> = {};
    for (const k of meta.keys) arrForm[k] = meta.arrKeys.includes(k);
    return { id: nid(), type: 'multi', op, children, params: {}, arrForm };
  }
  const meta = OPS_META[op];
  /* 1420：match_none 此前和 match_all 一起回落 matchAllLeafNode()——用户在下拉里选
     「不匹配任何文档」，写回却成了 match_all（执行返回全部命中）。两者都无字段/无值，
     但语义相反，必须各自成节点。 */
  if (op === 'match_all' || op === 'match_none') {
    return { id: nid(), type: 'leaf', op, field: null, value: {}, params: {}, raw: null };
  }
  if (!meta) return matchAllLeafNode();
  if (meta.form === 'field') {
    const objValue = meta.wrap === 'none' && op !== 'terms' && op !== 'terms_set';
    const value = (op === 'terms' || op === 'terms_set') ? [] : objValue ? {} : '';
    return { ...empty(), field: '', value };
  }
  if (meta.form === 'fields') return { ...empty(), fields: [] };
  if (meta.form === 'none') {
    /* 无字段形态按主值语义给可用初值：ids 是数组（chip 编辑）、script 是对象
       （脚本体递归表）、其余标量。旧实现一律 ''，插入 ids/script 后无法直接编辑。 */
    if (op === 'ids') return { ...empty(), value: [] };
    /* 1443：script / wrapper 的主值是**必填的脚本体/查询串**，空串写出去就是非法 DSL
       （`{"script":{"script":{"source":""}}}`、`{"wrapper":{"query":""}}`），ES 直接 400，
       而用户只看到「加了条件没生效」。用 hasMain=false 让刚创建时**不写主值键**
       （缺少键=条件未完成，比写空串诚实），用户填好后写回自动带上。 */
    if (op === 'script' || op === 'wrapper') return { ...empty(), value: '', hasMain: false };
    return empty();
  }
  /* 向量主值给可直接编辑的 JSON 形态（knn 数组 / sparse_vector 对象） */
  if (op === 'knn') return { ...empty(), value: [] };
  if (op === 'sparse_vector') return { ...empty(), value: {} };
  /* rank_feature 的 boost 主值给 1（官方默认档），其余具名形态标量空串。
     1120：distance_feature 的 origin/pivot 必填——给 now / 7d 的可跑默认，字段待选。 */
  if (op === 'rank_feature') return { ...empty(), value: 1 };
  if (op === 'distance_feature') return { ...empty(), value: '7d', params: { origin: 'now' } };
  return empty();   // named：field null + 标量值初值
}

function matchAllLeafNode(): LeafNode {
  return { id: nid(), type: 'leaf', op: 'match_all', field: null, value: {}, params: {}, raw: null };
}

/* 1000：检索器空节点工厂——新变体给可用初值（standard=match_all 查询；rrf/linear 默认带一路 standard 子项，
   linear 子项给 weight:1）。切换变体=换新节点（六变体载荷语义互斥，保留旧载荷只会造出脏 DSL） */
export function makeRetrieverByOp(op: string): RetrieverNode {
  const base = (o: string): RetrieverNode => ({ id: nid(), op: o, query: null, child: null, children: [], childKeys: {}, field: null, value: undefined, hasValue: false, params: {} });
  const m = RETRIEVER_META[op];
  if (!m) return { ...base('standard'), query: matchAllLeafNode() };
  if (m.kind === 'query') return { ...base(op), query: matchAllLeafNode() };
  if (m.kind === 'list') {
    const c = makeRetrieverByOp('standard');
    const n = { ...base(op), children: [c] };
    if (m.wrapped) n.childKeys = { [c.id]: { weight: 1 } };
    return n;
  }
  /* child 变体：必填召回源给一路 standard 可用初值；rule 保持空（可独立按规则路由） */
  if (m.kind === 'child' && !m.childOptional) return { ...base(op), child: makeRetrieverByOp('standard') };
  return base(op);
}
