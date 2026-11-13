<template>
  <!-- 直方图节组件化（DslQueryView:255-274 逐字迁移——「直方图和 Profile 的
 组件应该是同一套，且位置是同一套」裁决）。类名 dq-hist-* 全保留：IndexHub docs/query
 两 tab 接线，DQ 侧同位改用兑现（页内联块退役，双形态收口）。
 节头恒在场（无桶时原因/未执行提示由 meta 承接。 -->
  <div class="dq-hist-sec">
    <div class="dq-hist-head">
      <button type="button" class="dq-sec-tg" :aria-expanded="open"
        @click="emit('toggle')">
        <ChevronDown :size="12" :style="{ transform: open ? '' : 'rotate(-90deg)', transition: 'transform var(--tr)' }" />
        直方图分布
        <!-- 节头 meta 手写「·」串合并 MetaStrip（ DQ 侧合并形态随改用
 归一组件源：text 段形态，ms-sep 组件承担分隔；dq-sec-meta 类保留命中 MetaStrip 根） -->
        <MetaStrip class="dq-sec-meta" :items="brushRange ? [{ text: meta }, { text: '已刷选 ' + brushRange }] : [{ text: meta }]" />
      </button>
      <!-- 开关落位 prop 分叉根治——head=节头内建（IH 消费点默认，零变动）；
 host=组件不渲染开关，由宿主执行行承载（DQ 553 终审落位：执行行 Profile 旁） -->
      <label v-if="toggleSlot === 'head'" class="dq-sw dq-bar-hist"
        title="自动注入直方图聚合（date 型走时间直方图，keyword 型 ISO 串走词条分布；mapping 无 date 字段时自动从结果值形态嗅探）">
        <input type="checkbox" v-model="autoModel" /> 直方图
        <span v-if="noDateField" class="dq-hist-none"
          title="当前索引 mapping 无 date 字段：执行后将尝试从结果值形态嗅探（epoch 毫秒/秒/ISO 串）；均不匹配则不生成直方图">无时间字段</span>
      </label>
      <button v-if="brushRange" class="btn sm ghost" @click.stop="emit('clear-brush')"><X :size="11" /> 清除刷选</button>
      <!-- DQ 侧修治随改用归一：行尾弹性占位——节头组自然宽后右侧留白交占位吸收 -->
      <div style="flex:1"></div>
    </div>
    <div v-show="open && buckets.length" class="dq-hist-body">
      <AggBarChart :buckets="buckets" :height="80" @brush="(f, t, e) => emit('brush', f, t, e)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ChevronDown, X } from 'lucide-vue-next';
import AggBarChart from './AggBarChart.vue';
/* 节头 meta 合并 MetaStrip（557 DQ 侧形态归一组件源） */
import MetaStrip from './MetaStrip.vue';
import type { HistBucket } from '../composables/useHistAgg';

const props = withDefaults(defineProps<{
  /** 聚合桶（useHistAgg.histBuckets 直喂） */
  buckets: HistBucket[];
  /** 折叠态（useHistAgg.histSecOpen；折叠只藏图体，节头恒在场——） */
  open: boolean;
  /** 节头 meta（桶数/无桶原因/未执行提示，histHeadMeta 三态） */
  meta?: string;
  /** 刷选范围展示串（空=无刷选，清除钮随之隐藏；IndexHub 不接 brush 改写，恒空） */
  brushRange?: string;
  /** mapping 已加载且无 date 字段 → 开关旁「无时间字段」标注 */
  noDateField?: boolean;
  /** v-model:autoHist：自动注入开关（useHistAgg.autoHist 直喂） */
  autoHist?: boolean;
  /**
 * 开关落位（分叉根治）：'head'=节头内建开关（默认，IndexHub 两 tab 现状零变动）；
 * 'host'=组件不渲染开关，由宿主执行行承载（DQ 553 终审落位：执行行 Profile 旁）
 */
  toggleSlot?: 'head' | 'host';
}>(), { meta: '', brushRange: '', noDateField: false, autoHist: true, toggleSlot: 'head' });

const emit = defineEmits<{
  (e: 'toggle'): void;
  /* 1319b：endKey = 选区**右开边界**（下一桶 key）。桶 key 是区间起点，
     宿主必须用它而不是 to.key 作 range 上界，否则最后一桶的数据被切掉。 */
  (e: 'brush', from: HistBucket, to: HistBucket, endKey: number | string): void;
  (e: 'clear-brush'): void;
  (e: 'update:autoHist', v: boolean): void;
}>();

/* v-model:autoHist 承接：prop 只读，翻转转 emit（DQ v-model="autoHist" 语义原样） */
const autoModel = computed({
  get: () => props.autoHist ?? true,
  set: (v: boolean) => emit('update:autoHist', v),
});
</script>

<style scoped>
/* 样式同步更新自 DslQueryView（类名逐字保留；.dq-hist-sec 无 border-bottom/padding 框感——
 dqHistHead：分界交表格容器边框承接；间距 var(--sp-*) 梯）
 552 ⑥ DQ 侧节头形态三件（标题不吃满弹性+meta 省略号+行尾弹性占位见模板）
 随 DQ 改用归一组件源，双形态就此收口 */
.dq-sec-tg { display: flex; align-items: center; gap: var(--sp-1); width: 100%; font-size: var(--fs-xs); font-weight: 600; color: var(--tx1); background: none; border: none; padding: var(--sp-1) 0; cursor: pointer; text-align: left; }
.dq-sec-meta { color: var(--tx2); font-weight: 400; }
.dq-sw { display: flex; align-items: center; gap: 5px; font-size: var(--fs-sm); color: var(--tx1); cursor: pointer; user-select: none; }
.dq-hist-sec { margin-bottom: var(--sp-1); }
.dq-hist-head { display: flex; align-items: center; gap: var(--sp-2); }
/* DQ 侧修治随改用归一：标题不吃满弹性（自然宽+行尾占位平衡清除刷选钮），
 min-width:0 破 flex item 的 auto 下限（标题收缩+meta 省略号生效前提） */
.dq-hist-head .dq-sec-tg { flex: 0 1 auto; width: auto; min-width: 0; }
/* DQ 侧修治随改用归一：meta 超长省略号防撑行（histWhy 长原因串窄栏不炸行） */
.dq-hist-head .dq-sec-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.dq-hist-head .dq-bar-hist { flex-shrink: 0; }
</style>
