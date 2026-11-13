import { describe, it, expect } from 'vitest';
import { OPS_META, opsForType, RICH_OPS } from '../utils/queryAstOps';

describe('queryAstOps', () => {
  it('富表单算子都有 form 定义', () => {
    for (const op of RICH_OPS) expect(OPS_META[op], op).toBeDefined();
  });
  it('text 类型候选含 match 系列，不含 range', () => {
    const ops = opsForType('text');
    expect(ops).toContain('match');
    expect(ops).toContain('match_phrase');
    expect(ops).not.toContain('range');
  });
  it('keyword 候选含 term/terms/wildcard，match 也在（keyword 可 match）', () => {
    const ops = opsForType('keyword');
    expect(ops).toContain('term');
    expect(ops).toContain('wildcard');
    expect(ops).toContain('match');
  });
  it('数值类型候选含 range/term', () => {
    const ops = opsForType('long');
    expect(ops).toContain('range');
    expect(ops).toContain('term');
  });
  it('date 候选含 range', () => {
    expect(opsForType('date')).toContain('range');
  });
  it('未知类型兜底 exists', () => {
    expect(opsForType(undefined)).toEqual(['exists']);
    expect(opsForType('rank_feature_vector')).toEqual(['exists']);
  });
  it('form=field 的算子必须显式声明 wrap', () => {
    for (const op of RICH_OPS) {
      const m = OPS_META[op];
      if (m.form === 'field') expect(m.wrap, op).toBeDefined();
    }
  });
});
