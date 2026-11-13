/**
 * 六百三十三批：交互丝滑收官——卡片入场编排（622 §3.3）+ 数值 roll（§3.4）。
 *
 * 判据：
 *   1) **入场编排**：页面四个区容器（六卡 / 节点 / 告警 / 历史）挂 `data-st="1..4"`，
 *      页根在挂载后加 `.st-in` 触发；`[data-st]` 初态 opacity:0 + translate3d(0,8px,0)，
 *      入场走 `--dur-base`/`--ease-out` 过渡，逐区延迟 `0 / 1×stagger / 2× / 3×`（按区分组）；
 *   2) **数值 roll**：`@keyframes ld-roll`（opacity + translateY 7px，只动 transform/opacity
 *      不触发布局），挂在 `.ld-page .ld-chart-cur`；六处当前值靠 `:key` 绑定数值
 *      （值变才换节点 → 才重放动画；值不变不抖）；
 *   3) **降级**：视图内 reduced-motion 块仅允许 pulse 终帧隐形类豁免（恰 1 处）——
 *      纯 transition/animation 时长压缩由 theme.css 全局兜底覆盖（`*{transition-duration:
 *      .01ms!important}`，adaptive556 计数锁，625-C1/632-C1 同律）；但呼吸点类 keyframes
 *      100% 帧=opacity:0，全局兜底 .01ms 停帧会让降级态停在隐形帧（端点消失），须
 *      `animation: none` 停在可见基态（LiveChartCard `.ld-line-pulse` / HistoryChart
 *      `.hc-pulse` 组件域同构先例）。白名单外新增即红。
 * 负锁剥注释（unifyWave561 口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const VIEW = codeOf('views/LiveDashboardView.vue');
const CARD = codeOf('components/LiveChartCard.vue'); /* 六百三十八批 P1a-2：五线卡合并进组件 */

describe('六百三十三批①：按区入场编排（622 §3.3）', () => {
  it('四区容器挂 data-st 1..4（六卡 / 节点 / 告警 / 历史，按区分组）', () => {
    expect(VIEW, '六卡区').toMatch(/<div class="ld-charts" data-st="1" /);
    expect(VIEW, '节点区').toMatch(/<div class="ld-nodes" data-st="2" /);
    /* 八百二十六批B3 同步更新：告警区空态整行 v-if 前缀（搁浅分隔条退役） */
    expect(VIEW, '告警区').toMatch(/<div v-if="activeAlerts\.length \|\| resolvedAlerts\.length" class="ld-alerts" data-st="3" /);
    expect(VIEW, '历史区').toMatch(/<div class="ld-hist" data-st="4" /);
  });

  it('四区自带 .st-in 触发（实测 DOM：四区与 .ld-page 平级，不可依赖祖先）', () => {
    ['ld-charts" data-st="1"', 'ld-nodes" data-st="2"', 'ld-alerts" data-st="3"', 'ld-hist" data-st="4"'].forEach(sel => {
      const i = VIEW.indexOf(sel);
      expect(i, sel + ' 在场').toBeGreaterThan(-1);
      expect(VIEW.slice(i, i + 120), sel + ' 带 st-in 绑定').toContain(':class="{ \'st-in\': pageIn }"');
    });
    expect(VIEW, 'pageIn ref').toContain('const pageIn = ref(false);');
    expect(VIEW, '挂载后翻真').toMatch(/pageIn\.value = true/);
  });

  it('初态 / 过渡 / 逐区延迟（0 / 1× / 2× / 3× stagger）', () => {
    expect(VIEW, '初态位移+透明').toContain('[data-st] { opacity: 0; transform: translate3d(0, 8px, 0); }');
    expect(VIEW, '入场过渡').toMatch(/\[data-st\]\.st-in \{ opacity: 1; transform: none; transition: opacity var\(--dur-base\) var\(--ease-out\), transform var\(--dur-base\) var\(--ease-out\); \}/);
    expect(VIEW, '延迟档 1').toContain('[data-st="1"].st-in { transition-delay: 0ms; }');
    expect(VIEW, '延迟档 2').toContain('[data-st="2"].st-in { transition-delay: var(--stagger); }');
    expect(VIEW, '延迟档 3').toContain('[data-st="3"].st-in { transition-delay: calc(var(--stagger) * 2); }');
    expect(VIEW, '延迟档 4').toContain('[data-st="4"].st-in { transition-delay: calc(var(--stagger) * 3); }');
  });

  it('只动 transform/opacity（不触发布局属性）', () => {
    const stBlock = VIEW.slice(VIEW.indexOf('[data-st] { opacity: 0;'), VIEW.indexOf('[data-st].st-in { opacity: 1;'));
    expect(stBlock, '入场初态无布局属性').not.toMatch(/height|width|margin|padding/);
  });

  it('视图内 reduced-motion 块仅 pulse 终帧隐形豁免（恰 1 处；全局兜底停帧=端点隐形，须 none 停可见基态）', () => {
    const pulse = VIEW.match(/@media \(prefers-reduced-motion: reduce\) \{ \.ld-ncmp-pulse \{ animation: none; \} \}/g) ?? [];
    expect(pulse.length, '呼吸点降级块恰 1 处（keyframes 100% 帧 opacity:0，兜底 .01ms 停帧不可见）').toBe(1);
    expect((VIEW.match(/prefers-reduced-motion/g) ?? []).length, '白名单外零新增 reduced-motion 字面').toBe(1);
  });
});

describe('六百三十三批②：数值 roll（622 §3.4）', () => {
  it('@keyframes ld-roll + 挂 .ld-charts .ld-chart-cur（不动既有 .ld-chart-cur 规则）', () => {
    expect(VIEW, 'keyframes 名').toMatch(/@keyframes ld-roll \{ from \{ opacity: 0; transform: translate3d\(0, 7px, 0\); \} \}/);
    expect(VIEW, '动画挂载').toMatch(/\.ld-charts \.ld-chart-cur \{ animation: ld-roll var\(--dur-base\) var\(--ease-out\); \}/);
    /* 既有档位规则逐字保形（liveVisual597 锚；799 同步更新：任务卡头升两行制 KPI=fs-num→fs-num-l 28px 与 LiveChartCard 同构） */
    expect(VIEW, '档位规则保形（799 终态）').toMatch(/\.ld-chart-cur \{ display: block; font-family: var\(--mono\); font-size: var\(--fs-num-l\);/);
  });

  it('六处当前值 :key 绑数值（值变才换节点 → 才重放）', () => {
    /* 五线卡 :key 经 cur-key 传入组件（组件内 :key="curKey"）；任务卡 :key 留视图 */
    /* 六百四十七批同步更新（击穿者：G'3——cur-text/cur-key 合并 *Text computed，无数据回落
       「—」语义；:key 仍绑值派生表达式：text 值变才变、「—」态稳定不重放，锁意图零回退） */
    const keys = VIEW.match(/:cur-key="(qpsText|idxText|heapText|cpuText|diskText)"/g) ?? [];
    expect(keys.length, '五线卡 cur-key 传入').toBe(5);
    expect(VIEW, '任务卡 :key').toContain(':key="runningJobs.length"');
    expect(CARD, '组件内 :key 绑 curKey（值变换节点才重放）').toContain(':key="curKey"');
  });

  it('roll 只动 transform/opacity', () => {
    const kf = VIEW.slice(VIEW.indexOf('@keyframes ld-roll'), VIEW.indexOf('@keyframes ld-roll') + 120);
    expect(kf).not.toMatch(/height|width|margin|padding/);
  });
});
