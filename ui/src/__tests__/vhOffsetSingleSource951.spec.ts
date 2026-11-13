/* 九百五十一批：--vh-offset 冗余 fallback 全站收敛守卫——视口偏移单源化（theme.css :root 210px 唯一定义）。
 *
 * 治理本体：12 个 vue 文件 19 处 `var(--vh-offset, 210px)` 死 fallback。theme.css :root
 * 无条件定义 --vh-offset: 210px（顶栏+页头+工具条标准高度），fallback 永不生效却把 210px
 * 常量复制了 19 份=两处漂移面（BrowserView/MappingView 先注释先清，本刀全站收官）。
 * 收敛后全站统一 `var(--vh-offset)` 形态；每页专属 chrome 余量（+38/+80/+120…-210 等）
 * 为各页刻意值不动，只清 token 尾巴。
 *
 * 断言面：
 *   ① 产品域（src 下 .vue/.css，__tests__ 豁免）零 `var(--vh-offset, 210px)` 字面——
 *      失败消息列出 offenders 文件清单；
 *   ② 单源正锁：theme.css :root 的 --vh-offset: 210px 定义在场（防删源留消费）；
 *   ③ 已清形正锁：BrowserView/MappingView 的 var(--vh-offset) 无 fallback 形态不回潮
 *      （先例注释「theme.css :root 已定义 210px，避免两处漂移」同语言）。
 * 同批随迁：flattenWave538/focusSweep424/focusSurface401/queryWorkbenchW1/responsiveGuard239/
 * devtoolsFlatten534/indexHubDevtools531/runProgress414/chartNarrowTier649/dqHeightUnify549/
 * unifyWave561/stListScroll931/matchMatrixSort 十三档字面锚同步去 fallback。
 * JS 动态写面已勘：src 全域零 setProperty('--vh-offset')（token 仅 :root 静态单源）。 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = join(__dirname, '..');
const DEAD = 'var(--vh-offset, 210px)';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.vue') || name.endsWith('.css')) out.push(p);
  }
  return out;
}

describe('vhOffsetSingleSource951 · --vh-offset 冗余 fallback 全站收敛（单源=theme.css :root）', () => {
  it('产品域零 var(--vh-offset, 210px) 死 fallback（12 文件 19 处收官，防回潮）', () => {
    const offenders = walk(srcDir)
      .map((p) => ({ p, hit: readFileSync(p, 'utf8').split(DEAD).length - 1 }))
      .filter((x) => x.hit > 0)
      .map((x) => `${x.p} ×${x.hit}`);
    expect(offenders, `死 fallback 残留：${offenders.join('; ')}`).toEqual([]);
  });

  it('单源正锁：theme.css :root 定义 --vh-offset: 210px 在场（防删源留消费）', () => {
    const theme = readFileSync(join(srcDir, 'theme.css'), 'utf8');
    expect(theme, ':root 单源定义缺失').toMatch(/--vh-offset: 210px;/);
  });

  it('已清形正锁：BrowserView/MappingView 走 var(--vh-offset) 无 fallback（先例形态不回潮）', () => {
    const bv = readFileSync(join(srcDir, 'views/BrowserView.vue'), 'utf8');
    const mv = readFileSync(join(srcDir, 'views/MappingView.vue'), 'utf8');
    expect(bv).toContain('calc(100vh - var(--vh-offset) + 38px)');
    expect(mv).toContain('calc(100vh - var(--vh-offset) + 90px)');
  });
});
