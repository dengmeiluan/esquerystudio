<template>
  <n-modal :show="show" @update:show="emit('update:show', $event)" preset="card" title="列详情" style="width:520px;max-width:92vw" :bordered="false">
    <div v-if="stats" class="rt-cd">
      <div class="rt-cd-hd mono"><span class="rt-cd-col">{{ stats.col }}</span><span v-if="stats.type" class="rt-th-type" :class="typeCls(stats.type)">{{ stats.type }}</span></div>
      <div class="rt-cd-grid mono">
        <span>去重值</span><b>{{ fmtNum(stats.distinct) }}</b>
        <span>空值</span><b>{{ fmtNum(stats.empty) }}</b>
        <!-- 空值率行（statsOf().emptyRate 派生档；Math.round 四舍五入取整 %） -->
        <span>空值率</span><b>{{ emptyRatePct }}</b>
        <template v-if="stats.numeric">
          <span>Σ / avg</span><b>{{ fmtNum(stats.numeric.sum) }} / {{ stats.numeric.avg.toFixed(2) }}</b>
          <span>min / max</span><b>{{ fmtNum(stats.numeric.min) }} / {{ fmtNum(stats.numeric.max) }}</b>
        </template>
      </div>
      <!-- 非语义类型降级——binary/geo 等照出高频值 top5（base64 串/坐标对
 无阅读意义）即整段藏起；空值/空值率统计行保留（rt-cd-grid 不动）；
 keyword/text 等语义类型与无类型（缺省徽标空串）照出，行为零回退 -->
      <div v-if="stats.top.length && !isNonSemanticType(stats.type)" class="rt-cd-top">
        <!-- 标题带全量口径（topTotal=useColStats slice 前条目数）——
 此前「前 5」看不出列基数是否被截断；
 (b)：标题行补「复制」钮（整列 top 值 TSV 出径，不受 kw 过滤影响） -->
        <div class="rt-cd-t"><span>高频值（前 {{ stats.top.length }} / 共 {{ fmtNum(stats.topTotal) }}）</span><button class="btn ghost sm rt-cd-copy" type="button" @click="copyTop">复制</button></div>
        <!-- 全量条目 >20 时出 kw 过滤（ReconcileReportDrawer rows>20 门控先例）；
 include 口径与 useColFilters.filterVals 一致（labelOf 小写包含） -->
        <!-- 轨4：裸 input（自造胶囊皮 + focus 边框）合并 SearchFilterBar 第 19 胞。
 topTotal>20 门控与 mono 字面锚同步更新（ / 
 运行时锚零迁移）；自造 focus 边框由 :focus-within 焦点环承接 -->
        <SearchFilterBar v-if="stats.topTotal > 20" v-model="kw" class="rt-cd-kw-wrap" input-class="rt-cd-kw mono" placeholder="过滤高频值…" />
        <div v-for="(e, i) in topView" :key="i" class="rt-cd-row mono">
          <span class="rt-cd-v" :title="labelOf(e.v)">{{ labelOf(e.v) }}</span>
          <span class="rt-cd-n">{{ e.n }} 行</span>
        </div>
        <div v-if="!topView.length" class="rt-cd-none">无匹配值</div>
      </div>
      <!-- 值分布段（531 遗留件）——stats.dist 非空（数值列且数值点≥2，
 useColStats 硬口径）渲染 8 桶 mini 高度条（扁平无壳无边框，color var(--acc)，
 桶 :title=「from~to: count」）；dist 为 null/缺省时段零渲染（缺省零视觉） -->
      <div v-if="stats.dist" class="rt-cd-dist">
        <div class="rt-cd-t"><span>分布</span></div>
        <div class="rt-cd-bars">
          <div v-for="(b, i) in stats.dist.bins" :key="i" class="rt-cd-bar" :title="`${b.from}~${b.to}: ${b.count}`">
            <div class="rt-cd-bar-fill" :style="{ height: distBarH(b.count) }"></div>
          </div>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { NModal } from 'naive-ui';
import { fmtNum, copyText } from '../utils/format';
import { matrixTsv } from '../utils/copyMatrix';
import { isNonSemanticType, typeCls } from '../utils/typeTiers';
import { useAppStore } from '../stores/app';
import SearchFilterBar from './SearchFilterBar.vue'; /* 轨4：过滤框统一件（第 19 胞） */
import type { ColDetailStats } from '../composables/useColStats';

/* 列详情弹窗共享件（RT P2-3 弹窗形态合并，QRT 同步接入）——
 统计结果由 useColStats 产出经 props 注入；类名保留 rt-cd 系（RT 既有弹窗契约，
 rtColDetailFreeze236 行为锁按 .rt-cd 查询）。
 (b)：typeCls 合并 typeTiers 单源（弹窗内聚副本与 typeTiers.ts
 官方实现逐字同值，本地五正则副本退役；列头徽标逻辑不动）。 */
const props = defineProps<{
  show: boolean;
  stats: ColDetailStats | null;
  /** 高频值的展示文案（与调用方筛选弹层 labelOf 同口径） */
  labelOf?: (v: any) => string;
}>();
const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>();
const labelOf = (v: any) => (props.labelOf ? props.labelOf(v) : v === null || v === undefined ? '∅' : String(v));

/* 空值率显示档（Math.round 四舍五入取整 %；stats 为 null 时占位 0%） */
const emptyRatePct = computed(() => Math.round((props.stats?.emptyRate ?? 0) * 100) + '%');

/* 分布桶高（count/最大桶 count 归一取整 %；空桶 0% 高不可见） */
const distBarH = (n: number) => {
  const bins = props.stats?.dist?.bins ?? [];
  const max = Math.max(1, ...bins.map(b => b.count));
  return Math.round((n / max) * 100) + '%';
};

/* 高频值 kw 过滤（组件内 ref，include 口径与 useColFilters.filterVals 一致）——
 只滤显示行（top 已按计数截断），换列自动清词 */
const kw = ref('');
watch(() => props.stats?.col, () => { kw.value = ''; });
const topView = computed(() => {
  const top = props.stats?.top ?? [];
  const k = kw.value.trim().toLowerCase();
  if (!k) return top;
  return top.filter(e => labelOf(e.v).toLowerCase().includes(k));
});

/* (b)：高频值整列复制出口——格式化走 copyMatrix.matrixTsv 单源
 （「值/行数」两列 TSV、表头行必含），复制走 format.copyText → clipboard.ts
 三层管线；出径=整列 top 全量（kw 过滤只滤显示行，不改复制内容） */
const store = useAppStore();
async function copyTop() {
  const top = props.stats?.top ?? [];
  if (!top.length) return;
  const tsv = matrixTsv({ rows: top, cols: ['值', '行数'], getVal: (e: { v: any; n: number }, c: string) => (c === '值' ? labelOf(e.v) : e.n) });
  const ok = await copyText(tsv);
  store.notify(ok ? 'success' : 'error', ok ? '高频值已复制（TSV）' : '复制失败：浏览器拦截了剪贴板');
}
</script>

<style scoped>
/* rt-cd 系样式自 RT scoped 平移（弹窗形态随组件走；类名不变保既有测试契约） */
.rt-cd-hd { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2h); }
.rt-cd-col { font-size: var(--fs-lg); font-weight: 650; color: var(--tx0); }
.rt-cd-grid { display: grid; grid-template-columns: 90px 1fr; gap: var(--sp-1) var(--sp-3); font-size: var(--fs-sm); padding: var(--sp-2) 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.rt-cd-grid span { color: var(--tx2); }
/* (b)：标题行 flex 收「复制」钮（--sp 档位纪律：gap 全走 var 档） */
.rt-cd-t { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); font-size: var(--fs-xs); color: var(--tx2); margin: var(--sp-2h) 0 var(--sp-1); }
.rt-cd-copy { flex-shrink: 0; }
/* 高频值 kw 过滤输入 + 空匹配提示；
 改用 SearchFilterBar——自造输入皮（bg0 底/line 边/4px 圆角）退役归胶囊壳单源，
 本类只留落位/内衬（width/box-sizing/padding/font 逐值迁入），focus 边框改 :focus-within 承接 */
.rt-cd-kw-wrap { width: 100%; box-sizing: border-box; padding: var(--sp-1) var(--sp-2); font-size: var(--fs-xs); margin-bottom: var(--sp-1); }
.rt-cd-kw-wrap:focus-within { border-color: var(--ac-line); }
.rt-cd-none { font-size: var(--fs-xs); color: var(--tx2); padding: var(--sp-1) 0; }
.rt-cd-row { display: flex; justify-content: space-between; gap: var(--sp-3); padding: var(--sp-0) 0; font-size: var(--fs-sm); }
.rt-cd-v { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rt-cd-n { color: var(--tx2); flex-shrink: 0; }
/* 分布 8 桶 mini 高度条——扁平无壳无边框，color var(--acc)，桶底对齐 */
.rt-cd-dist { margin-top: var(--sp-1); }
.rt-cd-bars { display: flex; align-items: flex-end; gap: var(--sp-0); height: 48px; }
.rt-cd-bar { flex: 1; height: 100%; display: flex; align-items: flex-end; }
.rt-cd-bar-fill { width: 100%; background: var(--acc); }
.rt-th-type { font-size: var(--fs-2xs); font-weight: 400; color: var(--info); opacity: .85; }
.rt-th-type.rt-ty-num { color: var(--info); }
.rt-th-type.rt-ty-date { color: var(--warn); }
.rt-th-type.rt-ty-bool { color: var(--ok); }
.rt-th-type.rt-ty-text { color: var(--tx1); }
.rt-th-type.rt-ty-kw { color: var(--ac-hi); }
</style>
