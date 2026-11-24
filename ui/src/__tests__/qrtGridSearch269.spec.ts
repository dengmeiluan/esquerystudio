/**
 * 二百六十九批：QRT 结果内查找（RT 229 批 P0-1 同款合并）——两工作台/全站表格
 * 「有查找」一致性。锁定：useGridSearch 接线（renderRows×shownCols 所见即所搜）、
 * Ctrl+F 入口、Esc 先关查找、mark 切分与命中底色、当前命中落位。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const qrt = read('../components/QueryResultTable.vue');

describe('QRT 结果内查找（269 批）', () => {
  it('useGridSearch 接线：所见即所搜口径', () => {
    expect(qrt).toMatch(/useGridSearch\(\{/);
    expect(qrt).toMatch(/rows: \(\) => renderRows\.value\.length/);
    expect(qrt).toMatch(/cols: \(\) => shownCols\.value\.length/);
    expect(qrt).toMatch(/getText: \(ri, ci\) =>/);
    expect(qrt).toMatch(/displayText\(row\[ci\], ri, ci\)/);
  });
  it('Ctrl+F 入口 + Esc 先关查找 + HitNav 悬浮', () => {
    expect(qrt).toMatch(/@keydown\.ctrl\.f\.prevent="openSearch"/);
    expect(qrt).toMatch(/if \(searchOpen\.value\) \{ closeSearch\(\); return; \}/);
    expect(qrt).toMatch(/<HitNav v-model="searchKw"/);
    expect(qrt).toContain('qrt-hn');
  });
  it('命中渲染：mark 切分+琥珀底+当前命中落位', () => {
    expect(qrt).toMatch(/splitMark\(cellMeta\[ri\]\?\.\[ci\]\?\.text \?\? '', searchDeferred\)/);
    expect(qrt).toMatch(/'qrt-hit': isSearchHit\(ri, ci\)/);
    expect(qrt).toMatch(/\.qrt-cell\.qrt-hit \{ background: var\(--warn-soft\); \}/);
    expect(qrt).toMatch(/watch\(searchCur/);
  });
});
