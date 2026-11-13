import { describe, it, expect } from 'vitest';
import {
  evaluateSegments, parseStoreSize, parseCatNumber,
  SEGMENTS_PER_SHARD_THRESHOLD, MAX_SEGMENT_TARGET_BYTES,
} from '../segmentAdvice';

const GB = 1024 ** 3;

describe('parseStoreSize', () => {
  it('解析 _cat 的各级单位', () => {
    expect(parseStoreSize('9.4gb')).toBeCloseTo(9.4 * GB, 0);
    expect(parseStoreSize('417gb')).toBeCloseTo(417 * GB, 0);
    expect(parseStoreSize('1.1tb')).toBeCloseTo(1.1 * 1024 ** 4, 0);
    expect(parseStoreSize('512mb')).toBeCloseTo(512 * 1024 ** 2, 0);
    expect(parseStoreSize('900b')).toBe(900);
  });
  it('关闭索引/空值容错为 0', () => {
    expect(parseStoreSize(undefined)).toBe(0);
    expect(parseStoreSize(null)).toBe(0);
    expect(parseStoreSize('')).toBe(0);
    expect(parseStoreSize('  ')).toBe(0);
    expect(parseStoreSize('abc')).toBe(0);
  });
});

describe('parseCatNumber', () => {
  it('_cat 返回字符串，须转数字', () => {
    expect(parseCatNumber('218')).toBe(218);
    expect(parseCatNumber('0')).toBe(0);
    expect(parseCatNumber(373)).toBe(373);
  });
  it('关闭索引 segments.count / docs.deleted 可能缺失', () => {
    expect(parseCatNumber(undefined)).toBe(0);
    expect(parseCatNumber(null)).toBe(0);
    expect(parseCatNumber('')).toBe(0);
    expect(parseCatNumber('-')).toBe(0);
    expect(parseCatNumber('null')).toBe(0);
    expect(parseCatNumber('xx')).toBe(0);
  });
});

describe('evaluateSegments 阈值判定', () => {
  it('qa_sentiment_news_published：5 主分片 / 218 段 / 9.4GB / rep=1 → 报警并建议合到 1 段', () => {
    const a = evaluateSegments({
      segmentsCount: 218, priShards: 5, replicas: 1,
      sizeBytes: 9.4 * GB, docsDeleted: 0,
    });
    // 218 段含副本 → 主分片口径 109 段 / 5 分片 = 21.8 段每分片
    expect(a.segmentsPerShard).toBe(21.8);
    expect(a.flagged).toBe(true);
    // 每主分片仅约 0.94GB，远小于 5GB 死段线，可安全合到 1 段
    expect(a.suggestedMaxSegments).toBe(1);
    expect(a.shardSizeBytes).toBeLessThan(MAX_SEGMENT_TARGET_BYTES);
    // docs.deleted=0 → 合并不省磁盘，只降段数，故严重度为「建议」
    expect(a.severity).toBe('info');
  });

  it('party_xygs_basic_info：373 段 / 417GB / 5 主分片 rep=1 → 报警且绝不建议合到 1 段', () => {
    const a = evaluateSegments({
      segmentsCount: 373, priShards: 5, replicas: 1,
      sizeBytes: 417 * GB, docsDeleted: 0,
    });
    expect(a.segmentsPerShard).toBe(37.3);
    expect(a.flagged).toBe(true);
    // 每主分片 41.7GB / 5GB → 9 段，保证单段不超 5GB
    expect(a.suggestedMaxSegments).toBe(9);
    expect(a.suggestedMaxSegments).toBeGreaterThan(1);
  });

  it('大索引的建议段数保证每段不超过 5GB', () => {
    const a = evaluateSegments({
      segmentsCount: 373, priShards: 5, replicas: 1,
      sizeBytes: 417 * GB, docsDeleted: 0,
    });
    expect(a.shardSizeBytes / a.suggestedMaxSegments).toBeLessThanOrEqual(MAX_SEGMENT_TARGET_BYTES);
  });

  it('段数健康的索引不报（阈值以下）', () => {
    const a = evaluateSegments({
      segmentsCount: 20, priShards: 5, replicas: 1,
      sizeBytes: 5 * GB, docsDeleted: 0,
    });
    expect(a.segmentsPerShard).toBe(2);
    expect(a.flagged).toBe(false);
    expect(a.reason).toContain('无需 force_merge');
  });

  it('阈值边界：恰好等于阈值不报，略超才报', () => {
    const at = evaluateSegments({
      segmentsCount: SEGMENTS_PER_SHARD_THRESHOLD, priShards: 1, replicas: 0,
      sizeBytes: 1 * GB, docsDeleted: 0,
    });
    expect(at.segmentsPerShard).toBe(SEGMENTS_PER_SHARD_THRESHOLD);
    expect(at.flagged).toBe(false);

    const over = evaluateSegments({
      segmentsCount: SEGMENTS_PER_SHARD_THRESHOLD + 1, priShards: 1, replicas: 0,
      sizeBytes: 1 * GB, docsDeleted: 0,
    });
    expect(over.flagged).toBe(true);
  });

  it('段总数高但分片多时按每分片口径判定，不误报', () => {
    // 373 段 / 20 主分片 / rep=1 → 9.3 段每分片，健康
    const a = evaluateSegments({
      segmentsCount: 373, priShards: 20, replicas: 1,
      sizeBytes: 417 * GB, docsDeleted: 0,
    });
    expect(a.segmentsPerShard).toBe(9.3);
    expect(a.flagged).toBe(false);
  });

  it('docs.deleted > 0 时升级为警告（有磁盘可回收）', () => {
    const a = evaluateSegments({
      segmentsCount: 218, priShards: 5, replicas: 1,
      sizeBytes: 9.4 * GB, docsDeleted: 120000,
    });
    expect(a.severity).toBe('warn');
    expect(a.reason).toContain('docs.deleted=120000');
  });

  it('段数为 0（关闭索引列缺失）不报', () => {
    const a = evaluateSegments({
      segmentsCount: 0, priShards: 5, replicas: 1,
      sizeBytes: 0, docsDeleted: 0,
    });
    expect(a.flagged).toBe(false);
  });

  it('主分片数缺失时按 1 兜底，不产生 Infinity/NaN', () => {
    const a = evaluateSegments({
      segmentsCount: 30, priShards: 0, replicas: 0,
      sizeBytes: 1 * GB, docsDeleted: 0,
    });
    expect(Number.isFinite(a.segmentsPerShard)).toBe(true);
    expect(a.segmentsPerShard).toBe(30);
    expect(a.flagged).toBe(true);
  });
});
