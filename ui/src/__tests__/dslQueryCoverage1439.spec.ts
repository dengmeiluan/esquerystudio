/**
 * 1439：查询语法覆盖契约。
 *
 * 目标是「DSL 查询语法全支持」——把官方查询类型钉成一张清单，三轴各验一遍：
 *   ① 可读可改：解析/渲染有注册（OPS_META 或 wrap/multi 表）；
 *   ② 可新建：构建器有入口（字段算子下拉的 RICH_OPS / 「+ 高级」ADV_MENU）；
 *   ③ 可补全：手写时输入键名有骨架（QUERY_SNIPPETS）。
 * 新增算子若只做其中一轴，这里会点名——避免再出现「能读不能建/能建不能补」的缺口。
 *
 * bool 是唯一例外：它是条件组的容器（BoolGroupNode + parseBool），不在算子表里，
 * 但读/建/补三轴都有专属通道（+ 条件默认组 / QUERY_SNIPPETS.bool）。
 */
import { describe, it, expect } from 'vitest';
import { OPS_META, WRAP_LABELS, MULTI_LABELS, ADV_MENU } from '../utils/queryAstOps';
import { QUERY_SNIPPETS } from '../utils/dslCompletionContext';

/** 官方查询类型清单（ES 8.x 文档目录 + 本仓已覆盖的 9.x 新增 bitmap_terms / geo_grid） */
const OFFICIAL = [
  /* 全文 */
  'match', 'match_bool_prefix', 'match_phrase', 'match_phrase_prefix', 'multi_match',
  'combined_fields', 'query_string', 'simple_query_string', 'intervals',
  /* 词项级 */
  'term', 'terms', 'terms_set', 'range', 'exists', 'prefix', 'wildcard', 'regexp',
  'fuzzy', 'ids', 'bitmap_terms',
  /* 复合 */
  'bool', 'boosting', 'constant_score', 'dis_max', 'function_score', 'script_score',
  /* 连接 */
  'nested', 'has_child', 'has_parent', 'parent_id',
  /* 地理 / 形状 */
  'geo_distance', 'geo_bounding_box', 'geo_polygon', 'geo_shape', 'geo_grid', 'shape',
  /* 排序特征 / 向量 / 语义 */
  'rank_feature', 'distance_feature', 'knn', 'sparse_vector', 'semantic',
  'text_expansion', 'weighted_tokens',
  /* 专用 */
  'more_like_this', 'percolate', 'pinned', 'rule', 'script', 'wrapper', 'template',
  'match_all', 'match_none', 'type',
  /* 跨度 */
  'span_term', 'span_near', 'span_or', 'span_not', 'span_first', 'span_containing',
  'span_within', 'span_multi', 'span_gap', 'span_field_masking',
];

const EXCEPTIONS = new Set(['bool']); /* 组容器，三轴走专属通道（见文件头） */

const registered = (op: string) => op in OPS_META || op in WRAP_LABELS || op in MULTI_LABELS;
const creatable = (op: string) => op in OPS_META || ADV_MENU.some(g => g.ops.includes(op));
const completable = (op: string) => op in QUERY_SNIPPETS;

function gaps(): { read: string[]; create: string[]; complete: string[] } {
  const list = OFFICIAL.filter(op => !EXCEPTIONS.has(op));
  return {
    read: list.filter(op => !registered(op)),
    create: list.filter(op => !creatable(op)),
    complete: list.filter(op => !completable(op)),
  };
}

describe('1439 查询语法覆盖契约', () => {
  it('官方清单每一员都「可读可改」', () => {
    expect(gaps().read).toEqual([]);
  });

  it('官方清单每一员都「可新建」', () => {
    expect(gaps().create).toEqual([]);
  });

  it('官方清单每一员都「可补全」', () => {
    expect(gaps().complete).toEqual([]);
  });

  it('清单自身不重复、没有拼写漂移', () => {
    expect(new Set(OFFICIAL).size).toBe(OFFICIAL.length);
    /* 唯一例外 bool 的三轴专属通道必须真实存在（组容器不走算子表） */
    expect(QUERY_SNIPPETS.bool, 'bool 的手写骨架').toBeTruthy();
    /* 三表的键必须都是本清单成员或明确的内部档（__function__ 等合成键不进算子表） */
    for (const op of Object.keys(OPS_META)) {
      expect(OFFICIAL.includes(op) || ['type', 'template'].includes(op), `OPS_META 多出清单外算子：${op}`).toBe(true);
    }
  });

  it('负控：清单里混入不存在的算子 → 三轴都点名', () => {
    const fake = 'definitely_not_a_query';
    expect(registered(fake)).toBe(false);
    expect(creatable(fake)).toBe(false);
    expect(completable(fake)).toBe(false);
    /* 用同一判据跑混入清单：三个缺口列表都该出现它 */
    const probe = (op: string) => ({ read: !registered(op), create: !creatable(op), complete: !completable(op) });
    expect(probe(fake)).toEqual({ read: true, create: true, complete: true });
    expect(probe('match')).toEqual({ read: false, create: false, complete: false });
  });
});
