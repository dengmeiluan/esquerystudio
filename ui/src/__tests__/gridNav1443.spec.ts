/* 1443：拓扑分片矩阵方向键导航（纯函数 + 源码接线锁）。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gridNext } from '../utils/gridNav';

const src = readFileSync(join(__dirname, '../views/TopologyView.vue'), 'utf-8');

describe('1443 拓扑分片矩阵导航', () => {
  it('方向键按列移动，边界返回 null（不拦截滚动）', () => {
    /* 3 列、7 格（0..6） */
    expect(gridNext('ArrowRight', 0, 3, 7)).toBe(1);
    expect(gridNext('ArrowLeft', 0, 3, 7)).toBeNull();
    expect(gridNext('ArrowDown', 0, 3, 7)).toBe(3);
    expect(gridNext('ArrowUp', 0, 3, 7)).toBeNull();
    expect(gridNext('ArrowDown', 5, 3, 7)).toBeNull(); /* 5+3=8 越界 */
    expect(gridNext('ArrowUp', 4, 3, 7)).toBe(1);
    expect(gridNext('ArrowRight', 6, 3, 7)).toBeNull(); /* 行尾不跨行 */
    expect(gridNext('Home', 5, 3, 7)).toBe(0);
    expect(gridNext('End', 1, 3, 7)).toBe(6);
    expect(gridNext('Enter', 1, 3, 7)).toBeNull();
  });

  it('空矩阵/非法下标/零列安全返回 null', () => {
    expect(gridNext('ArrowDown', 0, 3, 0)).toBeNull();
    expect(gridNext('ArrowDown', -1, 3, 4)).toBeNull();
    expect(gridNext('ArrowDown', 9, 3, 4)).toBeNull();
    expect(gridNext('ArrowDown', 0, 0, 4)).toBeNull();
  });

  it('源码锁：分片 <g> 带索引与键盘处理，并聚焦同组目标格', () => {
    expect(src).toContain(':data-shard-idx="si"');
    expect(src).toContain('@keydown="onShardKey($event, g, s, si)"');
    expect(src).toContain('function onShardNav');
    expect(src).toContain('function onShardKey');
    expect(src).toContain("querySelectorAll<SVGGElement>('[data-shard-idx]')");
  });
});
