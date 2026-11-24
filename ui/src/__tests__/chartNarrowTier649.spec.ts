/**
 * 六百四十九批 G'1（台账 R80）：900 窄档主卡图高档位化——R77 重盘 G'1 候选闭环。
 *
 * 病灶：.ld-charts ≤900px 收单列，主卡满宽（~840px）时图高仍 88px，纵横比 ~9.5:1 过扁，
 * 走势形状观感压缩；1600 三列（~500px 卡宽）比例合适不动。
 *
 * 判据：
 *   1) **窄档图高常量单源**：utils/sparkChart.ts 导出 LD_H_NARROW=110（110<120=对比卡 CMP_H，
 *      窄档下对比卡仍是视觉主图，层级不倒挂）；
 *   2) **组件窄档档位覆盖**：LiveChartCard.vue 内 @media (max-width: 900px) 块——
 *      .ld-svg 与 .ld-svg-wait 同步 110px（占位↔出图等高，破则采样切换高度跳变破哨兵，
 *      chartGeometry629 ② 同口径）；
 *   3) **漂移反锁**：CSS 窄档字面 == LD_H_NARROW 常量（改一处必红，chartGeometry629 ② 同形态）；
 *   4) **数据坐标系零变**：viewBox/悬浮命中/占比换算仍走 LD_H（88）——R71 放大态同范式
 *      （preserveAspectRatio=none 拉伸 + 悬浮层全百分比定位，任意渲染高几何自洽），
 *      窄档块只动渲染高、不接管数据坐标系（块内禁现 LD_H/viewBox 改写痕迹）；
 *   5) **放大态不受档位影响**：.ld-chart-full .ld-svg 特异性 (0,2,0) > 窄档 (0,1,0)，
 *      全屏 calc 高度规则逐字保留。
 * 负锁一律剥注释后断言（unifyWave561 口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const UTIL = codeOf('utils/sparkChart.ts');
const CARD = codeOf('components/LiveChartCard.vue');

describe('六百四十九批 G' + "'1" + '：900 窄档主卡图高档位化', () => {
  it('窄档图高常量单源（LD_H_NARROW=110，<120 对比卡层级不倒挂）', () => {
    expect(UTIL, '窄档高常量在场').toMatch(/export const LD_H_NARROW = 110;/);
    expect(Number(UTIL.match(/export const LD_H_NARROW = (\d+);/)![1]), '窄档 < 对比卡 120').toBeLessThan(
      Number(UTIL.match(/export const CMP_H = (\d+);/)![1]),
    );
    expect(Number(UTIL.match(/export const LD_H_NARROW = (\d+);/)![1]), '窄档 > 宽档 88（档位化而非降档）').toBeGreaterThan(
      Number(UTIL.match(/export const LD_H = (\d+);/)![1]),
    );
  });

  it('组件窄档档位覆盖（@media ≤900：.ld-svg 与 .ld-svg-wait 同步升档）', () => {
    const mq = CARD.match(/@media \(max-width: 900px\) \{([\s\S]*?)\n\}/);
    expect(mq, '窄档媒体查询块在场').toBeTruthy();
    const inner = mq![1];
    expect(inner, '主卡图高窄档覆盖在场').toContain('.ld-svg { height: 110px; }');
    expect(inner, '占位高度窄档同步（哨兵前提）').toContain('.ld-svg-wait { height: 110px; }');
    expect(inner, '窄档块不重复宽档基线（88 基线只此一处）').not.toContain('88px');
  });

  it('漂移反锁：CSS 窄档字面 == LD_H_NARROW 常量（改一处必红）', () => {
    const jsVal = UTIL.match(/export const LD_H_NARROW = (\d+);/)![1];
    const mq = CARD.match(/@media \(max-width: 900px\) \{([\s\S]*?)\n\}/)!;
    const svgCss = mq[1].match(/\.ld-svg \{ height: (\d+)px; \}/);
    const waitCss = mq[1].match(/\.ld-svg-wait \{ height: (\d+)px; \}/);
    expect(svgCss, '窄档 .ld-svg 高度字面在场').toBeTruthy();
    expect(waitCss, '窄档 .ld-svg-wait 高度字面在场').toBeTruthy();
    expect(svgCss![1], '窄档 .ld-svg = LD_H_NARROW').toBe(jsVal);
    expect(waitCss![1], '窄档 .ld-svg-wait = LD_H_NARROW').toBe(jsVal);
  });

  it('数据坐标系零变（viewBox/命中/占比仍走 LD_H=88；窄档块无坐标系接管）', () => {
    expect(CARD, '主卡 viewBox 仍绑 LD_H').toContain(":viewBox=\"'0 0 300 ' + LD_H\"");
    expect(CARD, '命中换算 H 参仍 LD_H').toContain('frac, 300, LD_H,');
    expect(CARD, 'hvTop 分母仍 LD_H').toContain('/ LD_H * 100');
    const mq = CARD.match(/@media \(max-width: 900px\) \{([\s\S]*?)\n\}/)!;
    expect(mq[1], '窄档块纯 CSS 档位（无 JS 侧常量痕迹）').not.toMatch(/LD_H|viewBox/);
  });

  it('放大态不受档位影响（.ld-chart-full calc 高度逐字保留）', () => {
    expect(CARD, '放大态高度规则在场').toContain(
      '.ld-chart-full .ld-svg { height: calc(100vh - var(--vh-offset)); }',
    );
  });
});
