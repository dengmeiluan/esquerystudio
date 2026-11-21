/**
 * 命中行右键（ScoreExplainView / SearchSandboxView）接线契约。
 *
 * 这两处此前整块只能靠行内按钮，行本身没有右键能力——用户明确要求
 * 「鼠标右键必须极致的增强在整个项目，现在很多地方没有右键能力」。
 *
 * 本 spec 锁接线与菜单形态（源码锚 + 结构断言），并锁「按项目右键约定」：
 * 一级 ≤ 2 个高频动作 + 1 个分组父项，其余收进二级（不把功能平铺到一级）。
 * 负控：把二级项拍平到一级，必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const se = readFileSync(join(__dirname, '../views/ScoreExplainView.vue'), 'utf-8');
const ss = readFileSync(join(__dirname, '../views/SearchSandboxView.vue'), 'utf-8');

/** 取组件内 hitMenuItems 的源码块（从声明到下一个顶层 function/const） */
function menuBlock(src: string): string {
  const i = src.indexOf('const hitMenuItems');
  expect(i, 'hitMenuItems 必须存在').toBeGreaterThan(-1);
  const rest = src.slice(i);
  const end = rest.search(/\nfunction |\nconst [a-zA-Z]+ = ref/);
  return end < 0 ? rest : rest.slice(0, end);
}

describe('命中行右键接线', () => {
  it('ScoreExplain：行挂 @contextmenu，菜单组件挂载，handler 存在', () => {
    expect(se, '命中行必须挂右键').toMatch(/class="se-hit"[^>]*@contextmenu\.prevent="openHitMenu\(\$event, h\)"/s);
    expect(se, '菜单组件必须挂载').toContain('<CellContextMenu');
    expect(se, '必须有 openHitMenu').toContain('function openHitMenu');
    expect(se, '菜单项必须构造').toContain('const hitMenuItems');
  });

  it('SearchSandbox：行挂 @contextmenu，菜单组件挂载，handler 存在', () => {
    expect(ss, '命中行必须挂右键').toMatch(/class="ss-hit"[^>]*@contextmenu\.prevent="openHitMenu\(\$event, h\)"/s);
    expect(ss, '菜单组件必须挂载').toContain('<CellContextMenu');
    expect(ss, '必须有 openHitMenu').toContain('function openHitMenu');
    expect(ss, '菜单项必须构造').toContain('const hitMenuItems');
  });

  it('ScoreExplain 一级不复用行内已有的二级动作（按项目右键约定收进二级）', () => {
    /* 一级 = 复制 _id / 复制命中文档 JSON + 一个分组父项；送排名侦探/查 X 光/explanation 全在二级 */
    const blk = menuBlock(se);
    expect(blk, '必须有分组父项').toMatch(/children:\s*\[/);
    const topLevel = (blk.match(/^\s{4}\{ key:/gm) || []).length;
    expect(topLevel, '一级项应 ≤ 3（2 个高频 + 1 个分组父项）').toBeLessThanOrEqual(3);
    /* 二级里的动作在这两页已有同名能力，右键只是把它搬近 */
    expect(blk, '二级应含排名侦探').toContain('排名侦探');
    expect(blk, '二级应含查询 X 光').toContain('X 光');
  });

  it('SearchSandbox 一级只放复制类，其余收二级', () => {
    const blk = menuBlock(ss);
    expect(blk, '必须有分组父项').toMatch(/children:\s*\[/);
    const topLevel = (blk.match(/^\s{4}\{ key:/gm) || []).length;
    expect(topLevel, '一级项应 ≤ 3').toBeLessThanOrEqual(3);
  });

  it('负控：一级项数量判据不是恒真（12 个平铺会超限）', () => {
    /* 反向对照——把 12 个一级项喂给同一判据，必须超限。
       若判据被改坏成恒真式，这条会红。 */
    const flat12 = Array.from({ length: 12 }, (_, i) => `    { key: 'k${i}', label: 'x' },`).join('\n');
    const topLevel = (flat12.match(/^\s{4}\{ key:/gm) || []).length;
    expect(topLevel, '12 个平铺项必须判超限').toBeGreaterThan(3);
  });

  it('两处菜单都在行级动作上克制：不含删除/破坏性操作', () => {
    /* 命中行没有"删除文档"语义（这两页是只读分析），danger 项出现即为越界 */
    expect(menuBlock(se)).not.toMatch(/danger:\s*true/);
    expect(menuBlock(ss)).not.toMatch(/danger:\s*true/);
  });
});
