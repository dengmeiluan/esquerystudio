/* 集群监控历史趋势纯函数工具（/monitor-metrics 采样行 → 多集群叠加折线）。
 * 零运行时依赖（仅类型引用 api.ts），records 乱序传入皆可：
 * 分组（connName 缺省回落 connId）→ 组内按时间升序 → 组间按名称排序，
 * 供 LiveDashboardView 历史趋势分区与单测共用。 */
import type { MonitorMetricsRecord, MonitorAlertDoc } from '../api';

export interface SeriesPoint { t: number; v: number }
export interface NamedSeries { name: string; points: SeriesPoint[] }

export type MonitorSeriesField =
  | 'qps' | 'indexRate' | 'heapUsedPct' | 'cpuPct' | 'diskUsedPct'
  | 'writeRejected' | 'searchRejected'
  | 'gcYoungPerMin' | 'gcOldPerMin' /* R8 GC 差分（仅节点下钻图卡；Old GC≈FullGC 口径） */
  | 'searchLatencyMs' | 'indexingLatencyMs' /* R9 慢查询代理指标 */
  | 'load1m' | 'diskReadKbS' | 'diskWriteKbS' | 'diskReadIops' | 'diskWriteIops'
  | 'tpSearchActive' | 'tpSearchQueue' /* 节点深耕（仅节点下钻图卡） */
  | 'shards' | 'primaryShards' /* 分片总数/主分片数（ 对标阿里云集群级指标卡） */
  | 'indices' /* 索引数量（对标阿里云集群级「索引数量」卡；cluster doc 既有键，AGG_METRIC_FIELDS 既有） */
  | 'tpWriteActive' | 'tpWriteQueue' | 'docsDeleted' /* 对标阿里云线程池 Rows 写入侧+被标记删除文档（仅节点下钻图卡） */
  | 'ioUtilPct' | 'gcYoungTimeMs' | 'gcOldTimeMs' /* IOUtil%+GC 耗时（差分测点，仅节点下钻图卡；对标阿里云 IOUtil/节点 Young·Old GC 耗时） */
  | 'heapUsedMb' /* 对标阿里云「节点 Old 区使用」锯齿形态：heap_used_in_bytes→MB（仅节点下钻图卡） */
  | 'fielddataMb' /* 对标阿里云 JVM 组「fielddata 内存使用」（查询抖动经典根因，仅节点下钻图卡） */
  | 'netRxKbS' | 'netTxKbS' /* 内部传输吞吐（G7，transport 差分，仅节点下钻图卡） */
  | 'docsTotal' /* 可搜索文档总数（_cluster/stats docs.count，cluster doc 专属；对标阿里云索引指标组） */
  | 'tpForceMergeActive' | 'tpForceMergeQueue' | 'tpForceMergeRejected' /* Force Merge 线程池三件（rejected 差分，仅节点下钻图卡；对标阿里云线程池组） */
  | 'osMemUsedPct' /* OS 侧内存使用率%（区别于 JVM heap，仅节点下钻图卡；对标阿里云「内存使用率_总」） */
  | 'fsAvailMb' /* 剩余可用存储 MB（fs.total.available 换算，仅节点下钻图卡；对标阿里云「剩余可用存储空间」） */
  | 'esCpuPct'; /* ES 业务进程 CPU%（process.cpu.percent，区别于 OS 总 CPU，仅节点下钻图卡；对标阿里云「CPU使用率_ES业务」） */

/**
 * 把采样行按集群分组并抽取指定指标序列。
 * - 该 field 非 number（含缺省/NaN/Infinity）的点整条剔除（首轮采样未算出 qps/indexRate 是常态）；
 * - 组名取 connName，缺省回落 connId，再缺省归「未知集群」；
 * - 返回组间按 name 升序、组内按 t 升序，乱序输入输出确定。
 */
export function buildSeries(records: MonitorMetricsRecord[], field: MonitorSeriesField): NamedSeries[] {
  const groups = new Map<string, SeriesPoint[]>();
  for (const r of records || []) {
    const v = r ? r[field] : undefined;
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const name = r.connName || r.connId || '未知集群';
    let pts = groups.get(name);
    if (!pts) { pts = []; groups.set(name, pts); }
    pts.push({ t: r.timestamp, v });
  }
  const out: NamedSeries[] = [];
  for (const [name, points] of groups) {
    points.sort((a, b) => a.t - b.t);
    out.push({ name, points });
  }
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

/**
 * 全体序列 y 域上界：全体点最大值 ×1.1 留白；无点/≤0（全零/负值兜底）回 1 防除零。
 * HistoryChart 的 Y 轴刻度与点位换算共用此单源（与 polylinePoints 的 yMax 口径一致）。
 */
export function yMaxOf(series: NamedSeries[]): number {
  let maxV = 0;
  for (const s of series || []) {
    if (!s) continue;
    for (const p of s.points) if (p.v > maxV) maxV = p.v;
  }
  return maxV > 0 ? maxV * 1.1 : 1;
}

/**
 * X 轴时间标注刻度：默认 3 只（tMin/中点/tMax），末位取 tMax 本值防浮点漂移。
 * 范围塌缩（同刻）退化为单只 [tMin]；非法输入（非有限数）返回空数组。
 */
export function timeTicks(tMin: number, tMax: number, count = 3): number[] {
  if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || count < 1) return [];
  if (tMax < tMin) { const tmp = tMin; tMin = tMax; tMax = tmp; }
  if (tMax === tMin || count === 1) return [tMin];
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(i === count - 1 ? tMax : tMin + ((tMax - tMin) * i) / (count - 1));
  return out;
}

/**
 * 悬停取点：每序列取 |t - ti| 最小的点值（平局取先出现者，即时间较早一侧）。
 * 无点序列跳过；输入乱序也可（线性扫描不依赖有序）。供 tooltip「悬停时刻各序列值」。
 */
export function nearestAt(series: NamedSeries[], t: number): { name: string; v: number }[] {
  const out: { name: string; v: number }[] = [];
  for (const s of series || []) {
    if (!s || !s.points.length) continue;
    let best = s.points[0]!;
    for (const p of s.points) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    out.push({ name: s.name, v: best.v });
  }
  return out;
}

/**
 * 值按单位格式化（tooltip / 统计条 / Y 轴刻度共用）：
 * '%' 保留 1 位小数；'doc/s' 与 '/s' <10 两位小数否则整数；无单位整数；非法值（非有限数）'-'。
 */
export function fmtUnit(v: number, unit?: string): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '-';
  if (unit === '%') return v.toFixed(1) + '%';
  if (unit === 'doc/s' || unit === '/s') return v < 10 ? v.toFixed(2) : String(Math.round(v));
  return String(Math.round(v));
}

/* ═══ 降采样档位映射（/monitor-metrics 的 interval 可选参数） ═══
 * 历史范围档 → ES date_histogram fixed_interval 档位：范围越大桶距越粗，
 * 大范围不再逐点拉爆 size 上限。未知档回落 24h 同款 '5m'（新增范围档未入表时安全兜底）。 */
const INTERVAL_FOR: Record<string, string> = { '1h': '1m', '6h': '2m', '24h': '5m', '3d': '15m', '7d': '30m', '14d': '60m' };
const INTERVAL_UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3.6e6, d: 8.64e7 };

/** 历史范围档 → 降采样 interval 档位（'1h'→'1m'…'7d'→'30m'、'14d'→'60m'（336 桶）；未知回落 '5m'） */
export function intervalFor(range: string): string {
  return INTERVAL_FOR[range] ?? '5m';
}

/** fixed_interval 字符串（'1m'/'5m'/'1h'…）→ 毫秒；非法回落 5m=300000。
 * 抽出：周期档（1m/5m/15m/30m/1h）的断档阈值需按「生效桶宽」而非范围推导。 */
export function fixedIntervalMs(interval: string): number {
  const m = /^(\d+)([smhd])$/.exec(interval);
  return m ? Number(m[1]) * INTERVAL_UNIT_MS[m[2]!] : 300_000;
}

/** 同映射的毫秒值（'1h'→60000 等，与 intervalFor 单源；解析异常回落 5m=300000） */
export function intervalMsFor(range: string): number {
  return fixedIntervalMs(intervalFor(range));
}

/* ═══ 周期档「原始逐点」安全窗（═══
 * 原始查询路径（不传 interval 时）在服务端钳 size=3000 且按时间升序返回：窗口越宽越先取满
 * 前 3000 行 → 图右端最新点被挡在窗外（曲线「停在过去」）。采集默认 60s ⇒ 3000 行 ≈ 50h，
 * 故 span 超过此跨度时「原始逐点」不安全，须回落按范围降采样。 */
export const MH_RAW_SPAN_MS = 50 * 3.6e6; /* 50 小时 */

/** 原始逐点档是否安全：span（ms）∈ (0, 50h] 才不丢最新点；非有限数/非正（空窗/非法）一律不安全。 */
export function rawPeriodSafe(spanMs: number): boolean {
  return Number.isFinite(spanMs) && spanMs > 0 && spanMs <= MH_RAW_SPAN_MS;
}

/** 多序列同图的共享坐标系（tMin/tMax 时间域 + yMax 值域上限，坐标映射直接采用） */
export interface PolyDomain {
  tMin: number;
  tMax: number;
  yMax: number;
}

/**
 * 断档感知折线：单序列 → 多段 polyline points 字符串（每段形同 polylinePoints 的 attr）。
 * - 坐标域：domain 传入即共享域（多序列同图必传——与调用方十字线/悬浮点的映射同源，
 * 否则各线按自身点建域被各自拉伸满宽满高，曲线视觉位置与悬浮读数错位，同刻 x 不对齐）；
 * 缺省按本序列自身点建域（x 域=自身时间范围、y 域=自身 max×1.1 留白，≤0 回 1 防除零）
 * ——单序列消费方两种口径等价，形态不变；段与段共享同一坐标系；
 * - gapMs 传入时相邻两点 Δt > gapMs 即断开（降采样空桶=集群失联未采，连成一段会画出
 * 未发生的骤降/回升假线）；缺省 undefined 永不断开（行为与 polylinePoints 单段一致）；
 * Δt==gapMs 不断（严格大于才断）；
 * - 空/单点（及断开后不足 2 点的尾段）画不出线，返回 [] 由调用方圆点形态兜底。
 */
export function polylineSegments(points: SeriesPoint[], W: number, H: number, gapMs?: number, domain?: PolyDomain): string[] {
  if (!points || points.length < 2 || W <= 0 || H <= 0) return [];
  let maxV = 0;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const p of points) {
    if (p.v > maxV) maxV = p.v;
    if (p.t < tMin) tMin = p.t;
    if (p.t > tMax) tMax = p.t;
  }
  const dMin = domain ? domain.tMin : tMin;
  const dMax = domain ? domain.tMax : tMax;
  const yMax = domain ? domain.yMax : maxV > 0 ? maxV * 1.1 : 1;
  const span = dMax - dMin;
  const segs: string[] = [];
  let cur: string[] = [];
  let prevT = NaN;
  for (const p of points) {
    if (cur.length && gapMs != null && p.t - prevT > gapMs) {
      segs.push(cur.join(' '));
      cur = [];
    }
    const u = span > 0 ? (p.t - dMin) / span : 0;
    cur.push(`${(u * W).toFixed(1)},${(H - (p.v / yMax) * H).toFixed(1)}`);
    prevT = p.t;
  }
  if (cur.length >= 2) segs.push(cur.join(' '));
  return segs;
}

/**
 * 多序列 → SVG polyline points 字符串（每组一条），全部序列共享同一坐标系（叠加可横向比对）。
 * - y 域 = 全体点的 [0, max]，max 取全体最大值 ×1.1 留白；≤0（全零/负值兜底）回 1 防除零；
 * - x 域 = 全体点时间范围 [tMin, tMax] 归一到 [pad, W-pad]；范围塌缩（同刻）时全部落在左端；
 * - 空序列/单点序列画不出线，attr 返回空串由调用方跳过。
 */
export function polylinePoints(series: NamedSeries[], W: number, H: number, pad = 0): { name: string; attr: string }[] {
  const all = (series || []).flatMap(s => (s ? s.points : []));
  const usableW = W - pad * 2;
  const usableH = H - pad * 2;
  if (!all.length || usableW <= 0 || usableH <= 0) return (series || []).map(s => ({ name: s ? s.name : '', attr: '' }));
  let maxV = 0;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const p of all) {
    if (p.v > maxV) maxV = p.v;
    if (p.t < tMin) tMin = p.t;
    if (p.t > tMax) tMax = p.t;
  }
  const yMax = maxV > 0 ? maxV * 1.1 : 1;
  const span = tMax - tMin;
  return (series || []).map(s => {
    if (!s || s.points.length < 2) return { name: s ? s.name : '', attr: '' };
    const attr = s.points.map(p => {
      const u = span > 0 ? (p.t - tMin) / span : 0;
      const x = pad + u * usableW;
      const y = H - pad - (p.v / yMax) * usableH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return { name: s.name, attr };
  });
}

/**
 * R7 服务端告警活跃集（GET /monitor-alerts 的前端推导单源，可单测）：
 * - 同一 connId|metric 键只保留 timestamp 最新一条（告警状态机语义：一条状况一个条目）；
 * - 最新一条 recovered:true 即该键已恢复，从活跃集剔除（恢复事件不留活跃条）；
 * - 输出按 timestamp 降序（最新状况排前）；非法输入（缺 timestamp/metric）逐条剔除，
 * 空/全非法回空数组。
 */
export function activeAlerts(records: MonitorAlertDoc[]): MonitorAlertDoc[] {
  const latest = new Map<string, MonitorAlertDoc>();
  for (const r of records || []) {
    if (!r || typeof r.timestamp !== 'number' || !Number.isFinite(r.timestamp)) continue;
    const key = `${r.connId || ''}|${r.metric || ''}`;
    const cur = latest.get(key);
    if (!cur || r.timestamp >= cur.timestamp) latest.set(key, r);
  }
  return [...latest.values()]
    .filter(r => !r.recovered)
    .sort((a, b) => b.timestamp - a.timestamp);
}

/** RED 时段色带：连续的 status='red' 采样（间隔 ≤gapMs 视为同一时段）合并为 [from,to] 区间。
 * 20260断链轮采集器落 status=red 指标 doc（无指标字段）——图表据此画红色背景带，
 * 把「没采到」和「集群红了」区分开（断档折线语义由 polylineSegments 的 gapMs 承担）。 */
export function redBands(
  records: MonitorMetricsRecord[],
  gapMs = 3 * 60 * 1000,
): { from: number; to: number }[] {
  const reds = (records || [])
    .filter((r) => r && r.status === 'red' && typeof r.timestamp === 'number')
    .map((r) => r.timestamp)
    .sort((a, b) => a - b);
  const bands: { from: number; to: number }[] = [];
  for (const t of reds) {
    const last = bands[bands.length - 1];
    if (last && t - last.to <= gapMs) {
      last.to = t;
    } else {
      bands.push({ from: t, to: t });
    }
  }
  return bands;
}

/** R4 节点一览：scope=node 采样按 nodeName 取每节点最新一条（降序时间优先），节点名排序输出。
 * 节点名缺省回落 connId；输入乱序容错。LiveDashboardView 节点下钻表格消费。 */
export function latestByNode(records: MonitorMetricsRecord[]): MonitorMetricsRecord[] {
  const latest = new Map<string, MonitorMetricsRecord>();
  for (const r of records || []) {
    if (!r || typeof r.timestamp !== 'number') continue;
    const key = r.nodeName || r.connId || '未知节点';
    const cur = latest.get(key);
    if (!cur || r.timestamp >= cur.timestamp) latest.set(key, r);
  }
  return [...latest.values()].sort((a, b) =>
    ((a.nodeName || a.connId || '') < (b.nodeName || b.connId || '') ? -1 : 1));
}

/** R5 磁盘水位线性外推（最小二乘）：对每集群 diskUsedPct 序列拟合 v=a+b·x（x=起采后天数），
 * 预测达到 thresholdPct 的时点。斜率≤0（平稳/回落）→ days=null 不预测；已达阈值 → days=0；
 * 预测段最长外推 horizonMs（调用方给 30d），points=从最后一个实测点到预测终点的两点虚线段
 * （返回形态兼容 NamedSeries——HistoryChart forecast prop 直接消费）。
 * 时间轴归一到「天」再拟合——epoch 毫秒平方会击穿双精度安全区。 */
export function diskForecast(
  series: NamedSeries[],
  thresholdPct: number,
  horizonMs: number,
): Array<NamedSeries & { days: number | null }> {
  const DAY = 86_400_000;
  return series.map(s => {
    if (s.points.length < 2) return { name: s.name, days: null, points: [] as SeriesPoint[] };
    const t0 = s.points[0]!.t;
    let sx = 0, sv = 0, sxx = 0, sxv = 0;
    for (const p of s.points) {
      const x = (p.t - t0) / DAY;
      sx += x; sv += p.v; sxx += x * x; sxv += x * p.v;
    }
    const n = s.points.length;
    const denom = n * sxx - sx * sx;
    if (denom === 0) return { name: s.name, days: null, points: [] as SeriesPoint[] };
    const b = (n * sxv - sx * sv) / denom;           /* pct/天 */
    const a = (sv - b * sx) / n;                     /* x=0 处截距 */
    const last = s.points[n - 1]!;
    const xLast = (last.t - t0) / DAY;
    if (last.v >= thresholdPct) return { name: s.name, days: 0, points: [] as SeriesPoint[] };
    if (b <= 0) return { name: s.name, days: null, points: [] as SeriesPoint[] };
    const xTh = (thresholdPct - a) / b;
    const days = xTh - xLast;
    const xEnd = Math.min(xLast + horizonMs / DAY, xTh);
    return {
      name: s.name,
      days,
      points: [
        { t: last.t, v: last.v },
        { t: t0 + xEnd * DAY, v: a + b * xEnd },
      ],
    };
  });
}

/**
 * ①：悬浮读出行超长防护——超 cap 截前 cap 行，尾部聚合「+K」行由视图渲染
 * （「对比读出>8 节点截断」观察项收口；纯函数出 {rows, hidden}，视图零算术）。
 */
export function capRows<T>(rows: T[], cap: number): { rows: T[]; hidden: number } {
  const shown = rows.slice(0, Math.max(0, cap));
  return { rows: shown, hidden: Math.max(0, rows.length - shown.length) };
}

/** 探活历史健康摘要：按集群聚合窗口内 RED 次数/采样总数/最慢时延（ms）。
 * 输入为探活快照行（connName/status/latencyMs），输出按 RED 次数降序、名称升序。 */
export function probeDigest(
  records: MonitorMetricsRecord[],
): { name: string; total: number; reds: number; worstMs: number | null }[] {
  const per = new Map<string, { name: string; total: number; reds: number; worstMs: number | null }>();
  for (const r of records || []) {
    if (!r || typeof r.timestamp !== 'number') continue;
    const name = r.connName || r.connId || '未知集群';
    let d = per.get(name);
    if (!d) { d = { name, total: 0, reds: 0, worstMs: null }; per.set(name, d); }
    d.total++;
    if (r.status === 'RED') d.reds++;
    if (typeof r.latencyMs === 'number' && (d.worstMs === null || r.latencyMs > d.worstMs)) {
      d.worstMs = r.latencyMs;
    }
  }
  return [...per.values()].sort((a, b) =>
    b.reds - a.reds || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
