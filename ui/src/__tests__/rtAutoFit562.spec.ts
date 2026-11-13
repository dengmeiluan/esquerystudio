/**
 * 五百六十二批补遗·用户产线实报④:分页 10/页 只渲染 10 行,RT 滚动视口(rt-wrap-shell
 * flex:1)强制吃满结果区,表格下方一大片空白(横滚条与「双击编辑」提示行飘在容器底沿)。
 *
 * 修法=滚动壳改「贴合内容+上限收缩」:flex:0 1 auto——数据少时壳高=内容高(状态栏/
 * 提示行/横滚条全部贴到最后一行下面),数据多时被 flex-shrink 压回可用空间、rt-wrap
 * 内部滚动不变。回顶钮(absolute 锚壳)与 thead 吸顶零触;QRT 根非 flex 布局不适用备案。
 *
 * 高度红线自证:flex:0 1 auto 的高度由内容决定,内容(行数×行高)不因壳高变化——
 * 无 rAF 正反馈回路;数据多时收缩上限=父级剩余空间(flex-shrink 语义),链路确定。
 *
 * 源码锁口径(focusSurface401 同理由):flex 形态契约落源文本最稳。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const rt = readFileSync(join(SRC, 'components/ResultTable.vue'), 'utf-8');

describe('562 实报④:RT 滚动壳贴合内容(数据少不再撑出大片空白)', () => {
  it('rt-wrap-shell 撑满结果区（1365 回合：底纹已有，空区不再是死白）', () => {
    /* 562 当年改 flex:0 1 auto 是为了消掉「数据少时下方一大片空白」；1359b 给表体加了
       行线底纹后那块空白已是网格延续（dbx/DBeaver 同款），不再是死白；而 flex-grow:0
       的代价是 .rt 里 96px 完全没被任何子元素占用（实测 383px 容器只用了 240px），
       正是用户反复说的「默认可视表格特别窄，下面还有那么多空间」。1365 回 flex:1 1 auto，
       240px 地板保留（极小窗口仍保可读行数）。 */
    expect(rt).toMatch(/\.rt-wrap-shell \{ position: relative; flex: 1 1 auto; min-height: 240px; display: flex; \}/);
  });
  it('rt-wrap 滚动视口形态零触(overflow/flex:1 在壳内仍吃满壳)', () => {
    expect(rt).toMatch(/\.rt-wrap \{ flex: 1; min-width: 0; overflow: auto;/);
  });
});
