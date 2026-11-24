/**
 * 五百六十三批·用户产线实报⑥「表格列选只能筛选,无法快速定位到列展示」。
 *
 * RT/QRT 内核已有完整定位能力(locateCol:隐藏列自动显示+scrollIntoView 横向滚动+列头
 * 闪烁 1.4s,cmd 面板「跳转到列 X」与 expose locate 两个入口)——但列选面板(ColPicker)
 * 没有定位入口,用户只能勾选增删列。修=ColPicker 每列行加「定位」钮 emit locate,
 * RT/QRT 接线调既有 locateCol(零新内核逻辑)。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');

const cp = read('components/ColPicker.vue');
const rt = read('components/ResultTable.vue');
const qrt = read('components/QueryResultTable.vue');

describe('563 实报⑥:列选面板定位入口(接通既有 locateCol 内核)', () => {
  it('ColPicker 每列行出定位钮并 emit locate(col)', () => {
    expect(cp).toMatch(/aria-label="定位到该列"/);
    expect(cp).toMatch(/@click\.stop\.prevent="emit\('locate', c\)"/);
    expect(cp).toMatch(/\(e: 'locate', col: string\): void/);
  });
  it('RT/QRT 接线 @locate=locateCol(内核能力已存在:隐藏列自动显示+闪烁 1.4s+滚动)', () => {
    expect(rt).toMatch(/@update:selected="visibleCols = \$event" @locate="locateCol"/);
    expect(qrt).toMatch(/@update:selected="visibleCols = \$event" @locate="locateCol"/);
    expect(rt).toContain('function locateCol(col: string)');
    expect(qrt).toContain('function locateCol(col: string)');
  });
});
