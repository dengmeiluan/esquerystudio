/**
 * 段碎片体检：优化向导的 force_merge 判据。
 *
 * 为什么独立成模块而不塞进 IndexOptimizerView 的 recs 里：
 * recs 那条流水线是「勾选 → 拼 PUT /_settings body」的机器（见 previewBody），
 * 只能承载 settings 键。force_merge 是 POST _forcemerge 动作，混进去会被拼成非法 body。
 *
 * 为什么不用 settings 规则实现：
 * index.merge.policy.auto_merge_enabled / inactive_merge_enabled 是阿里云/OpenSearch
 * 扩展键，原生 ES（6.7.2 上以 include_defaults=true 核实过）不存在，控制台是多集群的，
 * 下发这类键会在原生集群 PUT 失败。所以走「读真实段数 + force_merge 动作」。
 *
 * 口径：按「每主分片平均段数」判定，不看段总数。段数随分片数线性增长，
 * 5 分片 218 段 ≈ 每分片 21.8 段，只有归一化后才可跨索引比较。
 */

import { parseBytes } from '../utils/format';

interface SegmentInput {
  /** _cat/indices 的 segments.count（段总数，全分片累加，含副本） */
  segmentsCount: number;
  /** 主分片数 pri */
  priShards: number;
  /** 副本数 rep，用于把段总数还原到主分片口径 */
  replicas: number;
  /** 索引总大小（字节，含副本），store.size 解析而来 */
  sizeBytes: number;
  /** _cat/indices 的 docs.deleted */
  docsDeleted: number;
}

export interface SegmentAdvice {
  /** 是否应该报这条建议 */
  flagged: boolean;
  /** 每主分片平均段数（保留 1 位小数） */
  segmentsPerShard: number;
  /** 建议的 maxSegments 取值 */
  suggestedMaxSegments: number;
  severity: 'warn' | 'info';
  /** 每主分片的数据量（字节），决定 maxSegments 是否可以取 1 */
  shardSizeBytes: number;
  reason: string;
}

/** 每主分片平均段数超过该阈值才报。ES 正常后台 merge 稳态在个位数～十几段。 */
export const SEGMENTS_PER_SHARD_THRESHOLD = 15;

/** ES 官方口径：force_merge 产出的大于 5GB 的单段永不参与后续 merge。 */
export const MAX_SEGMENT_TARGET_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * 解析 _cat/indices 的 store.size（如 "9.4gb" / "417.2gb" / "1.1tb"）为字节。
 * 关闭的索引该列可能为空，返回 0。单位口径统一委托 format.parseBytes（失败返回 NaN → 此处容错 0）。
 */
export function parseStoreSize(raw: unknown): number {
  const b = parseBytes(raw);
  return isFinite(b) ? b : 0;
}

/**
 * _cat 的数值列全是字符串，且关闭的索引可能缺失/为空 —— 一律容错为 0。
 */
export function parseCatNumber(raw: unknown): number {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s || s === 'null' || s === '-') return 0;
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

/**
 * 计算段碎片建议。
 *
 * maxSegments 取值口径（结合 5GB 单段警告）：
 * - 每主分片数据量 < 5GB：可以安全合到 1 段（合出来也不会超过 5GB 死段线）
 * - 每主分片数据量 >= 5GB：按 ceil(shardSize / 5GB) 给目标段数，
 * 保证每段落在 5GB 以下，避免产出永不可回收的巨型死段
 */
export function evaluateSegments(input: SegmentInput): SegmentAdvice {
  const { segmentsCount, priShards, replicas, sizeBytes, docsDeleted } = input;
  const pri = priShards > 0 ? priShards : 1;

  // 段总数与 store.size 都含副本，先还原到主分片口径再除以主分片数
  const copies = (replicas >= 0 ? replicas : 0) + 1;
  const primarySegments = segmentsCount / copies;
  const segmentsPerShard = Math.round((primarySegments / pri) * 10) / 10;
  const shardSizeBytes = sizeBytes / copies / pri;

  const suggestedMaxSegments = shardSizeBytes < MAX_SEGMENT_TARGET_BYTES
    ? 1
    : Math.ceil(shardSizeBytes / MAX_SEGMENT_TARGET_BYTES);

  const flagged = segmentsCount > 0 && segmentsPerShard > SEGMENTS_PER_SHARD_THRESHOLD;

  const gb = (n: number) => (n / 1024 ** 3).toFixed(1);
  const reason = flagged
    ? `每主分片约 ${segmentsPerShard} 段（阈值 ${SEGMENTS_PER_SHARD_THRESHOLD}），`
      + `每主分片约 ${gb(shardSizeBytes)}GB；`
      + (suggestedMaxSegments === 1
        ? '分片小于 5GB，可安全合并到 1 段'
        : `分片超过 5GB，建议合到 ${suggestedMaxSegments} 段以保证单段不超 5GB`)
      + `；docs.deleted=${docsDeleted}`
    : `每主分片约 ${segmentsPerShard} 段，未超过阈值 ${SEGMENTS_PER_SHARD_THRESHOLD}，无需 force_merge`;

  return {
    flagged,
    segmentsPerShard,
    suggestedMaxSegments,
    severity: docsDeleted > 0 ? 'warn' : 'info',
    shardSizeBytes,
    reason,
  };
}
