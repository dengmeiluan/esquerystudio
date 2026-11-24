/* 998：查询树 → 人话语句（纯函数，零依赖 UI）。
   用途：条件树面板顶部的「语句」阅读层——一眼读出这条查询在做什么，
   点任一片段可定位到对应条件行（片段携带 nodeId）。
   设计取舍：
   · 三层语义显式化：must/filter → 且，should → 或，must_not → 非；OR/NOT 子组自动加括号（优先级可读）；
   · 值一律短截断（客户端只是摘要，完整值在行内；title 挂全文）；
   · 未知/自定义算子不吞：输出「自定义( 键 )」占位，让用户知道这段没被读懂。 */
import { OPS_META, MULTI_LABELS, WRAP_LABELS, labelOfOp } from './queryAstOps';
import type { BoolNode, LeafNode, MultiNode, QueryNode, QueryTree, WrapNode } from './queryAst';

export type PartKind = 'field' | 'op' | 'value' | 'and' | 'or' | 'not' | 'paren' | 'muted' | 'struct';

export interface SentencePart {
  text: string;
  kind: PartKind;
  /** 片段归属节点——点击定位到该条件行/组（摘要自身无 id 时不可点） */
  nodeId?: string;
  title?: string;
}

const MAX_VAL = 28;
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v));

/** 值短写：字符串截断，数组/对象压成单行 JSON */
export function briefValue(v: unknown, max = MAX_VAL): string {
  if (v === null) return 'null';
  if (v === undefined) return '—';
  if (typeof v === 'string') return v.length > max ? v.slice(0, max - 1) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    const s = v.map(x => briefValue(x, max)).join(', ');
    return s.length > max ? s.slice(0, max - 1) + '…' : `[${s}]`;
  }
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }
  return String(v);
}

const q = (s: string): string => (s ? `「${s}」` : '「」');
const P = (text: string, kind: PartKind, nodeId?: string, title?: string): SentencePart =>
  ({ text, kind, nodeId, title });

/* 单字段形态的主值摘要（值位在树里是 unknown，形态按算子定） */
function fieldValueParts(n: LeafNode, verb: string): SentencePart[] {
  const id = n.id;
  const field = n.field || '（字段）';
  if (n.op === 'terms') {
    const arr = Array.isArray(n.value) ? n.value : n.value == null ? [] : [n.value];
    return [P(field, 'field', id), P(' ∈ ', 'op', id), P(arr.length ? briefValue(arr) : '（空集）', 'value', id, arr.join(', '))];
  }
  if (n.op === 'range') {
    const v = (n.value || {}) as Record<string, unknown>;
    const sym = (k: string) => (k === 'gte' ? '≥' : k === 'gt' ? '>' : k === 'lte' ? '≤' : '<');
    const keys = ['gte', 'gt', 'lte', 'lt'].filter(k => v[k] !== undefined && v[k] !== '');
    if (!keys.length) return [P(field, 'field', id), P(' 范围内', 'op', id), P('（未填边界）', 'muted', id)];
    /* 1044：date-math 人话化——快选 chips 写入的 now-Nu/now/y 锚在摘要条出人话
       （「近30天」「今年」），与 1041 时间窗快选心智贯穿；其余值原样 */
    const human = (val: unknown): string => {
      const s = String(val);
      /* /d /y 等舍入尾可选——'now-30d/d' 与 'now-30d' 均命中 */
      const m = s.match(/^now-(\d+)([dmy])(?:\/\w+)?$/);
      if (m) {
        const n = m[1];
        if (n === '7' && m[2] === 'd') return '近7天';
        if (n === '30' && m[2] === 'd') return '近30天';
        if (n === '90' && m[2] === 'd') return '近90天';
        if (n === '1' && m[2] === 'y') return '近一年';
        return '近' + n + ({ d: '天', m: '个月', y: '年' }[m[2]] || m[2]);
      }
      if (s === 'now/y') return '今年';
      if (s === 'now/M') return '本月';
      if (s === 'now/w') return '本周';
      return s;
    };
    const out: SentencePart[] = [P(field, 'field', id)];
    keys.forEach((k, i) => {
      /* 同一条件内的多个边界用顿号（不是逻辑「且」——否则和外层条件连接词混淆） */
      if (i) out.push(P('、', 'muted', id), P(sym(k) + ' ', 'op', id));
      else out.push(P(' ' + sym(k) + ' ', 'op', id));
      out.push(P(human(v[k]), 'value', id, String(v[k])));
    });
    return out;
  }
  if (n.op === 'exists') return [P(field, 'field', id), P(' 存在', 'op', id)];
  if (n.op === 'match_all') return [P('全部文档', 'struct', id)];
  if (n.op === 'match_none') return [P('不匹配任何文档', 'struct', id)];
  if (n.op === 'ids') {
    const arr = Array.isArray(n.value) ? n.value : [n.value];
    return [P('文档 ID', 'field', id), P(' ∈ ', 'op', id), P(briefValue(arr), 'value', id)];
  }
  /* geo_distance：值是 {lat,lon} 散层或字符串，distance 在 params */
  if (n.op === 'geo_distance') {
    const dist = n.params?.distance;
    return [P(field, 'field', id), P(' 距 ', 'op', id), P(briefValue(n.value), 'value', id),
      ...(dist !== undefined ? [P(' ≤ ', 'op', id), P(String(dist), 'value', id)] : [])];
  }
  if (n.op === 'geo_bounding_box') return [P(field, 'field', id), P(' 落在矩形内', 'op', id)];
  if (n.op === 'geo_polygon') return [P(field, 'field', id), P(' 落在多边形内', 'op', id)];
  if (n.op === 'geo_shape' || n.op === 'shape') {
    const rel = (n.value as Record<string, unknown>)?.relation;
    return [P(field, 'field', id), P(' 形状', 'op', id), ...(rel ? [P(' ' + String(rel), 'value', id)] : [])];
  }
  if (n.op === 'knn') {
    const k = n.params?.k;
    return [P(field, 'field', id), P(' 向量近邻', 'op', id), ...(k !== undefined ? [P(' k=', 'muted', id), P(String(k), 'value', id)] : [])];
  }
  if (n.op === 'rank_feature' || n.op === 'rank_features') return [P(field, 'field', id), P(' 特征打分', 'op', id)];
  if (n.op === 'script' || n.op === 'wrapper') return [P(labelOfOp(n.op), 'op', id), P(' ' + briefValue(n.value ?? n.raw), 'value', id)];
  if (n.op === 'percolate') return [P('反查文档', 'op', id), P(' 字段 ', 'muted', id), P(field, 'field', id)];
  /* 多字段形态：fields 数量 + 主值 */
  if (Array.isArray(n.fields)) {
    return [P(`${n.fields.length} 个字段`, 'field', id, n.fields.join(', ')), P(' ' + verb + ' ', 'op', id), P(q(briefValue(n.value)), 'value', id)];
  }
  /* 具名/无字段形态（query_string / semantic / sparse_vector 等）*/
  if (n.field === null && n.op !== 'term' && n.op !== 'match') {
    return [P(labelOfOp(n.op), 'op', id), P(' ' + briefValue(n.value), 'value', id)];
  }
  return [P(field, 'field', id), P(' ' + verb + ' ', 'op', id), P(q(briefValue(n.value)), 'value', id, str(n.value))];
}

const VERB: Record<string, string> = {
  term: '=', match: '包含', match_phrase: '短语含', match_phrase_prefix: '短语前缀',
  match_bool_prefix: '前缀词含', match_int_prefix: '整数前缀', prefix: '前缀',
  wildcard: '通配', regexp: '正则', fuzzy: '模糊', span_term: '跨度词',
  semantic: '语义相似于', text_expansion: '文本扩展', weighted_tokens: '加权词元',
  sparse_vector: '稀疏向量', terms_set: '命中数达',
  multi_match: '包含', combined_fields: '包含',
};

function leafParts(n: LeafNode): SentencePart[] {
  /* 未注册算子（自定义/未来版本新增）——不假装读懂：原样给出算子名 + 体摘要 */
  if (!OPS_META[n.op] && !WRAP_LABELS[n.op] && !MULTI_LABELS[n.op]) {
    return [P('自定义 ', 'muted', n.id), P(n.op, 'value', n.id), P(' ', 'muted', n.id), P(briefValue(n.raw ?? n.value, 42), 'muted', n.id, JSON.stringify(n.raw ?? n.value, null, 2))];
  }
  if (n.op === '__raw__') {
    const s = briefValue(n.raw, 46);
    return [P('自定义 ', 'muted', n.id), P(s, 'value', n.id, JSON.stringify(n.raw, null, 2))];
  }
  const parts = fieldValueParts(n, VERB[n.op] || '匹配');
  /* query_string/simple_query_string 没有单字段语义时补算子名，避免只有一坨值
     （match_all/match_none 等 struct 片段本身已自解释，不补） */
  if (parts.length === 1 && parts[0].kind !== 'struct') parts.push(P(' ' + labelOfOp(n.op), 'op', n.id));
  return parts;
}

function wrapParts(n: WrapNode): SentencePart[] {
  const id = n.id;
  const head = WRAP_LABELS[n.op] || n.op;
  const route = n.field ? ` ${n.field}` : '';
  const child = n.child ? nodeParts(n.child) : [P('（空）', 'muted', id)];
  return [P(head, 'struct', id), ...(route ? [P(route, 'field', id)] : []), P('（', 'paren', id), ...child, P('）', 'paren', id)];
}

function multiParts(n: MultiNode): SentencePart[] {
  const id = n.id;
  const out: SentencePart[] = [P(MULTI_LABELS[n.op] || n.op, 'struct', id), P('（', 'paren', id)];
  const keys = [...new Set(n.children.map(c => c.key))];
  keys.forEach((k, ki) => {
    if (ki) out.push(P('；', 'muted', id));
    const kids = n.children.filter(c => c.key === k);
    kids.forEach((c, i) => {
      if (i) out.push(P(' 且 ', 'and', id));
      out.push(...nodeParts(c.node));
    });
  });
  out.push(P('）', 'paren', id));
  return out;
}

/* ═══ bool 渲染文法 ═══
   把 bool 看成「且链」（terms）：
   · must / filter 的每个子句各成一项；
   · should 的多个分支合成一项并内部用「或」连接（>1 分支整体加括号）；
   · must_not 每个子句各成一项，写作「非 <操作数>」。
   项与项之间统一用「且」。作为上级操作数时是否需要外括号由 boolIsCompound 判定
   （顶层含连接词 → 需要），避免出现「（（b 或 c））」这种双重括号。 */
function boolIsCompound(n: BoolNode): boolean {
  const count = (o: string) => n.children.filter(c => c.occur === o).length;
  const should = count('should');
  const terms = count('must') + count('filter') + (should > 0 ? 1 : 0) + count('must_not');
  return terms > 1;
}

/** 以「操作数」身份渲染子节点：复合 bool 加括号；wrap/multi 自带括号不再套 */
function operandParts(k: QueryNode, ownerId: string): SentencePart[] {
  if (k.type === 'bool' && boolIsCompound(k)) {
    return [P('（', 'paren', ownerId), ...nodeParts(k), P('）', 'paren', ownerId)];
  }
  return nodeParts(k);
}

function boolParts(n: BoolNode): SentencePart[] {
  const id = n.id;
  const terms: SentencePart[][] = [];
  const push = (ps: SentencePart[]) => { if (ps.length) terms.push(ps); };

  /* 且语义：must + filter 按原序各成一项 */
  for (const c of n.children.filter(c => c.occur === 'must' || c.occur === 'filter')) {
    push(operandParts(c.node, id));
  }
  /* 或语义：多分支合成一项 */
  const shouldKids = n.children.filter(c => c.occur === 'should').map(c => c.node);
  if (shouldKids.length) {
    const inner: SentencePart[] = [];
    shouldKids.forEach((k, i) => {
      if (i) inner.push(P(' 或 ', 'or', id));
      inner.push(...operandParts(k, id));
    });
    push(shouldKids.length > 1 ? [P('（', 'paren', id), ...inner, P('）', 'paren', id)] : inner);
  }
  /* 非语义：每个 must_not 各成一项（多个= 且 非A 且 非B，与 ES 语义一致） */
  for (const k of n.children.filter(c => c.occur === 'must_not').map(c => c.node)) {
    push([P('非', 'not', id), P(' ', 'muted', id), ...operandParts(k, id)]);
  }

  const out: SentencePart[] = [];
  terms.forEach((t, i) => {
    if (i) out.push(P(' 且 ', 'and', id));
    out.push(...t);
  });
  if (!out.length) out.push(P('空条件组', 'muted', id));
  return out;
}

export function nodeParts(n: QueryNode): SentencePart[] {
  if (n.type === 'bool') return boolParts(n);
  if (n.type === 'wrap') return wrapParts(n);
  if (n.type === 'multi') return multiParts(n);
  return leafParts(n);
}

export interface QuerySentence {
  /** 查询主体片段（可为空 = 无 query） */
  query: SentencePart[];
  /** 检索级元信息（取几条/排序/聚合/高亮/游标…） */
  meta: SentencePart[];
}

export function buildQuerySentence(tree: QueryTree): QuerySentence {
  const query = tree.root ? nodeParts(tree.root) : [];
  const meta: SentencePart[] = [];
  const pushMeta = (text: string, kind: PartKind = 'muted', title?: string) => {
    if (meta.length) meta.push(P(' · ', 'muted'));
    meta.push(P(text, kind, undefined, title));
  };
  const size = tree.size;
  if (size !== undefined && size !== null && String(size) !== '') pushMeta(`取 ${briefValue(size, 8)} 条`);
  if (tree.sort?.length) {
    const t = tree.sort.map(s => (s.form === 'multi' ? '多键排序' : `${s.field}${s.params?.order ? ' ' + (s.params.order === 'asc' ? '↑' : '↓') : ''}`)).join('、');
    pushMeta('排序 ' + t, 'muted', t);
  }
  if (tree.aggs?.length) pushMeta(`${tree.aggs.length} 个聚合`, 'struct');
  if (tree.highlight?.fields.length) pushMeta(`${tree.highlight.fields.length} 个高亮字段`, 'struct');
  if (tree.postFilter) pushMeta('后置过滤', 'struct');
  if (tree.collapse) pushMeta(`按 ${tree.collapse.field} 折叠`, 'struct');
  if (tree.knn) pushMeta('向量检索', 'struct');
  if (tree.suggest?.items.length) pushMeta(`${tree.suggest.items.length} 个建议`, 'struct');
  if (tree.rescore) pushMeta('重打分', 'struct');
  if (tree.retriever) pushMeta('检索器 retriever', 'struct');
  if (tree.scriptFields?.items.length) pushMeta(`${tree.scriptFields.items.length} 个脚本字段`, 'struct');
  if (tree.runtimeMappings?.items.length) pushMeta(`${tree.runtimeMappings.items.length} 个运行时字段`, 'struct');
  const sp = tree.searchParams || {};
  if (sp.min_score !== undefined) pushMeta(`最低分 ${briefValue(sp.min_score, 8)}`, 'muted');
  if (sp.search_after !== undefined) pushMeta('游标翻页', 'muted', 'search_after');
  if (sp.pit !== undefined) pushMeta('PIT 快照', 'muted', 'pit');
  if (Object.keys(tree.extras || {}).length) pushMeta(`${Object.keys(tree.extras).length} 个自定义键`, 'muted');
  return { query, meta };
}

/** 纯文本形态（复制/无障碍/测试断言用） */
export function sentenceText(parts: SentencePart[]): string {
  return parts.map(p => p.text).join('').replace(/\s+/g, ' ').trim();
}
