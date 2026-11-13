<template>
  <!-- 外壳 class（is-input）由父级透传到根节点：边框/高度/背景走父样式，组件只补 focus 描边与弹层 -->
  <div class="skp" ref="rootEl" :class="{ focus: open }">
    <input
      ref="inputEl"
      class="skp-inp mono"
      :value="modelValue"
      :placeholder="placeholder"
      spellcheck="false"
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="listId"
      :aria-activedescendant="open && items[cursor] ? itemId(cursor) : undefined"
      @input="onInput"
      @focus="openPanel"
      @keydown="onKey"
    />

    <Teleport to="body">
      <!-- 弹层 Teleport 在 body 下：mousedown 需 .stop，否则 document 层 onDocDown 会先关面板导致 click 选项丢失 -->
      <transition name="pop">
        <div v-if="open" class="skp-pop float-pop" :style="popStyle" @mousedown.prevent.stop>
        <div v-if="!items.length" class="skp-hint">目录里没有匹配「{{ modelValue }}」的键（仍可手输任意 setting 键）</div>

        <div v-else class="skp-list" ref="listEl" role="listbox" :id="listId">
          <div
            v-for="(s, i) in items" :key="s.key"
            class="skp-item" :class="{ act: i === cursor }"
            role="option" :id="itemId(i)" :aria-selected="i === cursor" tabindex="-1"
            @mouseenter="cursor = i" @click="choose(s.key)" @keydown.enter.prevent="choose(s.key)"
          >
            <span class="skp-key mono"><!-- ：候选键按当前输入 splitMark 切段 <mark> 高亮（与全站 MarkText 同视觉语言） --><template v-for="(seg, si) in keySegs(s.key)" :key="si"><mark v-if="seg.m" class="skp-mark">{{ seg.t }}</mark><template v-else>{{ seg.t }}</template></template></span>
            <span class="skp-desc">{{ s.desc }}</span>
            <span class="skp-badge" :data-d="s.dynamic ? 'dyn' : 'sta'">{{ s.dynamic ? '热更' : '静态' }}</span>
          </div>
        </div>

        <div class="skp-ft">
          <span class="skp-ex mono" :title="curExample">示例：{{ curExample || '—' }}</span>
          <span class="skp-keys"><kbd class="kbd">↑↓</kbd> 选择 <kbd class="kbd">Enter</kbd> 确认 <kbd class="kbd">Esc</kbd> 关闭</span>
        </div>
      </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/* W1 ：setting 键补全输入——数据源是静态目录（indexSettingsCatalog，零请求）。
 交互骨架复刻 FieldPicker：Teleport 弹层 + place() 定位 + ↑↓/Enter/Esc + 点击外部关闭。
 三态契约：弹层不抢焦点不打断输入；目录无匹配时退化为纯手输（Enter 收面板保留手输值）。 */
import { ref, computed } from 'vue';
import { filterSettings, type SettingEntry } from '../utils/indexSettingsCatalog';
import { splitMark } from '../composables/useGridSearch';
import { usePopupList } from '../composables/usePopupList';

const props = withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
}>(), { placeholder: 'setting 键，如 number_of_shards / analysis.analyzer…' });

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void; (e: 'picked', v: string): void }>();

const inputEl = ref<HTMLInputElement>();

/* 静态目录过滤：filterSettings 纯函数随当前输入实时过滤，零请求零 loading */
const items = computed<SettingEntry[]>(() => filterSettings(props.modelValue || ''));

/* W2 ：弹层骨架下沉 usePopupList（open/cursor/place/onKey/onDocDown/listId）；
 本组件只留静态目录数据源与 choose 回填；无 enter 透发（onEnter 缺省）、挂载点恒 body（to 缺省）、
 place 定位参数与 FieldPicker 分歧数值在此显式传入 */
const {
  open, cursor, popStyle, listId, itemId,
  rootEl, listEl, openPanel, close, onKey,
} = usePopupList<SettingEntry>({
  items: () => items.value,
  onChoose: s => choose(s.key),
  idPrefix: 'skp',
  activeSelector: '.skp-item.act',
  place: { minWidth: 340, flipBelow: 280, flipTop: 300 },
});

/* 底部 hint 行跟随高亮项 example */
const curExample = computed(() => items.value[cursor.value]?.example || '');

/* 候选键高亮切段——kw 与 filterSettings 同源（当前输入值），空输入原样单段 */
function keySegs(key: string) {
  return splitMark(key, props.modelValue || '');
}

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
  cursor.value = 0;
  if (!open.value) openPanel();
}

function choose(key: string) {
  emit('update:modelValue', key);
  emit('picked', key);
  close();
}

</script>

<style scoped>
/* 根节点承接父级透传的 is-input（边框/高度/背景）；这里只管定位与 focus 描边 */
.skp { position: relative; display: block; min-width: 0; }
/* focus-within 兜底：面板关闭但 input 仍聚焦时描边不丢（与 .is-input:focus 表现一致） */
.skp.focus, .skp:focus-within { border-color: var(--ac); }
.skp-inp { display: block; width: 100%; height: 100%; min-height: 24px; border: none; outline: none; background: transparent; color: inherit; font-size: inherit; padding: 0; font-family: var(--mono, ui-monospace, monospace); }

/* 壳属性（fixed/--z-island/bg/border/shadow/圆角）合并 theme.css .float-pop，本类只留坐标外裁切与字号 */
.skp-pop { overflow: hidden; font-size: var(--fs-sm); }
.skp-hint { padding: var(--sp-3) var(--sp-2h); color: var(--muted); }
.skp-list { max-height: 260px; overflow: auto; padding: 3px 0; }
.skp-item { display: flex; align-items: center; gap: var(--sp-2); padding: 5px var(--sp-2h); cursor: pointer; }
.skp-item.act { background: var(--hover); }
.skp-key { flex: none; max-width: 58%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.skp-desc { flex: 1; min-width: 0; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.skp-badge { flex: none; font-size: var(--fs-2xs); padding: 0 5px; border-radius: var(--r-xs); line-height: 16px; color: var(--muted); background: var(--hl); }
.skp-badge[data-d="dyn"] { color: var(--ok); background: var(--ok-soft); }
.skp-ft { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2h); padding: 5px var(--sp-2h); border-top: 1px solid var(--line); color: var(--muted); font-size: var(--fs-xs); }
.skp-ex { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.skp-keys { flex: none; }
.mono { font-family: var(--mono, ui-monospace, monospace); }
/* 候选键命中段高亮（对齐 MarkText .mt-mark 视觉） */
.skp-mark { background: var(--warn); color: var(--tx-on-strong); border-radius: 2px; padding: 0 1px; }
</style>
