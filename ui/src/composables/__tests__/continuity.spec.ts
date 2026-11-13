import { describe, it, expect, beforeEach } from 'vitest';
import { saveLastRoute, readLastRoute, restorable } from '../continuity';

/* R61：工作现场恢复的契约锁——记什么、什么时候提供恢复、什么时候闭嘴。 */

beforeEach(() => localStorage.clear());

describe('continuity 工作现场恢复（R61）', () => {
  it('记录现场：fullPath 含 query 原样保存，页面名从 NAV 解析', () => {
    /* R64：旧查询路由已 redirect 到 /search，现场记录只会收到新路径 */
    saveLastRoute('/search?mode=lucene&idx=my-idx&q=*');
    const r = readLastRoute()!;
    expect(r.fullPath).toBe('/search?mode=lucene&idx=my-idx&q=*');
    expect(r.name).toBe('查询工作台');
    expect(r.ts).toBeGreaterThan(0);
  });

  it('首页/根路径不算现场（回首页 ≠ 有工作要继续）', () => {
    saveLastRoute('/search?mode=lucene&idx=a');
    saveLastRoute('/overview');
    saveLastRoute('/');
    expect(readLastRoute()!.fullPath).toBe('/search?mode=lucene&idx=a'); // 不被首页覆盖
  });

  it('裸进站（空 hash / #/ / #/overview）→ 提供恢复', () => {
    saveLastRoute('/search?mode=pit&idx=big');
    const saved = readLastRoute();
    for (const entry of ['', '#', '#/', '#/overview']) {
      expect(restorable(entry, saved)?.fullPath).toBe('/search?mode=pit&idx=big');
    }
  });

  it('深链进站是明确意图 → 不打扰', () => {
    saveLastRoute('/search?mode=pit&idx=big');
    const saved = readLastRoute();
    expect(restorable('#/search?mode=lucene&idx=other', saved)).toBeNull();
    expect(restorable('#/overview?tab=x', saved)).toBeNull();
  });

  it('现场超过 7 天过期 → 不再提示', () => {
    saveLastRoute('/bulk?idx=a');
    const saved = readLastRoute()!;
    const eightDays = saved.ts + 8 * 24 * 3600 * 1000;
    expect(restorable('#/', saved, eightDays)).toBeNull();
  });

  it('坏值/无记录静默返回 null', () => {
    expect(readLastRoute()).toBeNull();
    localStorage.setItem('esquerystudio.last-route', '{broken');
    expect(readLastRoute()).toBeNull();
    expect(restorable('#/', null)).toBeNull();
  });
});
