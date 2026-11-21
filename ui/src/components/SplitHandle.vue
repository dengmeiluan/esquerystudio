<template>
  <div
    class="split-handle"
    :class="[`axis-${axis}`, { dragging }]"
    role="separator"
    tabindex="0"
    :aria-label="label"
    :title="`${label}：拖拽调整 · 双击或按 R 重置 · 方向键微调（Shift 大步） · Home/End 到两端`"
    :aria-orientation="axis"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuenow="boundedSize"
    :data-split-axis="axis"
    @keydown="onKeydown"
    @pointerdown.prevent="onPointerDown"
    @dblclick="emit('reset')"
  >
    <!-- 分栏档位循环钮（互覆盖）——柄=两栏关系调节器的心智：对半→前位独占→
 后位独占循环。maxLabel 由 WorkbenchLayout 按两侧 pane 的 maxName 与当前档位算好传入，
 空=不渲染（既有消费方零感知）。pointerdown.stop 防误触发柄拖拽热区。 -->
    <button
      v-if="maxLabel"
      type="button"
      class="sh-max"
      :class="{ 'sh-max-on': maxActive }"
      :title="maxLabel"
      :aria-label="maxLabel"
      @pointerdown.stop
      @dblclick.stop
      @keydown.stop
      @click.stop="emit('max-click')"
    >
      <ChevronsLeftRight :size="11" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { ChevronsLeftRight } from 'lucide-vue-next';

const props = defineProps<{
  axis: 'horizontal' | 'vertical';
  size: number;
  min: number;
  max: number;
  label: string;
  /* 分栏档位循环钮（互覆盖）——文案/激活态由宿主算好传入 */
  maxLabel?: string;
  maxActive?: boolean;
}>();

const emit = defineEmits<{
  (e: 'resize', size: number): void;
  (e: 'resize-end', size: number): void;
  (e: 'reset'): void;
  (e: 'max-click'): void;
}>();

const dragging = ref(false);
const boundedSize = computed(() => clamp(props.size));
let startCoordinate = 0;
let startSize = 0;
let latestSize = 0;
let pointerId: number | undefined;
let captureElement: HTMLElement | undefined;
let animationFrame: number | undefined;
let pendingSize: number | undefined;

function clamp(value: number): number {
  return Math.round(Math.max(props.min, Math.min(value, props.max)));
}

function coordinate(event: PointerEvent): number {
  return props.axis === 'vertical' ? event.clientX : event.clientY;
}

function flushResize() {
  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
  animationFrame = undefined;
  if (pendingSize === undefined) return;
  latestSize = pendingSize;
  emit('resize', pendingSize);
  pendingSize = undefined;
}

function scheduleResize(value: number) {
  pendingSize = clamp(value);
  if (animationFrame !== undefined) return;
  animationFrame = requestAnimationFrame(() => {
    animationFrame = undefined;
    flushResize();
  });
}

function onPointerDown(event: PointerEvent) {
  cleanupPointer();
  dragging.value = true;
  startCoordinate = coordinate(event);
  startSize = boundedSize.value;
  latestSize = startSize;
  pointerId = event.pointerId;
  captureElement = event.currentTarget as HTMLElement;
  try { captureElement.setPointerCapture?.(event.pointerId); } catch { /* capture is optional */ }
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerEnd);
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value || (pointerId !== undefined && event.pointerId !== pointerId)) return;
  scheduleResize(startSize + coordinate(event) - startCoordinate);
}

function onPointerEnd(event: PointerEvent) {
  if (!dragging.value || (pointerId !== undefined && event.pointerId !== pointerId)) return;
  flushResize();
  const finalSize = latestSize;
  cleanupPointer();
  emit('resize-end', finalSize);
}

function cleanupPointer() {
  flushResize();
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerEnd);
  window.removeEventListener('pointercancel', onPointerEnd);
  if (captureElement && pointerId !== undefined) {
    try { captureElement.releasePointerCapture?.(pointerId); } catch { /* capture may already be gone */ }
  }
  captureElement = undefined;
  pointerId = undefined;
  dragging.value = false;
}

function finishKeyboard(value: number) {
  const next = clamp(value);
  emit('resize', next);
  emit('resize-end', next);
}

function onKeydown(event: KeyboardEvent) {
  const step = event.shiftKey ? 32 : 8;
  let next: number | undefined;
  if (event.key === 'Home') next = props.min;
  else if (event.key === 'End') next = props.max;
  else if (props.axis === 'vertical' && event.key === 'ArrowLeft') next = boundedSize.value - step;
  else if (props.axis === 'vertical' && event.key === 'ArrowRight') next = boundedSize.value + step;
  else if (props.axis === 'horizontal' && event.key === 'ArrowUp') next = boundedSize.value - step;
  else if (props.axis === 'horizontal' && event.key === 'ArrowDown') next = boundedSize.value + step;
  else if (event.key === 'r' || event.key === 'R' || event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    emit('reset');
    return;
  }
  if (next === undefined) return;
  event.preventDefault();
  finishKeyboard(next);
}

onBeforeUnmount(cleanupPointer);
</script>

<style scoped>
.split-handle {
  position: relative;
  flex: 0 0 auto;
  border: 0;
  outline: none;
  touch-action: none;
  background: transparent;
}
.split-handle::after {
  content: '';
  position: absolute;
  background: var(--line);
  transition: background var(--tr), box-shadow var(--tr);
}
.split-handle:hover::after,
.split-handle:focus-visible::after,
.split-handle.dragging::after {
  background: var(--ac);
  box-shadow: 0 0 0 1px var(--ac);
}
/* 拖拽柄可视性——此前 9px 热区只有 1px 细线（after inset 0 4px），
 竖排标题轨看起来像分隔条却拖不动（「无法调节」感知的根因之一）。热区加宽到 11px、
 可视线加粗到 3px，hover/focus/drag 叠加 grip 点阵（var(--ac)）明示可拖拽；键盘/指针逻辑不动。 */
.split-handle::before {
  content: '';
  position: absolute;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--tr);
  background-image: radial-gradient(circle, var(--ac) 1px, transparent 1.5px);
}
.split-handle:hover::before,
.split-handle:focus-visible::before,
.split-handle.dragging::before { opacity: 1; }
.axis-vertical { width: 11px; cursor: col-resize; align-self: stretch; }
.axis-vertical::after { inset: 0 4px; }
.axis-vertical::before {
  top: 50%;
  left: 50%;
  width: 5px;
  height: 33px;
  transform: translate(-50%, -50%);
  background-size: 5px 6px;
  background-position: center;
}
.axis-horizontal { height: 9px; cursor: row-resize; width: 100%; }
.axis-horizontal::after { inset: 4px 0; }
.axis-horizontal::before {
  top: 50%;
  left: 50%;
  width: 33px;
  height: 5px;
  transform: translate(-50%, -50%);
  background-size: 6px 5px;
  background-position: center;
}
/* 档位循环钮——发现性根治（用户产线实报「没有快捷左右拉伸」
 实为钮 hover 才显形不可发现）：常显半透明 0.55，hover/激活全显 */
.sh-max {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--ac-line);
  border-radius: var(--r-s);
  background: var(--bg1);
  color: var(--tx2);
  cursor: pointer;
  opacity: 0.55;
  transition: opacity var(--tr), color var(--tr), border-color var(--tr), background var(--tr);
  z-index: 1;
}
.split-handle:hover .sh-max,
.split-handle:focus-visible .sh-max,
.sh-max:focus-visible,
.sh-max.sh-max-on { opacity: 1; }
.sh-max:hover { color: var(--ac); border-color: var(--ac); background: var(--ac-soft); }
.sh-max.sh-max-on { color: var(--ac); border-color: var(--ac-hi); background: var(--ac-soft); }
</style>
