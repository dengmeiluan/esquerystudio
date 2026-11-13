/**
 * 1185：表格状态栏「单行自动」在窄宽度被逐字折行。
 *
 * 实测现场（1024 宽索引工作区）：状态栏是 flex，标签是 flex label，
 * 中文可逐字换行 —— 相邻提示文本一挤，「单行自动」就变成「单行自 / 动」两行，
 * 状态栏高度跟着跳。勾选钮是可操作项、提示是可省略说明，优先级应反过来。
 *
 * 锁：① 标签 nowrap 且不参与收缩（flex:none）；
 *     ② 提示文本可收缩 + 省略号（让位方是提示，不是标签）；
 *     ③ 负控：删掉 nowrap → 源码锁转红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');

describe('1185 状态栏标签不折行', () => {
  it('.rt-transpose 标签 nowrap 且不收缩', () => {
    const m = src.match(/\.rt-transpose\s*\{[^}]*\}/);
    expect(m, '.rt-transpose 规则必须存在').toBeTruthy();
    expect(m![0]).toContain('white-space: nowrap');
    expect(m![0]).toContain('flex: none');
  });

  it('提示文本是可让位方（收缩 + 省略号）', () => {
    expect(src).toMatch(/\.rt-status \.rt-stat-hint\s*\{[^}]*text-overflow:\s*ellipsis/);
  });

  it('负控：标签旁不许出现可折行的等宽规则（改回无 nowrap 即失败）', () => {
    /* 这条锁的意义：把 nowrap 从 .rt-transpose 里删掉必须报错 */
    const m = src.match(/\.rt-transpose\s*\{[^}]*\}/)![0];
    expect(m).not.toMatch(/white-space:\s*normal/);
  });
});
