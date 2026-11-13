/**
 * 键盘闭环守卫（用户实报「Ctrl+F 用退格无法删除」回归锚）：
 * ResultTable onGridKeydown 的 Delete/Backspace 分支此前无输入焦点守卫——
 * 查找框(HitNav)里的 Backspace 冒泡到表格根被 preventDefault 吃掉，
 * canOps 时还会误触「删除勾选行」确认链；↑↓/Home/End/Ctrl+C/F2 同被网格语义截胡。
 * 同族跨层串扰：th 排序/列宽柄的 Enter 不 .stop 会 (a) 冒泡进行导航打开焦点行文档
 * (b) 冒泡到 App.vue 委托层再派发一次 click=双重排序（升序瞬间翻回）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const rt = readFileSync(join(SRC, 'components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(SRC, 'components/QueryResultTable.vue'), 'utf-8');
const kernel = readFileSync(join(SRC, 'composables/useRowNav.ts'), 'utf-8');

describe('键盘闭环：输入焦点让路 + 跨层串扰隔离', () => {
  it('RT 网格键处理：编辑键/导航键在输入焦点下归还浏览器（Delete/Backspace 分支前有守卫）', () => {
    /* 六百一十二批同步更新：窗口 2000→2600——Esc 分支补输入态让路守卫（t0，searchable 接线
       后「过滤→全选→Esc 清词」动线下 Esc 冒泡 clearSel 静默清勾选的状态重置违例修复）
       函数体增长把 Delete 分支推出旧窗口，扩窗保判别力（守卫先于 Delete 分支断言原样）。
       1439c：ContextMenu 分支再次撑长函数体——改为按「下一个顶层 function」切片，
       不再用固定字符窗口，避免每次加分支都要调窗。 */
    const start = rt.indexOf('function onGridKeydown');
    const end = rt.indexOf('\nfunction ', start + 10);
    const gridFn = rt.slice(start, end > start ? end : undefined);
    const guardPos = gridFn.search(/tgt\.(tagName === 'INPUT'|tagName === 'TEXTAREA')/);
    const delPos = gridFn.indexOf("e.key === 'Delete'");
    expect(guardPos, '输入焦点守卫必须存在').toBeGreaterThan(-1);
    expect(delPos, 'Delete/Backspace 分支存在').toBeGreaterThan(-1);
    expect(guardPos, '守卫必须先于 Delete/Backspace 分支').toBeLessThan(delPos);
    expect(gridFn, '守卫覆盖 contentEditable').toContain('isContentEditable');
    expect(gridFn, '守卫覆盖 SELECT（转置档位下拉）').toContain("tagName === 'SELECT'");
  });

  it('useRowNav 内核：SELECT/contentEditable 聚焦时方向键不被行导航截胡（guard 子句保留）', () => {
    expect(kernel).toContain("tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'");
    expect(kernel).toContain('isContentEditable');
    expect(kernel, '行内编辑 guard 子句不得丢失').toContain('opts?.guard?.() === false');
  });

  it('RT/QRT 排序 th：Enter/Space .prevent.stop——不冒泡进行导航、不冒泡到 App 委托层双重排序', () => {
    expect(rt).toContain('@keydown.enter.prevent.stop="sortBy(c)"');
    expect(rt).toContain('@keydown.space.prevent.stop="sortBy(c)"');
    expect(qrt).toContain('@keydown.enter.prevent.stop="onSort(i)"');
    expect(qrt).toContain('@keydown.space.prevent.stop="onSort(i)"');
  });

  it('RT/QRT 列宽柄：←/→/Enter .prevent.stop——调宽按 Enter 不得打开焦点行文档', () => {
    expect(rt).toContain('@keydown.left.prevent.stop="nudgeColWidth(c, -32)"');
    expect(rt).toContain('@keydown.enter.prevent.stop="fitCol(c)"');
    expect(qrt).toContain('@keydown.left.prevent.stop="nudgeColWidth(c, -32)"');
    /* 五百一十九批：QRT 双击柄语义对齐 RT=自适应（原 resetColWidth，重置保留在「列宽」批量钮/菜单） */
    expect(qrt).toContain('@keydown.enter.prevent.stop="fitCol(c)"');
  });

  it('查找框 Esc 自消费语义保留（HitNav @keydown.esc.stop）', () => {
    expect(rt).toContain('@keydown.esc.stop="closeSearch"');
  });
});
