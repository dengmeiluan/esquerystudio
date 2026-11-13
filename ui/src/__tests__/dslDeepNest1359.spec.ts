/**
 * 一千三百五十九批：**深层嵌套**的 parse→serialize 往返巡检（现有巡检只覆盖单算子形态）。
 *
 * 为什么需要这一条：1143 / 1181 两批的巡检都是「一个算子、一层结构」——把每个算子单独喂进去
 * 看是否漂移。但生产库里真实的 query 从来不是这样：一次主体检索动辄 6~8 层
 * （`function_score` 里套 `bool`，`bool.must` 里套 `nested`，`nested` 里再套 `bool` +
 * `has_child`，同级还挂着 `filter` 与 `must_not`）。单算子对得上，**不代表组合起来也对得上**：
 * 子树搬运、wrap 容器的 childKey 选择、bool 的单元素 arrForm 收敛，都只在多层时才暴露。
 *
 * 做法：用固定种子的伪随机**递归生成**合法查询树（深度 4~5），把生成结果当 DSL 喂给
 * parse→serialize，断言写回与输入同构（键序无关）。种子固定 → 失败可复现。
 *
 * 本 spec 锁：
 *  ① 深度 ≥4 的组合树，往返后结构等价（键序无关）；
 *  ② 兄弟键不被吞（bool 里 must + filter + must_not 并存，三区都还在）；
 *  ③ wrap 容器的 childKey 不被改写（nested→query / has_child→query / constant_score→filter）；
 *  ④ 负控：把 serQueryNode 的某个分区漏写（模拟真实降级） → ① 必须红。
 */
import { describe, it, expect } from 'vitest';
import { parseQueryNode, serQueryNode, type QueryNode } from '../utils/queryAst';

/* —— 确定性伪随机（mulberry32）：种子固定，失败可原样复现 —— */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 键序无关的稳定序列化（数组保序——数组顺序在 ES 里有语义） */
function stable(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

const FIELDS = ['title', 'status', 'amount', 'publish_date', 'issuer.name'];
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length];

const LEAVES: Array<(r: () => number) => unknown> = [
  r => ({ term: { [pick(r, FIELDS)]: 'v' + Math.floor(r() * 9) } }),
  r => ({ terms: { [pick(r, FIELDS)]: ['a', 'b'] } }),
  r => ({ match: { [pick(r, FIELDS)]: 'hello world' } }),
  r => ({ match_phrase: { [pick(r, FIELDS)]: 'a b' } }),
  r => ({ range: { amount: { gte: 1, lte: 99 } } }),
  r => ({ exists: { field: pick(r, FIELDS) } }),
  r => ({ wildcard: { [pick(r, FIELDS)]: 'pre*' } }),
  r => ({ prefix: { [pick(r, FIELDS)]: 'ab' } }),
  r => ({ ids: { values: ['1', '2'] } }),
  r => ({ match_all: {} }),
];

/** 递归生成：深度 d 处的节点 */
function gen(r: () => number, d: number): unknown {
  if (d <= 0) return pick(r, LEAVES)(r);
  const kind = r();
  if (kind < 0.45) {
    /* bool：2~3 个分区，每区 1~2 个子句（含 must_not 并存） */
    const out: Record<string, unknown> = {};
    const occ = ['must', 'filter', 'should', 'must_not'].filter(() => r() < 0.55);
    if (!occ.length) occ.push('must');
    for (const o of occ) {
      const n = r() < 0.3 ? 2 : 1;
      const kids = Array.from({ length: n }, () => gen(r, d - 1));
      out[o] = n === 1 ? kids[0] : kids;
    }
    if (r() < 0.3) out.minimum_should_match = 1;
    return { bool: out };
  }
  if (kind < 0.6) {
    /* function_score：query + 1~2 个 functions（含 filter） */
    const fns = Array.from({ length: r() < 0.5 ? 1 : 2 }, () => {
      const fn: Record<string, unknown> = { weight: Math.floor(r() * 5) + 1 };
      if (r() < 0.5) fn.filter = gen(r, d - 1);
      return fn;
    });
    return { function_score: { query: gen(r, d - 1), functions: fns, score_mode: 'sum', boost_mode: 'multiply' } };
  }
  if (kind < 0.7) {
    return { nested: { path: 'issuer', query: gen(r, d - 1), score_mode: 'avg' } };
  }
  if (kind < 0.78) {
    return { constant_score: { filter: gen(r, d - 1), boost: 2 } };
  }
  if (kind < 0.86) {
    return { boosting: { positive: gen(r, d - 1), negative: gen(r, d - 1), negative_boost: 0.5 } };
  }
  if (kind < 0.93) {
    return { dis_max: { queries: [gen(r, d - 1), gen(r, d - 1)], tie_breaker: 0.3 } };
  }
  return { has_child: { type: 'comment', query: gen(r, d - 1), score_mode: 'max' } };
}

const rt = (q: unknown) => serQueryNode(parseQueryNode(q));

describe('1359 深层嵌套往返', () => {
  it('① 40 棵深度 6~8 的组合树，往返同构（键序无关）', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed * 7919);
      const q = gen(r, 6 + (seed % 3));
      const back = rt(q);
      expect(stable(back), `seed=${seed} 往返漂移\n输入: ${JSON.stringify(q)}`).toBe(stable(q));
    }
  });

  it('② bool 三分区并存时兄弟键不被吞', () => {
    const q = {
      bool: {
        must: [{ term: { status: 'ACTIVE' } }],
        filter: [{ range: { amount: { gte: 10 } } }],
        must_not: [{ term: { title: 'x' } }],
        should: [{ match: { title: 'y' } }],
      },
    };
    const back: any = rt(q);
    expect(back.bool.must, 'must 必须还在').toBeTruthy();
    expect(back.bool.filter, 'filter 必须还在').toBeTruthy();
    expect(back.bool.must_not, 'must_not 必须还在').toBeTruthy();
    expect(back.bool.should, 'should 必须还在').toBeTruthy();
    expect(stable(back)).toBe(stable(q));
  });

  it('③ wrap 容器的 childKey 不被改写', () => {
    const cases: Array<[string, unknown]> = [
      ['nested', { nested: { path: 'issuer', query: { term: { 'issuer.name': 'x' } } } }],
      ['has_child', { has_child: { type: 'comment', query: { match_all: {} } } }],
      ['has_parent', { has_parent: { parent_type: 'doc', query: { match_all: {} } } }],
      ['constant_score', { constant_score: { filter: { term: { status: 'A' } } } }],
      ['function_score', { function_score: { query: { match_all: {} }, weight: 2 } }],
    ];
    for (const [name, q] of cases) {
      const back: any = rt(q);
      const body = back[name];
      expect(body, `${name} 外壳必须还在`).toBeTruthy();
      const childKey = name === 'nested' || name === 'has_child' || name === 'has_parent' ? 'query'
        : name === 'constant_score' ? 'filter' : 'query';
      expect(Object.keys(body), `${name} 的 childKey 必须仍是 ${childKey}`).toContain(childKey);
    }
  });

  it('④ 负控：漏写 must_not 分区 → ① 会漂移（判据不是恒真）', () => {
    const q = { bool: { must: { term: { a: '1' } }, must_not: { term: { b: '2' } } } };
    const back: any = rt(q);
    /* 正式实现两个分区都在 */
    expect(Object.keys(back.bool).sort()).toEqual(['must', 'must_not']);
    /* 模拟降级：只有 must —— 这种写回必须被判不合格 */
    const degraded = { bool: { must: { term: { a: '1' } } } };
    expect(stable(degraded)).not.toBe(stable(q));
  });
});
