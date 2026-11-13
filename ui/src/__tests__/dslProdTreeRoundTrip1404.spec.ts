/**
 * 一千四百零四批：生产型「整树混排」往返（不是逐个算子）。
 *
 * 1378/1201 已逐算子锁参数保真，1131/1181 锁官方骨架进树。缺的是**一棵同时含
 * bool 四分区 + nested + multi_match + post_filter + sort + _source + highlight +
 * aggs(多级) + collapse + track_total_hits + min_score** 的真实查询树——真实业务的
 * DSL 从来不是一个算子，而是这些混排。只要其中任一顶层键在往返中丢失或被降级成
 * raw，用户切到构建树再切回来就会丢配置。
 *
 * 判据：往返后 **语义等价**（对象键序无关，数组保序），且每个顶层键都进了结构化
 * 仓位（不是 extras 兜底）——后者用 parseTree 的字段是否存在来判。
 */
import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree } from '../utils/queryAst';

/* 键序无关的稳定序列化（数组保序，因为 ES 里数组顺序有语义） */
function stable(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

const PROD_DSL = {
  query: {
    bool: {
      must: [
        { multi_match: { query: '研报 主体', fields: ['title^3', 'content'], type: 'best_fields', minimum_should_match: '70%' } },
        { nested: { path: 'products', query: { bool: { must: [{ term: { 'products.color': 'red' } }, { range: { 'products.price': { gte: 10, lte: 99 } } }] } }, score_mode: 'avg', inner_hits: {} } },
      ],
      filter: [{ terms: { status: ['ACTIVE', 'OPEN'] } }, { exists: { field: 'issuer_name' } }],
      should: [{ match_phrase: { title: { query: '债券 公告', slop: 3 } } }],
      must_not: [{ term: { deleted: true } }],
      minimum_should_match: 0,
      boost: 1.5,
    },
  },
  post_filter: { term: { status: 'ACTIVE' } },
  sort: [{ publish_date: { order: 'desc' } }, { _score: { order: 'desc' } }],
  size: 20,
  from: 0,
  _source: { includes: ['title', 'issuer_name', 'publish_date'], excludes: ['content'] },
  highlight: { pre_tags: ['<em>'], post_tags: ['</em>'], fields: { title: {}, content: { number_of_fragments: 2 } } },
  aggs: { by_status: { terms: { field: 'status', size: 10 }, aggs: { avg_amount: { avg: { field: 'amount' } } } } },
  collapse: { field: 'issuer_name' },
  track_total_hits: true,
  min_score: 0.5,
};

describe('1404 生产型整树往返', () => {
  const r = parseTree(PROD_DSL);
  /* 判别联合：ok=false 分支没有 tree，窄化后取用（直接 r.tree! 过不了 vue-tsc） */
  const tree = r.ok ? r.tree : null;
  const back = tree ? serializeTree(tree) : null;

  it('解析成功且顶层键全部进结构化仓位（不是 extras 兜底）', () => {
    expect(r.ok, r.ok ? '' : r.reason).toBe(true);
    if (!tree) throw new Error('解析失败：' + (r.ok ? '' : r.reason));
    expect(tree.root, 'query 进了树根').toBeTruthy();
    expect(tree.postFilter, 'post_filter 结构化').toBeTruthy();
    expect(tree.sort?.length, 'sort 两个键').toBe(2);
    expect(tree.source, '_source 结构化').toBeTruthy();
    expect(tree.highlight, 'highlight 结构化').toBeTruthy();
    expect(tree.aggs, 'aggs 结构化').toBeTruthy();
    expect(tree.collapse, 'collapse 结构化').toBeTruthy();
    expect(tree.size).toBe(20);
    expect(tree.from).toBe(0);
    expect(tree.searchParams?.track_total_hits, 'track_total_hits 进参数舱').toBe(true);
    expect(tree.searchParams?.min_score, 'min_score 进参数舱').toBe(0.5);
    expect(Object.keys(tree.extras).length, '不应有任何键落 extras：' + Object.keys(tree.extras).join(',')).toBe(0);
  });

  it('往返语义等价（键序无关，数组保序）', () => {
    expect(stable(back)).toBe(stable(PROD_DSL));
  });

  it('复合嵌套没有丢失：multi_match 参数 / nested 的 score_mode+inner_hits / bool 四分区', () => {
    const s = JSON.stringify(back);
    for (const key of ['multi_match', 'minimum_should_match', 'fields', 'nested', 'products.color', 'products.price',
      'score_mode', 'inner_hits', 'filter', 'should', 'must_not', 'match_phrase', 'slop',
      'post_filter', 'highlight', 'number_of_fragments', 'aggs', 'avg', 'collapse', 'track_total_hits', 'min_score']) {
      expect(s, '往返后丢了 ' + key).toContain(key);
    }
    /* 负控：把 bool 的 must_not 删掉，上面的断言集合必须能发现 */
    const broken = JSON.parse(JSON.stringify(PROD_DSL));
    delete broken.query.bool.must_not;
    const rb = parseTree(broken);
    if (!rb.ok) throw new Error('负控样例解析失败');
    const bk = stable(serializeTree(rb.tree));
    expect(bk).not.toBe(stable(PROD_DSL));
    expect(bk).not.toContain('must_not');
  });

  it('再解析一次仍等价（幂等，不会被二次序列化改写）', () => {
    const again = parseTree(back);
    if (!again.ok) throw new Error('二次解析失败：' + again.reason);
    expect(stable(serializeTree(again.tree))).toBe(stable(back));
  });
});
