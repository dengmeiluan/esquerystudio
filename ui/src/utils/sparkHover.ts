/**
 * 实时走势卡悬浮命中纯函数（/）。
 *
 * LiveDashboardView 五张走势卡的折线由视图内 sparklinePoints(Pct) 画出；本函数用**同一套
 * 点位公式**把「指针在卡宽内的分数位置」换算成最近采样点命中（序号/十字线 x/圆点 y/原值/
 * 采样时刻），保证十字线与圆点钉在曲线上而不是悬在半空。视图只负责把命中结果摆进
 * HTML 绝对定位层（十字线/圆点/读出不进 SVG——preserveAspectRatio=none 非等比缩放
 * 会把圆拉成椭圆、文字变形，HistoryChart 约定同源）。
 */

export interface SparkHoverHit {
  /** 命中的采样点序号 */
  i: number;
  /** 十字线 x（viewBox 宽度坐标） */
  x: number;
  /** 圆点 y（viewBox 高度坐标，与折线同刻度） */
  y: number;
  /** 指针分数位置（0-1，已钳制） */
  frac: number;
  /** 该点原始值 */
  v: number;
  /** 该点采样时刻（ts 缺位时 0，视图按「未知」处理） */
  t: number;
}

/**
 * @param data 采样序列（≥2 点才有悬停意义）
 * @param ts 每点采样时刻（与 data 等长最佳；缺位回 0）
 * @param fracX 指针在卡宽内的分数位置（越界钳 0-1，NaN 归 0）
 * @param W H viewBox 尺寸（与折线同一坐标系）
 * @param mode 'pct'=0-100 固定刻度（越界值钳位）/ 'abs'=max(...data,1) 地板缩放
 */
export function sparkHoverAt(
  data: number[],
  ts: number[],
  fracX: number,
  W: number,
  H: number,
  mode: 'pct' | 'abs',
): SparkHoverHit | null {
  const n = data.length;
  if (n < 2) return null;
  const frac = Math.min(1, Math.max(0, Number.isFinite(fracX) ? fracX : 0));
  const i = Math.round(frac * (n - 1));
  const v = data[i];
  const y = mode === 'pct'
    ? H - Math.min(100, Math.max(0, v)) / 100 * H
    : H - v / Math.max(...data, 1) * H;
  return { i, x: i * (W / (n - 1)), y, frac, v, t: ts[i] ?? 0 };
}

/* ── （622 -D2）：悬浮层跟随阻尼 ──
 * 显示位置按帧向指针目标收敛（k=0.35 约四帧收敛，「跟手但不抖」折点）；
 * 首中直钉（无动画起点——liveHover589 的 frac=0 确定性断言依赖此语义）；
 * k=0（reduced-motion，组件以 matchMedia 直伞传入）退化为直钉——theme.css 全局
 * 兜底只覆盖 CSS transition，JS rAF 须自伞；不入 @media 块（633/adaptive556 同律）。 */

/** 阻尼系数（622 -D2 推荐案 a：约 4 帧收敛；k=0.5 快扫仍「跳」，k=0.25 起拖影）。 */
export const HOVER_DAMP_K = 0.35;

/** 单帧指数收敛：cur 向 target 走 k 比例。 */
export function dampStep(cur: number, target: number, k: number): number {
  return cur + (target - cur) * k;
}

interface HoverDamp {
  /** 当前显示位置（未命中=null）。 */
  readonly value: number | null;
  /** 收敛到位（|target-cur|<5e-4）。 */
  readonly settled: boolean;
  /** 更新指针目标；首次命中直钉（返回=当前显示位）。 */
  move(t: number): number;
  /** 推进一帧，返回当前显示位。 */
  frame(): number | null;
  /** 离开清位（下次悬浮重新直钉）。 */
  clear(): void;
}

export function createHoverDamp(k: number = HOVER_DAMP_K): HoverDamp {
  let cur: number | null = null;
  let target: number | null = null;
  const clamp01 = (t: number) => Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  return {
    get value() { return cur; },
    get settled() { return cur !== null && target !== null && Math.abs(target - cur) < 5e-4; },
    move(t: number) {
      target = clamp01(t);
      if (cur === null || k === 0) cur = target;
      return cur;
    },
    frame() {
      if (cur === null || target === null) return cur;
      cur = k === 0 ? target : dampStep(cur, target, k);
      if (Math.abs(target - cur) < 5e-4) cur = target;
      return cur;
    },
    clear() { cur = null; target = null; },
  };
}

/** 指针分数位置处的折线 y（相邻采样点线性插值）——阻尼滑行时圆点钉在曲线上。 */
export function lineYAtFrac(data: number[], frac: number, H: number, mode: 'pct' | 'abs'): number {
  const n = data.length;
  if (n < 2) return H;
  const f = Math.min(1, Math.max(0, Number.isFinite(frac) ? frac : 0));
  const pos = f * (n - 1);
  const i0 = Math.floor(pos);
  const i1 = Math.min(n - 1, i0 + 1);
  const t = pos - i0;
  const mx = Math.max(...data, 1);
  const yOf = (v: number) => mode === 'pct'
    ? H - Math.min(100, Math.max(0, v)) / 100 * H
    : H - v / mx * H;
  return yOf(data[i0]) + (yOf(data[i1]) - yOf(data[i0])) * t;
}
