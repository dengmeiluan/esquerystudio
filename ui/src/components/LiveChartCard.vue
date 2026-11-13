<!-- ·P1a-2：实时走势「主卡」统一件——合并 LiveDashboardView 五张折线卡
 （QPS/写入/Heap/CPU/磁盘）的重复结构。几何常量/点位纯函数走 utils/sparkChart 单源
 （P1a-1 下沉）；悬浮命中走 utils/sparkHover 单源；渐变 id 由父传 gid（保留 ldg- 前缀，
 逐实例派生）。

 设计要点（622 稿 P1 + plan-p1-livechartcard-637.md）：
 - 根元素即 .ld-chart（ 逐字锁 + 六卡计数锚不变）；
 - 头行 .ld-chart-tt 内：title + [window em] + 当前值 b（key=curKey 数值 roll）+ [阈值 em] + 展开钮；
 - 图体 .ld-svgwrap → SVG(defs 渐变/[网格]/底基线/面积 polygon/[阈值虚线]/折线 polyline) → 悬浮层三件 → 占位；
 - 悬浮层 HTML 绝对定位（不进 preserveAspectRatio=none 的 SVG，防椭圆/字变形）；
 - 父 scoped 选择器不命中子组件内部元素（ 先例）→ 本组件样式与 @keyframes 全在本 scoped 段。 -->
<template>
  <div class="ld-chart" :class="{ 'ld-chart-full': expanded }">
    <!-- 件1：卡头两行制（Grafana stat 卡语言）——行① 标题+窗标注（小灰读形上下文）
 +行② 当前值 28px KPI 大数（--fs-num-l 区块大数档，色=指标身份色 curColor 通道；
 挂墙态 fs-active 同档先例平移到常态）。旧单行「右浮 20px 值」退役。 -->
    <div class="ld-chart-tt">
      <span class="ld-chart-tt-top">
        {{ title }}<em v-if="window" class="ld-chart-th">近 {{ window }}</em><em v-if="threshold != null" class="ld-chart-th">阈值 {{ threshold }}%</em>
        <!-- 窗内峰值/均值（历史卡 hc-stats 同语言）：窄刺数据鼠标难以停驻刺顶，峰值直读 -->
        <span v-if="series.length > 1" class="ld-chart-stats">最大 <b>{{ statMax }}</b> · 均值 <b>{{ statAvg }}</b></span>
        <button class="ld-expand" type="button" :aria-label="expanded ? '还原' : '展开'" :title="expanded ? '还原' : '展开'" @click.stop="$emit('expand')">
          <Minimize2 v-if="expanded" :size="12" />
          <Maximize2 v-else :size="12" />
        </button>
      </span>
      <b class="ld-chart-cur ld-chart-kpi" :key="curKey" :style="{ color: curColor }" :title="curTitle">{{ curText }}</b>
    </div>
    <div ref="wrapEl" class="ld-svgwrap" @mousemove="onMove" @mouseleave="onLeave">
      <svg v-if="series.length > 1" :viewBox="'0 0 300 ' + LD_H" class="ld-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" :stop-color="color" stop-opacity=".22" />
            <stop offset="1" :stop-color="color" stop-opacity="0" />
          </linearGradient>
        </defs>
        <!-- 参考网格（仅百分比语义卡）——25/50/75 三条 1px --line，置于面积之下
 （622 六层剖面：网格→底基线→阈值带→面积→阈值虚线→折线） -->
        <g v-if="showGrid" class="ld-glines" aria-hidden="true">
          <line v-for="g in PCT_GRID" :key="g" x1="0" x2="300" :y1="LD_H * (1 - g / 100)" :y2="LD_H * (1 - g / 100)" vector-effect="non-scaling-stroke" />
        </g>
        <line class="ld-baseline" x1="0" x2="300" :y1="LD_H" :y2="LD_H" vector-effect="non-scaling-stroke" />
        <!-- （622 -D4）：折线/面积 Catmull-Rom 平滑（t=0.5+控制点钳位，sparkChart 单源）——
 主卡 polyline/polygon 退役改 path；对比卡/迷你 spark/HistoryChart 保持折线（591/615 锁面） -->
        <path class="ld-area" :d="areaD" :fill="'url(#' + gid + ')'" />
        <!-- K1：折线/阈值线挂 non-scaling-stroke——viewBox 300 横向拉伸下笔宽恒定
 （此前无该属性=视觉 3~4px「线粗遮挡文案」；HistoryChart/网格线既有同口径）；
 件3：2px→1.5px 与对比卡统一（781 用户「折线过粗」彻底兑现=主卡同律）。 -->
        <path class="ld-line" :d="lineD" fill="none" :stroke="color" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
        <!-- 件3：当前值末点呼吸点（transform/opacity 合成层动画=铁律 D 动效红线内；非 hit 态
 也有常驻「活着」信号=实时监控大气感；hit 态由 .ld-dot 精确圆点接管） -->
        <circle v-if="series.length > 1 && !hit" class="ld-line-pulse" :cx="pulseX" :cy="pulseY" r="3" :fill="color" aria-hidden="true" />
        <line v-if="threshold != null" x1="0" :y1="LD_H - LD_H * (threshold / 100)" x2="300" :y2="LD_H - LD_H * (threshold / 100)" stroke="var(--err)" stroke-dasharray="4 2" vector-effect="non-scaling-stroke" />
      </svg>
      <!-- K1：Y 轴左缘双刻度（HTML 层不随拉伸变形；HistoryChart .hc-ymax/.hc-yzero 同语言）
       + 阈值虚线右缘贴行标值（.hc-thlabel 同语言，底色抠线）
       + 中档三刻度（893 统一语言：pct 卡网格 25/50/75 线已有，刻度随线可读） -->
      <span v-if="series.length > 1" class="ld-yt ld-yt-top" aria-hidden="true">{{ yTop }}</span>
      <span v-for="g in (showGrid ? PCT_GRID : [])" :key="'yt' + g" class="ld-yt ld-yt-mid" :style="{ top: (100 - g) + '%' }" aria-hidden="true">{{ g }}</span>
      <span v-if="series.length > 1" class="ld-yt ld-yt-bot" aria-hidden="true">0</span>
      <span v-if="threshold != null" class="ld-thv" :style="{ top: (100 - threshold) + '%' }" aria-hidden="true">{{ threshold }}</span>
      <template v-if="hit">
        <div class="ld-hitlayer">
          <span class="ld-xline" :style="{ left: leftPct }" aria-hidden="true" />
          <span class="ld-yline" :style="{ top: (hoverY ?? 0).toFixed(1) + 'px' }" aria-hidden="true" />
          <span class="ld-dot" :style="{ left: leftPct, top: topPct, background: color }" aria-hidden="true" />
          <div class="ld-hv" :style="{ left: leftPct, transform: shift }" role="status">
            <span class="ld-hv-t">{{ timeText }}</span><b>{{ valueText }}</b>
          </div>
        </div>
      </template>
    </div>
    <!-- K1：X 轴时间锚移出图区——独立行 3 锚（start/mid/end）与折线零叠压
 （此前 absolute 叠在图内底部压线；HistoryChart .hc-xaxis 同语言） -->
    <div v-if="series.length > 1" class="ld-xaxis" aria-hidden="true">
      <span class="ld-ta ld-ta-l">{{ taStart }}</span>
      <span class="ld-ta ld-ta-m">{{ taMid }}</span>
      <span class="ld-ta ld-ta-r">{{ taEnd }}</span>
    </div>
    <div v-if="series.length < 2" class="ld-svg-wait"><SkeletonBox height="40" /><span class="ld-svg-wait-t">{{ waitText }}</span></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { Minimize2, Maximize2 } from 'lucide-vue-next';
import SkeletonBox from './SkeletonBox.vue';
import { LD_H, PCT_GRID, sparkPts, catmullRomPath, catmullRomAreaPath } from '../utils/sparkChart';
import { sparkHoverAt, createHoverDamp, lineYAtFrac, type SparkHoverHit } from '../utils/sparkHover';
import { fmtTime } from '../utils/format';
import { useHoverEscape } from '../composables/useHoverEscape';

const props = defineProps<{
  title: string;
  curText: string;
  curKey: string;
  curColor: string;
  curTitle?: string;
  window?: string;
  threshold?: number | null;
  series: number[];
  ts: number[];
  mode: 'pct' | 'abs';
  color: string;
  gid: string;
  expanded: boolean;
  waitText: string;
}>();
defineEmits<{ expand: [] }>();

/* 网格仅百分比语义卡（Heap/CPU/磁盘）；绝对值卡（QPS/写入）不画等分网格（622 诚实原则） */
const showGrid = computed(() => props.mode === 'pct');

/* 窗内峰值/均值（HistoryChart .hc-stats 同语言）：pct 档整数百分比（钳 100）、
 abs 档 ≥100 取整否则一位小数（与 yTop 同规则）——每张实时卡的最高点一眼直读 */
const statMax = computed(() => {
  const arr = props.series;
  if (arr.length < 2) return '';
  const mx = props.mode === 'pct' ? Math.min(100, Math.max(...arr)) : Math.max(...arr);
  return props.mode === 'pct' ? Math.round(mx) + '%' : mx >= 100 ? String(Math.round(mx)) : mx.toFixed(1);
});
const statAvg = computed(() => {
  const arr = props.series;
  if (arr.length < 2) return '';
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  return props.mode === 'pct' ? Math.round(avg) + '%' : avg >= 100 ? String(Math.round(avg)) : avg.toFixed(1);
});

/* （622 -D4）：平滑路径——折线与渐变面积同曲线（钳位在 sparkChart 单源内） */
const lineD = computed(() => catmullRomPath(sparkPts(props.series, 300, LD_H, props.mode), 300, LD_H));
const areaD = computed(() => catmullRomAreaPath(sparkPts(props.series, 300, LD_H, props.mode), 300, LD_H));
/* 件3（794）：末点呼吸点坐标（frac=1 的曲线 y，lineYAtFrac 单源=与悬浮读数同基准） */
const pulseY = computed(() => props.series.length > 1 ? lineYAtFrac(props.series, 1, LD_H, props.mode) : 0);
const pulseX = 300;

/* （622 -D5）：卡级时间锚=窗起/窗末（与悬浮层 tsWin 同切片口径）；
 K1：增中点锚（3 锚）并移出图区独立行 */
const tsWin = computed(() => props.ts.slice(Math.max(0, props.ts.length - props.series.length)));
const taStart = computed(() => fmtTime(tsWin.value[0] ?? 0));
const taEnd = computed(() => fmtTime(tsWin.value[tsWin.value.length - 1] ?? 0));
const taMid = computed(() => fmtTime(tsWin.value[Math.floor((tsWin.value.length - 1) / 2)] ?? 0));

/* K1：Y 轴顶刻度——pct 卡固定 0-100 域（=100）；abs 卡=窗峰值
 （max(...data,1) 地板刻度与折线同域；≥100 取整、<100 一位小数） */
const yTop = computed(() => {
  if (props.mode === 'pct') return '100';
  const mx = Math.max(...props.series, 1);
  return mx >= 100 ? String(Math.round(mx)) : mx.toFixed(1);
});

/* 悬浮读出直钉（用户复验「悬浮点不跟鼠标点+卡顿」定谳）：阻尼滑行（k=0.35 四帧
 收敛）的拖影在低帧率环境（远程桌面/高负载）成倍放大=读出永远落在指针后方；
 圆点 y 的抖动已由 lineYAtFrac 线性插值钉线消化，阻尼只剩拖影——工厂传 0=恒直钉
 （与对比卡/顶部图两条悬浮链的即时直钉语义对齐，四链统一「指针在哪、读出在哪」；
 reduce 档行为本就是直钉，条件分支随之合并）。k=0 时 settled 恒真，rAF 不再循环。 */
const damp = createHoverDamp(0);
const dispFrac = ref<number | null>(null);
let rafId: number | null = null;
let alive = true;
function tick() {
  rafId = null;
  if (!alive) return;
  const v = damp.frame();
  if (v !== null) dispFrac.value = v;
  if (!damp.settled) rafId = scheduleTick();
}
function scheduleTick(): number {
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : ((cb: () => void) => setTimeout(cb, 16) as unknown as number);
  return raf(tick);
}

/* 悬浮命中：单卡自持命中态（五卡此前在视图共享 hovers 记录，合并后各卡独立）；
 happy-dom 下 getBoundingClientRect 恒 0 → frac=0 → 命中首点（liveHover589 确定性锚）。 */
const hit = ref<SparkHoverHit | null>(null);
/* 指针 y（相对图区）——横向十字线 top（HistoryChart hc-yline 同语言：双线交点=指针位置） */
const hoverY = ref<number | null>(null);
function onMove(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement | null;
  /* frac 分母=绘图域（svg）而非含让位刻度列的 wrap——右移后两者差 36px，
   用 wrap 宽会把 frac 整体压小（命中点系统性左偏） */
  const svg = el?.querySelector('.ld-svg');
  const rect = (svg ?? el)?.getBoundingClientRect();
  const frac = rect && rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
  const wrap = el?.getBoundingClientRect();
  hoverY.value = wrap ? Math.min(Math.max(e.clientY - wrap.top, 0), wrap.height) : null;
  const tw = tsWin.value;
  hit.value = sparkHoverAt(props.series, tw, frac, 300, LD_H, props.mode);
  damp.move(frac);
  dispFrac.value = damp.value;
  if (rafId === null) rafId = scheduleTick();
}
function onLeave() {
  hit.value = null;
  hoverY.value = null;
  damp.clear();
  dispFrac.value = null;
  if (rafId !== null) {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
    else clearTimeout(rafId);
    rafId = null;
  }
}
/* mouseleave 在快速移出/重渲竞态下会丢，悬浮态残留（命中的点
 停在鼠标早已离开的位置）——坐标巡检兜底：悬浮期间任一移动落在图区外即清。 */
const wrapEl = ref<HTMLElement | null>(null);
useHoverEscape(
  () => hit.value != null,
  (e) => {
    const el = wrapEl.value;
    if (!el) return true;
    const r = el.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  },
  onLeave,
);
onUnmounted(() => { alive = false; });

/* 显示位分数（阻尼滑行值；直钉/未滑行时=命中 frac）；读出内容仍取目标采样点真值 */
const fx = computed(() => (hit.value ? (dispFrac.value ?? hit.value.frac) : 0));
const leftPct = computed(() => hit.value ? (fx.value * 100).toFixed(2) + '%' : '');
const topPct = computed(() => hit.value ? (lineYAtFrac(props.series, fx.value, LD_H, props.mode) / LD_H * 100).toFixed(2) + '%' : '');
const shift = computed(() => (hit.value && hit.value.frac > 0.72) ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)');
const valueText = computed(() => {
  const hv = hit.value;
  if (!hv) return '';
  const v = hv.v.toFixed(1);
  return props.mode === 'pct' ? v + '%' : v;
});
const timeText = computed(() => hit.value && hit.value.t ? fmtTime(hit.value.t) : '');
</script>

<style scoped>
/* 件1（用户三/四令「大厂级统一卡壳」）：「分节壳退役（border-top 承接分界）」
 随令升级推翻——六卡升 panel 壳（background+border+radius r-m）与节点卡/CollapsePanel/
 悬浮面板同语言=全站卡壳统一；卡内零嵌套（无卡中卡）=556 治理本意不破。
 逐字锁同步更新（。 */
.ld-chart { background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-m); padding: var(--sp-3); }
/* 件1：六卡高度一致档（常态卡高统一=整齐大气；挂墙/放大态不设限） */
.ld-chart:not(.ld-chart-full) { min-height: 208px; }
/* ══ 件3：质感升级——末点呼吸点+卡 hover 微亮（transform/opacity 合成层动画；
 reduced-motion 豁免）══
 件4：hover 过渡档统一 0.12s ease-out+边框亮档（壳化后 border-color 让位
 background 双通道=与节点卡 hover 完全同语言）。 */
.ld-line-pulse { transform-box: fill-box; transform-origin: center; animation: ld-card-pulse 2.4s ease-out infinite; pointer-events: none; }
@keyframes ld-card-pulse { 0% { transform: scale(1); opacity: .85; } 75% { transform: scale(2.8); opacity: 0; } 100% { transform: scale(2.8); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .ld-line-pulse { animation: none; } }
.ld-chart:not(.ld-chart-full) { transition: background .12s ease-out, border-color .12s ease-out; }
.ld-chart:not(.ld-chart-full):hover { background: var(--bg2); border-color: var(--tx2); }
/* 单卡放大全屏态——卡原地 fixed 覆盖视口（SVG 自适应放大），遮罩由视图 body.ld-chart-mask 承担 */
.ld-chart.ld-chart-full { position: fixed; inset: 4vh 4vw; z-index: var(--z-ctx); background: var(--panel); border: 1px solid var(--border); box-shadow: var(--shadow-m); }
.ld-chart-full .ld-svg { height: calc(100vh - var(--vh-offset)); } /* ：放大态 SVG 高度自适应（--vh-offset 口径=responsiveGuard239 白名单） */
.ld-chart-full .ld-chart-cur { font-size: var(--fs-num-l); } /* 放大态当前值同步升档（28px 区块大数） */
.ld-expand { margin-left: var(--sp-1); background: transparent; border: none; color: var(--muted); cursor: pointer; padding: var(--sp-0); display: inline-flex; align-items: center; } /* ：2px→var(--sp-0) 精确等值合并（spResidue590 锁），渲染零变化 */
.ld-expand:hover { color: var(--tx1); }
.ld-chart-tt { margin-bottom: var(--sp-2); }
/* 件1：两行制卡头——行① 标题+窗标注+展开钮（右浮）；行② KPI 大数
 （28px 区块大数档；margin-left:auto 退役=大数左对齐主视觉；mono+tabular 跳动不抖宽） */
.ld-chart-tt-top { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-xs); color: var(--muted); }
/* 统计条推右承担原展开钮的 auto 落位；展开钮改常规间距（HistoryChart .hc-stats 同语言） */
.ld-chart-stats { margin-left: auto; font-size: var(--fs-2xs); color: var(--tx2); font-family: var(--mono); white-space: nowrap; }
.ld-chart-stats b { color: var(--tx0); font-weight: 600; font-variant-numeric: tabular-nums; }
.ld-chart-tt-top .ld-expand { margin-left: var(--sp-1); }
.ld-chart-cur { display: block; font-family: var(--mono); font-size: var(--fs-num-l); font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.25; margin: var(--sp-0) 0 var(--sp-1); }
.ld-chart-th { font-size: var(--fs-2xs); font-style: normal; color: var(--muted); }
.ld-svg { width: 100%; height: 88px; display: block; }
/* 网格线（--line）与底基线（--line-strong）——non-scaling-stroke 保证
 preserveAspectRatio="none" 拉伸下仍为 1px 实线；置于面积之下（声明序即绘制序） */
.ld-glines line { stroke: var(--line); stroke-width: 1; }
.ld-baseline { stroke: var(--line-strong); stroke-width: 1; }
/* 悬浮详情层——十字线/圆点/读出走 HTML 绝对定位层（圆点/文本不进 SVG 防变形） */
/* 绘图域右移让出左刻度列（HistoryChart .hc-canvas left:36px 同语言）——
 曲线不再横穿 Y 轴刻度文字（多档刻度后遮挡暴露）；刻度列 32px 右对齐贴域 */
.ld-svgwrap { position: relative; padding-left: 36px; }
/* 悬浮层（十字线/圆点/读数）锚绘图域：left 36px 起，% 定位与 frac 同域零错位 */
.ld-hitlayer { position: absolute; top: 0; bottom: 0; left: 36px; right: 0; pointer-events: none; }
.ld-xline { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--tx2); opacity: .45; pointer-events: none; }
/* 横向十字线（HistoryChart .hc-yline 同语言）——双线交点=指针位置 */
.ld-yline { position: absolute; left: 0; right: 0; height: 1px; background: var(--tx2); opacity: .45; pointer-events: none; }
.ld-dot { position: absolute; width: 6px; height: 6px; border-radius: 50%; border: 2px solid var(--bg2); transform: translate(-50%, -50%); pointer-events: none; }
.ld-hv { position: absolute; top: var(--sp-1); z-index: 2; pointer-events: none; display: flex; align-items: baseline; gap: var(--sp-1); background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r-s); box-shadow: var(--shadow-m); padding: 0 var(--sp-1); font-size: var(--fs-2xs); white-space: nowrap; font-variant-numeric: tabular-nums; }
.ld-hv-t { color: var(--tx2); font-family: var(--mono); }
.ld-hv b { font-family: var(--mono); }
/* 采样占位（ 骨架化 + x3 扫描 --tx1 提档） */
.ld-svg-wait { height: 88px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-1); font-size: var(--fs-xs); color: var(--tx1); }
/* G'1（台账 ）：900 窄档主卡满宽 88px 纵横比过扁（ 重盘 G'1 候选）——
 渲染高随档位微升至 110px（<120 对比卡，层级不倒挂；占位同步等高防采样切换跳变）。
 只动渲染高不接管数据坐标系：viewBox/悬浮命中仍走 LD_H（ 放大态同范式，拉伸 +
 百分比定位自洽）；放大态规则 (0,2,0) 特异性更高，全屏自适应不受本档影响。 */
@media (max-width: 900px) {
  .ld-svg { height: 110px; }
  .ld-svg-wait { height: 110px; }
  /* 窄档卡头收纳统计条（标题/窗口/阈值/按钮已满行；历史卡 stats 空间宽裕保留） */
  .ld-chart-stats { display: none; }
}
/* K1：X 轴时间行——图区之下独立行（与折线零叠压；HistoryChart .hc-xaxis
 同语言）。ld-ta-l/-m/-r 类名保留为锚（681 D5/684 墙域锁面），落位由 flex 承担 */
.ld-xaxis { display: flex; justify-content: space-between; margin-top: var(--sp-1); font-size: var(--fs-2xs); color: var(--tx2); font-family: var(--mono); font-variant-numeric: tabular-nums; }
.ld-ta { pointer-events: none; }
/* K1：Y 轴左缘双刻度（HTML 层不被拉伸变形；tx1 提亮可读=实报「轴信息
 不可读」对策；HistoryChart .hc-ymax/.hc-yzero 同语言） */
.ld-yt { position: absolute; left: 0; width: 32px; text-align: right; font-size: var(--fs-2xs); color: var(--tx1); font-family: var(--mono); line-height: 1.2; pointer-events: none; } /* 右对齐贴绘图域左缘（36px 让位列内，HistoryChart .hc-yt 同语言） */
.ld-yt-top { top: 0; }
.ld-yt-bot { bottom: 0; }
/* 中档刻度贴网格线（25/50/75 线位=75%/50%/25% 高度，translateY 居中锚线；历史卡 .hc-yt 同语言） */
.ld-yt-mid { transform: translateY(-50%); }
/* 阈值行标签：右缘贴线居中+底色抠线（.hc-thlabel 同语言） */
.ld-thv { position: absolute; right: 0; transform: translateY(-50%); font-size: var(--fs-2xs); color: var(--err); font-family: var(--mono); pointer-events: none; background: var(--bg1); padding: 0 var(--sp-0); }
/* （622 ）：按下反馈——transform-only 不触发布局（--dur-fast 微交互档） */
.ld-expand { transition: transform var(--dur-fast) var(--ease-out); }
.ld-expand:active { transform: scale(.92); }
/* 数值 roll（622 ）——值变换节点才重放；只动 transform/opacity 不触发布局 */
@keyframes ld-roll { from { opacity: 0; transform: translate3d(0, 7px, 0); } }
.ld-chart-cur { animation: ld-roll var(--dur-base) var(--ease-out); }
</style>
