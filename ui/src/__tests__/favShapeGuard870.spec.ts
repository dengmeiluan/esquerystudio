/**
 * 横切审计第七轮预扫刀面一：收藏夹 loadFav 形态守卫。
 *
 * 同域比对法定谳：storage→JSON.parse 域 37 消费点里形态守卫（Array.isArray/谓词）
 * 全线在场（useTablePrefs.restoreCols/readPresets、queryHistory、liveMonitor、
 * loadRecent、settings……），唯 favorites 键（esquerystudio.favorites.v1）漏网——
 * 现状 try/catch 只挡「坏 JSON」，不挡「合法 JSON 非数组」：该键被写入对象/
 * 字符串形态后 favorites 变非数组，收藏页 forEach、命令面板 slice、全站收藏
 * 星标 findIndex/unshift/filter 全链路 TypeError，三面瘫痪直到手动清键。
 *
 * 修法与 useTablePrefs.restoreCols 同构：解析后 Array.isArray 回落空数组。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAppStore } from '../stores/app';

const FAV_KEY = 'esquerystudio.favorites.v1';
const FAV = [{ id: 'f1', kind: 'dsl', title: 'T', payload: {}, ts: 1 }];

beforeEach(() => {
  localStorage.clear();
});

describe('loadFav 形态守卫（坏形态合法 JSON 不得炸收藏链路）', () => {
  it('非数组合法 JSON 回落空数组，收藏写链路（findIndex/unshift/filter）可用', () => {
    localStorage.setItem(FAV_KEY, '{"a":1}');
    setActivePinia(createPinia());
    const store = useAppStore();
    expect(Array.isArray(store.favorites)).toBe(true);
    expect(store.favorites).toEqual([]);
    expect(() => store.addFavorite({ kind: 'dsl', title: 'x', payload: {} } as any)).not.toThrow();
    expect(store.favorites).toHaveLength(1);
  });

  it('合法数组原样恢复（守卫不误伤）', () => {
    localStorage.setItem(FAV_KEY, JSON.stringify(FAV));
    setActivePinia(createPinia());
    const store = useAppStore();
    expect(store.favorites).toHaveLength(1);
    expect(store.favorites[0].id).toBe('f1');
  });

  it('坏 JSON 回落空数组（既有 catch 行为锚定）', () => {
    localStorage.setItem(FAV_KEY, '{oops');
    setActivePinia(createPinia());
    const store = useAppStore();
    expect(store.favorites).toEqual([]);
  });
});
