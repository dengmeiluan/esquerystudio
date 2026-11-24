import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAppStore } from '../app';

/* R61：最近工作索引的契约锁——顶栏「最近使用」分组与 ⌘K 置顶的数据源。 */

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('recentIdx 最近工作索引（R61）', () => {
  it('pick 依次记录，最新在前且去重', () => {
    const store = useAppStore();
    store.pick('a');
    store.pick('b');
    store.pick('a');
    expect(store.recentIdx).toEqual(['a', 'b']);
  });

  it('上限 8 个，最旧被挤出', () => {
    const store = useAppStore();
    for (let i = 1; i <= 10; i++) store.pick('idx-' + i);
    expect(store.recentIdx).toHaveLength(8);
    expect(store.recentIdx[0]).toBe('idx-10');
    expect(store.recentIdx).not.toContain('idx-1');
    expect(store.recentIdx).not.toContain('idx-2');
  });

  it('pick 空串（清选）不记录', () => {
    const store = useAppStore();
    store.pick('a');
    store.pick('');
    expect(store.recentIdx).toEqual(['a']);
  });

  it('localStorage 持久化，重建 store 后恢复', () => {
    const store = useAppStore();
    store.pick('a');
    store.pick('b');
    setActivePinia(createPinia());
    const fresh = useAppStore();
    expect(fresh.recentIdx).toEqual(['b', 'a']);
  });

  it('坏值静默回落空数组', () => {
    localStorage.setItem('es_recent_idx', '{oops');
    const store = useAppStore();
    expect(store.recentIdx).toEqual([]);
  });
});
