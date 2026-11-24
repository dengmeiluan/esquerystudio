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

export type HistKind = 'date' | 'keyword' | 'numeric';
export interface HistFieldMeta { path: string; type: string }
export interface HistCandidate extends HistFieldMeta {
  kind: HistKind;
  /** ID 类等「可画但通常无业务含义」的字段：仅在用户显式选择时使用 */
  weak?: boolean;
  note?: string;
  /** 数值直方图的分桶宽度（仅 kind=numeric 时给出） */
  interval?: number;
}
export interface HistRejection extends HistFieldMeta { reason: string }

const CONST_FIELD_RE = /^_(?:class|type|index|id|score|routing)$/;
const ARRAY_NAME_RE = /(?:Array|List|Ids?)$/;

function lastSeg(path: string): string {
  const parts = String(path).split('.');
  return parts[parts.length - 1] || '';
}
export function isNumericType(t: string | undefined): boolean {
  return /^(?:long|integer|short|byte|double|float|half_float|scaled_float|unsigned_long)$/.test(String(t || ''));
}
/** ID 类字段（sentimentId / dm_id / comUniCode …）——不作为自动分桶候选 */
export function isIdLikeField(path: string): boolean {
  const s = lastSeg(path);
  return /(?:^|[._])(?:id|ids|uuid|code)$/i.test(s) || /[a-z0-9]Ids?$/.test(s);
}

function collectValues(hits: Hit[], path: string): unknown[] {
  const parts = path.split('.');
  const out: unknown[] = [];
  const walk = (v: unknown, i: number): void => {
    if (i >= parts.length) {
      if (Array.isArray(v)) v.forEach(x => out.push(x));
      else out.push(v);
      return;
    }
    if (v && typeof v === 'object') walk((v as Record<string, unknown>)[parts[i]], i + 1);
  };
  for (const h of hits || []) walk(h?._source, 0);
  return out.filter(v => v !== null && v !== undefined && v !== '');
}

/** 数值直方图分桶宽度：按样本范围取 1/2/5×10^n，约 target 桶 */
export function niceNumericInterval(min: number, max: number, target = 30): number {
  const span = max - min;
  if (!(span > 0)) return 1;
  const raw = span / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return Math.max(1, step * mag);
}

/**
 * 直方图字段诊断（688）：把 mapping 字段分成「可画」与「不适用」两列，
 * 并在有样本命中时用实际值排除常量 / ID / 数组 / 无值字段。
 * 产线锚（bond_management_sentiment_title）：mapping 仅 _class(keyword 常量) /
 * sentimentId(keyword ID) / title(text 无 .keyword)——过去只显示一句「未识别到」，
 * 用户无从判断是组件坏了还是索引确实没有可分桶字段。
 */
export function analyzeHistFields(fields: HistFieldMeta[], hits: Hit[]): { candidates: HistCandidate[]; rejected: HistRejection[] } {
  const candidates: HistCandidate[] = [];
  const rejected: HistRejection[] = [];
  const all = fields || [];
  const hasKwSub = (p: string) => all.some(f => f.path === p + '.keyword');
  for (const f of all) {
    const p = String(f.path || '');
    const t = String(f.type || '');
    if (!p) continue;
    if (CONST_FIELD_RE.test(p)) {
      rejected.push({ path: p, type: t, reason: t === 'keyword' ? '系统/常量字段，不参与分桶' : '系统字段' });
      continue;
    }
    if (t === 'date' || t === 'date_nanos') {
      candidates.push({ path: p, type: t, kind: 'date' });
      continue;
    }
    const vals = collectValues(hits || [], p);
    if (t === 'keyword') {
      if (isIdLikeField(p)) {
        if (vals.length) candidates.push({ path: p, type: t, kind: 'keyword', weak: true, note: 'ID 类字段，分布通常无业务含义' });
        else rejected.push({ path: p, type: t, reason: 'ID 类字段，分布无业务含义' });
        continue;
      }
      if (vals.length) {
        const uniq = new Set(vals.map(v => String(v)));
        if (uniq.size <= 1) {
          rejected.push({ path: p, type: t, reason: '常量字段（样本仅 1 个值）' });
          continue;
        }
      }
      candidates.push({ path: p, type: t, kind: 'keyword', ...(vals.length ? {} : { note: '样本暂无数值，仍可按词条分桶' }) });
      continue;
    }
    if (isNumericType(t)) {
      if (ARRAY_NAME_RE.test(lastSeg(p))) {
        rejected.push({ path: p, type: t, reason: '数组字段，无法直接分桶' });
        continue;
      }
      if (isIdLikeField(p)) {
        rejected.push({ path: p, type: t, reason: 'ID 类数值字段，分布无业务含义' });
        continue;
      }
      const nums = vals.map(v => Number(v)).filter(v => Number.isFinite(v));
      if (!nums.length) {
        rejected.push({ path: p, type: t, reason: '无样本数值，无法确定分桶宽度' });
        continue;
      }
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      if (min === max) {
        rejected.push({ path: p, type: t, reason: '样本值恒定，无法形成分布' });
        continue;
      }
      candidates.push({ path: p, type: t, kind: 'numeric', interval: niceNumericInterval(min, max) });
      continue;
    }
    if (t === 'text') {
      if (hasKwSub(p)) continue; /* 子字段 title.keyword 已作为独立候选出现，父字段不重复报错 */
      rejected.push({ path: p, type: t, reason: 'text 无 .keyword 子字段，无法分桶' });
      continue;
    }
    if (t === 'object' || !t) {
      rejected.push({ path: p, type: t, reason: '容器/未知类型，不能直接分桶' });
      continue;
    }
    rejected.push({ path: p, type: t, reason: `类型 ${t} 不支持直方图` });
  }
  /* 自动优先：date → keyword → numeric；ID 类（weak）恒排最后，仅供手动选择 */
  const rank = (c: HistCandidate) => (c.weak ? 9 : c.kind === 'date' ? 0 : c.kind === 'keyword' ? 1 : 2);
  candidates.sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
  return { candidates, rejected };
}

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
export function buildHistAgg(field: string, fieldType: string | undefined, verBelow650: boolean, interval?: number): Record<string, unknown> {
  if (fieldType === 'keyword') return { terms: { field, size: 60, order: { _key: 'asc' } } };
  /* 688：显式选择的数值度量（score/amount…）走 histogram 固定桶宽；
     自动路径（无 interval）保持既有 date_histogram 系——ES 接受数值 epoch 字段，
     旧契约与降级链零变化 */
  if (isNumericType(fieldType) && interval && interval > 0) {
    return { histogram: { field, interval } };
  }
  return verBelow650
    ? { date_histogram: { field, interval: 'day' } }
    : { auto_date_histogram: { field, buckets: 60 } };
}
