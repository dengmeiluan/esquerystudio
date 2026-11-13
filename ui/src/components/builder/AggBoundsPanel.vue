<template>
  <div class="abp">
    <!-- 1035：date_histogram / histogram 的 extended_bounds 边界面板（AggTreeNode 挂接，
         AST 零改动 body 直通投影，AggRangesPanel 同款范式）。空桶边界：直方图只对有文档
         的区间出桶，趋势图两头断线——extended_bounds {min,max} 让 ES 把空桶也补出来。
         min/max 留空删键；双空删整个 extended_bounds 键回默认（emit 空数组哨兵，
         外层 onBodyPatch 落删除）。date-math 串原样、数值字面量转数值。 -->
    <div class="abp-row">
      <span class="abp-tip" title="空桶边界：ES 默认只对有文档的区间出桶；设 min/max 后空区间也补空桶（趋势图连续）">
        空桶边界 extended_bounds
      </span>
      <span class="abp-lb">min</span>
      <input class="inp mono abp-in" :value="cellText('min')" data-k="min" placeholder="now-30d/d 或 0"
             title="边界下界：date-math（now-30d/d）或数值；留空 = 不设下界"
             @input="onInput('min', ($event.target as HTMLInputElement).value)" />
      <span class="abp-sep">→</span>
      <span class="abp-lb">max</span>
      <input class="inp mono abp-in" :value="cellText('max')" data-k="max" placeholder="now 或 100"
             title="边界上界：date-math（now）或数值；留空 = 不设上界"
             @input="onInput('max', ($event.target as HTMLInputElement).value)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ body: Record<string, unknown> }>();
const emit = defineEmits<{ (e: 'patch', v: unknown): void }>();

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const cur = computed<Record<string, unknown>>(() => (isObj(props.body.extended_bounds) ? props.body.extended_bounds : {}));

function cellText(k: 'min' | 'max'): string {
  const v = cur.value[k];
  return v === undefined || v === null ? '' : String(v);
}
/* 数值字面量转数值（date-math 串原样）——AggRangesPanel.setCell 同款判定 */
function numOrStr(raw: string): unknown {
  const t = raw.trim();
  const n = Number(t);
  return t !== '' && Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(t) ? n : raw;
}
function onInput(k: 'min' | 'max', raw: string) {
  const out: Record<string, unknown> = {};
  const minRaw = k === 'min' ? raw : cellText('min');
  const maxRaw = k === 'max' ? raw : cellText('max');
  if (minRaw !== '') out.min = numOrStr(minRaw);
  if (maxRaw !== '') out.max = numOrStr(maxRaw);
  if (!Object.keys(out).length) { emit('patch', []); return; }   // 双空 = 删键哨兵
  emit('patch', out);
}
</script>

<style scoped>
.abp { padding: var(--sp-2); background: var(--bg2); border-radius: var(--r-s); margin-bottom: var(--sp-2); }
.abp-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.abp-tip { font-size: var(--fs-2xs); color: var(--tx2); }
.abp-lb { font-size: var(--fs-2xs); color: var(--tx2); }
.abp-in { width: 148px; height: 28px; font-size: var(--fs-sm); }
.abp-sep { font-size: var(--fs-2xs); color: var(--tx2); }
</style>
