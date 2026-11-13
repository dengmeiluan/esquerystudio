<template>
  <n-popover trigger="click" placement="bottom-end" :show="open" @update:show="open = $event" style="max-height:320px;overflow:auto">
    <template #trigger>
      <button class="btn sm ghost" title="选择显示的列（按索引记忆）" :aria-label="`选择显示的列（当前 ${selected.length}/${cols.length} 列）`">
        <Columns3 :size="13" />
        <!-- 可选文字标签（dbx 工具栏语言——图标+文字自解释） -->
        <span v-if="label" class="cp-label">{{ label }}</span>
      </button>
    </template>
    <div class="col-pick">
      <input v-if="cols.length > 8" v-model="kw" class="inp" placeholder="搜字段…" style="margin-bottom:var(--sp-1)" />
      <div class="col-pick-row">
        <button class="btn sm ghost" @click="emit('update:selected', cols.slice())">全选</button>
        <!-- 「前 N」N 值偏好（usePref 全站记忆）——−/＋ 只调 N 落盘，
 「前 N」按当前 N 应用；默认 6 保持既有行为 -->
        <button class="btn sm ghost" @click="emit('update:selected', cols.slice(0, firstN))">前 {{ firstN }}</button>
        <button class="btn sm ghost cp-n-step" aria-label="减少默认列数" title="减少「前 N」的 N" :disabled="firstN <= 1" @click="firstN = Math.max(1, firstN - 1)">−</button>
        <button class="btn sm ghost cp-n-step" aria-label="增加默认列数" title="增加「前 N」的 N" :disabled="firstN >= 30" @click="firstN = Math.min(30, firstN + 1)">＋</button>
      </div>
      <label v-for="c in filtered" :key="c" class="col-pick-item">
        <input type="checkbox" :checked="selected.includes(c)" @change="toggle(c)" />
        <!-- 可选类型徽标（FieldPicker.vue:51 同语言——.mft-type 全站色卡 data-t 分色）；
 types 不传/缺该字段键=不出徽标，零增量向后兼容 -->
        <span v-if="types?.[c]" class="cp-type mono mft-type" :data-t="types[c]">{{ types[c] }}</span>
        <span class="mono"><MarkText :text="c" :kw="kw" /></span>
        <!-- 选中项行内 ▲▼ 微调钮（selected 序=visibleCols 显示序，dbx 列管理
 对位）——点击 emit update:selected 全量新序（受控回写，父层 useTablePrefs 既有
 es_cols watch 自动落盘零新键）；首/末边界禁用；.stop.prevent 防误触行内勾选。
 xxs 微档防溢出（theme.css .btn.xxs 20px） -->
        <span v-if="selected.includes(c)" class="cp-mv">
          <button class="btn xxs ghost cp-mv-btn" aria-label="上移" title="上移" :disabled="c === selected[0]"
            @click.stop.prevent="move(c, -1)">▲</button>
          <button class="btn xxs ghost cp-mv-btn" aria-label="下移" title="下移" :disabled="c === selected[selected.length - 1]"
            @click.stop.prevent="move(c, 1)">▼</button>
        </span>
        <!-- ·实报⑥：定位到列（未勾选列先自动显示；表格横向滚动到该列+列头闪烁） -->
        <button class="btn xxs ghost cp-mv-btn" aria-label="定位到该列" title="定位到该列（表格滚动过去并闪烁列头）"
          @click.stop.prevent="emit('locate', c)"><Crosshair :size="11" /></button>
      </label>
      <div v-if="!filtered.length" class="col-pick-none">无匹配字段</div>
    </div>
  </n-popover>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { NPopover } from 'naive-ui';
import { Columns3, Crosshair } from 'lucide-vue-next';
import MarkText from './MarkText.vue';
import { usePref } from '../composables/urlState';

/* 列选择器合并为共享件——ResultTable（col-pick）与 QueryResultTable
 （qpick）此前各持一份同构模板+样式，抽此组件后两表共用。
 受控组件：列集合/选中集合由父给（即 useTablePrefs 的 allCols/visibleCols），
 变更以整组数组回吐（父直接落 useTablePrefs 的持久化 watch）。 */
const props = defineProps<{
  /** 全量列集合（渲染与「全选/前 6」的基准） */
  cols: string[];
  /** 当前显示列（受控） */
  selected: string[];
  /** 触发钮文字标签（dbx 工具栏图标+文字语言，不传则纯图标） */
  label?: string;
  /** 字段类型映射（可选）：传则清单行字段名旁出 .mft-type 色卡类型徽标；
 缺省 undefined=零增量（不传不出徽标）。ResultTable/QueryResultTable 的 fieldTypes/typeTiers 可直传 */
  types?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'update:selected', v: string[]): void;
  /* ·实报⑥：定位到列——RT/QRT 既有 locateCol（隐藏列自动显示+滚动+列头闪烁） */
  (e: 'locate', col: string): void;
}>();

const open = ref(false);
const kw = ref('');
watch(open, () => { kw.value = ''; });

/* 「前 N」N 值偏好（全站共享的操作习惯，非数据语义故不按维度）——
 usePref 落盘 esquerystudio.pref.table.firstn，默认 6 与既有硬编码行为一致 */
const firstN = usePref<number>('table.firstn', 6);

const filtered = computed(() => {
  const k = kw.value.trim().toLowerCase();
  return k ? props.cols.filter(c => c.toLowerCase().includes(k)) : props.cols;
});

function toggle(c: string) {
  const next = props.selected.includes(c)
    ? props.selected.filter(x => x !== c)
    : [...props.selected, c];
  emit('update:selected', next);
}

/* 选中列序微调——selected 序与父层 visibleCols（显示序）同源，相邻交换后
 整组回吐（受控契约：不原地变异）；越界静默（按钮边界禁用为主，函数兜底） */
function move(c: string, dir: -1 | 1) {
  const next = props.selected.slice();
  const i = next.indexOf(c);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= next.length) return;
  [next[i], next[j]] = [next[j]!, next[i]!];
  emit('update:selected', next);
}
</script>

<style scoped>
.col-pick { display: flex; flex-direction: column; gap: var(--sp-0); min-width: 200px; }
.col-pick-row { display: flex; gap: var(--sp-1h); padding-bottom: var(--sp-1h); border-bottom: 1px solid var(--line); margin-bottom: var(--sp-1); }
.col-pick-item { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-1) var(--sp-1h); border-radius: var(--r-xs); cursor: pointer; font-size: var(--fs-sm); }
.col-pick-item:hover { background: var(--bg2); }
.col-pick-none { padding: var(--sp-2h); text-align: center; color: var(--tx2); font-size: var(--fs-sm); }
.cp-label { font-size: var(--fs-sm); }
/* 类型徽标布局档（色卡颜色走 theme.css 全站 .mft-type[data-t]，冷门类型回落 :where
 specificity 0 同 FieldPicker/LuceneInput 口径；布局声明照 .fxp-type 平移、紧凑无 min-width） */
.cp-type { flex: none; font-size: var(--fs-2xs); padding: 0 5px; border-radius: var(--r-xs); line-height: 16px; }
:where(.cp-type) { color: var(--muted); background: var(--hl); }
/* ▲▼ 重排钮布局档——行尾右贴、不挤字段名（.mono 名 span 弹性占位）；
 spacing 走 --sp 档表（ 防回潮锁），height/line-height/font-size 属形状系保字面 */
.cp-mv { flex: none; display: inline-flex; gap: var(--sp-0); margin-left: auto; }
.cp-mv-btn { padding: 0 var(--sp-1); line-height: 16px; height: 16px; font-size: var(--fs-2xs); } /* ：裸 10px 换 theme.css 约定档 --fs-2xs（同值）；16px 形状系不动 */
</style>
