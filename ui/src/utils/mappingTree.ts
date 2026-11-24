/* Mapping 字段树的领域逻辑——拍平、折叠可见性、查询 DSL 污染检测。
 与视图解耦：MappingView 与索引工作区 Mapping Tab 共用一份口径（单测锁契约）。 */

export interface MappingRow {
  /** 完整点分路径，如 query.bool.must */
  path: string;
  /** 字段自身名 */
  name: string;
  /** 父路径（顶层为 ''） */
  parent: string;
  /** 全部祖先路径（由近及远无关，仅用于折叠可见性判断） */
  ancestors: string[];
  type: string;
  depth: number;
  /** 展示属性摘要：analyzer / format 等（multi-fields 已层级化为子行，不再塞这里） */
  attrs: string;
  hasChildren: boolean;
  /** multi-field 子行（父字段的 fields.* 子索引方式） */
  multi?: boolean;
}

/** 把 ES mapping 的 properties 递归拍平为行数组（先序，父在子前）。
 * multi-fields（fields.*）不再压缩进 attrs 文本被截断，而是产出为可折叠子行——
 * 它们本就是可查询的真实路径（如 title.keyword），理应层级展示。 */
export function flattenMapping(props: Record<string, any> | null | undefined): MappingRow[] {
  const out: MappingRow[] = [];
  const attrsOf = (d: any): string => {
    const attrs: string[] = [];
    if (d.format) attrs.push('format: ' + d.format);
    if (d.analyzer) attrs.push('analyzer: ' + d.analyzer);
    if (d.search_analyzer) attrs.push('search_analyzer: ' + d.search_analyzer);
    if (d.ignore_above) attrs.push('ignore_above: ' + d.ignore_above);
    if (d.enabled === false) attrs.push('enabled: false');
    if (d.index === false) attrs.push('index: false');
    return attrs.join(' · ');
  };
  const walk = (p: Record<string, any>, parent: string, ancestors: string[], depth: number) => {
    for (const [name, def] of Object.entries(p || {})) {
      const d: any = def || {};
      const path = parent ? parent + '.' + name : name;
      const hasProps = !!(d.properties && Object.keys(d.properties).length);
      const hasFields = !!(d.fields && Object.keys(d.fields).length);
      out.push({
        path, name, parent, ancestors, depth,
        type: d.type || (d.properties ? 'object' : '-'),
        attrs: attrsOf(d),
        hasChildren: hasProps || hasFields,
      });
      if (hasFields) {
        for (const [fk, fv] of Object.entries(d.fields as Record<string, any>)) {
          const fd: any = fv || {};
          out.push({
            path: path + '.' + fk, name: fk, parent: path,
            ancestors: [...ancestors, path], depth: depth + 1,
            type: fd.type || '-', attrs: attrsOf(fd),
            hasChildren: false, multi: true,
          });
        }
      }
      if (hasProps) walk(d.properties, path, [...ancestors, path], depth + 1);
    }
  };
  walk(props || {}, '', [], 0);
  return out;
}

/* 查询 DSL 的结构性关键词——业务字段几乎不可能同时命中多个 */
const DSL_MARKERS = new Set([
  'bool', 'must', 'should', 'must_not', 'filter', 'adjust_pure_negative',
  'minimum_should_match', 'match_all', 'match_phrase', 'query_string',
  'terms', 'range', 'boost', 'zero_terms_query', 'auto_generate_synonyms_phrase_query',
]);
/* 只有这些顶层名才可能是被误写入的请求体容器（query/sort/aggs/from/size…） */
const DSL_ROOTS = new Set(['query', 'sort', 'aggs', 'aggregations', 'post_filter', 'highlight', 'collapse']);

/** 检测「查询 DSL 被当文档写入、dynamic mapping 固化」的疑似污染顶层字段。
 * 口径保守：顶层名在 DSL_ROOTS 内、自身是 object、且子树 ≥2 个节点名命中 DSL 关键词。 */
export function detectDslPollution(props: Record<string, any> | null | undefined): string[] {
  const hits: string[] = [];
  for (const [name, def] of Object.entries(props || {})) {
    const d: any = def || {};
    if (!DSL_ROOTS.has(name) || !d.properties) continue;
    let score = 0;
    const stack: Record<string, any>[] = [d.properties];
    while (stack.length) {
      const p = stack.pop()!;
      for (const [k, v] of Object.entries(p)) {
        if (DSL_MARKERS.has(k)) score++;
        const c = (v as any)?.properties;
        if (c) stack.push(c);
      }
    }
    if (score >= 2) hits.push(name);
  }
  return hits;
}

/** 折叠语义下的可见行：任一祖先被折叠即隐藏（搜索模式由视图侧绕过本函数） */
export function visibleRows(rows: MappingRow[], collapsed: ReadonlySet<string>): MappingRow[] {
  return rows.filter(r => !r.ancestors.some(a => collapsed.has(a)));
}

/** 某节点的后代数量（折叠行的 +N 提示） */
export function descendantCount(rows: MappingRow[], path: string): number {
  const pfx = path + '.';
  return rows.reduce((n, r) => n + (r.path.startsWith(pfx) ? 1 : 0), 0);
}
