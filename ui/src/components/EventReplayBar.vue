<!-- 事件回放控制条：播放/暂停、逐条步进、进度滑杆、倍速与退出实时。
     宿主只喂 count/index/progress，所有时间轴换算在 useEventReplay 内完成。 -->
<template>
  <div class="evr" role="group" aria-label="事件回放控制" data-test="evr-bar"
       @keydown="onKeydown">
    <button type="button" class="evr-btn" :aria-label="playing ? '暂停回放' : '播放回放'"
            :aria-pressed="playing ? 'true' : 'false'" data-test="evr-toggle"
            v-tip="playing ? '暂停（Space）' : '播放（Space）'" @click="emit('toggle')">
      <Pause v-if="playing" :size="12" />
      <Play v-else :size="12" />
    </button>
    <button type="button" class="evr-btn" aria-label="上一条事件" data-test="evr-prev"
            v-tip="'上一条（←）'" :disabled="index <= 0" @click="emit('step', -1)">
      <SkipBack :size="11" />
    </button>
    <button type="button" class="evr-btn" aria-label="下一条事件" data-test="evr-next"
            v-tip="'下一条（→）'" :disabled="index >= count - 1" @click="emit('step', 1)">
      <SkipForward :size="11" />
    </button>
    <n-slider class="evr-slider" :value="Math.round(progress * 1000)" :min="0" :max="1000" :step="1"
              :tooltip="false" aria-label="回放进度" data-test="evr-seek"
              @update:value="onSeek" />
    <span class="evr-pos mono" data-test="evr-pos">{{ Math.max(0, index) + 1 }}/{{ count }}</span>
    <span class="evr-speed" role="group" aria-label="回放倍速">
      <button v-for="s in REPLAY_SPEEDS" :key="s" type="button" class="evr-sp"
              :class="{ on: speed === s }" :aria-pressed="speed === s ? 'true' : 'false'"
              :data-test="'evr-speed-' + s" v-tip="'回放倍速 ' + s + '×（只改播放节奏，不改事件本身）'"
              @click="pickSpeed(s)">{{ s }}×</button>
    </span>
    <button type="button" class="evr-exit" data-test="evr-exit" v-tip="'退出回放，回到实时时间线'"
            @click="emit('exit')">回到实时</button>
  </div>
</template>

<script setup lang="ts">
import { NSlider } from 'naive-ui';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-vue-next';
import { REPLAY_SPEEDS } from '../composables/useEventReplay';

const props = defineProps<{
  count: number;
  index: number;
  playing: boolean;
  progress: number;
  speed: number;
}>();
const emit = defineEmits<{
  (e: 'toggle'): void;
  (e: 'seek', progress: number): void;
  (e: 'step', delta: number): void;
  (e: 'speed', value: number): void;
  (e: 'exit'): void;
}>();

function onSeek(v: number | [number, number]) {
  const n = Array.isArray(v) ? v[0] : v;
  emit('seek', Math.max(0, Math.min(1, Number(n) / 1000)));
}

function pickSpeed(s: number) {
  emit('speed', s);
}

/* 键盘：焦点在滑杆上时交给 NSlider 自己处理方向键，避免双重步进 */
function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  if (target?.closest('.n-slider')) return;
  if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); emit('toggle'); return; }
  if (e.key === 'ArrowLeft') { e.preventDefault(); emit('step', -1); return; }
  if (e.key === 'ArrowRight') { e.preventDefault(); emit('step', 1); return; }
  if (e.key === 'Home') { e.preventDefault(); emit('seek', 0); return; }
  if (e.key === 'End') { e.preventDefault(); emit('seek', 1); }
}
</script>

<style scoped>
.evr {
  display: flex; align-items: center; gap: var(--sp-1h, 6px);
  padding: var(--sp-1h, 6px) var(--sp-2, 8px);
  border: 1px solid var(--line); border-radius: var(--r-l, 12px);
  background: color-mix(in srgb, var(--bg2) 55%, transparent);
  margin: var(--sp-1, 4px) 0 var(--sp-2, 8px);
  min-height: 38px;
}
.evr-btn {
  width: 26px; height: 26px; flex: 0 0 auto;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--line); border-radius: var(--r-s, 6px);
  background: var(--bg1); color: var(--fg);
  cursor: pointer;
  transition: background 140ms var(--ease-out), border-color 140ms var(--ease-out), transform 140ms var(--ease-out);
}
.evr-btn:hover:not(:disabled) { background: var(--bg3); border-color: var(--line-hover); }
.evr-btn:active:not(:disabled) { transform: scale(.94); }
.evr-btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.evr-btn:disabled { opacity: .4; cursor: default; }
.evr-slider { flex: 1 1 auto; min-width: 90px; max-width: 320px; }
.evr-pos { flex: 0 0 auto; font-size: var(--fs-xs, 11px); color: var(--tx2); min-width: 46px; text-align: center; }
.evr-speed { display: inline-flex; gap: var(--sp-0); flex: 0 0 auto; }
.evr-sp {
  border: 1px solid transparent; border-radius: var(--r-xs, 4px);
  background: transparent; color: var(--tx2);
  font-size: var(--fs-xs, 11px); line-height: 1; padding: var(--sp-1) 5px;
  cursor: pointer; font-variant-numeric: tabular-nums;
  transition: color 120ms var(--ease-out), background 120ms var(--ease-out);
}
.evr-sp:hover { color: var(--fg); background: var(--bg3); }
.evr-sp.on { color: var(--brand); background: var(--brand-soft); }
.evr-sp:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
.evr-exit {
  flex: 0 0 auto; border: 1px solid var(--line); border-radius: var(--r-s, 6px);
  background: transparent; color: var(--fg); font-size: var(--fs-xs, 11px);
  padding: 5px var(--sp-2); cursor: pointer;
  transition: background 140ms var(--ease-out), border-color 140ms var(--ease-out);
}
.evr-exit:hover { background: var(--bg3); border-color: var(--line-hover); }
.evr-exit:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .evr-btn, .evr-sp, .evr-exit { transition: none; }
  .evr-btn:active:not(:disabled) { transform: none; }
}
@media (max-width: 600px) {
  /* 两排：播放/步进/位置/退出一排，倍速+滑杆一排（退出不再独占一行） */
  .evr { flex-wrap: wrap; row-gap: var(--sp-1); }
  .evr-exit { order: 5; margin-left: auto; }
  .evr-speed { order: 6; }
  .evr-slider { order: 7; flex: 1 1 100px; max-width: none; }
}
</style>
