/**
 * 一千四百三十四批：顶层键「写入 → 解析 → 写回」全量普查（不常用语法的往返）。
 *
 * 用户目标是「所有 DSL 语法全支持，常用和非常用都要能双向渲染」。已有 1404 测的是一棵
 * 生产 DSL 的整树往返；本批逐键普查：**每个 ES search body 顶层键**单独写入、解析、写回，
 * 断言键没丢、值没变。
 *
 * 这能抓到一类特定缺陷：某键既不在结构化仓位、也不在 SEARCH_PARAM_KEYS，就会落 extras；
 * extras 虽然「零丢失」，但如果序列化时漏了 extras 的分支，用户切到构建树再切回来就丢了。
 */
import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree } from '../utils/queryAst';
import { SEARCH_PARAM_KEYS } from '../utils/queryBodyParams';

function stable(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

/* 每个顶层键配一个**语法合法**的取值 */
const TOP_LEVEL: Array<[string, any]> = [
  ['query', { match_all: {} }],
  ['post_filter', { term: { status: 'A' } }],
  ['sort', [{ publish_time: { order: 'desc' } }]],
  ['_source', { includes: ['title'] }],
  ['highlight', { fields: { title: {} } }],
  ['aggs', { a: { terms: { field: 'status', size: 5 } } }],
  ['aggregations', { a: { terms: { field: 'status', size: 5 } } }],
  ['collapse', { field: 'issuer_name' }],
  ['knn', { field: 'vec', query_vector: [1, 2], k: 10 }],
  ['suggest', { s: { text: 'x', term: { field: 'title' } } }],
  ['rescore', { window_size: 50, query: { rescore_query: { match_all: {} } } }],
  ['script_fields', { x: { script: { source: 'emit(1)' } } }],
  ['runtime_mappings', { day: { type: 'keyword', script: { source: 'emit("x")' } } }],
  ['retriever', { standard: { query: { match_all: {} } } }],
  ['from', 0],
  ['size', 20],
  ['track_total_hits', true],
  ['min_score', 0.5],
  ['terminate_after', 100],
  ['search_after', [1700000000000, 3]],
  ['pit', { id: 'abc', keep_alive: '1m' }],
  ['preference', '_local'],
  ['routing', 'r1'],
  ['timeout', '5s'],
  ['version', true],
  ['seq_no_primary_term', true],
  ['explain', false],
  ['profile', true],
  ['stored_fields', ['title']],
  ['docvalue_fields', ['status']],
  ['fields', [{ field: 'amount', format: '0.00' }]],
  ['track_scores', true],
  ['stats', ['status']],
  ['indices_boost', [{ 'idx-*': 1.5 }]],
  ['slice', { id: 0, max: 2 }],
  ['sub_searches', [{ query: { match_all: {} } }]],
  ['rank', { rrf: {} }],
  ['ext', { lrq: {} }],
];

describe('1434 顶层键写入-解析-写回普查', () => {
  it('每个顶层键单独往返：键不丢、值不变', () => {
    const bad: string[] = [];
    for (const [k, v] of TOP_LEVEL) {
      const dsl = { [k]: v };
      const r = parseTree(dsl);
      if (!r.ok) { bad.push(`${k}: 解析失败 ${r.reason}`); continue; }
      const back = serializeTree(r.tree);
      if (!(k in back)) { bad.push(`${k}: 写回丢键（structured=${JSON.stringify(Object.keys(back))}）`); continue; }
      if (stable(back[k]) !== stable(v)) bad.push(`${k}: 值变了 ${stable(back[k])} ≠ ${stable(v)}`);
    }
    expect(bad, '顶层键往返问题：\n' + bad.join('\n')).toEqual([]);
  });

  it('全部键混合往返：一个都不能丢（含 extras 兜底键）', () => {
    const all: Record<string, any> = {};
    /* aggs 与 aggregations 是 ES 的同义键，同一请求同时出现属畸形输入（ES 只认其一），
       不放进混合样本；两者各自的往返由上面逐键用例覆盖。 */
    for (const [k, v] of TOP_LEVEL) { if (k === 'aggregations') continue; all[k] = v; }
    const r = parseTree(all);
    expect(r.ok, r.ok ? '' : r.reason).toBe(true);
    if (!r.ok) return;
    const back = serializeTree(r.tree);
    const want = TOP_LEVEL.map(([k]) => k).filter(k => k !== 'aggregations');
    const lost = want.filter(k => !(k in back));
    expect(lost, '混合往返丢失的键：' + lost.join(',')).toEqual([]);
    const changed = TOP_LEVEL.filter(([k, v]) => k !== 'aggregations' && k in back && stable(back[k]) !== stable(v)).map(([k]) => k);
    expect(changed, '混合往返值变了的键：' + changed.join(',')).toEqual([]);
  });

  it('普查覆盖面自证：结构化键与参数键都被本批覆盖到', () => {
    /* 若 SEARCH_PARAM_KEYS 新增但本批没同步，这条会提醒补样本 */
    const covered = new Set(TOP_LEVEL.map(([k]) => k));
    const uncovered = [...SEARCH_PARAM_KEYS].filter(k => !covered.has(k));
    expect(uncovered, 'SEARCH_PARAM_KEYS 里有本批未覆盖的键：' + uncovered.join(',')).toEqual([]);
  });
});
