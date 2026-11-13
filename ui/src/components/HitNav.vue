<template>
  <span class="hn" :class="{ compact }">
    <!-- 可选搜索输入：传了 modelValue 才渲染（调用方已有输入框时省掉，只挂计数+按钮） -->
    <input
      v-if="hasInput"
      class="hn-inp"
      :value="modelValue"
      :placeholder="placeholder"
      aria-label="表内搜索"
      type="text"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keydown.enter.prevent="onEnter"
    />
    <span class="hn-count mono" :class="{ zero: !count }" :title="count ? `命中 ${count} 处：Enter 下一个 / Shift+Enter 上一个` : '无命中'">
      <template v-if="count">{{ current }}/{{ count }}</template>
      <template v-else>0 命中</template>
    </span>
    <button
      type="button" class="hn-btn" :disabled="!count"
      :title="'上一个（Shift+Enter）'" aria-label="上一个命中（Shift+Enter）"
      @click="emit('prev')"
    ><ChevronUp :size="12" /><span v-if="!compact" class="hn-btn-t">上一个</span></button>
    <button
      type="button" class="hn-btn" :disabled="!count"
      :title="'下一个（Enter）'" aria-label="下一个命中（Enter）"
      @click="emit('next')"
    ><ChevronDown :size="12" /><span v-if="!compact" class="hn-btn-t">下一个</span></button>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ChevronUp, ChevronDown } from 'lucide-vue-next';

/* 搜索定位导航条：命中计数 + 上一个/下一个。可内嵌搜索输入（v-model:modelValue），
 也可只挂计数+按钮（调用方复用自己已有的输入框，Enter/Shift+Enter 由调用方接线）。
 ~24px 高，直接塞进现有工具条。 */
const props = withDefaults(defineProps<{
  /** 命中总数 */
  count: number;
  /** 当前命中序号（1-based；count=0 时显示「0 命中」） */
  current: number;
  placeholder?: string;
  /** 搜索词（传了才渲染输入框，Enter=下一个 / Shift+Enter=上一个） */
  modelValue?: string;
  /** 紧凑档：按钮只留图标，计数字号更小 */
  compact?: boolean;
}>(), { placeholder: '搜索…', modelValue: undefined, compact: false });

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void; (e: 'next'): void; (e: 'prev'): void }>();

/* Enter=下一个 / Shift+Enter=上一个（分支具体化，避开 emit 联名重载的窄化失败） */
function onEnter(e: KeyboardEvent) {
  if (e.shiftKey) emit('prev');
  else emit('next');
}

const hasInput = computed(() => props.modelValue !== undefined);
</script>

<style scoped>
.hn { display: inline-flex; align-items: center; gap: var(--sp-1); flex-shrink: 0; height: 24px; }
.hn-inp {
  height: 24px; padding: 0 var(--sp-2); font-size: var(--fs-xs); min-width: 110px;
  background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r-s);
  color: var(--tx0); outline: none; font-family: inherit;
}
.hn-inp:focus { border-color: var(--ac); }
.hn-count {
  font-size: var(--fs-2xs); color: var(--tx2); white-space: nowrap;
  padding: 0 var(--sp-1); border-radius: 999px; background: var(--hl-soft);
}
.hn-count.zero { color: var(--tx2); opacity: .85; }
.hn-btn {
  display: inline-flex; align-items: center; gap: var(--sp-0); height: 24px; padding: 0 var(--sp-1);
  background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-s);
  color: var(--tx1); cursor: pointer; font-size: var(--fs-2xs); line-height: 1; font-family: inherit;
}
.hn-btn:hover:not(:disabled) { color: var(--ac-hi); border-color: var(--ac-line); }
.hn-btn:disabled { opacity: .4; cursor: not-allowed; }
.hn.compact .hn-count { font-size: var(--fs-2xs); }
</style>
