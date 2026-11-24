/**
 * 一千三百三十一批：工具行在「差一点点」的宽度上被顶成两行。
 *
 * 用户反复说「表格格式表格操作的那个表头」挤占/遮挡。1100 档真机实测：
 *
 *   基线(1100)              h=68 两行   快筛框 160px
 *   只把快筛框 basis 降地板  h=41 单行   快筛框 98px
 *
 * 根因不是「东西太多」，而是 **flex 换行决策用的是 hypothetical main size**：
 * `.rt-qsearch { flex: 0 100 auto }` 的 basis 是内容宽 160px，只有在成行**之后**
 * 才轮到收缩——所以 1166 写的「快滤框先让位」在换行这一步根本没参与，
 * 差 43px 就整行折下去，白占 27px 高度并压走一屏数据。
 *
 * 本 spec 锁的就是这条：basis 必须已经在地板（90px，placeholder 可读下限），
 * 且 max-width 保住宽档原宽（1440/1200 实测仍 160px，零变化）。
 *
 * 负控：把 `flex: 1 1 90px` 改回 `flex: 0 100 auto` → 第 1 条必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../components/TableQSearch.vue'), 'utf-8');
const rule = (() => {
  const i = src.indexOf('.qrt-qsearch, .rt-qsearch { flex:');
  expect(i, '快筛框的 flex 规则必须存在').toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('}', i));
})();

describe('1331 快筛框参与换行决策（不是成行之后才收缩）', () => {
  it('basis 必须等于地板 90px，不能是 auto/内容宽', () => {
    const m = rule.match(/flex:\s*(\d+)\s+(\d+)\s+(\w+)/);
    expect(m, '必须写三值 flex').toBeTruthy();
    const [, , , basis] = m!;
    /* 换行决策只看 basis；auto/100%/160px 都会让这一行先按满宽排 */
    expect(basis === 'auto' || basis === '100%' || /\d+px/.test(basis) && basis !== '90px',
      `basis=${basis} 会让工具行先按内容宽排，差一点宽就折行`)
      .toBe(false);
    expect(basis).toBe('90px');
  });

  it('max-width 必须保留宽档原宽 160px（宽屏零变化）', () => {
    const m = rule.match(/max-width:\s*(\d+)px/);
    expect(m, '必须有 max-width').toBeTruthy();
    expect(Number(m![1])).toBe(160);
  });

  it('min-width 地板不得低于 placeholder 可读下限 90px', () => {
    const m = rule.match(/min-width:\s*(\d+)px/);
    expect(m, '必须有 min-width').toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(90);
  });
});
