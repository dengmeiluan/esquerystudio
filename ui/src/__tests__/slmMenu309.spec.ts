/**
 * 三百零九批：SlmView 策略卡右键菜单（复制 ID/复制配置/立即执行）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/SlmView.vue'), 'utf-8');

describe('Slm 策略卡右键（309 批）', () => {
  it('contextmenu 绑定+菜单项齐+动作同源', () => {
    expect(v).toMatch(/@contextmenu\.prevent="openRowMenu\(\$event, p\)"/);
    expect(v).toMatch(/<CellContextMenu v-if="rowMenu" :x="rowMenu\.x" :y="rowMenu\.y"/);
    for (const anchor of ["key: 'copy-id'", "key: 'copy-body'", "key: 'exec'"]) {
      expect(v, anchor).toContain(anchor);
    }
    expect(v).toMatch(/copyBody\(rm\.p\)/);
    expect(v).toMatch(/void execNow\(rm\.p\.id\)/);
  });
});
