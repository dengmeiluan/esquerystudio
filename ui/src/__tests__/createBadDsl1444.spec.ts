/**
 * 一千四百四十四批：「创建即坏 DSL」全量扫描。
 *
 * 1420（match_none→match_all）、1443（script/wrapper 空主值）都是同一类缺陷：
 * 在构建器里点一下新建，产出的 DSL 本身就有问题。这类缺陷的判据可以自动收口——
 * 把 `makeNodeByOp` 造出的每个节点写回成 body，喂给 `lintDsl`：
 * **只要报出 severity='error' 的 finding，就说明这个算子的创建初值是不可用的**。
 *
 * 注意排除两类：
 *  · 结构性告警（match-all 全量扫描）——那是性能提示，不是 DSL 错误；
 *  · 需要 mapping ctx 才能判的规则——这里故意传 ctx，让类型错配类规则也参与。
 */
import { describe, it, expect } from 'vitest';
import { makeNodeByOp, serQueryNode } from '../utils/queryAst';
import { RICH_OPS, WRAP_LABELS, MULTI_LABELS } from '../utils/queryAstOps';
import { lintDsl } from '../utils/dslLint';

/* 给一份“全类型”mapping，让类型相关规则也参与判定 */
const CTX = {
  fields: [
    { path: 'kw', type: 'keyword' }, { path: 'txt', type: 'text' },
    { path: 'num', type: 'long' }, { path: 'dec', type: 'double' },
    { path: 'dt', type: 'date' }, { path: 'flag', type: 'boolean' },
    { path: 'ipf', type: 'ip' }, { path: 'geo', type: 'geo_point' },
    { path: 'vec', type: 'dense_vector' }, { path: 'rk', type: 'rank_feature' },
    { path: 'col', type: 'keyword' }, { path: 'content', type: 'text' },
  ],
};

describe('1444 创建即坏 DSL 全量扫描', () => {
  const ops = [...RICH_OPS, ...Object.keys(WRAP_LABELS), ...Object.keys(MULTI_LABELS)];

  it('每个算子新建后写回的 body 不得有 error 级 finding', () => {
    const bad: string[] = [];
    for (const op of [...new Set(ops)]) {
      let body: any;
      const n = makeNodeByOp(op);
      try { body = serQueryNode(n); } catch (e: any) { bad.push(`${op}：写回抛错 ${e?.message}`); continue; }
      const f = lintDsl({ query: body }, CTX).filter(x => x.severity === 'error');
      if (f.length) {
        bad.push(`${op} → ${JSON.stringify(body).slice(0, 90)} :: ${f.map(x => x.rule + '(' + x.message.slice(0, 36) + ')').join('; ')}`);
      }
    }
    expect(bad, '新建即坏的算子：\n' + bad.join('\n')).toEqual([]);
  });

  it('负控：手工构造的坏 DSL 必须被 error 级抓到（证明扫描不是全绿空转）', () => {
    const cases: Array<[string, any]> = [
      ['nested 缺 path', { query: { nested: { query: { match_all: {} } } } }],
      ['root 裸子句', { match: { kw: 'x' } }],
      ['from 非数字', { query: { match_all: {} }, from: 'abc' }],
      ['query 是标量', { query: 'not-an-object' }],
    ];
    const missed = cases.filter(([, dsl]) => !lintDsl(dsl, CTX).some(f => f.severity === 'error')).map(([l]) => l);
    expect(missed, '负控未被抓到：' + missed.join(',')).toEqual([]);
  });

  it('扫描覆盖面自证：至少覆盖 40 个算子', () => {
    expect([...new Set(ops)].length).toBeGreaterThanOrEqual(40);
  });
});
