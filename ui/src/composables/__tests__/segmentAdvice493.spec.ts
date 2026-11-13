/**
 * 四百九十三批：segmentAdvice 纯函数补测——优化向导 force_merge 判据
 * （每主分片平均段数归一化口径）与 parseStoreSize/parseCatNumber 容错。
 * 边界：多分片归一/单分片/零分片除零防御/flagged 阈值。
 */
import { describe, it, expect } from 'vitest';
import { evaluateSegments, parseStoreSize, parseCatNumber, SEGMENTS_PER_SHARD_THRESHOLD } from '../segmentAdvice';

const base = { replicas: 0, sizeBytes: 1024 * 1024 * 1024, docsDeleted: 0 };

describe('segmentAdvice 边界（493 批）', () => {
  it('多分片归一：5 主分片 100 段 = 每分片 20 段，超阈值 15 flagged', () => {
    const r = evaluateSegments({ ...base, segmentsCount: 100, priShards: 5 });
    expect(r.segmentsPerShard).toBe(20);
    expect(r.flagged).toBe(true);
  });

  it('低于阈值不 flag（severity=info）', () => {
    const r = evaluateSegments({ ...base, segmentsCount: 5, priShards: 5 });
    expect(r.segmentsPerShard).toBe(1);
    expect(r.flagged).toBe(false);
  });

  it('零主分片除零防御不炸', () => {
    const r = evaluateSegments({ ...base, segmentsCount: 5, priShards: 0 });
    expect(r === null || typeof r === 'object').toBe(true);
  });

  it('parseStoreSize/parseCatNumber 容错', () => {
    expect(parseStoreSize('1.5gb')).toBeGreaterThan(0);
    expect(parseStoreSize('garbage')).toBe(0);
    expect(parseCatNumber('42')).toBe(42);
    expect(parseCatNumber('-')).toBe(0);
    expect(parseCatNumber(null)).toBe(0);
  });

  it('阈值常量为 15', () => {
    expect(SEGMENTS_PER_SHARD_THRESHOLD).toBe(15);
  });
});
