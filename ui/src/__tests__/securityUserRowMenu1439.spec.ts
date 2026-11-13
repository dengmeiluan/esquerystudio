import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const sv = readFileSync(join(__dirname, '../views/SecurityView.vue'), 'utf-8');

describe('1439b 安全中心用户表行级菜单', () => {
  it('QRT：rowActionGroup 可选通道并并入单元格菜单', () => {
    expect(qrt).toContain('rowActionGroup?: (row: any, index: number) => CcmItem | null;');
    expect(qrt).toContain('props.rowActionGroup?.(renderRows.value[m.ri], m.ri)');
    expect(qrt).toContain('...(hostRowGroup ? [{ ...hostRowGroup, sep: true }] : [])');
  });

  it('SecurityView：用户表接线，复制只读，删除走 canWriteUsers + doDelete 权限链', () => {
    expect(sv).toContain(':row-action-group="userRowAction"');
    expect(sv).toContain("label: '复制用户名'");
    expect(sv).toContain("label: '复制角色'");
    expect(sv).toMatch(/if \(canWriteUsers\.value\) \{\n\s*children\.push\(\{ key: 'user-del'/);
    expect(sv).toContain('void doDelete(username)');
    expect(sv).toContain("label: '用户操作…'");
  });
});
