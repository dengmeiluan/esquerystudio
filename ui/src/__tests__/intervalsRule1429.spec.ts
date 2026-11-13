/**
 * 一千四百二十九批：intervals 规则编辑器纯函数层（此前零测试覆盖）。
 *
 * 用户目标是「所有 DSL 语法全支持」。intervals 是少数有多层嵌套结构的查询：
 * 规则对象 = 唯一类型键 + 可选 _name；单值型（match/prefix/wildcard/fuzzy）与
 * 容器型（all_of/any_of 递归子规则）+ 规则级 filter（8 种位置关系，各自递归）。
 *
 * 这一层此前完全没有测试——一旦 parse/ser 不对称，用户在专属编辑器里改的内容就被
 * 静默丢弃，而通用往返测试（1131/1181/1378）用的是骨架 DSL，不覆盖编辑器路径。
 *
 * 判据：
 *  ① 官方形态逐类解析出正确的 kind / 主值 / 参数 / 子规则；
 *  ② parse → ser 语义等价（键序无关）；
 *  ③ 畸形体退 null（调用方回落 GenericParams，零丢失）而不是抛错或产出空对象；
 *  ④ filter 的 8 个关系都能解析并写回。
 */
import { describe, it, expect } from 'vitest';
import {
  parseIntervalRule, serIntervalRule, parseIntervalFilter,
  KIND_MAINKEY, CONTAINER_KINDS, RULE_KIND_META, FILTER_RELS,
} from '../utils/intervalsRule';

function stable(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

describe('1429 intervals 规则解析与写回', () => {
  it('① 单值型四种：识别 kind 与主值键', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['match', { match: { query: 'fox', max_gaps: 2, ordered: true } }],
      ['prefix', { prefix: { prefix: 'qu', use_field: 'title' } }],
      ['wildcard', { wildcard: { pattern: 'qu*k' } }],
      ['fuzzy', { fuzzy: { term: 'quikc', fuzziness: 'AUTO' } }],
    ];
    for (const [kind, body] of cases) {
      const r = parseIntervalRule(body);
      expect(r, kind + ' 必须解析成功').toBeTruthy();
      expect(r!.kind, kind + ' 的 kind').toBe(kind);
      expect(String(r!.main ?? ''), kind + ' 的主值').toBe(String((body as any)[kind][KIND_MAINKEY[kind]]));
    }
  });

  it('② 容器型递归：all_of / any_of 的子规则逐层保留', () => {
    const body = {
      all_of: {
        ordered: true, max_gaps: 3,
        intervals: [
          { match: { query: 'fox' } },
          { any_of: { intervals: [{ prefix: { prefix: 'qu' } }, { fuzzy: { term: 'quikc' } }] } },
        ],
      },
    };
    const r = parseIntervalRule(body);
    expect(r).toBeTruthy();
    expect(r!.kind).toBe('all_of');
    expect(r!.children?.length, '两个子规则').toBe(2);
    expect(r!.children![1].kind, '嵌套 any_of').toBe('any_of');
    expect(r!.children![1].children?.length, '嵌套层两个子规则').toBe(2);
    /* 往返等价 */
    expect(stable(serIntervalRule(r!))).toBe(stable(body));
    expect(CONTAINER_KINDS.has('all_of')).toBe(true);
    expect(CONTAINER_KINDS.has('any_of')).toBe(true);
  });

  it('③ 畸形体退 null（调用方回落 GenericParams，零丢失）', () => {
    expect(parseIntervalRule(null), 'null').toBeNull();
    expect(parseIntervalRule('not-an-object'), '标量').toBeNull();
    expect(parseIntervalRule({}), '空对象无类型键').toBeNull();
    expect(parseIntervalRule({ unknown_kind: { x: 1 } }), '未注册类型').toBeNull();
    expect(parseIntervalRule({ match: {}, prefix: {} }), '两个类型键').toBeNull();
  });

  it('④ filter 位置关系：8 种关系都能解析并写回', () => {
    for (const { rel } of FILTER_RELS) {
      /* parseIntervalFilter 吃的是 **filter 对象本身**（{<rel>: 子规则}），不是整条规则 */
      const filterObj = { [rel]: { match: { query: 'other' } } };
      const view = parseIntervalFilter(filterObj);
      expect(view, rel + ' 的 filter 视图').toBeTruthy();
      expect(view!.slots.some(s => s.rel === rel), rel + ' 槽在位').toBe(true);
      expect(view!.rest, rel + ' 不应落进 rest').toEqual({});

      /* 整条规则带 filter：规则解析 → 写回后 filter 关系仍在（端到端不丢） */
      const body: any = { match: { query: 'fox', filter: filterObj } };
      const r = parseIntervalRule(body);
      expect(r, rel + ' 整条规则解析').toBeTruthy();
      const back = stable(serIntervalRule(r!));
      expect(back, rel + ' 写回保留').toContain(rel);
    }
  });

  it('⑤ 规则类型表与实际支持一致（下拉项都能解析）', () => {
    for (const meta of RULE_KIND_META) {
      const body: any = meta.k === 'all_of' || meta.k === 'any_of'
        ? { [meta.k]: { intervals: [{ match: { query: 'x' } }] } }
        : { [meta.k]: { [KIND_MAINKEY[meta.k]]: 'v' } };
      const r = parseIntervalRule(body);
      expect(r, meta.k + '（' + meta.label + '）必须能解析').toBeTruthy();
      expect(r!.kind).toBe(meta.k);
      /* 写回后仍是该类型 */
      expect(stable(serIntervalRule(r!))).toContain('"' + meta.k + '"');
    }
  });
});
