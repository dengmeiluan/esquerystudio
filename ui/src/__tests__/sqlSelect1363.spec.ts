/**
 * 一千三百六十三批（1400 修订）：SQL 结果表多选通道。
 *
 * 1363 当时在 SQL 宿主工具行加了「复制选中 N」按钮——但 QRT（SQL/Lucene 共用）与 RT 的
 * 动作面一个在工具行、一个在表下，用户看到的仍是「三个表格三套交互」。1400 把动作面
 * **收进 QRT 内核底部状态栏**（复制 TSV/JSON/清除），SQL 宿主只留 `selectable` 开关。
 *
 * 本 spec 现在锁：
 *  ① 宿主传 selectable（勾选列/全选/选中计数由内核出）；
 *  ② 宿主不得再维护第二套复制实现（旧 sq-copy-sel 按钮/菜单项必须消失，否则两个入口）；
 *  ③ 内核动作条存在且条件渲染（无选中零占位）——行为断言在 qrSelBar1400.spec.ts；
 *  ④ 负控：去掉 selectable → ① 必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('1363/1400 SQL 结果表多选通道（内核动作面单源）', () => {
  it('① 宿主传 selectable', () => {
    expect(SQL, '必须开启多选').toMatch(/^\s+selectable$/m);
  });

  it('② 宿主不维护第二套复制实现', () => {
    expect(SQL, '旧按钮必须退役').not.toContain('data-test="sq-copy-sel"');
    expect(SQL, '旧菜单项必须退役').not.toContain('data-test="sq-copy-sel-menu"');
    expect(SQL, '旧宿主复制函数必须退役').not.toContain('function copySelectedRows');
  });

  it('③ 内核状态栏动作条存在且由选中数门控', () => {
    expect(QRT).toContain('data-test="qrt-copy-sel-tsv"');
    expect(QRT).toContain('data-test="qrt-copy-sel-json"');
    expect(QRT).toMatch(/v-if="selectable && selSet\.size"/);
    /* 复制内容走共享矩阵内核：TSV 口径含列名表头 */
    expect(QRT).toMatch(/matrixText\(\{[\s\S]{0,160}?cols: shownCols\.value/);
  });

  it('④ 负控：去掉 selectable → ① 必须红', () => {
    const broken = SQL.replace(/^\s+selectable$/m, '');
    expect(broken, '负控必须真的改掉').not.toBe(SQL);
    expect(broken, '去掉后必须判不合格').not.toMatch(/^\s+selectable$/m);
  });
});
