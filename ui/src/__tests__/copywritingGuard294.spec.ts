/**
 * 二百九十四批：全站文案统一守卫——空态/截断/计数口径的防回潮锁（266 批收敛固化）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const rt = read('../components/ResultTable.vue');
const qrt = read('../components/QueryResultTable.vue');

describe('文案统一守卫（294 批）', () => {
  it('空态默认文案=无数据（禁回退 无结果）', () => {
    expect(rt).toContain('text="无数据"');
    expect(qrt).toMatch(/emptyText: '无数据'/);
    expect(qrt).not.toContain("'无结果'");
  });
  it('截断尾行文案同口径（命中排序与筛选+导出指引）', () => {
    expect(rt).toContain('命中排序与筛选');
    expect(qrt).toContain('命中排序与筛选');
  });
  it('计数条「命中数为下界」标注：RT 内建+宿主传参（QRT 只读通道无 total 语义不适用）', () => {
    expect(rt).toContain('（命中数为下界）');
    expect(rt).toContain('totalGte?: boolean;');
  });
});
