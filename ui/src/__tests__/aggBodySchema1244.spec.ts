/**
 * 聚合 body 参数 schema 的覆盖与真实性。
 *
 * 背景：AGG_OPS 有 68 个算子，但 AGG_BODY_PARAMS 只登记了 47 个——
 * 另外 21 个开出来是「裸键值表」，用户得自己回忆参数名手打。这轮把它们补上，
 * 但只补**官方文档确实存在的标量/枚举键**，形状不确定或必须数组的键留自由表
 * （1202 的 bucket_sort.sort 判例：json 档新建给 `{}`，而 ES 要的是数组，登记=给错默认值）。
 *
 * 本 spec 锁三件事：
 *  ① 每个 AGG_OPS 算子都能查到 schema 条目（含空数组=明确登记「无标量」）；
 *  ② schema 里的 key 不得与 field/path 冲突（那两个由字段选择器权威编辑）；
 *  ③ 关键算子的必填主键确实在 schema 里（weighted_avg.value/weight、t_test.a/b、
 *     scripted_metric 的四个生命周期脚本）——这是「新建后配不出能跑的聚合」的根因。
 */
import { describe, it, expect } from 'vitest';
import { AGG_OPS, AGG_BODY_PARAMS } from '../utils/queryAstOps';

/* field/path 由 AggTreeNode 的 FIELD_BODY_AGGS / PATH_BODY_AGGS 提供字段选择器，schema 再登记会出两个编辑位。
   ⚠ 只收这两个单词键：`fields` 不是同义键——matrix_stats.fields 是**必填主键**（字段名数组），
   而 matrix_stats / top_metrics 都不在 FIELD_BODY_AGGS 里，没有任何字段选择器接管它，
   禁掉等于把那个聚合的编辑位彻底抹掉。 */
const FIELD_OR_PATH = new Set(['field', 'path']);

const opsWithSchema = Object.keys(AGG_BODY_PARAMS);

describe('聚合 body schema 覆盖', () => {
  it('AGG_OPS 的每个算子都有 schema 条目（空数组=明确「无标量键」）', () => {
    const missing = Object.keys(AGG_OPS).filter(op => !opsWithSchema.includes(op));
    expect(missing, '这些算子没有 schema 条目：' + missing.join(', ')).toEqual([]);
  });

  it('schema 里不登记 field/path（那两个由字段选择器权威编辑，登记会出两个编辑位）', () => {
    const conflicts: string[] = [];
    for (const [op, metas] of Object.entries(AGG_BODY_PARAMS)) {
      for (const m of metas) {
        if (FIELD_OR_PATH.has(m.key)) conflicts.push(`${op}.${m.key}`);
      }
    }
    expect(conflicts, '这些键不该出现在 schema 里：' + conflicts.join(', ')).toEqual([]);
  });

  it('schema 里的聚合名都在 AGG_OPS 中（防写错名/留旧名）', () => {
    const orphans = opsWithSchema.filter(op => !(op in AGG_OPS));
    expect(orphans, '这些 schema 键不对应任何算子：' + orphans.join(', ')).toEqual([]);
  });

  it('每个 schema 条目自身不重复键（重复 key 会让渲染出两个同样的输入位）', () => {
    const dupes: string[] = [];
    for (const [op, metas] of Object.entries(AGG_BODY_PARAMS)) {
      const seen = new Set<string>();
      for (const m of metas) {
        if (seen.has(m.key)) dupes.push(`${op}.${m.key}`);
        seen.add(m.key);
      }
    }
    expect(dupes, '这些 schema 有重复键：' + dupes.join(', ')).toEqual([]);
  });

  it('enum 档必须给 options 且非空（空 options 渲染成空下拉，选了也没值）', () => {
    const bad: string[] = [];
    for (const [op, metas] of Object.entries(AGG_BODY_PARAMS)) {
      for (const m of metas) {
        if (m.kind === 'enum' && (!m.options || !m.options.length)) bad.push(`${op}.${m.key}`);
      }
    }
    expect(bad, '这些 enum 没给候选：' + bad.join(', ')).toEqual([]);
  });
});

describe('必填主键在 schema 里（新建即能配出可跑的聚合）', () => {
  const keysOf = (op: string) => (AGG_BODY_PARAMS[op] || []).map(m => m.key);

  it('weighted_avg：value 与 weight 必须都有编辑位', () => {
    expect(keysOf('weighted_avg')).toEqual(expect.arrayContaining(['value', 'weight']));
  });

  it('t_test：a 与 b 必须都有编辑位，type 是三档枚举', () => {
    expect(keysOf('t_test')).toEqual(expect.arrayContaining(['a', 'b', 'type']));
    const typeMeta = AGG_BODY_PARAMS.t_test.find(m => m.key === 'type')!;
    expect(typeMeta.kind).toBe('enum');
    expect(typeMeta.options).toEqual(expect.arrayContaining(['heteroscedastic', 'homoscedastic', 'paired']));
  });

  it('scripted_metric：四个生命周期脚本都要有具名输入位', () => {
    expect(keysOf('scripted_metric')).toEqual(
      expect.arrayContaining(['init_script', 'map_script', 'combine_script', 'reduce_script']),
    );
  });

  it('children/parent：主键是 type 而不是 field', () => {
    expect(keysOf('children')).toContain('type');
    expect(keysOf('parent')).toContain('type');
  });

  it('负控：确实有算子被登记为「无标量键」，证明空数组是刻意而非漏填', () => {
    /* value_count / geo_centroid 官方只有 field，登记为空数组 =
       「我已经查过了，没有别的标量」。若哪天有人把它们删掉，上面第 1 条会红。 */
    expect(AGG_BODY_PARAMS.value_count, 'value_count 应明确登记为空').toEqual([]);
    expect(AGG_BODY_PARAMS.geo_centroid, 'geo_centroid 应明确登记为空').toEqual([]);
  });
});

describe('数组型必填参数（给错默认值会被 ES 直接拒）', () => {
  const kindOf = (op: string, key: string) =>
    (AGG_BODY_PARAMS[op] || []).find(m => m.key === key)?.kind;

  it('top_metrics：metrics 是数组型，sort 是对象型，size 是数值', () => {
    expect(kindOf('top_metrics', 'metrics'), 'metrics 必须是 json-array').toBe('json-array');
    expect(kindOf('top_metrics', 'sort'), 'sort 是单个对象').toBe('json');
    expect(kindOf('top_metrics', 'size')).toBe('number');
  });

  it('matrix_stats：fields 是数组型，mode 五档', () => {
    expect(kindOf('matrix_stats', 'fields'), 'fields 必须是 json-array').toBe('json-array');
    const mode = (AGG_BODY_PARAMS.matrix_stats || []).find(m => m.key === 'mode')!;
    expect(mode.options).toEqual(expect.arrayContaining(['avg', 'min', 'max', 'sum', 'median']));
  });

  it('负控：真的有对象型参数存在（否则 json-array 与 json 就无从区分）', () => {
    const all = Object.values(AGG_BODY_PARAMS).flat();
    expect(all.some(m => m.kind === 'json'), '必须有对象型参数').toBe(true);
    expect(all.some(m => m.kind === 'json-array'), '必须有数组型参数').toBe(true);
  });
});
