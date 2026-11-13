/**
 * 二百三十批 P0-3：tableRegistry 注册表（跳转到列的候选源与定向通道）。
 * 锁定：注册返回递增 id；unregister 注销；visibleTables 只回可见实例（offsetParent 判据）；
 * 实例 locate 直调（788 刀A：locateInTable 过渡函数退役——现役消费=CmdPalette t.entry.locate 直连）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { clearTablesForTest, registerTable, unregisterTable, visibleTables } from '../utils/tableRegistry';

describe('tableRegistry（230 批 P0-3）', () => {
  beforeEach(() => clearTablesForTest());

  it('注册/注销/id 递增；visibleTables 按 visible() 过滤', () => {
    const id1 = registerTable({ cols: () => ['a'], locate: () => {}, visible: () => true });
    const id2 = registerTable({ cols: () => ['b'], locate: () => {}, visible: () => false });
    expect(id2).toBe(id1 + 1);
    expect(visibleTables().map(t => t.id)).toEqual([id1]);
    unregisterTable(id1);
    expect(visibleTables()).toEqual([]);
  });

  it('entry.locate 直调定向（现役消费形态）', () => {
    const got: string[] = [];
    registerTable({ cols: () => ['x'], locate: (c) => got.push(c), visible: () => true });
    visibleTables()[0].entry.locate('x');
    expect(got).toEqual(['x']);
  });
});
