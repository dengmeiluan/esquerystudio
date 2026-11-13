/** 格式化工具集 */
import { copyViaIntercept } from './clipboard';
import { semFormat } from '../composables/useSemFormat';

export function fmtNum(n: any): string {
  /* null/undefined 必须显示 '-' 而非 '0'——Number(null)===0 会把「无数据」冒充成真实计数（单测首跑逮住） */
  if (n == null || n === '') return '-';
  /* M7：超安全整数的「数字字符串」不走 Number——后端以字符串下发的雪花 ID/
 长单号/超大数值，Number 化再 toLocaleString 会输出丢精度错值。正则千分位保真：
 位数原样、只插逗号。（typeof number 的 >2^53 值在 JSON.parse 层已丢精度，无法前端挽救） */
  if (typeof n === 'string' && /^-?\d+$/.test(n) && !Number.isSafeInteger(Number(n))) {
    return n.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  const v = Number(n);
  if (!isFinite(v)) return String(n);
  return v.toLocaleString('en-US');
}

/** 紧凑数字（KPI 卡等窄容器）——336,466,995 在 866px iframe 里必被裁，
 * 主值用「3.36亿」量级一眼可读，精确值由调用方配 title/副文案展示 */
export function fmtNumCompact(n: any): string {
  if (n == null || n === '') return '-';
  const v = Number(n);
  if (!isFinite(v)) return String(n);
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2) + '万亿';
  if (a >= 1e8) return (v / 1e8).toFixed(2) + '亿';
  if (a >= 1e4) return (v / 1e4).toFixed(1) + '万';
  return v.toLocaleString('en-US');
}

export function fmtSize(v: any): string {
  if (v == null || v === '') return '-';
  const s = String(v).toLowerCase();
  if (/^\d+(\.\d+)?(kb|mb|gb|tb|b)$/.test(s)) return s;
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  const u = ['b', 'kb', 'mb', 'gb', 'tb'];
  let i = 0, x = n;
  while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
  return (i === 0 ? x : x.toFixed(1)) + u[i];
}

/** "34.5gb" → { num:"34.5", unit:"gb" }，用于「数值与单位拆开渲染、单位灰化弱显示」 */
export function splitSize(v: any): { num: string; unit: string } {
  const s = String(v ?? '').trim().toLowerCase();
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb|pb)?$/.exec(s);
  if (!m) return { num: s || '-', unit: '' };
  return { num: m[1], unit: m[2] || '' };
}

/** 人类可读字节串 → 字节数（"1.2gb" → 1.2×1024³）。排序比较用，非展示。
 不可解析/空返回 NaN（调用方据此沉底）。 */
export function parseBytes(v: any): number {
  if (v == null) return NaN;
  const s = String(v).trim().toLowerCase();
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb|pb)?$/.exec(s);
  if (!m) return NaN;
  const n = Number(m[1]);
  if (!isFinite(n)) return NaN;
  const exp: Record<string, number> = { b: 0, kb: 1, mb: 2, gb: 3, tb: 4, pb: 5 };
  return n * Math.pow(1024, exp[m[2] || 'b']);
}

/** store.size 单源——ES '4.9kb' 字节串或数字字节 → 友好字节串（'4.9 KB' 档，
 semFormat bytes 单源）。TopBar 首点消费；OverviewView/BrowserView 两处本地同名实现
 （语义层锁 看守）收口批再合并——本函数输出口径与它们逐字一致（同为
 parseBytes 归一 + semFormat bytes 档），合并零视觉漂移。契约差异：两本地版不可解析
 回落原串（不丢信息），本单源按批契约空值/无效回 '-'（消费点 pickedInfo 脏值不裸奔）；
 title/复制恒 raw 由调用方保。 */
export function storeSizeText(v?: string | number | null): string {
  if (v == null || v === '') return '-';
  return semFormat(parseBytes(v), 'bytes')?.text ?? '-';
}

export function fmtDur(ms: any): string {
  const n = Number(ms);
  if (!isFinite(n) || n < 0) return '-';
  if (n < 1000) return n + 'ms';
  if (n < 60000) return (n / 1000).toFixed(1) + 's';
  if (n < 3600000) return Math.floor(n / 60000) + 'm' + Math.round((n % 60000) / 1000) + 's';
  return Math.floor(n / 3600000) + 'h' + Math.round((n % 3600000) / 60000) + 'm';
}

/** 窗口尺寸标签（**不是** duration 格式化器，别拿它当 fmtDur 用）。
 *
 * 语义区别：fmtDur 回答「这件事耗了多久」，精度优先，故保留次级单位（1m5s / 1h1m）；
 * 本函数回答「这张图覆盖多大的时间窗」，是个近似档位标签，次级单位纯属噪音——
 * 趋势窗跨度由采样点首末时刻算出（liveMonitor.windowMs，任意值而非固定档），
 * 拿 fmtDur 渲染会得到「近 1m0s」「近 5m0s」「近 1h0m」这种不自然形态。
 * 策略：择一量级取整渲染（分钟 / 秒 / 小时），只在有余数时才降级带出次级单位。
 *
 * 调用方：LiveDashboardView 图表标题「近 X」。不要在此函数里加 duration 语义。 */
export function fmtWindow(ms: any): string {
  const n = Number(ms);
  if (!isFinite(n) || n <= 0) return '';
  if (n < 60000) return Math.round(n / 1000) + ' 秒';
  if (n < 3600000) {
    const m = Math.round(n / 60000);
    return m > 0 ? m + ' 分钟' : '1 分钟';
  }
  const h = Math.floor(n / 3600000);
  const m = Math.round((n % 3600000) / 60000);
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}

/** 相对时间。：传入 now（useNow 心跳）可让「Xm 前」随时间自更新——
 * 否则只在渲染瞬间算一次，面板开着十分钟还显示「4m 前」；
 * 超过 7 天相对值失去意义，直接给日期（跨年带年份）。 */
export function relTime(t: any, now?: number): string {
  const n = typeof t === 'number' ? t : Date.parse(String(t));
  if (!isFinite(n)) return '-';
  const base = now ?? Date.now();
  const d = base - n;
  if (d < 0) return '刚刚';
  if (d < 60000) return Math.floor(d / 1000) + 's 前';
  if (d < 3600000) return Math.floor(d / 60000) + 'm 前';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h 前';
  if (d < 7 * 86400000) return Math.floor(d / 86400000) + 'd 前';
  const dt = new Date(n);
  const p = (x: number) => String(x).padStart(2, '0');
  const md = `${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  return dt.getFullYear() === new Date(base).getFullYear() ? md : `${dt.getFullYear()}-${md}`;
}

/** 时间线日期分组标签：今天 / 昨天 / MM-DD（跨年 YYYY-MM-DD） */
export function dayLabel(t: any, now?: number): string {
  const n = typeof t === 'number' ? t : Date.parse(String(t));
  if (!isFinite(n)) return '-';
  const base = now ?? Date.now();
  const p = (x: number) => String(x).padStart(2, '0');
  const key = (x: Date) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  const d = new Date(n), b = new Date(base);
  const dk = key(d);
  if (dk === key(b)) return '今天';
  if (dk === key(new Date(base - 86400000))) return '昨天';
  return d.getFullYear() === b.getFullYear() ? dk.slice(5) : dk;
}

/* 钉死 Asia/Shanghai。
 起因：全站 20 处时间显示各写各的，且绝对时间不带时区标识——换台机器/服务器
 时区不同，读数的人无法判断看到的是哪个时区。后端一律给 epoch millis，
 前端原先用 new Date(ms) 按**本地**时区渲染，在 +08:00 的机器上碰巧是对的。

 locale 选 sv-SE 是判据不是偏好：它的默认输出恰好是 YYYY-MM-DD HH:mm:ss
 （ISO 风格、无斜杠、月份补零），省掉手工 padStart 拼接。

 formatter 在模块级建一次：构造 Intl.DateTimeFormat 是重操作，
 表格逐行调用会把它放大成可见卡顿。 */
const SH_FMT = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

export function fmtTime(t: any): string {
  const n = typeof t === 'number' ? t : Date.parse(String(t));
  if (!isFinite(n)) return t == null ? '-' : String(t);
  return SH_FMT.format(new Date(n));
}

/** 带时区标识，用于悬浮 title 与详情页——让人知道这是哪个时区。 */
export function fmtTimeTz(t: any): string {
  const n = typeof t === 'number' ? t : Date.parse(String(t));
  if (!isFinite(n)) return t == null ? '-' : String(t);
  return SH_FMT.format(new Date(n)) + ' (UTC+8)';
}

/** 状态 → pill 色。 W4：SUCCEEDED 补绿档（AdhocRebuildView jobStatusColor
 页内特例上提，该函数随之退役）；ABORTED 出红档——「中止≠失败」语义，落中性灰 n。 */
export function statusColor(s: any): string {
  const v = String(s || '').toUpperCase();
  if (['DONE', 'COMPLETED', 'SUCCESS', 'SUCCEEDED', 'GREEN', 'OK'].includes(v)) return 'g';
  if (v === 'ABORTED') return 'n';
  if (['FAILED', 'ERROR', 'RED'].includes(v)) return 'r';
  if (['RUNNING', 'IN_PROGRESS', 'YELLOW', 'REINDEXING', 'WAITING'].includes(v)) return 'y';
  if (['PAUSED', 'PENDING', 'INIT'].includes(v)) return 'b';
  return 'n';
}

/** 截断显示 */
export function trunc(v: any, len = 80): string {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > len ? s.slice(0, len) + '…' : s;
}

/** 剪贴板复制（返回是否成功，配合 .cpy 点击复制样式）——
 * v4：架构层统一管线，委托 utils/clipboard.ts 三层递进：
 * L1 Clipboard API（secure context）→ L2 copy 事件劫持（execCommand 仅触发，
 * setData 权威写入，与选区/焦点错位无关——根治「toast 已复制但 Ctrl+V 空」）
 * → L3 焦点门拿不到焦点返回 false（调用点显性报错+全选引导）。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* 无权限/无焦点等拒绝，落入 L2 */ }
  return copyViaIntercept(text);
}

/** 触发浏览器下载文本内容：Blob → objectURL → anchor.click → revoke。
 与 copyText 互补（复制/下载对称）；7 处导出（CSV/JSON/JSONL/Markdown）曾各自手写这 5 行样板。
 opts.bom：CSV 类导出前置 UTF-8 BOM，防 Excel 直接双击打开中文乱码；JSON 类导出勿开——
 前导 BOM 会破坏 JSON.parse。 */
/* 导出文件名时间戳（yyyyMMdd-HHmmss 本地时）——
 全站 downloadText 统一口径：可读时间戳替代 epoch 大数，多次导出不互覆、按名可排序 */
export function exportStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function downloadText(filename: string, content: string, mime: string, opts?: { bom?: boolean }): void {
  const url = URL.createObjectURL(new Blob([opts?.bom ? '\ufeff' + content : content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 触发浏览器下载二进制内容（xlsx 等字节流；与 downloadText 互补） */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** CSV 单元格转义（RFC 4180：双引号翻倍 + 整体引号包裹） */
export function csvCell(v: any): string {
  return '"' + String(v ?? '').replace(/"/g, '""') + '"';
}

/* CSV 文本组装单一出处——BOM（Excel 中文不乱码）+ 表头 + 行矩阵。
 此前 Browser/MatchMatrix/Security/Snapshots 四视图各自拼接同一模式 */
export function csvText(head: string[], rows: unknown[][]): string {
  const BOM = '﻿';
  const NL = String.fromCharCode(10);
  return BOM + head.map(csvCell).join(',') + NL + rows.map(r => r.map(csvCell).join(',')).join(NL);
}

/** CSV 单元格值格式化：空值 ∅、对象/数组 JSON 序列化（合并——
 SqlConsole/Lucene/PIT 三处同款局部函数，与 csvCell 配套使用） */
export function fmtCell(v: any): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** ES 健康状态 → 色 token（IndexHub / Browser 索引列表行共用） */
export function healthColor(h: string): string {
  return h === 'green' ? 'var(--ok)' : h === 'yellow' ? 'var(--warn)' : h === 'red' ? 'var(--err)' : 'var(--tx2)';
}

/** ES 健康状态 → .pill 档名（ W4：TopBar healthCls 页内版上提，与 healthColor
 同源分档）：green→g / yellow→y / 其余（red 及缺席）→r——健康徽标非绿即疑。 */
/* 返回域收窄 'g'|'y'|'r'（ sevPill 同款先例）——StatusPill tone prop 是
 五主档联合，string 直传 vue-tsc 报错；收窄对既有 class 串消费方零影响，
 HealthReportView 既有 as 断言变冗余但合法（其收口批可顺带摘除） */
export function healthPill(h: string): 'g' | 'y' | 'r' {
  return h === 'green' ? 'g' : h === 'yellow' ? 'y' : 'r';
}

/** ISO 串 → 'YYYY-MM-DD HH:mm:ss'（纯字符串整形到秒，不做时区换算；空值 '-'） */
export function fmtDate(s: any): string {
  if (!s) return '-';
  return String(s).replace('T', ' ').slice(0, 19);
}

/** ES hits.total 归一 → {value, gte}。ES7 默认 track_total_hits=10000，relation=gte 表示 value 是
 下界而非精确值，展示时应标「≥」避免误判「索引只有这么点 / 查询只命中这么多」。 */
export function totalOf(hits: any): { value: number; gte: boolean } {
  const t = hits?.total;
  if (t == null) return { value: 0, gte: false };
  if (typeof t === 'object') return { value: Number(t.value) || 0, gte: t.relation === 'gte' };
  return { value: Number(t) || 0, gte: false };
}

/* ── 时间戳 ↔ 标准时间(查询工作台: 条件值/结果表时间列的人类可读互转) ── */
/** "YYYY-MM-DD[ HH:mm[:ss]]" → epoch 毫秒(按本地时区);不匹配返回 null */
export function stdTimeToEpochMs(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  if (/^\d{10}$/.test(t)) return parseInt(t, 10) * 1000;
  if (/^\d{13}$/.test(t)) return parseInt(t, 10);
  const norm = t.replace(/\//g, '-').replace(' ', 'T');
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(norm);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  }
  const d2 = new Date(t);
  return isNaN(d2.getTime()) ? null : d2.getTime();
}

/** epoch 毫秒人性化（13 位数字落在 2008~2049 年区间才转换，
 19 位雪花 ID / 订单号不误伤）——ResultTable 与 QueryResultTable 共用 */
export function epochMsText(v: any): string | null {
  if (typeof v !== 'number' && !(typeof v === 'string' && /^\d{13}$/.test(v))) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1.2e12 || n > 2.5e12) return null;
  const d = new Date(n);
  const p2 = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

/** 前置：耗时四档语义档——QueryHistoryPanel/DevToolsView 同值同色两份定义收口单一出处。
 fast<100ms / ok<1s / slow<3s / veryslow；色值由使用方 scoped 样式或全局 .took-* 档承接 */
export function fmtTook(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
export function tookClass(ms: number): 'fast' | 'ok' | 'slow' | 'veryslow' {
  if (ms < 100) return 'fast';
  if (ms < 1000) return 'ok';
  if (ms < 3000) return 'slow';
  return 'veryslow';
}
