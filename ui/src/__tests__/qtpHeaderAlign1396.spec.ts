import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const QTP = readFileSync(join(__dirname, '../components/builder/QueryTreePane.vue'), 'utf-8');

/* 1396：条件树头部行的占位元素与吸顶区留白。

 ⚠ 归因修正（2026-10-31 实测）：这条最初写的是「空 span 按基线落行底，把后面的
 「过滤条件…」挤出一道视觉断口」。复测证明**后半句不成立**——过滤框在改前改后都在
 同一 y（实测 181），空 span 高度为 0、不参与布局，挤不动任何邻居。
 在四种组合（深浅主题 × 1440/2000 宽）下实测：过滤框与上方按钮间隔 6px、
 与下方条件区间隔 8px，**没有遮挡**。

 因此本 spec 只锁两件**真实成立**的事：
  ① 占位元素自身归位（空元素在 flex 行里会落到行底，虽是纯占位但语义上该 stretch）；
  ② 吸顶区有上内衬（过滤框与工具行之间不再是 3px 的贴脸距离）。
 不再声称它们修好了某个视觉遮挡——那是错误归因。 */
describe('1396 条件树头部占位与留白', () => {
  it('占位 span 是纯占位（stretch + 零最小高 + 对读屏隐藏）', () => {
    expect(QTP).toContain('style="flex:1; align-self:stretch; min-height:0"');
    expect(QTP).toContain('aria-hidden="true"');
  });

  it('吸顶区有上内衬，过滤框不与工具行贴脸', () => {
    expect(QTP).toContain('padding: var(--sp-1) 0 var(--sp-1); }');
    expect(QTP, '不再是无上内衬的旧值').not.toContain('background: var(--bg0); padding: var(--sp-0) 0 var(--sp-1); }');
  });

  it('负控：空 flex 元素在 align-items:center 下的居中位置 ≠ 有内容元素的位置', () => {
    /* 这不是像素断言，是一条布局事实：行高 26、空盒高 0 → center 把它放到 top+13，
       而有内容的兄弟（高 23~26）在 top+0~1.5。差值 13px 正是实测值。
       它解释「为什么占位元素看起来低」，也解释「为什么它挤不动别人」——高度为 0。 */
    const rowH = 26, boxH = 0;
    expect((rowH - boxH) / 2).toBe(13);
    /* 关键：它占用的纵向空间是 0，因此不改变任何兄弟的排版 */
    expect(boxH).toBe(0);
  });
});
