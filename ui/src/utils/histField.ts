/**
 * 直方图日期字段选择——值形态驱动，根治「字段名含 time 就当日期」的误伤。
 * 产线事故锚：sen「time」ntId 是 19 位 long（keyword 索引），旧嗅探按字段名命中 /time/i
 * 被塞进 date_histogram，ES 直接 400 连坐整个查询。
 */

const EPOCH_MS_MIN = Date.UTC(2000, 0, 1); // 946684800000
const EPOCH_MS_MAX = Date.UTC(2100, 0, 1); // 4102444800000
const EPOCH_S_MIN = EPOCH_MS_MIN / 1000;
const EPOCH_S_MAX = EPOCH_MS_MAX / 1000;

/**
 * 值是否长得像日期：ISO 前缀字符串，或落在 2000~2100 年 epoch 秒/毫秒窗口内的数字。
 * 纯数字字符串一律不算—— 起长整型经 parseJsonSafe 加引号保真成字符串（如 19 位 sentimentId），
 * 它们是 ID 不是时间。
 */
export function isDateLikeValue(v: unknown): boolean {
  if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(v);
  if (typeof v === 'number' && Number.isFinite(v)) {
    return (v >= EPOCH_S_MIN && v <= EPOCH_S_MAX) || (v >= EPOCH_MS_MIN && v <= EPOCH_MS_MAX);
  }
  return false;
}

type Hit = { _source: Record<string, unknown> };

/**
 * 从 hits 嗅探日期字段：只认值形态；字段名 /date|time/i 仅在多个候选间做优先级加分，
 * 名字本身永远不足以入选。
 */
export function sniffDateField(hits: Hit[]): string {
  let fallback = '';
  for (const h of hits || []) {
    for (const [k, v] of Object.entries(h?._source || {})) {
      if (!isDateLikeValue(v)) continue;
      if (/date|time/i.test(k)) return k;
      if (!fallback) fallback = k;
    }
  }
  return fallback;
}

/**
 * 直方图字段总入口：mapping 声明 type=date 的字段最可信（优先取名含 time/date 的）；
 * mapping 不可用时退回值形态嗅探。
 */
export function pickHistField(mappingDates: string[], hits: Hit[]): string {
  if (mappingDates?.length) {
    return mappingDates.find(f => /time|date/i.test(f)) || mappingDates[0];
  }
  return sniffDateField(hits);
}

/**
 * 直方图聚合体分档：keyword 型（ISO 日期串存成文本）走 terms 桶按 key 升序（ISO 串天然时序）；
 * date/数值/未知类型照旧走 date_histogram（ES 接受数值 epoch 字段）。
 * 产线锚：industry_hotspots_review_es 的 publishDate 是 keyword，注入 date_histogram
 * 直接 400， 降级把直方图永久剥掉（「直方图不显示了」事故）。
 */
export function buildHistAgg(field: string, fieldType: string | undefined, verBelow650: boolean): Record<string, unknown> {
  if (fieldType === 'keyword') return { terms: { field, size: 60, order: { _key: 'asc' } } };
  return verBelow650
    ? { date_histogram: { field, interval: 'day' } }
    : { auto_date_histogram: { field, buckets: 60 } };
}
