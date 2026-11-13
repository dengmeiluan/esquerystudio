/**
 * 诊断节点趋势采样单一真源（。
 *
 * 背景： HEAP 趋势 SparkLine 的采样逻辑内联在 DiagView（Map 推入 + 30 点截断），
 * 对称补齐 CPU 趋势时两份内联必然漂移；且「趋势线只能看形、读不出数」——
 * 悬浮摘要（近 N 次 min~max / 最新值）需要一处纯逻辑供双列复用。
 * 此处收口：pushSample（滚动窗口采样）与 trendTip（悬浮摘要文案）只认这一份。
 */

/** 趋势采样窗口上限（每轮刷新记 1 点，超出滚动丢弃最旧点） */
export const TREND_MAX = 30;

/**
 * 滚动窗口采样：按 key 推入一点（null / 非有限数按 0 兜底，与 Number(x ?? 0) 同口径），
 * 超出 max 滚动丢弃最旧点。直接原地改 hist（Map<节点名, 序列>），视图层持有 ref 即可触发更新。
 */
export function pushSample(hist: Map<string, number[]>, key: string, value: number | null | undefined, max = TREND_MAX): void {
  const arr = hist.get(key) || [];
  const v = Number(value);
  arr.push(isFinite(v) ? v : 0);
  if (arr.length > max) arr.shift();
  hist.set(key, arr);
}

/**
 * 趋势悬浮摘要（title）：
 * - 不足 2 点：给「采样中」指引（与格内占位文案语义一致，并说明何时出线）；
 * - 满 2 点：近 N 次采样 min ~ max · 最新值——趋势线从「只能看形」升级为「可读数」。
 * 数值取整展示（ES 节点指标为 0-100 整数百分比，小数位纯噪音）。
 */
export function trendTip(arr: number[] | undefined, unit = '%'): string {
  if (!arr || arr.length < 2) return '趋势采样中：每轮刷新记录一次，满 2 次后出趋势线';
  const min = Math.round(Math.min(...arr));
  const max = Math.round(Math.max(...arr));
  const last = Math.round(arr[arr.length - 1]);
  return `近 ${arr.length} 次采样：${min}${unit} ~ ${max}${unit} · 最新 ${last}${unit}`;
}
