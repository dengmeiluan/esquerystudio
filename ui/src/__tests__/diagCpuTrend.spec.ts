/**
 * 二百一十七批：DiagView 节点表 CPU 趋势列（与 214 批 HEAP 趋势对称补齐）。
 * 五百二十五批 W5 同步更新：节点表换 QRT rows 型后，SparkLine 图形列随纯文本壳退役——
 * 趋势列降为 trendTip 文本摘要列（近 N 次 min~max · 最新），采样真源 utils/trendHist
 * 不变（heapHist/cpuHist 仍每轮 loadOps 同轮采样）。源码锁（diagRowMenu 同款），同步更新锁定：
 * 1) QRT 列集含双趋势列且紧跟对应水位列（原对称形态延续）；
 * 2) cpuHist 声明 + 采样循环与 heapHist 同轮（一次 loadOps 双列同记）；
 * 3) 采样逻辑收口 utils/trendHist（不再内联 Map 推入）；
 * 4) 双趋势列文本形态：trendCell（满 2 点出 trendTip 摘要，不足给「采样中」占位）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/DiagView.vue'), 'utf-8');

describe('DiagView CPU 趋势列（二百一十七批→五百二十五批 W5 同步更新）', () => {
  it('QRT 列集：双趋势列紧跟对应水位列（对称形态延续）', () => {
    expect(src).toContain("'HEAP%', 'HEAP 趋势', 'CPU%', 'CPU 趋势'");
  });
  it('cpuHist 声明 + 采样循环与 heapHist 同轮（一次 loadOps 双列同记）', () => {
    expect(src).toContain('const cpuHist = ref<Map<string, number[]>>(new Map());');
    expect(src).toMatch(/pushSample\(heapHist\.value, key, n\.heapPct\);\s*pushSample\(cpuHist\.value, key, n\.cpuPct\);/);
  });
  it('采样逻辑收口 utils/trendHist（不再内联 Map 推入）', () => {
    expect(src).toContain("import { pushSample, trendTip } from '../utils/trendHist';");
    expect(src).not.toContain('arr.push(Number(n.heapPct ?? 0))');
  });
  it('双趋势列同形态：trendCell 文本摘要（trendTip 同源，满 2 点出摘要/不足「采样中」）', () => {
    expect(src).toMatch(/function trendCell\(arr\?: number\[\]\): string \{\s*return arr && arr\.length >= 2 \? trendTip\(arr\) : '采样中';\s*\}/);
    expect(src).toContain('trendCell(heapHist.value.get(name))');
    expect(src).toContain('trendCell(cpuHist.value.get(name))');
  });
});
