<template>
  <!-- ←/→ 键盘翻页（焦点位于分页器任一控件时生效，跳页输入框内不抢 Enter 语义） -->
  <div class="pgn mono" @keydown.left="onArrow($event, page - 1)" @keydown.right="onArrow($event, page + 1)">
    <!-- 单页时整组翻页控件恒失效（上一页/下一页双双 disabled、页码恒为 1）却仍占 ≈102px，
 是工具行「元素太多挤占」里最纯粹的无效占位。只有一页就没有「翻」这件事——
 整组不渲染；每页条数保留（1 页也能改成 100/页看更多行）。 -->
    <template v-if="totalPages > 1">
      <button aria-label="上一页" class="btn sm ghost" :disabled="page <= 1 || disabled" title="上一页" @click="emit('update:page', page - 1); scrollToHead()"><ChevronLeft :size="12" /></button>
      <!-- P2-6：页码输入跳页（dbx 页码 Enter 跳页对位）——输入越界钳位首末页 -->
      <input
        class="pgn-jump" type="text" :value="page" :disabled="disabled"
        :aria-label="'跳转到页（1-' + totalPages + '）'"
        :title="'跳转到页（1-' + totalPages + '），Enter 确认'"
        @keydown.enter.prevent="jump($event)"
        @blur="jump($event)"
      />
      <span class="pgn-pos">/ {{ totalPages }}</span>
      <button aria-label="下一页" class="btn sm ghost" :disabled="page >= totalPages || disabled" title="下一页" @click="emit('update:page', page + 1); scrollToHead()"><ChevronRight :size="12" /></button>
    </template>
    <!-- ·实报：原生 <select> 系统蓝菜单与全站设计语言割裂——换 n-popover
 自定义 listbox（受控 show/选中标记/aria listbox 语义），既有胶囊语言同款。
 二刀·实报「平铺开了」：raw 模式+自绘浮层壳（白底/边框/阴影/圆角/内边距）——
 非 raw 的 popover 内容容器透明，选项直接叠在表格行上无浮层感 -->
    <n-popover v-if="pageSize != null" trigger="click" placement="top-start" :show-arrow="false" raw
      :show="sizeOpen" @update:show="(v: boolean) => (sizeOpen = v)">
      <template #trigger>
        <button ref="pselEl" class="pgn-psel" :disabled="disabled" aria-haspopup="listbox" :aria-expanded="sizeOpen"
          aria-label="每页条数" :title="'每页条数（当前 ' + pageSize + '/页）'" @click="sizeOpen = !sizeOpen">
          {{ pageSize }}/页 <ChevronDown :size="11" />
        </button>
      </template>
      <div class="pgn-psize-pop" role="listbox" aria-label="每页条数">
        <button v-for="s in sizes" :key="s" role="option" :aria-selected="s === pageSize"
          class="pgn-psize-opt" :class="{ on: s === pageSize }" @click="pickSize(s)">
          <span class="pgn-radio" :class="{ on: s === pageSize }"></span>
          <span>{{ s }}/页</span><Check v-if="s === pageSize" :size="12" />
        </button>
      </div>
    </n-popover>
  </div>
</template>

<script setup lang="ts">
import { getCurrentInstance, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { NPopover } from 'naive-ui';
import { ChevronLeft, ChevronRight, ChevronDown, Check } from 'lucide-vue-next';

/* 全站统一分页组件——上一页/页码/下一页 + 可选每页条数（不传 pageSize 则隐藏）。
 翻页后自动把表格滚回表头（scrollTarget 就近查找最近滚动容器的
 table thead）——长列表翻页后视线丢失是实打实的痛点；零 props 侵入，挂了就生效。 */
const props = withDefaults(defineProps<{
  page: number;
  totalPages: number;
  pageSize?: number;
  sizes?: number[];
  disabled?: boolean;
  scrollTarget?: string;
}>(), { sizes: () => [10, 20, 50, 100], disabled: false, scrollTarget: '' });

const emit = defineEmits<{ (e: 'update:page', p: number): void; (e: 'update:pageSize', s: number): void }>();

/* 文本/选择控件内不拦截 ←/→（跳页输入框光标移动是原生语义，
 此前 prevent 会吞掉光标——交互正确性回归） */
function onArrow(e: KeyboardEvent, target: number) {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT') return;
  e.preventDefault();
  go(target);
}

/* ←/→ 翻页核心——钳位+禁用守卫+翻页回顶，与按钮点击同一条路 */
function go(p: number) {
  if (props.disabled) return;
  const clamped = Math.min(Math.max(1, p), Math.max(1, props.totalPages));
  if (clamped === props.page) return;
  emit('update:page', clamped);
  scrollToHead();
}

/* 原生 select 退役后受控开关+选择即关（选择同时回顶，与翻页同一路） */
const sizeOpen = ref(false);
function pickSize(s: number) {
  sizeOpen.value = false;
  if (s === props.pageSize || props.disabled) return;
  emit('update:pageSize', s);
  scrollToHead();
}

/* 弹层 Esc 收口（宪法铁律 D1#5「开弹层→Esc→焦点回触发器」）——
 563 四刀换 n-popover 后 Esc 语义悬空（show 受控，naive 不自带关层）；
 开层挂 document 捕获级监听，Esc 关层并还焦点给触发钮；卸载兜底摘监听。 */
const pselEl = ref<HTMLButtonElement | null>(null);
function onSizeEsc(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  sizeOpen.value = false;
  nextTick(() => pselEl.value?.focus());
}
watch(sizeOpen, (v) => {
  if (v) document.addEventListener('keydown', onSizeEsc, true);
  else document.removeEventListener('keydown', onSizeEsc, true);
});
onBeforeUnmount(() => document.removeEventListener('keydown', onSizeEsc, true));

/* P2-6：页码跳页——越界/非法输入钳位回合法页码（输入框值一并归位） */
function jump(e: Event) {
  const inp = e.target as HTMLInputElement;
  const parsed = Math.floor(Number(inp.value));
  const clamped = Math.min(Math.max(1, Number.isFinite(parsed) ? parsed : 1), Math.max(1, props.totalPages));
  inp.value = String(clamped);
  if (clamped !== props.page) {
    emit('update:page', clamped);
    scrollToHead();
    /* 1107：父级可能拒绝翻页（如 from+size 超 10000 窗口守卫）——输入框必须回显
       真实页，不能让用户看到「501 / 1000」却仍在第 1 页。接受时 props.page 已更新，
       这里回写新值无视觉跳变。 */
    nextTick(() => { inp.value = String(props.page); });
  }
}

function scrollToHead() {
  const root = (getCurrentInstance()?.proxy as any)?.$el as HTMLElement | undefined;
  const scope = root?.closest('.rt-wrap, .qrt-wrap, .scroll-y, .page') as HTMLElement | null;
  const el = (scope ?? document).querySelector('.tbl thead, thead');
  el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
</script>

<style scoped>
.pgn { display: flex; align-items: center; gap: var(--sp-1h); font-size: var(--fs-sm); }
/* white-space 锁——工具行挤压时「/ 500」span 内部折行（"/"一行"500"一行）
 =分页器两行高撑高整条工具行（实报图3）；nowrap 抬 min-content 使 .pgn 有效不可压折，
 挤压改道左簇计数条 ellipsis 缓冲（554 收缩序） */
.pgn-pos { color: var(--tx2); min-width: 30px; text-align: left; white-space: nowrap; }
/* 每页条数触发钮（与页码跳页输入框同视觉密度）+自定义 listbox 选项。
 补：white-space 锁(实报「20/页」逐字断行) */
.pgn-psel {
  display: inline-flex; align-items: center; gap: var(--sp-1); height: 24px; padding: 0 var(--sp-1h);
  font-size: var(--fs-sm); background: var(--bg1); border: 1px solid var(--line);
  border-radius: var(--r-s); color: var(--tx0); cursor: pointer; outline: none; font-family: inherit;
  white-space: nowrap;
}
.pgn-psel:focus-visible { border-color: var(--ac); }
/* 二刀：raw 模式浮层壳自绘——白底(bg1)+边框+阴影+圆角+内边距，
 跟随主题 token；无壳则选项透明平铺叠在表格上（实报截图形态）。
 五刀·用户再澄清（「我要的是单选按钮,弹窗下拉选择」）：弹窗内每项前置 radio 单选
 圆钮（选中实心青点），竖排紧凑列表；横排胶囊形态退役 */
.pgn-psize-pop {
  display: flex; flex-direction: column; gap: var(--sp-0); min-width: 118px; /* ：2px=--sp-0 精确等值合并（568 豁免裁决系漏核 --sp-0 档，纠正） */
  background: var(--bg1); border: 1px solid var(--line-strong); border-radius: var(--r-m);
  box-shadow: 0 6px 20px rgba(0, 0, 0, .12); padding: var(--sp-1); overflow: hidden;
}
.pgn-psize-opt {
  display: flex; align-items: center; gap: var(--sp-2); height: 26px; padding: 0 var(--sp-2);
  border: 0; border-radius: var(--r-s); background: transparent;
  color: var(--tx1); font-size: var(--fs-sm); font-family: inherit; cursor: pointer; text-align: left;
}
.pgn-psize-opt:hover { background: var(--bg2); }
.pgn-psize-opt.on { color: var(--ac); background: var(--ac-soft); font-weight: 600; }
.pgn-radio { width: 13px; height: 13px; border-radius: 50%; border: 1.5px solid var(--tx2); position: relative; flex: none; }
.pgn-psize-opt.on .pgn-radio { border-color: var(--ac); }
.pgn-psize-opt.on .pgn-radio::after { content: ""; position: absolute; inset: 2.5px; border-radius: 50%; background: var(--ac); }
/* P2-6：页码跳页输入框（与既有计数同视觉密度） */
.pgn-jump {
  width: 3.5em; height: 24px; text-align: center; padding: 0 var(--sp-1);
  font-size: var(--fs-sm); background: var(--bg1); border: 1px solid var(--line);
  border-radius: var(--r-s); color: var(--tx0); outline: none; font-family: inherit;
}
.pgn-jump:focus { border-color: var(--ac); }
</style>
