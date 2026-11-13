/**
 * 五百六十五批·W4【轨4 扁平化扫荡】件④：SearchSandbox 900 档裁决（全站 16 遍
 * 扫荡后唯一待实裁文件）。
 *
 * 背景：responsive900Sweep529 台账——ForbiddenView/NotFoundView（静态页豁免）、
 * LuceneQueryView（单栏 flex 自然自适应豁免）已裁，SearchSandboxView 552 批出册
 * 后零 @media（pane 堆叠归 WorkbenchLayout <1100 JS 档、lr-bar wrap 兜底在档）。
 * 实裁其布局：全页零 grid-template-columns（单列化无对象），但 .ss-editor/
 * .ss-result 两卡头（.card-t 全局档 flex 无 wrap）内工具群在 900 下横排挤压
 * （编辑器卡头=快捷键提示文案+构建器钮；结果卡头=Response+seg 五视图钮+原始 IO
 * +聚焦钮）——裁定补 900 微调档：两卡头允许 wrap（§9.3 口径，只加 CSS 零结构动，
 * 528 W-E「wrap 换行」同款）；pane 堆叠/进度条/snips/hit 头均已有 wrap 或 JS 档
 * 兜底，不重复收。
 *
 * 入册备案：responsive900Sweep529 清单归册主维护，不扩该 spec（VIEWS_531 注
 * 已记 552 出册因由）；本 spec 独立锁补档在场 + 豁免检查逻辑（无多列 grid=
 * 自适应安全的证明面）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ss = readFileSync(join(__dirname, '../views/SearchSandboxView.vue'), 'utf-8');
/* 900 档块提取（responsive900Sweep529 block900Of 同款正则） */
const block900 = ss.match(/@media \(max-width: 900px\) \{[\s\S]*?\n\}/);

describe('五百六十五批④：SearchSandbox 900 档实裁（补档）', () => {
  it('900 紧凑微调档在场且非空：两卡头 wrap 换行（552 出册后重新入档）', () => {
    expect(block900, '900 档缺失').toBeTruthy();
    expect(block900![0], '两卡头 wrap 档在场')
      .toMatch(/\.ss-editor > \.card-t, \.ss-result > \.card-t \{ flex-wrap: wrap; row-gap: var\(--sp-1\); \}/);
  });

  it('豁免检查逻辑：布局零 grid-template-columns 声明（单列化无对象，档只做 wrap 即自适应安全）', () => {
    expect(ss, '本页无多列 grid 布局规则（注释备案字样不计），不需要单列化断点')
      .not.toMatch(/grid-template-columns\s*:/);
  });

  it('900 档纪律（responsive900Sweep529 锚②同口径）：档内无 ≥300px 裸 width、视图侧无 min-width:901px', () => {
    expect(ss).not.toContain('min-width: 901px');
    for (const line of block900![0].split('\n')) {
      const m = line.match(/(?:^|[^-.\w])width:\s*(\d{3,})px/);
      expect(!!m && Number(m[1]) >= 300, `900 档出现 ≥300px 裸 width：${line.trim()}`).toBe(false);
    }
  });
});
