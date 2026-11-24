/**
 * 六百二十九批：图体质感几何升级（622 稿 P1 首刀；对标 626 批实测——
 * 阿里云图体「Y 轴带刻度 + 横网格线」，我方 64px 走势既无刻度也无网格，618 稿 §0 病灶 #2）。
 *
 * 判据：
 *   1) **几何单源**：主卡 / 对比卡 / 迷你三档高度各自只有一个真源（JS 常量），
 *      CSS 字面必须与常量同值（本 spec 反锁「漂移」）；旧 64/96/20 字面**零残留**；
 *   2) **参考网格**：仅百分比语义卡（Heap/CPU/磁盘）画 25/50/75 网格线；
 *      绝对值卡（QPS/写入）**不画等分网格**（622 §2.3 诚实原则）；
 *   3) **底基线**：五张线卡（含绝对值卡）皆有——y=H 即 0 值线；
 *   4) **展开钮入头行**：不再作标题行的兄弟块孤浮（622 §6.1 / 618 §0 病灶 #3）；
 *      但 `.ld-chart .ld-expand` 后代选择器契约必须保持（liveExpand611 锁）。
 * 负锁一律剥注释后断言（unifyWave561 口径）。
 *
 * 六百三十八批 P1a-2 同步更新：五线卡合并进 `components/LiveChartCard.vue`——
 *   主卡 CSS/模板/悬浮锁改读 CARD；对比卡（.ld-ncmp）仍读 VIEW。
 * 七百八十一批 K3 同步更新：节点卡迷你 spark（.ld-spark）退役——迷你高度 CSS 同值锁
 *   与迷你 viewBox 绑定锁随件删除（SPARK_H 常量留 utils 史志；旧 20 字面负锁保留防回潮）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const VIEW = codeOf('views/LiveDashboardView.vue');
const UTIL = codeOf('utils/sparkChart.ts'); /* 六百三十八批 P1a-1：几何常量/点位函数单源下沉至此 */
const CARD = codeOf('components/LiveChartCard.vue'); /* 六百三十八批 P1a-2：五线卡合并进组件 */

describe('六百二十九批①：图体几何单源（高度三档 + 旧字面零残留）', () => {
  it('三档高度常量在场（主卡 88 / 迷你 24 / 对比卡 120）', () => {
    expect(UTIL, '主卡高常量').toMatch(/export const LD_H = 88;/);
    expect(UTIL, '迷你高常量').toMatch(/^const SPARK_H = 24;/m)/* 788 刀B 锁同步更新：SPARK_H 转模块私有 */;
    expect(UTIL, '对比卡宽常量').toMatch(/export const CMP_W = 720;/);
    expect(UTIL, '对比卡高常量').toMatch(/export const CMP_H = 120;/);
    expect(UTIL, '网格档常量').toMatch(/export const PCT_GRID = \[25, 50, 75\];/);
    /* 六百三十八批 P1a-1/P1a-2：视图与组件均经 import 单源消费，本地常量零残留 */
    expect(VIEW, '视图不再本地定义 LD_H').not.toMatch(/const LD_H = /);
    expect(VIEW, '视图不再本地定义 SPARK_H').not.toMatch(/const SPARK_H = /);
    expect(VIEW, '视图不再本地定义 CMP_W').not.toMatch(/const CMP_W = /);
    expect(CARD, '组件不再本地定义 LD_H').not.toMatch(/const LD_H = /);
  });

  it('CSS 高度与 JS 常量同值（漂移反锁：改一处必红）', () => {
    const cssM = CARD.match(/\.ld-svg \{ width: 100%; height: (\d+)px; display: block; \}/);
    const waitM = CARD.match(/\.ld-svg-wait \{ height: (\d+)px;/);
    const jsM = UTIL.match(/export const LD_H = (\d+);/);
    expect(cssM, '主卡 SVG CSS 高度在场（组件）').toBeTruthy();
    expect(waitM, '占位高度在场（哨兵同步的前提）').toBeTruthy();
    expect(jsM, 'LD_H 常量在场（utils/sparkChart.ts 单源）').toBeTruthy();
    expect(cssM![1], 'CSS .ld-svg 高度 = LD_H').toBe(jsM![1]);
    expect(waitM![1], 'CSS .ld-svg-wait 高度 = LD_H（否则采样中↔出图高度跳变破哨兵）').toBe(jsM![1]);
    const cmpM = VIEW.match(/\.ld-ncmp-svg \{ width: 100%; height: (\d+)px; display: block; \}/);
    const cmpJs = UTIL.match(/export const CMP_H = (\d+);/);
    expect(cmpM![1], '对比卡 CSS 高度 = CMP_H').toBe(cmpJs![1]);
    /* 七百八十一批 K3 同步更新：迷你 spark CSS 高度锁随件退役（模板 0 引用；
       SPARK_H 常量留 utils 史志，旧 20 字面负锁在下一用例保留防回潮） */
  });

  it('旧几何字面零残留（300,64 / viewBox 64 / 阈值线 64-/ hvTop 分母）', () => {
    /* 主卡（合并进组件）：旧 64 字面零残留 */
    expect(CARD, '主卡点串实参').not.toContain('300, 64');
    expect(CARD, '主卡 viewBox 字面').not.toContain('0 0 300 64');
    expect(CARD, '阈值线 y 字面').not.toContain('64 - 64 *');
    expect(CARD, 'hvTop 分母字面').not.toContain('/ 64 * 100');
    /* 对比卡/迷你卡（留视图） */
    expect(VIEW, '对比卡点串实参').not.toContain('720, 96');
    expect(VIEW, '对比卡 viewBox 字面').not.toContain('0 0 720 96');
    expect(VIEW, '迷你点串实参').not.toContain('180, 20');
    expect(VIEW, '迷你 viewBox 字面').not.toContain('0 0 180 20');
    /* 精确锁「本卡规则」而非全文：`.ld-jobs` 的 min-height:64px 与几何无关 */
    expect(CARD, 'CSS 旧主卡高').not.toMatch(/\.ld-svg \{[^}]*height: 64px/);
    expect(CARD, 'CSS 旧占位高').not.toMatch(/\.ld-svg-wait \{[^}]*height: 64px/);
    expect(VIEW, 'CSS 旧对比卡高').not.toMatch(/\.ld-ncmp-svg \{[^}]*height: 96px/);
    expect(VIEW, 'CSS 旧迷你高').not.toMatch(/\.ld-spark \{[^}]*height: 20px/);
  });

  it('几何从常量派生（viewBox / 点串 / 阈值线 / 命中换算同源）', () => {
    expect(CARD, '主卡 viewBox 绑定').toContain(":viewBox=\"'0 0 300 ' + LD_H\"");
    expect(VIEW, '对比卡 viewBox 绑定').toContain(":viewBox=\"'0 0 720 ' + CMP_H\"");
    /* 七百八十一批 K3 同步更新：迷你 viewBox 绑定锁随迷你 spark 退役删除 */
    expect(CARD, '命中换算 H 参').toContain('frac, 300, LD_H,');
    expect(CARD, 'hvTop 分母').toContain('/ LD_H * 100');
    expect(CARD, '阈值线 y 派生').toContain('LD_H - LD_H * (threshold / 100)');
    /* 六百八十一批同步更新：折线投影改 sparkPts 单源（622 §9-D4 平滑，catmullRomPath 消费同投影） */
    expect(CARD, '折线 pct/abs 单源').toContain("sparkPts(props.series, 300, LD_H, props.mode)");
  });
});

describe('六百二十九批②：参考网格 + 底基线（622 §2.3/§2.4）', () => {
  it('网格仅三张百分比卡（Heap/CPU/磁盘）；绝对值卡不画等分网格', () => {
    expect(CARD, '网格组在场（pct 卡）').toContain('class="ld-glines"');
    expect(CARD, '网格由 showGrid 门控').toContain('v-if="showGrid"');
    expect(CARD, 'showGrid = pct 语义').toContain("props.mode === 'pct'");
    expect(CARD, '网格由 PCT_GRID 驱动').toContain('v-for="g in PCT_GRID"');
    expect(CARD, '网格 y 派生自 LD_H').toContain(':y1="LD_H * (1 - g / 100)"');
    /* 视图传 mode：pct 三卡画网格，abs 两卡不画 */
    const pctModes = VIEW.match(/mode="pct"/g) ?? [];
    const absModes = VIEW.match(/mode="abs"/g) ?? [];
    expect(pctModes.length, 'pct 卡恰 3（heap/cpu/disk）').toBe(3);
    expect(absModes.length, 'abs 卡恰 2（qps/idx）').toBe(2);
  });

  it('底基线五张线卡齐（含绝对值卡：y=H 即 0 值线）', () => {
    expect(CARD, '底基线单源在场').toContain('class="ld-baseline"');
    expect(CARD, '基线 y 派生自 LD_H').toContain(':y1="LD_H" :y2="LD_H"');
    /* 基线恒渲染（不分 pct/abs）——5 卡复用同一组件模板 */
  });

  it('网格与基线置于面积之下（声明序即绘制序；622 §2.4 六层剖面）', () => {
    const gridIdx = CARD.indexOf('ld-glines');
    const baseIdx = CARD.indexOf('ld-baseline');
    /* 六百八十一批同步更新：面积 polygon→path.ld-area（622 §9-D4 平滑同曲线面积） */
    const polyIdx = CARD.indexOf('path class="ld-area"');
    expect(gridIdx, '网格在场').toBeGreaterThan(-1);
    expect(baseIdx, '基线在场').toBeGreaterThan(-1);
    expect(polyIdx, '面积在场').toBeGreaterThan(-1);
    expect(gridIdx, '网格声明序 < 基线').toBeLessThan(baseIdx);
    expect(baseIdx, '基线声明序 < 面积').toBeLessThan(polyIdx);
  });

  it('网格/基线走主题令牌 + non-scaling-stroke（拉伸下仍 1px 实线）', () => {
    expect(CARD, '网格线色走 --line').toMatch(/\.ld-glines line \{ stroke: var\(--line\); stroke-width: 1; \}/);
    expect(CARD, '基线色走 --line-strong').toMatch(/\.ld-baseline \{ stroke: var\(--line-strong\); stroke-width: 1; \}/);
    expect(CARD, '网格线抗拉伸').toContain(':y2="LD_H * (1 - g / 100)" vector-effect="non-scaling-stroke"');
    expect(CARD, '基线抗拉伸').toContain('vector-effect="non-scaling-stroke" />');
  });

  it('不动 .ld-chart 本体规则（796 同步更新：用户令大厂级统一卡壳——分节式 border-top 升 panel 壳，556/629 保形口径同步）', () => {
    expect(VIEW, '视图逐字保形（任务卡）').toContain('.ld-chart { background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-m); padding: var(--sp-3); }');
    expect(CARD, '组件逐字保形（五线卡根）').toContain('.ld-chart { background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-m); padding: var(--sp-3); }');
  });
});

describe('六百二十九批③：展开钮入头行（618 §0 病灶 #3 修）', () => {
  it('不再作标题行兄弟块孤浮；仍可由 .ld-chart .ld-expand 后代命中', () => {
    const siblings = CARD.match(/<\/div><button class="ld-expand"/g) ?? [];
    expect(siblings.length, '兄弟块形态清零').toBe(0);
    expect(CARD, '按钮仍在 .ld-chart-tt 头行内').toMatch(/<div class="ld-chart-tt">[\s\S]*?<button class="ld-expand"/);
    expect(CARD, '展开钮单源（组件模板 1 枚）').toMatch(/<button class="ld-expand"/);
    const wirings = VIEW.match(/toggleExpand\('/g) ?? [];
    expect(wirings.length, '展开接线数=顶部五线卡+历史卡+对比卡+Top（914 能力统一）').toBe(8);
    expect(CARD, '放大态类保留（liveExpand611 锚）').toContain('ld-chart-full');
  });
});
