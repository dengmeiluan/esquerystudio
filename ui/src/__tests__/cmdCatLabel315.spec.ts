/**
 * 三百一十五批：CmdPalette 批次号组名（R26-R33）→ 用户可读语义组（展示层归一，
 * cat 原值保留参与搜索——搜「R28」仍可命中）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../components/CmdPalette.vue'), 'utf-8');

describe('CmdPalette 语义组（315 批）', () => {
  it('CAT_LABEL 映射齐八组+渲染层归一', () => {
    for (const g of ['体检与向导', '运维与收藏', '数据工具', '开发与调优', '监控告警', '索引治理', '查询增强', '治理与审计']) {
      expect(v, g).toContain(`'${g}'`);
    }
    expect(v).toMatch(/function catOf\(cat: string\): string/);
    expect((v.match(/catOf\(x?\.?c?\.?cat\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
