/**
 * 一千四百三十八批：高复杂度条件树的往返（用户「右侧 query 复杂度非常非常高」的直接场景）。
 *
 * 此前验证的最多 6 条条件。真实业务的 DSL 常见 20~50 个条件（多主体 + 多状态 + 多时间窗
 * + 多分类的组合过滤），而且嵌套深（bool 套 bool 套 nested）。本批用程序化构造的
 * 30 条件 × 3 层嵌套 DSL 验证 parse → ser 完整性。
 *
 * 判据：
 *  ① 30 条条件全部进树（节点数对得上，没有静默丢弃）；
 *  ② 写回与原 DSL 语义等价（键序无关、数组保序）；
 *  ③ 二次解析幂等；
 *  ④ 深层嵌套（bool→bool→nested→bool）不塌；
 *  ⑤ 单棵 200 节点的树解析不超时（用户「复杂度非常高」也要求交互不卡）。
 */
import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree } from '../utils/queryAst';

function stable(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

/* 30 条条件：term / terms / range / match / exists / prefix / wildcard 交替 */
function build30(): any {
  const must: any[] = [];
  for (let i = 0; i < 30; i++) {
    const k = i % 7;
    if (k === 0) must.push({ term: { [`kw_${i}`]: `v${i}` } });
    else if (k === 1) must.push({ terms: { [`tags_${i}`]: ['a', 'b'] } });
    else if (k === 2) must.push({ range: { [`n_${i}`]: { gte: i, lt: i + 10 } } });
    else if (k === 3) must.push({ match: { [`t_${i}`]: { query: `q${i}`, operator: 'and' } } });
    else if (k === 4) must.push({ exists: { field: `f_${i}` } });
    else if (k === 5) must.push({ prefix: { [`p_${i}`]: `pre${i}` } });
    else must.push({ wildcard: { [`w_${i}`]: `v*${i}` } });
  }
  return { query: { bool: { must, filter: [{ term: { status: 'ACTIVE' } }], must_not: [{ term: { deleted: true } }] } }, size: 50 };
}

const DEEP = {
  query: {
    bool: {
      must: [
        {
          bool: {
            should: [
              {
                nested: {
                  path: 'products',
                  query: {
                    bool: {
                      must: [
                        { term: { 'products.color': 'red' } },
                        { range: { 'products.price': { gte: 10 } } },
                      ],
                      must_not: [{ term: { 'products.discontinued': true } }],
                    },
                  },
                },
              },
              { match_phrase: { title: { query: 'deep nest', slop: 2 } } },
            ],
            minimum_should_match: 1,
          },
        },
      ],
    },
  },
};

function countNodes(n: any): number {
  if (!n) return 0;
  if (n.type === 'bool') return 1 + n.children.reduce((a: number, c: any) => a + countNodes(c.node), 0);
  if (n.type === 'wrap') return 1 + countNodes(n.child);
  if (n.type === 'multi') return 1 + n.children.reduce((a: number, c: any) => a + countNodes(c.node), 0);
  return 1;
}

describe('1438 高复杂度条件树往返', () => {
  it('① 30 条条件全部进树（一条都不能静默丢）', () => {
    const dsl = build30();
    const r = parseTree(dsl);
    expect(r.ok, r.ok ? '' : r.reason).toBe(true);
    if (!r.ok) return;
    /* must=30 + filter=1 + must_not=1 = 32 个叶子 + bool 根 = 33 */
    expect(countNodes(r.tree.root), '节点数应为 33').toBe(33);
  });

  it('② 写回与原 DSL 语义等价', () => {
    const dsl = build30();
    const r = parseTree(dsl);
    if (!r.ok) throw new Error(r.reason);
    expect(stable(serializeTree(r.tree))).toBe(stable(dsl));
  });

  it('③ 二次解析幂等', () => {
    const dsl = build30();
    const r1 = parseTree(dsl);
    if (!r1.ok) throw new Error(r1.reason);
    const back = serializeTree(r1.tree);
    const r2 = parseTree(back);
    if (!r2.ok) throw new Error(r2.reason);
    expect(stable(serializeTree(r2.tree))).toBe(stable(back));
  });

  it('④ 三层嵌套（bool→bool→nested→bool）不塌', () => {
    const r = parseTree(DEEP);
    expect(r.ok, r.ok ? '' : r.reason).toBe(true);
    if (!r.ok) return;
    expect(stable(serializeTree(r.tree))).toBe(stable(DEEP));
    /* nested 那一支必须仍是 wrap 节点、内部还有 bool */
    const json = JSON.stringify(serializeTree(r.tree));
    expect(json).toContain('"nested"');
    expect(json).toContain('products.discontinued');
    expect(json).toContain('"minimum_should_match":1');
  });

  it('⑤ 200 节点的树解析 + 写回在 200ms 内（交互不卡）', () => {
    const must: any[] = [];
    for (let i = 0; i < 200; i++) must.push({ term: { [`f_${i}`]: i } });
    const dsl = { query: { bool: { must } }, size: 10 };
    const t0 = performance.now();
    const r = parseTree(dsl);
    if (!r.ok) throw new Error(r.reason);
    const back = serializeTree(r.tree);
    const ms = performance.now() - t0;
    expect(stable(back)).toBe(stable(dsl));
    expect(ms, `解析+写回耗时 ${ms.toFixed(1)}ms`).toBeLessThan(200);
  });
});
