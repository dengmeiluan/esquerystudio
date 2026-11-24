/**
 * 1199：换算子时的参数清洗必须覆盖 MULTI_META（多容器族）。
 *
 * 1120 立了「旧算子参数不属于新算子 schema 即丢弃」的清洗规则，1152 补了 WRAP_PARAMS
 * （nested/has_child/function_score/script_score…）。但**多容器族没有 OPS_META 条目**——
 * boosting / dis_max / span_near / span_or / span_not 的参数表在 MULTI_META.params：
 *   - span_near  { slop, in_order }
 *   - dis_max    { tie_breaker, boost }
 *   - boosting   { negative_boost, boost }
 *   - span_not   { dist, pre, post }
 * 只查两张表的结果是：用户刚把这些参数配好，一切换算子（哪怕是切到同一个族的兄弟算子）
 * 参数就被当成「旧算子参数」静默清空——界面上参数框直接消失，等于「自己支持的 schema
 * 自己又抹掉」。这与 1152 修的是同一 bug 家族的第二例。
 *
 * 锁：① 三族各举一例，合法参数必须保留、非法参数必须丢弃（清洗仍然生效，不是全放行）；
 *     ② 反向：新算子 schema 里确实没有的参数（span_or 无 params）仍要被清掉；
 *     ③ 负控：把 MULTI_META 从白名单里去掉（回到 1152 状态）→ ① 三条必须全红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { paramsForOp, MULTI_META, OPS_META } from '../utils/queryAstOps';

const src = readFileSync(join(__dirname, '../utils/queryAstOps.ts'), 'utf-8');

describe('1199 换算子参数清洗覆盖多容器族', () => {
  it('span_near 保留 slop / in_order，丢弃未知键', () => {
    expect(paramsForOp('span_near', { slop: 2, in_order: true, junk: 1 }))
      .toEqual({ slop: 2, in_order: true });
  });

  it('dis_max 保留 tie_breaker / boost', () => {
    expect(paramsForOp('dis_max', { tie_breaker: 0.3, boost: 2, nope: 1 }))
      .toEqual({ tie_breaker: 0.3, boost: 2 });
  });

  it('boosting 保留 negative_boost', () => {
    expect(paramsForOp('boosting', { negative_boost: 0.2 })).toEqual({ negative_boost: 0.2 });
  });

  it('span_not 保留 dist / pre / post', () => {
    expect(paramsForOp('span_not', { dist: 1, pre: 2, post: 3, zzz: 9 }))
      .toEqual({ dist: 1, pre: 2, post: 3 });
  });

  it('反向：新算子没有 params 时旧参数仍被清掉（清洗没被放行成 no-op）', () => {
    expect(paramsForOp('span_or', { slop: 2 })).toEqual({});
    expect(paramsForOp('match_none', { tie_breaker: 0.3 })).toEqual({});
  });

  it('白名单确实读 MULTI_META（源码锚；负控靠这条判断修复是否被回退）', () => {
    expect(src).toContain('...(MULTI_META[op]?.params || []).map(p => p.key)');
  });

  it('每个 MULTI_META 带 params 的算子都能保住自己声明的每一个键', () => {
    for (const [op, meta] of Object.entries(MULTI_META)) {
      const declared = (meta.params || []).map(p => p.key);
      if (!declared.length) continue;
      const seed = Object.fromEntries(declared.map(k => [k, 'v']));
      expect(paramsForOp(op, seed), `${op} 的声明参数被清空`).toEqual(seed);
    }
  });

  it('OPS_META 侧同名规则（防止将来只改一边）', () => {
    for (const [op, meta] of Object.entries(OPS_META)) {
      const declared = (meta.params || []).map(p => p.key);
      if (!declared.length) continue;
      const seed = Object.fromEntries(declared.map(k => [k, 'v']));
      expect(paramsForOp(op, seed), `${op} 的声明参数被清空`).toEqual(seed);
    }
  });
});
