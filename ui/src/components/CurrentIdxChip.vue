<template>
  <!-- follow 档视图页内只读「当前索引」chip——选索引入口收敛 TopBar 唯一处
 （别名组/recent/健康度都在顶栏），本件只读 store 自显 + 三个助攻动作。
 未选索引整件不渲染（根 v-if），页内空态兜底契约留给各视图。 -->
  <span v-if="store.pickedIdx" ref="rootEl" class="cic" :title="store.pickedIdx"
        @contextmenu.prevent="openMenu" @keydown="onChipKey">
    <span class="cic-dot" :class="'h-' + (store.pickedInfo?.health || 'grey')" aria-hidden="true"></span>
    <span class="cic-nm">{{ store.pickedIdx }}</span>
    <span v-if="meta" class="cic-meta">{{ meta }}</span>
    <button aria-label="去索引工作区" class="cic-btn" title="去索引工作区" @click="gotoIndices"><ExternalLink :size="11" /></button>
    <button aria-label="复制深链" class="cic-btn" title="复制深链（含 ?idx=，分享直达本页）" @click="copyLink"><Copy :size="11" /></button>
    <button aria-label="清除当前索引" class="cic-btn" title="清除当前索引（清除后跟随顶栏）" @click="store.pick('')"><X :size="11" /></button>
    <!-- 右键复用共享 CellContextMenu；只读/本地动作，不触发集群写 -->
    <CellContextMenu
      v-if="menu"
      :x="menu.x" :y="menu.y" :title="'当前索引 · ' + store.pickedIdx + (accessLabel ? ' · ' + accessLabel : '')"
      :items="menuItems" @close="menu = null"
    />
  </span>
</template>

<script setup lang="ts">
/* follow 档视图页内 IndexPicker 退役配套件——无 props 自读 store
 （pickedIdx/pickedInfo/pick）。健康色点沿用 IndexOptionRow .ior-dot 色映射
 （green→ok/yellow→warn/red→err/未知灰）；docs·size 小字与 TopBar idx-meta 同口径。 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Copy, ExternalLink, ShieldCheck, X } from 'lucide-vue-next';
import CellContextMenu, { type CcmItem } from './CellContextMenu.vue';
import { useAppStore } from '../stores/app';
import { copyText, fmtNum, fmtSize } from '../utils/format';
import { useQueryAccess } from '../composables/useQueryAccess';

const store = useAppStore();
const { accessLabel, summary: accessSummary } = useQueryAccess();
const router = useRouter();
const rootEl = ref<HTMLElement>();
const menu = ref<{ x: number; y: number } | null>(null);

/* 1024：所在行冻结推广——挂载时给 cic 所在页头行注入全局 .cic-row-sticky
 （theme.css 定义 sticky/实底/负边距拉满宽，26 个消费视图一次覆盖、新视图自动获得）。
 行定位：直接父；父是 lr-bar-l（左右布局左段）再上一层取整行。
 父已 sticky/fixed（查询工作台 .qh-top 等）不叠加；元素未挂滚动流无效也不伤。 */
/* watch 驱动（非 onMounted）：未选索引时组件挂载而 chip 未渲染（根 v-if），先选后
 索引的场景注入须等 chip 真正入 DOM；已注入过的行不重复（视图切索引重渲染幂等） */
const injectedRows = new WeakSet<HTMLElement>();
watch(rootEl, el => {
  if (!el?.parentElement) return;
  let row: HTMLElement = el.parentElement;
  if (row.classList.contains('lr-bar-l')) row = row.parentElement ?? row;
  if (!row || row === document.body || injectedRows.has(row)) return;
  const pos = getComputedStyle(row).position;
  if (pos === 'sticky' || pos === 'fixed') return;
  row.classList.add('cic-row-sticky');
  injectedRows.add(row);
}, { flush: 'post' });

const meta = computed(() => {
  const i = store.pickedInfo;
  if (!i) return '';
  return [i['docs.count'] ? fmtNum(i['docs.count']) + ' docs' : '', i['store.size'] ? fmtSize(i['store.size']) : ''].filter(Boolean).join(' · ');
});

function gotoIndices() {
  void router.push('/indices');
}

/* hash 路由（createWebHashHistory），?idx= 走 hash query（useUrlState 同通道）——
 构造 origin+path+#/当前页?idx=，不依赖 route 对象（测试端轻 mock router 兼容） */
async function copyLink() {
  const base = (window.location.hash || '#/').split('?')[0];
  const url = window.location.origin + window.location.pathname + base + '?idx=' + encodeURIComponent(store.pickedIdx);
  const ok = await copyText(url);
  store.notify(ok ? 'success' : 'error', ok ? '深链已复制' : '复制失败：浏览器拦截了剪贴板');
}

/* 支持工单用：索引 + 目标/env/角色/查询读写摘要，只读本地面，不触发服务端写 */
async function copyAccess() {
  const ok = await copyText(accessSummary.value + ' index=' + store.pickedIdx);
  store.notify(ok ? 'success' : 'error', ok ? '权限摘要已复制' : '复制失败：浏览器拦截了剪贴板');
}

function openMenu(e: MouseEvent) {
  menu.value = { x: e.clientX, y: e.clientY };
}
/* 键盘入口：chip 内任一按钮聚焦时 ContextMenu/Shift+F10 对整件开菜单
 （chip 根不作 tab 停靠点，避免多一个空焦点站） */
function onChipKey(e: KeyboardEvent) {
  if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return;
  e.preventDefault();
  const r = rootEl.value?.getBoundingClientRect();
  menu.value = { x: (r?.left ?? 0) + 12, y: r?.bottom ?? 0 };
}
const menuItems = computed<CcmItem[]>(() => [
  { key: 'copy-name', label: '复制索引名', icon: Copy, run: async () => {
    const ok = await copyText(store.pickedIdx);
    store.notify(ok ? 'success' : 'error', ok ? '已复制索引名' : '复制失败：浏览器拦截了剪贴板');
  } },
  { key: 'copy-link', label: '复制深链', icon: Copy, run: () => { void copyLink(); } },
  { key: 'copy-access', label: '复制查询权限摘要', icon: ShieldCheck, run: () => { void copyAccess(); } },
  { key: 'goto-indices', label: '去索引工作区', icon: ExternalLink, run: gotoIndices },
  { key: 'clear', label: '清除当前索引', icon: X, danger: true, sep: true, run: () => store.pick('') },
]);
</script>

<style scoped>
.cic {
  display: inline-flex; align-items: center; gap: var(--sp-1h); max-width: 360px;
  padding: 3px var(--sp-1) 3px 9px; border: 1px solid var(--line); border-radius: 99px;
  background: var(--bg2); font-family: var(--mono, ui-monospace, monospace); font-size: var(--fs-xs);
  vertical-align: middle;
}
/* 健康色点：IndexOptionRow .ior-dot 同源色映射（token 单一出处） */
.cic-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--tx2); }
.cic-dot.h-green { background: var(--ok); }
.cic-dot.h-yellow { background: var(--warn); }
.cic-dot.h-red { background: var(--err); }
.cic-nm { color: var(--tx0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cic-meta { flex: none; color: var(--tx2); white-space: nowrap; }
.cic-btn {
  flex: none; display: inline-flex; align-items: center; border: none; background: none;
  color: var(--tx2); cursor: pointer; padding: var(--sp-0); border-radius: var(--r-xs);
}
.cic-btn:hover { color: var(--tx0); background: var(--hover); }
.cic-btn:focus-visible { outline: 1px solid var(--acc); }
</style>
