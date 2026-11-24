/**
 * 火焰图行右键（ProfileFlameView `.pf-flame-row`）接线与形态。
 *
 * 背景：火焰行此前的全部信息只在悬浮 `title` 上——**看不全、也复制不走**。
 * 排障时最常见动作是把「最慢的那一段叫什么、多久」贴给同事，之前只能手打。
 *
 * 本 spec 锁：行挂 @contextmenu、菜单在册、一级 ≤3（2 高频 + 1 分组父项）、
 * 只读页不得出现 danger/写操作；并锁「耗时换算口径」与悬浮 title 同源（ns → ms 两位小数）。
 * 负控：把一级铺平成一堆复制项必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/ProfileFlameView.vue'), 'utf-8');

function menuBlock(): string {
  const i = src.indexOf('const flameMenuItems');
  expect(i, 'flameMenuItems 必须存在').toBeGreaterThan(-1);
  const rest = src.slice(i);
  const end = rest.search(/\nfunction |\nconst [a-zA-Z]+ = (computed|ref)\(/);
  return end < 0 ? rest : rest.slice(0, end);
}

describe('火焰图行右键', () => {
  it('行挂 @contextmenu，handler 与菜单组件在册', () => {
    expect(src, '火焰行必须挂右键').toMatch(/class="pf-flame-row"[^>]*@contextmenu\.prevent="openFlameMenu\(\$event, n, i\)"/s);
    expect(src, '必须挂 CellContextMenu').toContain('<CellContextMenu');
    expect(src, '必须有 openFlameMenu').toContain('function openFlameMenu');
    expect(src, '必须构造菜单项').toContain('const flameMenuItems');
  });

  it('一级 ≤3 项且含分组父项（不把复制项铺平到一级）', () => {
    const blk = menuBlock();
    const topLevel = (blk.match(/^\s{4}\{ key:/gm) || []).length;
    expect(topLevel, '一级项应 ≤ 3').toBeLessThanOrEqual(3);
    expect(blk, '必须有分组父项').toMatch(/children:\s*\[/);
  });

  it('耗时换算与悬浮 title 同源（ns → ms 两位小数）', () => {
    /* 悬浮 title 写的是 `${(n.took / 1_000_000).toFixed(2)}ms`；
       右键复制的耗时必须是同一口径，否则两处数字对不上。 */
    expect(src, '悬浮 title 用 /1_000_000 + toFixed(2)').toMatch(/n\.took \/ 1_000_000\)\.toFixed\(2\)\}ms/);
    expect(src, '右键耗时同口径').toMatch(/Number\(ns \|\| 0\) \/ 1e6\)\.toFixed\(2\)/);
  });

  it('标题写明类型 + 耗时 + 行号（右键先知道点到了哪一段）', () => {
    expect(src).toMatch(/title: n\.type \+ ' · ' \+ msOf\(n\.took\) \+ ' · 第 ' \+ \(i \+ 1\) \+ ' 行'/);
  });

  it('负控：只读分析页不得出现危险动作', () => {
    /* 反向对照——火焰行是纯读数据，菜单出现 danger 就说明混进了写/删语义。 */
    expect(menuBlock(), '火焰行菜单不得含 danger 项').not.toMatch(/danger:\s*true/);
  });
});
