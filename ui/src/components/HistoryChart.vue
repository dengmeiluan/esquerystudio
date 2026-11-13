<template>
  <!-- 监控历史趋势图卡统一件（对标阿里云监控图卡；LiveDashboard 历史趋势分区消费）。
 分层策略：SVG（viewBox 600x220 preserveAspectRatio=none 拉伸）只画随数据缩放的
 渐变面积/折线/阈值虚线（vector-effect=non-scaling-stroke 保线宽不随拉伸变形）；
 Y 轴刻度/十字线/最近点圆点/tooltip 全在 HTML 绝对定位层——文本与圆不被非等比
 拉伸变形。图例 chips 点击切换序列可见性：隐藏序列不画线、不进 tooltip/统计，
 色号按 name 排序位锚定不换色。折线/面积走 polylineSegments 分段渲染：gapMs 传入即
 断档感知（相邻点 Δt 超阈值断线——降采样空桶=集群失联未采时段，不画跨档假线/假面）。
 纯 SVG+HTML，不引第三方图表库。 -->
  <div class="hc" :class="{ 'hc-full': expanded }">
    <!-- 799 件2（用户五令「大厂级」：历史五图卡头与六卡 KPI 语言对齐）——
 行① 标题+单位（小灰）+最大/均值（右浮小字）；行② 当前值 28px 大数
 （色=首可见序列身份色，与六卡 curColor 同构；多序列叠加语义=聚合当前值）。 -->
    <div class="hc-hd">
      <span class="hc-top">
        <span class="hc-tt">{{ title }}<em v-if="unit && !unitDup" class="hc-unit">{{ unit }}</em></span>
        <span v-if="hasVisible" class="hc-stats">
          最大 <b>{{ fmtV(stats.max) }}</b> · 均值 <b>{{ fmtV(stats.avg) }}</b>
        </span>
        <!-- 展开钮（LiveChartCard ld-expand 同语言）：全卡放大，能力与顶部卡统一 -->
        <button type="button" class="hc-expand" :aria-label="expanded ? '还原' : '展开'" :title="expanded ? '还原' : '展开'" @click.stop="$emit('expand')">
          <Minimize2 v-if="expanded" :size="12" />
          <Maximize2 v-else :size="12" />
        </button>
      </span>
      <b v-if="hasVisible" class="hc-cur" :style="{ color: colorOf(visibleSeries[0]?.name || '') }" title="当前值（可见序列聚合最新点）">{{ fmtV(stats.cur) }}</b>
    </div>
    <div v-if="note" class="hc-note">{{ note }}</div>

    <div class="hc-plot" :style="plotStyle">
      <template v-if="hasVisible">
        <!-- 件2：.hc-canvas 内壳=绘图域整体右移让出左刻度列（36px）——线和文字不遮挡。
 Y 三刻度锚 .hc-plot 左列（0..32px 右对齐）；十字线/圆点/tooltip 的 % 域随 canvas 对齐零错位。
 〔内勘正：初版把三刻度也裹进 canvas——整体右移后相对几何不变=线与文字仍重叠
 （真机探针 S2 gap=-32 铁证）；刻度留在 plot 左列才真让位〕 -->
        <span class="hc-ymax">{{ fmtV(yMaxV) }}</span>
        <!-- 件2：Y 中档三刻度（75/50/25%——与 ymax/yzero 合成五档，802 topYTicks 同构语言） -->
        <span v-for="(v, i) in hcYMid" :key="'ym' + i" class="hc-yt" :style="{ top: HC_YT_POS[i] }" aria-hidden="true">{{ fmtV(v) }}</span>
        <span class="hc-yzero">0</span>
        <!-- 指针命中域=绘图域本体（.hc-canvas）：hoverFrac 必须对 canvas 矩形取分数，
	 若对 .hc-plot 全宽取值则左刻度列 36px 计入分母——十字线/圆点/tooltip 整体
	 右偏（左缘最大 36px，右缘归零），即实报「鼠标实际位置与点位置对不上」根因 -->
        <!-- 键盘步进（铁律 B 键盘可达）：focus 即显十字线，←/→ 逐采样步进（比鼠标更易
         停驻窄刺顶点）、Home/End 跳两端、Esc 收十字线——无鼠标场景的读数通道 -->
        <div ref="canvasEl" class="hc-canvas" tabindex="0" role="img"
          :aria-label="title + '：' + visibleSeries.length + ' 个序列，方向键逐采样读数'"
          @pointermove="onMove" @pointerleave="onLeave" @focus="onFocus" @blur="onBlur" @keydown="onKeydown">
        <svg class="hc-svg" viewBox="0 0 600 220" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <!-- 渐变只跟随 areaSeries（单序列常态/hover 高亮序列）——多序列常态零面积：
                 九层渐变互相叠加=图面浑浊的根源；单层 0.2 渐变=主卡 LiveChartCard 同档质感 -->
            <linearGradient v-for="(s, i) in areaSeries" :key="'g' + s.name" :id="gidOf(i)" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" :stop-color="colorOf(s.name)" stop-opacity="0.2" />
              <stop offset="1" :stop-color="colorOf(s.name)" stop-opacity="0" />
            </linearGradient>
          </defs>
          <!-- 件2：横向网格三线（25/50/75%——主卡 .ld-glines 同语言实线；治「白板图」；
 画在序列之下（声明序即绘制序），vector-effect 保线宽不随拉伸变形 -->
          <line v-for="gy in HC_GRID" :key="'hg' + gy" class="hc-grid" x1="0" x2="600"
            :y1="(PLOT_H * (1 - gy)).toFixed(1)" :y2="(PLOT_H * (1 - gy)).toFixed(1)" vector-effect="non-scaling-stroke" />
          <template v-for="s in visibleSeries" :key="s.name">
            <!-- 状态色带（RED 时段背景带，画在面积/折线之下——声明序即绘制序）：
 断链轮采集器落 status=red doc（无指标字段=折线在此断档），色带把
 「没采到」与「集群红了」在视觉上区分开 -->
            <rect v-for="(b, bi) in bandRects" :key="'band' + bi" class="hc-band" :x="b.x" :y="0"
              :width="b.w" :height="PLOT_H"><title>{{ b.label }}</title></rect>
            <!-- 告警事件条：与色带同层的窄竖条（level 染色 CRIT err/WARN wn），title=事件文案——
 事件轴收敛进色带体系（宽时段=色带，瞬时点=窄条），替代顶部菱形散标记 -->
            <rect v-for="(e, ei) in eventRects" :key="'ev' + ei" class="hc-evband" :x="e.x" :y="0"
              :width="e.w" :height="PLOT_H" :fill="e.color" opacity="0.15"><title>{{ e.title }}</title></rect>
            <!-- 面积只随 areaSeries：单序列常态（主卡形态）或 hover 高亮序列（联动聚焦）——
             声明序保持 band→area→line（monitorHistoryTrend 锁：色带画在数据之下）；
             断档分段语义保留（每段独立落底闭合，不造跨档假面） -->
            <template v-for="(as, ai) in areaSeries" :key="'aw' + as.name">
              <path v-for="(d, di) in areaSegs(as)" :key="'a' + as.name + di" class="hc-area" :d="d" :fill="'url(#' + gidOf(ai) + ')'" />
            </template>
            <!-- 折线平滑统一——段内 Catmull-Rom（六卡同款），段间断开语义由 polylineSegments 保留；
             线宽 1.5px=主卡/对比卡同律；hover 联动：hot 序列升亮、其余退灰（is-dim/is-hot） -->
            <path v-for="(d, pi) in lineSegPaths(s)" :key="'l' + pi" class="hc-line"
              :class="hotActive ? (s.name === hotName ? 'is-hot' : 'is-dim') : ''" :d="d" fill="none"
              :stroke="colorOf(s.name)" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
          </template>
          <!-- R5 外推预测段：同色 dashed（无面积、不出 tooltip），从最后实测点外推到阈值/地平线 -->
          <polyline v-for="f in forecastSegs" :key="'f' + f.name" class="hc-fc" :points="f.attr" fill="none"
            :stroke="colorOf(f.name)" stroke-width="2" stroke-dasharray="6 5" vector-effect="non-scaling-stroke" opacity="0.75" />
          <!-- 阈值参考线：超 y 域（阈值 ≥ max*1.1）不画——域按数据固定，健康数据不硬撑轴 -->
          <line v-if="thresholdY != null" class="hc-thline" x1="0" :y1="thresholdY" x2="600" :y2="thresholdY"
            stroke="var(--err)" stroke-dasharray="5 4" vector-effect="non-scaling-stroke" />
        </svg>
        <span v-if="thLabelTop" class="hc-thlabel" :style="{ top: thLabelTop }">{{ fmtV(threshold!) }}</span>
        <!-- 单点序列画不出线：以恒亮圆点呈现（悬停圆点同形态） -->
        <span v-for="d in soloDots" :key="'solo' + d.name" class="hc-dot" :style="{ left: d.left, top: d.top, background: d.color }" aria-hidden="true" />
        <!-- 质感件：末端呼吸点（单序列常态/hover 高亮序列；HTML 层定位=不被 preserveAspectRatio 拉伸变形，主卡 ld-line-pulse 同语言） -->
        <span v-if="pulseDot" class="hc-dot hc-pulse" :style="{ left: pulseDot.left, top: pulseDot.top, background: pulseDot.color }" aria-hidden="true" />
        <template v-if="hoverFrac != null">
          <span class="hc-xline" :style="{ left: (hoverFrac * 100).toFixed(2) + '%' }" aria-hidden="true" />
          <!-- 横向十字线（top 跟指针 y）——竖线对 x、横线对 y，交点即指针位置；读数/圆点贴线 -->
          <span class="hc-yline" :style="{ top: (hoverY ?? 0).toFixed(1) + 'px' }" aria-hidden="true" />
          <span v-for="d in hoverDots" :key="'hd' + d.name" class="hc-dot" :style="{ left: d.left, top: d.top, background: d.color }" aria-hidden="true" />
          <div class="hc-tip" :style="tipStyle" role="status">
            <div class="hc-tip-t">{{ tipTime }}</div>
            <div v-for="r in tipRows" :key="r.name" class="hc-tip-row">
              <i :style="{ background: r.color }" aria-hidden="true" />
              <span class="hc-tip-nm">{{ r.name }}</span>
              <b>{{ r.text }}</b>
            </div>
            <!-- tooltip 富化：窗口内告警事件行（level 色+完整文案） -->
            <div v-for="(a, ai) in hoverAlerts" :key="'al' + ai" class="hc-tip-row hc-tip-al">
              <i :style="{ background: a.color }" aria-hidden="true" />
              <span class="hc-tip-nm">{{ a.label }}</span>
            </div>
          </div>
        </template>
        </div>
      </template>
      <!-- 序列空/全隐藏：统一空态（EmptyState compact 统一件） -->
      <EmptyState v-else compact :icon="Activity" text="暂无采样" class="hc-empty" />
    </div>

    <div v-if="series.length" class="hc-legend">
      <!-- hover/focus 联动高亮（Datadog 图例语言）：chip 悬停/键盘聚焦→图内该序列唯一面积+升亮、其余退灰 -->
      <!-- 峰值标注：chip 内直接给出该序列全窗最大值——窄刺峰（1-2 桶宽）鼠标难以
       精确停驻，最高点读数不必再追逐十字线（峰值口径与卡头 stats.max 单序列同源） -->
      <button v-for="s in series" :key="'lg' + s.name" type="button" class="hc-chip" :class="{ off: hidden.has(s.name) }"
        :aria-pressed="!hidden.has(s.name)" :title="(hidden.has(s.name) ? '点击显示 ' : '点击隐藏 ') + s.name + '（峰 ' + peakOf(s.name) + '）'"
        @click="toggleVisible(s.name)"
        @mouseenter="hotName = s.name" @mouseleave="hotName = null"
        @focus="hotName = s.name" @blur="hotName = null">
        <i :style="{ background: colorOf(s.name) }" aria-hidden="true" />{{ s.name }}<em class="hc-chip-peak">{{ peakOf(s.name) }}</em>
      </button>
    </div>
    <div v-if="hasVisible" class="hc-xaxis">
      <span v-for="tk in ticks" :key="tk">{{ tickLabel(tk) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Activity, Maximize2, Minimize2 } from 'lucide-vue-next';

import EmptyState from './EmptyState.vue';
import { yMaxOf, timeTicks, fmtUnit, polylineSegments, type NamedSeries, type SeriesPoint } from '../utils/monitorSeries';
import { catmullRomPath, catmullRomAreaPath, type Pt } from '../utils/sparkChart'; /* ：折线平滑统一（六卡同款 Catmull-Rom 单源） */

const props = defineProps<{
  /** 图卡标题（如「QPS（搜索/秒）」——单位已含中文括号时 unit 省略） */
  title: string;
  /** 值单位（统计条/tooltip/Y 轴格式化用，如 '%'） */
  unit?: string;
  /** 序列集（调用方剔点后的 NamedSeries，name 升序；点缺失无需组件处理） */
  series: NamedSeries[];
  /** 阈值参考线（如 Heap 80%） */
  threshold?: number;
  /** 图区高度覆盖（px；缺省 180 桌面 / 140 窄屏） */
  height?: number;
  /** 值格式化覆盖（缺省按 unit 走 fmtUnit 单源） */
  fmt?: (v: number) => string;
  /** 序列调色板（NamedSeries 无色字段：按 name 排序位轮替取色，色号锚定不随显隐变化） */
  palette?: string[];
  /** 断档感知桶距（ms）：相邻点 Δt > gapMs 即断线（降采样空桶=集群失联未采，不画跨档假线）；
 缺省 undefined 永不断开——单段渲染，行为与分段改造前一致 */
  gapMs?: number;
  /** R5 外推预测段（磁盘水位等）：同色 dashed 虚线（无面积、不出 tooltip），name 对应实线序列 */
  forecast?: NamedSeries[];
  /** 预测/健康提示语（卡头下小字，如「腾讯云QA 预计 12.3 天后磁盘达 85%」） */
  note?: string;
  /** RED 时段色带（视图层由 redBands(records) 从 status='red' 采样合成；label=悬停原生提示） */
  statusBands?: { from: number; to: number; label?: string }[];
  /** tooltip 告警窗口参数化：悬停命中窗=域宽×windowPct（缺省 0.02，随图域自适应） */
  tooltipWindowPct?: number;
  /** 告警事件标记（图域内竖直位置固定顶部的菱形点，title=事件文案；域外自动跳过） */
  events?: { t: number; label: string; level?: string }[];
  /** 全屏展开态（视图层 expandedCard 键控；能力与顶部 KPI 卡统一） */
  expanded?: boolean;
}>();

defineEmits<{ expand: [] }>();

/* ═══ 色号锚定 ═══ */
const PALETTE = ['var(--dv-blue)', 'var(--ok)', 'var(--wn)', 'var(--err)', 'var(--ac)'];
/* 标题已含单位串时 em 不重复渲染（877 全量扫描定谳）：HIST_CHARTS 六处调用点违
 「title 已含单位则 unit 省略」调用约定（如 label'Heap %'+unit'%' → 「Heap % %」双写），
 防重收敛为组件级正确性——调用侧漏省不再出双单位，Y 轴/tooltip 的 unit 格式化不受影响 */
const unitDup = computed(() => !!props.unit && props.title.includes(props.unit));
const sortedNames = computed(() => props.series.map(s => s.name).sort());
function colorOf(name: string): string {
  const pal = props.palette || PALETTE;
  const i = sortedNames.value.indexOf(name);
  return pal[i < 0 ? 0 : i % pal.length];
}

/* ═══ 可见性（图例 chips 切换；隐藏=不画线/不进 tooltip/不进统计） ═══ */
const hidden = ref(new Set<string>());
function toggleVisible(name: string) {
  const next = new Set(hidden.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  hidden.value = next;
}
const visibleSeries = computed(() => props.series.filter(s => !hidden.value.has(s.name)));
const hasVisible = computed(() => visibleSeries.value.some(s => s.points.length > 0));

/* ═══ 质感分层（曲线质感对齐顶部主卡档）═══
 多序列常态零面积——九层渐变互相叠加=图面浑浊根源；层次靠联动高亮：
 图例 chip hover/键盘 focus → hotName → 该序列唯一面积渐变（主卡同档 0.2）+ 线升亮，
 其余序列退灰（is-dim）——Datadog/Grafana 图例联动语言。单序列=主卡形态（常态带面积）。 */
const hotName = ref<string | null>(null);
/* hot 只有命中「可见序列」才生效（隐藏序列的 chip 悬停不触发全场退灰） */
const hotActive = computed(() => !!hotName.value && visibleSeries.value.some(s => s.name === hotName.value));
const areaSeries = computed<NamedSeries[]>(() => {
  const vis = visibleSeries.value.filter(s => s.points.length > 0);
  if (vis.length <= 1) return vis;
  const hot = vis.find(s => s.name === hotName.value);
  return hot ? [hot] : [];
});
/* 末端呼吸点：与面积同源序列的最后采样点（HTML 层百分比定位，不被 SVG 拉伸变形） */
const pulseDot = computed(() => {
  const s = areaSeries.value[0];
  if (!s || !s.points.length) return null;
  const last = s.points[s.points.length - 1]!;
  return {
    left: ((px(last.t) / PLOT_W) * 100).toFixed(2) + '%',
    top: ((py(last.v) / PLOT_H) * 100).toFixed(2) + '%',
    color: colorOf(s.name),
  };
});

/* 图例 chip 峰值（该序列全窗最大）：每次计算后按序列名缓存（序列点集随取数整体替换，
 以引用变化为失效依据足够）；降采样窄刺峰鼠标停不住，最高点读数走图例直读 */
const peakCache = computed(() => {
  const m = new Map<string, string>();
  for (const s of props.series) {
    let mx = -Infinity;
    for (const p of s.points) if (p.v > mx) mx = p.v;
    m.set(s.name, s.points.length ? fmtV(mx) : '—');
  }
  return m;
});
function peakOf(name: string): string {
  return peakCache.value.get(name) ?? '—';
}

/* ═══ 坐标域与点位换算（viewBox 固定 600x220，preserveAspectRatio=none 拉伸） ═══ */
const PLOT_W = 600;
const PLOT_H = 220;
/* 件2：网格三线档位（25/50/75%）+Y 中档刻度位（802 Top 曲线底座同构语言） */
const HC_GRID = [0.25, 0.5, 0.75];
const HC_YT_POS = ['25%', '50%', '75%'];
const hcYMid = computed(() => [0.75, 0.5, 0.25].map(f => yMaxV.value * f));
const dom = computed(() => {
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const s of visibleSeries.value) {
    for (const p of s.points) {
      if (p.t < tMin) tMin = p.t;
      if (p.t > tMax) tMax = p.t;
    }
  }
  /* R5 外推段纳入 x 域：预测终点超最后实测点时域右延（给预测虚线留出画布） */
  for (const f of props.forecast || []) {
    for (const p of f.points) {
      if (p.t > tMax) tMax = p.t;
      if (p.t < tMin) tMin = p.t;
    }
  }
  if (!Number.isFinite(tMin) || !Number.isFinite(tMax)) return { tMin: 0, tMax: 0, span: 0 };
  return { tMin, tMax, span: tMax - tMin };
});
const yMaxV = computed(() => yMaxOf([...visibleSeries.value, ...(props.forecast || [])]));
function px(t: number): number {
  return dom.value.span > 0 ? ((t - dom.value.tMin) / dom.value.span) * PLOT_W : 0;
}
function py(v: number): number {
  return PLOT_H - (v / yMaxV.value) * PLOT_H;
}
/* ═══ 折线/面积分段渲染（polylineSegments 单源）：
 多序列同图必须传共享域（时间域=dom、值域=yMaxV，与十字线/悬浮点映射 px/py 同源）
 ——各线若按自身点建域会被各自拉伸满宽满高，曲线视觉位置与悬浮读数错位。
 无 gapMs=单段（与旧整线形态一致）；断档感知下每段独立落底闭合（断档处
 不连线、不造跨档填充假面）。段缓存按序列名收一次，面积/折线两组 v-for 共读，
 不重复计算 */
const segCache = computed(() => {
  const m = new Map<string, string[]>();
  const domain = { tMin: dom.value.tMin, tMax: dom.value.tMax, yMax: yMaxV.value };
  for (const s of visibleSeries.value) m.set(s.name, polylineSegments(s.points, PLOT_W, PLOT_H, props.gapMs, domain));
  return m;
});

/* ═══ RED 状态色带：时间域→viewBox x 钳制到数据域，单采样带保底可见宽 ═══ */
const bandRects = computed(() => {
  const bands = props.statusBands;
  if (!bands || !bands.length || dom.value.span <= 0) return [];
  const out: { x: number; w: number; label: string }[] = [];
  for (const b of bands) {
    const x0 = Math.max(px(b.from), 0);
    const x1 = Math.min(px(b.to), PLOT_W);
    const w = Math.max(x1 - x0, 3); /* 单采样带保底 3 viewBox 单位（≈0.5% 宽）可点可看 */
    if (x1 <= 0 || x0 >= PLOT_W) continue;
    out.push({ x: x0, w, label: b.label || '集群失联时段' });
  }
  return out;
});
function lineSegs(s: NamedSeries): string[] {
  return segCache.value.get(s.name) || [];
}
/* 段内平滑（段串→Pt[]→Catmull-Rom path；段间断开由 segCache 分段承载） */
function lineSegPaths(s: NamedSeries): string[] {
  return lineSegs(s).map(attr => {
    const pts: Pt[] = attr.split(' ').map(pair => {
      const [x, y] = pair.split(',').map(Number);
      return { x, y };
    });
    return catmullRomPath(pts, PLOT_W, PLOT_H);
  });
}
function areaSegs(s: NamedSeries): string[] {
  return lineSegs(s).map(attr => {
    const pts: Pt[] = attr.split(' ').map(pair => {
      const [x, y] = pair.split(',').map(Number);
      return { x, y };
    });
    return catmullRomAreaPath(pts, PLOT_W, PLOT_H);
  });
}

/* 渐变 id 需实例内唯一（同页五张图卡并存），随机短缀足够 */
const uid = Math.random().toString(36).slice(2, 8);
const gidOf = (i: number) => `hcg-${uid}-${i}`;

/* ═══ R5 外推预测段（dashed，无面积）：与实线共享色号/坐标系，x 域含预测终点 ═══ */
const forecastSegs = computed(() => (props.forecast || []).map(f => {
  const pts = f.points.map(p => `${px(p.t).toFixed(1)},${py(p.v).toFixed(1)}`).join(' ');
  return { name: f.name, attr: pts };
}));

/* ═══ 阈值虚线（域内才画；标签同源同位，右侧小字） ═══ */
const thresholdY = computed<number | null>(() => {
  const th = props.threshold;
  if (typeof th !== 'number' || !Number.isFinite(th) || th <= 0) return null;
  if (th >= yMaxV.value) return null;
  return py(th);
});
const thLabelTop = computed(() => (thresholdY.value != null ? ((thresholdY.value / PLOT_H) * 100).toFixed(2) + '%' : ''));

/* ═══ 告警事件收敛进色带体系：事件从顶部菱形改为与 RED 色带同层的窄竖条
 （level 染色 CRIT err/WARN wn，同域钳制，title=事件文案悬停可见）——
 色带（宽时段）与事件条（瞬时点）同一视觉语言，层级/透明度/落位单源 ═══ */
const eventRects = computed(() => {
  const events = props.events;
  if (!events || !events.length || dom.value.span <= 0) return [];
  const out: { x: number; w: number; color: string; title: string }[] = [];
  for (const e of events) {
    if (!e || typeof e.t !== 'number' || e.t < dom.value.tMin || e.t > dom.value.tMax) continue;
    const x = Math.max(((e.t - dom.value.tMin) / dom.value.span) * PLOT_W - 2, 0);
    out.push({ x, w: 4, color: e.level === 'CRIT' ? 'var(--err)' : e.level === 'WARN' ? 'var(--wn)' : 'var(--tx2)', title: e.label });
  }
  return out;
});

/* ═══ 统计条：当前=各可见序列最后非空点的最大值；最大/均值=全体可见点 ═══ */
const stats = computed(() => {
  let max = 0;
  let sum = 0;
  let n = 0;
  for (const s of visibleSeries.value) {
    for (const p of s.points) {
      if (p.v > max) max = p.v;
      sum += p.v;
      n++;
    }
  }
  let cur = 0;
  let first = true;
  for (const s of visibleSeries.value) {
    if (!s.points.length) continue;
    const v = s.points[s.points.length - 1]!.v;
    if (first || v > cur) cur = v;
    first = false;
  }
  return { cur, max, avg: n ? sum / n : 0 };
});

/* ═══ 值格式化（fmt 覆盖 → fmtUnit 单源） ═══ */
function fmtV(v: number): string {
  return props.fmt ? props.fmt(v) : fmtUnit(v, props.unit);
}

/* ═══ 悬停十字线 + 最近点高亮 + tooltip（HTML 层，x=指针分数 → 时间域 → 各序列最近点）
 分数取自绘图域 .hc-canvas（36px 右移后的真域），与十字线/圆点/tooltip 的定位父级同源
 ——对 .hc-plot 全宽取分数会把左刻度列计入域，悬浮装配整体右偏最大 36px ═══ */
const canvasEl = ref<HTMLElement | null>(null);
const hoverFrac = ref<number | null>(null);
const hoverY = ref<number | null>(null);
function onMove(e: PointerEvent) {
  const el = canvasEl.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.width <= 0) return;
  hoverFrac.value = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  /* 件1：Y 向跟手（指针在图内才贴，越界回落顶部） */
  hoverY.value = Math.min(Math.max(e.clientY - r.top, 12), r.height - 12);
}
function onLeave() { hoverFrac.value = null; hoverY.value = null; }

/* 键盘步进：focus 显中点十字线；←/→ 步长=1 采样桶（全序列最大点数的倒数——
 比鼠标更容易停驻窄刺顶点），Home/End 跳两端，Esc 收线；blur 全收 */
function onFocus() {
  if (hoverFrac.value == null) hoverFrac.value = 0.5;
}
function onBlur() { hoverFrac.value = null; hoverY.value = null; }
function onKeydown(e: KeyboardEvent) {
  if (dom.value.span <= 0 || !hasVisible.value) return;
  let points = 0;
  for (const s of visibleSeries.value) points = Math.max(points, s.points.length);
  const step = points > 1 ? 1 / (points - 1) : 0.1;
  const cur = hoverFrac.value ?? 0.5;
  if (e.key === 'ArrowLeft') hoverFrac.value = Math.max(0, cur - step);
  else if (e.key === 'ArrowRight') hoverFrac.value = Math.min(1, cur + step);
  else if (e.key === 'Home') hoverFrac.value = 0;
  else if (e.key === 'End') hoverFrac.value = 1;
  else if (e.key === 'Escape') { hoverFrac.value = null; return; }
  else return;
  e.preventDefault();
  /* 键盘读数 Y 向无指针：tooltip 回落顶部锚（tipStyle 的 hoverY-null 分支） */
  hoverY.value = null;
}

function nearestOf(points: SeriesPoint[], t: number): SeriesPoint {
  let best = points[0]!;
  for (const p of points) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
  return best;
}
/* 十字线 x 处的曲线高度（相邻采样点线性插值）——悬浮圆点贴线语义（主卡 lineYAtFrac
 同语言）：指针沿曲线移动时圆点恒在线上、必达视觉峰顶（过冲已被 catmullRomPath
 控制点钳位根治，曲线视觉极值=数据极值）。断档区间（Δt>3×gapMs）曲线断开=无高度
 可贴返回 null；指针落在序列时间域之外同理（该序列不出圆点，tooltip 仍显最近点真值）。 */
function curveYAtT(points: SeriesPoint[], tq: number): number | null {
  const n = points.length;
  if (!n) return null;
  if (tq < points[0]!.t || tq > points[n - 1]!.t) return null;
  for (let i = 0; i < n - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (tq >= a.t && tq <= b.t) {
      if (props.gapMs != null && b.t - a.t > props.gapMs * 3) return null;
      const f = b.t === a.t ? 0 : (tq - a.t) / (b.t - a.t);
      return a.v + (b.v - a.v) * f;
    }
  }
  return null;
}
const hoverPts = computed(() => {
  if (hoverFrac.value == null || dom.value.span <= 0) return [];
  const t = dom.value.tMin + hoverFrac.value * dom.value.span;
  return visibleSeries.value.filter(s => s.points.length).map(s => ({ name: s.name, p: nearestOf(s.points, t) }));
});
/* 圆点位置=（十字线 x，曲线在该 x 处的插值高度）——贴线而非吸附最近采样点
 （采样点 x 与十字线错位=「圆点不在指针位置/到不了峰顶」体感根源） */
const hoverDots = computed(() => {
  if (hoverFrac.value == null || dom.value.span <= 0) return [];
  const tq = dom.value.tMin + hoverFrac.value * dom.value.span;
  const left = (hoverFrac.value * 100).toFixed(2) + '%';
  const out: { name: string; left: string; top: string; color: string }[] = [];
  for (const s of visibleSeries.value) {
    const v = curveYAtT(s.points, tq);
    if (v == null) continue;
    out.push({ name: s.name, left, top: ((py(v) / PLOT_H) * 100).toFixed(2) + '%', color: colorOf(s.name) });
  }
  return out;
});
const soloDots = computed(() => visibleSeries.value.filter(s => s.points.length === 1).map(s => ({
  name: s.name,
  left: ((px(s.points[0]!.t) / PLOT_W) * 100).toFixed(2) + '%',
  top: ((py(s.points[0]!.v) / PLOT_H) * 100).toFixed(2) + '%',
  color: colorOf(s.name),
})));

/* tooltip 跟随悬停 x、贴边翻转（右侧空间不足改锚右缘） */
const tipStyle = computed(() => {
  const f = hoverFrac.value ?? 0;
  const base = f > 0.68
    ? { right: 'calc(' + ((1 - f) * 100).toFixed(2) + '% + var(--sp-2))' }
    : { left: 'calc(' + (f * 100).toFixed(2) + '% + var(--sp-2))' };
  /* 件1：Y 向跟手（top 贴指针+垂直居中；无指针态回落顶部） */
  return hoverY.value != null
    ? { ...base, top: hoverY.value.toFixed(1) + 'px', transform: 'translateY(-50%)' }
    : base;
});
const tipTime = computed(() => {
  if (hoverFrac.value == null || dom.value.span <= 0) return '';
  const t = dom.value.tMin + hoverFrac.value * dom.value.span;
  return hmLabel(t);
});
/* tooltip 行按当前值降序——多序列叠图一眼先读到最高的序列（Grafana tooltip 同语言） */
const tipRows = computed(() => hoverPts.value
  .map(d => ({ name: d.name, color: colorOf(d.name), v: d.p.v, text: fmtV(d.p.v) }))
  .sort((a, b) => b.v - a.v));

/* tooltip 富化：悬停时刻附近（±2% 域宽）的告警事件并入 tooltip（level 色+文案）——
 事件窄条可见但细节有限，悬停即读完整事件；无命中不渲染额外行 */
const hoverAlerts = computed(() => {
  if (hoverFrac.value == null || dom.value.span <= 0 || !props.events?.length) return [];
  const t = dom.value.tMin + hoverFrac.value * dom.value.span;
  const win = dom.value.span * (props.tooltipWindowPct ?? 0.02);
  return props.events
    .filter(e => typeof e.t === 'number' && Math.abs(e.t - t) <= win)
    .map(e => ({ label: e.label, color: e.level === 'CRIT' ? 'var(--err)' : e.level === 'WARN' ? 'var(--wn)' : 'var(--tx2)' }));
});

/* ═══ 时间标注：范围 ≤24h 用 HH:mm，否则 MM-dd HH:mm（X 轴与 tooltip 时间同源） ═══ */
function hmLabel(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes());
}
function tickLabel(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  const hm = hmLabel(t);
  if (dom.value.span <= 8.64e7) return hm;
  return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + hm;
}
const ticks = computed(() => timeTicks(dom.value.tMin, dom.value.tMax));

/* ═══ 图区高度：缺省 180/140 两档，height prop 覆盖 ═══ */
const plotStyle = computed(() => (props.height ? { height: props.height + 'px' } : undefined));
</script>

<style scoped>
.hc { min-width: 0; }
/* 全屏展开态（LiveChartCard ld-chart-full 同语言：卡原地 fixed 覆盖视口，遮罩由
 视图 body.ld-chart-mask 承担）——绘图域/图例/统计随视口自适应，能力与顶部卡统一 */
.hc.hc-full { position: fixed; inset: 4vh 4vw; z-index: var(--z-ctx); background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-m); box-shadow: var(--shadow-m); padding: var(--sp-3); overflow: auto; }
.hc.hc-full .hc-plot { height: calc(100vh - 24vh - 120px); }
/* 展开钮（LiveChartCard ld-expand 同语言）：弱化色小钮 hover 提亮 */
.hc-expand { margin-left: var(--sp-1); background: transparent; border: none; color: var(--muted); cursor: pointer; padding: var(--sp-0); display: inline-flex; align-items: center; transition: transform var(--dur-fast) var(--ease-out); }
.hc-expand:hover { color: var(--tx0); }
.hc-expand:active { transform: scale(.92); }
/* 799 件2：卡头两行制 KPI 与六卡同构（行① 标题+统计/行② 28px 当前值大数） */
.hc-hd { margin-bottom: var(--sp-2); }
.hc-top { display: flex; align-items: baseline; gap: var(--sp-2); }
.hc-cur { display: block; font-family: var(--mono); font-size: var(--fs-num-l); font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.25; margin: var(--sp-0) 0 var(--sp-1); }
.hc-tt { font-size: var(--fs-xs); color: var(--muted); }
.hc-unit { font-style: normal; font-size: var(--fs-2xs); color: var(--tx2); margin-left: var(--sp-1); }
/* 统计条：最大/均值 mono 表列数字，值亮说明暗（「当前」升行② 大数=799 件2） */
.hc-stats { margin-left: auto; font-size: var(--fs-2xs); color: var(--tx2); font-family: var(--mono); white-space: nowrap; }
.hc-stats b { color: var(--tx0); font-weight: 600; font-variant-numeric: tabular-nums; }

.hc-plot { position: relative; height: 180px; }
@media (max-width: 900px) {
  .hc-plot { height: 140px; }
}
/* 件2：绘图域右移 36px 让出左刻度列——线和文字互相遮挡根治
 （canvas 含 svg/十字线/圆点/tooltip；Y 三刻度在 canvas 外锚 plot，见下） */
.hc-canvas { position: absolute; top: 0; bottom: 0; left: 36px; right: 0; }
/* 键盘焦点环（方向键步进读数的可达性信号；内嵌不外扩） */
.hc-canvas:focus-visible { outline: 1px solid var(--ac-line); outline-offset: -1px; }
.hc-svg { width: 100%; height: 100%; display: block; }
/* 网格与主卡 .ld-glines 同语言（--line 实线 1px；旧 tx2 虚线=「白板图」底噪） */
.hc-grid { stroke: var(--line); stroke-width: 1; }
.hc-band { fill: var(--err); opacity: .08; }
/* 告警事件菱形标记：顶部落位，level 染色（CRIT err/WARN wn/默认 tx2） */
/* R5 外推预测虚线 */
.hc-fc { pointer-events: none; }

/* 联动高亮（质感分层）：hot 序列线升亮（1.5→2px）、其余退灰——
 stroke-width/opacity 走合成层过渡，不触发布局 */
.hc-line { transition: stroke-width .12s ease-out, opacity .12s ease-out; }
.hc-line.is-dim { opacity: .15; }
.hc-line.is-hot { stroke-width: 2; }

/* Y 轴两只刻度（HTML 层不被拉伸变形）；X 轴三只时间标注在图区之下。
 件2：Y 中档三刻度（75/50/25% 位，translateY 居中锚格线）。
 件2：三刻度锚 .hc-plot 左列 0..32px 右对齐（canvas 36px 起=4px 间隙，
 刻度真让位列内、线永不入列——内勘正：裹进 canvas 等于没让位） */
.hc-ymax, .hc-yzero { position: absolute; left: 0; width: 32px; text-align: right; font-size: var(--fs-2xs); color: var(--tx2); font-family: var(--mono); line-height: 1.2; pointer-events: none; }
.hc-yt { position: absolute; left: 0; width: 32px; text-align: right; font-size: var(--fs-2xs); color: var(--tx2); font-family: var(--mono); line-height: 1.2; transform: translateY(-50%); pointer-events: none; }
.hc-ymax { top: 0; }
.hc-yzero { bottom: 0; }
.hc-xaxis { display: flex; justify-content: space-between; margin-top: var(--sp-1); font-size: var(--fs-2xs); color: var(--tx2); font-family: var(--mono); font-variant-numeric: tabular-nums; } /* 件2：数字等宽=与 ld-xaxis 同语言 */

/* 阈值小字：右缘对齐虚线同高 */
.hc-thlabel { position: absolute; right: 0; transform: translateY(-50%); font-size: var(--fs-2xs); color: var(--err); font-family: var(--mono); pointer-events: none; white-space: nowrap; background: var(--panel); padding: 0 var(--sp-0); }

/* 十字线与最近点圆点（恒亮单点同形态）：圆点描边用底色隔离曲线。
 横竖双线交点=指针位置（横线 top 跟 hoverY，与 tooltip Y 向跟手同源） */
.hc-xline { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--tx2); opacity: .45; pointer-events: none; }
.hc-yline { position: absolute; left: 0; right: 0; height: 1px; background: var(--tx2); opacity: .45; pointer-events: none; }
.hc-dot { position: absolute; width: 8px; height: 8px; border-radius: 50%; transform: translate(-50%, -50%); border: 1.5px solid var(--bg); pointer-events: none; }
/* 末端呼吸点（主卡 ld-line-pulse 同语言；transform/opacity 合成层动画，reduced-motion 豁免） */
.hc-pulse { animation: hc-dot-pulse 2.4s ease-out infinite; }
@keyframes hc-dot-pulse { 0% { transform: translate(-50%, -50%) scale(1); opacity: .85; } 75% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; } 100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .hc-pulse { animation: none; } }

/* tooltip：绝对定位层不随 SVG 拉伸；pointer-events none 防闪 */
.hc-tip { position: absolute; top: var(--sp-2); z-index: 2; pointer-events: none; background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r-s); box-shadow: var(--shadow-m); padding: var(--sp-1) var(--sp-2); font-size: var(--fs-2xs); min-width: 120px; max-width: 280px; } /* 件2：放宽=九节点长名少截断 */
/* R5 预测/健康提示语（卡头下一行，warn 暖色档） */
.hc-note { font-size: var(--fs-2xs); color: var(--wn); margin-bottom: var(--sp-1); }
.hc-tip-t { color: var(--tx2); font-family: var(--mono); margin-bottom: var(--sp-0); }
.hc-tip-row { display: flex; align-items: center; gap: var(--sp-1); margin-top: var(--sp-0); }
.hc-tip-row i { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.hc-tip-nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx1); }
.hc-tip-row b { color: var(--tx0); font-family: var(--mono); font-variant-numeric: tabular-nums; font-weight: 600; }
/* tooltip 富化行：告警事件（level 色+完整文案） */
.hc-tip-al .hc-tip-nm { color: var(--wn); }

/* 图例 chips：色点+名称；隐藏档灰化+划线（色号不变） */
.hc-legend { display: flex; flex-wrap: wrap; gap: var(--sp-1) var(--sp-2); margin-top: var(--sp-2); }
.hc-chip { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-2xs); color: var(--tx1); background: transparent; border: 1px solid var(--border); border-radius: var(--r-s); padding: var(--sp-0) var(--sp-2); cursor: pointer; line-height: 16px; }
.hc-chip:hover { border-color: var(--muted); color: var(--tx0); }
.hc-chip i { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.hc-chip.off { opacity: .45; text-decoration: line-through; }
/* chip 峰值标注（对比卡 em.cur 同语言）：mono 表列数字、弱化色不抢序列名 */
.hc-chip-peak { font-style: normal; font-family: var(--mono); font-variant-numeric: tabular-nums; color: var(--tx2); margin-left: var(--sp-1); }

/* 空态铺满图区（EmptyState compact 只承担内容，落位归本类） */
.hc-empty { position: absolute; inset: 0; justify-content: center; }
</style>
