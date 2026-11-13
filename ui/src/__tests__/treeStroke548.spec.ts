/* 五百四十八批：QueryTreePane 空态漏斗插画 SVG 描边主题安全收口——
 * 原两处 `stroke="#fff"` 硬编码白描边（浅色主题硬编码白是潜在不可见风险位）改
 * stroke="currentColor"，图标本体色收敛到 .qtp-funnel 的 color（恒白：漏斗坐在品牌渐变
 * 徽标上，暗色渲染不变——不取 --tx-on-strong，该 token 暗色下是深字会翻转既有视觉）。
 * 全源码锚（本仓无 @vue/test-utils，readFileSync 锁 QueryTreePane.vue 形态，同
 * queryTreePaneButtons541 先例）。防回潮：描边硬编码清零 + 替换形态在位 + 取色链闭合。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../components/builder/QueryTreePane.vue'), 'utf-8');

describe('五百四十八批：QueryTreePane 漏斗 SVG 描边主题安全（硬编码 #fff 退役）', () => {
  it('源码不再含硬编码 stroke="#fff"（两处空态 SVG 一并收口，防回潮）', () => {
    expect(src.includes('stroke="#fff"')).toBe(false);
  });

  it('替换形态在位：stroke="currentColor" 恰两处（无查询条件 / match_all 空态各一）', () => {
    const hits = src.split('stroke="currentColor"').length - 1;
    expect(hits).toBe(2);
  });

  it('取色链闭合：.qtp-funnel 徽标自带 color，currentColor 不落默认黑（暗色视觉不变的前提）', () => {
    expect(src.includes('color: #fff;')).toBe(true);
  });
});
