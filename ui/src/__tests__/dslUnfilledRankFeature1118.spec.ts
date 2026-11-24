import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTree, countUnfilledLeaves } from '../utils/queryAst';

/* 1118：rank_feature 的 boost 可选——字段本身即完整查询，不能计入「未填值」；
 distance_feature 的 pivot 仍是必填（缺失照常报警）。 */
const count = (query: unknown) => {
  const r = parseTree({ query });
  if (!r.ok) throw new Error(r.reason);
  return countUnfilledLeaves(r.tree.root);
};
const clause = readFileSync(join(__dirname, '../components/builder/ClauseNode.vue'), 'utf-8');

describe('1118 rank_feature 未填值口径', () => {
  it('rank_feature 只有字段 / 带 boost 都不算未填；distance_feature 缺 pivot 仍算', () => {
    expect(count({ rank_feature: { field: 'risk_score' } })).toBe(0);
    expect(count({ rank_feature: { field: 'risk_score', boost: 2 } })).toBe(0);
    expect(count({ distance_feature: { field: 'created', origin: 'now', pivot: '' } })).toBe(1);
    expect(count({ distance_feature: { field: 'created', origin: 'now', pivot: '7d' } })).toBe(0);
    expect(count({ term: { title: '' } })).toBe(1);
    expect(count({ exists: { field: 'title' } })).toBe(0);
  });

  it('主值占位说明真实语义（boost/pivot/位图），保留普通字段值文案', () => {
    expect(clause).toContain("if (props.node.op === 'rank_feature') return 'boost（可选，默认 1）';");
    expect(clause).toContain("if (props.node.op === 'distance_feature') return 'pivot（如 7d / 1km）';");
    expect(clause).toContain("if (props.node.op === 'bitmap_terms') return '位图值（Base64 或数字）';");
    expect(clause).toContain("if (t === 'text') return '关键词（分词匹配）';");
  });
});
