/* 1000 批：retriever 检索器一等化门禁（8.14+ 顶层检索面，query 的继任写法）。
   三条硬契约与 queryAstCorpus 同构：
   ① 每一个合法形态 serialize(parse(x)) 深等于 x（往返无损）；
   ② 六变体全结构化（standard 查询树 / knn 平面向量 / rrf·linear 子数组 / tsr·rule 单子），
     不落 extras 键值表；
   ③ 未注册变体/畸形体整键落 extras 零丢失（全树往返仍一致）。
   嵌套深、字面量括号易错——语料统一走 R/BM25 构造器（deep-equal 与字面量等价）。 */
import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree, emptyTree, parseRetriever, serRetriever, type RetrieverNode } from '../queryAst';
import { RETRIEVER_META, RETRIEVER_PARAMS } from '../queryAstOps';

const R = (op: string, body: Record<string, unknown>): Record<string, unknown> => ({ [op]: body });
const BM25 = (q: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> => R('standard', { query: q, ...extra });
const KNN = (o: Record<string, unknown>): Record<string, unknown> => R('knn', o);
const TSRR = (o: Record<string, unknown>): Record<string, unknown> => R('text_similarity_reranker', o);

const RETRIEVER_CORPUS: Array<[string, unknown]> = [
  /* ---- standard：内嵌完整查询树 ---- */
  ['standard', { retriever: BM25({ match_all: {} }) }],
  ['standard-bool', { retriever: BM25({ bool: { must: [{ term: { status: 'active' } }] } }, { k: 100 }) }],
  /* ---- knn：平面字段 + 向量 + 参数 ---- */
  ['knn', { retriever: KNN({ field: 'emb', query_vector: [0.1, 0.2], k: 10, num_candidates: 100 }) }],
  ['knn-min', { retriever: KNN({ field: 'emb', query_vector: [1] }) }],
  ['knn-no-vector', { retriever: KNN({ field: 'emb', k: 5 }) }],
  ['knn-similarity', { retriever: KNN({ field: 'emb', query_vector: [1], similarity: 0.9, boost: 0.4 }) }],
  /* ---- rrf：多路子检索器融合（递归） ---- */
  ['rrf', { retriever: R('rrf', { retrievers: [BM25({ match: { title: 'x' } }), KNN({ field: 'emb', query_vector: [0.5], k: 5 })] }) }],
  ['rrf-params', { retriever: R('rrf', { retrievers: [BM25({ match_all: {} })], rank_constant: 20, rank_window_size: 50 }) }],
  ['rrf-nested', { retriever: R('rrf', { retrievers: [R('rrf', { retrievers: [BM25({ match_all: {} })] })] }) }],
  /* ---- text_similarity_reranker：单子重排 ---- */
  ['tsr', { retriever: TSRR({ retriever: BM25({ match: { text: '公司政策' } }), field: 'semantic_text', inference_text: '年假政策', inference_id: '.rerank-v1' }) }],
  ['tsr-window', { retriever: TSRR({ retriever: KNN({ field: 'emb', query_vector: [0.2] }), field: 't', inference_text: 'q', rank_window_size: 10 }) }],
  /* ---- rule：规则路由（带回退子检索器） ---- */
  ['rule', { retriever: R('rule', { ruleset_id: 'my-rules', match_criteria: { release_branch: 'trunk' }, retriever: BM25({ match_all: {} }) }) }],
  ['rule-no-fallback', { retriever: R('rule', { ruleset_id: 'r1', match_criteria: { env: 'prod' } }) }],
  /* ---- linear：线性加权（每子项 weight 包裹） ---- */
  ['linear', { retriever: R('linear', { retrievers: [{ retriever: BM25({ match: { a: 'x' } }), weight: 0.7 }, { retriever: KNN({ field: 'emb', query_vector: [1] }), weight: 0.3 }], normalizer: 'minmax' }) }],
  ['linear-no-weight', { retriever: R('linear', { retrievers: [{ retriever: BM25({ match_all: {} }) }] }) }],
  /* ---- 1047：官方高级检索器三员 ---- */
  ['pinned-docs', { retriever: R('pinned', { docs: [{ _id: 'doc1', _index: 'my-index' }, { _id: 'doc2' }], retriever: BM25({ match: { title: 'x' } }) }) }],
  ['pinned-ids', { retriever: R('pinned', { ids: ['1', '2'], retriever: KNN({ field: 'emb', query_vector: [1] }) }) }],
  ['diversify-mmr', { retriever: R('diversify', { type: 'mmr', field: 'emb', lambda: 0.7, size: 3, query_vector: [0.1, 0.2, 0.3], retriever: BM25({ match_all: {} }) }) }],
  ['rescorer', { retriever: R('rescorer', { rescore: { window_size: 50, query: { rescore_query: { match_all: {} } } }, retriever: BM25({ match_all: {} }) }) }],
  /* ---- 深嵌套组合（rrf 外壳 → linear → tsr → standard） ---- */
  ['deep', { retriever: R('rrf', { retrievers: [
    R('linear', { retrievers: [{ retriever: BM25({ match_all: {} }), weight: 1 }] }),
    TSRR({ retriever: BM25({ match_all: {} }), field: 'f', inference_text: 't' }),
  ] }) }],
];

const rtTree = (dsl: Record<string, unknown>) => {
  const r = parseTree(dsl);
  if (!r.ok) throw new Error(r.reason);
  return serializeTree(r.tree);
};

describe('1000 retriever 全量语料往返无损', () => {
  it.each(RETRIEVER_CORPUS)('%s 往返一致', (_name, dsl) => {
    expect(rtTree(dsl as Record<string, unknown>)).toEqual(dsl);
  });
});

describe('1000 retriever 结构化覆盖', () => {
  it('九变体全部结构化（不落 extras）', () => {
    for (const [, dsl] of RETRIEVER_CORPUS) {
      const r = parseTree(dsl as Record<string, unknown>);
      if (!r.ok) throw new Error(r.reason);
      expect(r.tree.retriever, JSON.stringify(dsl)).not.toBeNull();
      expect(r.tree.extras, JSON.stringify(dsl)).toEqual({});
    }
  });
  it('九变体注册表齐员', () => {
    expect(new Set(Object.keys(RETRIEVER_META))).toEqual(new Set(
      ['standard', 'knn', 'rrf', 'text_similarity_reranker', 'rule', 'linear', 'pinned', 'diversify', 'rescorer']));
  });
  it('knn 向量在节点结构面（value），不埋参数表', () => {
    const r = parseTree({ retriever: KNN({ field: 'emb', query_vector: [1, 2], k: 3 }) });
    if (!r.ok) throw new Error(r.reason);
    expect(r.tree.retriever!.field).toBe('emb');
    expect(r.tree.retriever!.value).toEqual([1, 2]);
    expect(r.tree.retriever!.params).toEqual({ k: 3 });
  });
  it('pinned：docs/ids 结构体留在 params，召回源是真 RetrieverNode', () => {
    const r = parseTree({ retriever: R('pinned', { ids: ['1'], docs: [{ _id: 'd1' }], retriever: BM25({ match_all: {} }) }) });
    if (!r.ok) throw new Error(r.reason);
    const n = r.tree.retriever!;
    expect(n.op).toBe('pinned');
    expect(n.params.ids).toEqual(['1']);
    expect(n.params.docs).toEqual([{ _id: 'd1' }]);
    expect(n.child?.op).toBe('standard');
    expect(n.child?.query?.type).toBe('leaf');
  });
  it('diversify / rescorer 结构体留存 params 且子源结构化', () => {
    const d = parseTree({ retriever: R('diversify', { type: 'mmr', field: 'emb', lambda: 0.4, size: 2, query_vector: [1], retriever: BM25({ match_all: {} }) }) });
    if (!d.ok) throw new Error(d.reason);
    expect(d.tree.retriever!.field).toBe('emb');
    expect(d.tree.retriever!.params).toEqual({ type: 'mmr', lambda: 0.4, size: 2, query_vector: [1] });
    const rs = parseTree({ retriever: R('rescorer', { rescore: { window_size: 10 }, retriever: BM25({ match_all: {} }) }) });
    if (!rs.ok) throw new Error(rs.reason);
    expect(rs.tree.retriever!.params.rescore).toEqual({ window_size: 10 });
  });
  it('linear 每子项伴随键（weight）结构化保留', () => {
    const r = parseTree(RETRIEVER_CORPUS.find(([n]) => n === 'linear')![1] as Record<string, unknown>);
    if (!r.ok) throw new Error(r.reason);
    const lin = r.tree.retriever!;
    expect(lin.children).toHaveLength(2);
    const w = Object.values(lin.childKeys || {}).map(x => (x as Record<string, unknown>).weight);
    expect(w).toEqual([0.7, 0.3]);
  });
  it('standard 查询体是真 QueryNode 树（bool 结构化非 raw）', () => {
    const r = parseTree({ retriever: BM25({ bool: { must: [{ term: { a: 1 } }] } }) });
    if (!r.ok) throw new Error(r.reason);
    expect(r.tree.retriever!.query!.type).toBe('bool');
  });
  it('1047 工厂：pinned/diversify/rescorer 新建即带 standard 召回源，rule 保持空', async () => {
    const { makeRetrieverByOp } = await import('../queryAst');
    for (const op of ['pinned', 'diversify', 'rescorer']) {
      const n = makeRetrieverByOp(op);
      expect(n.child?.op, op + ' 应有可用召回源').toBe('standard');
    }
    expect(makeRetrieverByOp('rule').child).toBeNull();
    expect(makeRetrieverByOp('standard').query?.type).toBe('leaf');
  });
  it('parseRetriever/serRetriever 节点级 API 对外可用', () => {
    const n = parseRetriever(R('rrf', { retrievers: [BM25({ match_all: {} })] }));
    expect(n).not.toBeNull();
    expect(serRetriever(n as RetrieverNode)).toEqual(R('rrf', { retrievers: [BM25({ match_all: {} })] }));
  });
});

describe('1000 retriever 畸形与未注册零丢失', () => {
  const BAD: Array<[string, unknown]> = [
    ['unknown-variant', { retriever: R('ml_model', { model_id: 'x' }) }],
    ['not-object', { retriever: 42 }],
    ['multi-variant-body', { retriever: { ...BM25({ match_all: {} }), ...KNN({ field: 'e', query_vector: [1] }) } }],
    ['standard-no-query', { retriever: R('standard', { k: 10 }) }],
    ['rrf-bad-child', { retriever: R('rrf', { retrievers: [BM25({ match_all: {} }), 42] }) }],
    ['rrf-no-list', { retriever: R('rrf', { rank_constant: 1 }) }],
    ['linear-bad-item', { retriever: R('linear', { retrievers: [{ weight: 1 }] }) }],
    /* 1047：必填召回源缺席的三变体整键落 extras（rule 是唯一可独立路由的 child） */
    ['pinned-no-source', { retriever: R('pinned', { ids: ['1'] }) }],
    ['diversify-no-source', { retriever: R('diversify', { type: 'mmr', field: 'emb' }) }],
    ['rescorer-no-source', { retriever: R('rescorer', { rescore: { window_size: 10 } }) }],
  ];
  it.each(BAD)('%s 整键落 extras，全树往返一致', (_name, dsl) => {
    const r = parseTree(dsl as Record<string, unknown>);
    if (!r.ok) throw new Error(r.reason);
    expect(r.tree.retriever).toBeNull();
    expect(r.tree.extras.retriever).toEqual((dsl as Record<string, unknown>).retriever);
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
  it('emptyTree 默认无键（消费方 undefined 防护）', () => {
    const t = emptyTree();
    expect(t.retriever).toBeNull();
    expect(serializeTree(t)).toEqual({});
  });
});

describe('1000 retriever 参数 schema', () => {
  it('各变体常用参数在册（enum/number 档驱动下拉）', () => {
    const keys = (op: string) => (RETRIEVER_PARAMS[op] || []).map(p => p.key);
    expect(keys('knn')).toEqual(expect.arrayContaining(['k', 'num_candidates', 'similarity']));
    expect(keys('rrf')).toEqual(expect.arrayContaining(['rank_constant', 'rank_window_size']));
    expect(keys('text_similarity_reranker')).toEqual(expect.arrayContaining(['inference_text', 'inference_id', 'rank_window_size']));
    expect(keys('rule')).toContain('ruleset_id');
    expect(keys('linear')).toContain('normalizer');
    expect(keys('standard')).toContain('k');
    expect(keys('diversify')).toEqual(expect.arrayContaining(['type', 'lambda', 'size']));
  });
});
