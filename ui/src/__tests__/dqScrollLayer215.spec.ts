/**
 * 2.1.5：DSL 工作台滚层重构——工具行移出滚动区。
 *
 * 实报（真机截图 1667×684，工作台滚动 45px 后）：条件树「过滤条件」输入框
 * 与 Monaco 第 1~3 行钻到冻结的查询工具行底下，被工具行实底盖住一半。
 * 根因：.dq 整层当滚动容器、工具行 sticky 贴顶——sticky 只保证工具行可见，
 * 不保证其下内容不被覆盖。
 *
 * 修法：.dq 定高 overflow:hidden；工具行留外层；新增 .dq-scroll 承担滚动。
 * 不变式（真浏览器量测）：工具行底 ≤ .dq-scroll 顶（gap 10px），滚动内容
 * 在 .dq-scroll 内被裁剪，永远画不到工具行下面。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('2.1.5 DSL 工作台滚层（源码锁）', () => {
  it('.dq 只定高不滚；.dq-scroll 承接 flex 列布局与纵向滚动', () => {
    expect(dq).toMatch(/\.dq\.dq-fill \{ height: 100%; overflow: hidden; \}/);
    expect(dq).toMatch(/\.dq-scroll \{ flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; \}/);
    /* 负控：旧的「dq 自己滚」规则必须退役，否则内容仍会滑到工具行底下 */
    expect(dq).not.toMatch(/\.dq\.dq-fill \{ height: 100%; overflow-y: auto; \}/);
  });

  it('工具行回到常规流（sticky/负上边距归零），主题冻结源仍服务其余页面', () => {
    expect(dq).toContain('.dq-toolbar.lr-bar.freeze { position: relative; top: auto; margin-top: 0; }');
    expect(dq).toMatch(/<div class="dq-toolbar lr-bar freeze">/);
  });

  it('模板顺序：工具行 → .dq-scroll → dq-main；包裹层只出现一次且正确闭合', () => {
    const toolbarAt = dq.indexOf('<div class="dq-toolbar lr-bar freeze">');
    const scrollAt = dq.indexOf('<div class="dq-scroll">');
    const mainAt = dq.indexOf('<div class="dq-main"');
    expect(toolbarAt, '工具行在场').toBeGreaterThan(-1);
    expect(scrollAt, '滚层在场').toBeGreaterThan(toolbarAt);
    expect(mainAt, 'dq-main 在滚层内').toBeGreaterThan(scrollAt);
    expect(dq.match(/<div class="dq-scroll">/g)?.length, '滚层开标签唯一').toBe(1);
    expect(dq.match(/<\/div><!-- \/dq-scroll -->/g)?.length, '滚层闭标签唯一').toBe(1);
  });
});
