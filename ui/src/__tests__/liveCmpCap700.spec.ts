/**
 * 七百批①·对比卡悬浮读出超长防护（R56 观察项「对比读出>8 节点截断」收口）。
 *
 * 现状：节点对比卡悬浮读出层 v-for 全量列节点行——节点数多（>8）时 tip 纵向失控
 * （图例已有隐藏 chips，但悬浮瞬态读出无防护）。=capRows 纯函数单源（utils/
 * monitorSeries）+视图 cmpRowsCapped 接线+尾行「+K 节点」聚合（title 兜底全列名）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { capRows } from '../utils/monitorSeries';

const viewSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const vt = strip(viewSrc).replace(/\s+/g, ' ');

describe('七百批① 对比读出超长防护（capRows 单源+尾行聚合）', () => {
  it('capRows：行数 ≤cap 全量直通 hidden=0', () => {
    const r = capRows([1, 2, 3], 8);
    expect(r.rows).toEqual([1, 2, 3]);
    expect(r.hidden).toBe(0);
  });

  it('capRows：行数 >cap 截前 cap 行+hidden 计数（首尾保真）', () => {
    const rows = Array.from({ length: 12 }, (_, i) => i);
    const r = capRows(rows, 8);
    expect(r.rows).toHaveLength(8);
    expect(r.rows[0]).toBe(0);
    expect(r.rows[7]).toBe(7);
    expect(r.hidden).toBe(4);
  });

  it('capRows：空数组/cap=0 边界', () => {
    expect(capRows([], 8)).toEqual({ rows: [], hidden: 0 });
    expect(capRows([1, 2], 0)).toEqual({ rows: [], hidden: 2 });
  });

  it('源码锁：读出层经 cmpRowsCapped 渲染+尾行聚合行在场', () => {
    expect(vt, 'computed 接线').toContain('cmpRowsCapped');
    expect(vt, '模板循环走截断集').toContain('in cmpRowsCapped.rows');
    expect(vt, '尾行聚合').toContain('+{{ cmpRowsCapped.hidden }} 节点');
  });
});
