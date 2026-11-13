/**
 * 一千三百七十四批：QRT 单击自动复制退役（与 RT 统一到同一裁决）。
 *
 * 用户在 RT 侧裁决过原话：「单击就复制不对，我本来想复制值进去，那不就还要复制一次吗」
 * ——自动复制会在「复制外部值 → 双击编辑 → 粘贴」流里覆盖剪贴板（双击的 click 先于 dblclick）。
 * 当时只落到 RT；QRT 仍保留单击复制，导致两内核同一交互相反。
 *
 * 本批把 QRT 对齐到同一裁决，并锁住两件事：
 *  ① 单击不再写剪贴板（含 Ctrl+点击聚合路径不受影响）；
 *  ② 复制能力零删除——显式路径全在：右键「复制值」、Ctrl+C 行复制、
 *     行尾悬浮钮、列头「复制整列值」、行详情抽屉「复制整行 JSON」。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const RT = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');

describe('1374 QRT 单击复制退役', () => {
  it('① 单击处理里不再调用 copyCell', () => {
    const i = SRC.indexOf('function onCellClick(');
    expect(i).toBeGreaterThan(-1);
    const body = SRC.slice(i, SRC.indexOf('\n}', i));
    expect(body, '单击不得再复制').not.toContain('copyCell(');
    expect(body, '仍在的单击行为只有展开').toContain('toggleExpand(');
  });

  it('① Ctrl+点击聚合仍在（退役只针对无修饰键单击）', () => {
    const i = SRC.indexOf('function onCellClick(');
    const body = SRC.slice(i, SRC.indexOf('\n}', i));
    expect(body, 'Ctrl/Cmd+点击必须仍走聚合').toContain('toggleAggCell(ri, ci)');
    expect(body, '必须先于展开拦下').toMatch(/ctrlKey[\s\S]{0,240}toggleAggCell\(ri, ci\)[\s\S]{0,40}return;/);
  });

  it('② 复制入口零删除：五条显式路径都在', () => {
    expect(SRC, '右键「复制值」').toContain("{ key: 'copy-val', label: '复制值'");
    expect(SRC, 'Ctrl+C 行复制提示').toMatch(/Ctrl\+C 复制行 JSON/);
    expect(SRC, '行尾悬浮钮').toContain("class=\"qrt-row-copy\"");
    expect(SRC, '列头「复制整列值」').toContain("{ key: 'copy-col-vals', label: '复制整列值'");
    expect(SRC, '抽屉「复制整行 JSON」').toContain('复制整行 JSON');
  });

  it('两内核裁决一致（RT 也是单击不复制）', () => {
    const rtBody = RT.slice(RT.indexOf('function onCellClick('));
    expect(rtBody.slice(0, rtBody.indexOf('\n}')), 'RT 单击同样不复制').not.toContain('copyCell(');
  });

  it('负控：把 copyCell 塞回单击 → ① 必须红', () => {
    const broken = SRC.replace(
      '  if (cellText(cell).length > MAX_CELL || isExpanded(ri, ci)) toggleExpand(ri, ci);',
      '  if (cellText(cell).length > MAX_CELL || isExpanded(ri, ci)) { toggleExpand(ri, ci); return; }\n  void copyCell(cell);',
    );
    expect(broken, '负控必须真的改掉').not.toBe(SRC);
    const i = broken.indexOf('function onCellClick(');
    expect(broken.slice(i, broken.indexOf('\n}', i)), '塞回后必须判不合格').toContain('copyCell(');
  });
});
