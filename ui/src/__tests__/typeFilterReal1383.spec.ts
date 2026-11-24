/**
 * 1383：高特异算子的「字段候选收窄」必须收窄到**真实存在的 mapping 类型**。
 *
 * typeFilterForOp 返回的类型列表会被 FieldSelect 当作硬过滤（type-filter）：
 * 只要字段类型不在这个列表里，该字段就**根本不出现**。因此一旦列表里写的是
 * 一个真实 mapping 永远不可能是的类型名（拼错、或写了算子名而非 mapping 类型），
 * 用户点开字段选择器看到的是**空列表**——「选完算子就找不到任何字段」。
 *
 * 判据：对每个 STRICT_TYPE_OPS，typeFilterForOp 返回的每一项都必须是
 * ES mapping 里真实存在的类型名（白名单来自 ES 官方 field data types）。
 * 反向：如果它返回的类型里一个真实类型都没有，那就是彻底筛空。
 *
 * 负控：塞一个不存在的类型进白名单判据 → 必须被报出。
 */
import { describe, it, expect } from 'vitest';
import { OPS_META, typeFilterForOp, STRICT_TYPE_OPS } from '../utils/queryAstOps';

/* ES 8.x 官方 field data types（mapping 里 type 的合法取值）。
   只收「字段级」类型；object/nested 这类容器不算字段候选。 */
const REAL_MAPPING_TYPES = new Set([
  /* 字符串 */
  'text', 'keyword', 'constant_keyword', 'wildcard', 'match_only_text', 'search_as_you_type',
  /* 数值 */
  'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float',
  'unsigned_long', 'token_count',
  /* 日期 */
  'date', 'date_nanos',
  /* 布尔 / 二进制 */
  'boolean', 'binary',
  /* 范围 */
  'integer_range', 'long_range', 'float_range', 'double_range', 'date_range', 'ip_range',
  /* 地理 / 形状 */
  'geo_point', 'geo_shape', 'point', 'shape',
  /* 其他 */
  'ip', 'version', 'murmur3', 'aggregate_metric_double', 'histogram',
  'flattened', 'join', 'rank_feature', 'rank_features', 'dense_vector', 'sparse_vector',
  'percolator', 'semantic_text', 'alias',
  /* 查询期字段类型（runtime fields 也用同一套 token） */
  'composite',
]);

describe('1383 高特异算子的字段候选收窄', () => {
  const ops = [...STRICT_TYPE_OPS];

  it('① 高特异算子清单非空（防呆）', () => {
    expect(ops.length).toBeGreaterThan(5);
  });

  it('② 收窄类型必须是真实 mapping 类型名（否则选择器筛空）', () => {
    const bad: string[] = [];
    for (const op of ops) {
      for (const t of typeFilterForOp(op) ?? []) {
        if (!REAL_MAPPING_TYPES.has(t)) bad.push(`${op} → ${t}`);
      }
    }
    expect(bad, `收窄到了不存在的 mapping 类型：${bad.join(', ')}`).toEqual([]);
  });

  it('③ 高特异算子不能收窄成空表（那等于把字段全藏了）', () => {
    const empty = ops.filter(op => (typeFilterForOp(op) ?? []).length === 0);
    expect(empty, `这些算子收窄后没有任何候选类型：${empty.join(', ')}`).toEqual([]);
  });

  it('④ 收窄目标必须与 OPS_META 声明的 types 一致（两处不同步 = 一处必错）', () => {
    const drift: string[] = [];
    for (const op of ops) {
      const declared = OPS_META[op]?.types ?? [];
      const filter = typeFilterForOp(op) ?? [];
      if (!declared.length) continue; /* 没声明 types 的（如 span_gap）不参与比对 */
      const miss = filter.filter(t => !declared.includes(t));
      if (miss.length) drift.push(`${op}: 过滤 ${filter.join('/')} 里有 ${miss.join('/')} 不在注册表 types`);
    }
    expect(drift, 'typeFilterForOp 与 OPS_META.types 脱节：\n' + drift.join('\n')).toEqual([]);
  });

  it('⑤ 负控：白名单判定不是恒真（塞假类型必被识别）', () => {
    const fake = typeFilterForOp('geo_distance') ?? [];
    expect(fake.every(t => REAL_MAPPING_TYPES.has(t))).toBe(true);
    expect(REAL_MAPPING_TYPES.has('__not_a_type__')).toBe(false);
  });
});
