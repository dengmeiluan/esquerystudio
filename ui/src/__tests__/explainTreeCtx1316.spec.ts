/**
 * 一千三百一十六批：打分树行右键 + 沙盒解释树换共享件。
 *
 * 两件事同一处根因——「同一个 _explanation，三个页面两套皮」：
 * ① 共享 ExplainTree（排名侦探 / 打分解剖）是纯展示：看到一个可疑因子
 *    （norm 拖后腿 / idf 过低）只能靠眼睛记，想贴工单得手工框选整段 description。
 * ② SearchSandbox 自造了一棵 render 函数版解释树（.ss-ex-*）：只有「分值 + 描述」两列，
 *    没有贡献占比条、没有因子分档、没有右键 —— 与共享件不是同一份能力。
 *
 * 本 spec 锁：
 *  - 共享件行挂 @contextmenu.prevent.stop（.stop 必须有：整棵树递归实例化，
 *    不 stop 会一路冒泡到外层实例，一次右键弹出 N 个菜单）
 *  - 一级 ≤3（2 高频 + 1 分组父项），group parent 带 children
 *  - 复制到的数与看到的数**同源**：行文本用 fmtVal / pct，不是另写一套 toFixed
 *  - 沙盒不再自造解释树：无 .ss-ex-* 节点/样式，且确实 import 共享件
 * 负控：一级铺平成 4+ 项必须红；沙盒残留 ss-ex-node 渲染必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rd = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const tree = rd('../components/ExplainTree.vue');
const sandbox = rd('../views/SearchSandboxView.vue');

/** 取 openCtx 里的一级 items 数组文本（到 children 之前即可用于计数） */
function ctxBlock(): string {
  const i = tree.indexOf('function openCtx');
  expect(i, 'openCtx 必须存在').toBeGreaterThan(-1);
  const rest = tree.slice(i);
  const end = rest.indexOf('\n}');
  return end < 0 ? rest : rest.slice(0, end);
}

describe('1316 ① 共享 ExplainTree 行右键', () => {
  it('行挂右键，且 .stop 吃掉冒泡（递归实例不得一次弹 N 个菜单）', () => {
    expect(tree, 'xt-row 必须挂右键').toMatch(/class="xt-row"[^>]*@contextmenu\.prevent\.stop="openCtx\(\$event\)"/s);
    expect(tree, '必须挂 CellContextMenu').toContain('<CellContextMenu');
    expect(tree, '必须声明 ctx').toContain('const ctx = ref<');
  });

  it('一级 ≤3 项，且含分组父项（复制项不铺平到一级）', () => {
    const blk = ctxBlock();
    const topLevel = (blk.match(/^\s{6}\{ key:/gm) || []).length;
    expect(topLevel, '一级项应 ≤3').toBeLessThanOrEqual(3);
    expect(blk, '必须有二级分组').toMatch(/children:\s*\[/);
    /* 二级项数 ≥3：分值 / 占比 / 子树 JSON 三项能力不得丢 */
    const children = blk.slice(blk.indexOf('children:'));
    expect((children.match(/\{ key:/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('复制口径与行内显示同源（fmtVal + pct，不另造 toFixed 格式化）', () => {
    /* 负控思路：如果谁把行文本改写成 Number(...).toFixed(2) 之类的第二套格式，
       「看到的 0.42 / 复制到的 0.42」就会漂 —— 这里锁住两个函数在 rowLine 里被用 */
    const i = tree.indexOf('function rowLine');
    expect(i, 'rowLine 必须存在').toBeGreaterThan(-1);
    const blk = tree.slice(i, tree.indexOf('\n}', i));
    expect(blk, '行文本必须用 fmtVal').toContain('fmtVal(');
    expect(blk, '行文本必须用 pct').toContain('pct.value.toFixed(1)');
    expect(blk, '行文本不得另造 Number(...).toFixed 数值格式').not.toMatch(/Number\([^)]*\)\.toFixed\(2\)/);
  });

  it('复制回执就近闪现（不依赖宿主 store——沙盒里可能挂在 pane 深处）', () => {
    expect(tree, '必须有就近回执节点').toContain('class="xt-flash"');
    expect(tree, '回执 z 走注册档').toMatch(/\.xt-flash \{[^}]*z-index: calc\(var\(--z-ctx\) \+ 3\)/s);
    expect(tree, '不得为了回执引入全局 store').not.toContain('useAppStore');
  });
});

describe('1316 ② 沙盒解释树换共享件（不造轮子）', () => {
  it('沙盒确实 import 并渲染共享 ExplainTree，且传 total/depth', () => {
    expect(sandbox, '必须 import 共享件').toMatch(/import ExplainTree from '\.\.\/components\/ExplainTree\.vue'/);
    expect(sandbox, '模板必须用 <ExplainTree').toContain('<ExplainTree');
    expect(sandbox, '必须传 total（占比条需要根分值）').toMatch(/<ExplainTree[^>]*:total=/s);
  });

  it('自造树彻底退役：无 .ss-ex-* 渲染与样式，无 defineComponent 内联树', () => {
    expect(sandbox, '不得残留 ss-ex-node 渲染').not.toContain('ss-ex-node');
    expect(sandbox, '不得残留 ss-ex-head 样式').not.toContain('ss-ex-head');
    expect(sandbox, '不得再派生 defineComponent 内联树').not.toContain('const ExplainTree: any = defineComponent');
  });
});
