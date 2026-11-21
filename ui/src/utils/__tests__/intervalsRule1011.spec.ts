/* 1011 批：intervals 规则纯函数层行为锁——
   ① 官方 6 类规则 parse/ser 对称往返（含 _name/参数/filter 关系槽/递归容器）
   ② 畸形零丢失：子规则/槽值畸形 → __custom__ 行原样保真；filter·intervals 键级畸形留 params
   ③ 退化契约：非对象/多类型键/未知类型键（含 allOf 驼峰误写）/类型键值非对象 → null 整体退化 */
import { describe, it, expect } from 'vitest';
import {
  parseIntervalRule, serIntervalRule, parseIntervalFilter, makeRule,
  KIND_MAINKEY, RULE_PARAMS, CUSTOM_KIND,
} from '../intervalsRule';

const rt = (v: unknown) => serIntervalRule(parseIntervalRule(v)!);

describe('1011 intervalsRule 往返无损', () => {
  it.each([
    ['match-参数', { match: { query: 'my favorite food', max_gaps: 0, ordered: true, analyzer: 'standard' } }],
    ['prefix', { prefix: { prefix: 'ti' } }],
    ['wildcard', { wildcard: { pattern: 'ski?', use_field: 'title' } }],
    ['fuzzy', { fuzzy: { term: 'ski', fuzziness: 'AUTO', prefix_length: 1, transpositions: true } }],
    ['name', { match: { query: 'x' }, _name: 'named-rule' }],
    ['all_of-递归', {
      all_of: {
        intervals: [
          { match: { query: 'a' } },
          { any_of: { intervals: [{ prefix: { prefix: 'b' } }, { wildcard: { pattern: 'c*' } }] } },
        ],
        max_gaps: 2, ordered: true,
      },
    }],
    ['filter-六关系', {
      match: { query: 'x', filter: { not_containing: { match: { query: 'water' } }, contained_by: { prefix: { prefix: 'p' } } } },
    }],
    ['filter-before-after', {
      any_of: { intervals: [{ match: { query: 'x' } }], filter: { before: { match: { query: 'earlier' } }, after: { match: { query: 'later' } } } },
    }],
    ['filter-script-rest', {
      match: { query: 'x', filter: { containing: { match: { query: 'y' } }, script: { source: 'interval.start > 0' } } },
    }],
    ['空-intervals-数组', { any_of: { intervals: [] } }],
  ])('%s 往返一致', (_n, v) => {
    expect(rt(v)).toEqual(v);
  });

  it('parse 结构投影正确（类型/主值/子规则/槽分账）', () => {
    const r = parseIntervalRule({ match: { query: 'x', max_gaps: 1, filter: { containing: { prefix: { prefix: 'p' } } } }, _name: 'nm' })!;
    expect(r.kind).toBe('match');
    expect(r.main).toBe('x');
    expect(r.params).toEqual({ max_gaps: 1 });
    expect(r.hasName).toBe(true);
    expect(r.name).toBe('nm');
    expect(r.filter?.slots[0].rel).toBe('containing');
    expect(r.filter?.slots[0].rule.kind).toBe('prefix');
    const c = parseIntervalRule({ all_of: { intervals: [{ match: { query: 'a' } }], ordered: true } })!;
    expect(c.children).toHaveLength(1);
    expect(c.children![0].kind).toBe('match');
    expect(c.hasChildren).toBe(true);
    expect(c.params).toEqual({ ordered: true });
  });
});

describe('1011 intervalsRule 畸形零丢失', () => {
  it('子规则畸形 → __custom__ 行原样保真（嵌套深处不牵连整树退化）', () => {
    const v = { any_of: { intervals: [{ match: { query: 'ok' } }, 'not-a-rule'] } };
    const r = parseIntervalRule(v)!;
    expect(r.children![1].kind).toBe(CUSTOM_KIND);
    expect(serIntervalRule(r)).toEqual(v);
  });
  it('filter 槽值畸形 → __custom__ 行保真', () => {
    const v = { match: { query: 'x', filter: { containing: 42 } } };
    expect(rt(v)).toEqual(v);
  });
  it('filter 键值非对象 → 原样留 params（不进结构化槽）', () => {
    const v = { match: { query: 'x', filter: 'bad' } };
    const r = parseIntervalRule(v)!;
    expect(r.filter).toBeNull();
    expect(r.params.filter).toBe('bad');
    expect(serIntervalRule(r)).toEqual(v);
  });
  it('intervals 键值非数组 → 原样留 params', () => {
    const v = { all_of: { intervals: 'bad', ordered: true } };
    const r = parseIntervalRule(v)!;
    expect(r.hasChildren).toBe(false);
    expect(r.params.intervals).toBe('bad');
    expect(serIntervalRule(r)).toEqual(v);
  });
});

describe('1011 intervalsRule 退化契约（null = 调用方整体退通用键值表）', () => {
  it.each([
    ['非对象', 'str'],
    ['数组', [{ match: { query: 'x' } }]],
    ['空对象', {}],
    ['多类型键', { match: { query: 'x' }, any_of: { intervals: [] } }],
    ['未知类型键（allOf 驼峰非 ES 键）', { allOf: { intervals: [] } }],
    ['类型键值非对象', { match: 'x' }],
  ])('%s → null', (_n, v) => {
    expect(parseIntervalRule(v)).toBeNull();
  });
});

describe('1011 注册表一致性', () => {
  it('六类官方规则齐全；主值键/参数 schema 对齐', () => {
    expect(KIND_MAINKEY).toEqual({ match: 'query', prefix: 'prefix', wildcard: 'pattern', fuzzy: 'term' });
    expect(Object.keys(RULE_PARAMS).sort()).toEqual(['all_of', 'any_of', 'fuzzy', 'match', 'prefix', 'wildcard']);
    /* 专用控件承担的键不得出现在参数 schema（双编辑位=写回冲突） */
    for (const [k, ps] of Object.entries(RULE_PARAMS)) {
      expect(ps.map(p => p.key)).not.toContain('filter');
      expect(ps.map(p => p.key)).not.toContain('intervals');
      expect(k).toBeTruthy();
    }
  });
  it('makeRule 骨架可用（单值主值空串；容器无 intervals 键）', () => {
    const m = makeRule('match');
    expect(serIntervalRule(m)).toEqual({ match: { query: '' } });
    const c = makeRule('all_of');
    expect(serIntervalRule(c)).toEqual({ all_of: {} });
    expect(parseIntervalFilter('x')).toBeNull();
  });
});
