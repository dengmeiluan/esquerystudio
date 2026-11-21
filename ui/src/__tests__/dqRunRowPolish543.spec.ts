/**
 * 五百四十三批：执行行视觉规格统一+高度可调（用户产线四点反馈）。
 * ① 执行排图标尺寸不一致（13/12/11 混杂）→ 统一一档；
 * ② 无语义高亮区分档次 → 开关类勾选态语义高亮（ac-soft 底+ac 字），执行 primary/取消 danger 保持；
 * ③ 没有对齐 → 执行行控件统一 26px 控制盒高+center 对齐；
 * ④ 表格高度/条件树+DSL 容器高度无法调节 → 双栏区与结果区之间加横向拖拽柄
 *    （SplitHandle axis=horizontal，dq.mainH 偏好落盘，缺省 0=原 34vh 档零增量）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('执行行视觉规格统一（543 批）', () => {
  it('执行行图标统一 size=13（Play/取消 X/Filter 等无 11/12 杂档）', () => {
    const rowAt = dq.indexOf('<div class="dq-run-row">');
    const rowEnd = dq.indexOf('dq-params-standalone');
    const rowSlice = dq.slice(rowAt, rowEnd > 0 ? rowEnd : rowAt + 6000);
    /* 执行行内不允许 11/12 的图标尺寸（全部 13 一档） */
    expect(rowSlice, '执行行内图标统一 13').not.toMatch(/:size="1[12]"/);
    expect(rowSlice).toMatch(/:size="13"/);
  });
  it('开关类勾选态语义高亮：dq-sw 带 on 态类+样式分档', () => {
    expect(dq).toMatch(/:class="\{ on: profileOn \}"/);
    expect(dq).toMatch(/\.dq-sw\.on \{/);
    expect(dq).toMatch(/\.dq-sw\.on \{[^}]*var\(--ac-soft\)/);
  });
  it('执行行控制盒高统一 26px（btn/sw/eh/ar/inp 同高对齐）', () => {
    expect(dq).toMatch(/\.dq-run-row \{[^}]*--ctl-h: 26px/);
    expect(dq).toMatch(/\.dq-run-row \.dq-sw \{[^}]*height: var\(--ctl-h\)/);
    expect(dq).toMatch(/\.dq-run-row \.dq-eh-btn \{[^}]*height: var\(--ctl-h\)/);
  });
});

describe('高度可调（543 批）', () => {
  it('双栏区与结果区之间有横向拖拽柄（SplitHandle axis=horizontal）', () => {
    const mainAt = dq.indexOf('<div class="dq-main"');
    const resultAt = dq.indexOf('class="dq-result"');
    const handleAt = dq.indexOf('class="dq-height-handle"');
    expect(mainAt).toBeGreaterThan(-1);
    expect(resultAt).toBeGreaterThan(mainAt);
    expect(handleAt).toBeGreaterThan(mainAt);
    expect(handleAt).toBeLessThan(resultAt);
    expect(dq).toMatch(/class="dq-height-handle"[\s\S]*axis="horizontal"/);
  });
  it('拖拽尺寸偏好落盘（dq.mainH usePref），缺省 0=原档零增量', () => {
    expect(dq).toMatch(/usePref<number>\('dq\.mainH', 0\)/);
    expect(dq).toMatch(/:style="dqMainStyle"/);
    expect(dq).toMatch(/function onMainResize/);
  });
});
