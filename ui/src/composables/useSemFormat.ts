/* ═══ W-B：语义格式化共享件（bytes / duration / percent 三型）═══
 与既有 W7 语义层（RT/QRT 内联 date 本地化 + 数值千分位）互补：那层管「类型驱动的
 通用可读性」，本件管「值域驱动的单位人性化」——纯函数、无状态、不落盘。
 契约：命中三型 → { text, tone? }；不命中 → null（调用方回落既有渲染）。
 显示加工、导出/复制/title 恒 raw（与 exportCell「只加工导出」反向对齐）。

 命中两路（显式标注压住按值推断，防跨型误伤）：
 ① effType 语义标注（bytes/duration/percent 族）→ 该型全量格式化；
 ② 按值推断（无三型标注时）——percent（0..1 数字 / 以 % 结尾的 0..100 串）；
 duration（纯数字 ≥1000 视为 ms，唯一裸数字推断型：ms→s 边界明确）；
 bytes 不做裸数字推断（任意 ≥1000 数字与金额/计数无法区分，必须显式标注）。 */

interface SemFmt {
  text: string;
  /* 全站 pill 五档语义色（statusPill 同语言）：percent 分档用 */
  tone?: 'g' | 'y' | 'r' | 'b' | 'n';
}

/* ═══ W3：显式非语义类型抑制守卫（531/533 两次主项的内核收口）═══
 noInfer=true 抑制「按值推断」链（裸数字 ≥1000 判 ms / 0..1 判 percent / % 串判 percent）——
 供两内核 semRawCols prop 消费（列名命中即抑制）；显式三型标注判定（bytes/duration/percent
 正则族）不受影响：语义标注在场的列，推断压不压都得走标注档。
 缺省不传=undefined，既有行为逐字节不变（qrtKernel530 零增量锁口径）。 */
interface SemFmtOpts { noInfer?: boolean }

/* effType 语义标注判定（ES 基本类型不误伤：'byte' 整数 ≠ 'bytes' 字节量） */
const BYTES_TYPE_RE = /(^|_)(bytes|byte_size|size_bytes)$/;
const DURATION_TYPE_RE = /(^|_)(duration|millis|milliseconds|seconds|secs?|minutes|hours)$|_ms$/;
const PERCENT_TYPE_RE = /(^|_)(percent|percentage|pct|ratio|fraction|progress)$/;

const BYTES_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
/* 1024 进制档位（1.2 MB 形态）；B 档整数直出 */
function bytesText(n: number): string {
  let u = 0;
  let v = n;
  while (v >= 1024 && u < BYTES_UNITS.length - 1) { v /= 1024; u++; }
  const s = u === 0 ? String(v) : (Math.round(v * 10) / 10).toFixed(1);
  return `${s} ${BYTES_UNITS[u]}`;
}

/* ═══ W3：bytes 显式标注列的「ES 带单位字节串」档 ═══
 store.size 类字段直出 '1.2mb'/'10.5 GB' 串（BrowserView 存储:bytes 通道平移的内核前置
 ——此前该列只能槽内 parseBytes 化解，槽退役后显示归 semOn 单链）。判据镜像
 utils/format.parseBytes 同一正则（数字+可选 b/kb/mb/gb/tb/pb，大小写/空白容忍），
 非字节串（'12,345' 计数串、ISO 日期等）NaN 不误伤。 */
const BYTES_STR_RE = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb|pb)?$/i;
const BYTES_STR_EXP: Record<string, number> = { b: 0, kb: 1, mb: 2, gb: 3, tb: 4, pb: 5 };
function bytesStrNum(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = BYTES_STR_RE.exec(v.trim());
  if (!m) return null;
  return Number(m[1]) * Math.pow(1024, BYTES_STR_EXP[(m[2] || 'b').toLowerCase()] ?? 0);
}

/* 纯数字（含数字字符串）解析；其余 NaN */
function numOf(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^[+-]?\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return NaN;
}
const isFiniteNum = (n: number) => Number.isFinite(n);

/* percent 分档 tone：比例 ≥0.9 红 / ≥0.7 黄 / 其余绿（0..100 值先归一到 0..1） */
function percentTone(ratio: number): SemFmt['tone'] {
  if (ratio >= 0.9) return 'r';
  if (ratio >= 0.7) return 'y';
  return 'g';
}
/* 数值 → '85%' / '85.6%'（一位小数去尾零） */
function percentText(p: number): string {
  const r = Math.round(p * 10) / 10;
  return `${Number.isInteger(r) ? String(r) : r.toFixed(1)}%`;
}

/**
 * 语义格式化：bytes（1024 进制档位制 → 1.2 MB；ES 带单位字节串 '1.2mb' 同档）/
 * duration（纯数字≥1000 视为 ms → 1.2s；已有 s/ms 后缀原样）/
 * percent（0..1 数字或以 % 结尾的 0..100 串 → 分档 tone：≥0.9 红 / ≥0.7 黄 / 其余绿）。
 * @param v 单元格原始值（raw，恒不修改）
 * @param effType 字段类型标注（显式 fieldTypes ∪ 按值采样档；空串=无标注走按值推断）
 * @param opts ：noInfer=true 抑制「按值推断」链（semRawCols 命中列显式保 raw，
 * 显式三型标注判定不受影响）；缺省 undefined=既有行为逐字节不变
 * @returns 命中三型 → { text, tone? }；否则 null（调用方回落既有渲染链）
 */
export function semFormat(v: unknown, effType: string, opts?: SemFmtOpts): SemFmt | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean' || typeof v === 'object') return null;

  /* 显式三型标注互斥（标注谁走谁的全量档），压住按值推断 */
  if (PERCENT_TYPE_RE.test(effType)) {
    if (typeof v === 'number' && isFiniteNum(v)) {
      if (v >= 0 && v <= 1) return { text: percentText(v * 100), tone: percentTone(v) };
      if (v > 1 && v <= 100) return { text: percentText(v), tone: percentTone(v / 100) };
    } else if (typeof v === 'string' && /^[+-]?\d+(\.\d+)?\s*%$/.test(v.trim())) {
      const n = parseFloat(v);
      if (n >= 0 && n <= 100) return { text: v.trim(), tone: percentTone(n / 100) };
    }
    return null;
  }
  if (DURATION_TYPE_RE.test(effType)) {
    const n = numOf(v);
    if (isFiniteNum(n) && n >= 0) {
      return { text: n < 1000 ? `${n} ms` : `${(Math.round(n / 100) / 10).toFixed(1)}s` };
    }
    return null; /* 已有 s/ms 后缀等非纯数字原样（不命中 → 回落既有渲染） */
  }
  if (BYTES_TYPE_RE.test(effType)) {
    const n = numOf(v);
    if (isFiniteNum(n) && n >= 0) return { text: bytesText(n) };
    const sn = bytesStrNum(v); /* ：'1.2mb' 带单位字节串档（显式标注不受 noInfer 影响） */
    if (sn !== null && sn >= 0) return { text: bytesText(sn) };
    return null;
  }

  /* ── 无三型标注 → 按值推断（noInfer 抑制档：semRawCols 命中列显式保 raw）──
 percent：0..1 数字（值域即信号）或 % 结尾 0..100 串；裸数字 1..100 不推断
 （与金额/计数无法区分）。duration：裸数字 ≥1000 视为 ms（唯一裸数字推断型）。 */
  if (opts?.noInfer) return null;
  if (typeof v === 'number' && isFiniteNum(v)) {
    if (v >= 0 && v <= 1) return { text: percentText(v * 100), tone: percentTone(v) };
    if (v >= 1000) return { text: `${(Math.round(v / 100) / 10).toFixed(1)}s` };
  } else if (typeof v === 'string' && /^[+-]?\d+(\.\d+)?\s*%$/.test(v.trim())) {
    const n = parseFloat(v);
    if (n >= 0 && n <= 100) return { text: v.trim(), tone: percentTone(n / 100) };
  }
  return null;
}
