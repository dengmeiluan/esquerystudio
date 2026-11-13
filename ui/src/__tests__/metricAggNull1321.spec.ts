/**
 * 一千三百二十一批：metric 聚合把「算不出来」显示成 0 / 干脆不显示。
 *
 * 两个真机可复现的假数据问题（都是 `Number(null) === 0` 与「键数阈值」两种常见坑）：
 *
 * ① percentiles：ES 对样本不足的档位回 **null**。旧实现 `fmtNum(Number(n))`
 *    → `Number(null) = 0` → 页面显示 `90.0% = 0`、`99.0% = 0`。
 *    真机上「P90 是 0」和「P90 算不出来」是完全不同的结论，不能混。
 *
 * ② stats 空文档集：ES 只给 `count: 0`，min/max/avg/sum 全是 null。
 *    旧判据「数值键 ≥ 3 才算统计」在空集下只剩 1 个键 → **整个聚合被丢弃**，
 *    界面上什么都不显示，用户分不清「没数据」还是「没跑」。
 *
 * 本 spec 锁：
 *  - percentiles 的 null 显示为「无法计算（样本不足）」，不得出现 0
 *  - 空集 stats 必须仍然成块渲染，null 档位写「无样本」
 *  - 正常 stats 五档原样
 * 负控：把 percentiles 分支改回 fmtNum(Number(n)) → 第一条必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

function metricBlock(): string {
  const i = src.indexOf('const metricAggs = computed');
  expect(i, 'metricAggs 必须存在').toBeGreaterThan(-1);
  const rest = src.slice(i);
  const end = rest.indexOf('\n});');
  return end < 0 ? rest : rest.slice(0, end);
}

describe('1321 metric 聚合的空值呈现', () => {
  it('percentiles 的 null 不得被 Number 洗成 0', () => {
    const blk = metricBlock();
    expect(blk, '必须判 null').toMatch(/n == null \? '无法计算（样本不足）'/);
    expect(blk, 'null 分支之外才 Number 化').not.toMatch(/\{ k: k \+ '%', v: fmtNum\(Number\(n\)\) \}/);
  });

  it('空集 stats（只有 count）仍然成块渲染', () => {
    const blk = metricBlock();
    expect(blk, '判据必须放宽到「有 count 就认」').toContain("statKeys.length >= 3 || typeof v.count === 'number'");
    expect(blk, 'null 档位写「无样本」').toContain("v[k] == null ? '无样本'");
  });

  it('正常 stats 的五个档位都保留', () => {
    const blk = metricBlock();
    for (const k of ['count', 'min', 'max', 'avg', 'sum']) {
      expect(blk, `必须渲染 ${k}`).toContain(`'${k}'`);
    }
  });

  it('TopHits 只读 total.value（不是把 total 对象当真值）', () => {
    const blk = metricBlock();
    expect(blk, 'total 可能是 {value,relation} 对象').toContain('v.hits.total?.value');
  });
});
