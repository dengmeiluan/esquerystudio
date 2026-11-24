/**
 * 三百三十一批：analyzer 快验联动闭环——MappingFieldTree 右键「analyzer 快验」emit
 * → MappingView quickAnalyze 深链 /analyzer-lab?analyzerField=<path>
 * → AnalyzerLabView 消费（verifyField 同语义：真实样本+三链路并排，消费即清）。
 * 修复 329 死 emit（事件无人消费）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const tree = read('../components/MappingFieldTree.vue');
const mv = read('../views/MappingView.vue');
const lab = read('../views/AnalyzerLabView.vue');

describe('analyzer 快验联动（331 批）', () => {
  it('链路三环齐：emit→quickAnalyze→深链消费', () => {
    expect(tree).toMatch(/\(e: 'analyze', f: any\): void/);
    expect(mv).toMatch(/@analyze="quickAnalyze"/);
    expect(mv).toMatch(/path: '\/analyzer-lab', query: \{ analyzerField: f\.path \}/);
    expect(lab).toMatch(/const afLink = useUrlState\('analyzerField'\)/);
    expect(lab).toMatch(/await verifyField\(\{ path \} as any\)/);
    expect(lab).toMatch(/afLink\.value = '';/);
  });
});
