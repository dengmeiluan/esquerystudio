/**
 * 1439：表格单元格「以此值过滤 / 排除此值」的合并内核。
 *
 * 此前 ResultTable 只能正向下钻（filter-hit → 并入 must/filter），
 * 「排除这个值」得手改 DSL 加 must_not——而排除是排障时最常用的反向动作。
 *
 * 抽成纯函数的原因：两条通道的合并语言不同（DSL 对象 / Lucene 串），
 * 但「已有条件 AND 新条件 / 已有条件 AND NOT 新条件」是同一件事，
 * 分开写在两个视图里必然漂移（IndexHub 的 Lucene 串此前就没有排除分支）。
 */

/** 把一条已构建的查询子句并进 DSL 根对象；negate=true 时并进 must_not。 */
export function mergeFilterIntoQuery(root: any, clause: any, negate = false): any {
  const obj = root && typeof root === 'object' && !Array.isArray(root) ? root : {};
  const base = obj.query && typeof obj.query === 'object' && Object.keys(obj.query).length ? obj.query : null;
  if (negate) {
    return base
      ? { bool: { must: [base], must_not: [clause] } }
      : { bool: { must_not: [clause] } };
  }
  return base ? { bool: { must: [base], filter: [clause] } } : clause;
}

/** 把一条 Lucene 子句并进检索词；negate=true 时用 NOT。 */
export function appendLuceneClause(cur: string, clause: string, negate = false): string {
  const base = (cur || '').trim();
  const next = negate ? 'NOT ' + clause : clause;
  return base ? '(' + base + ') AND ' + next : next;
}
