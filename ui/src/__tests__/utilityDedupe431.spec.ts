/**
 * 四百三十一批：次要实用类重复收口——跨视图重复扫描（430 批）清点的次要簇：
 * ① .tbl th.sortable 增强（user-select/nowrap）三视图重复 → 合并 theme 既有规则；
 * ② .mono font-family 冗余三处删除（theme 154 既有 code,pre,.mono）；
 * ③ .dim/.sm-txt 弱化/微缩文字类合并 theme.css。
 * .empty 局部紧凑覆盖（theme 全局 34px padding 语义不同）明确保留不收。
 * 七百八十三批同步更新：① 的 theme.css 合并规则随「可排序表头族」整族退役（全站 th
 * 挂 sortable 唯 QRT，根类 .qrt-tbl 自带全套——死因链见 themeDeadFamilies783.spec）；
 * ②③ 的合并形态仍在场，锁保留。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const theme = readFileSync(join(SRC, 'theme.css'), 'utf-8');

describe('次要实用类收口（431 批）', () => {
  it('theme.css：dim/sm-txt 合并在场（sortable 合并 783 批随族退役）', () => {
    expect(theme).not.toContain('.tbl th.sortable');
    expect(theme).toMatch(/\.dim \{ color: var\(--tx2\); font-size: var\(--fs-sm\); \}/);
    expect(theme).toMatch(/\.sm-txt \{ font-size: var\(--fs-xs\); font-weight: 400; \}/);
  });

  it('视图侧重复定义清零', () => {
    for (const f of ['DiagView.vue', 'SecurityView.vue', 'SystemView.vue']) {
      const s = readFileSync(join(SRC, 'views', f), 'utf-8');
      expect(s, f).not.toContain('.tbl th.sortable { cursor: pointer; user-select: none;');
    }
    for (const f of ['BoostTunerView.vue', 'MatchMatrixView.vue', 'QueryXrayView.vue']) {
      const s = readFileSync(join(SRC, 'views', f), 'utf-8');
      expect(s, f).not.toContain('.mono { font-family: var(--mono, monospace); }');
      expect(s, f + ' 使用点保留').toContain('mono');
    }
  });
});
