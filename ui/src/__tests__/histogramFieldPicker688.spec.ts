/**
 * 688：直方图手动选字段 / 诊断接线 source-lock。
 * 自动识别不到字段时，节头必须给出「为什么？」诊断与「直方图字段」选择，而不是死路。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const comp = readFileSync(join(__dirname, '../components/HistogramSection.vue'), 'utf-8');
const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
const use = readFileSync(join(__dirname, '../composables/useHistAgg.ts'), 'utf-8');

describe('HistogramSection 字段选择与诊断（688）', () => {
  it('候选选择框与「为什么？」诊断弹层（NSelect/NPopover，非裸控件）', () => {
    expect(comp).toContain('<n-select v-if="fieldOptions.length" class="dq-hist-field"');
    expect(comp).toContain(':aria-label="\'选择直方图字段\'"');
    expect(comp).toContain('<n-popover v-if="rejectedFields.length"');
    expect(comp).toContain('字段诊断 · {{ rejectedFields.length }} 个字段不参与自动分桶');
    expect(comp).toContain("emit('pick-field'");
  });
  it('选项带类型与 ID 标注；选中 ID 类字段时出「ID 字段」警示', () => {
    expect(comp).toContain('${c.path} · ${HIST_KIND_ZH[c.kind] || c.kind}${c.weak ? \'（ID）\' : \'\'}');
    expect(comp).toContain("emit('pick-field', String(v || ''))");
    expect(comp).toContain('<span class="dq-hist-weak">ID 字段</span>');
    expect(comp).toContain('v-if="fieldWeak"');
  });
});

describe('useHistAgg 诊断与选择（688）', () => {
  it('暴露 candidates/rejected/selectedField/pickField；选择即开开关并清拉黑', () => {
    expect(use).toContain('const histAnalysis = computed(() => analyzeHistFields(');
    expect(use).toMatch(/histCandidates, histRejected, selectedField, pickField, selectedCandidate/);
    expect(use).toMatch(/function pickField\(field: string\): void \{[\s\S]*?autoHist\.value = true;/);
  });
  it('显式选择优先于自动；值/类型/桶宽一并注入', () => {
    expect(use).toMatch(/const sel = selectedField\.value;[\s\S]*?histCandidates\.value\.some\(c => c\.path === sel\)/);
    expect(use).toContain('opts.verBelow650?.() ?? false, meta?.interval');
  });
  it('无字段时原因区分「可选未选 / 全不可用 / 所选无桶」', () => {
    expect(use).toContain('未自动识别时间字段——在右侧「直方图字段」中选择后生成');
    expect(use).toContain('个字段均不可自动分桶——点「为什么」查看逐字段原因');
    expect(use).toContain('未返回分桶——可能全为空值');
  });
});

describe('IndexHub 两 tab 接线（688）', () => {
  it('mappingFields 全量字段供诊断；两处直方图传候选与选择值', () => {
    expect(ih.match(/mappingFields: \(\) => ihIdxFields\.value/g)?.length).toBe(2);
    expect(ih).toContain(':field-options="docsHist.histCandidates.value"');
    expect(ih).toContain(':field-options="qryHist.histCandidates.value"');
    expect(ih).toContain('@pick-field="onDocsHistField"');
    expect(ih).toContain('@pick-field="onQryHistField"');
  });
  it('选择字段后按当前检索重跑', () => {
    expect(ih).toMatch(/function onDocsHistField\(field: string\) \{[\s\S]*?docsHist\.pickField\(field\);[\s\S]*?runDocs\(\)/);
    expect(ih).toMatch(/function onQryHistField\(field: string\) \{[\s\S]*?qryHist\.pickField\(field\);[\s\S]*?runDsl\(\)/);
  });
});
