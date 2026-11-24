/**
 * 五百二十四批：dslLint 两处增改契约。
 *  ① date-math ||复合段舍入误报修复：ES 合法舍入段（数学段带 /舍入单位、纯舍入段）不再误报
 *     date-range；乱写段两形态都不匹配仍报——「防 2026-01-01||随便乱写 漏网」意图保留；
 *  ② multi_match fields 结构两分支（零 ctx 依赖）：fields 标量串=error（terms-scalar 同款
 *     文案口径）、整个缺 fields 键=warning；anchor=multi_match、nth 走 kNth（bool-key-typo 同口径）。
 * 纯函数测试，无挂载。
 */
import { describe, it, expect } from 'vitest';
import { lintDsl } from '../dslLint';

const FIELDS = [
  { path: 'title', type: 'text' },
  { path: 'title.keyword', type: 'keyword' },
  { path: 'created', type: 'date' },
];
const ctx = { fields: FIELDS };

const rangeGte = (v: string) => lintDsl(JSON.parse('{"query":{"range":{"created":{"gte":' + JSON.stringify(v) + '}}}}'), ctx)
  .map(x => x.rule);
const rangeLt = (v: string) => lintDsl(JSON.parse('{"query":{"range":{"created":{"lt":' + JSON.stringify(v) + '}}}}'), ctx)
  .map(x => x.rule);

describe('dslLint 五百二十四批：date-math ||复合段舍入不再误报', () => {
  it('数学段带舍入（"2026-01-01||+1M/d"）→ 不报 date-range', () => {
    expect(rangeGte('2026-01-01||+1M/d')).not.toContain('date-range');
  });

  it('纯舍入段（"now||/M"）→ 不报 date-range', () => {
    expect(rangeLt('now||/M')).not.toContain('date-range');
  });

  it('ISO 基串 + 纯舍入段（"2026-01-01||/M"）→ 不报 date-range', () => {
    expect(rangeGte('2026-01-01||/M')).not.toContain('date-range');
  });

  it('乱写段仍报：防漏网意图保留（"2026-01-01||abc" / "2026-01-01||随便乱写"）', () => {
    expect(rangeGte('2026-01-01||abc')).toContain('date-range');
    expect(rangeGte('2026-01-01||随便乱写')).toContain('date-range');
  });

  it('now 系既有形态不回归（"now-7d/d" 合法、"乱语||+1M" 基串非法仍报）', () => {
    expect(rangeGte('now-7d/d')).not.toContain('date-range');
    expect(rangeGte('乱语||+1M')).toContain('date-range');
  });
});

describe('dslLint 五百二十四批：multi_match fields 结构两分支', () => {
  it('① fields 标量串 → error，文案 terms-scalar 同款口径、anchor=multi_match', () => {
    const fs = lintDsl(JSON.parse('{"query":{"multi_match":{"query":"x","fields":"title"}}}'));
    const f = fs.find(x => x.rule === 'multi-match-fields');
    expect(f, '应产出 multi-match-fields finding').toBeTruthy();
    expect(f!.severity).toBe('error');
    expect(f!.message).toContain('multi_match fields 必须是数组');
    expect(f!.message).toContain('title');
    expect(f!.suggestion).toContain('"fields": ["title", "content"]');
    expect(f!.anchor).toBe('multi_match');
    expect(f!.path).toBe('query.multi_match.fields');
  });

  it('① 零 ctx 依赖：不传 mapping 字段表同样报（terms-scalar 同款结构错不受 ctx 门槛）', () => {
    expect(lintDsl(JSON.parse('{"query":{"multi_match":{"query":"x","fields":"title"}}}')).map(x => x.rule))
      .toContain('multi-match-fields');
  });

  it('② 整个缺 fields 键 → warning，会被 ES 拒绝或零命中', () => {
    const fs = lintDsl(JSON.parse('{"query":{"multi_match":{"query":"x"}}}'));
    const f = fs.find(x => x.rule === 'multi-match-fields');
    expect(f, '应产出 multi-match-fields finding').toBeTruthy();
    expect(f!.severity).toBe('warning');
    expect(f!.message).toContain('multi_match 缺 fields');
    expect(f!.message).toContain('零命中');
    expect(f!.anchor).toBe('multi_match');
    expect(f!.path).toBe('query.multi_match');
  });

  it('fields 对象形态（per-field boost）是 ES 合法形态不判', () => {
    expect(lintDsl(JSON.parse('{"query":{"multi_match":{"query":"x","fields":{"title":{"boost":2}}}}}')).map(x => x.rule))
      .not.toContain('multi-match-fields');
  });

  it('nth 与 bool-key-typo 同口径：multi_match 第二次出现 → nth=1', () => {
    const fs = lintDsl(JSON.parse('{"query":{"bool":{"should":[' +
      '{"multi_match":{"query":"a","fields":"t1"}},' +
      '{"multi_match":{"query":"b","fields":"t2"}}]}}}'));
    const hits = fs.filter(x => x.rule === 'multi-match-fields');
    expect(hits.length).toBe(2);
    expect(hits[0].nth).toBe(0);
    expect(hits[1].nth).toBe(1);
  });

  it('fields 数组既有分支不回归：元素拼写仍走 unknown-field hint，不误报 multi-match-fields', () => {
    const fs = lintDsl(JSON.parse('{"query":{"multi_match":{"query":"x","fields":["titel"]}}}'), ctx);
    expect(fs.map(x => x.rule)).toContain('unknown-field');
    expect(fs.map(x => x.rule)).not.toContain('multi-match-fields');
    expect(fs.find(x => x.rule === 'unknown-field')!.anchor).toBe('titel');
  });
});
