/**
 * 1224：列头左右内距必须与全局 `.tbl th` 同档。
 *
 * 现场（1440×1000 真浏览器，逐列读 computed padding）：
 *   RT（索引工作区）数据列 10/10 —— 继承全局 `.tbl th { padding: var(--sp-2) var(--sp-2h) }`（左右 10px）
 *   QRT（数据浏览器）数据列 8/8 —— 因为它把 th 和 td 写在**同一条规则**里
 *     `.qrt-tbl th, .qrt-tbl td { padding: var(--sp-1) var(--sp-2) }`（左右 8px）
 * 两表并排时同一级列头疏密不同，是"统一 = 同观感且同数值"的直接违背
 * （全局标准由 adaptive556 锁定为 `var(--sp-2h)`）。
 *
 * 改法只覆盖 th、不动 td：QRT 表格体的 8px 是另一处既定密度，改它会牵动所有宿主的行宽。
 * 复测：QRT 列头 8/8 → 10/10（行号列 2/8 → 2/10，与 RT 同）；RT 不变；QRT 的 td 仍 8px。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const theme = readFileSync(join(__dirname, '../theme.css'), 'utf-8');

describe('1224 列头内距对齐全局标准', () => {
  it('全局标准是 --sp-2h（左右 10px），QRT 列头跟它同档', () => {
    /* 基准：全局 .tbl th 用 --sp-2 / --sp-2h */
    expect(theme).toMatch(/\.tbl th \{[\s\S]{0,200}padding: var\(--sp-2\) var\(--sp-2h\)/);
    /* QRT 覆盖 th 的左右内距为标准档 */
    expect(qrt).toContain('.qrt-tbl th { padding-left: var(--sp-2h); padding-right: var(--sp-2h); }');
  });

  it('表格体（td）保持 8px 原密度，不被连同改掉', () => {
    /* th/td 的合并规则仍在（td 用它），左右仍为 --sp-2 */
    expect(qrt).toContain('.qrt-tbl th, .qrt-tbl td { padding: var(--sp-1) var(--sp-2);');
    /* 且不存在把 td 也提到 --sp-2h 的规则 */
    expect(qrt).not.toMatch(/\.qrt-tbl td[^{]*\{[^}]*padding-(left|right):\s*var\(--sp-2h\)/);
  });

  it('窄/宽松档只调上下内距，不覆盖左右（否则会把这 2px 又吃掉）', () => {
    expect(qrt).toContain('.qrt-tbl.dense th, .qrt-tbl.dense td { padding-top: var(--sp-0); padding-bottom: var(--sp-0); }');
    expect(qrt).toContain('.qrt-tbl.cozy th, .qrt-tbl.cozy td { padding-top: var(--sp-3); padding-bottom: var(--sp-3); }');
  });
});
