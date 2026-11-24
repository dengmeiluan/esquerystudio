/**
 * v3.0.0 排序纠错批：ResultTable 列排序数值感知统一。
 * N5 实锤：sortedHits 比较器此前 `typeof === 'number' ? va-vb : localeCompare`——
 * keyword 映射的数字字段值是字符串（"100"/"20"），localeCompare 典序下 100 排在 20 前；
 * QRT（parseFloat 双数）与 useTableSort（numeric 含单位还原）早已数值感知，仅 RT 掉队。
 * 修复=导出 tableSort.numeric 供 RT 复用，三方口径归一。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { numeric, compareVals } from '../composables/tableSort';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');

describe('排序比较器数值感知（v3.0.0 N5 纠错）', () => {
  it('numeric()：数字字符串按数值还原（"100">"20"）', () => {
    expect(numeric('100')).toBe(100);
    expect(numeric('20')).toBe(20);
    expect(numeric('100') > numeric('20')).toBe(true);
  });

  it('numeric()：单位/百分号/千分位字符串还原（useTableSort 既有口径）', () => {
    expect(numeric('1.2gb')).toBeCloseTo(1.2 * 1024 ** 3);
    expect(numeric('95%')).toBe(95);
    expect(numeric('3,943')).toBe(3943);
    expect(Number.isNaN(numeric('abc'))).toBe(true);
    expect(Number.isNaN(numeric({ a: 1 }))).toBe(true);
  });

  it('ResultTable 已接入数值感知比较（源码结构断言：弱 typeof 比较形态移除；五百六十批同步更新=比较器合并 compareVals 单源，numeric 经其双试生效；五百六十七批同步更新=RT 半边对称件 sortableGuard 并入同一 import；六百零三批同步更新=useSortChain 并入同一 import）', () => {
    expect(rt).toContain("import { compareVals, sortableGuard, useSortChain } from '../composables/tableSort'");
    expect(rt).toContain('const r = compareVals(va, vb)');
    expect(rt).not.toContain("typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va)");
  });

  it('行为直测：数字型字符串列按数值序（compareVals 单源直演；六百零三批同步更新——useTableSort 僵尸壳退役，数值序契约锁 compareVals 本体）', () => {
    const vals = ['100', '20', '3'];
    const sorted = vals.slice().sort((a, b) => compareVals(a, b));
    expect(sorted).toEqual(['3', '20', '100']);
    expect(compareVals('100', '20') > 0).toBe(true);
  });
});
