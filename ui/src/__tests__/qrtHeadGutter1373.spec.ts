/**
 * 1373：SQL 结果表（QRT）表头列名 vs 排序/筛选图标 —— 真机实测过的遮挡回归。
 *
 * 真机（1440 宽、8 列 WIDE_TABLE）实测：原 `min(32px, max(12px, 30%))` 比例内衬在窄列只给
 * 18.6px，而最靠左的图标（排序 ⇅ right:25px 宽 10px）实际占右 35px ——
 * score / region / status 三列文字压在图标上 13px，region 整词溢出。
 *
 * 修法：固定 35px 沟槽（盖住 ⇅ 与漏斗两个 absolute 图标）+ 表头最小列宽 96px
 * （窄列优先保列名，与 RT 1189 同裁决）。修复后同样条件下 8 列间距全部为正（最小 +10px）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

function ruleBody(sel: string): string {
  const i = SRC.indexOf(sel + ' {');
  expect(i, `必须有 ${sel} 规则`).toBeGreaterThan(-1);
  return SRC.slice(i, SRC.indexOf('}', i));
}

describe('1373 QRT 表头沟槽', () => {
  it('列名右侧固定留 35px（盖住 ⇅ @right:25px + 漏斗 @right:6px）', () => {
    expect(ruleBody('.qrt-th-name'), '不能再用比例内衬').toContain('padding-right: 35px');
    expect(SRC, '比例制写法必须消失').not.toContain('padding-right: min(var(--sp-6), max(var(--sp-3), 30%))');
  });

  it('悬停档同样 35px（不跳变、不把列名缩回去）', () => {
    const i = SRC.indexOf('.qrt-tbl th:hover .qrt-th-name');
    expect(i).toBeGreaterThan(-1);
    expect(SRC.slice(i, SRC.indexOf('}', i))).toContain('padding-right: 35px');
  });

  it('表头有最小列宽，窄列优先保列名', () => {
    expect(SRC, '窄列不许把列名挤到无字可显').toMatch(/\.qrt-tbl th:has\(\.qrt-th-name\) \{ min-width: 96px; \}/);
  });

  it('图标锚点值与沟槽一致（改了一边必须改另一边）', () => {
    /* 沟槽 35px 的依据就在这里；任一图标右移都会破坏这条等式 */
    expect(SRC, '⇅ 锚点').toMatch(/\.qrt-sort-i \{[^}]*right: 25px/);
    expect(SRC, '漏斗锚点').toMatch(/\.qrt-funnel \{[^}]*right: 6px/);
  });

  it('负控：把沟槽改回 22px → 判据必须红', () => {
    const broken = SRC.replace('.qrt-th-name { display: block; max-width: 100%; padding-right: 35px;',
      '.qrt-th-name { display: block; max-width: 100%; padding-right: 22px;');
    expect(broken, '负控必须真的改掉').not.toBe(SRC);
    const i = broken.indexOf('.qrt-th-name {');
    expect(broken.slice(i, broken.indexOf('}', i))).not.toContain('padding-right: 35px');
  });
});
