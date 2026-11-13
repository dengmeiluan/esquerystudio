import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 五百二十七批（W-E）：WIDE_ROUTES 反向锚——「wide 是默认，豁免需显式」。
   router.ts WIDE_ROUTES（≥1920 超宽屏居中豁免清单）与路由表是两份手工清单：
   新增数据密集页路由时忘登 wide 清单无人报警（页头被 1600px 居中压窄，用户才看见）。
   「密集页必须登记」不可静态判定（新页面是否数据密集需要人判断），故采用可静态执行的
   反向口径：路由表中除**已登记豁免页**（纯阅读居中页/提示页，逐条注释理由）外，
   其余真实页面路由必须都在 WIDE_ROUTES——新增页面不登记 wide 即红灯，
   想豁免必须在下方 EXEMPT 显式登记并附理由（强制决策显式化）。
   反向也锁：WIDE_ROUTES 出现路由表不存在的条目（改名/删页后残留）同样红灯。 */
const routerSrc = readFileSync(join(__dirname, '../router.ts'), 'utf-8');

/* 已登记豁免页（阅读型居中页/提示页，与 router.ts wide 判据注释「纯阅读与向导/错误页
   保持居中不进本集合」同口径）。新增豁免必须附理由： */
const EXEMPT: ReadonlySet<string> = new Set([
  '/templates-gallery', /* 模板画廊：纯阅读卡片墙（查看/复制模板），非数据密集 */
  '/favorites', /* 收藏列表：纯阅读列表页（router.ts 注释点名豁免） */
  '/forbidden', /* 2.5.0 页面级授权拒绝落地页：错误提示页，非数据页 */
  '/module-off', /* 功能包停用落地页：提示页，非数据页 */
  '/:pathMatch(.*)*', /* R42 404 兜底页：提示页，非数据页 */
]);

function parseRouter(): { wide: Set<string>; componentRoutes: Set<string>; wideMapWiring: boolean } {
  /* WIDE_ROUTES 集合字面量：new Set([ ... ]) 内的字符串字面量 */
  const block = routerSrc.match(/const WIDE_ROUTES: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\);/);
  const wide = new Set<string>(block ? [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]) : []);
  /* 路由表中的真实页面路由（component 懒加载项；redirect 项与 legacy spread 天然不匹配） */
  const componentRoutes = new Set<string>(
    [...routerSrc.matchAll(/\{\s*path:\s*'([^']+)',\s*component:/g)].map(m => m[1]));
  /* WIDE_ROUTES → meta.wide 的消费接线（集合被删接线即成死数据） */
  const wideMapWiring = /WIDE_ROUTES\.has\(r\.path\) \? \{ \.\.\.r, meta: \{ wide: true \} \} : r/.test(routerSrc);
  return { wide, componentRoutes, wideMapWiring };
}

describe('五百二十七批：WIDE_ROUTES 反向锚（wide 是默认，豁免需显式）', () => {
  const { wide, componentRoutes, wideMapWiring } = parseRouter();

  it('防空跑：两份清单都解析到内容，meta.wide 接线在场', () => {
    expect(wide.size).toBeGreaterThanOrEqual(40);
    expect(componentRoutes.size).toBeGreaterThanOrEqual(50);
    expect(wideMapWiring).toBe(true);
  });

  it('WIDE_ROUTES 现役 51 条（新增/删减须同步更新本锚，强制过目）', () => {
    expect(wide.size, 'WIDE_ROUTES 条数变化——新增页面请确认是否登记（豁免走 EXEMPT），并更新本锚计数').toBe(51);
  });

  it('路由表中除豁免页外，真实页面路由必须全部登记 wide（忘登即报警）', () => {
    const missing = [...componentRoutes].filter(p => !EXEMPT.has(p) && !wide.has(p));
    expect(missing, `以下页面路由未登记 WIDE_ROUTES（数据密集页请补登记；阅读型/提示页请在 EXEMPT 显式登记并附理由）：${missing.join(', ')}`).toEqual([]);
  });

  it('WIDE_ROUTES 无残留：每条登记项都对应路由表真实页面', () => {
    const stale = [...wide].filter(p => !componentRoutes.has(p));
    expect(stale, `WIDE_ROUTES 存在路由表不存在的条目（页面已删/已改名，请清理）：${stale.join(', ')}`).toEqual([]);
  });

  it('豁免清单保鲜：EXEMPT 每条都必须是路由表在册页面（页面删除后须同步注销）', () => {
    for (const p of EXEMPT) {
      expect(componentRoutes.has(p), `豁免页 ${p} 已不在路由表——请从 EXEMPT 移除`).toBe(true);
    }
  });
});
