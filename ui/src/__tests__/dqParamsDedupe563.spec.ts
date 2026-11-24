/**
 * 五百六十三批·用户产线实报⑤「无效控制」+原生 select 设计割裂(截图三连)。
 *
 * ⑤a 检索参数面板「分页」节(size/from 输入框)是无效控制——执行链里 from 恒被
 *    (page-1)*pageSize 覆盖、size 恒被分页档接管(562 联动后更是彻底变成分页器的
 *    重复入口),两个输入框作为「ES 检索参数」的意义为零。修=分页节整体退役
 *    (RootExtrasPane 胶囊+表单),分页唯一入口=表格工具行分页器;paramsSummary 的
 *    from 段同退役(恒为假信息),size 段保留(档外值真实生效,如 500)。
 * ⑤b Pagination 的原生 <select> 下拉(系统蓝菜单)与全站设计语言割裂——换 n-popover
 *    自定义 listbox(既有胶囊语言:选中标记/aria/键盘可达),原生 option 退役。
 *
 * 源码锁口径(focusSurface401 同理由):组件模板形态契约落源文本最稳。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');

const pgn = read('components/Pagination.vue');
const rx = read('components/builder/RootExtrasPane.vue');
const dq = read('views/DslQueryView.vue');

describe('563 实报⑤a:检索参数「分页」无效控制退役', () => {
  it('RootExtrasPane 分页胶囊与 size/from 表单退役', () => {
    expect(rx, '「分页」胶囊退役').not.toContain('>分页</span>');
    expect(rx, 'size 输入框退役').not.toContain('class="inp rx-num rx-size');
    expect(rx, 'from 输入框退役').not.toContain('class="inp rx-num rx-from');
    expect(rx, 'onSize/onFrom 控制链退役').not.toContain('onSize');
    expect(rx, 'numPatch size/from 退役').not.toMatch(/numPatch\('(size|from)'/);
  });
  it('paramsSummary:from 段退役(恒被页码覆盖的假信息);size 段保留(档外值真实生效)', () => {
    expect(dq).not.toContain("parts.push('from=' + obj.from)");
    expect(dq).toContain("parts.push('size=' + obj.size)");
  });
});

describe('563 实报⑤b:Pagination 每页条数换自定义 listbox', () => {
  it('原生 select/option 退役', () => {
    expect(pgn, 'select 标签退役（注释字面不计）').not.toMatch(/<select v-if|<select class/);
    expect(pgn).not.toContain('</option>');
  });
  it('n-popover 受控 listbox:aria-haspopup/expanded+选中标记+键盘 Esc', () => {
    expect(pgn).toMatch(/<n-popover v-if="pageSize != null" trigger="click" placement="top-start" :show-arrow="false" raw/);
    expect(pgn).toMatch(/aria-haspopup="listbox"/);
    expect(pgn).toMatch(/:aria-expanded="sizeOpen"/);
    expect(pgn).toMatch(/role="option" :aria-selected="s === pageSize"/);
    expect(pgn).toMatch(/function pickSize\(s: number\)/);
  });
  it('浮层壳完整(用户实报「平铺开了」:raw 模式+白底/边框/阴影/圆角/内边距,非透明叠字)', () => {
    expect(pgn).toMatch(/\.pgn-psize-pop \{[^}]*background: var\(--bg1\);/);
    expect(pgn).toMatch(/\.pgn-psize-pop \{[^}]*border: 1px solid var\(--line-strong\);/);
    expect(pgn).toMatch(/\.pgn-psize-pop \{[^}]*box-shadow:/);
    expect(pgn).toMatch(/\.pgn-psize-opt \{[^}]*border-radius: var\(--r-s\);/);
  });
  it('五刀·radio 单选按钮下拉(用户再澄清「我要的是单选按钮,弹窗下拉选择」:弹窗内每项前置 radio 圆钮,选中实心青点)', () => {
    expect(pgn).toMatch(/<span class="pgn-radio" :class="\{ on: s === pageSize \}"><\/span>/);
    expect(pgn).toMatch(/\.pgn-radio \{ width: 13px; height: 13px; border-radius: 50%; border: 1\.5px solid var\(--tx2\);/);
    expect(pgn).toMatch(/\.pgn-psize-opt\.on \{ color: var\(--ac\); background: var\(--ac-soft\); font-weight: 600; \}/);
  });
  it('既有 a11y 锚零触(上一页/跳页 aria+←/→ 翻页)', () => {
    expect(pgn).toMatch(/aria-label="上一页"/);
    expect(pgn).toMatch(/:aria-label="'跳转到页（1-' \+ totalPages/);
    expect(pgn).toMatch(/@keydown\.left="onArrow\(\$event, page - 1\)"/);
  });
});
