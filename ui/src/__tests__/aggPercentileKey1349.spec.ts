/**
 * 一千三百四十九批：分位数的键被写成百分比，和同屏的真占比撞了同一个符号。
 *
 * 查询工作台的聚合区里，terms 桶行显示的是**真占比**（`ACTIVE 21 22.8%`），
 * 而 percentiles 的键 `"50.0"` 是**分位点**（第 50 百分位 = 中位数），
 * 旧实现直接拼成 `50.0%` —— 同一个 `%` 在同一屏里表示两种完全不同的东西：
 * 用户很容易把它读成「50% 的文档」。
 *
 * 真机可以看到两者同屏（1440，DSL 工作台，mock 回 agg_by_status + agg_pct）：
 *   agg_by_status 分桶   ACTIVE 21 22.8%   ← 占比
 *   agg_pct 分位         P50 12.5           ← 修复后
 *
 * 改成 `P50` 的理由：① ES / Kibana 的通行写法；② 与同屏占比的 `%` 区分开；
 * ③ ES 的键是浮点串（"50.0"），整数分位去掉尾部 `.0`，`P99.9` 这类保留。
 *
 * 本 spec 锁：
 *  ① 不得再把分位键拼成 `%`；
 *  ② 必须以 `P` 前缀表达；
 *  ③ 尾部 `.0` 必须剥掉（"50.0" → "P50"），非整数分位保留（"99.9" → "P99.9"）；
 *  ④ 1321 的「无法计算（样本不足）」不得回退成 0。
 * 负控：把 `'P' + ...` 改回 `k + '%'` → 第 1、2 条必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const block = (() => {
  const i = src.indexOf("kindLabel: '分位'");
  expect(i, '分位聚合的行构造必须存在').toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('})) });', i) + 8);
})();

describe('1349 分位键不得写成百分比', () => {
  it('不得把分位键拼成 k + %', () => {
    expect(block, '分位键不是占比，不能带 %').not.toMatch(/k:\s*k\s*\+\s*'%'/);
  });

  it('必须以 P 前缀表达（ES/Kibana 通行写法）', () => {
    expect(block).toMatch(/k:\s*'P'\s*\+/);
  });

  it('整数分位剥掉尾部 .0，非整数保留', () => {
    /* 直接用源码里那条正则的字面量本身（不是从字符串重建），再验证行为 */
    expect(block, '必须把尾部 .0 剥掉').toContain("replace(/\\.0+$/, '')");
    const re = /\.0+$/;
    expect('50.0'.replace(re, '')).toBe('50');
    expect('90.0'.replace(re, '')).toBe('90');
    expect('99.9'.replace(re, '')).toBe('99.9');
    expect('100.0'.replace(re, '')).toBe('100');
  });

  it('null 仍表达为「无法计算（样本不足）」，不得回退成 0', () => {
    expect(block, '1321 的裁决不得回退').toContain('无法计算（样本不足）');
    expect(block).toMatch(/n\s*==\s*null\s*\?/);
  });
});
