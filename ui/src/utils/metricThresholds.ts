/**
 * 全局指标阈值单一真源（heap/cpu/disk 水位条与阈值线的 warn/bad 判定）。
 *
 * 背景：LiveDashboardView / DiagView / HealthReportView 三处曾各自硬编码一套阈值与颜色，
 * 同一数值在不同视图呈现不同颜色（如 heap 86% 在 A 处 bad 红、B 处 warn 黄），
 * 造成「同值不同色」漂移。此处统一收口：阈值判定（metricTone）与颜色映射（metricColor）
 * 全站只认这一张表，视图层不再自造阈值。
 */

type MetricKey = 'heap' | 'cpu' | 'disk';
type MetricTone = 'ok' | 'warn' | 'bad';

interface MetricThreshold {
  /** 进入警告档的阈值（水位条/阈值线画在此处） */
  warn: number;
  /** 进入严重档的阈值 */
  bad: number;
}

/** heap/cpu/disk 各自 warn/bad 阈值（百分比语义，0-100）。 */
export const METRIC_THRESHOLDS: Record<MetricKey, MetricThreshold> = {
  heap: { warn: 80, bad: 85 },
  cpu: { warn: 75, bad: 90 },
  disk: { warn: 80, bad: 90 },
};

/** 值 → 健康度分级：>= bad 为 bad，>= warn 为 warn，否则 ok（null/NaN 按 ok 兜底）。 */
export function metricTone(metric: MetricKey, value: number | null | undefined): MetricTone {
  const t = METRIC_THRESHOLDS[metric];
  const v = Number(value);
  if (!isFinite(v)) return 'ok';
  if (v >= t.bad) return 'bad';
  if (v >= t.warn) return 'warn';
  return 'ok';
}

/** 健康度 → CSS 语义色 token（--ok/--warn/--err）。 */
const TONE_COLOR: Record<MetricTone, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  bad: 'var(--err)',
};

/** 值 → 语义色 token（水位条填充统一走这里，杜绝同值不同色）。 */
export function metricColor(metric: MetricKey, value: number | null | undefined): string {
  return TONE_COLOR[metricTone(metric, value)];
}
