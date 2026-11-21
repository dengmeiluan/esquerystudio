<template>
  <div class="arp">
    <!-- 1022：date_range / range 聚合的 ranges 数组行编辑（AggTreeNode 挂接，AST 零改动
         body 直通投影）。每行 from/to/key 三输入（from/to 接受 date-math 串或数值，
         半成品允许键缺席——from-only/to-only 开区间段合法形态）；空串删键。
         其余 body 键（field/format/…）由外层 schema 表编辑，本面板只投影 ranges。 -->
    <div v-for="(r, i) in rows" :key="i" class="arp-row">
      <span class="arp-idx mono">{{ i + 1 }}</span>
      <input class="inp mono arp-in arp-from" :value="cellText(i, 'from')" placeholder="from 起（含）"
             title="区间下界（含）；date-math（如 now-10M/M）或数值，留空 = 负无穷开区间" @input="setCell(i, 'from', ($event.target as HTMLInputElement).value)" />
      <span class="arp-sep">→</span>
      <input class="inp mono arp-in arp-to" :value="cellText(i, 'to')" placeholder="to 止（不含）"
             title="区间上界（不含）；date-math 或数值，留空 = 正无穷开区间" @input="setCell(i, 'to', ($event.target as HTMLInputElement).value)" />
      <input class="inp mono arp-in arp-key" :value="cellText(i, 'key')" placeholder="key 桶名（可空）"
             title="桶自定义名（可空=ES 默认 from-to 拼名）" @input="setCell(i, 'key', ($event.target as HTMLInputElement).value)" />
      <button aria-label="删除区间行" class="btn sm ghost danger" title="删除该区间" @click="delRow(i)">
        <X :size="12" />
      </button>
    </div>
    <button class="btn sm ghost arp-add" @click="addRow"><Plus :size="12" /> 加区间</button>
    <span v-if="!rows.length" class="arp-none">无区间（聚合无桶——至少加一行）</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { X, Plus } from 'lucide-vue-next';

const props = defineProps<{ body: Record<string, unknown> }>();
const emit = defineEmits<{ (e: 'patch', ranges: unknown[]): void }>();

const rows = computed<Record<string, unknown>[]>(() =>
  Array.isArray(props.body.ranges) ? props.body.ranges as Record<string, unknown>[] : []);

/* 值原样显示：串（date-math）/数值统一 String；键缺席 = 空 */
function cellText(i: number, k: 'from' | 'to' | 'key'): string {
  const v = rows.value[i]?.[k];
  return v === undefined || v === null ? '' : String(v);
}
function setCell(i: number, k: 'from' | 'to' | 'key', raw: string) {
  const next = rows.value.map((r, j) => {
    if (j !== i) return r;
    const c: Record<string, unknown> = { ...r };
    if (raw === '') delete c[k];
    else {
      /* 数值形态写数值（date-math 串原样），key 恒字符串 */
      const n = Number(raw);
      c[k] = (k !== 'key' && raw.trim() !== '' && Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(raw.trim())) ? n : raw;
    }
    return c;
  });
  emit('patch', next);
}
function delRow(i: number) { emit('patch', rows.value.filter((_, j) => j !== i)); }
function addRow() { emit('patch', [...rows.value, {}]); }
</script>

<style scoped>
.arp { display: flex; flex-direction: column; gap: var(--sp-1); padding: var(--sp-2); background: var(--bg2); border-radius: var(--r-s); margin-bottom: var(--sp-2); }
.arp-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.arp-idx { font-size: var(--fs-2xs); color: var(--tx2); min-width: 14px; text-align: right; }
.arp-in { height: 28px; font-size: var(--fs-sm); }
.arp-from, .arp-to { width: 118px; }
.arp-key { width: 108px; }
.arp-sep { font-size: var(--fs-2xs); color: var(--tx2); }
.arp-add { align-self: flex-start; }
.arp-none { font-size: var(--fs-xs); color: var(--tx2); }
</style>
