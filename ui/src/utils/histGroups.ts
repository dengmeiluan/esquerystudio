/* 对标阿里云「分组」导航（实测：阿里云基础监控内容区左上「分组: 概览 ▾」，
 * 展开 9 项=概览/集群指标/索引指标/节点资源指标/节点网络指标/节点磁盘指标/节点JVM指标/线程池指标/
 * 主节点指标）。
 *
 * 我方收敛为 **8 组**（概览 + 7 指标族）：**不照搬「主节点指标」**——我方节点下钻 scope=node
 * 已含主节点（sortedNodes 带 master role），其 CPU/heap/disk 在「节点资源指标」组即可见，
 * 独立成组增量信息≈0 且无 master 专有采集字段（MonitorMetricsStore.AGG_METRIC_FIELDS 无此口径）。
 *
 * ⚠**与 onlyNodeMode/onlyClusterMode 的区别**（关键辨析，勿混）：
 * - `onlyNodeMode / onlyClusterMode`（LiveDashboardView）= **数据可用性驱动的自动二态隐藏**
 * （scope=cluster/node 时服务端无对应聚合口径的卡自动收起）；
 * - `HIST_GROUP_OF / inHistGroup`（本文件）= **用户主动的导航过滤**。
 * 两者正交：先 scope 过滤（现有逻辑），再组过滤（本文件）；`overview` 组 = pass-through，
 * 渲染结果与引入分组前**逐字相同**（零行为变更）。
 *
 * 分组映射**外挂**于此（不写进 LiveDashboardView 的 HIST_CHARTS 条目）——避免触碰
 * monitorHistoryTrend.spec 对 HIST_CHARTS 条目字面的逐字锁（零同步更新）。
 * 本文件为纯函数单源，零运行时依赖（仅类型引用）。 */

import type { MonitorSeriesField } from './monitorSeries';

/** 组键：overview=概览（不过滤），其余为指标族 */
export type HistGroupKey =
  | 'overview' | 'cluster' | 'index'
  | 'node-res' | 'node-net' | 'node-disk' | 'node-jvm' | 'thread';

/** 非概览组的键（映射值域） */
type HistMetricGroupKey = Exclude<HistGroupKey, 'overview'>;

interface HistGroup {
  key: HistGroupKey;
  /** 全称（title / 空态文案用，对齐阿里云命名） */
  label: string;
  /** seg 短标签（窄档单行不折行的关键；全称走 title 兜底） */
  short: string;
}

/** 8 组：概览在前（默认档），其余按「集群 → 索引 → 节点四族 → 线程池」序 */
export const HIST_GROUPS: HistGroup[] = [
  { key: 'overview', label: '概览', short: '概览' },
  { key: 'cluster', label: '集群指标', short: '集群' },
  { key: 'index', label: '索引指标', short: '索引' },
  { key: 'node-res', label: '节点资源指标', short: '资源' },
  { key: 'node-net', label: '节点网络指标', short: '网络' },
  { key: 'node-disk', label: '节点磁盘指标', short: '磁盘' },
  { key: 'node-jvm', label: '节点JVM指标', short: 'JVM' },
  { key: 'thread', label: '线程池指标', short: '线程池' },
];

/** 卡 → 组 的外挂映射。`Record<MonitorSeriesField, …>` 保证编译期全覆盖（新增指标必须同步分组）。 */
export const HIST_GROUP_OF: Record<MonitorSeriesField, HistMetricGroupKey> = {
  /* 集群指标（6）：吞吐/耗时/分片骨架 */
  qps: 'cluster', indexRate: 'cluster',
  searchLatencyMs: 'cluster', indexingLatencyMs: 'cluster',
  shards: 'cluster', primaryShards: 'cluster',
  /* 索引指标（3）：索引数量 + 被标记删除文档 + 可搜索文档总数 */
  indices: 'index', docsDeleted: 'index', docsTotal: 'index',
  /* 节点资源（6）：利用率 + load + OS 内存 + ES 业务 CPU */
  heapUsedPct: 'node-res', cpuPct: 'node-res', diskUsedPct: 'node-res', load1m: 'node-res',
  osMemUsedPct: 'node-res', esCpuPct: 'node-res',
  /* 节点网络（2） */
  netRxKbS: 'node-net', netTxKbS: 'node-net',
  /* 节点磁盘（6）：带宽 ×2 + IOPS ×2 + IOUtil + 剩余可用存储 */
  diskReadKbS: 'node-disk', diskWriteKbS: 'node-disk',
  diskReadIops: 'node-disk', diskWriteIops: 'node-disk', ioUtilPct: 'node-disk',
  fsAvailMb: 'node-disk',
  /* 节点 JVM（5）：GC 频次/耗时 ×3 + Heap 用量 + fielddata */
  gcYoungPerMin: 'node-jvm', gcOldPerMin: 'node-jvm', gcYoungTimeMs: 'node-jvm', gcOldTimeMs: 'node-jvm',
  heapUsedMb: 'node-jvm', fielddataMb: 'node-jvm',
  /* 线程池（9）：拒绝 ×2 + 搜索/写入/force_merge 活跃·排队·拒绝 */
  writeRejected: 'thread', searchRejected: 'thread',
  tpSearchActive: 'thread', tpSearchQueue: 'thread',
  tpWriteActive: 'thread', tpWriteQueue: 'thread',
  tpForceMergeActive: 'thread', tpForceMergeQueue: 'thread', tpForceMergeRejected: 'thread',
};

/** 该指标是否属于当前分组。`overview` 恒真（pass-through = 零行为变更的默认档）。 */
export function inHistGroup(field: MonitorSeriesField, group: HistGroupKey): boolean {
  return group === 'overview' || HIST_GROUP_OF[field] === group;
}

/** 组全称（空态文案用） */
export function histGroupLabel(group: HistGroupKey): string {
  return HIST_GROUPS.find(g => g.key === group)?.label ?? '';
}
