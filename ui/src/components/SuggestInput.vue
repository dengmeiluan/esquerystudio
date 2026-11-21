<template>
  <div class="sgi" ref="rootEl">
    <input
      ref="inputEl"
      class="sgi-inp"
      :class="inputClass"
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
    <Teleport :to="teleportTo" :disabled="inplace">
      <transition name="pop">
        <!-- mousedown .prevent.stop：弹层 Teleport 在 body 下，不阻断会冒泡到 document
             被 onDocDown 误判「点外」先关层，click 选项丢失（IndexPicker 同款处理） -->
        <div v-if="open" class="sgi-pop float-pop" :class="{ inplace }" :style="popStyle" @mousedown.prevent.stop>
          <div v-if="!items.length" class="sgi-hint">清单里没有匹配——可直接输入清单外的值，Enter 确认</div>
          <div v-else class="sgi-list" ref="listEl" role="listbox" :id="listId">
            <div
              v-for="(it, i) in items" :key="it.key"
              class="sgi-item" :class="{ act: i === cursor }"
              role="option" :id="itemId(i)" :aria-selected="i === cursor" tabindex="-1"
              :title="it.meta || undefined"
              @mouseenter="cursor = i" @click="choose(it.key)"
            >
              <span class="sgi-key mono">{{ it.key }}</span>
              <span v-if="it.meta" class="sgi-meta">{{ it.meta }}</span>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/* 可输可选的值建议输入框（combobox）——原生 datalist 升档件。
 * datalist 的系统菜单与全站设计语言割裂（与原生 select 同病），且建议行只能显值、
 * 挂不出计数/释义等元信息。本件 = input + usePopupList 弹层骨架（IndexPicker 同构）：
 * 可自由手输（清单外值不拦）、↑↓/Enter/Esc 键盘导航、行内 meta 右置（计数或中文释义）、
 * Enter 确认（选建议与手输确认后都透发 enter，宿主接「回车即生效」）。
 * 消费面：SecurityView 审计三筛（用户/集群/URI 值建议）、AnalyzerLabView 分词组件四清单。 */
import { computed, ref } from 'vue';
import { usePopupList } from '../composables/usePopupList';

const props = withDefaults(defineProps<{
  modelValue: string;
  /** 建议清单：key=可回填值，meta=行尾元信息（计数/中文释义，可缺省） */
  suggestions: { key: string; meta?: string }[];
  placeholder?: string;
  /** 宿主输入框皮肤类（沿用原 datalist 挂点的 input 类，视觉零变化） */
  inputClass?: string;
  /** aria id 前缀（多实例共存时按挂点命名，如 sv-user/al-tok） */
  idPrefix?: string;
}>(), { placeholder: '', inputClass: '', idPrefix: 'sgi' });

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void;
  (e: 'enter'): void;
  /** Esc 在弹层已关时按下（原 input 的 Esc 清空语义归宿主） */
  (e: 'esc'): void;
}>();

const inputEl = ref<HTMLInputElement>();

const items = computed(() => {
  const kw = (props.modelValue || '').trim().toLowerCase();
  const all = props.suggestions;
  if (!kw) return all;
  return all.filter(s => s.key.toLowerCase().includes(kw));
});

const {
  open, cursor, popStyle, teleportTo, inplace, listId, itemId,
  rootEl, listEl, openPanel, close, onKey: popupOnKey,
} = usePopupList<{ key: string; meta?: string }>({
  items: () => items.value,
  onChoose: it => choose(it.key),
  onEnter: () => emit('enter'),
  idPrefix: props.idPrefix || 'sgi',
  activeSelector: '.sgi-item.act',
  place: { minWidth: 260, flipBelow: 240, flipTop: 260 },
});

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
  cursor.value = 0;
  if (!open.value) openPanel();
}

function choose(k: string) {
  emit('update:modelValue', k);
  close();
  /* 选定即确认：与键盘 Enter 选建议同一条路（原生 datalist 的 Enter 路径语义），
   * 鼠标点选也透发 enter——宿主「回车生效」链在点选后同样触发，少按一次 */
  emit('enter');
  inputEl.value?.focus();
}

/* Esc 语义分档：弹层开=骨架关层；弹层关=透发 esc（宿主清空值，沿用原 input 语义） */
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !open.value) { e.preventDefault(); emit('esc'); return; }
  popupOnKey(e);
}
</script>

<style scoped>
.sgi { position: relative; display: inline-flex; width: 100%; vertical-align: middle; }
.sgi-inp { flex: 1; min-width: 0; width: 100%; }
/* 弹层壳（fixed/z-index/bg/border/shadow/圆角）走 theme.css .float-pop，本类只管内排布 */
.sgi-pop { overflow: hidden; font-size: var(--fs-sm); }
.sgi-pop.inplace { position: absolute; top: 100%; left: 0; min-width: 100%; z-index: 10; }
.sgi-hint { padding: var(--sp-3) var(--sp-2h); color: var(--muted); }
.sgi-list { max-height: 240px; overflow: auto; padding: 3px 0; }
.sgi-item { display: flex; align-items: center; gap: var(--sp-2); padding: 5px var(--sp-2h); cursor: pointer; }
.sgi-item.act { background: var(--hover); }
.sgi-key { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sgi-meta { margin-left: auto; color: var(--muted); flex: none; font-size: var(--fs-xs); }
.mono { font-family: var(--mono, ui-monospace, monospace); }
</style>
