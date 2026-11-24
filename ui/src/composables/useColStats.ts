import { summarize } from '../utils/summarize';
import { distBinsOf } from '../utils/distBins';
import { typeTierSuppressed } from '../utils/semanticGuard';

/* 列详情统计内核下沉（RT P2-3 首发逻辑泛化，QRT 复用）——
 去重值数 / 空值数 / Σ·avg·min·max / 前 5 高频值。口径与 RT 既有实现一致：
 — 行集由调用方注入（RT=筛选后行集「所见即所析」，QRT=筛选后行集同口径）；
 — 空值 = null/undefined/''（与 RT colDetailStats 口径一致）；
 — 数值统计缺省走 summarize 硬口径（typeof number 且有限）；调用方传 isNumeric
 （QRT：fieldTypes 数值型优先、无类型映射回落采样）时数字字符串也计入；
 — 高频值计数与 useColFilters.filterVals 同口径（normVal 归一、首现序，
 超 5 个时按计数降序取前 5）。 */

export interface ColDetailStats {
  col: string;
  type: string;
  distinct: number;
  empty: number;
  /** 非空值计数（rows.length - empty，empty 旁零成本派生）——
 双内核 tfoot 聚合行 count 档（useAggRow AggNum.count? 注入）与列详情弹窗共用 */
  count: number;
  numeric: { sum: number; avg: number; min: number; max: number } | null;
  /** 数值中位数（数值子集排序取中；偶数取中间两值均值）；非数值列 null。
 ⚠放顶层而非 numeric 内——useColStats.spec:25/31 对 numeric 做 toEqual 四值形状锁，
 内嵌新增键会打翻既有锁；tfoot「· med」档经 AggNum.median 可选注入 */
  median: number | null;
  /** 空值率（empty/(empty+count) 派生；0 行=0）——列详情弹窗「空值率」行 */
  emptyRate: number;
  top: { v: any; n: number }[];
  /** 高频值全量条目数（计数 Map 展开的 entries.length，slice 前口径）——
 弹窗标题「前 N / 共 M」的 M；topN 截断只影响 top 不影响本值 */
  topTotal: number;
  /** 值分布等宽 8 桶（531 遗留件）——数值点收集与 seriesOf 同硬口径
 （typeof number 且有限；isNumeric force 不放大，Σ/分布口径分离）；数值点<2
 （空列/非数值列/单点）→ null。外包 {bins} 形状便于后续扩位。 */
  dist: { bins: { from: number; to: number; count: number }[] } | null;
}

/** 数值块单趟统计：force=false 与 summarize 同硬口径；force=true 数字字符串一并计入。
 附收数值子集（median 取中需要随机访问，单趟 min/max 铁律外仅多一份
 数值子集物化——vals 本就在 statsOf 物化，增量=数值子集引用） */
function numStats(vals: unknown[], force: boolean) {
  let n = 0, sum = 0, min = 0, max = 0;
  const nums: number[] = [];
  for (const v of vals) {
    let num = NaN;
    if (typeof v === 'number' && Number.isFinite(v)) num = v;
    else if (force && typeof v === 'string' && v.trim() !== '') num = Number(v);
    if (Number.isFinite(num)) {
      if (n === 0) { min = num; max = num; }
      else { if (num < min) min = num; if (num > max) max = num; }
      sum += num; n++;
      nums.push(num);
    }
  }
  if (!n) return null;
  /* median（升序取中；偶数取中间两值均值） */
  const sorted = nums.sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { sum, avg: sum / n, min, max, median };
}

/* 迷你走势采样（聚合行 SparkLine 数据源，QRT/RT tfoot 同消费）——
 单趟遍历只收 typeof number 且有限（与 numStats 同硬口径，对象/串列天然抑制），
 超 cap 截前 cap（保行序=走势时间序） */
function seriesOfImpl(rows: any[], getVal: (row: any, col: string) => any, col: string, cap: number): number[] {
  const out: number[] = [];
  for (const row of rows) {
    const v = getVal(row, col);
    if (typeof v === 'number' && Number.isFinite(v)) {
      out.push(v);
      if (out.length >= cap) break;
    }
  }
  return out;
}

/* 值分布等宽 8 桶（531 遗留件）——收集与 seriesOfImpl 同硬口径
 （typeof number 且有限；isNumeric force 不放大，Σ/分布口径分离）；数值点<2
 （空列/非数值列/单点）→ null。左闭右开等宽分桶，最大值钳末桶防溢出；
 min==max（span=0）退化：全落桶 0，8 桶形状不变（渲染侧单柱满高）。
 纯函数体平移 utils/distBins.ts 单源（弹窗与聚合行 mini-bar 同源复用），
 本处 dist: distBinsOf(vals) 委托——口径逐字不动（colDetailDist561 行为锁保真）。
 aggOn 开关属聚合行消费侧概念（seriesOf 先例：出口不带开关，由消费方决定调不调），
 弹窗路径无此上下文——零接线，消费侧经 stats 透传自动获益。 */

export function useColStats(opts: {
  /** 统计行集（通常=筛选后行集） */
  rows: () => any[];
  /** (row, col) → 单元格原始值 */
  getVal: (row: any, col: string) => any;
  /** 值展示文案（弹窗高频值清单用，与调用方筛选弹层同一口径） */
  labelOf: (v: any) => string;
  /** 列的 ES 类型（列名→类型映射；缺省空串=弹窗不显示类型徽标） */
  fieldType?: (col: string) => string;
  /** 强制数值口径（数字字符串计入 Σ/avg/min/max）；缺省走 summarize 硬口径 */
  isNumeric?: (col: string) => boolean;
  /** 高频值条数上限（缺省 5 保既有契约）；topTotal 恒为截断前全量条目数 */
  topN?: number;
}) {
  /* 显式非语义守卫消费（531 遗留件③）——binary/_source 等抑制列 dist/seriesOf
 退役（值形态硬口径之外的第二道显式标注守卫，typeTiers 同源）；
 Σ/avg/中位/top5 数值与计数口径不涉（只抑制「分档展示」语义面）。 */
  const suppressed = (col: string) => typeTierSuppressed(col, opts.fieldType?.(col));

  function statsOf(col: string): ColDetailStats {
    const rows = opts.rows();
    const vals = rows.map(r => opts.getVal(r, col));
    const empty = vals.filter(v => v === null || v === undefined || v === '').length;
    /* 去重复用 summarize（对象 JSON 归一）；数值块走 numStats——
 summarize 硬口径不支持「数字字符串计入」，force 分支单趟自算（同 min/max 单趟铁律） */
    const distinct = summarize(vals).distinct;
    /* numStats 内算 median，外露面 numeric 保持既有四值形状逐字节
 （useColStats.spec:25/31 toEqual 形状锁），median 提为 ColDetailStats 顶层字段 */
    const num = numStats(vals, opts.isNumeric?.(col) ?? false);
    const numeric = num ? { sum: num.sum, avg: num.avg, min: num.min, max: num.max } : null;
    const counts = new Map<string, { v: any; n: number }>();
    for (const row of rows) {
      const v = opts.getVal(row, col);
      const k = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      const hit = counts.get(k);
      if (hit) hit.n++;
      else counts.set(k, { v, n: 1 });
    }
    let entries = [...counts.values()];
    /* topN 可配（缺省 5 契约不变）；topTotal 在 slice 前记录全量条目数 */
    const topN = opts.topN ?? 5;
    if (entries.length > topN) entries.sort((a, b) => b.n - a.n);
    const topTotal = entries.length;
    entries = entries.slice(0, topN);
    /* median 顶层档 + emptyRate 派生档（empty+count=全量，0 行=0）；
 dist 值分布等宽 8 桶档（distOf 自收硬口径点，非数值列 null） */
    return {
      col, type: opts.fieldType?.(col) ?? '', distinct, empty,
      count: vals.length - empty, median: num ? num.median : null,
      emptyRate: vals.length ? empty / vals.length : 0,
      numeric, top: entries, topTotal,
      /* 守卫列 dist 恒 null（委托 utils/distBins 单源） */
      dist: suppressed(col) ? null : distBinsOf(vals),
    };
  }
  /* 迷你走势采样出口（缺省 cap=60；超 cap 截前 cap）
 守卫列恒 []（分档展示退役，aggSpark 消费侧天然不出） */
  function seriesOf(col: string, cap = 60): number[] {
    if (suppressed(col)) return [];
    return seriesOfImpl(opts.rows(), opts.getVal, col, cap);
  }
  /* tfoot 空值率档出口（emptyRate×100 后 Math.round 取整 %，与 
 QRT/RT aggEmptyPct 内联实现逐字语义等值）——双内核双份退役换调用，口径单源化；
 与 ColDetailModal.emptyRatePct 同源取整口径 */
  function emptyPctOf(col: string): number {
    return Math.round((statsOf(col).emptyRate ?? 0) * 100);
  }
  return { statsOf, seriesOf, emptyPctOf, labelOf: opts.labelOf };
}
