/* 1443：Naive UI Select 的键盘焦点可见性（内层 label 接焦，外框补环）。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, '../theme.css'), 'utf-8');

describe('1443 Naive Select / Monaco 焦点环', () => {
  it('焦点在内层 label 时，外框按 :focus-visible 显示边框与 focus-ring', () => {
    expect(css).toContain('.n-base-selection:has(.n-base-selection-label:focus-visible)');
    expect(css).toMatch(/\.n-base-selection:has\(\.n-base-selection-label:focus-visible\) \{\s*border-color: var\(--ac-line\); box-shadow: var\(--focus-ring\);/);
  });

  it('Monaco 键盘焦点给编辑器外框可见环', () => {
    expect(css).toContain('.monaco-editor:has(textarea.inputarea:focus-visible)');
    expect(css).toMatch(/\.monaco-editor:has\(textarea\.inputarea:focus-visible\) \{\s*outline: 2px solid var\(--ac\); outline-offset: 2px;/);
  });
});
