/* 语法桥：从 translated DSL 抽取 Lucene query_string（启发式）。
 纯函数零依赖——从 SqlBridgeView 抽出，供 DSL/Lucene 工具栏内联复用。

 1229 修掉两处**会给出错误结果**的行为（比"翻不全"严重得多）：
 ① `bool.should` 此前和 must 一起用 `AND` 拼——should 是"任一满足"，拼成 AND 是**收紧**语义。
    现在单 should 组用 `OR` 括起来；若同时存在 must/filter，ES 里 should 只是"加分"，
    query_string 没有这个概念，并入必须条件会收紧、并入 OR 会放宽，两者都会改变结果——
    取**保守（收紧）**并记入 `lossy` 让调用方提示。
 ② `terms` / `prefix` / `multi_match` / `nested` 等此前一律静默吞掉并整体回退 `*`
    （**返回全部文档**，用户以为在过滤其实没过滤）。现在能表达的补上
    （terms→OR 组、prefix→`k:v*`、multi_match→各字段 OR），表达不了的记入 `lossy`。

 `dslToLucene` 旧签名保持返回字符串（既有出口零改动）；需要提示时用 `dslToLuceneDetailed`。 */

function leaf(n: any, lossy: string[]): string {
  if (!n || typeof n !== 'object') return '';
  if (n.term) { const k = Object.keys(n.term)[0]; const v = n.term[k]; const val = typeof v === 'object' ? v.value : v; return `${k}:"${val}"`; }
  if (n.match) { const k = Object.keys(n.match)[0]; const v = n.match[k]; const val = typeof v === 'object' ? v.query : v; return `${k}:${val}`; }
  if (n.match_phrase) {
    const k = Object.keys(n.match_phrase)[0]; const v = n.match_phrase[k];
    /* 1430：官方体是 {query, slop, analyzer…} 对象——此前直接内插对象，输出
       `title:"[object Object]"`（一条**错误查询**，且 lossy 为空不提示）。
       对象形态取 query；非字符串（缺 query）记名上报，不猜。 */
    const val = v && typeof v === 'object' ? (v as any).query : v;
    if (typeof val !== 'string' || !val) { lossy.push('match_phrase(缺 query)'); return ''; }
    return `${k}:"${val}"`;
  }
  if (n.range) { const k = Object.keys(n.range)[0]; const r = n.range[k]; const lo = r.gte ?? r.gt ?? '*'; const hi = r.lte ?? r.lt ?? '*'; return `${k}:[${lo} TO ${hi}]`; }
  if (n.wildcard) { const k = Object.keys(n.wildcard)[0]; const v = n.wildcard[k]; const val = typeof v === 'object' ? v.value : v; return `${k}:${val}`; }
  /* terms = "任一命中" → OR 组；单值退化成 term 形态 */
  if (n.terms) {
    const k = Object.keys(n.terms)[0]; const vs = n.terms[k];
    if (!Array.isArray(vs) || !vs.length) { lossy.push('terms(空/非数组)'); return ''; }
    if (vs.length === 1) return `${k}:"${vs[0]}"`;
    return '(' + vs.map((v: any) => `${k}:"${v}"`).join(' OR ') + ')';
  }
  /* prefix → k:v*（query_string 原生支持尾通配） */
  if (n.prefix) {
    const k = Object.keys(n.prefix)[0]; const v = n.prefix[k];
    const val = typeof v === 'object' ? v.value : v;
    return `${k}:${val}*`;
  }
  /* multi_match → 各字段 OR 同一查询串 */
  if (n.multi_match) {
    const mm = n.multi_match;
    const q = typeof mm?.query === 'string' ? mm.query : '';
    if (!Array.isArray(mm?.fields) || !mm.fields.length || !q) { lossy.push('multi_match(缺 fields/query)'); return ''; }
    if (mm.fields.length === 1) return `${mm.fields[0]}:${q}`;
    return '(' + mm.fields.map((f: string) => `${f}:${q}`).join(' OR ') + ')';
  }
  if (n.exists) {
    /* exists 缺 field 是非法体：记名上报，别拼出 `_exists_:undefined` */
    const f = n.exists.field;
    if (typeof f !== 'string' || !f) { lossy.push('exists(缺 field)'); return ''; }
    return `_exists_:${f}`;
  }
  /* 1430：以下五种 query_string 原生可表达，此前一律静默 lossy 退化成 `*`：
     match_phrase_prefix→k:"p"*、regexp→k:/re/、fuzzy→k:term~、
     ids→_id:(…)、query_string/simple_query_string 直接透传其 query 串。 */
  if (n.match_phrase_prefix) {
    const k = Object.keys(n.match_phrase_prefix)[0]; const v = n.match_phrase_prefix[k];
    const val = v && typeof v === 'object' ? (v as any).query : v;
    if (typeof val !== 'string' || !val) { lossy.push('match_phrase_prefix(缺 query)'); return ''; }
    return `${k}:"${val}"*`;
  }
  if (n.regexp) {
    const k = Object.keys(n.regexp)[0]; const v = n.regexp[k];
    const val = v && typeof v === 'object' ? (v as any).value : v;
    if (typeof val !== 'string' || !val) { lossy.push('regexp(缺 value)'); return ''; }
    return `${k}:/${val}/`;
  }
  if (n.fuzzy) {
    const k = Object.keys(n.fuzzy)[0]; const v = n.fuzzy[k];
    const val = v && typeof v === 'object' ? (v as any).value : v;
    if (val == null || val === '') { lossy.push('fuzzy(缺 value)'); return ''; }
    return `${k}:${val}~`;
  }
  if (n.ids) {
    const vs = n.ids.values;
    if (!Array.isArray(vs) || !vs.length) { lossy.push('ids(空/非数组)'); return ''; }
    return vs.length === 1 ? `_id:"${vs[0]}"` : '(_id:' + vs.map((v: any) => `"${v}"`).join(' OR _id:') + ')';
  }
  /* query_string / simple_query_string：本身就是 Lucene 语法，取其 query 串透传
     （带 AND/OR/前缀通配等原样保留；缺 query 记名上报） */
  if (n.query_string || n.simple_query_string) {
    const body = n.query_string || n.simple_query_string;
    const qs = typeof body === 'string' ? body : body?.query;
    if (typeof qs !== 'string' || !qs.trim()) { lossy.push((n.query_string ? 'query_string' : 'simple_query_string') + '(缺 query)'); return ''; }
    return '(' + qs + ')';
  }
  if (n.match_all) return '*';
  /* 其余（nested / has_child / geo_* / knn / script 等）query_string 表达不了。
     旧实现静默跳过 → 整条退化成 '*'，用户以为过滤了其实返回全部。现在记名上报。 */
  const op = Object.keys(n)[0];
  if (op) lossy.push(op);
  return '';
}

/**
 * 1439：查询子句之外、query_string 通道表达不了、但会改变语义的顶层键。
 * 此前只报「query 里翻不了的子句」，post_filter/sort/aggs/knn 这些整段被静默丢弃——
 * 用户拿着少了过滤/排序的 Lucene 去执行，还以为等价。
 *
 * 判据按「是否真的写了」：构建器默认会写 `sort: []`、`size: 20`，
 * 空数组与 Lucene 页默认页大小不算丢失，避免每次跳转都刷一条无意义告警。
 */
const LOSSY_EXTRAS: Array<[string, (v: any) => boolean, string]> = [
  ['post_filter', nonEmptyObj, 'post_filter(结果后过滤)'],
  ['sort', nonEmptyArr, 'sort(排序)'],
  ['aggs', nonEmptyObj, 'aggs(聚合)'],
  ['aggregations', nonEmptyObj, 'aggregations(聚合)'],
  ['collapse', nonEmptyObj, 'collapse(折叠)'],
  ['knn', (v) => nonEmptyObj(v) || nonEmptyArr(v), 'knn(向量检索)'],
  ['highlight', nonEmptyObj, 'highlight(高亮)'],
  ['rescore', nonEmptyObj, 'rescore(二次打分)'],
  ['suggest', nonEmptyObj, 'suggest(建议器)'],
  ['script_fields', nonEmptyObj, 'script_fields(脚本字段)'],
  ['runtime_mappings', nonEmptyObj, 'runtime_mappings(运行时字段)'],
  ['min_score', (v) => typeof v === 'number', 'min_score(最低分)'],
  ['search_after', nonEmptyArr, 'search_after(游标)'],
  ['_source', (v) => v !== undefined && v !== null, '_source(字段裁剪)'],
  ['fields', nonEmptyArr, 'fields(字段列表)'],
  ['from', (v) => typeof v === 'number' && v > 0, 'from(偏移)'],
  ['size', (v) => typeof v === 'number' && v !== 20, 'size(每页条数)'],
];

function nonEmptyObj(v: any): boolean {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0;
}
function nonEmptyArr(v: any): boolean {
  return Array.isArray(v) && v.length > 0;
}

/** 内部：连同「无法翻译的子句名」一起返回，供调用方提示 */
export function dslToLuceneDetailed(dslObj: any): { lucene: string; lossy: string[] } {
  const parts: string[] = [];
  const lossy: string[] = [];
  for (const [key, present, label] of LOSSY_EXTRAS) {
    if (present(dslObj?.[key])) lossy.push(label);
  }
  const q = dslObj?.query;
  if (!q) return { lucene: '*', lossy };

  const walk = (node: any): string => {
    if (!node || typeof node !== 'object') return '';
    if (node.bool) {
      /* 1430：ES 允许 must/filter/should/must_not 写成**单个对象**（非数组）。
         此前直接 .forEach → TypeError，整页报错；构建器自身的 arrForm 记忆也会产出这种形态。 */
      const asArr = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
      const must: string[] = [];
      asArr(node.bool.must).forEach((n: any) => { const s = walk(n); if (s) must.push(s); });
      asArr(node.bool.filter).forEach((n: any) => { const s = walk(n); if (s) must.push(s); });
      asArr(node.bool.must_not).forEach((n: any) => { const s = walk(n); if (s) must.push('NOT ' + s); });
      const shoulds: string[] = [];
      asArr(node.bool.should).forEach((n: any) => { const s = walk(n); if (s) shoulds.push(s); });
      if (shoulds.length) {
        const grp = shoulds.length === 1 ? shoulds[0] : '(' + shoulds.join(' OR ') + ')';
        if (must.length) {
          /* 有 must 时 should 只是加分项：并入必须条件=收紧（保守），并留痕 */
          must.push(grp);
          lossy.push('bool.should(原为加分项，已并入必须条件)');
        } else {
          must.push(grp);
        }
      }
      return must.join(' AND ');
    }
    return leaf(node, lossy);
  };

  const s = walk(q);
  if (s) parts.push(s);
  return { lucene: parts.length ? parts.join(' AND ') : '*', lossy };
}

export function dslToLucene(dslObj: any): string {
  return dslToLuceneDetailed(dslObj).lucene;
}
