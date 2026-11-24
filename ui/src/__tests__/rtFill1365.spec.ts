/**
 * 一千三百六十五批：DSL/索引工作台结果表的三个实测缺陷（1440 宽真机取证）。
 *
 * ① 操作列无宽度约束 → 吃走 500px，里面按钮只占 120px，380px 空转；
 *    数据列 title/status 被压到 287px。这正是用户说的「表格被挤窄」。
 *    修法：`.rt-act{width:1px}`（table-layout:auto 下按 max-content 分配），
 *    实测 → 操作列 110px，数据列 482px。
 *
 * ② 悬浮复制钮 `left:calc(100% + 3px)` 绝对定位到单元格**之外**（实测 1408 vs 格右 1405），
 *    常驻 33px 隐藏横向溢出，且与「更多 ⋯」钮重叠（1372–1402 vs 1365–1395）；
 *    它和菜单里的「复制行 JSON」是同一动作，违反「同一动作不重复」。→ RT 退役该钮。
 *
 * ③ 状态栏是 `margin-top:8px` 的**独立圆角卡**，与表体之间一道缝、下面再一截空白，
 *    用户圈着这一整行问「怎么变成双重表格」。→ 并成表卡页脚（margin-top:-1px 压掉双线，
 *    只留底部圆角），并把 `.rt-wrap-shell` 回到 `flex:1 1 auto` 吃掉 .rt 的剩余高度
 *    （此前 383px 容器里只有 240px 被子元素占用，96px 完全空着）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RT = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');

function ruleBody(sel: string): string {
  const i = RT.indexOf(sel + ' {');
  expect(i, `必须有 ${sel} 规则`).toBeGreaterThan(-1);
  return RT.slice(i, RT.indexOf('}', i));
}

describe('1365 结果表：操作列不吃白食 / 状态栏是页脚 / 表区撑满', () => {
  it('① 操作列按内容宽分配（width:1px），多余宽度回流给数据列', () => {
    const body = ruleBody('.rt-act');
    expect(body, '操作列必须锁 max-content 分配').toContain('width: 1px');
    expect(body, '不许再把 nowrap 丢掉（横排是 1250 行高的前提）').toContain('white-space: nowrap');
  });

  it('① 负控：去掉 width:1px → 判据必须红', () => {
    const broken = RT.replace('.rt-act { width: 1px; white-space: nowrap;', '.rt-act { white-space: nowrap;');
    expect(broken, '负控必须真的改掉规则').not.toBe(RT);
    const i = broken.indexOf('.rt-act {');
    expect(broken.slice(i, broken.indexOf('}', i)), '无宽度约束必须判不合格').not.toContain('width: 1px');
  });

  it('② RT 不再有行内悬浮复制钮（与菜单项重复，且 absolute 到格外压住「更多⋯」）', () => {
    expect(RT, '模板里不许再有 rt-row-copy 钮').not.toContain('class="btn sm ghost rt-row-copy"');
    expect(RT, '样式里不许再有 .rt-row-copy').not.toMatch(/\.rt-row-copy \{/);
    /* 入口不能一起消失：菜单里必须仍在 */
    expect(RT, '复制行 JSON 必须在行菜单里').toContain("{ key: 'act-copy', label: '复制行 JSON'");
  });

  it('③ 状态栏是表卡页脚：与表体共边（border-top:0 消双线）+ 只留底部圆角', () => {
    const body = ruleBody('.rt-status');
    expect(body, '必须消掉与表体之间的双线').toContain('border-top: 0');
    expect(body, '不许再有独立卡的间隙').toContain('margin-top: 0');
    expect(body, '必须是卡尾圆角（不是四角独立的卡）').toContain('border-radius: 0 0 var(--r-m) var(--r-m)');
  });

  it('③ 负控：状态栏回退成独立卡（margin-top 档位间距 + 四角圆角）→ 判据必须红', () => {
    const broken = RT.replace('margin-top: 0;\n  background: var(--bg1); border: 1px solid var(--line); border-top: 0; border-radius: 0 0 var(--r-m) var(--r-m);',
      'margin-top: var(--sp-2);\n  background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r-m);');
    expect(broken, '负控必须真的改掉规则').not.toBe(RT);
    const i = broken.indexOf('.rt-status {');
    const body = broken.slice(i, broken.indexOf('}', i));
    expect(body, '独立卡形态必须判不合格').not.toContain('margin-top: 0');
  });

  it('③ 表体自身不再做圆底（圆角交给页脚那张卡）', () => {
    const body = ruleBody('.rt-wrap');
    expect(body, 'table 壳不许再抢底部圆角').toContain('border-radius: 0;');
  });

  it('③ 表区撑满结果区（.rt 里不再留无子元素占用的空洞）', () => {
    expect(ruleBody('.rt-wrap-shell')).toMatch(/flex:\s*1 1 auto/);
  });

  it('③ 撑满不等于撑破：表区仍是可收缩的滚动容器（页面不高时由 .rt-wrap 内滚，不把页脚推出视口）', () => {
    const shell = ruleBody('.rt-wrap-shell');
    /* flex-shrink 必须为 1（`1 0 auto` 会在矮视口把状态栏顶出屏幕） */
    expect(shell, 'shell 必须可收缩').toMatch(/flex:\s*1 1 auto/);
    const wrap = ruleBody('.rt-wrap');
    expect(wrap, '表体必须是滚动区，溢出在表内消化').toContain('overflow: auto');
    expect(wrap, '必须允许收缩到内容以下').toContain('min-width: 0');
    /* 负控：把 shell 改成不可收缩 → 判据必须红 */
    const broken = RT.replace('flex: 1 1 auto; min-height: 240px; display: flex; }', 'flex: 1 0 auto; min-height: 240px; display: flex; }');
    expect(broken, '负控必须真的改掉规则').not.toBe(RT);
  });
});
