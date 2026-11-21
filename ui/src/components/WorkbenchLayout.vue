<template>
  <section ref="bodyEl" class="wl" :class="{ stacked, 'wl-viewport-bounded': !fillViewport }" :data-layout-axis="axis">
    <div v-if="toolbarVisible" class="wl-bar">
      <button type="button" class="btn ghost xs" data-layout-preset="equal" title="等分布局" @click="applyPreset('equal')">等分</button>
      <button type="button" class="btn ghost xs" data-layout-preset="editor-first" :title="presetEditorTitle" @click="applyPreset('editor-first')">{{ presetEditorLabel }}</button>
      <button type="button" class="btn ghost xs" data-layout-preset="result-first" :title="presetResultTitle" @click="applyPreset('result-first')">{{ presetResultLabel }}</button>
      <button type="button" class="btn ghost xs" data-layout-reset title="恢复默认布局" @click="resetLayout">重置</button>
      <slot name="bar" />
    </div>
    <div class="wl-body">
      <template v-for="(spec, i) in panes" :key="spec.id">
        <ResizablePane
          :id="spec.id"
          :axis="axis"
          :size="sizeOf(spec)"
          :min="spec.minSize"
          :max="maxOf(spec)"
          :title="spec.title || ''"
          :collapsible="!!spec.collapsible"
          :collapsed="isPaneHidden(spec)"
          :last="stacked || isLastPane(i) || maximizedId != null"
          :class="{ 'wl-flex-pane': isFlex(spec) && !isPaneHidden(spec), 'wl-fill-pane': isFill(spec, i) }"
          :style="paneStyleFor(spec)"
          :handle-max-label="handleMaxLabelFor(i)"
          :handle-max-active="maximizedId != null"
          @resize="s => onResize(spec.id, s)"
          @resize-end="s => onResizeEnd(spec.id, s)"
          @reset="() => restoreDefault(spec.id)"
          @toggle-collapse="c => onToggleCollapse(spec.id, c)"
          @handle-max="() => cycleMaximize(i)"
        >
          <slot :name="paneSlotName(spec.id)" :focus-pane="focusPane" :is-focused="isFocused" :restore-default="restoreDefault" />
        </ResizablePane>
        <!-- 独占态还原竖轨（实报「按了就不显示/无法还原」实勘：独占隐藏侧=
 0 宽+整栏无柄（538 压 0+）=物理不可见，还原只剩宿主工具行 seg 一个远端入口。
 竖轨=隐藏侧原位的常驻还原入口，点击 setMaximize(null) 回对半；与 ResizablePane
 折叠竖标轨同一视觉语言。仅独占隐藏侧渲染，其余布局零渲染=既有消费方零感知 -->
        <button v-if="isMaxHidden(spec)" type="button" class="wl-restore-rail"
          :title="restoreRailTitle(spec)" :aria-label="restoreRailTitle(spec)"
          @click="setMaximize(null)">还原对半</button>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
/* P1 统一可调工作台（resizable workbench plan ）：
 页面只声明 pane 规格，布局容器统一负责——尺寸受控（ResizablePane 只收发事件）、
 偏好读写（useLayoutPreferences，scope=target+route+mode+profile）、预设分配
 （utils/layout.distributePreset 纯函数）、embedded/compact 档 stacked 上下堆叠。
 红线：不触碰 route/query/hash/业务 store；setPane 只在 resize-end/preset/collapse/reset。 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import ResizablePane from './ResizablePane.vue';
import { createLayoutPreferences, type LayoutScope } from '../composables/useLayoutPreferences';
import { useViewportProfile } from '../composables/useViewportProfile';
import { BP_STACK, clampPaneSize, cycleMaxState, distributePreset, type LayoutPreset, type PaneConstraint, type ViewportProfile } from '../utils/layout';

export interface WorkbenchPaneSpec {
  id: string;
  role: string;
  title?: string;
  minSize: number;
  defaultSize: number | 'flex';
  maxSize?: number | 'available';
  collapsible?: boolean;
  focusable?: boolean;
  persist?: boolean;
  /* 分栏互覆盖（档位循环）——声明后，两侧都 maximizable 的 pane 之间
 拖拽柄出现档位钮：对半→前位独占→后位独占循环（独占=隐藏对方，占满全宽）。
 独占态为会话态不写偏好（还原即回原布局）；maxName 用于档位钮 aria/title 文案。 */
  maximizable?: boolean;
  maxName?: string;
}

const props = withDefaults(defineProps<{
  scope: LayoutScope;
  panes: WorkbenchPaneSpec[];
  axis?: 'horizontal' | 'vertical';
  profile?: ViewportProfile;
  mode?: string;
  /* 视口兜底下限（.wl min-height:100vh-210px）开关：默认开=既有消费方零行为变化。
 宿主自建真高度链的页（查询工作台 DSL 模式 .dq 定高 flex 分配）传 false——否则 .wl 独占
 整屏高，常规流兄弟节点（结果区 res-bar）被顶到视口底沿（P0 实报）。
 预设钮文案：编辑/结果优先在双 pane 语义页（如 DSL 条件树|编辑器）实调的是左右宽分配，
 由宿主按实际布局换口径；默认值=通用文案（零破坏）。 */
  fillViewport?: boolean;
  presetEditorLabel?: string;
  presetEditorTitle?: string;
  presetResultLabel?: string;
  presetResultTitle?: string;
}>(), {
  axis: 'vertical', profile: undefined, mode: 'default', fillViewport: true,
  presetEditorLabel: '编辑优先', presetEditorTitle: '编辑区优先',
  presetResultLabel: '结果优先', presetResultTitle: '结果区优先',
});

const emit = defineEmits<{
  (e: 'pane-resize', id: string, size: number): void;
  (e: 'pane-reset', id: string): void;
  (e: 'layout-reset'): void;
}>();

const bodyEl = ref<HTMLElement | null>(null);
const vp = useViewportProfile(bodyEl as unknown as ReturnType<typeof ref<HTMLElement | undefined>>);
const effectiveProfile = computed<ViewportProfile>(() => props.profile ?? vp.profile.value);
/* stacked 由宽度驱动：短而宽的容器（DevTools 响应区高常 <560）不该被迫上下堆叠——
 横向布局靠自身滚动；宽度 <BP_STACK(1100，与全站 CSS max-width:1100px 档互锚) 才切换上下堆叠（窄屏语义）。 */
const stacked = computed(() => props.profile
  ? props.profile === 'embedded' || props.profile === 'compact'
  : vp.width.value > 0 && vp.width.value < BP_STACK);

/* key 的 profile 用实测档位（页面无需感知视口）；mode 页面显式传，缺省 default */
const scopeKey = computed(() => ({ ...props.scope, mode: props.scope.mode || props.mode, profile: effectiveProfile.value }));
const prefs = computed(() => createLayoutPreferences(scopeKey.value, constraintsRecord.value));
const constraintsRecord = computed<Record<string, PaneConstraint>>(() => {
  const out: Record<string, PaneConstraint> = {};
  for (const p of props.panes) {
    if (isFlex(p)) continue;
    out[p.id] = {
      id: p.id, min: p.minSize,
      defaultSize: typeof p.defaultSize === 'number' ? p.defaultSize : p.minSize,
      max: maxOf(p),
    };
  }
  return out;
});
const sizedConstraints = computed<PaneConstraint[]>(() => Object.values(constraintsRecord.value));
/* flex pane 不参与 preset 分配，但其 minSize 必须作为上界保留（对齐 maxOf 的
 reservedForSiblings 口径）；且存在 flex pane 时「结果优先」反向——sized 压向 min 让位给 flex */
const flexReservedMin = computed(() => props.panes.reduce((sum, p) => (isFlex(p) ? sum + p.minSize : sum), 0));

const available = computed(() => (props.axis === 'vertical' ? vp.width.value : vp.height.value));

const sizes = ref<Record<string, number>>({});
const collapsedIds = ref(new Set<string>());

/* 分栏互覆盖（档位循环）——maximizedId 指向独占 pane，其余 maximizable
 pane 经 isPaneHidden 走折叠管线隐藏（rp-content display:none 移除高度/宽度贡献）。
 会话态不写偏好：还原=清 maximizedId 即回原布局，sizes/collapsedIds 分毫不差。 */
const maximizedId = ref<string | null>(null);
function isPaneHidden(spec: WorkbenchPaneSpec) {
  if (collapsedIds.value.has(spec.id)) return true;
  return maximizedId.value != null && spec.maximizable === true && maximizedId.value !== spec.id;
}
/* 还原竖轨渲染判据——与 paneOverrideStyleFor 的 0 宽压 Conditions 完全同域
 （独占隐藏侧=maximizedId 在场+maximizable+非本尊），手动折叠/普通布局不渲染；
 restoreRailTitle 用独占侧 maxName/role 生成「点此还原」提示（title/aria 同源）。 */
function isMaxHidden(spec: WorkbenchPaneSpec) {
  return maximizedId.value != null && spec.maximizable === true && maximizedId.value !== spec.id;
}
function restoreRailTitle(spec: WorkbenchPaneSpec) {
  const dom = props.panes.find(p => p.id !== spec.id && p.id === maximizedId.value);
  return `点此还原对半分栏（当前「${dom?.maxName || dom?.role || dom?.id || ''}」独占）`;
}
function cycleMaximize(index: number) {
  const spec = props.panes[index];
  const next = props.panes[index + 1];
  if (!spec || !next || spec.maximizable !== true || next.maximizable !== true) return;
  maximizedId.value = cycleMaxState(maximizedId.value, spec.id, next.id);
}
/* 受控独占（宿主 seg 点选用）——null=对半恢复。柄上循环钮之外的
 显性入口：独占态还原不再依赖 11px 柄（实报「回不去了」）。 */
function setMaximize(id: string | null) {
  if (id != null && !props.panes.some(p => p.id === id && p.maximizable === true)) return;
  maximizedId.value = id;
}
defineExpose({ maximizedId, setMaximize, focusPane, resetLayout });
function handleMaxLabelFor(index: number) {
  const spec = props.panes[index];
  const next = props.panes[index + 1];
  if (!spec || !next || spec.maximizable !== true || next.maximizable !== true || stacked.value) return '';
  const a = spec.maxName || spec.role;
  const b = next.maxName || next.role;
  const pos = maximizedId.value === spec.id ? `${a} 独占` : maximizedId.value === next.id ? `${b} 独占` : '对半';
  return `分栏档位（当前 ${pos}）：点击循环 对半 → ${a} 独占 → ${b} 独占`;
}
/* flex pane 被独占隐藏时必须让出弹性占位——flexStyle 恒 flex:1 会让 rp-content 的
 display:none 形同虚设（容器仍占满，对方「独占」只是内容消失）。
 sized pane 被独占隐藏时同样压 0 宽——collapsed 塌缩形态（34px 标题轨宽）在无 title
 互覆盖场景是一条无意义空条（还原入口在柄上，不在塌缩条）。 */
const flexHiddenStyle = { flex: '0 0 auto', width: '0', minWidth: '0', overflow: 'hidden' } as const;
/* sized 隐藏侧不设 overflow:hidden——其还原柄（SplitHandle 11px）从 0 宽 pane 内伸出必须可见 */
const sizedHiddenStyle = { width: '0', minWidth: '0' } as const;
function paneOverrideStyleFor(spec: WorkbenchPaneSpec) {
  if (isFlex(spec)) return isPaneHidden(spec) ? flexHiddenStyle : flexStyle;
  /* 只对独占隐藏（非手动折叠）压 0：手动折叠保留 ResizablePane 自身的塌缩形态 */
  if (!collapsedIds.value.has(spec.id) && maximizedId.value != null && spec.maximizable === true && maximizedId.value !== spec.id) {
    return sizedHiddenStyle;
  }
  return undefined;
}
/* （ 裁决表头号）：堆叠态高度保底——≤1100 堆叠出生挂载（直开/SPA 重挂）
 时 .wl-body 转 column，sized pane flex:0 0 auto 高度按 min-content，而消费方 pane 内容
 高度链（height:100% → JsonArea fill Monaco height:100%）反过来依赖 pane 确定高度 →
 循环塌缩（ReindexPreview query pane 塌 122px/编辑器 31px 单行，flex result 吞 568px；
 >1100 挂载后切窄因布局基线已在而不塌=出生路径时序差异）。修法=stacked+vertical 轴可见
 sized pane 内联 height=当前尺寸值（defaultSize/持久化/预设同源）+minHeight=声明 min；
 flex pane 维持吞剩余既有语义；折叠/独占隐藏侧不叠（塌缩/0 宽形态不掺高度）；horizontal
 轴不叠（ResizablePane paneStyle 本身 height:size 显式，stacked CSS 只打 width）。 */
function paneStyleFor(spec: WorkbenchPaneSpec) {
  const override = paneOverrideStyleFor(spec);
  if (stacked.value && props.axis === 'vertical' && !isFlex(spec) && !isPaneHidden(spec)) {
    return { height: `${sizeOf(spec)}px`, minHeight: `${spec.minSize}px`, ...override };
  }
  return override;
}

function isFlex(spec: WorkbenchPaneSpec) { return spec.defaultSize === 'flex'; }
/* 最后一个 sized pane 吸收剩余空间——两 pane 尺寸和(如 420+560=980)小于容器时
 右侧大片空白、聚焦钮悬浮在空白边（实报 DevTools/分词验证布局崩坏）。
 非 stacked 时 last pane flex:1 1 auto（width 作 basis 伸展），拖拽语义不变：
 前序 pane 拖大 → last pane 自动收窄。stacked（上下堆叠）各自然高不参与。 */
/* 修正：fill 只属于「真正的最后一个可见 pane」——isLastSized 会把后随 flex
 pane 过滤掉而误判（查询工作台 tree 被拉到 894px、flex 工作台被压到 424px，右栏挤爆，
 实报「右边太小看不清+遮挡」）；后随 flex pane 时剩余空间本就该由 flex 吸收。 */
function isFill(spec: WorkbenchPaneSpec, index: number) {
  if (stacked.value || isFlex(spec) || isPaneHidden(spec)) return false;
  const rest = props.panes.slice(index + 1);
  /* 后随 flex 未隐藏才让位（被独占隐藏的 flex 不再吸收剩余空间，
 独占的 sized pane 改由 fill 吸满全宽）；结尾全 hidden（折叠/独占）即 fill。 */
  if (rest.some(p => isFlex(p) && !isPaneHidden(p))) return false;
  return rest.every(p => isPaneHidden(p));
}
/* sized pane 的有效上界必须为其余 pane 保留各自 min（flex 的 minSize 同样保留）——
 否则 restore 的大值/拖拽到底/「编辑优先」preset 都会把 flex 编辑器挤到 0 宽（查询工作台右侧整块消失的根因） */
/* sized pane 的有效上界必须为其余 pane 保留各自 min（flex 的 minSize 同样保留）——
 否则 restore 的大值/拖拽到底/「编辑优先」preset 都会把 flex 编辑器挤到 0 宽（查询工作台右侧整块消失的根因）。
 被独占隐藏的 pane 不占位，不保留 reserved（否则独占侧被钳在 available-min 拉不满）。 */
function reservedForSiblings(excludeId: string) {
  return props.panes.reduce((sum, p) => (p.id === excludeId || isPaneHidden(p) ? sum : sum + p.minSize), 0);
}
function sizeOf(spec: WorkbenchPaneSpec) {
  if (isFlex(spec)) return spec.minSize;
  return sizes.value[spec.id] ?? clampPaneSize(
    typeof spec.defaultSize === 'number' ? spec.defaultSize : spec.minSize,
    constraintsRecord.value[spec.id], available.value);
}
function maxOf(spec: WorkbenchPaneSpec) {
  const configured = spec.maxSize === 'available' || spec.maxSize == null ? Math.max(spec.minSize, available.value) : spec.maxSize;
  return Math.max(spec.minSize, Math.min(configured, Math.max(0, available.value - reservedForSiblings(spec.id))));
}
/* last 原判 isLastSized 把后随 flex pane 过滤掉——最常见的 [sized,flex]
 双栏里 sized pane 被误判「最后一个」→ 不渲染拖拽柄（11 个视图 10 个 0 柄，
 实报「编辑框无法调节」）。现后面还有任何 pane 就渲染柄，真正的最后一个 pane 才不渲染。
 独占态（maximizedId 在场）整栏无柄——0 宽侧的还原柄孤立悬在屏幕边缘
 （实报「拉伸没用」的异物源），且 已约定工具行 seg 常驻还原（setMaximize），
 柄的还原职责退役。 */
function isLastPane(index: number) {
  return index === props.panes.length - 1;
}
const flexStyle = { flex: '1 1 0', minWidth: '0', minHeight: '0' } as const;

function onResize(id: string, size: number) {
  userTouched = true;
  sizes.value = { ...sizes.value, [id]: size };
  emit('pane-resize', id, size);
}
function onResizeEnd(id: string, size: number) {
  userTouched = true;
  sizes.value = { ...sizes.value, [id]: size };
  if (constraintsRecord.value[id] && (props.panes.find(p => p.id === id)?.persist !== false)) {
    prefs.value.setPane(id, { size });
  }
}
function onToggleCollapse(id: string, collapsed: boolean) {
  const next = new Set(collapsedIds.value);
  if (collapsed) next.add(id); else next.delete(id);
  collapsedIds.value = next;
  if (constraintsRecord.value[id]) prefs.value.setPane(id, { size: sizeOf(props.panes.find(p => p.id === id)!) , collapsed });
}
function applyPreset(preset: LayoutPreset) {
  userTouched = true;
  const next = distributePreset(preset, available.value, sizedConstraints.value, { reservedMin: flexReservedMin.value });
  sizes.value = { ...sizes.value, ...next };
  for (const [id, size] of Object.entries(next)) prefs.value.setPane(id, { size });
}
function restoreDefault(id: string) {
  const c = constraintsRecord.value[id];
  const spec = props.panes.find(p => p.id === id);
  if (!c || !spec) return;
  const def = typeof spec.defaultSize === 'number' ? spec.defaultSize : spec.minSize;
  sizes.value = { ...sizes.value, [id]: clampPaneSize(def, c, available.value) };
  prefs.value.setPane(id, { size: sizes.value[id] });
  emit('pane-reset', id);
}
function resetLayout() {
  sizes.value = {};
  collapsedIds.value = new Set();
  maximizedId.value = null;
  prefs.value.reset();
  emit('layout-reset');
}

/* 焦点面（FocusableSurface 的编排侧）：slot props 暴露给页面 */
const focusedId = ref<string | null>(null);
function focusPane(id: string | null) { focusedId.value = id; }
function isFocused(id: string) { return focusedId.value === id; }

const toolbarVisible = computed(() => !stacked.value && sizedConstraints.value.length > 1);

/* 初始 restore 可能拿窗口初值（innerWidth）算 clamp，容器实宽就绪后要重放一次；
 用户拖过/选过 preset 后不再自动重排——保持用户意图优先 */
let userTouched = false;
function restoreAll() {
  if (available.value < 1) return; // 容器不可见(0 尺寸)时按 0 clamp 会把所有 pane 钳到 min——跳过等实宽
  const initial = createLayoutPreferences(scopeKey.value, constraintsRecord.value);
  const restoredCollapsed = new Set<string>();
  for (const c of sizedConstraints.value) {
    sizes.value[c.id] = initial.restorePane(c.id, c, available.value);
    /* 折叠态随偏好快照回放（此前从不恢复，折叠后刷新/切页回来即丢）；
 只认 constraintsRecord 里存在的 id（flex pane 无快照条目） */
    if (initial.snapshot.value.panes[c.id]?.collapsed === true) restoredCollapsed.add(c.id);
  }
  collapsedIds.value = restoredCollapsed;
}
onMounted(() => { restoreAll(); });
watch(available, () => { if (!userTouched) restoreAll(); });
onBeforeUnmount(() => { vp.dispose(); focusedId.value = null; });

function paneSlotName(id: string) { return `pane-${id.split('.').join('-')}`; }
</script>

<style scoped>
/* flex:1 —— 本组件常作为页面 flex 容器的子项（如 .dq-main），不补会收缩到内容最小宽，
 视口实测宽度随之变小误判 compact → stacked 上下堆叠，编辑器 pane 高度归零（查询工作台右侧整块消失的真根因） */
.wl { display: flex; flex-direction: column; min-width: 0; min-height: 0; flex: 1 1 auto; }
/* 统一架构——WorkbenchLayout 自带视口撑满下限(8 视图统一生效,不再逐视图补),
 flex:1 1 auto 在有高度链的父容器里跟随伸展,无高度链的父容器里按 min-height 兜底 */
.wl { min-height: calc(100vh - var(--vh-offset)); }
/* fillViewport=false：宿主自建确定高度链，视口兜底退役（min-height 撑满会把常规流兄弟
 节点（结果区）顶出视口）；其余 8 视图缺省仍兜底 */
.wl.wl-viewport-bounded { min-height: 0; }
.wl-bar { display: flex; gap: var(--sp-1); align-items: center; justify-content: flex-end; padding: var(--sp-0) 0 var(--sp-2); }
.wl-body { display: flex; flex-direction: row; min-width: 0; min-height: 0; flex: 1 1 auto; gap: 0; }
.wl[data-layout-axis='horizontal'] .wl-body { flex-direction: column; }
/* embedded/compact：上下堆叠，pane 各占自然高度且不低于 min；split handle 全隐（last=true） */
.wl.stacked .wl-body { flex-direction: column; overflow: auto; }
.wl.stacked :deep(.resizable-pane) { width: auto !important; max-width: none !important; flex: 0 0 auto; }
.wl-flex-pane { flex: 1 1 0 !important; width: auto !important; }
/* 最后一个 sized pane 吸收剩余空间（width 作 basis 伸展，拖拽语义不变） */
.wl-fill-pane { flex: 1 1 auto !important; }
/* 独占态还原竖轨——bg2 底+线分界+hover 柔底色变=可点暗示；
 行布局（axis=vertical 未堆叠）=竖排直立轨（ResizablePane 折叠竖标轨 34px 同语言，取 30px）；
 stacked/横向轴=列布局退化为横向细条。
 豁免（零行为变更）：本轨「独占还原轨非标题轨」，不在「竖排标题轨退役」范式
 射程内——ResizablePane rp-title 竖排轨随 title 消费清零成死码已同步退役，而本轨有活
 消费者（maximizedId 独占压 0 侧的常驻还原入口，isMaxHidden 判据）且承担还原交互，
 竖排直立形态是刻意同语言而非待退役遗留。 */
.wl-restore-rail {
  flex: 0 0 auto; padding: 0; border: 0; background: var(--bg2); color: var(--tx2);
  cursor: pointer; font-size: var(--fs-xs); font-weight: 600; font-family: var(--font);
  transition: background var(--tr), color var(--tr);
}
.wl-restore-rail:hover, .wl-restore-rail:focus-visible { color: var(--ac); background: var(--ac-soft); }
.wl:not(.stacked):not([data-layout-axis='horizontal']) .wl-restore-rail {
  width: 30px; border-left: 1px solid var(--line);
  writing-mode: vertical-rl; text-orientation: upright; letter-spacing: .2em;
}
.wl.stacked .wl-restore-rail, .wl[data-layout-axis='horizontal'] .wl-restore-rail {
  width: 100%; height: 30px; border-top: 1px solid var(--line); letter-spacing: .1em;
}
</style>
