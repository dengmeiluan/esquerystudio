<template>
  <div class="fxp" ref="rootEl" :style="{ width: width || undefined }">
    <div class="fxp-box" :class="{ focus: open }">
      <Braces :size="12" class="fxp-ic" />
      <input
        ref="inputEl"
        class="fxp-inp"
        :value="modelValue"
        :placeholder="placeholder || (multi ? 'field1, field2…' : 'field')"
        spellcheck="false"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open ? 'true' : 'false'"
        :aria-controls="listId"
        :aria-activedescendant="open && items[cursor] ? itemId(cursor) : undefined"
        @input="onInput"
        @focus="openPanel"
        @keydown="onInputKey"
      />
      <button aria-label="清空" v-if="modelValue" class="fxp-x" title="清空" tabindex="-1" @mousedown.prevent="clear">
        <X :size="11" />
      </button>
    </div>

    <Teleport :to="teleportTo" :disabled="inplace">
      <!-- 弹层默认 Teleport 在 body 下：mousedown 需 .stop，否则 document 层 onDocDown 会先关面板导致 click 选项丢失。
 to="false" 时 Teleport disabled → 就地渲染在 .fxp 根内（QueryHubView 场景任务嵌 naive popover 场景：
 弹层与 popover 同子树，clickoutside 不再误判关 popover 导致 click 丢失） -->
      <transition name="pop">
        <div v-if="open" class="fxp-pop float-pop" :class="{ inplace }" :style="popStyle" @mousedown.prevent.stop>
        <div v-if="!index" class="fxp-hint">先在上方选择索引，才能补全字段</div>
        <div v-else-if="loading" class="fxp-hint">正在加载 {{ index }} 的字段清单…</div>
        <div v-else-if="loadErr" class="fxp-hint">字段清单加载失败：{{ loadErr }}（仍可手输）<button class="btn ghost sm" @click="reload">重试</button></div>
        <div v-else-if="!items.length" class="fxp-hint">
          {{ fields.length ? '没有匹配「' + lastSeg + '」的字段' : '该索引没有可选字段' }}（仍可手输）
        </div>

        <div v-else class="fxp-list" ref="listEl" role="listbox" :id="listId">
          <!-- typePriority 智能排序时行间插分组标签（.fxp-gh 不进 items：usePopupList 的 cursor/Enter
 按 items 索引导航，标签混进候选集会错位高亮与回填）；不传 typePriority 时 rows 无标签行 = 现状渲染 -->
          <template v-for="r in rows" :key="r.gh !== undefined ? 'gh' + r.gh : r.f!.path">
            <div v-if="r.gh !== undefined" class="fxp-gh mono" role="presentation">{{ r.gh }}</div>
            <div
              v-else
              class="fxp-item" :class="{ act: r.i === cursor }"
              role="option" :id="itemId(r.i!)" :aria-selected="r.i === cursor" tabindex="-1"
              @mouseenter="cursor = r.i!" @click="choose(r.f!.path)" @keydown.enter.prevent="choose(r.f!.path)"
              @contextmenu.prevent="openRowMenu($event, r.f!, r.i!)"
            >
              <!-- 类型徽标挂全站色卡 .mft-type（theme.css），删局部四类型撞色规则 -->
              <span class="fxp-type mono mft-type" :data-t="r.f!.type">{{ r.f!.type }}</span>
              <!-- 近似候选徽标（548 C fuzzy 零命中纠错标记，与 LuceneInput 同文案） -->
              <i v-if="r.f!.fuzzy" class="fxp-fuzzy">近似</i>
              <!-- 全站最后一处注入式高亮残留退役——esc+mark 拼串通道换 MarkText 共享件
 （textContent 与原文一致；kw=lastSeg 已 trim 末段，与 searchFields 内部 rawQ 同口径；
 .fxp-name :deep(mark) specificity 压过 .mt-mark，视觉不变） -->
              <span class="fxp-name mono"><MarkText :text="r.f!.path" :kw="lastSeg" /></span>
            </div>
          </template>
        </div>

        <div class="fxp-ft">
          <!-- 页脚补 N/M 匹配计数（对齐 FieldSelect 页脚形态）+ cap 提示；
 保留「N 字段」「（typeFilter）」既有文案（fieldPicker.spec 契约） -->
          <span>{{ fields.length }} 字段{{ typeFilter ? '（' + typeFilter + '）' : '' }}<template v-if="items.length"> · {{ items.length }}/{{ res.total }} 匹配{{ res.capped ? '，仅显示前 ' + CAP + ' 个，输入更精确可缩小' : '' }}</template></span>
          <span class="fxp-keys"><kbd class="kbd">↑↓</kbd> 选择 <kbd class="kbd">Enter</kbd> 确认 <kbd class="kbd">Esc</kbd> 关闭</span>
        </div>
      </div>
      </transition>
    </Teleport>

    <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y" :title="rowMenuTitle"
      :items="rowMenuItems" @close="rowMenu = null" />
  </div>
</template>

<script setup lang="ts">
/* -f 统一字段选择器——索引选定后字段不再手写。
 数据源 useIndexFields（mappingDetail 拍平/缓存统一收口，key=集群目标|索引）；
 multi 模式支持逗号分隔多字段（只补全最后一段）。 */
import { ref, computed, watch } from 'vue';
import { Braces, Copy, CornerDownLeft, X } from 'lucide-vue-next';
import { useAppStore } from '../stores/app';
import { useIndexFields, type FieldItem } from '../composables/useIndexFields';
import { usePopupList } from '../composables/usePopupList';
import MarkText from './MarkText.vue';
import CellContextMenu, { type CcmItem } from './CellContextMenu.vue';
import { copyText } from '../utils/format';
import { searchFields, groupByLabel, loadRecentFields, rememberRecentField, type FieldHit } from '../utils/fieldSearch';

const props = withDefaults(defineProps<{
  modelValue: string;
  /** 字段来源索引；为空时降级为纯手输 */
  index: string;
  placeholder?: string;
  /** 只列出这些类型（如 'text' 或 'text,keyword'）；空 = 全部 */
  typeFilter?: string;
  /** 逗号分隔多字段模式（只补全光标所在最后一段） */
  multi?: boolean;
  width?: string;
  /** 弹层挂载点：默认 'body'（Teleport 现状，全体既有消费方零影响）；
 传 false 就地渲染在 .fxp 根内（absolute 随根定位，不跑 place() 的 fixed 坐标计算） */
  to?: string | false;
  /** 智能排序：命中这些类型的字段分组排前（组间插类型标签），其余殿后保持原序；
 不传/空 = 现状字母序（向后兼容），如 ['keyword','text'] 把文本类字段提到最前 */
  typePriority?: string[];
}>(), { typeFilter: '', multi: false, to: 'body' });

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void; (e: 'picked', v: string, type?: string): void; (e: 'enter'): void }>();

/* 候选上限显式归一为 50（= searchFields 默认值，写死防两处漂移） */
const CAP = 50;

const store = useAppStore();
const inputEl = ref<HTMLInputElement>();

/* 字段清单统一走 useIndexFields（缓存共享引用，只读消费：过滤走 computed 新数组，不原地改） */
const { fields, loading, loadErr, ensure, reload } = useIndexFields(() => props.index);

/* multi 模式：只对最后一段做匹配与替换 */
const lastSeg = computed(() => {
  const v = props.modelValue || '';
  return (props.multi ? v.split(',').pop() || '' : v).trim();
});
function applySeg(picked: string): string {
  if (!props.multi) return picked;
  const parts = (props.modelValue || '').split(',');
  parts[parts.length - 1] = (parts.length > 1 ? ' ' : '') + picked;
  return parts.join(',');
}

/* 字段搜索共享内核（src/utils/fieldSearch.ts）：rank 排序/typeFilter/typePriority 分组/mark 切分
 与 FieldSelect 同源不漂移；本组件消费行为零变化（fieldPicker.spec 全量护住） */
const res = computed(() => searchFields({
  fields: fields.value,
  query: lastSeg.value,
  cap: CAP,
  typeFilter: props.typeFilter ? props.typeFilter.split(',').map(s => s.trim()) : undefined,
  typePriority: (props.typePriority || []).map(s => s.trim()).filter(Boolean),
}));

/* 候选侧补 recent 前置（与 FieldSelect 同口径：recent 命中段式全前置、
 段内保持 rank+字母序）——消除「choose 写 recent 却从不吃 recent」的读写不对称。
 前置后统一重编 i：usePopupList cursor/act/aria 按 items 数组下标导航，i 必须与下标一致
 （rows 的 prio 分支同消费 h.i，不重编会高亮/选中错位）。 */
const ordered = computed<FieldHit[]>(() => {
  const rec = loadRecentFields(props.index);
  const flat = rec.length
    ? [
        ...rec.map(f => res.value.flat.find(h => h.path === f)).filter((h): h is FieldHit => !!h),
        ...res.value.flat.filter(h => !rec.includes(h.path)),
      ]
    : res.value.flat;
  return flat.map((h, i) => (h.i === i ? h : { ...h, i }));
});

/* 候选行携 fuzzy（548 C 近似候选 → .fxp-fuzzy「近似」徽标；FieldItem 结构扩展不外溢） */
type FxpItem = FieldItem & { fuzzy?: boolean };
const items = computed<FxpItem[]>(() => ordered.value.map(h => ({ path: h.path, type: h.type, fuzzy: h.fuzzy })));

/* 分组标签行：mono 小字可视化「类型优先」；数值族/date 给中文名，其余用类型原名。
 标签只进 rows 不进 items——cursor/onChoose 的候选索引仍是字段序。
 分组从重排后的 ordered 归堆（groupByLabel 与 FieldSelect 同源），recent
 命中段参与首现序归堆——与 FieldSelect 前置段分组口径对齐 */
type FxpRow = { gh?: string; f?: FxpItem; i?: number };
const rows = computed<FxpRow[]>(() => {
  const prio = (props.typePriority || []).map(s => s.trim()).filter(Boolean);
  if (!prio.length) return items.value.map((f, i) => ({ f, i }));
  const out: FxpRow[] = [];
  let prev: string | null = null;
  groupByLabel(ordered.value, prio).forEach(g => g.hits.forEach(h => {
    if (g.label !== prev) { out.push({ gh: g.label }); prev = g.label; }
    out.push({ f: { path: h.path, type: h.type, fuzzy: h.fuzzy }, i: h.i });
  }));
  return out;
});

/* W2 ：弹层骨架下沉 usePopupList（open/cursor/place/onKey/onDocDown/listId/to 双模式）；
 本组件只留数据源（ensure 走 onOpen）、过滤排序、multi 段、choose 回填与 enter 透发委托 */
const {
  open, cursor, popStyle, teleportTo, inplace, listId, itemId,
  rootEl, listEl, openPanel, close, onKey,
} = usePopupList<FieldItem>({
  items: () => items.value,
  onChoose: f => choose(f.path),
  onEnter: () => emit('enter'),
  onOpen: () => ensure(),
  to: () => props.to,
  idPrefix: 'fxp',
  activeSelector: '.fxp-item.act',
});

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
  cursor.value = 0;
  if (!open.value) openPanel();
}

/* 候选行右键/键盘 ContextMenu —— 与全站 CellContextMenu 同一壳；动作只读本地
 （选用回填、复制字段名），不触发服务端写，不需要权限门。 */
const rowMenu = ref<{ x: number; y: number; f: FxpItem; i: number } | null>(null);
const rowMenuTitle = computed(() => {
  const m = rowMenu.value;
  return m ? '字段 · ' + m.f.path + (m.f.type ? ' · ' + m.f.type : '') : '';
});
const rowMenuItems = computed<CcmItem[]>(() => {
  const m = rowMenu.value;
  if (!m) return [];
  return [
    { key: 'field-pick', label: '选用此字段', icon: CornerDownLeft, run: () => choose(m.f.path) },
    { key: 'field-copy', label: '复制字段名', icon: Copy, run: () => copyFieldName(m.f.path) },
  ];
});
function copyFieldName(path: string) {
  void copyText(path).then(ok => store.notify(ok ? 'success' : 'error',
    ok ? '已复制字段名：' + path : '复制失败：浏览器拦截了剪贴板'));
}
function showRowMenu(x: number, y: number, f: FxpItem, i: number) {
  cursor.value = i;
  rowMenu.value = { x, y, f, i };
}
function openRowMenu(e: MouseEvent, f: FxpItem, i: number) {
  showRowMenu(e.clientX, e.clientY, f, i);
}
/* 键盘入口：候选弹层焦点在输入框，ContextMenu/Shift+F10 对当前高亮项开菜单 */
function onInputKey(e: KeyboardEvent) {
  const f = items.value[cursor.value];
  if (!e.isComposing && (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))
    && open.value && f) {
    e.preventDefault();
    const r = inputEl.value?.getBoundingClientRect();
    showRowMenu(r ? r.left + 12 : 0, r ? r.bottom : 0, f, cursor.value);
    return;
  }
  onKey(e);
}

function choose(path: string) {
  const v = applySeg(path);
  /* per-index 最近使用回写（fieldSearch 记忆通道，FieldSelect 已有先例）——
 键拼本组件 index prop；存储满/隐私模式写入静默失败不影响选择 */
  rememberRecentField(props.index, path);
  /* 第三个参数带字段类型（可选，既有监听者忽略即零影响）：消费方可据此做
 「按类型自动选默认操作符」等类型驱动行为（条件行的 ClauseNode.onField 同思路） */
  const type = fields.value.find(f => f.path === path)?.type;
  emit('update:modelValue', v);
  emit('picked', v, type);
  close();
}

function clear() {
  emit('update:modelValue', '');
  inputEl.value?.focus();
  openPanel();
}

/* 索引变化：本实例字段清单跟随（缓存命中则零请求） */
watch(() => props.index, () => { if (open.value) ensure(); });
watch(() => store.target, () => { open.value = false; });
</script>

<style scoped>
.fxp { position: relative; display: inline-block; min-width: 150px; vertical-align: middle; }
.fxp-box { display: flex; align-items: center; gap: 5px; padding: var(--sp-1) var(--sp-1h) var(--sp-1) var(--sp-2); border: 1px solid var(--border); border-radius: var(--r-s); background: var(--bg2); transition: border-color .12s; }
.fxp-box.focus { border-color: var(--acc); }
.fxp-ic { color: var(--muted); flex: none; }
.fxp-inp { flex: 1; min-width: 60px; border: none; outline: none; background: transparent; color: inherit; font-size: var(--fs-sm); font-family: var(--mono, ui-monospace, monospace); }
.fxp-x { display: inline-flex; border: none; background: none; color: var(--muted); cursor: pointer; padding: 1px; border-radius: var(--r-xs); }
.fxp-x:hover { color: inherit; background: var(--hover); }

/* 壳属性（fixed/--z-island/bg/border/shadow/圆角）合并 theme.css .float-pop，本类只留坐标外裁切与字号 */
.fxp-pop { overflow: hidden; font-size: var(--fs-sm); }
/* 就地模式：absolute 随 .fxp 根（position:relative）定位；渲染在 popover 子树内天然随父 stacking context，无需 9000 z-index */
.fxp-pop.inplace { position: absolute; top: 100%; left: 0; min-width: 100%; z-index: 10; }
.fxp-hint { padding: var(--sp-3) var(--sp-2h); color: var(--muted); }
.fxp-list { max-height: 240px; overflow: auto; padding: 3px 0; }
/* typePriority 智能排序的组间标签：mono 小字，让「类型优先」可视化 */
.fxp-gh { padding: var(--sp-1) var(--sp-2h) var(--sp-0); font-size: var(--fs-2xs); color: var(--muted); letter-spacing: .04em; user-select: none; }
.fxp-item { display: flex; align-items: center; gap: var(--sp-2); padding: 5px var(--sp-2h); cursor: pointer; }
.fxp-item.act { background: var(--hover); }
.fxp-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fxp-name :deep(mark) { background: none; color: var(--acc); font-weight: 600; }
/* 类型徽标色统一 theme.css 全站 .mft-type[data-t] 色卡（本文件原局部四类型规则已删）。
 未入色卡的冷门类型回落档走 :where（编译后 :where(.fxp-type[data-v])，specificity 0）
 ——保证色卡规则必胜，回落只在无色卡命中时生效 */
.fxp-type { flex: none; min-width: 52px; text-align: center; font-size: var(--fs-2xs); padding: 0 5px; border-radius: var(--r-xs); line-height: 16px; }
:where(.fxp-type) { color: var(--muted); background: var(--hl); }
/* 近似候选徽标（548 C fuzzy 透传渲染，warn 色微字） */
.fxp-fuzzy { font-size: var(--fs-2xs); color: var(--warn); font-style: normal; margin-left: var(--sp-1); }
.fxp-ft { display: flex; align-items: center; justify-content: space-between; padding: 5px var(--sp-2h); border-top: 1px solid var(--line); color: var(--muted); font-size: var(--fs-xs); }
.mono { font-family: var(--mono, ui-monospace, monospace); }
</style>
