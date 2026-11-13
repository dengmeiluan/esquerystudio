/**
 * PIT 重置时聚焦态归位——重置清空 buffer/preview 后若仍在全屏
 * 聚焦，用户面对空表只能找还原钮；reset 同步退出聚焦，回到常规工作流。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/PitScrollView.vue'), 'utf-8');

describe('PIT 重置聚焦归位（）', () => {
  it('reset 首行退出聚焦', () => {
    const body = v.slice(v.indexOf('function reset() {'), v.indexOf('function reset() {') + 220);
    expect(body).toMatch(/function reset\(\) \{\s*\/\* 重置时退出预览表聚焦——避免全屏空表困住用户 \*\/\s*focusPaneId\.value = null;/);
  });
});
