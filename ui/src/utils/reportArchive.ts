/**
 * 体检报告多份存档单一真源（。
 *
 * 背景：202 的「与上次体检对比」只把上一份存 sessionStorage——关页即丢、只能和最近一次比，
 * 处置后想看「比上午/昨天好多少」无从谈起。升级为 localStorage 环形存档：
 * 每次体检落一份（上限 ARCHIVE_MAX，超出滚动丢最旧），对比卡任选「基准/对照」两份做扁平 diff。
 * 此处收口：存档读写/截断/quota 降级/标签格式化只认这一份，视图层不自造存储细节。
 */
import { fmtTime } from './format';

/** 可注入的存储最小接口（测试用内存假存储，视图层传 localStorage） */
export interface ArchiveKv {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** 一份存档条目：ts=落档毫秒，score=综合得分（无则 null），data=报告本体 */
export interface ArchivedReport {
  ts: number;
  score: number | null;
  data: any;
}

export const ARCHIVE_KEY = 'esquerystudio.healthReport.archive.v1';
/** 存档上限：报告体含节点/索引明细（十 KB 级/份），8 份在 localStorage 5MB 限额内安全 */
export const ARCHIVE_MAX = 8;

/** 读存档（新→旧序）；坏 JSON/非数组/缺字段条目一律容忍剔除 */
export function loadArchive(kv: ArchiveKv): ArchivedReport[] {
  try {
    const raw = kv.getItem(ARCHIVE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((e: any) => e && typeof e.ts === 'number' && e.data && typeof e.data === 'object')
      .map((e: any) => ({ ts: e.ts, score: typeof e.score === 'number' ? e.score : null, data: e.data }));
  } catch { return []; }
}

/**
 * 报告落档：头部插入（新→旧序）+ 截断上限。
 * localStorage quota 满时逐份丢最旧重试；最终仍败（隐私模式等）静默容忍——
 * 内存档照返，页面功能与体检主流程不受影响。
 */
export function pushReport(kv: ArchiveKv, report: any, now = Date.now()): ArchivedReport[] {
  if (!report || typeof report !== 'object') return loadArchive(kv);
  const entry: ArchivedReport = {
    ts: now,
    score: typeof report.score === 'number' ? report.score : null,
    data: report,
  };
  const arr = [entry, ...loadArchive(kv)].slice(0, ARCHIVE_MAX);
  let cur = arr;
  while (cur.length) {
    try { kv.setItem(ARCHIVE_KEY, JSON.stringify(cur)); return cur; }
    catch { cur = cur.slice(0, cur.length - 1); }
  }
  return arr;
}

/** 存档标签：「时间 · 得分 X」（无得分仅时间）——对比下拉选项文案 */
export function archiveLabel(e: ArchivedReport): string {
  const t = fmtTime(e.ts);
  return e.score != null ? `${t} · 得分 ${e.score}` : t;
}

/** 默认对比对（新→旧序下标）：基准=次新 [1]、对照=最新 [0]；不足两份返回 null */
export function defaultPair(arr: ArchivedReport[]): { base: number; cmp: number } | null {
  return arr.length >= 2 ? { base: 1, cmp: 0 } : null;
}
