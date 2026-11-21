import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/* 七百九十二批·死码域新矿=边角文件域死导出清零（deadExport792）——.ts 全域收官后残角试扫。
 * Phase 0 扫描面（789/790/791 修正版扫描器平移，resolve+词边界+分号分段+内联 type 剥除）：
 *   types.ts 5 export+router.ts 7 export+main.ts 0+env.d.ts 纯 ambient declare+
 *   App.vue script 0（790 批 .vue 全域扫描口径复核维持）=12 符号。
 * 机器分型：产品活 8+内部活 1+spec 孤儿 1+真死 2；
 *   人工终审（787-C1④ 全树 git grep 词边界）：
 *   · JobStatus=生而孤儿（f6e05302b 2026-08-07 出生即零消费；git -S 二次命中
 *     a69e12143 实为 toggleJobStatusFilter 子串=非消费方移除）→ 真死整删；
 *   · RiskLevel（types.ts 版 'safe'|'low'|'mid'|'high'|'critical'）=生而孤儿真死——
 *     ⚠utils/dateRisk.ts 有同名局部类型（'error'|'warning'|'info'|'ok' 值域不同、
 *     局部零导出），其 6 处用法全属局部类型，与 types.ts 版零关系（词形撞车陷阱，
 *     词边界 grep 须逐处甄别，不可计数了事）；
 *   · NavItem=内部活（真实自用仅 NAV_ITEMS 类型注解 1 处；router.ts:9 注释+
 *     queryHub.ts:15 注释=文案词非消费）→ export 私有化（790 RemoteSourceFields
 *     interface 私有化同构）；router 读锁面 5 spec（aliasMapCoverage491/
 *     contractDepsGuard394/navChipGuard412/overviewLiveEntry700/routerTargets）
 *     全无 NavItem 断言=零锁同步更新面（787-C2 锁预扫已过）；
 *   · pageAllowed=spec 孤儿豁免（pageAccess.spec.ts 真 import 直采=788-C1
 *     测试资产保全口径，同 791 get/post）；
 *   · 产品活 8 不动：IndexCat/SearchHit/SearchResp（types）+NAV_GROUPS/NAV_ITEMS/
 *     effectivePagesForTarget/pageDeniedRedirect/router（router）。
 * 刀A=JobStatus+RiskLevel 整删；刀B=NavItem 去 export 关键字。
 * readFileSync 文本锁面：queryHighlightChain.spec:114 锁 SearchHit.highlight 字段
 *   （删除面零交集，无需同步更新）。 */

const rd = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('七百九十二批：边角文件域死导出清零（真死 2 整删+NavItem 私有化）', () => {
  const typesSrc = rd('../types.ts');
  const routerSrc = rd('../router.ts');

  /* A1 真死整删：任何形态复发即红（788 A1~A3 同口径=源文件零提及，史志归本 spec 头注） */
  it.each([
    ['JobStatus'],
    ['RiskLevel'],
  ] as Array<[string]>)('A1 %s：types.ts 零提及（生而孤儿终审在档）', (sym) => {
    expect(typesSrc, `${sym} 复发（792 已整删：全树零消费+生而孤儿铁证在案）`)
      .not.toContain(sym);
  });

  it('A2 NavItem：任何 export 声明形态复发即红（NAV_ITEMS 注解自用不在此列）', () => {
    expect(routerSrc, 'NavItem export 复发（792 已私有化：自用 1 处在 NAV_ITEMS 注解）')
      .not.toMatch(/^\s*export\s+(declare\s+)?(interface|type)\s+NavItem\b/m);
  });

  it('A3 NavItem：私有化声明形态+本体保留（防全删，^行锚=787-C2 口径）', () => {
    expect(routerSrc).toMatch(/^interface NavItem \{/m);
  });

  it('B1 豁免锚：pageAllowed export 保留（pageAccess.spec 真 import 直采=788-C1 测试资产保全）', () => {
    expect(routerSrc).toMatch(/^export function pageAllowed\(/m);
  });

  it('B2 产品活锚：types 三接口+router 五符号 export 形态在场（防误扩刀）', () => {
    expect(typesSrc).toMatch(/^export interface IndexCat \{/m);
    expect(typesSrc).toMatch(/^export interface SearchHit \{/m);
    expect(typesSrc).toMatch(/^export interface SearchResp \{/m);
    expect(routerSrc).toMatch(/^export const NAV_GROUPS/m);
    expect(routerSrc).toMatch(/^export const NAV_ITEMS/m);
    expect(routerSrc).toMatch(/^export function effectivePagesForTarget\(/m);
    expect(routerSrc).toMatch(/^export function pageDeniedRedirect\(/m);
    expect(routerSrc).toMatch(/^export const router = createRouter\(/m);
  });

  it('B3 边角零 export 备案锚：main.ts/env.d.ts 维持零 export 面（App.vue 790 口径）', () => {
    expect(rd('../main.ts')).not.toMatch(/^\s*export\s/m);
    /* env.d.ts=纯 ambient declare（declare const 非导出符号），备案不动 */
    expect(rd('../env.d.ts')).not.toMatch(/^\s*export\s/m);
  });
});
