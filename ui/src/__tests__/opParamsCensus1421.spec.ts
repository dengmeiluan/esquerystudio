/**
 * 一千四百二十一批：参数保真的**全量**扫描（1120/1152/1199 同族问题的收口）。
 *
 * 那三批各自修过一类「切换算子时参数被静默清空」：1152 补了 WRAP_PARAMS、1199 补了
 * MULTI_META.params。但每次都只补了当时发现的族——没有一条规格**遍历所有算子**，
 * 断言「schema 里声明的每个参数，填了之后都能活下来」。
 *
 * 这会真实伤用户：在构建器里调好 `slop: 3`、把算子从 match_phrase 切到 constant_score
 * 再切回来（很多人靠这个试效果），参数就没了。
 *
 * 判据：对每个算子，用它的完整 schema 造一份全参数对象，喂 paramsForOp(op, …)，
 * 结果必须包含 schema 全部键（_name 恒保留，作为对照）。
 */
import { describe, it, expect } from 'vitest';
import { OPS_META, WRAP_PARAMS, MULTI_META, paramsForOp } from '../utils/queryAstOps';

const SAMPLE: Record<string, unknown> = {
  text: 'x', number: 1, boolean: true, json: {}, enum: 'x',
};

function schemaKeys(op: string): string[] {
  return [
    ...(OPS_META[op]?.params || []).map(p => p.key),
    ...(WRAP_PARAMS[op] || []).map(p => p.key),
    ...(MULTI_META[op]?.params || []).map(p => p.key),
  ];
}

describe('1421 每个算子的声明参数都能活过 paramsForOp', () => {
  it('全量遍历：schema 声明的参数键一个都不能被清掉', () => {
    const bad: string[] = [];
    for (const op of OPS_META ? Object.keys(OPS_META) : []) {
      const keys = schemaKeys(op);
      if (!keys.length) continue;
      const input: Record<string, unknown> = { _name: 'n' };
      for (const p of (OPS_META[op]?.params || [])) input[p.key] = SAMPLE[p.kind] ?? 'x';
      for (const p of (WRAP_PARAMS[op] || [])) input[p.key] = SAMPLE[p.kind] ?? 'x';
      for (const p of (MULTI_META[op]?.params || [])) input[p.key] = SAMPLE[p.kind] ?? 'x';
      const out = paramsForOp(op, input);
      const lost = keys.filter(k => !(k in out));
      if (lost.length) bad.push(`${op} 丢了：${lost.join(',')}`);
      if (!('_name' in out)) bad.push(`${op} 丢了 _name`);
    }
    expect(bad, '参数被静默清空的算子：\n' + bad.join('\n')).toEqual([]);
  });

  it('容器族（wrap/multi）同样扫到——1152/1199 的族不再漏网', () => {
    const bad: string[] = [];
    const containers = [...Object.keys(WRAP_PARAMS), ...Object.keys(MULTI_META)];
    for (const op of containers) {
      const keys = schemaKeys(op);
      if (!keys.length) continue;
      const input: Record<string, unknown> = { _name: 'n' };
      for (const p of (WRAP_PARAMS[op] || [])) input[p.key] = SAMPLE[p.kind] ?? 'x';
      for (const p of (MULTI_META[op]?.params || [])) input[p.key] = SAMPLE[p.kind] ?? 'x';
      const out = paramsForOp(op, input);
      const lost = keys.filter(k => !(k in out));
      if (lost.length) bad.push(`${op} 丢了：${lost.join(',')}`);
    }
    expect(bad, '容器族丢参数：\n' + bad.join('\n')).toEqual([]);
    /* 覆盖率自证：这两个族确实有带 params 的成员，否则本用例空转 */
    const wrapWithParams = Object.keys(WRAP_PARAMS).length;
    const multiWithParams = Object.values(MULTI_META).filter(m => (m.params || []).length).length;
    expect(wrapWithParams, 'WRAP_PARAMS 成员数').toBeGreaterThan(3);
    expect(multiWithParams, 'MULTI_META 带 params 的成员数').toBeGreaterThan(0);
  });

  it('负控：不属于目标算子的参数必须被丢弃（证明不是「全保留」的恒真判据）', () => {
    /* term 没有 slop；从 match_phrase 切过来时 slop 必须被清掉，否则写出非法体 */
    const out = paramsForOp('term', { slop: 3, case_insensitive: true });
    expect(out).toEqual({ case_insensitive: true });
    expect(out).not.toHaveProperty('slop');
  });
});
