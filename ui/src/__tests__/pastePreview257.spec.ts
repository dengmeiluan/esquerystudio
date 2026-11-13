/**
 * 二百五十七批：粘贴导入实时校准预览。
 * 边贴边回显识别形态（notes/键数/字段数/错误），不必点「解析并填入」才知道认成了什么。
 * 锁定 pastePreviewLines 三态（完整/剥壳/错误）与 AdhocRebuildView 内联接线（源码锁）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEsConfigPaste, pastePreviewLines } from '../utils/esConfigPaste';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('pastePreviewLines（257 批）', () => {
  it('完整配置：settings 键数+mapping 字段数两行回显', () => {
    const r = parseEsConfigPaste('{"settings":{"index":{"number_of_shards":3}},"mappings":{"properties":{"a":{"type":"keyword"},"b":{"type":"text"}}}}');
    expect(r.ok).toBe(true);
    const lines = pastePreviewLines(r);
    expect(lines.some(l => l.includes('settings') && l.includes('1 个顶级键'))).toBe(true);
    expect(lines.some(l => l.includes('mapping') && l.includes('2 个顶层字段'))).toBe(true);
  });

  it('剥壳形态：notes 说明外壳在先', () => {
    const r = parseEsConfigPaste('{"idx-a":{"mappings":{"properties":{"c":{"type":"long"}}}}}');
    expect(r.ok).toBe(true);
    const lines = pastePreviewLines(r);
    expect(lines[0]).toContain('idx-a');
    expect(lines.some(l => l.includes('1 个顶层字段'))).toBe(true);
  });

  it('字段级回显（288 批）：预览列出前 5 个字段名，超 5 个省略计数', () => {
    const r = parseEsConfigPaste('{"mappings":{"properties":{"a":{"type":"keyword"},"b":{"type":"text"},"c":{"type":"long"},"d":{"type":"date"},"e":{"type":"boolean"},"f":{"type":"keyword"}}}}');
    const lines = pastePreviewLines(r);
    expect(lines.some(l => l.includes('字段：a、b、c、d、e 等 6 个'))).toBe(true);
    const r2 = parseEsConfigPaste('{"mappings":{"properties":{"x":{"type":"keyword"}}}}');
    expect(pastePreviewLines(r2).some(l => l.includes('字段：x'))).toBe(true);
  });

  it('错误：单行错误可直接渲染', () => {
    const lines = pastePreviewLines(parseEsConfigPaste('not json'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('JSON 解析失败');
  });

  it('AdhocRebuildView 源码锁：输入即解析+预览条渲染', () => {
    const v = read('../views/AdhocRebuildView.vue');
    expect(v).toMatch(/const pastePreview = computed<ParsedEsConfig \| null>/);
    expect(v).toMatch(/v-if="pasteImportText\.trim\(\) && pastePreview"/);
    expect(v).toContain('pastePreviewLines(pastePreview)');
  });
});
