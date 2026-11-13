/* 1048：SQL 结果形状识别——只把「两列且第二列是数值」的聚合结果画成分布图。
   不猜业务语义：列数不是 2 / 行数 <2 / 第二列非数值 / 第一列是 id/code 类高基数标识
   → 返回 null，表格照常显示（宁缺勿错）。值列支持 number 与数字字符串（long 精度保真
   解析可能给字符串）。 */
export interface SqlSeriesBucket { key: string; doc_count: number }
export interface SqlSeries {
  labelCol: string;
  valueCol: string;
  buckets: SqlSeriesBucket[];
  total: number;
}

const ID_LIKE = /(^|[_\s])(id|code|no|uuid|key)$/i;
const NUMERIC_TYPES = new Set([
  'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float',
  'scaled_float', 'unsigned_long', 'token_count',
]);

const isNumericType = (t?: string) => !!t && NUMERIC_TYPES.has(String(t).toLowerCase());
const toNum = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const isLabel = (v: unknown): boolean => v != null && typeof v !== 'object';

export function sqlAggSeries(
  cols: ReadonlyArray<{ name: string; type?: string }>,
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
): SqlSeries | null {
  if (cols.length !== 2 || rows.length < 2) return null;
  const [labelCol, valueCol] = cols;
  if (ID_LIKE.test(labelCol.name.trim())) return null;
  if (isNumericType(labelCol.type)) {
    /* 纯数值首列仅在像时间/分类维度时绘图（年/月/日/分桶别名）；id/金额等跳过 */
    if (!/(year|month|day|date|time|bucket|hist|group|key|term|interval)/i.test(labelCol.name)) return null;
  }
  const buckets: SqlSeriesBucket[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const r of rows) {
    const label = r?.[0];
    const n = toNum(r?.[1]);
    if (!isLabel(label) || n == null) continue;
    const key = String(label);
    if (seen.has(key)) continue;   // 同键只取首行（SQL 聚合正常不会重复，防御异常回包）
    seen.add(key);
    buckets.push({ key, doc_count: n });
    total += n;
  }
  if (!buckets.length) return null;
  return { labelCol: labelCol.name, valueCol: valueCol.name, buckets, total };
}
