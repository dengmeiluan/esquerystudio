/**
 * 二百九十一批：两表工具条一致性守卫——RT/QRT 钮集与顺序防分叉。
 * 同一颗钮（导出/行高/列选/列宽）+同图标+同文案；分叉即报警。
 * 八百三十五批同步更新：行高三档+列宽重置合并「视图 ⋯」聚合菜单（双内核同构）；
 * 导出入口两内核有意分工——RT=唯一入口按偏好直出，QRT=「导出 ▾」五格式菜单
 * （守卫改锁聚合层一致：视图聚合/ColPicker/布局方案/放大 双边同在）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('工具条一致性守卫（291 批，835 聚合层语义）', () => {
  it('列选/布局方案/放大 三件两边同在（RT 多快照为宿主能力差异）', () => {
    for (const anchor of ['ColPicker', 'TablePresetMenu']) {
      expect(rt, anchor).toContain(anchor);
      expect(qrt, anchor).toContain(anchor);
    }
    expect(rt).toMatch(/放大结果表/);
    expect(qrt).toMatch(/放大结果表/);
  });
  it('视图 ⋯ 聚合双内核同构（setRowH 三档直选+重置列宽），禁回退循环钮与两态密度钮', () => {
    for (const s of [rt, qrt]) {
      expect(s).toMatch(/aria-label="视图设置"/);
      expect(s).toMatch(/setRowH\('compact'\)/);
      expect(s).toMatch(/setRowH\('standard'\)/);
      expect(s).toMatch(/setRowH\('cozy'\)/);
      expect(s).toContain('重置全部列宽');
      expect(s).not.toMatch(/@click="cycleRowH"/);
      expect(s).not.toMatch(/@click="toggleDense"/);
    }
  });
  it('钮序一致：视图聚合→列选→布局方案（视图聚合 class 定位，双内核同序）', () => {
    const orders: number[][] = [];
    for (const [s, barKey] of [[rt, 'rt-bar-r'], [qrt, 'qrt-bar-r']] as const) {
      const bar = s.slice(s.indexOf(barKey));
      orders.push([bar.indexOf('aria-label="视图设置"'), bar.indexOf('label="列选"'), bar.indexOf('TablePresetMenu')]);
    }
    for (const o of orders) {
      expect(o[0], '视图聚合钮存在').toBeGreaterThan(-1);
      expect(o[1], '列选在视图聚合后').toBeGreaterThan(o[0]);
      expect(o[2], '布局方案在列选后').toBeGreaterThan(o[1]);
    }
  });
});
