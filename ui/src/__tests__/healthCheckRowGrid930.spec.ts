/**
 * 930：HealthReportView 检查项行栅格治理——.hr-check 是 3 列 grid（24px 图标/名称/详情）
 * 但模板有 4 个子项（第 4 个=复制按钮）。自动放置把按钮掉进「第 2 行第 1 栏」=24px 图标
 * 轨道（≤900 档同形态缺陷已被量尺抓过并有显式落栏修正；>900 宽档无显式落栏=按钮换行
 * 到图标轨道下，交互布局错乱且行高翻倍）。修法=4 列模板（尾部 auto 轨道把按钮收进行内
 * 行尾）+按钮对齐规则（垂直居中+行尾右对齐），≤900 档既有落栏修正保持原样。
 * 源码锁（jsdom 不做真实 grid 布局，行为锚恒假绿——867 同族判例口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/HealthReportView.vue'), 'utf-8');

describe('HealthReportView 检查项行栅格（930）', () => {
  it('4 列模板：尾部 auto 轨道把复制按钮收进同一行行尾（宽档不再换行进图标轨道）', () => {
    expect(src).toMatch(
      /\.hr-check \{ display: grid; grid-template-columns: 24px minmax\(120px, 160px\) minmax\(0, 1fr\) auto;/);
  });
  it('复制按钮对齐规则在场：垂直居中+行尾右对齐；grid 语境下失效的 flex 内联口吻退役', () => {
    expect(src).toMatch(/\.hr-check > \.btn \{ align-self: center; justify-self: end; \}/);
    expect(src).not.toContain('style="margin-left:auto;flex:none"');
  });
  it('≤900 档显式落栏修正保持原样（窄档三行形态不随本刀回退）', () => {
    expect(src).toMatch(/\.hr-check > \.btn \{ grid-column: 2; justify-self: end; \}/);
  });
});
