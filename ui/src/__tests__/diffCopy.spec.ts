/**
 * R130 第一百一十批：DiffEditor 编辑稿一键复制（便捷轴）——对比/修改后常有
 * 贴工单/报障/带走评审诉求，此前只能全选手拷。锁定按钮接线与 copyEdited 函数。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/DiffEditorView.vue'), 'utf-8');

describe('DiffEditor 编辑稿复制（一百一十批）', () => {
  it('按钮接线（编辑后卡片头）与 copyEdited 函数', () => {
    expect(src).toMatch(/aria-label="复制编辑后 JSON"[^>]*@click="copyEdited"/);
    expect(src).toMatch(/async function copyEdited\(\)/);
    expect(src).toMatch(/copyText\(editedText\.value \|\| ''\)/);
  });

  it('依赖 import 在场（Copy 图标 + copyText）', () => {
    expect(src).toMatch(/import \{[^}]*\bCopy\b[^}]*\} from 'lucide-vue-next'/);
    expect(src).toMatch(/import \{ copyText \} from '\.\.\/utils\/format'/);
  });
});
