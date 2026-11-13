/**
 * 三百二十九批：MappingFieldTree 字段行右键菜单（复制路径/类型/完整信息+analyzer 快验 emit）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../components/MappingFieldTree.vue'), 'utf-8');

describe('MappingFieldTree 右键（329 批）', () => {
  it('contextmenu 绑定+菜单四项+emit analyze', () => {
    expect(v).toMatch(/@contextmenu\.prevent="openRowMenu\(\$event, f\)"/);
    expect(v).toMatch(/<CellContextMenu v-if="rowMenu" :x="rowMenu\.x" :y="rowMenu\.y"/);
    for (const anchor of ["key: 'copy-path'", "key: 'copy-type'", "key: 'copy-full'", "key: 'analyze'"]) {
      expect(v, anchor).toContain(anchor);
    }
    expect(v).toMatch(/\(e: 'analyze', f: any\): void/);
  });
});
