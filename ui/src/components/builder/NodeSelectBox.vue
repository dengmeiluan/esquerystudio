<template>
  <label v-if="bus?.enabled.value" class="nsb" :title="checked ? '取消选择（Shift+点击连续范围）' : '选择该条件（Shift+点击连续范围，可批量停用/复制/删除）'" @click.stop @mousedown.stop="onDown">
    <input type="checkbox" :checked="checked" :aria-label="(checked ? '取消选择条件 ' : '选择条件 ') + id"
      @change="onChange" />
  </label>
</template>

<script setup lang="ts">
/* 1049：多选复选框——任意层级行只读消费 SELECT_BUS；多选关闭时整块不渲染（零占位）。
   1053：Shift 连续范围——mousedown 记下 shift，change 时交给宿主按可见行序补齐区间。 */
import { computed, inject } from 'vue';
import { SELECT_BUS } from './treeBus';

const props = defineProps<{ id: string }>();
const bus = inject(SELECT_BUS, null);
const checked = computed(() => !!bus?.selected.value.has(props.id));
let shiftDown = false;
function onDown(e: MouseEvent) { shiftDown = e.shiftKey; }
function onChange() { bus?.toggle(props.id, shiftDown); shiftDown = false; }
</script>

<style scoped>
.nsb { display: inline-flex; align-items: center; flex: none; cursor: pointer; }
.nsb input { width: 14px; height: 14px; margin: 0; accent-color: var(--ac); cursor: pointer; }
</style>
