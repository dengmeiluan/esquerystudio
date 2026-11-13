<template>
  <teleport to="body">
    <div class="cfp-mask" role="presentation" @click="emit('close')" @keydown.enter="emit('close')" tabindex="-1">
      <div ref="panelEl" class="cfp float-pop" role="dialog" :aria-label="'筛选 ' + col + ' 列'" :style="{ left: pos.x + 'px', top: pos.y + 'px' }" @click.stop tabindex="-1">
        <div class="cfp-hd mono">
          <span>筛选「{{ col }}」</span>
          <!-- 内建组合档 chip（可选 filterMode——缺省不传零渲染，五通道既有
 消费方弹层零变化；561 双内核走默认槽注入位，本 chip 供未接线通道 opt-in）。
 aria/title 文案与双内核槽钮同语汇（filterModeToggle561 行为锚同串） -->
          <button v-if="filterMode" class="cfp-fmode mono"
                  :aria-label="'筛选组合档：' + filterMode + '（点击切换）'"
                  :title="'多列筛选组合：' + filterMode + '（点击切换为 ' + (filterMode === 'AND' ? 'OR 任一列命中' : 'AND 全部命中') + '）'"
                  @click="emit('toggle-filter-mode')">组合：{{ filterMode }}</button>
          <button class="cfp-clear" @click="emit('clear'); emit('close')">清除</button>
        </div>
        <input v-if="search" class="cfp-kw mono" type="text" :value="kw"
               :placeholder="`搜索值（共 ${total} 个不同值）…`"
               @input="emit('update:kw', ($event.target as HTMLInputElement).value)" @keydown.stop />
        <!-- 类型感知区间过滤（QRT/RT/Security 通道）——min/max 双输入，与等值勾选并存 AND；
 占位缺省「最小/最大值（含）」，date 列由消费方传带 ISO/epoch 示例的占位 -->
        <div v-if="range" class="cfp-range">
          <input class="cfp-range-in mono" type="text" :value="rangeMin"
                 :placeholder="rangeMinPh" :aria-label="col + ' 最小值（含）'"
                 @input="emit('set-range', 'min', ($event.target as HTMLInputElement).value)" @keydown.stop />
          <span class="cfp-range-sep" aria-hidden="true">–</span>
          <input class="cfp-range-in mono" type="text" :value="rangeMax"
                 :placeholder="rangeMaxPh" :aria-label="col + ' 最大值（含）'"
                 @input="emit('set-range', 'max', ($event.target as HTMLInputElement).value)" @keydown.stop />
        </div>
        <!-- 列内文本包含行（contains 门控；与等值/区间并存 AND）——
 未传 contains 恒不渲染（五通道既有消费方弹层零变化） -->
        <input v-if="contains" class="cfp-kw mono" type="text" :value="containsVal"
               placeholder="包含文本（含即保留）" :aria-label="col + ' 包含文本筛选'"
               @input="emit('set-contains', ($event.target as HTMLInputElement).value)" @keydown.stop />
        <label v-for="(e, vi) in vals" :key="vi" class="cfp-row">
          <input type="checkbox" :checked="selected.includes(normOf(e.v))" @change="emit('toggle', e.v)" />
          <!-- 传 labelOf（QRT/RT）：MarkText 值内搜索命中段切 mark + title 全文；
 不传（Browser/Plugins/Security）：裸 ∅/String 展示，行为与五处原壳逐字一致 -->
          <span v-if="labelOf" class="mono cfp-val" :title="labelOf(e.v)"><MarkText :text="labelOf(e.v)" :kw="kw" /></span>
          <span v-else class="mono cfp-val">{{ fmtVal(e.v) }}</span>
          <!-- 值分布 mini-bar（bars，QRT/RT 通道）——按所显示值最大计数归一的纯 CSS 百分条 -->
          <span v-if="bars" class="cfp-barw" :title="barScopeTip" aria-hidden="true"><span class="cfp-bar" :style="{ width: barPct(e.n) }"></span></span>
          <span class="cfp-n mono" :title="'该值 ' + e.n + ' 行'">{{ e.n }}</span>
        </label>
        <div v-if="!vals.length" class="cfp-empty">无匹配值</div>
        <div v-if="showHasMore && hasMore" class="cfp-empty">仅显示前 {{ vals.length }} 个高频值——用上方搜索缩小范围</div>
        <!-- 消费方注入位（Browser 弹层内「复制整列值」）；无注入不渲染容器 -->
        <div v-if="$slots.default" class="cfp-acts"><slot /></div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
/* 列筛选弹层共享壳合并——此前 QRT(qfp)/RT(rfp)/Browser(bw-fp)/Plugins(pl-afp)/
 Security(afp) 五份同构手写壳（mask+fixed 面板+「筛选「列」」头+清除+值内搜索+每值计数+Esc 关），
 筛选逻辑本就走共享 useColFilters，此处只统一「壳」。五处差异以可选 props 表达（按实际最小公共集）：
 — search/kw：值内搜索输入（Browser 无）；bars：值分布 mini-bar（仅 QRT/RT）；
 — showHasMore：基数降级提示（仅 QRT/RT 渲染）；range 系列：区间双输入（QRT/RT 类型感知、
 Security httpStatus）；labelOf：MarkText 高亮展示（Browser/Plugins/Security 裸文本）；
 — fit：视口碰撞自适应+开层聚焦首输入（QRT/RT 语义平移；其余三处保持原静态落点）。
 z 层级硬约束：弹层必须仍被页面滚动遮罩语义管理（原 1200/1201 上下文层）——.float-pop 自带
 --z-island，局部覆写压回 ctx 档（mask=var(--z-ctx)、面板=calc(var(--z-ctx) + 1)），不升浮岛档。 */
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import MarkText from './MarkText.vue';
import { fitPopupPos } from '../utils/popFit';
import type { ColFilterVal } from '../composables/useColFilters';

const props = withDefaults(defineProps<{
  /* 列名（头文案/aria/区间输入 aria-label 前缀） */
  col: string;
  /* 弹层锚点（漏斗点击/菜单直达坐标） */
  x: number;
  y: number;
  /* 值分布（useColFilters.filterVals 的 vals/total/hasMore 透传） */
  vals: ColFilterVal[];
  total: number;
  hasMore?: boolean;
  /* 该列当前选中 norm 值集合（colFilters[col] ?? []） */
  selected: string[];
  /* 值归一函数（消费方 useColFilters.normVal 透传，勾选态判定同键） */
  normOf: (v: any) => string;
  /* 值展示文案（传则 MarkText+kw 高亮；QRT fullText / RT labelOf 口径） */
  labelOf?: (v: any) => string;
  /* 值内搜索输入 */
  search?: boolean;
  kw?: string;
  /* 值分布 mini-bar */
  bars?: boolean;
  /* 基数降级提示（「仅显示前 N 个高频值…」） */
  showHasMore?: boolean;
  /* 区间双输入行 */
  range?: boolean;
  rangeMin?: string;
  rangeMax?: string;
  rangeMinPh?: string;
  rangeMaxPh?: string;
  /* 列内文本包含行（可选——不传=弹层零变化，五通道既有消费方零增量）；
 contains=true 渲染包含词输入（emit set-contains 交消费方 useColFilters.setContainsFilter） */
  contains?: boolean;
  containsVal?: string;
  /* 视口碰撞自适应 + 打开即聚焦首输入（QRT/RT；其余通道保持静态落点零增量） */
  fit?: boolean;
  /* 内建组合档 chip（可选——缺省 undefined 零渲染；传 'AND'/'OR' 显示
 「组合：X」钮，点击 emit toggle-filter-mode 交消费方 useFilterMode.toggleFilterMode） */
  filterMode?: 'AND' | 'OR';
}>(), {
  hasMore: false,
  labelOf: undefined,
  search: false,
  kw: '',
  bars: false,
  showHasMore: false,
  range: false,
  rangeMin: '',
  rangeMax: '',
  rangeMinPh: '最小值（含）',
  rangeMaxPh: '最大值（含）',
  contains: false,
  containsVal: '',
  fit: false,
  /* 内建 chip 缺省 undefined（零渲染——withDefaults 不覆盖可选联合型） */
  filterMode: undefined,
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'clear'): void;
  (e: 'toggle', v: any): void;
  (e: 'update:kw', v: string): void;
  (e: 'set-range', side: 'min' | 'max', v: string): void;
  /* 包含词输入（消费方接线 useColFilters.setContainsFilter） */
  (e: 'set-contains', v: string): void;
  /* 内建组合档 chip 点击（消费方接线 useFilterMode.toggleFilterMode） */
  (e: 'toggle-filter-mode'): void;
}>();

/* 裸文本展示口径（Browser/Plugins/Security 原壳内联三元同语义） */
function fmtVal(v: any): string {
  return v === null || v === undefined ? '∅' : String(v);
}

/* mini-bar 归一与降级口径提示（QRT/RT 原壳同串） */
const maxN = computed(() => Math.max(0, ...props.vals.map(e => e.n)));
function barPct(n: number): string {
  return maxN.value > 0 ? Math.round((n / maxN.value) * 100) + '%' : '0%';
}
const barScopeTip = computed(() =>
  `条宽按所显示值中最大计数（${maxN.value} 行）归一${props.hasMore ? `；已按高频截取前 ${props.vals.length} 个值，条宽不代表全量分布` : ''}`);

/* 定位：先落点防闪帧；fit 通道 nextTick 实测碰撞翻转钳位（happy-dom 尺寸 0 数学上不翻）
 并聚焦首输入（键盘用户可直接筛选；QRT/RT v3.0.0 语义平移） */
const panelEl = ref<HTMLElement>();
const pos = ref({ x: props.x, y: props.y });
watch(() => [props.x, props.y], async ([nx, ny]) => {
  pos.value = { x: nx, y: ny };
  if (!props.fit) return;
  await nextTick();
  const el = panelEl.value;
  if (!el) return;
  pos.value = fitPopupPos(nx, ny, el.offsetWidth, el.offsetHeight, innerWidth, innerHeight);
  (el.querySelector('input') as HTMLInputElement | null)?.focus();
}, { immediate: true });

/* Esc 收口升 document 捕获级（566 Pagination 约定推广；宪法铁律 D1#5；
 567 真机实锚）——原 mask/panel 元素级 esc 双挂依赖弹层内持焦点（tabindex=-1 族），
 漏斗钮聚焦时 Esc 关不掉；且 .cfp-kw/.cfp-range-in 的 `@keydown.stop` 掐断冒泡，
 焦点在输入框内同样关不掉。挂载（=开层，消费方条件渲染）即存触发时焦点（漏斗钮），
 document 捕获级收 Esc：stopPropagation+close+焦点回触发钮（触发时焦点存档-还档，
 五通道消费方零改动）；卸载兜底摘监听（CellContextMenu 417 同款挂/摘配对）。
 源码锁 colFilterPopoverEsc568⑤：元素级 esc 修饰符不得回流本文件（双源即回归）。 */
const escPrevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
function onDocEsc(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  emit('close');
  nextTick(() => escPrevFocus?.focus());
}
document.addEventListener('keydown', onDocEsc, true);
onBeforeUnmount(() => document.removeEventListener('keydown', onDocEsc, true));
</script>

<style scoped>
/* mask 透明点击捕获层：z=--z-ctx（1200 上下文层语义，页面滚动遮罩档管理） */
.cfp-mask { position: fixed; inset: 0; z-index: var(--z-ctx); }
/* 面板基座 .float-pop（fixed+bg1+line-strong+shadow-pop+r-m，theme.css:552）；
 硬约束：局部覆写把 float-pop 的 --z-island 压回 ctx 档 +1（原 1201 面板语义），
 弹层不升浮岛档——仍归页面滚动遮罩语义管理 */
.cfp {
  z-index: calc(var(--z-ctx) + 1);
  min-width: 180px; max-width: 320px; max-height: 320px; overflow: auto; padding: var(--sp-1);
}
.cfp-hd { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); font-size: var(--fs-2xs); font-weight: 650; color: var(--tx2); letter-spacing: .06em; padding: var(--sp-1) var(--sp-2h) var(--sp-1h); border-bottom: 1px solid var(--line); margin-bottom: 3px; }
.cfp-clear { border: 0; background: transparent; color: var(--ac-hi); font-size: var(--fs-xs); cursor: pointer; padding: 0; font-family: inherit; }
/* 内建组合档 chip（值档与双内核 -fmode 系同款，TableFilteredHint 同串单源语汇） */
.cfp-fmode { border: 1px solid var(--line); background: transparent; color: var(--info); cursor: pointer; font-size: var(--fs-2xs); border-radius: 3px; padding: 0 var(--sp-1); line-height: 1.4; font-family: inherit; flex-shrink: 0; }
.cfp-fmode:hover { border-color: var(--info); }
.cfp-kw { width: 100%; box-sizing: border-box; font-size: var(--fs-xs); padding: 3px var(--sp-2); margin-bottom: var(--sp-1); background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r-xs); color: var(--tx0); outline: none; font-family: inherit; }
.cfp-kw:focus { border-color: var(--ac); }
.cfp-range { display: flex; align-items: center; gap: var(--sp-1); padding: var(--sp-0) var(--sp-2) var(--sp-1h); }
.cfp-range-in { flex: 1; min-width: 0; box-sizing: border-box; font-size: var(--fs-xs); padding: 3px var(--sp-1h); background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r-xs); color: var(--tx0); outline: none; font-family: inherit; }
.cfp-range-in:focus { border-color: var(--ac); }
.cfp-range-sep { color: var(--tx2); flex-shrink: 0; }
.cfp-row { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-1) var(--sp-2h); border-radius: var(--r-s); font-size: var(--fs-sm); cursor: pointer; }
.cfp-row:hover { background: var(--ac-soft); }
.cfp-val { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
.cfp-barw { position: relative; flex: 0 0 56px; height: 10px; border-radius: 2px; overflow: hidden; background: var(--bg2); }
.cfp-bar { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; background: var(--ac); opacity: .35; }
.cfp-n { margin-left: auto; color: var(--tx2); font-size: var(--fs-2xs); flex-shrink: 0; }
.cfp-empty { padding: var(--sp-2) var(--sp-2h); font-size: var(--fs-sm); color: var(--tx2); }
.cfp-acts { display: flex; justify-content: flex-end; padding: var(--sp-1) var(--sp-2) var(--sp-0); border-top: 1px solid var(--line); margin-top: 3px; }
</style>
