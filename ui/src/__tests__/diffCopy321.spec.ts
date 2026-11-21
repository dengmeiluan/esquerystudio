/**
 * 三百二十一批：DiffEditor 原始栏复制+patch 请求体复制（诚实口径，与编辑后栏对齐）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/DiffEditorView.vue'), 'utf-8');

describe('DiffEditor 复制补齐（321 批）', () => {
  it('原始栏钮+patch 钮+两函数', () => {
    expect(v).toMatch(/aria-label="复制原始 JSON"/);
    expect(v).toMatch(/aria-label="复制请求体"/);
    expect(v).toMatch(/async function copyOriginal\(\)/);
    expect(v).toMatch(/function copyPatch\(\)/);
    expect(v).toMatch(/copyText\(patchPreview\.value\)/);
  });
});
