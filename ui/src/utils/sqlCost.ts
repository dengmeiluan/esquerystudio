/* 1050：SQL 高开销/易误读查询的前置提示（纯函数、零请求、只提示不拦截）。
   只报真实结构风险，不猜数据量；最多返回 2 条，避免编辑时噪音。
   `fix: 'limit'` 仅表示「补 LIMIT 可控制返回量」，不宣称能降低扫描成本。 */
export interface SqlCostHint {
  id: 'group-no-where' | 'select-star-no-limit' | 'leading-wildcard' | 'order-no-limit' | 'huge-limit';
  severity: 'warn' | 'hint';
  message: string;
  suggestion: string;
  fix?: 'limit';
}

export function sqlCostHints(sql: string): SqlCostHint[] {
  const text = String(sql || '').trim();
  if (!text) return [];
  const hasWhere = /\bWHERE\b/i.test(text);
  const hasGroup = /\bGROUP\s+BY\b/i.test(text);
  const hasOrder = /\bORDER\s+BY\b/i.test(text);
  const limitM = /\bLIMIT\s+(\d+)/i.exec(text);
  const hasLimit = !!limitM;
  const out: SqlCostHint[] = [];

  if (hasGroup && !hasWhere) {
    out.push({
      id: 'group-no-where', severity: 'warn',
      message: 'GROUP BY 没有 WHERE：会对整个索引做分组',
      suggestion: '补时间窗/主体等 WHERE 条件缩小扫描面；LIMIT 只能限制返回桶数，不能减少扫描',
    });
  }
  if (!hasLimit && /SELECT\s+\*/i.test(text)) {
    out.push({
      id: 'select-star-no-limit', severity: 'hint',
      message: 'SELECT * 未加 LIMIT：返回量依赖 fetch_size 截断',
      suggestion: '补 LIMIT 或 WHERE 明确返回边界', fix: 'limit',
    });
  }
  if (!hasLimit && hasOrder) {
    out.push({
      id: 'order-no-limit', severity: 'hint',
      message: 'ORDER BY 未加 LIMIT：全量排序结果可能很大',
      suggestion: '补 LIMIT 控制返回量', fix: 'limit',
    });
  }
  if (/LIKE\s+['"]%/i.test(text)) {
    out.push({
      id: 'leading-wildcard', severity: 'warn',
      message: 'LIKE 以 % 开头：无法利用索引前缀，可能全表扫描',
      suggestion: '尽量去掉前置 %，或改用全文检索条件',
    });
  }
  if (limitM && Number(limitM[1]) > 10000) {
    out.push({
      id: 'huge-limit', severity: 'warn',
      message: `LIMIT ${limitM[1]} 过大：一次性拉取会占用大量内存与网络`,
      suggestion: '改小 LIMIT 并用 cursor 分页，或增加 WHERE 收窄范围',
    });
  }
  /* 风险高的排前；同 id 只出一次；最多 2 条防噪音 */
  out.sort((a, b) => Number(b.severity === 'warn') - Number(a.severity === 'warn'));
  return out.slice(0, 2);
}

/** 在末尾补 LIMIT（仅用于返回量控制；已有 LIMIT 不重复追加） */
export function appendSqlLimit(sql: string, limit = 1000): string {
  const text = String(sql || '').trim().replace(/;\s*$/, '');
  if (!text || /\bLIMIT\s+\d+/i.test(text)) return sql;
  return `${text} LIMIT ${Math.max(1, Math.floor(limit))}`;
}
