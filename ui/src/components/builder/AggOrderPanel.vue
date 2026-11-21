<template>
  <div class="aop">
    <!-- 1031：桶聚合 order 行编辑（AggTreeNode 挂接，AST 零改动 body 直通投影，
         AggRangesPanel 同款范式）。每行 排序键 + asc/desc：排序键 = _count（文档数）/
         _key（桶键）/ 子聚合名或 stats.sum 度量路径。形态无损写回：
         · 数组形态 [{_count:"desc"}] 原样数组写回（多行合法）；
         · 单键对象形态 {_key:"asc"} 保持对象写回（不洗成数组）；加到第二行才升级数组
           （ES 语义：多排序必须数组）。
         非投影形态（多键对象）不进本面板（AggTreeNode 门控），留守自由表零丢失。 -->
    <div v-for="(r, i) in rows" :key="i" class="aop-row">
      <span class="aop-idx mono">{{ i + 1 }}</span>
      <input class="inp mono aop-key" :value="r.key"
             placeholder="_count / _key / 子聚合名" v-tip="'排序键：_count=文档数、_key=桶键、子聚合名或 stats.sum 度量路径'"
             role="combobox" aria-autocomplete="list" :aria-expanded="kcOpen ? 'true' : 'false'" :aria-controls="kcListId"
             @focus="onKeyComboFocus(i, $event)" @input="setKey(i, ($event.target as HTMLInputElement).value)" @keydown="onKeyComboKey" />
      <n-select class="aop-dir" size="tiny" :value="r.dir" :options="DIR_OPTIONS" v-tip="'排序方向'"
                @update:value="v => setDir(i, v)" />
      <button aria-label="删除排序行" class="btn sm ghost danger" v-tip="'删除该排序'" @click="delRow(i)">
        <X :size="12" />
      </button>
    </div>
    <!-- 排序键候选弹层（可输可选：候选只提示不约束，手打子聚合名/stat 路径照常），
         多行共用一份弹层（锚点/回填行随聚焦输入切换） -->
    <Teleport to="body">
      <div v-if="kcOpen" class="aop-kc-pop float-pop" :style="kcPopStyle" @mousedown.prevent.stop>
        <div class="aop-kc-list" role="listbox" :id="kcListId" ref="kcListEl">
          <div v-for="(k, ki) in KEY_HINTS" :key="k" class="aop-kc-item mono" :class="{ act: ki === kcCursor }"
               role="option" :id="kcItemId(ki)" :aria-selected="ki === kcCursor" tabindex="-1"
               @mouseenter="kcCursor = ki" @click="pickKeyHint(k)">{{ k }}</div>
        </div>
      </div>
    </Teleport>
    <div class="aop-foot">
      <button class="btn sm ghost aop-add" @click="addRow"><Plus :size="12" /> 加排序</button>
      <span v-if="!rows.length" class="aop-none">未排序（默认按文档数降序）</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { NSelect } from 'naive-ui';
import { X, Plus } from 'lucide-vue-next';
import { usePopupList } from '../../composables/usePopupList';

const props = defineProps<{ body: Record<string, unknown> }>();
const emit = defineEmits<{ (e: 'patch', order: unknown): void }>();

const KEY_HINTS = ['_count', '_key', 'avg', 'sum', 'min', 'max', 'stats', 'value_count'];
const DIR_OPTIONS = [
  { label: 'desc 降', value: 'desc' },
  { label: 'asc 升', value: 'asc' },
];

/* ═══ 排序键候选弹层（可输可选 combobox）═══ 骨架（↑↓/Enter/Esc、IME 守卫、
 点击外部关闭、防溢出钳位）由 usePopupList 承载；候选=固定提示键集（KEY_HINTS），
 选中即回填当前聚焦行，手输不限制 */
const kcAnchorEl = ref<HTMLElement>();
let kcRow = 0;
const kcCombo = usePopupList<string>({
  items: () => KEY_HINTS,
  anchor: () => kcAnchorEl.value,
  onChoose: k => { setKey(kcRow, k); kcCombo.close(); },
  idPrefix: 'aopkc',
  activeSelector: '.aop-kc-item.act',
  place: { minWidth: 200, flipBelow: 220, flipTop: 200 },
});
const kcOpen = kcCombo.open;
const kcCursor = kcCombo.cursor;
const kcPopStyle = kcCombo.popStyle;
const kcListId = kcCombo.listId;
const kcItemId = kcCombo.itemId;
const kcListEl = kcCombo.listEl;
function pickKeyHint(k: string) { setKey(kcRow, k); kcCombo.close(); }
function onKeyComboFocus(i: number, e: FocusEvent) {
  kcAnchorEl.value = e.target as HTMLElement;
  kcRow = i;
  kcCombo.openPanel();
}
function onKeyComboKey(e: KeyboardEvent) {
  if (!kcOpen.value && !KEY_HINTS.length) return;
  kcCombo.onKey(e);
}

interface OrderRow { key: string; dir: string }

/* 读投影：数组形态取每项首键（多键项跳过=非投影，由外层门控兜底）；单键对象形态取该键。
   objForm = 原始是单键对象形态（写回时保持，不洗成数组）。 */
const objForm = computed(() => {
  const o = props.body.order;
  return !!o && typeof o === 'object' && !Array.isArray(o);
});
const rows = computed<OrderRow[]>(() => {
  const o = props.body.order;
  if (Array.isArray(o)) {
    return o
      .filter(it => it && typeof it === 'object' && !Array.isArray(it) && Object.keys(it as object).length === 1)
      .map(it => {
        const [key, dir] = Object.entries(it as Record<string, unknown>)[0];
        return { key, dir: dir === 'asc' ? 'asc' : 'desc' };
      });
  }
  if (o && typeof o === 'object') {
    const entries = Object.entries(o as Record<string, unknown>);
    if (entries.length === 1) {
      const [key, dir] = entries[0];
      return [{ key, dir: dir === 'asc' ? 'asc' : 'desc' }];
    }
  }
  return [];
});

/* 写回：行列表 → 原形态容器。单行+对象形态=对象写回；其余=数组。
   空行（键清空）从列表剔除；全部清空 = 删 order 键（undefined 由外层 onBodyPatch 落键）。 */
function write(list: OrderRow[]) {
  const clean = list.filter(r => r.key.trim() !== '');
  if (!clean.length) { emit('patch', []); return; }
  const single = clean.map(r => ({ [r.key]: r.dir }));
  if (objForm.value && clean.length === 1) emit('patch', single[0]);
  else emit('patch', single);
}
function setKey(i: number, raw: string) {
  write(rows.value.map((r, j) => (j === i ? { ...r, key: raw } : r)));
}
function setDir(i: number, dir: string) {
  write(rows.value.map((r, j) => (j === i ? { ...r, dir } : r)));
}
function delRow(i: number) { write(rows.value.filter((_, j) => j !== i)); }
function addRow() { write([...rows.value, { key: '', dir: 'desc' }]); }
</script>

<style scoped>
.aop { display: flex; flex-direction: column; gap: var(--sp-1); padding: var(--sp-2); background: var(--bg2); border-radius: var(--r-s); margin-bottom: var(--sp-2); }
.aop-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.aop-idx { font-size: var(--fs-2xs); color: var(--tx2); min-width: 14px; text-align: right; }
.aop-key { width: 158px; height: 28px; font-size: var(--fs-sm); }
.aop-dir { width: 96px; flex: none; }
/* 排序键候选弹层：壳属性合并 theme.css .float-pop，本组只留坐标外裁切与行高 */
.aop-kc-pop { overflow: hidden; font-size: var(--fs-sm); }
.aop-kc-list { max-height: 232px; overflow: auto; }
.aop-kc-item { display: flex; align-items: center; height: 26px; padding: 0 var(--sp-2h); cursor: pointer; }
.aop-kc-item:hover, .aop-kc-item.act { background: var(--hover); }
.aop-foot { display: flex; align-items: center; gap: var(--sp-2); }
.aop-add { align-self: flex-start; }
.aop-none { font-size: var(--fs-xs); color: var(--tx2); }
</style>
