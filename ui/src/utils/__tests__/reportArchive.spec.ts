/**
 * 二百一十八批：体检报告多份存档（reportArchive）纯函数守卫。
 * 锁定：pushReport 新→旧序/截断/quota 逐份丢最旧降级/全败容忍；
 * loadArchive 坏值剔除；archiveLabel 文案；defaultPair 默认对。
 */
import { describe, it, expect } from 'vitest';
import {
  loadArchive, pushReport, archiveLabel, defaultPair,
  ARCHIVE_KEY, ARCHIVE_MAX, type ArchiveKv,
} from '../reportArchive';

/** 内存假存储：可配置 setItem 先败 N 次模拟 quota */
function mkKv(failTimes = 0): ArchiveKv & { map: Map<string, string> } {
  const map = new Map<string, string>();
  let left = failTimes;
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => { if (left-- > 0) throw new Error('QuotaExceeded'); map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

const rep = (score: number, extra = '') => ({ score, summary: { status: 'green' }, note: extra });

describe('pushReport 落档', () => {
  it('头部插入新→旧序，score 提取，ts 落档', () => {
    const kv = mkKv();
    pushReport(kv, rep(80), 1000);
    const arr = pushReport(kv, rep(90), 2000);
    expect(arr.length).toBe(2);
    expect(arr[0]).toMatchObject({ ts: 2000, score: 90 });
    expect(arr[1]).toMatchObject({ ts: 1000, score: 80 });
    /* 持久化与返回值同构 */
    expect(loadArchive(kv).map((e) => e.ts)).toEqual([2000, 1000]);
  });
  it('非数字 score → null；非对象报告不入档', () => {
    const kv = mkKv();
    const arr = pushReport(kv, { summary: {} } as any, 1000);
    expect(arr[0].score).toBeNull();
    expect(pushReport(kv, null as any, 3000).length).toBe(1);
  });
  it('超 ARCHIVE_MAX 滚动丢最旧', () => {
    const kv = mkKv();
    for (let i = 1; i <= ARCHIVE_MAX + 2; i++) pushReport(kv, rep(i), i * 1000);
    const arr = loadArchive(kv);
    expect(arr.length).toBe(ARCHIVE_MAX);
    expect(arr[0].ts).toBe((ARCHIVE_MAX + 2) * 1000);
    expect(arr[arr.length - 1].ts).toBe(3 * 1000); /* 最旧两份(1,2)已被挤出 */
  });
  it('quota 满逐份丢最旧重试至可写', () => {
    const kv = mkKv();
    for (let i = 1; i <= 4; i++) pushReport(kv, rep(i), i * 1000);
    const kv2 = mkKv(1); /* 第一次写必败 */
    kv2.map.set(ARCHIVE_KEY, kv.map.get(ARCHIVE_KEY)!);
    const arr = pushReport(kv2, rep(99), 9000);
    /* 4+1=5 份写不下→丢 1 份最旧→4 份落盘 */
    expect(arr.length).toBe(4);
    expect(arr[arr.length - 1].ts).toBe(2000);
    expect(loadArchive(kv2).length).toBe(4);
  });
  it('持久化全败静默容忍：内存档照返不抛错', () => {
    const kv = mkKv(999);
    const arr = pushReport(kv, rep(88), 1000);
    expect(arr.length).toBe(1);
    expect(arr[0].score).toBe(88);
  });
});

describe('loadArchive 坏值容忍', () => {
  it('坏 JSON / 非数组 / 缺字段条目剔除', () => {
    const kv = mkKv();
    kv.map.set(ARCHIVE_KEY, '{oops');
    expect(loadArchive(kv)).toEqual([]);
    kv.map.set(ARCHIVE_KEY, '{"a":1}');
    expect(loadArchive(kv)).toEqual([]);
    kv.map.set(ARCHIVE_KEY, JSON.stringify([
      { ts: 1000, score: 90, data: { score: 90 } },
      { ts: 'bad', data: {} },           /* ts 非数字剔除 */
      { ts: 2000 },                      /* 缺 data 剔除 */
      null,
      { ts: 3000, score: 'x', data: { score: 70 } }, /* score 非数字→null 保留 */
    ]));
    const arr = loadArchive(kv);
    expect(arr.length).toBe(2);
    expect(arr[1]).toMatchObject({ ts: 3000, score: null });
  });
});

describe('archiveLabel / defaultPair', () => {
  it('标签：有得分带「· 得分 X」，无得分仅时间', () => {
    const withScore = archiveLabel({ ts: Date.parse('2026-09-09T15:30:00+08:00'), score: 92, data: {} });
    expect(withScore).toContain('得分 92');
    expect(withScore).toMatch(/\d{2}:\d{2}/);
    const noScore = archiveLabel({ ts: Date.parse('2026-09-09T15:30:00+08:00'), score: null, data: {} });
    expect(noScore).not.toContain('得分');
  });
  it('默认对：不足两份 null；够两份基准=次新[1] 对照=最新[0]', () => {
    expect(defaultPair([])).toBeNull();
    expect(defaultPair([{ ts: 1, score: 1, data: {} }])).toBeNull();
    const dp = defaultPair([
      { ts: 2, score: 90, data: {} },
      { ts: 1, score: 80, data: {} },
    ]);
    expect(dp).toEqual({ base: 1, cmp: 0 });
  });
});
