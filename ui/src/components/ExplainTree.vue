<template>
  <div class="xt-node" :style="{ '--xt-depth': depth }">
    <div class="xt-row" :class="kindClass" role="button" tabindex="0" :aria-expanded="open" @click="open = !open" @keydown.enter.prevent="open = !open" @keydown.space.prevent="open = !open" @keydown="onRowKey($event)"
      @contextmenu.prevent.stop="openCtx($event)">
      <ChevronRight v-if="hasKids" :size="10" class="xt-caret" :class="{ open }" />
      <span v-else class="xt-caret-ph" />
      <span class="xt-val" :title="String(node.value)">{{ fmtVal(node.value) }}</span>
      <span class="xt-bar-wrap">
        <span class="xt-bar" :class="kindClass" :style="{ width: pct + '%' }" />
      </span>
      <span class="xt-pct">{{ pct.toFixed(1) }}%</span>
      <span v-if="kind" class="xt-kind" :class="kindClass">{{ kind }}</span>
      <span class="xt-desc" :title="node.description">{{ shortDesc }}</span>
    </div>
    <div v-if="open && hasKids" class="xt-kids">
      <ExplainTree v-for="(d, i) in node.details" :key="i" :node="d" :total="total" :depth="depth + 1" />
    </div>
    <div v-if="flash" class="xt-flash" :style="{ left: flash.x + 'px', top: flash.y + 'px' }">{{ flash.text }}</div>
    <CellContextMenu v-if="ctx" :x="ctx.x" :y="ctx.y" :title="ctx.title" :items="ctx.items" @close="ctx = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Braces, ChevronRight, ClipboardList, Copy, Hash, Info } from 'lucide-vue-next';
import { copyText } from '../utils/format';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import CellContextMenu, { type CcmItem } from './CellContextMenu.vue';

/**
 * BM25 explanation 递归树。
 * node 形如 { value, description, details: [...] }（ES explain 原始结构）。
 * total 为根节点分值，用于计算每个节点的贡献百分比。
 */
const props = defineProps<{ node: any; total: number; depth: number }>();

const open = ref(props.depth < 2); // 默认展开前两层

const hasKids = computed(() => Array.isArray(props.node?.details) && props.node.details.length > 0);

const pct = computed(() => {
  const t = props.total || 0;
  const v = Number(props.node?.value) || 0;
  if (t <= 0) return 0;
  return Math.min(100, Math.max(0, (v / t) * 100));
});

/** 因子归类：weight/tf/idf/boost/norm/combine —— 决定颜色 */
const kind = computed(() => {
  const d = String(props.node?.description || '').toLowerCase();
  if (d.startsWith('weight(')) return 'weight';
  if (d.startsWith('idf')) return 'idf';
  if (d.startsWith('tf') || d.includes('freq,')) return 'tf';
  if (d.includes('boost')) return 'boost';
  if (d.includes('norm') || d.includes('dl,') || d.includes('avgdl')) return 'norm';
  if (d.startsWith('sum of') || d.startsWith('max of') || d.startsWith('product of') || d.startsWith('min of')) return 'combine';
  if (d.includes('script')) return 'script';
  if (d.includes('constant')) return 'const';
  return '';
});

const kindClass = computed(() => (kind.value ? 'xk-' + kind.value : ''));

const shortDesc = computed(() => {
  const d = String(props.node?.description || '');
  return d.length > 160 ? d.slice(0, 157) + '…' : d;
});

function fmtVal(v: any) {
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  return n.toFixed(4).replace(/\.?0+$/, '') || '0';
}

/* ═══ 1316：打分树行右键 ═══
 打分树此前是纯展示：看到一个可疑因子（norm 拖后腿 / idf 过低）只能靠眼睛记，
 想贴到工单/群里得手工框选整段 description。心智：右键点哪一行，拿到的就是
 「这一行的因子、分值、贡献占比、整棵子树」。
 分值/占比用与行内**同一套**格式化函数（fmtVal/pct），复制到的数与看到的数必须一致——
 否则用户贴到工单里的是另一份数（[[feedback-visual-verification]] 同款教训）。

 两处细节：
 ① nested 树上每一层都是独立的 ExplainTree 实例（组件递归），因此 ctx/flash 各自持有一份——
    点父行右键不会弹出 N 个菜单：事件冒泡被 .stop 吃掉，只有被点的那层开菜单。
 ② 复制回执走就近 flash（位置钉在鼠标点），不依赖全局 store ——
    本组件在 SearchSandbox 里可能被塞在 pane 深处，宿主 toast 不一定在同一视野。 */
const ctx = ref<{ x: number; y: number; title: string; items: CcmItem[] } | null>(null);
const flash = ref<{ x: number; y: number; text: string } | null>(null);
let flashTimer: ReturnType<typeof setTimeout> | null = null;
function onCtxKey(e: KeyboardEvent) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  const at = menuKeyAnchor(e);
  openCtx({ clientX: at.x, clientY: at.y });
}
/* 解释树键盘：菜单键开菜单；↑/↓/Home/End 在整棵可见行间移动；←/→ 收起/展开。 */
function onRowKey(e: KeyboardEvent) {
  if (isMenuKey(e)) { onCtxKey(e); return; }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (!hasKids.value) return;
    const want = e.key === 'ArrowRight';
    if (open.value === want) return;
    e.preventDefault(); e.stopPropagation();
    open.value = want;
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const rowEl = e.currentTarget as HTMLElement;
  let root = rowEl.closest('.xt-node') as HTMLElement | null;
  while (root?.parentElement?.closest('.xt-node')) root = root.parentElement.closest('.xt-node') as HTMLElement;
  if (!root) return;
  const rows = [...root.querySelectorAll<HTMLElement>('.xt-row')];
  if (rows.length < 2) return;
  const cur = rows.indexOf(rowEl);
  if (cur < 0) return;
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1
    : Math.max(0, Math.min(rows.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)));
  e.preventDefault(); e.stopPropagation();
  rows[next]?.focus();
}
async function copyNear(text: string, msg: string, e: { clientX: number; clientY: number }) {
  if (!text) return;
  const ok = await copyText(text);
  flash.value = { x: e.clientX + 10, y: e.clientY + 14, text: ok ? msg : '复制失败' };
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (flash.value = null), 1200);
}
/* 行文本：人一眼能对上界面的一行摘要（分值 · 占比 · 因子档 · 描述） */
function rowLine(): string {
  const parts = [fmtVal(props.node?.value), pct.value.toFixed(1) + '%'];
  if (kind.value) parts.push(kind.value);
  const d = String(props.node?.description || '');
  if (d) parts.push(d);
  return parts.join(' · ');
}
function openCtx(e: { clientX: number; clientY: number }) {
  const d = String(props.node?.description || '');
  ctx.value = {
    x: e.clientX, y: e.clientY,
    title: (kind.value ? kind.value + ' · ' : '') + pct.value.toFixed(1) + '%',
    items: [
      { key: 'xt-copy-line', label: '复制这一行（分值+占比+描述）', icon: ClipboardList,
        run: () => void copyNear(rowLine(), '已复制该行', e) },
      { key: 'xt-copy-desc', label: '只复制描述', icon: Info,
        run: () => void copyNear(d, '已复制描述', e) },
      { key: 'xt-more', label: '更多…', icon: Copy, sep: true, children: [
        { key: 'xt-copy-val', label: '复制分值', icon: Hash, run: () => void copyNear(String(props.node?.value ?? ''), '已复制分值', e) },
        { key: 'xt-copy-pct', label: '复制贡献占比', icon: Hash, run: () => void copyNear(pct.value.toFixed(1) + '%', '已复制占比', e) },
        { key: 'xt-copy-sub', label: hasKids.value ? '复制此节点子树 JSON' : '复制此节点 JSON', icon: Braces,
          run: () => void copyNear(JSON.stringify(props.node, null, 2), '已复制节点 JSON', e) },
      ] },
    ],
  };
}
</script>

<style scoped>
.xt-node { font-size: var(--fs-xs); }
.xt-row {
  display: flex; align-items: center; gap: var(--sp-1h);
  padding: 3px var(--sp-1h) 3px calc(6px + var(--xt-depth) * 14px);
  border-radius: var(--r-xs); cursor: pointer; line-height: 1.5;
}
.xt-row:hover { background: var(--hover); }
.xt-caret { flex: none; transition: transform .12s; opacity: .55; }
.xt-caret.open { transform: rotate(90deg); }
.xt-caret-ph { width: 10px; flex: none; }
/* 删死 fallback（.xt-val/.xt-pct/.xt-desc 共 3 处 mono 同族清理，--mono 已在 theme.css 定义） */
.xt-val { flex: none; min-width: 62px; text-align: right; font-family: var(--mono); font-weight: 600; }
.xt-bar-wrap { flex: none; width: 90px; height: 6px; border-radius: 3px; background: var(--bg2); overflow: hidden; }
.xt-bar { display: block; height: 100%; border-radius: 3px; background: var(--dv-slate); }
.xt-pct { flex: none; min-width: 44px; text-align: right; font-family: var(--mono); opacity: .65; }
.xt-kind {
  flex: none; padding: 0 5px; border-radius: 3px; font-size: var(--fs-2xs); font-weight: 650;
  text-transform: uppercase; letter-spacing: .4px; background: var(--bg2);
}
.xt-desc { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .85; font-family: var(--mono); }
.xt-kids { border-left: 1px dashed var(--line-strong); margin-left: calc(11px + var(--xt-depth) * 14px); }

/* 因子配色：weight 蓝 · idf 紫 · tf 青 · boost 橙 · norm 绿 · combine 灰 */
/* 四枚举 -soft 并入 var()——原 var(--x)-soft 非法、整条声明被解析器丢弃，徽标实际无底色 */
.xk-weight.xt-bar, .xt-bar.xk-weight { background: var(--dv-blue); }
.xt-kind.xk-weight { color: var(--dv-blue); background: var(--dv-blue-soft); }
.xk-idf.xt-bar, .xt-bar.xk-idf { background: var(--dv-violet); }
.xt-kind.xk-idf { color: var(--dv-violet); background: var(--dv-violet-soft); }
.xk-tf.xt-bar, .xt-bar.xk-tf { background: var(--dv-cyan); }
.xt-kind.xk-tf { color: var(--dv-cyan); background: var(--dv-cyan-soft); }
.xk-boost.xt-bar, .xt-bar.xk-boost { background: var(--warn); }
.xt-kind.xk-boost { color: var(--warn); background: var(--warn-soft); }
.xk-norm.xt-bar, .xt-bar.xk-norm { background: var(--ok); }
.xt-kind.xk-norm { color: var(--ok); background: var(--ok-soft); }
.xk-combine.xt-bar, .xt-bar.xk-combine { background: var(--tx2); }
.xt-kind.xk-combine { color: var(--tx2); }
.xk-script.xt-bar, .xt-bar.xk-script { background: var(--dv-pink); }
.xt-kind.xk-script { color: var(--dv-pink); background: var(--dv-pink-soft); } /* ：同上 -soft 修复 */
.xk-const.xt-bar, .xt-bar.xk-const { background: var(--dv-slate); }
.xt-kind.xk-const { color: var(--dv-slate); }
/* 1316：复制回执就近闪一条（JsonTree .jt-flash 同款，z 走 ctx 注册档 +3） */
.xt-flash {
  position: fixed; z-index: calc(var(--z-ctx) + 3); pointer-events: none;
  background: var(--bg1); border: 1px solid var(--line-strong); border-radius: var(--r-s);
  box-shadow: var(--shadow-pop); color: var(--tx0); font-size: var(--fs-2xs);
  padding: var(--sp-0) var(--sp-2); max-width: 46vw;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
</style>
