/**
 * 选区/聚合统一统计（dbx 选区底栏聚合对位——Sum/Average/格数一行直读）。
 *
 * 口径铁律：数值 = typeof number 且 Number.isFinite——数字字符串/NaN/Infinity/null/布尔
 * 一律计入 skipped（产线聚合口径必须硬；parseFloat 宽口径是排序语义，不给聚合用）。
 * min/max 单趟 reduce——此前调用点 Math.min(...nums) 的展开参数在万级数组会 RangeError
 * （栈溢出），聚合集一律走本函数，不许回退到展开写法。
 */
interface Summary {
  /** 全部格数 */
  count: number;
  /** 数值格数 */
  numCount: number;
  /** 非数值格数（count - numCount），含 null/字符串/NaN/Infinity/布尔 */
  skipped: number;
  /** 去重值数（对象按 JSON.stringify 归一） */
  distinct: number;
  sum: number;
  /** numCount=0 时为 null——调用方据此隐藏 Σ/avg/min/max，只显示 count/distinct */
  avg: number | null;
  min: number | null;
  max: number | null;
}

export function summarize(values: unknown[]): Summary {
  let count = 0, numCount = 0, sum = 0, min = NaN, max = NaN;
  const seen = new Set<string>();
  for (const v of values) {
    count++;
    seen.add(typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));
    if (typeof v === 'number' && Number.isFinite(v)) {
      numCount++;
      sum += v;
      if (numCount === 1 || v < min) min = v;
      if (numCount === 1 || v > max) max = v;
    }
  }
  return {
    count,
    numCount,
    skipped: count - numCount,
    distinct: seen.size,
    sum: numCount ? sum : 0,
    avg: numCount ? sum / numCount : null,
    min: numCount ? min : null,
    max: numCount ? max : null,
  };
}
