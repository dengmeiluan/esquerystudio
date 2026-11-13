/**
 * 一千三百二十批：terms 聚合的占比分母漏掉了「未返回桶」。
 *
 * 真机复现（1440×1000，research_report，`aggs: {agg_by_status: {terms: {field:'status', size:3}}}`）：
 * mock 按 ES 真实形态返回 3 桶 21 / 9 / 5，外加 `sum_other_doc_count: 57`
 * （还有 57 条文档落在没返回的桶里）。页面显示：
 *
 *   ACTIVE 21  60.0%     ← 分母用了「返回桶合计」35
 *   PENDING 9  25.7%
 *   CLOSED  5  14.3%
 *
 * 三行加起来正好 100% —— 用户会认为这就是该字段的**全部**分布，
 * 而真实全量是 92 条，这三桶只占 22.8% / 9.8% / 5.4%。
 * 这是典型的假数据完整性（宁缺勿错）：不写出来可以，写成 100% 不行。
 *
 * 本 spec 锁：
 *  - pctOf 分母 = 返回桶合计 + sum_other_doc_count
 *  - 未返回桶 > 0 时，面板必须显式告知条数与「调大 terms.size」的出路
 *  - sum_other_doc_count 缺失（非 terms 聚合）时退化为返回桶合计——不比旧行为更糟
 * 负控：把分母改回 a.total → 第一条必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

function fn(start: string): string {
  const i = src.indexOf(start);
  expect(i, start + ' 必须存在').toBeGreaterThan(-1);
  const rest = src.slice(i);
  const end = rest.indexOf('\n}\n');
  return end < 0 ? rest : rest.slice(0, end);
}

describe('1320 terms 聚合占比分母', () => {
  it('分母 = 返回桶合计 + sum_other_doc_count', () => {
    const denom = fn('function denomOf(');
    expect(denom, '分母必须含 other').toContain('a.total + a.other');
    const pct = fn('function pctOf(');
    expect(pct, 'pctOf 必须走 denomOf').toContain('denomOf(a)');
    expect(pct, '不得直接用返回桶合计当分母').not.toMatch(/\/\s*a\.total\s*\*/);
  });

  it('采集 sum_other_doc_count（缺省 0，不炸）', () => {
    const blk = fn('const termsAggs = computed');
    expect(blk, '必须读 sum_other_doc_count').toContain('sum_other_doc_count');
    expect(blk, '缺失时必须退化为 0').toMatch(/Number\(v\?\.sum_other_doc_count\) \|\| 0/);
  });

  it('未返回桶存在时显式告知（不能让人以为 100% 就是全量）', () => {
    expect(src, '必须有未返回桶的提示行').toContain('dq-agg-other');
    expect(src, '提示里要写清有多少条没落进来').toMatch(/另有 \{\{ fmtNum\(a\.other\) \}\} 条落在未返回的桶里/);
    expect(src, '还要给出路：调大 terms.size').toContain('aggs.terms.size');
    /* 负控思路：条件必须挂在 a.other 上，而非常量 true */
    expect(src, '提示行必须按 other 有无条件渲染').toMatch(/v-if="a\.other"/);
  });

  it('折叠提示与未返回提示是两件事，措辞不混用', () => {
    expect(src, '折叠条数仍走 rest').toMatch(/v-if="a\.rest"[^>]*>其余 \{\{ a\.rest \}\} 桶已折叠/);
  });
});
