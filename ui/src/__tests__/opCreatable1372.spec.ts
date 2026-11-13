/**
 * 一千三百七十二批：算子「可新建」覆盖守卫。
 *
 * 用户的目标是「所有 dsl 查询语法全部支持」——支持包含**新建**，不只是解析和渲染。
 * 1199 记过一次同类缺口（nested/has_child/has_parent 能读能改、没有新建入口），
 * 1372 又发现 match_all/match_none 同样如此：算子下拉只列字段算子，
 * 「+ 条件」默认又落 match_all，于是「想要一个 match_none」只能手写 DSL。
 *
 * 本 spec 把「可新建」定义成三条通道的并集，逐算子检查：
 *   ① opsForType(某字段类型) 推荐出来
 *   ② ADV_MENU（高级分组菜单）里
 *   ③ 由复合容器新建（wrap/multi 的容器本身在 ①② 里，其子查询随容器创建）
 * 任何一条都不满足 = 这个算子用户永远造不出来。
 */
import { describe, it, expect } from 'vitest';
import { OPS_META, ADV_MENU, WRAP_LABELS, MULTI_LABELS, opsForType } from '../utils/queryAstOps';

/* ES 全部可查字段类型（覆盖 mapping 文档里的类型族） */
const FIELD_TYPES: Array<string | undefined> = [
  'text', 'keyword', 'wildcard', 'long', 'integer', 'short', 'byte', 'double', 'float',
  'half_float', 'scaled_float', 'unsigned_long', 'date', 'date_nanos', 'boolean', 'ip',
  'geo_point', 'geo_shape', 'rank_feature', 'rank_features', 'flattened', 'match_only_text',
  'search_as_you_type', 'semantic_text', 'version', 'percolator', 'join', 'dense_vector',
  'sparse_vector', 'nested', 'object', 'binary', 'alias', 'integer_range', 'long_range',
  'float_range', 'double_range', 'ip_range', 'date_range', 'token_count', 'completion',
  'histogram', 'aggregate_metric_double', 'constant_keyword', 'shape', 'murmur3', 'annotated_text',
  undefined,
];

const typeReachable = (() => {
  const s = new Set<string>();
  for (const t of FIELD_TYPES) for (const op of opsForType(t as any)) s.add(op);
  return s;
})();
const advReachable = new Set(ADV_MENU.flatMap(g => g.ops));
/* 复合容器自身可新建后，其内部子查询自然可写——容器的子算子不算「不可新建」 */
const containerChildren = new Set<string>([]);

function creatable(op: string): boolean {
  return typeReachable.has(op) || advReachable.has(op) || containerChildren.has(op);
}

describe('1372 算子可新建覆盖', () => {
  it('清单读到了（防空转假绿）', () => {
    expect(Object.keys(OPS_META).length).toBeGreaterThan(40);
    expect(typeReachable.size).toBeGreaterThan(15);
    expect(advReachable.size).toBeGreaterThan(30);
  });

  it('每个 leaf 算子至少有一条新建通道', () => {
    const all = Object.keys(OPS_META);
    const dead = all.filter(op => !creatable(op)).sort();
    expect(dead, `这些算子用户永远造不出来：${dead.join(', ')}`).toEqual([]);
  });

  it('match_all / match_none 在高级菜单的「无条件与无结果」组里（1372 修复点）', () => {
    const grp = ADV_MENU.find(g => g.group === '无条件与无结果');
    expect(grp, '必须有这一组').toBeTruthy();
    expect(grp!.ops).toContain('match_all');
    expect(grp!.ops).toContain('match_none');
  });

  it('高级菜单里的算子都必须有 label（否则下拉显示裸 op 名）', () => {
    const labels = new Set([
      ...Object.keys(OPS_META),
      ...Object.keys(WRAP_LABELS),
      ...Object.keys(MULTI_LABELS),
    ]);
    const adv = [...new Set(ADV_MENU.flatMap(g => g.ops))];
    const noLabel = adv.filter(o => !labels.has(o));
    expect(noLabel, `菜单里有、注册表没 label：${noLabel.join(', ')}`).toEqual([]);
  });

  it('负控：把 match_none 从两条通道都拿掉 → ① 必须报出它', () => {
    const reach = new Set([...typeReachable].filter(o => o !== 'match_none'));
    const adv = new Set([...advReachable].filter(o => o !== 'match_none'));
    const dead = Object.keys(OPS_META).filter(op => !(reach.has(op) || adv.has(op)));
    expect(dead, '拿掉后必须暴露').toContain('match_none');
  });
});
