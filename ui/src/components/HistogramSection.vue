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
      <Tip v-if="toggleSlot === 'head'" long text="自动注入直方图聚合（date 型走时间直方图，keyword 型 ISO 串走词条分布；mapping 无 date 字段时自动从结果值形态嗅探；识别不到时可在右侧手动选字段）">
        <div class="dq-sw dq-bar-hist">
          <n-checkbox v-model:checked="autoModel" size="small">直方图</n-checkbox>
          <!-- 无时间字段标注的细化释义走 Tip long（与外层开关释义双层悬浮，形态等价原原生 title） -->
          <Tip v-if="noDateField" long :text="DATE_FIELD_SNIFF_HINT">
            <span class="dq-hist-none">无时间字段</span>
          </Tip>
        </div>
      </Tip>
      <!-- 688：字段诊断 / 手动选字段——自动识别不到时不再是死路：
           候选（含 ID 类弱候选）可手动选则按类型注入（keyword=词条、数值=固定桶宽、date=时间直方图）；
           「为什么？」列出 mapping 每个字段的不适用原因（常量/ID/text 无 .keyword/数组/无样本）。 -->
      <n-select v-if="fieldOptions.length" class="dq-hist-field" size="tiny" :value="fieldValue || null"
        :options="fieldSelectOptions" placeholder="直方图字段（自动）" clearable :consistent-menu-width="false"
        :aria-label="'选择直方图字段'" @update:value="v => emit('pick-field', String(v || ''))" />
      <Tip v-if="fieldWeak" long :text="fieldNote || 'ID 类字段：仅作值分布查看，通常无业务含义'">
        <span class="dq-hist-weak">ID 字段</span>
      </Tip>
      <n-popover v-if="rejectedFields.length" trigger="click" placement="bottom-start" class="dq-hist-why-wrap">
        <template #trigger>
          <button type="button" class="dq-hist-why" :aria-label="'为什么没有直方图：查看字段诊断'"
            v-tip="'查看 mapping 每个字段为何不能自动分桶'">为什么？</button>
        </template>
        <div class="dq-hist-why-pop">
          <div class="dq-hist-why-t">字段诊断 · {{ rejectedFields.length }} 个字段不参与自动分桶</div>
          <ul class="dq-hist-why-list">
            <li v-for="r in rejectedFields" :key="r.path">
              <code>{{ r.path }}</code><span class="dq-hist-why-type">{{ r.type || '未知' }}</span><em>{{ r.reason }}</em>
            </li>
          </ul>
          <div class="dq-hist-why-f">直方图需要日期、可分组 keyword 或数值字段；全文字段、ID 与常量字段不会自动参与。若上方出现「直方图字段」选择框，可手动选择后再执行查询。</div>
        </div>
      </n-popover>
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
import { NCheckbox, NSelect, NPopover } from 'naive-ui';
import { ChevronDown, X } from 'lucide-vue-next';
import AggBarChart from './AggBarChart.vue';
/* 节头 meta 合并 MetaStrip（557 DQ 侧形态归一组件源） */
import MetaStrip from './MetaStrip.vue';
import Tip from './Tip.vue'; /* 超长悬浮说明统一件（直方图开关释义） */
import { DATE_FIELD_SNIFF_HINT } from '../utils/dateFieldSniff';
import type { HistBucket } from '../composables/useHistAgg';
import type { HistCandidate, HistRejection } from '../utils/histField';

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
  /** 688：可手动选择的字段（useHistAgg.histCandidates） */
  fieldOptions?: HistCandidate[];
  /** 当前手动选择（空=自动） */
  fieldValue?: string;
  /** 688：不参与自动分桶的字段与原因（字段诊断弹层） */
  rejectedFields?: HistRejection[];
  /** 688：当前选择是 ID 类弱字段（图上给「ID 字段」提示，防误读业务分布） */
  fieldWeak?: boolean;
  fieldNote?: string;
}>(), { meta: '', brushRange: '', noDateField: false, autoHist: true, toggleSlot: 'head', fieldOptions: () => [], fieldValue: '', rejectedFields: () => [], fieldWeak: false, fieldNote: '' });

const emit = defineEmits<{
  (e: 'toggle'): void;
  /* 1319b：endKey = 选区**右开边界**（下一桶 key）。桶 key 是区间起点，
     宿主必须用它而不是 to.key 作 range 上界，否则最后一桶的数据被切掉。 */
  (e: 'brush', from: HistBucket, to: HistBucket, endKey: number | string): void;
  (e: 'clear-brush'): void;
  (e: 'update:autoHist', v: boolean): void;
  /** 688：手动选字段（空串=回到自动） */
  (e: 'pick-field', field: string): void;
}>();

/* v-model:autoHist 承接：prop 只读，翻转转 emit（DQ v-model="autoHist" 语义原样） */
const autoModel = computed({
  get: () => props.autoHist ?? true,
  set: (v: boolean) => emit('update:autoHist', v),
});

const HIST_KIND_ZH: Record<string, string> = { date: '时间', keyword: '词条', numeric: '数值' };
const fieldSelectOptions = computed(() => props.fieldOptions.map(c => ({
  value: c.path,
  label: `${c.path} · ${HIST_KIND_ZH[c.kind] || c.kind}${c.weak ? '（ID）' : ''}`,
})));
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
.dq-hist-head { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; row-gap: var(--sp-1); }
/* 688：手动字段选择与字段诊断（自动识别不到时的出口） */
.dq-hist-field { width: 190px; flex: 0 0 auto; }
.dq-hist-why { font-size: var(--fs-2xs); color: var(--info); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline dotted; flex-shrink: 0; }
.dq-hist-why:hover { color: var(--ac-hi); }
/* 688：ID 类字段提示（弱候选被选中时） */
.dq-hist-weak { flex-shrink: 0; padding: 1px var(--sp-1h); font-size: var(--fs-2xs); font-weight: 600; color: var(--warn); background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: 3px; cursor: help; }
.dq-hist-why-pop { max-width: 440px; font-size: var(--fs-xs); }
.dq-hist-why-t { font-weight: 600; color: var(--tx0); margin-bottom: var(--sp-2); }
.dq-hist-why-list { list-style: none; margin: 0; padding: 0; max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-1h); }
.dq-hist-why-list li { display: flex; align-items: baseline; gap: var(--sp-2); flex-wrap: wrap; }
.dq-hist-why-list code { font-family: var(--mono); color: var(--tx0); }
.dq-hist-why-type { font-size: var(--fs-2xs); color: var(--tx2); }
.dq-hist-why-list em { font-style: normal; color: var(--warn); font-size: var(--fs-2xs); }
.dq-hist-why-f { margin-top: var(--sp-2); padding-top: var(--sp-2); border-top: 1px dashed var(--line); color: var(--tx2); line-height: 1.6; }
/* DQ 侧修治随改用归一：标题不吃满弹性（自然宽+行尾占位平衡清除刷选钮），
 min-width:0 破 flex item 的 auto 下限（标题收缩+meta 省略号生效前提） */
.dq-hist-head .dq-sec-tg { flex: 0 1 auto; width: auto; min-width: 0; }
/* DQ 侧修治随改用归一：meta 超长省略号防撑行（histWhy 长原因串窄栏不炸行） */
.dq-hist-head .dq-sec-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.dq-hist-head .dq-bar-hist { flex-shrink: 0; }
</style>
