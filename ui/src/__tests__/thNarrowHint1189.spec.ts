/**
 * 1189：窄列表头悬停时 ⇅ 提示压在列名文字上。
 *
 * 1168 的取舍是「窄列悬停不加大沟槽，⇅ 浮出叠在文字尾部——短暂遮挡可接受」。
 * 实测（60px 列，hover）：列名文字右缘 376、⇅ 左缘 371 —— **已经压在一起**，
 * 用户看到的就是「按钮文案挡字」。遮挡没有「短暂」可言：鼠标停在表头就一直挡。
 *
 * 改为：窄档（容器 ≤96px）悬停不出 ⇅。排序方向仍有两条非遮挡表达——
 * aria-sort（读屏）与列头 title（悬浮可读）；已排序的实色箭头是状态，照常常驻。
 * 宽列行为不变（实测 310px 列悬停 display:block）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const narrow = rt.match(/@container \(max-width: 96px\) \{[\s\S]*?\n\}/)![0];

describe('1189 窄列表头不遮列名', () => {
  it('窄档容器规则里显式关掉 ⇅ 提示', () => {
    expect(narrow, '窄档必须隐藏 ⇅').toMatch(/\.rt-th:hover \.rt-th-sort-hint[^{]*\{ display: none; \}/);
  });

  it('窄档仍保留 14px 内衬（列名让位给常驻漏斗）', () => {
    expect(narrow).toMatch(/padding-right: 14px/);
  });

  it('宽档 ⇅ 仍浮出（只收窄档，不连坐）', () => {
    expect(rt).toMatch(/\.rt-th:hover \.rt-th-sort-hint, \.rt-th:focus-visible \.rt-th-sort-hint, \.rt-th:focus-within \.rt-th-sort-hint \{ display: block; \}/);
  });

  it('已排序箭头是状态，不参与窄档隐藏', () => {
    expect(narrow).not.toContain('.rt-th-sort-on');
  });

  it('负控：把窄档隐藏规则删掉 → 本条转红（判据不是恒真）', () => {
    const broken = narrow.replace('.rt-th:hover .rt-th-sort-hint, .rt-th:focus-visible .rt-th-sort-hint, .rt-th:focus-within .rt-th-sort-hint { display: none; }', '');
    expect(() => expect(broken).toMatch(/\.rt-th:hover \.rt-th-sort-hint[^{]*\{ display: none; \}/)).toThrow();
  });
});
