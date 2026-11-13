/**
 * 五百四十九批：用户真机实报专修——行导航快捷键提示条挤出工具行。
 * 「点击的时候表格表头布局变形了」真凶=rt-kbd-hint（表格获焦即 inline 插入工具行，
 * 占布局把分页器/视图 seg 挤换行）。迁表底提示行（rt-stat-hint 同行，常驻不挤压工具行）；
 * v-if 形态与类名零触碰（rtRowNav 行为锁按类查询，位置迁移不破锁）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');

describe('rt-kbd-hint 迁表底提示行（549 批）', () => {
  it('快捷键提示不再在工具行（bar 区切片外）', () => {
    const barAt = rt.indexOf('<TableShell');
    const barEnd = rt.indexOf('</TableShell>');
    /* hint 元素若仍在 bar 槽切片内=占工具行布局（回归） */
    const hintAt = rt.indexOf('rt-kbd-hint');
    expect(hintAt).toBeGreaterThan(-1);
    expect(hintAt, 'hint 在 TableShell bar 槽之外（表底行）').toBeGreaterThan(barEnd);
  });
  it('显示形态零变：表格获焦+有数据才显示（rtRowNav 行为锁兼容）', () => {
    expect(rt).toMatch(/v-if="tblFocus && hits\.length"[^>]*class="rt-kbd-hint mono"|class="rt-kbd-hint mono"[^>]*v-if="tblFocus && hits\.length"/);
    expect(rt).toContain('↑↓ Home/End · Enter');
  });
  it('表底行 flex 收缩契约：hint 不把底行撑换行（flex-shrink:0+可截断）', () => {
    expect(rt.match(/\.rt-kbd-hint \{[^}]*\}/)?.[0]).toMatch(/flex-shrink: 0/);
  });
});
