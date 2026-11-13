/**
 * 二百九十五批：表格基础样式守卫——行高三档 padding/斑马纹/冻结 sticky 口径两表一致锁定。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const rt = read('../components/ResultTable.vue');
const qrt = read('../components/QueryResultTable.vue');

describe('表格基础样式守卫（295 批）', () => {
  it('宽松档 12px 两表一致；紧凑档 RT 3px/QRT 2px 各自基线不漂移', () => {
    /* 五百三十八批 --sp 等值收口同步更新：cozy 宽松档 12px=--sp-3 恒等替换（值语义零变更，档位锚不漂移） */
    expect(rt).toMatch(/\.rt\.cozy .*padding-top: var\(--sp-3\)/);
    expect(qrt).toMatch(/\.qrt-tbl\.cozy th, \.qrt-tbl\.cozy td \{ padding-top: var\(--sp-3\); padding-bottom: var\(--sp-3\); \}/);
    expect(rt).toContain('.rt.dense .rt-tbl :deep(td), .rt.dense .rt-tbl :deep(th) { padding-top: 3px');
    expect(qrt).toContain('.qrt-tbl.dense th, .qrt-tbl.dense td { padding-top: var(--sp-0); padding-bottom: var(--sp-0); }');
  });
  it('斑马纹+紧凑关条纹两表同构（264 批收敛固化）', () => {
    expect(rt).toMatch(/\.rt\.dense \.rt-tbl tbody tr:nth-child\(even\) \{ background: transparent; \}/);
    expect(qrt).toContain('.qrt-tbl.dense tbody tr:nth-child(even) { background: transparent; }');
    expect(rt).toContain('class="tbl rt-tbl zebra"');
  });
  it('sticky 标识列 min-width 铁律不回潮（150 批）——QRT 序号列 sticky+min-width 同锁', () => {
    /* QRT：复合选择器 .qrt-tbl th.qrt-idx, .qrt-tbl td.qrt-idx（sticky+52px min-width） */
    expect(qrt).toMatch(/\.qrt-tbl th\.qrt-idx, \.qrt-tbl td\.qrt-idx \{\s*box-sizing: border-box; position: sticky; left: 0; width: 52px; min-width: 52px;/);
    /* RT：勾选/序号列 sticky 经专属规则（td 层）锁定 */
    expect(rt).toContain('.rt-tbl tr.sel td.rt-col-frozen');
  });
});
