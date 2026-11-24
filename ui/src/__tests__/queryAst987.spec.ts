/* 987 批：DSL 全量覆盖补齐。两线：
   A 线 = ES 8.x 新算子注册（geo_grid / shape / sparse_vector /
   text_expansion / weighted_tokens / semantic / knn 查询级 / span_field_masking），
   富表单投影 + 往返无损契约与 985 同构。
   B 线 = 顶层 body 键一等公民化（post_filter → QueryNode 树编辑；collapse / knn
   → 结构化形态记忆），从 extras 键值表升格为一等解析，序列化仍深度无损。 */
import { describe, it, expect } from 'vitest';
import {
  parseTree, serializeTree, parseQueryNode, serQueryNode, makeNodeByOp, WRAP_META,
} from '../utils/queryAst';
import type { LeafNode, WrapNode } from '../utils/queryAst';
import { OPS_META, ADV_MENU, labelOfOp, RICH_OPS } from '../utils/queryAstOps';

const roundTrip = (name: string, dsl: any) => {
  it(name, () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
};

describe('987 A线 8.x 新算子富表单注册', () => {
  it('九个新算子全部注册且有中文标签', () => {
    for (const op of ['geo_grid', 'shape', 'sparse_vector', 'text_expansion', 'weighted_tokens', 'semantic', 'knn']) {
      expect(OPS_META[op], op).toBeDefined();
      expect(labelOfOp(op), op + ' 中文标签').not.toBe(op);
    }
    expect(WRAP_META.span_field_masking).toBeDefined();
    expect(labelOfOp('span_field_masking')).not.toBe('span_field_masking');
  });
  it('ADV_MENU 含向量与语义组，全组成员可富表单化', () => {
    const groups = Object.fromEntries(ADV_MENU.map(g => [g.group, g.ops]));
    expect(groups['向量与语义']).toEqual(expect.arrayContaining(['knn', 'sparse_vector', 'text_expansion', 'weighted_tokens', 'semantic']));
    expect(groups['地理位置']).toEqual(expect.arrayContaining(['geo_grid', 'shape']));
    expect(groups['全文检索']).toContain('multi_match');
    expect(groups['跨度位置']).toContain('span_field_masking');
  });
  it('named 形态契约：fieldKey 必备（注册表既有锁随迁）', () => {
    for (const op of ['sparse_vector', 'semantic', 'knn']) {
      expect(OPS_META[op].form, op).toBe('named');
      expect(OPS_META[op].fieldKey, op).toBeTruthy();
    }
  });
  it('dense_vector 字段推荐 knn（智能匹配）', async () => {
    const { opsForType } = await import('../utils/queryAstOps');
    expect(opsForType('dense_vector')).toContain('knn');
  });
});

describe('987 A线 新算子往返无损', () => {
  roundTrip('geo_grid geohash', { query: { geo_grid: { location: { geohash: 'u17' } } } });
  roundTrip('geo_grid geotile + 忽略未定义', { query: { geo_grid: { location: { geotile: '8/23/11', ignore_unmapped: true } } } });
  roundTrip('shape envelope', { query: { shape: { area: { shape: { type: 'envelope', coordinates: [[13, 53], [14, 52]] }, relation: 'intersects' } } } });
  roundTrip('text_expansion 对象值', { query: { text_expansion: { content: { model_id: 'model-1', model_text: '债券利率' } } } });
  roundTrip('weighted_tokens 对象值', { query: { weighted_tokens: { vec: { tokens: { hello: 1, world: 2.5 } } } } });
  roundTrip('semantic named', { query: { semantic: { field: 'q', query: '债券利率' } } });
  roundTrip('sparse_vector query_vector', { query: { sparse_vector: { field: 'ml.tokens', query_vector: { 债: 2.1, 券: 1.3 } } } });
  roundTrip('sparse_vector inference 形态（field 缺席，参数原样）', { query: { sparse_vector: { inference_id: 'inf-1', query_vector: { a: 1 } } } });
  roundTrip('knn 查询级 named', { query: { knn: { field: 'v', query_vector: [0.1, 0.2, 0.3], k: 10, num_candidates: 100 } } });
  roundTrip('knn 带 filter', { query: { knn: { field: 'v', query_vector: [1], filter: { term: { status: 'active' } }, similarity: 0.9 } } });
  roundTrip('span_field_masking 包装', { query: { span_field_masking: { field: 't', query: { span_term: { t: 'x' } } } } });
  roundTrip('span_field_masking 嵌 span_near', { query: { span_field_masking: { field: 'desc', query: { span_near: { clauses: [{ span_term: { desc: 'a' } }], slop: 1 } } } } });
  it('span_field_masking parse 投影：路由字段 field + 子查询键 query', () => {
    const n = parseQueryNode({ span_field_masking: { field: 't', query: { span_term: { t: 'x' } } } }) as WrapNode;
    expect(n.type).toBe('wrap');
    expect(n.field).toBe('t');
    expect(n.childKey).toBe('query');
    expect(n.child && serQueryNode(n.child)).toEqual({ span_term: { t: 'x' } });
  });
});

describe('987 B线 顶层键一等解析', () => {
  roundTrip('post_filter 结构化（term）', { post_filter: { term: { status: 'active' } } });
  roundTrip('post_filter bool 组', { query: { match_all: {} }, post_filter: { bool: { must: [{ term: { a: 1 } }, { range: { n: { gte: 5 } } }] } } });
  roundTrip('collapse 结构化 + inner_hits', { collapse: { field: 'user', inner_hits: { name: 'top', size: 3 } } });
  roundTrip('collapse 仅字段', { collapse: { field: 'user' } });
  roundTrip('knn 顶层结构化', { knn: { field: 'v', query_vector: [0.1, 0.2], k: 5, num_candidates: 50 } });
  roundTrip('knn 缺 query_vector（builder 形态）', { knn: { field: 'v', query_vector_builder: { embedding: { model_id: 'm' } } } });
  roundTrip('knn + filter 数组', { knn: { field: 'v', query_vector: [1], k: 3, filter: [{ term: { a: 1 } }] } });
  it('post_filter parse 投影为 QueryNode（bool 可树编辑）', () => {
    const r = parseTree({ post_filter: { bool: { must: [{ term: { a: 1 } }] } } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.postFilter?.type).toBe('bool');
  });
  it('collapse parse 投影：field 提升为路由字段', () => {
    const r = parseTree({ collapse: { field: 'u', inner_hits: { size: 2 } } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.collapse?.field).toBe('u');
    expect(r.tree.collapse?.params).toEqual({ inner_hits: { size: 2 } });
  });
  it('knn parse 投影：query_vector presence 记忆（键缺席不写回）', () => {
    const r = parseTree({ knn: { field: 'v', query_vector_builder: { embedding: {} } } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.knn?.field).toBe('v');
    expect(r.tree.knn?.hasVector).toBe(false);
    expect(serializeTree(r.tree)).toEqual({ knn: { field: 'v', query_vector_builder: { embedding: {} } } });
  });
  it('畸形形态落 extras 不丢：collapse 数组 / knn 非对象 / knn field 非字符串', () => {
    const r = parseTree({ collapse: ['a'], knn: 'x' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.collapse).toBeNull();
    expect(r.tree.knn).toBeNull();
    expect(r.tree.extras.collapse).toEqual(['a']);
    expect(r.tree.extras.knn).toBe('x');
    expect(serializeTree(r.tree)).toEqual({ collapse: ['a'], knn: 'x' });
  });
  it('post_filter 非法结构走 __raw__ 叶无损往返', () => {
    const r = parseTree({ post_filter: 'raw-str' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.postFilter?.type).toBe('leaf');
    expect(serializeTree(r.tree)).toEqual({ post_filter: 'raw-str' });
  });
});

describe('987 工厂×序列化一致性（新算子全集）', () => {
  it('makeNodeByOp 每个新算子空节点可无损序列化且可再 parse', () => {
    const ops = ['geo_grid', 'shape', 'sparse_vector', 'text_expansion', 'weighted_tokens', 'semantic', 'knn', 'span_field_masking'];
    for (const op of ops) {
      const n = makeNodeByOp(op);
      const ser = serQueryNode(n) as Record<string, unknown>;
      expect(Object.keys(ser)[0], op).toBe(op);
      const re = parseQueryNode(ser);
      expect(serQueryNode(re)).toEqual(ser);
    }
  });
  it('新算子进 RICH_OPS 全集（ClauseNode 下拉可达）', () => {
    for (const op of ['geo_grid', 'shape', 'sparse_vector', 'text_expansion', 'weighted_tokens', 'semantic', 'knn']) {
      expect(RICH_OPS).toContain(op);
    }
  });
});
