<template>
  <!-- 单元格右键菜单共享组件（RT/QRT/列表行复用；dbx 紧凑风格）——
 items 由调用方构造（label+icon+danger+sep+run 闭包；1142 起 item.children 出二级菜单）；
 组件只管定位/遮罩/关闭；视口碰撞自适应——底部/右侧溢出自动翻转，超长限高内滚，
 列表首行/末行/右缘右键不再「看不到菜单」（实报：首行右键要滚动才能看全）。
 一级项过多=平铺噪音（表格右键与首行同样过挤）——带 children 的项
 渲染成父行（右箭头），悬停即开二级；二级同样做视口翻转。键盘：→/Enter 开二级，
 ←/Esc 先关二级再关整菜单（ARIA menu 惯例）。 -->
  <teleport to="body">
    <!-- .self：菜单键打开后浏览器会向聚焦项补发原生 contextmenu，冒泡到遮罩会立刻自关 -->
    <div class="ccm-mask" role="presentation" @click="emit('close')" @contextmenu.prevent.self="emit('close')" @keydown.esc="emit('close')" tabindex="-1">
      <div ref="menuEl" class="ccm" role="menu" :aria-label="title || '操作菜单'" :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
        @click.stop @contextmenu.prevent @keydown.esc.stop="onEsc" @keydown="onMenuKey" tabindex="-1">
        <div v-if="title" class="ccm-hd mono">{{ title }}</div>
        <template v-for="it in items" :key="it.key">
          <div v-if="it.sep" class="ccm-sep" role="separator" />
          <button v-if="it.children && it.children.length" class="ccm-it ccm-parent" :class="{ danger: it.danger, on: sub?.key === it.key }"
            role="menuitem" aria-haspopup="menu" :aria-expanded="sub?.key === it.key" :data-key="it.key"
            @click="toggleSub(it, $event)" @mouseenter="openSub(it, $event)" @keydown="onParentKey($event, it)">
            <component :is="it.icon" :size="12" v-if="it.icon" />
            <span class="ccm-lb">{{ it.label }}</span>
            <ChevronRight :size="12" class="ccm-arrow" />
          </button>
          <button v-else class="ccm-it" :class="{ danger: it.danger }" :data-key="it.key" role="menuitem"
            @click="runItem(it)" @mouseenter="closeSub">
            <component :is="it.icon" :size="12" v-if="it.icon" />
            {{ it.label }}
          </button>
        </template>
      <!-- 二级菜单：贴父行右缘；右溢出向左翻（二级不再嵌套，保持两跳可预期）。
 1142b：常驻 DOM + CSS 隐藏（不回 v-if 卸载）——① 悬停零重挂载，指针斜移不丢层；
 ② 键盘/读屏与程序化取项在同一时刻即可见（面板语义仍由 aria-expanded 表达）。 -->
      <div v-for="grp in groupsWithChildren" :key="'sub-' + grp.key" v-show="sub?.key === grp.key"
        :ref="el => { if (sub?.key === grp.key) subEl = el as HTMLElement }" class="ccm ccm-sub" role="menu"
        :aria-label="grp.label" :aria-hidden="sub?.key !== grp.key"
        :style="{ left: subPos.x + 'px', top: subPos.y + 'px' }"
        @click.stop @contextmenu.prevent @keydown="onSubKey">
        <div class="ccm-hd mono">{{ grp.label }}</div>
        <template v-for="c in grp.children" :key="c.key">
          <div v-if="c.sep" class="ccm-sep" role="separator" />
          <button class="ccm-it" :class="{ danger: c.danger }" :data-key="c.key" role="menuitem" @click="runItem(c)">
            <component :is="c.icon" :size="12" v-if="c.icon" />
            {{ c.label }}
          </button>
        </template>
      </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { ChevronRight } from 'lucide-vue-next';
import { fitPopupPos } from '../utils/popFit';

export interface CcmItem {
  key: string;
  label: string;
  icon?: any;
  danger?: boolean;
  sep?: boolean;
  run?: () => void;
  /* 1142：带 children = 一级出父行，二级出动作项（只支持一层——两跳可预期） */
  children?: CcmItem[];
}

const props = defineProps<{
  x: number;
  y: number;
  title?: string;
  items: CcmItem[];
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

/* 动作执行后自动关闭——此前点完菜单还开着，需再点空白才能收起 */
function runItem(it: CcmItem) {
  closedByAction = true;
  it.run?.();
  emit('close');
}

/* ═══ ：视口碰撞自适应 ═══
 旧行为：菜单固定落在光标点 (x,y)，右/下溢出直接被视口裁掉。
 新行为：先落点再 nextTick 实测尺寸——右缘溢出向左翻、底缘溢出向上翻，
 最终四向钳位（8px 边距，数学收口 utils/popFit 纯函数）；尺寸为 0 的环境
 （happy-dom）数学上不翻，行为与旧版一致。 */
const menuEl = ref<HTMLElement>();
const subEl = ref<HTMLElement>();
const pos = ref({ x: props.x, y: props.y });
async function adjust() {
  pos.value = { x: props.x, y: props.y }; /* 先跟点，防复用旧位置闪帧 */
  await nextTick();
  const el = menuEl.value;
  if (!el) return;
  pos.value = fitPopupPos(props.x, props.y, el.offsetWidth, el.offsetHeight, innerWidth, innerHeight);
}
watch(() => [props.x, props.y], () => { sub.value = null; void adjust(); });

/* 首帧落位 + 复用时跟点（immediate 版已退役：immediate 回调早于下方 sub 声明） */
onMounted(() => { void adjust(); });
/* 打开即把焦点交给首个菜单项：右键/菜单键入口之后键盘可直接 Enter/↑↓/Esc，
 不再停留在触发器上；关闭时若触发器仍在 DOM 则归还焦点。 */
let restoreFocus: HTMLElement | null = null;
/* 动作可能已经关闭/卸载触发器（候选选择、导航、删除行）——此时归还焦点会触发
   focus 处理器把弹层重新打开（候选选择器实机路径）；动作自行管理焦点，只有
   Esc/点外部关闭才归还。 */
let closedByAction = false;
onMounted(() => {
  restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  void nextTick(() => menuEl.value?.querySelector<HTMLElement>(':scope > .ccm-it')?.focus());
});
onBeforeUnmount(() => {
  if (!closedByAction && restoreFocus?.isConnected) restoreFocus.focus();
});

/* 顶档层序（--z-ctx-top=10001）：必须压过 Picker 浮岛（--z-island=9000）、
   naive 弹层（2000+）与全屏（10000）；字段候选里右键的菜单曾被浮岛盖住，
   旧动态注册只能追到 naive 计数器，无法越过浮岛档。 */
/* ═══ 1142：二级菜单 ═══ */
const sub = ref<{ key: string; label: string; items: CcmItem[]; anchorTop: number; anchorRight: number } | null>(null);
const subPos = ref({ x: 0, y: 0 });
/* 有子项的父行清单：二级面板按父项常驻 DOM（v-show 切换），避免重挂载丢悬停链 */
const groupsWithChildren = computed(() => props.items.filter(i => i.children?.length));
function closeSub() { sub.value = null; }
function openSub(it: CcmItem, e?: Event) {
  if (!it.children?.length) return;
  setSub(it, e);
}
/* 点击/悬停统一入口（点击父行同开，键盘 → 也走此口） */
function setSub(it: CcmItem, e?: Event) {
  const rowEl = (e?.currentTarget as HTMLElement | null) ?? menuEl.value?.querySelector(`.ccm-it[data-key="${it.key}"]`) as HTMLElement | null;
  const r = rowEl?.getBoundingClientRect();
  sub.value = {
    key: it.key,
    label: it.label,
    items: it.children ?? [],
    anchorTop: r ? r.top : (menuEl.value?.getBoundingClientRect().top ?? pos.value.y),
    anchorRight: r ? r.right : (pos.value.x + (menuEl.value?.offsetWidth ?? 0)),
  };
  void nextTick(() => {
    const w = subEl.value?.offsetWidth || 168;
    const h = subEl.value?.offsetHeight || 0;
    let x = sub.value!.anchorRight + 2;
    if (x + w > innerWidth - 8) x = Math.max(8, (rowEl?.getBoundingClientRect().left ?? pos.value.x) - w - 2);
    let y = sub.value!.anchorTop - 4;
    if (h && y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
    subPos.value = { x, y };
  });
}
/* 点击父行 = 确保二级是「开着」的（不 toggle）。
 真机反例（1318）：鼠标移到「更多…」时 mouseenter 已把二级打开，紧接着按下鼠标，
 旧版 toggle 看到 sub.key 相同就关掉 —— 用户眼里是「我点了它，它反而收起来了」。
 而鼠标用户的自然动线必然是「先悬停到位，再点击」，所以 toggle 语义在这条路径上是纯 bug。
 收起二级的手势已有三条：Esc / ←（键盘）、移到别的项（mouseenter 调 closeSub）、
 关掉整个菜单。点击不再破坏已打开的子菜单。 */
function toggleSub(it: CcmItem, e: Event) {
  if (sub.value?.key !== it.key) setSub(it, e);
}
function onMenuKey(e: KeyboardEvent) {
  /* ↑/↓ 循环，Home/End 跳首末（ARIA menu 惯例）；
     → 开当前父项二级；← 关二级；Esc 先关二级（整菜单的 Esc 见 onEsc） */
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
    /* :scope 只取一级项——二级常驻 DOM 且隐藏，不能混进一级 ↑/↓/Home/End 序列 */
    const btns = Array.from(menuEl.value?.querySelectorAll<HTMLElement>(':scope > .ccm-it') ?? []);
    if (!btns.length) return;
    e.preventDefault();
    const cur = btns.indexOf(document.activeElement as HTMLElement);
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1
      : (cur < 0 ? 0 : (cur + delta + btns.length) % btns.length);
    btns[next].focus();
    return;
  }
  if (e.key === 'ArrowRight') {
    const cur = (e.target as HTMLElement | null)?.closest?.(`.ccm-it[data-key]`) as HTMLElement | null;
    const key = cur?.getAttribute('data-key');
    const it = props.items.find(i => i.key === key);
    if (it?.children?.length) { e.preventDefault(); openSubAndFocus(it); }
  } else if (e.key === 'ArrowLeft' && sub.value) {
    e.preventDefault();
    closeSubAndFocusParent();
  }
}
/* 二级键盘闭环：→/Enter 进首项，↑↓ 循环，←/Esc 回父项 */
function openSubAndFocus(it: CcmItem, e?: Event) {
  setSub(it, e);
  void nextTick(() => subEl.value?.querySelector<HTMLElement>('.ccm-it')?.focus());
}
function onParentKey(e: KeyboardEvent, it: CcmItem) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    openSubAndFocus(it);
  }
}
function closeSubAndFocusParent() {
  const key = sub.value?.key;
  closeSub();
  if (key) void nextTick(() => menuEl.value?.querySelector<HTMLElement>(`:scope > .ccm-it[data-key="${key}"]`)?.focus());
}
function onSubKey(e: KeyboardEvent) {
  const btns = Array.from(subEl.value?.querySelectorAll<HTMLElement>('.ccm-it') ?? []);
  if (!btns.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    e.stopPropagation(); /* 二级在 panel 内，别让一级 onMenuKey 再抢焦点 */
    const cur = btns.indexOf(document.activeElement as HTMLElement);
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1
      : (cur < 0 ? 0 : (cur + delta + btns.length) % btns.length);
    btns[next].focus();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    e.stopPropagation();
    closeSubAndFocusParent();
  }
}
function onEsc() {
  if (sub.value) { closeSubAndFocusParent(); return; }
  emit('close');
}

/* Esc 关闭（ARIA 菜单惯例）——此前只能点遮罩/执行动作收起；
 capture 阶段先于 Monaco 等内部消费者，stopPropagation 防泄漏；
 菜单为条件渲染（打开挂载/关闭卸载），监听随卸载自动移除 */
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.stopPropagation(); onEsc(); }
}
document.addEventListener('keydown', onKey, true);
onBeforeUnmount(() => document.removeEventListener('keydown', onKey, true));
</script>

<style scoped>
/* 全局右键菜单统一样式（dbx 紧凑风格；RT/QRT 复用）
 z 字面量收口全局 token——mask=--z-ctx-top、面板=+1，压过 Picker 浮岛/全屏 */
.ccm-mask { position: fixed; inset: 0; z-index: var(--z-ctx-top); }
.ccm { position: fixed; min-width: 168px; padding: var(--sp-1); background: var(--bg1); border: 1px solid var(--line-strong); border-radius: 10px; box-shadow: var(--shadow-pop); z-index: calc(var(--z-ctx-top) + 1);
  /* 超长按视口限高内滚——再长的菜单也全程可用 */
  max-height: calc(100vh - 16px); overflow-y: auto; }
/* 二级贴一级右侧，层级 +1（仍低于筛选弹层）；不限高由 fitPopupPos 兜 */
.ccm-sub { z-index: calc(var(--z-ctx-top) + 2); min-width: 190px; max-height: calc(100vh - 16px); overflow-y: auto; }
/* 二级面板嵌在主面板 DOM 内（取项/读屏可达），fixed 定位脱离滚动容器 */
.ccm > .ccm-sub { position: fixed; }
.ccm-hd { font-size: var(--fs-2xs); font-weight: 650; color: var(--tx2); letter-spacing: .06em; padding: var(--sp-1) var(--sp-2h) var(--sp-1h); border-bottom: 1px solid var(--line); margin-bottom: 3px; }
.ccm-it { display: flex; align-items: center; gap: var(--sp-2); width: 100%; padding: var(--sp-1h) var(--sp-2h); border: 0; background: transparent; border-radius: var(--r-s); cursor: pointer; font-size: var(--fs-sm); color: var(--tx1); text-align: left; }
.ccm-it:hover, .ccm-it.on { background: var(--ac-soft); color: var(--ac-hi); }
.ccm-it.danger { color: var(--err); }
.ccm-it.danger:hover { background: var(--err-soft); }
.ccm-lb { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ccm-arrow { margin-left: auto; opacity: .55; flex-shrink: 0; }
.ccm-parent:hover .ccm-arrow, .ccm-parent.on .ccm-arrow { opacity: 1; }
.ccm-sep { height: 1px; background: var(--line); margin: 3px var(--sp-1h); }
</style>
