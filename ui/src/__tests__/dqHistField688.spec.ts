/**
 * 688 补批：DSL 查询页（DslQueryView）接入「直方图字段诊断 + 手动选字段」。
 * 产线索引 bond_management_sentiment_title 只有 _class / sentimentId / title，
 * 旧版 DQ 只给一句「未识别到可作直方图的字段」；本批与 IndexHub 共用 analyzeHistFields，
 * 候选/诊断/按类型注入（keyword=词条、数值=固定桶宽、date=时间直方图）三处同源。
 *
 * 锁点：
 * ① HistogramSection 接线（field-options / field-value / rejected-fields / weak / pick-field）；
 * ② 手动选择优先于自动嗅探（guessDateField 首判 pickedHistField）；
 * ③ 选择=明确要直方图：开开关 + 清 session 拉黑 + 有结果时重跑；
 * ④ 注入按候选 interval 走数值固定桶宽（与 IndexHub 同判据）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('688 DQ 直方图字段诊断与手动选择', () => {
  it('组件接线：候选/选择/诊断/弱字段/选择事件全部喂给 HistogramSection', () => {
    expect(dq).toContain(':field-options="histCandidates"');
    expect(dq).toContain(':field-value="pickedHistField"');
    expect(dq).toContain(':rejected-fields="histRejected"');
    expect(dq).toContain(':field-weak="!!selectedHistCandidate?.weak"');
    expect(dq).toContain(':field-note="selectedHistCandidate?.note || \'\'"');
    expect(dq).toContain('@pick-field="onPickHistField"');
  });
  it('分析同源：analyzeHistFields 吃统一字段源（fieldItems，含运行时字段）与当前 hits', () => {
    expect(dq).toContain("import { pickHistField, buildHistAgg, sniffDateField, analyzeHistFields");
    expect(dq).toMatch(/analyzeHistFields\(\s*fieldItems\.value\.map\(f => \(\{ path: f\.path, type: f\.type \}\)\)/);
    expect(dq).toContain('const histCandidates = computed<HistCandidate[]>(() => histAnalysis.value.candidates)');
    expect(dq).toContain('const histRejected = computed<HistRejection[]>(() => histAnalysis.value.rejected)');
  });
  it('手动选择优先于自动嗅探；切索引清空选择', () => {
    expect(dq).toMatch(/function guessDateField\(\): string \{\s*if \(pickedHistField\.value\) return pickedHistField\.value;\s*if \(brushField\) return brushField;/);
    expect(dq).toContain("watch(() => store.pickedIdx, () => { pickedHistField.value = ''; })");
  });
  it('选择即开开关、清拉黑、按所选类型重跑；空串回自动', () => {
    expect(dq).toMatch(/function onPickHistField\(field: string\) \{[\s\S]*?pickedHistField\.value = field;[\s\S]*?if \(!field\) return;[\s\S]*?autoHist\.value = true;[\s\S]*?histBrokenIdx\.delete\(store\.pickedIdx\);[\s\S]*?if \(resp\.value\) void runQuery\(\);/);
  });
  it('数值候选带 interval：注入走固定桶宽 histogram（与 IndexHub 同判据）', () => {
    expect(dq).toMatch(/const pickedCand = histCandidates\.value\.find\(c => c\.path === dateField\);/);
    expect(dq).toMatch(/buildHistAgg\(dateField, mappingFieldTypes\.value\[dateField\], store\.verBelow\('6\.5\.0'\), pickedCand\?\.interval\)/);
  });
  it('无桶原因在存在候选时指向选择框，而不是只报「未识别到」', () => {
    expect(dq).toContain("if (histCandidates.value.length) return '未自动识别时间字段——在右侧「直方图字段」中选择后生成';");
  });
});
