<template>
  <Teleport to="body">
    <!-- 1042：fields 形态字段列表多选弹层（ClauseNode 挂接）。搜索 rank 沿用 fieldSearch
         单源（精确/前缀/包含+类型分组），勾选即 emit 全量名单（候选序稳定，手输的非候选
         项保真不丢）；点外部/Esc/完成 收口。定位由父级传入（触发钮下方，右缘钳制），
         float-pop 壳在 theme.css。 -->
    <div class="mfp float-pop" :style="style" @click.stop>
      <input ref="qEl" v-model="q" class="inp mfp-q" placeholder="搜索字段（Enter 无动作，勾选即生效）"
             @keydown.esc.stop="$emit('close')" />
      <label v-for="f in visible" :key="f.path" class="mfp-row" @contextmenu.prevent="openRowMenu($event, f)">
        <input type="checkbox" :data-path="f.path" :checked="sel.includes(f.path)"
               @change="toggleSel(f.path, ($event.target as HTMLInputElement).checked)"
               @keydown="onRowKey($event, f)" />
        <span class="mfp-path" :title="f.path">{{ f.path }}</span>
        <code class="mfp-type">{{ f.type || '-' }}</code>
      </label>
      <div v-if="!visible.length" class="mfp-none">无匹配字段</div>
      <div class="mfp-foot">
        <span class="mfp-n">已选 {{ sel.length }}</span>
        <span style="flex: 1"></span>
        <button class="btn sm pri" @click="$emit('close')">完成</button>
      </div>
      <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y" :title="rowMenuTitle"
        :items="rowMenuItems" @close="rowMenu = null" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { Check, Copy } from 'lucide-vue-next';
import { searchFields, type FieldHit } from '../../utils/fieldSearch';
import { useAppStore } from '../../stores/app';
import CellContextMenu, { type CcmItem } from '../CellContextMenu.vue';
import { copyText } from '../../utils/format';
const props = withDefaults(defineProps<{
  modelValue: string[];
  fields: string[];
  types?: Record<string, string>;
  style?: Record<string, string>;
}>(), { types: () => ({}), style: () => ({}) });
const emit = defineEmits<{
  (e: 'update:modelValue', v: string[]): void;
  (e: 'close'): void;
}>();

const q = ref('');
const qEl = ref<HTMLInputElement>();
const sel = ref<string[]>([...props.modelValue]);

onMounted(() => nextTick(() => qEl.value?.focus()));

/* 搜索 rank 单源（fieldSearch）：精确/前缀/包含+类型分组；空查询=纯字母序平铺 */
const visible = computed(() => {
  const items = props.fields.map(p => ({ path: p, type: props.types[p] || '' }));
  return searchFields({ fields: items, query: q.value, cap: 200 }).flat;
});

/* 勾选变化 → 全量名单：候选序（mapping 稳定序）优先，手输的非候选项殿后保真。
   仅在显式勾选时外发（挂载/外部 modelValue 变化不外发——打开选择器不应静默
   改写用户手输的字段顺序）。 */
function toggleSel(path: string, on: boolean) {
  const next = sel.value.filter(f => f !== path);
  if (on) next.push(path);
  sel.value = next;
  const candSet = new Set(props.fields);
  const picked = new Set(sel.value);
  const ordered = props.fields.filter(f => picked.has(f));
  const extras = sel.value.filter(f => !candSet.has(f));
  emit('update:modelValue', [...ordered, ...extras]);
}

/* 候选行右键 / 复选框菜单键 —— 共享 CellContextMenu 壳；勾选与复制都只改本地名单，
   不触发服务端写（写回仍由宿主在提交查询时统一走查询门）。 */
const activePinia = getActivePinia();
const store = activePinia ? useAppStore(activePinia) : null;
const rowMenu = ref<{ x: number; y: number; f: FieldHit } | null>(null);
const rowMenuTitle = computed(() => {
  const m = rowMenu.value;
  return m ? '字段 · ' + m.f.path + (m.f.type ? ' · ' + m.f.type : '') : '';
});
const rowMenuItems = computed<CcmItem[]>(() => {
  const m = rowMenu.value;
  if (!m) return [];
  const checked = sel.value.includes(m.f.path);
  return [
    { key: 'mfp-toggle', label: checked ? '取消勾选此字段' : '勾选此字段', icon: Check, run: () => toggleSel(m.f.path, !checked) },
    { key: 'mfp-copy', label: '复制字段名', icon: Copy, run: () => copyFieldName(m.f.path) },
  ];
});
function copyFieldName(path: string) {
  void copyText(path).then(ok => store?.notify(ok ? 'success' : 'error',
    ok ? '已复制字段名：' + path : '复制失败：浏览器拦截了剪贴板'));
}
function openMenuAt(x: number, y: number, f: FieldHit) {
  rowMenu.value = { x, y, f };
}
function openRowMenu(e: MouseEvent, f: FieldHit) {
  openMenuAt(e.clientX, e.clientY, f);
}
function onRowKey(e: KeyboardEvent, f: FieldHit) {
  if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return;
  e.preventDefault();
  const r = (e.target as HTMLElement).getBoundingClientRect();
  openMenuAt(r.left + 12, r.bottom, f);
}

function onDocClick() { emit('close'); }
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
</script>

<style scoped>
.mfp { position: fixed; z-index: 60; width: 320px; max-width: calc(100vw - 16px); max-height: 50vh; overflow-y: auto; padding: var(--sp-2); }
.mfp-q { height: 28px; font-size: var(--fs-sm); margin-bottom: var(--sp-1); }
.mfp-row { display: flex; align-items: center; gap: var(--sp-2); padding: 3px var(--sp-1); border-radius: var(--r-xs); cursor: pointer; font-size: var(--fs-sm); }
.mfp-row:hover { background: var(--hover); }
.mfp-path { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mfp-type { font-size: var(--fs-2xs); color: var(--tx2); }
.mfp-none { font-size: var(--fs-xs); color: var(--tx2); padding: var(--sp-2); text-align: center; }
.mfp-foot { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-1); }
.mfp-n { font-size: var(--fs-2xs); color: var(--tx2); }
</style>
