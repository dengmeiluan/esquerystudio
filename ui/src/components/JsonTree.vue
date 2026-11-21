<template>
  <div class="jtree mono" ref="rootEl" role="tree" aria-label="JSON 数据树" tabindex="0" @keydown="onTreeKey">
    <!-- -D2：输出区统一能力——一键复制 + 关键字高亮（命中时自动展开全部节点）。
 默认关：大量调用方是表格行内嵌入（每行一棵树），工具条只在大面板场景显式开启 -->
    <div v-if="tools" class="jt-tools">
      <input
        v-model="kw" class="jt-kw" placeholder="搜字段/值…"
        @keydown.enter.prevent="onHitKey"
      />
      <!-- 搜索定位：命中计数 + 上/下一个（复用上面的搜索框，Enter/Shift+Enter 接线） -->
      <HitNav :count="hitCount" :current="hitCur" compact @next="hitNext" @prev="hitPrev" />
      <button class="jt-btn" :title="'复制全文 JSON'" @click="copyAll"><Copy :size="11" /> {{ copied ? '已复制' : '复制' }}</button>
    </div>
    <JNode :kv="rootEntries" :depth="0" />
    <!-- 行级右键的复制回执：在动作落点附近闪一条，不依赖全局 toast
     （本组件大量用于表格行内嵌入，宿主不一定有 store 上下文） -->
    <div v-if="flash" class="jt-flash" :style="{ left: flash.x + 'px', top: flash.y + 'px' }">{{ flash.text }}</div>
    <CellContextMenu v-if="ctx" :x="ctx.x" :y="ctx.y" :title="ctx.title" :items="ctx.items" @close="ctx = null" />
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, type PropType } from 'vue';
import { Braces, ChevronRight, ClipboardList, Copy, Info, Type } from 'lucide-vue-next';
import { copyText } from '../utils/format';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { useHitLocate } from '../composables/useHitNav';
import { splitMark } from '../composables/useGridSearch';
import HitNav from './HitNav.vue';
import CellContextMenu, { type CcmItem } from './CellContextMenu.vue';

const props = withDefaults(defineProps<{
  data: any;
  tools?: boolean;
  /** P0-2：单节点子项渲染上限（防御 MB 级数组/千键对象把弹层拖死；
 * 默认 Infinity=既有 6 处调用零变化），超限追加「… 共 N 项」灰色行 */
  maxChildren?: number;
  /** 叶子字符串渲染上限（超长截断，全文靠 title/复制按钮；默认 Infinity） */
  maxStrLen?: number;
  /** 外部高亮通道——tools 私有搜索词（kw）为空时回落生效（LuceneQueryView JSON
 * 视图过滤词接线，回收 548 E2 ）；缺省 undefined 零变化（对齐 maxChildren 惯例） */
  highlightKw?: string;
}>(), { tools: false, maxChildren: Infinity, maxStrLen: Infinity });
const rootEl = ref<HTMLElement | null>(null);
const rootEntries = computed(() => toEntries(props.data));

/* -D2：搜索词 + 复制反馈（JNode 闭包引用 kw，命中高亮并强制展开） */
const kw = ref('');
/* 生效关键字 = tools 私有搜索词优先，空则回落外部 highlightKw（都 trim；
 缺省 undefined 零变化）——renderHl/hitIdxOf/isCollapsed 三处统一吃 effKw */
const effKw = computed(() => kw.value.trim() || (props.highlightKw || '').trim());
const copied = ref(false);
async function copyAll() {
  const ok = await copyText(JSON.stringify(props.data, null, 2));
  if (ok) { copied.value = true; setTimeout(() => (copied.value = false), 1200); }
}

/* ═══ 1180：行级右键 ═══
 JSON 视图此前只有工具条「复制全文」——想拿单个字段值只能手工框选。
 心智：右键点哪一行，动作就作用于那一行的「路径 / 值 / 子树」。
 路径用 `data-jid` 的点分路径（与搜索定位同源，数组下标即数字段），
 直接就是 _source 字段路径、可粘进 DSL/SQL。 */
const ctx = ref<{ x: number; y: number; title: string; items: CcmItem[] } | null>(null);
const flash = ref<{ x: number; y: number; text: string } | null>(null);
let flashTimer: ReturnType<typeof setTimeout> | null = null;
async function flashCopy(text: string, msg: string, e: MouseEvent) {
  if (!text) return;
  const ok = await copyText(text);
  flash.value = { x: e.clientX + 10, y: e.clientY + 14, text: ok ? msg : '复制失败' };
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (flash.value = null), 1200);
}
/* 值位文本：字符串给原文（粘到 term 查询里不用再剥引号），
 对象/数组给缩进 JSON（可整段贴回 DSL 或文件） */
function ctxValText(v: any): string {
  if (v == null) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return JSON.stringify(v, null, 2);
  return String(v);
}
function openRowCtx(e: MouseEvent, id: string, k: string, v: any) {
  /* 行树常嵌在表格单元格里——右侧表格的单元格菜单同键，必须先吃掉，
     否则两个菜单同时挂出（更具体的这一层才该赢） */
  e.preventDefault();
  e.stopPropagation();
  const isObj = v != null && typeof v === 'object';
  ctx.value = {
    x: e.clientX, y: e.clientY,
    title: id,
    items: [
      { key: 'jt-copy-val', label: isObj ? '复制此节点 JSON' : '复制值', icon: Copy,
        run: () => void flashCopy(ctxValText(v), isObj ? '已复制节点 JSON' : '已复制值', e) },
      { key: 'jt-copy-path', label: '复制路径', icon: Info,
        run: () => void flashCopy(id, '已复制路径：' + id, e) },
      { key: 'jt-more', label: '更多…', icon: Copy, sep: true, children: [
        { key: 'jt-copy-key', label: '复制键名', icon: Type, run: () => void flashCopy(k, '已复制键名', e) },
        { key: 'jt-copy-pair', label: '复制「路径: 值」', icon: ClipboardList,
          run: () => void flashCopy(id + ': ' + (isObj ? JSON.stringify(v) : ctxValText(v)), '已复制路径与值', e) },
        { key: 'jt-copy-all', label: '复制整棵 JSON', icon: Braces,
          run: () => void flashCopy(JSON.stringify(props.data, null, 2), '已复制整棵 JSON', e) },
      ] },
    ],
  };
}
/* 命中片段包 <mark>：h() 渲染路径直接拆 vnode，无 v-html 注入面。
 手写 indexOf 切分循环退役（全站第三份切分实现收口）——切分改吃
 useGridSearch.splitMark 单源（本组件注释即该函数头注里的历史同思路出处），
 jt-mark 类与样式零变；行为=高亮覆盖面只增不减（splitMark 557 数值归一联动白得）。 */
function renderHl(text: string) {
  const k = effKw.value;
  if (!k) return [text];
  return splitMark(text, k).map(seg => (seg.m ? h('mark', { class: 'jt-mark' }, seg.t) : seg.t));
}

function toEntries(v: any): { k: string; v: any }[] {
  if (v == null || typeof v !== 'object') return [];
  if (Array.isArray(v)) return v.map((item, i) => ({ k: String(i), v: item }));
  return Object.entries(v).map(([k, val]) => ({ k, v: val }));
}
function valCls(v: any): string {
  if (v == null) return 'j-null';
  if (typeof v === 'boolean') return 'j-bool';
  if (typeof v === 'number') return 'j-num';
  return 'j-str';
}
function valText(v: any): string {
  if (v == null) return 'null';
  if (typeof v === 'string') return '"' + v + '"';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
function preview(v: any): string {
  if (Array.isArray(v)) return `[ ${v.length} 项 ]`;
  return `{ ${Object.keys(v).length} 键 }`;
}

/* ── 搜索定位：命中行的确定性编号 ──────────────────────────────
 * 渲染是递归组件、各子树独立 patch，不能靠「渲染时递增计数器」编号（局部重渲染会错位）。
 * 改为与渲染同序（toEntries 先序 DFS）离线计算 path→idx 表：键命中、或叶子值文本命中
 * 的行按文档序编号；JNode 递归时携带 pfx（点分路径），行元素直接挂 data-hit-idx。 */
const nodeId = (pfx: string, k: string) => (pfx ? pfx + '.' + k : k);
const hitIdxOf = computed<Map<string, number>>(() => {
  const m = new Map<string, number>();
  const k = effKw.value.toLowerCase();
  if (!k) return m;
  let i = 0;
  const walk = (v: any, pfx: string) => {
    if (v == null || typeof v !== 'object') return;
    for (const { k: key, v: val } of toEntries(v)) {
      const id = nodeId(pfx, key);
      const isObj = val != null && typeof val === 'object';
      /* 行命中口径与 renderHl 一致：键文本或（叶子）值文本含关键字；容器 preview 不参与 */
      if (key.toLowerCase().includes(k) || (!isObj && valText(val).toLowerCase().includes(k))) m.set(id, ++i);
      if (isObj) walk(val, id);
    }
  };
  walk(props.data, '');
  return m;
});
const hitCount = computed(() => hitIdxOf.value.size);
const { current: hitCur, next: hitNext, prev: hitPrev } = useHitLocate(() => hitCount.value, () => rootEl.value);
function onHitKey(e: KeyboardEvent) { if (e.shiftKey) hitPrev(); else hitNext(); }

/* 叶子文本渲染：maxStrLen 截断（ P0-2）——超长字符串全文靠 title 悬浮与
 工具条复制（复制走 props.data 全量不受伤）；非字符串不截（对象走 preview/递归） */
function leafText(v: any): { text: string; clipped: boolean } {
  const t = valText(v);
  if (typeof v === 'string' && Number.isFinite(props.maxStrLen) && t.length > props.maxStrLen) {
    return { text: t.slice(0, Math.max(1, props.maxStrLen - 1)) + '…', clipped: true };
  }
  return { text: t, clipped: false };
}

/* 行元素 → 菜单数据（键盘菜单键用；鼠标右键仍走行内闭包） */
const rowCtx = new WeakMap<HTMLElement, { id: string; k: string; v: any }>();
const treeRows = () => [...(rootEl.value?.querySelectorAll<HTMLElement>('.jrow:not(.jmore)') ?? [])];
/* 树键盘：根一个 Tab 停靠点，↑/↓ 游走可见行、Home/End 首末；行内 Enter/Space 展开收起；
   菜单键/Shift+F10 以行盒为锚开该行菜单。输入框与工具条内让路。 */
function onTreeKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('input, textarea, .jt-tools')) return;
  const rowNow = () => (document.activeElement as HTMLElement | null)?.closest?.('.jrow') as HTMLElement | null;
  if (isMenuKey(e)) {
    const row = rowNow();
    const data = row ? rowCtx.get(row) : null;
    if (!row || !data) return;
    e.preventDefault(); e.stopPropagation();
    const at = menuKeyAnchor({ currentTarget: row });
    openRowCtx({ clientX: at.x, clientY: at.y, preventDefault() {}, stopPropagation() {} } as unknown as MouseEvent, data.id, data.k, data.v);
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    const row = rowNow();
    const tgl = row?.querySelector<HTMLElement>('.jarr, .j-prev');
    if (!tgl) return;
    e.preventDefault(); e.stopPropagation();
    tgl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return;
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const row = rowNow();
    const exp = row?.getAttribute('aria-expanded');
    if (!row || exp == null) return;
    const wantOpen = e.key === 'ArrowRight';
    if ((exp === 'true') === wantOpen) return;
    const tgl = row.querySelector<HTMLElement>('.jarr');
    if (!tgl) return;
    e.preventDefault(); e.stopPropagation();
    tgl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const rows = treeRows();
  if (!rows.length) return;
  const cur = rows.indexOf(document.activeElement as HTMLElement);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1
    : cur < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)));
  e.preventDefault(); e.stopPropagation();
  rows[next].focus();
}

/* 递归节点组件（自引用，显式 any 打破 TS 循环推断） */
const JNode: any = defineComponent({
  name: 'JNode',
  props: {
    kv: { type: Array as PropType<{ k: string; v: any }[]>, required: true },
    depth: { type: Number, default: 0 },
    pfx: { type: String, default: '' },
  },
  setup(p) {
    const collapsed = ref<Record<string, boolean>>({});
    return () => {
      /* P0-2：maxChildren 渲染裁剪——只裁渲染，命中编号（hitIdxOf）仍全量
 离线计算（被裁子树若有命中，游标落位找不到元素静默跳过，不炸不错位） */
      const all = p.kv;
      const capped = Number.isFinite(props.maxChildren) && all.length > props.maxChildren
        ? all.slice(0, props.maxChildren)
        : all;
      const overflow = all.length - capped.length;
      return h('div', { class: 'jnode', role: 'group' },
        [
          ...capped.map(({ k, v }) => {
            const isObj = v != null && typeof v === 'object';
            const key = p.depth + ':' + k;
            const id = nodeId(p.pfx, k);
            const hitIdx = hitIdxOf.value.get(id);
            /* 搜索命中时强制展开，否则深层命中被折叠遮住看不见 */
            const isCollapsed = effKw.value ? false : (collapsed.value[key] ?? p.depth >= 2);
            const leaf = isObj ? null : leafText(v);
            return h('div', {
              class: 'jrow', key, tabindex: '-1', role: 'treeitem',
              'aria-level': String(p.depth + 1),
              ...(isObj ? { 'aria-expanded': String(!isCollapsed) } : {}),
              /* 点分路径（先序 DFS 同序）：宿主层「渲染数据直达」委托按首段定位文档 */
              'data-jid': id,
              ref: (el: any) => { if (el) rowCtx.set(el as HTMLElement, { id, k, v }); },
              onContextmenu: (ev: MouseEvent) => openRowCtx(ev, id, k, v),
              ...(hitIdx != null ? { 'data-hit-idx': String(hitIdx) } : {}),
            }, [
              h('div', { class: 'jline' }, [
                isObj
                  ? h(ChevronRight, {
                      size: 12,
                      class: ['jarr', { open: !isCollapsed }],
                      onClick: () => (collapsed.value[key] = !collapsed.value[key]),
                    })
                  : h('span', { class: 'jarr-sp' }),
                h('span', { class: 'j-key' }, renderHl(k)),
                h('span', { class: 'j-colon' }, ': '),
                isObj
                  ? h('span', { class: 'j-prev', onClick: () => (collapsed.value[key] = !collapsed.value[key]) }, preview(v))
                  : h('span', {
                      class: valCls(v) + (leaf!.clipped ? ' j-clipped' : ''),
                      title: leaf!.clipped ? valText(v) + '（已截断，全文用「复制」）' : valText(v),
                    }, renderHl(leaf!.text)),
              ]),
              isObj && !isCollapsed
                ? h(JNode, { kv: toEntries(v), depth: p.depth + 1, pfx: id })
                : null,
            ]);
          }),
          ...(overflow > 0 ? [h('div', { class: 'jrow jmore', role: 'none' }, `… 共 ${all.length} 项（已截断显示前 ${capped.length} 项）`)] : []),
        ]);
    };
  },
});
</script>

<style scoped>
.jtree { font-size: var(--fs-sm); line-height: 1.7; }
.jtree:focus-visible { outline: 2px solid var(--ac); outline-offset: 2px; border-radius: var(--r-xs); }
:deep(.jrow:focus-visible) { outline: 1px solid var(--ac); outline-offset: -1px; background: var(--bg2); border-radius: 3px; }
.jt-tools { display: flex; align-items: center; gap: var(--sp-1h); justify-content: flex-end; margin-bottom: var(--sp-1); }
.jt-kw { width: 130px; font-size: var(--fs-xs); padding: var(--sp-0) var(--sp-2); background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r-xs); color: var(--tx0); outline: none; font-family: inherit; }
.jt-kw:focus { border-color: var(--ac); }
.jt-btn { display: inline-flex; align-items: center; gap: 3px; font-size: var(--fs-xs); background: none; border: none; cursor: pointer; color: var(--tx2); padding: var(--sp-0) 5px; border-radius: var(--r-xs); font-family: inherit; }
.jt-btn:hover { color: var(--tx0); background: var(--bg2); }
:deep(.jt-mark) { background: var(--warn); color: var(--tx-on-strong); border-radius: 2px; padding: 0 1px; }
/* 当前命中行：柔底 + 左侧强调条 + 焦点环（.hit-cur 由 useHitScroll 运行时挂/摘；
 JNode 是 h() 手搓 vnode，行元素无 scoped 属性，走 :deep 挂到根容器下） */
:deep(.jrow.hit-cur) { background: var(--ac-soft); box-shadow: inset 3px 0 0 var(--ac-hi), var(--focus-ring); border-radius: 3px; }
:deep(.jline) { display: flex; align-items: center; min-width: 0; }
:deep(.jarr) { color: var(--tx2); cursor: pointer; flex-shrink: 0; transition: transform var(--tr); }
:deep(.jarr.open) { transform: rotate(90deg); }
:deep(.jarr-sp) { width: 12px; flex-shrink: 0; }
:deep(.j-prev) { color: var(--tx2); cursor: pointer; font-style: italic; }
:deep(.j-prev:hover) { color: var(--tx1); }
:deep(.j-colon) { color: var(--tx2); }
/* P0-2：maxChildren 裁剪提示行 / maxStrLen 截断叶子 */
:deep(.jmore) { color: var(--tx2); font-size: var(--fs-xs); padding-left: var(--sp-3); font-style: italic; }
:deep(.j-clipped) { opacity: .75; }
:deep(.j-str), :deep(.j-num), :deep(.j-bool), :deep(.j-null) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60vw; }
/* 行级右键的复制回执（fixed 跟点，不吃布局、不挡点击） */
.jt-flash { position: fixed; z-index: calc(var(--z-ctx) + 3); pointer-events: none; background: var(--bg1); border: 1px solid var(--line-strong); border-radius: var(--r-s); box-shadow: var(--shadow-pop); color: var(--tx0); font-size: var(--fs-2xs); padding: var(--sp-0) var(--sp-2); max-width: 46vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
