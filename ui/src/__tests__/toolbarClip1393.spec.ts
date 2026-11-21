import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DQ = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const THEME = readFileSync(join(__dirname, '../theme.css'), 'utf-8');

/* 1393：查询工作台工具行在 1101~1155px 的两处实测缺陷。

 ① 「新文档 / 更多」被静默裁掉
   `.dq-toolbar .lr-bar-l { overflow: hidden }` + `nowrap` 单行时，内容宽 871px；
   换行规则却只挂在 `@media (max-width: 1100px)`，于是 1101~1155px 是空档：
   左段仍旧裁切。逐宽度实测（1124×249，用户截图尺寸）：
     1101px 裁掉 26px、1120px 裁掉 7px —— 被裁的都是最右的「更多」钮。
   断点按实测收到 1160px。

 ② 「过滤条件」浮到工具行上方
   `.lr-bar.freeze` 用 `margin-top: -16px` 抵消 `.page` 的 padding-top，
   让冻结行贴顶，代价是文档流里少算 16px。单行时正好；**换行后**工具行实际 110px
   却只占 94px，下面的 `.dq-main` 被算到 238 而工具行底边在 244
   —— 实测压住条件树 6px，吸顶的 `.qtp-sticky`（z-index:6）就浮到工具行上方。
   窄档把负上边距归零；A/B 实测 gap 从 -6px 回到 +10px。 */
describe('1393 工具行窄档不裁切、不重叠', () => {
  it('① 换行断点覆盖实测所需的 1160px（不是 1100px）', () => {
    const idx = DQ.indexOf('@media (max-width: 1160px)');
    expect(idx, '必须有 1160px 断点').toBeGreaterThan(-1);
    const block = DQ.slice(idx, DQ.indexOf('}', DQ.indexOf('dq-toolbar.lr-bar.freeze', idx)) + 1);
    expect(block).toContain('flex-wrap: wrap; overflow: visible; row-gap: var(--sp-1h);');
  });

  it('② 窄档把冻结行的负上边距归零（换行后才不会压住下方）', () => {
    expect(DQ).toContain('.dq-toolbar.lr-bar.freeze { margin-top: 0; }');
  });

  it('单行档保持单行；2.1.5 起 DQ 工具行回常规流（滚动交给 .dq-scroll），theme 冻结源不动', () => {
    expect(DQ).toContain('.dq-toolbar .lr-bar-l, .dq-toolbar .lr-bar-r { flex-wrap: nowrap; white-space: nowrap; }');
    expect(DQ).toContain('.dq-toolbar .lr-bar-l { flex: 1 1 auto; overflow: hidden; }');
    /* 2.1.5：DQ 的滚动交给 .dq-scroll，工具行不再 sticky/负边距贴顶——
       否则绘制盒从流位下拉 16px，滚动内容会钻到工具行底下（实报） */
    expect(DQ).toContain('.dq-toolbar.lr-bar.freeze { position: relative; top: auto; margin-top: 0; }');
    /* 冻结行本体（theme.css 单源）不许改——全站其余页级工具行共用 */
    expect(THEME).toMatch(/\.lr-bar\.freeze \{[^}]*margin: calc\(-1 \* var\(--sp-4\)\) calc\(-1 \* var\(--sp-5\)\) var\(--sp-2\);/);
  });

  it('负控：把断点写回 1100px，1124px 视口就落回被裁区间', () => {
    /* 判定逻辑直接复刻 CSS 语义：视口 <= 断点 → 换行；否则 nowrap+hidden */
    const wouldWrap = (vw: number, bp: number) => vw <= bp;
    const LEFT_NEEDS = 871;           // 工具行左段实测内容宽
    const availableAt = (vw: number) => vw - 180 - 86;  // 扣侧栏与内衬（1124 实测 leftW=858）
    /* 1124 时：断点 1100 → 不换行，可用 858 < 871 → 裁切；断点 1160 → 换行，不裁 */
    expect(wouldWrap(1124, 1100), '旧断点在 1124 不触发换行').toBe(false);
    expect(availableAt(1124) < LEFT_NEEDS, '此时内容确实放不下').toBe(true);
    expect(wouldWrap(1124, 1160), '新断点覆盖 1124').toBe(true);
    /* 1440 单行不受影响 */
    expect(wouldWrap(1440, 1160)).toBe(false);
  });
});
