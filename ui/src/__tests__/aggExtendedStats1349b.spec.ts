/**
 * 一千三百四十九批 b：`extended_stats` 被当成 `stats` 显示，多出来的键整块消失。
 *
 * 真机（DSL 工作台，mock 回 ES 原始形态的 extended_stats）修复前：
 *
 *   agg_ext 统计
 *     count 12 / min 1.5 / max 9.25 / avg 4.75 / sum 57      ← 只有这 5 项
 *
 * 而 ES 的 extended_stats 还带 sum_of_squares / variance / std_deviation /
 * **std_deviation_bounds（两层嵌套对象）**。用户明确写了 extended_stats，
 * 看到的却和 stats 一模一样 —— 无从判断聚合到底按 extended 跑了没有；
 * 嵌套边界更是连字段名都不出现。
 *
 * 修复后同一次执行：
 *   … sum_of_squares 402.5 / variance 5.188 / std_deviation 2.278
 *   std_deviation_bounds.upper.std_deviation_sampling 2.378
 *   std_deviation_bounds.upper.std_deviation_upper    9.305
 *   std_deviation_bounds.lower.std_deviation_lower    0.195
 *
 * 踩坑记录：第一版只展平**一层**，bounds 得到 `[object Object]` ——
 * 那比不显示更糟（看着像有值）。必须递归展到底。
 *
 * 本 spec 锁：
 *  ① 统计分支不得只列固定五项（必须遍历其余键）；
 *  ② 展平必须**递归**（两层 bounds 不能剩 `[object Object]`）；
 *  ③ 固定五项仍在（不许为了收其余键把基础档丢了）；
 *  ④ 负控：只展一层的写法必须判不合格。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const block = (() => {
  const i = src.indexOf("const FIXED = ['count', 'min', 'max', 'avg', 'sum'];");
  expect(i, '统计分支必须存在固定档定义').toBeGreaterThan(-1);
  /* 收尾标记取统计分支自己的 push（不能取 `continue;`——循环体开头就有
     `if (FIXED.includes(k)) continue;`，会切出空块，判据跟着恒假） */
  const end = src.indexOf("out.push({ name, kindLabel: '统计', rows });", i);
  expect(end, '统计分支必须有收尾 push').toBeGreaterThan(i);
  return src.slice(i, end);
})();

describe('1349b extended_stats 不得退化成 stats', () => {
  it('统计分支仍保留固定五项', () => {
    for (const k of ['count', 'min', 'max', 'avg', 'sum']) {
      expect(block, `固定档 ${k} 必须仍在`).toContain(`'${k}'`);
    }
  });

  it('必须遍历其余键（不只列固定五项）', () => {
    expect(block).toContain('Object.entries<any>(v)');
    expect(block, '必须跳过已处理的固定档').toMatch(/FIXED\.includes\(k\)/);
  });

  it('展平必须递归——两层 bounds 不能剩 [object Object]', () => {
    /* 在整块里找递归调用（不靠子串切分，切分容易被同名短串打偏） */
    expect(block, '必须递归调用自身').toMatch(/flat\(`\$\{pre\}\.\$\{ck\}`,\s*cv\)/);
    /* 反锁：对象分支必须是「继续下钻 + return」，而不是落进 String(o) */
    expect(block, '对象必须继续下钻').toMatch(/typeof o === 'object'[\s\S]{0,120}flat\(/);
  });

  it('负控：只展一层的写法判不合格（判据不是恒真）', () => {
    /* 构造「只展一层」的等价片段，断言它不含递归调用 —— 证明上面的判据能区分两者 */
    const oneLevel = 'for (const [sk, sv] of Object.entries<any>(val)) { rows.push({ k: `${k}.${sk}`, v: sv }); }';
    expect(oneLevel, '一层展平没有递归').not.toMatch(/flat\(`\$\{pre\}/);
  });
});
