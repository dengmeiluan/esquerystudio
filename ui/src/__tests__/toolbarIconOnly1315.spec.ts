/**
 * 窄档图标化后，工具行按钮不能变成空白。
 *
 * 真机实测（SQL 结果表 @1100px）：`.qrt-tool-t`（可见文字）在窄档被 `display:none`，
 * 而 QRT 的「视图 ⋯」按钮**只有文字、没有图标** —— 文字一藏，就剩 18px 的内边距，
 * 变成一个**空白不可辨识的按钮**。同一条带子里其它钮（导出/列选/布局/原始 IO/高度/放大）
 * 都是 22–31px 且带图标；RT 侧的「视图 ⋯」本来就有 SlidersHorizontal。
 *
 * 判据：凡带 `.qrt-tool-t` / `.rt-tool-t`（会被窄档隐藏）的按钮，必须同时带图标组件。
 * 负控：构造一个只有文字的同类按钮，判据必须拒绝。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');

/** 取工具行区段 */
function barSeg(src: string): string {
  const i = src.indexOf('<TableShell');
  const j = src.indexOf('</TableShell>', i);
  expect(i, 'TableShell 必须存在').toBeGreaterThan(-1);
  return src.slice(i, j);
}

/** 抽出所有 button 内容块 */
function buttons(seg: string): string[] {
  return [...seg.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(m => m[0]);
}
/** 该按钮是否有可见文字标签（窄档会被隐藏那类） */
const hasHidableLabel = (b: string) => /(qrt|rt)-tool-t/.test(b);
/** 该按钮是否有图标组件（lucide 的组件名首字母大写） */
const hasIcon = (b: string) => /<(?!\/)[A-Z][A-Za-z]+\s[^>]*size=/.test(b);

describe('窄档图标化不留空白按钮', () => {
  it('QRT：带可隐藏文字的按钮必须同时带图标', () => {
    const bad = buttons(barSeg(qrt)).filter(b => hasHidableLabel(b) && !hasIcon(b))
      .map(b => (b.match(/aria-label="([^"]+)"/) || [, b.slice(0, 40)])[1]);
    expect(bad, '这些钮文字一藏就变成空白：' + bad.join(' | ')).toEqual([]);
  });

  it('RT：同口径（防新加按钮重蹈覆辙）', () => {
    const bad = buttons(barSeg(rt)).filter(b => hasHidableLabel(b) && !hasIcon(b))
      .map(b => (b.match(/aria-label="([^"]+)"/) || [, b.slice(0, 40)])[1]);
    expect(bad, '这些钮文字一藏就变成空白：' + bad.join(' | ')).toEqual([]);
  });

  it('「视图 ⋯」确实是会掉文字的那类钮（否则本 spec 没有意义）', () => {
    expect(qrt, '窄档确实会隐藏 .qrt-tool-t').toMatch(/\.qrt-bar \.qrt-tool-t \{ display: none; \}/);
    const viewBtn = buttons(barSeg(qrt)).find(b => /aria-label="视图设置"/.test(b));
    expect(viewBtn, '视图 ⋯ 按钮必须存在').toBeTruthy();
    expect(viewBtn!, '视图 ⋯ 必须带 SlidersHorizontal 图标').toMatch(/<SlidersHorizontal\s[^>]*size=/);
  });

  it('负控：只有文字没有图标的按钮必须被判不合格', () => {
    const stripped = '<button aria-label="视图设置" class="btn sm ghost qrt-tool-btn"><span class="qrt-tool-t">视图 ⋯</span></button>';
    expect(hasHidableLabel(stripped), '它确实带可隐藏文字').toBe(true);
    expect(hasIcon(stripped), '它没有图标——判据必须拒绝').toBe(false);
  });
});
