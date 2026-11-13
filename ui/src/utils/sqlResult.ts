/* 1075：SQL columnar 结果形态转换。
   ES `_sql` 的 columnar=true 返回 { columns, values }（按列数组），cursor 续页只认
   columnar/time_zone——大结果与深翻页用它更稳。表格/图表/导出仍吃行数组，这里做纯转换：
   values=[列1[], 列2[], …] → rows=[[r1c1,r1c2,…], …]。
   畸形形态（非数组/列长不一致）返回 []，不补 null 伪造行（宁缺勿错）。 */
export function columnarToRows(values: unknown): unknown[][] {
  if (!Array.isArray(values) || !values.length) return [];
  if (!values.every(c => Array.isArray(c))) return [];
  const cols = values as unknown[][];
  const len = cols[0].length;
  if (!cols.every(c => c.length === len)) return [];
  const rows: unknown[][] = new Array(len);
  for (let i = 0; i < len; i++) rows[i] = cols.map(c => c[i]);
  return rows;
}


/** 1078：导出时的诚实注脚——cursor 未取完只导出已加载行；结果过期要先重跑。
 * 返回空串表示无附加说明（正常全量/新鲜结果）。 */
export function exportCaveat(hasCursor: boolean, stale: boolean): string {
  const bits: string[] = [];
  if (hasCursor) bits.push('cursor 未取完，仅导出已加载行');
  if (stale) bits.push('结果已过期，请重新执行');
  return bits.length ? '；' + bits.join('；') : '';
}


/** 1079：响应形态守卫——合法 SQL 结果必有 rows（行式）或 values（列式）。
 * 两者都缺 = 代理/后端形态漂移，不能当「0 行成功」静默吞掉。 */
export function hasSqlRowsShape(r: unknown): boolean {
  const o = r as { rows?: unknown; values?: unknown } | null | undefined;
  return Array.isArray(o?.rows) || Array.isArray(o?.values);
}
