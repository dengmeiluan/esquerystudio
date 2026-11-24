/* 1011：intervals 规则纯函数层（组件消费的直通投影——AST 零改动，规则体仍在
   leaf.value 原样往返；parse/ser 对称投影 + 畸形零丢失退化契约，同 FsFunctionsPanel 语言）。
   ES 官方规则面：规则对象 = 唯一类型键 + 可选 _name；单值型 match/prefix/wildcard/fuzzy
   （主值键 query/prefix/pattern/term），容器型 all_of/any_of（intervals 子规则数组递归）；
   规则级 filter = 六位置关系 + before/after + script 等其余键。
   解析失败契约：parseIntervalRule 返回 null = 调用方整体退 GenericParams（零丢失）；
   容器内子规则畸形 → __custom__ 行原样保真（嵌套深处不牵连整树退化）。 */
import { nid } from './queryAst';

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** 单值型主值键（容器型无主值） */
export const KIND_MAINKEY: Record<string, string> = {
  match: 'query', prefix: 'prefix', wildcard: 'pattern', fuzzy: 'term',
};
export const CONTAINER_KINDS: ReadonlySet<string> = new Set(['all_of', 'any_of']);
export const CUSTOM_KIND = '__custom__';

/** 规则类型注册表（下拉同源序）：label 中文 + 主值 placeholder 语义 */
export const RULE_KIND_META: Array<{ k: string; label: string; mainLabel?: string }> = [
  { k: 'match', label: '词组匹配', mainLabel: 'query 检索串' },
  { k: 'prefix', label: '前缀', mainLabel: 'prefix 前缀' },
  { k: 'wildcard', label: '通配符', mainLabel: 'pattern 通配模式' },
  { k: 'fuzzy', label: '模糊', mainLabel: 'term 词项' },
  { k: 'all_of', label: '全部命中（有序组合）' },
  { k: 'any_of', label: '任一命中' },
];

/** 规则级具名参数 schema（GenericParams 消费；filter/intervals 由专用控件承担不在此表） */
export const RULE_PARAMS: Record<string, Array<{ key: string; kind: 'number' | 'text' | 'boolean' }>> = {
  match: [
    { key: 'max_gaps', kind: 'number' }, { key: 'ordered', kind: 'boolean' },
    { key: 'analyzer', kind: 'text' }, { key: 'use_field', kind: 'text' },
  ],
  prefix: [{ key: 'use_field', kind: 'text' }],
  wildcard: [{ key: 'use_field', kind: 'text' }],
  fuzzy: [
    { key: 'fuzziness', kind: 'text' }, { key: 'prefix_length', kind: 'number' },
    { key: 'transpositions', kind: 'boolean' }, { key: 'use_field', kind: 'text' },
  ],
  all_of: [{ key: 'max_gaps', kind: 'number' }, { key: 'ordered', kind: 'boolean' }],
  any_of: [],
};

/** 规则级 filter 的位置关系槽（官方六关系 + before/after 顺序关系） */
export const FILTER_RELS: Array<{ rel: string; label: string }> = [
  { rel: 'containing', label: '包含 (containing)' },
  { rel: 'not_containing', label: '不包含 (not_containing)' },
  { rel: 'contained_by', label: '被包含 (contained_by)' },
  { rel: 'not_contained_by', label: '不被包含 (not_contained_by)' },
  { rel: 'overlapping', label: '相交 (overlapping)' },
  { rel: 'not_overlapping', label: '不相交 (not_overlapping)' },
  { rel: 'before', label: '之前 (before)' },
  { rel: 'after', label: '之后 (after)' },
];

export interface FilterSlot { id: string; rel: string; rule: IntervalRule }
export interface IntervalFilterView {
  slots: FilterSlot[];                 // 8 关系槽（每槽一个子规则，递归）
  rest: Record<string, unknown>;       // script 等其余键原样
}
export interface IntervalRule {
  id: string;
  kind: string;                        // 6 官方类型 | __custom__（畸形/未知原样保真行）
  custom?: unknown;                    // __custom__ 行的原样体
  main?: unknown;                      // 单值型主值
  children?: IntervalRule[];           // 容器型子规则（含 __custom__ 行）
  hasChildren?: boolean;               // intervals 键在场记忆（空数组也保键）
  filter?: IntervalFilterView | null;  // filter 键缺席 = undefined；结构化 null = 畸形留在 params
  params: Record<string, unknown>;     // 其余参数（filter/intervals 已剥离）
  hasName?: boolean;                   // _name 在场记忆
  name?: unknown;
}

/** 规则级 filter 投影：非对象 → null（键留 params 原样）；关系槽值再递归 parse，
    槽值畸形 → __custom__ 行保真（不牵连整个 filter） */
export function parseIntervalFilter(v: unknown): IntervalFilterView | null {
  if (!isObj(v)) return null;
  const slots: FilterSlot[] = [];
  const rest: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    if (FILTER_RELS.some(r => r.rel === k)) slots.push({ id: nid(), rel: k, rule: toRuleOrCustom(val) });
    else rest[k] = val;
  }
  return { slots, rest };
}

function toRuleOrCustom(v: unknown): IntervalRule {
  return parseIntervalRule(v) ?? { id: nid(), kind: CUSTOM_KIND, custom: v, params: {} };
}

/** 规则解析：非对象 / 多类型键（_name 除外）/ 未注册类型键 / 类型键值非对象 → null */
export function parseIntervalRule(body: unknown): IntervalRule | null {
  if (!isObj(body)) return null;
  const keys = Object.keys(body).filter(k => k !== '_name');
  if (keys.length !== 1) return null;
  const kind = keys[0];
  if (!(kind in KIND_MAINKEY) && !CONTAINER_KINDS.has(kind)) return null;
  const inner = body[kind];
  if (!isObj(inner)) return null;
  const hasName = '_name' in body;
  const name = hasName ? body._name : undefined;
  const { filter, ...rest } = inner;
  const filterView = isObj(filter) ? parseIntervalFilter(filter) : null;
  const params: Record<string, unknown> = filter !== undefined && !filterView ? { ...rest, filter } : { ...rest };
  if (kind in KIND_MAINKEY) {
    const mk = KIND_MAINKEY[kind];
    const { [mk]: main, ...rest2 } = params;
    return { id: nid(), kind, main, params: rest2, filter: filterView, hasName, name };
  }
  const { intervals, ...rest3 } = params;
  const hasChildren = Array.isArray(intervals);
  const children = hasChildren ? (intervals as unknown[]).map(toRuleOrCustom) : undefined;
  const params2: Record<string, unknown> = hasChildren ? rest3 : { ...rest3 };
  if (intervals !== undefined && !hasChildren) params2.intervals = intervals;   // intervals 畸形（非数组）留 params 原样
  return { id: nid(), kind, children, hasChildren, filter: filterView, params: params2, hasName, name };
}

function serFilter(f: IntervalFilterView): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of f.slots) out[s.rel] = serIntervalRule(s.rule);
  Object.assign(out, f.rest);
  return out;
}

/** 序列化（书写序固定→DSL 文本稳定）：容器 {intervals,…参数,filter}；单值 {主值,…参数,filter}；
    规则层 {类型:体} + _name 殿后。__custom__ 行原样直出。 */
export function serIntervalRule(r: IntervalRule): unknown {
  if (r.kind === CUSTOM_KIND) return r.custom;
  const body: Record<string, unknown> = {};
  if (CONTAINER_KINDS.has(r.kind)) {
    if (r.hasChildren) body.intervals = (r.children || []).map(serIntervalRule);
  } else {
    body[KIND_MAINKEY[r.kind]] = r.main;
  }
  Object.assign(body, r.params);
  if (r.filter) body.filter = serFilter(r.filter);
  const out: Record<string, unknown> = { [r.kind]: body };
  if (r.hasName) out._name = r.name;
  return out;
}

/** 新规则骨架（换类型/加子规则/加槽的初值——与 makeNodeByOp 安全档同语言） */
export function makeRule(kind: string): IntervalRule {
  const base: IntervalRule = { id: nid(), kind, params: {} };
  if (CONTAINER_KINDS.has(kind)) return { ...base, children: [], hasChildren: false };
  return { ...base, main: '' };
}
