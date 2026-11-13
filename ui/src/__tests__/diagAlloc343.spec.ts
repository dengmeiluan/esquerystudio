/**
 * 三百四十三批：DiagView allocation explain 复制 Markdown+死代码清理。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/DiagView.vue'), 'utf-8');

describe('DiagView allocation 复制（343 批）', () => {
  it('复制钮+copyAllocMd+死代码清理', () => {
    expect(v).toContain('copyAllocMd');
    expect(v).toMatch(/function copyAllocMd\(\)/);
    expect(v).toContain('allocate_explanation');
    expect(v).not.toContain("import SkeletonBox from '../components/SkeletonBox.vue';");
  });
});
