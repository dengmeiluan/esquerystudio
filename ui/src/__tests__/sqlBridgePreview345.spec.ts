/**
 * 三百四十五批：SqlBridge 试跑结果落内存（前 20 行预览+TSV 全量复制）——
 * 此前只报「X 行 × Y 列」即弃。
 * 五百二十四批 W1 同步更新：预览文本行升级为真表格（es_tbl_sem 语义显示层），单一 TSV 复制
 * 合并升级为 matrixText 三格式 copyPreviewMatrix（TSV/MD/JSON）——旧 copyPreview 断言同步更新改名。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/SqlBridgeView.vue'), 'utf-8');

describe('SqlBridge 试跑预览（345 批）', () => {
  it('预览块+lastRows/lastCols 保留+TSV 复制', () => {
    expect(v).toMatch(/class="br-preview"/);
    expect(v).toMatch(/const lastRows = ref<any\[\]\[\]>\(\[\]\);/);
    expect(v).toMatch(/const lastCols = ref<string\[\]>\(\[\]\);/);
    expect(v).toMatch(/lastRows\.value = rows;/);
    /* 五百二十四批 W1 同步更新：copyPreview → copyPreviewMatrix（三格式合并，无旧函数残留） */
    expect(v).toMatch(/function copyPreviewMatrix\(/);
    expect(v).not.toMatch(/function copyPreview\(/);
    expect(v).toContain('复制全部（TSV）');
  });
});
