import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { paramsForOp } from '../utils/queryAstOps';
import { makeNodeByOp } from '../utils/queryAst';

/* 1120：换算子参数清洗 + distance_feature 可跑默认。
 旧实现 params 全量带到新算子（match 的 operator 切到 term=非法体）；现按新算子
 schema + _name 白名单保留，distance_feature 必填 origin 缺省 now、pivot 缺省 7d。 */
const clause = readFileSync(join(__dirname, '../components/builder/ClauseNode.vue'), 'utf-8');

describe('1120 换算子参数清洗与 distance_feature 默认', () => {
  it('不属于新算子 schema 的旧参数被丢弃，_name 保留', () => {
    expect(paramsForOp('term', { operator: 'and', fuzziness: 'AUTO', boost: 2, _name: 'n' }))
      .toEqual({ boost: 2, _name: 'n' });
    expect(paramsForOp('match', { operator: 'and', analyzer: 'standard', foo: 1 }))
      .toEqual({ operator: 'and', analyzer: 'standard' });
    expect(paramsForOp('term', { case_insensitive: true, analyzer: 'x' }))
      .toEqual({ case_insensitive: true });
  });

  it('distance_feature 缺 origin 补 now，已有 origin 不覆盖', () => {
    expect(paramsForOp('distance_feature', { boost: 3 })).toEqual({ boost: 3, origin: 'now' });
    expect(paramsForOp('distance_feature', { origin: '2024-01-01' })).toEqual({ origin: '2024-01-01' });
  });

  it('1152：wrap 族参数表（WRAP_PARAMS）同样参与白名单——不误删合法容器参数', () => {
    /* 只查 OPS_META 时这些参数会被当「旧算子参数」静默丢掉：nested 丢 score_mode/inner_hits、
       function_score 丢 boost/boost_mode、script_score 丢 min_score —— 切一下算子就白配。 */
    expect(paramsForOp('nested', { score_mode: 'avg', inner_hits: { size: 2 }, bogus: 1 }))
      .toEqual({ score_mode: 'avg', inner_hits: { size: 2 } });
    expect(paramsForOp('function_score', { boost: 2, boost_mode: 'sum', nope: 1 }))
      .toEqual({ boost: 2, boost_mode: 'sum' });
    expect(paramsForOp('script_score', { min_score: 0.5, nope: 1 })).toEqual({ min_score: 0.5 });
  });

  it('节点工厂给 origin/pivot 可跑默认', () => {
    const n: any = makeNodeByOp('distance_feature');
    expect(n.op).toBe('distance_feature');
    expect(n.value).toBe('7d');
    expect(n.params).toEqual({ origin: 'now' });
  });

  it('构建器接线：切算子走 paramsForOp，distance_feature 值重置为 7d', () => {
    expect(clause).toContain('params: same ? props.node.params : paramsForOp(op, props.node.params)');
    expect(clause).toContain("const value = !same && op === 'distance_feature' ? '7d' : nv.value;");
    expect(clause).toContain('「特征距离」默认 origin=now / pivot=7d');
  });
});
