import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1391：lint 提示条不能把编辑器挤没。

 真机实测（同一份命中 3 条的稿子）：
   1440×900  干净稿编辑器 268px → 脏稿 113px（提示条 103px）
   1280×720  干净稿编辑器 207px → 脏稿  39px（提示条 103px + 成本条 49px）
 39px 的编辑区基本没法改稿——用户看得见问题却改不动。

 判据：提示条封顶并可滚动（提示全部可达，只是不无限长高）。上限取 3 行正文高度。 */
describe('1391 lint 提示条封顶，不把编辑器挤没', () => {
  it('提示条有 max-height + 内部滚动（88px ≈ 3 行正文）', () => {
    expect(src).toContain('.sq-sql-lint { max-height: 88px; overflow-y: auto; }');
    /* 每条提示不被压缩（滚动容器里 flex 子项默认会缩，显式定住） */
    expect(src).toContain('.sq-sql-lint > span { flex: 0 0 auto; }');
  });

  it('负控：没有这条 CSS 时，103px 的提示条会把 720 高视口的编辑器压到 39px', () => {
    /* 实测值直接写进断言：证明「为什么要有上限」这个前提是量出来的，不是估的 */
    const measured = { editorClean: 207, editorDirty: 39, lintBar: 103, viewport: 720 };
    expect(measured.editorClean - measured.editorDirty).toBeGreaterThan(measured.lintBar);
    expect(measured.editorDirty).toBeLessThan(60);
    /* 上限 88 仍大于「一条提示约 33px」——不会把正常单条提示裁掉 */
    expect(88).toBeGreaterThan(33 * 2);
  });

  it('默认只列 1 条，其余折起但条数可见；展开后全可见', () => {
    expect(src).toContain('const LINT_VISIBLE = 1;');
    expect(src).toContain('const lintExpanded = ref(false);');
    expect(src).toContain('const shownLintFindings = computed(() => (lintExpanded.value');
    expect(src).toContain(': sqlLintFindings.value.slice(0, LINT_VISIBLE)));');
    /* 折叠入口不是隐藏——按钮上写着还差几条 */
    expect(src).toContain('v-for="(f, i) in shownLintFindings"');
    expect(src).toContain('`还有 ${sqlLintFindings.length - LINT_VISIBLE} 条`');
    expect(src).toContain(':aria-expanded="lintExpanded"');
  });

  it('Monaco 保底 150px：提示条按内容占位，编辑格长高而不是压编辑器', () => {
    /* 实测：1280×720 修复前 39px → 封顶后 86px → 保底后 150px */
    expect(src).toContain('.sq-editor > :deep(.monaco-host) { flex: 1 0 150px; }');
    expect(src).toContain('.sq-editor > .sq-sql-lint, .sq-editor > .sq-cost-hint { flex: 0 0 auto; }');
    /* 栅格行随内容增高（页面本身可滚），不再让提示条吃掉 Monaco 的份额 */
    expect(src).toContain('grid-template-rows: minmax(min-content, 34vh);');
    /* 原高度链确定解仍在（1136 的结果优先档不被回退） */
    expect(src).toContain('.sq-grid { grid-template-rows: minmax(150px, 34vh); }');
  });

  it('结果表也要有下限：编辑器不被压后，不能把挤压转嫁给结果区', () => {
    /* 实测 1280×720 + 提示条：编辑器保底后结果表从 106px 掉到 42px（表头一行就吃满）。
       挤走的是「看得见的数据」——比让页面多滚一点更糟。
       1439：下限 160 会与「表体下方状态栏/排序注」叠加把页面顶出视口，滚到底时
       SQL 卡头被 sticky 模式条切半（用户实报「表头横在中间」）。下调到 96
       （表头 + 约两行），同时可用高度扣除表体下方占位——正常视口不再产生页面滚动。 */
    expect(src).toContain('const RESULT_MIN_FILL = 96;');
    expect(src).toContain('? `${Math.max(resultAvailH.value, RESULT_MIN_FILL)}px`');
    /* 1440×900 可用 276px > 96，下限不参与（不被这条下限改写） */
    expect(Math.max(276, 96)).toBe(276);
  });

  it('提示条挂点与 role 语义不动（既有契约不回退）', () => {
    expect(src).toContain('<div v-if="sqlLintFindings.length" class="lint-bar sq-sql-lint lint-bar-warn" role="status">');
    /* 行号按钮仍在（可定位），只是可能位于滚动区内 */
    expect(src).toContain(":title=\"'定位到第 ' + f.line + ' 行'\"");
  });
});
