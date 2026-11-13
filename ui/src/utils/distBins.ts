/* （531 遗留件②收口）：值分布等宽 8 桶纯函数单源——
 原 useColStats 私有 distOf 逐字平移本院（独占域 utils），列详情弹窗（stats.dist 经
 useColStats 委托）与聚合行 dist mini-bar（useAggRow aggDist → TableAggFoot）同源复用。
 口径（colDetailDist561 行为锁保真，逐字不动）：
 — 数值点收集只收 typeof number 且有限（isNumeric force 不放大，Σ/分布口径分离）；
 — 数值点 <2（空列/非数值列/单点）→ null；
 — 左闭右开等宽分桶，最大值钳末桶防溢出；
 — min==max（span=0）退化：全落桶 0，8 桶形状不变（渲染侧单柱满高）。 */

export interface DistBin { from: number; to: number; count: number }

export function distBinsOf(vals: unknown[]): { bins: DistBin[] } | null {
  const nums: number[] = [];
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) nums.push(v);
  }
  if (nums.length < 2) return null;
  let min = nums[0]!, max = nums[0]!;
  for (const v of nums) { if (v < min) min = v; if (v > max) max = v; }
  const span = max - min;
  const bins = Array.from({ length: 8 }, (_, i) => ({
    from: min + (span / 8) * i,
    to: min + (span / 8) * (i + 1),
    count: 0,
  }));
  for (const v of nums) {
    const idx = span > 0 ? Math.min(Math.floor(((v - min) / span) * 8), 7) : 0;
    bins[idx]!.count++;
  }
  return { bins };
}
