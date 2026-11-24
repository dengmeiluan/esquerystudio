<template>
  <!-- 外壳 class（如 的 dt-path）由父级透传到根节点：边框/高度/背景走父样式，组件只补 focus 描边与弹层 -->
  <div class="epi" ref="rootEl" :class="{ focus: open }">
    <input
      ref="inputEl"
      class="epi-inp mono"
      :value="modelValue"
      :placeholder="placeholder || ''"
      spellcheck="false"
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="listId"
      :aria-activedescendant="open && items[cursor] ? itemId(cursor) : undefined"
      @input="onInput"
      @keydown="onKey"
    />

    <Teleport :to="teleportTo" :disabled="inplace">
      <!-- 弹层默认 Teleport 在 body 下：mousedown 需 .prevent.stop——不抢输入焦点，
 且 document 层 onDocDown 不会先关面板导致 click 选项丢失；
 to="false" 时就地渲染在 .epi 根内（通用约定 8 容器边界载体，同 FieldPicker/LuceneInput） -->
      <transition name="pop">
        <div v-if="open" class="epi-pop float-pop" :class="{ inplace }" :style="popStyle" @mousedown.prevent.stop>
        <!-- 段二槽位指示：显示待填模板补偿上下文（方案 B 下 input 保持用户原文，上下文全在这行） -->
        <div v-if="stage === 'slot' && pendingEp" class="epi-stage">索引槽位 <b class="mono">{{ pendingEp.path }}</b></div>

        <div v-if="hint" class="epi-hint">{{ hint }}</div>

        <div v-else class="epi-list" ref="listEl" role="listbox" :id="listId">
          <div
            v-for="(it, i) in items" :key="itemKey(it)"
            class="epi-item" :class="{ act: i === cursor }"
            role="option" :id="itemId(i)" :aria-selected="i === cursor"
            @mouseenter="cursor = i" @click="choose(it)"
          >
            <template v-if="it.kind === 'ep'">
              <span class="epi-m mono" :data-m="it.ep.methods[0].toLowerCase()">{{ it.ep.methods.join('/') }}</span>
              <span class="epi-p mono">{{ it.ep.path }}</span>
              <span class="epi-d">{{ it.ep.doc }}</span>
            </template>
            <!-- 段二索引名命中子串 splitMark 切 <mark>（vnode 切段不开 v-html 注入面，同 MarkText 手法） -->
            <span v-else class="epi-idx mono"><template v-for="(seg, si) in it.segs" :key="si"><mark v-if="seg.m" class="epi-mark">{{ seg.t }}</mark><template v-else>{{ seg.t }}</template></template></span>
          </div>
        </div>

        <div class="epi-ft">
          <!-- 段二候选超 cap 时页脚报余量（引导改输入词收窄） -->
          <span v-if="slotRemain > 0" class="epi-more">仍有 {{ slotRemain }} 个，继续输入</span>
          <span class="epi-keys"><kbd class="kbd">↑↓</kbd> 选择 <kbd class="kbd">Enter</kbd> 确认 <kbd class="kbd">Esc</kbd> 关闭</span>
        </div>
      </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/* W3 ：ES 端点路径输入——双段弹层（端点目录 → 索引槽位清单）。
 段一=filterEndpoints 静态目录（零请求）；choose 含 {index} 槽位端点不回填，切段二出
 store.indices 过滤清单（按输入尾段 rank 过滤+排序，cap 50 页脚报余量，YAGNI 注释退役）；
 段二 choose 索引 fillIndexSlot 完整回填。
 弹层交互由 usePopupList 骨架供给（open/cursor/place/onKey/onDocDown/teleport 双模式）。

 关键设计决策（spec 固化）：
 - v-model 只承载最终路径：段一 choose 不写 v-model；段二打开期间 input 保持用户原文（方案 B），
 待填模板由 .epi-stage 指示行补偿上下文；
 - emit endpoint 在段一 choose 即发（ method 联动须在选索引前生效），选索引不重发；
 - 段回退统一收口：watch(open) 关层即回 endpoint 段（Esc/点击外部/无候选 Enter/选索引完成），
 input 事件也回（用户改字即回端点过滤）；段二仅由段一 choose 含槽位端点进入；
 - enter 透发走骨架 onEnter（面板关/无候选 Enter）；keydown 不 stopPropagation，
 宿主 @keydown.ctrl.enter 经 attrs 透传根节点同样可用。 */
import { ref, computed, watch, nextTick } from 'vue';
import { useAppStore } from '../../stores/app';
import { usePopupList } from '../../composables/usePopupList';
import { filterEndpoints, tplHasIndexSlot, fillIndexSlot, type EsEndpoint } from '../../utils/esEndpoints';
/* 段二命中子串高亮（splitMark 纯函数，composables/useGridSearch 单一出处） */
import { splitMark } from '../../composables/useGridSearch';

type MarkSeg = { t: string; m: boolean };

const props = withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  /** 弹层挂载点：默认 'body'（Teleport）；false 就地渲染在 .epi 根内（absolute 随根定位） */
  to?: string | false;
}>(), { to: 'body' });

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void;
  (e: 'endpoint', ep: EsEndpoint): void;
  (e: 'enter'): void;
}>();

/** 候选统一形态：段一端点行 / 段二索引行（判别联合，同层只出一段；：索引行带 mark 切分段） */
type EpiItem = { kind: 'ep'; ep: EsEndpoint } | { kind: 'idx'; name: string; segs: MarkSeg[] };

const store = useAppStore();
const inputEl = ref<HTMLInputElement>();
const stage = ref<'endpoint' | 'slot'>('endpoint');
/* 段一选中的含槽位端点：段二指示行与 choose 回填基准 */
const pendingEp = ref<EsEndpoint | null>(null);

/* 段二索引槽位过滤——
 过滤词取「输入尾部路径段」（槽位待填的正是尾段；按 '/' 切、剥 '?'）。
 尾段以 '_' 开头（_search/_mapping 等路径动作段——进入段二的主要入口形态）视作路径词
 不作过滤词，回退全量清单，避免「选完端点清单必空」的死路。
 rank 口径复用 fieldSearch（精确=0 > 前缀=1 > 包含=2，同级字母序），cap 50 页脚报余量。 */
const SLOT_CAP = 50;
/* 段二过滤基准：目录里用「关键词」选中含槽位端点时，输入不是索引前缀——
   若仍拿输入尾段过滤，会出现「没有匹配 graph 的索引」且无索引项可点（输入又会退回段一）。
   纯关键词（不含 /）进入段二回退全量索引；带 / 的手输路径仍按尾段过滤。 */
const slotBasis = ref<string | null>(null);
const slotTail = computed(() => ((slotBasis.value ?? props.modelValue) || '').split('?')[0].split('/').filter(Boolean).pop() || '');
const slotItems = computed(() => {
  const kw = slotTail.value;
  const filterKw = kw.startsWith('_') ? '' : kw;
  const lk = filterKw.toLowerCase();
  const names = store.indices.map(i => i.index);
  /* 无过滤词：保持 store 原序（后端 cat indices 语义序），不重排不 cap 排序扰动 */
  if (!lk) {
    return {
      total: names.length,
      list: names.slice(0, SLOT_CAP).map(n => ({ kind: 'idx' as const, name: n, segs: splitMark(n, '') })),
    };
  }
  const rankOf = (n: string) => { const l = n.toLowerCase(); return l === lk ? 0 : l.startsWith(lk) ? 1 : 2; };
  const hit = names.filter(n => n.toLowerCase().includes(lk))
    .sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b));
  return {
    total: hit.length,
    list: hit.slice(0, SLOT_CAP).map(n => ({ kind: 'idx' as const, name: n, segs: splitMark(n, filterKw) })),
  };
});
const slotRemain = computed(() => (stage.value === 'slot' ? Math.max(0, slotItems.value.total - SLOT_CAP) : 0));

const items = computed<EpiItem[]>(() => {
  if (stage.value === 'slot') return slotItems.value.list;
  return filterEndpoints(props.modelValue || '').map(ep => ({ kind: 'ep' as const, ep }));
});

/* hint 与列表互斥：无匹配/空集群零降级手输引导（段二区分「无数据」与「无匹配」） */
const hint = computed(() => {
  if (items.value.length) return '';
  if (stage.value === 'slot') {
    return slotTail.value && !slotTail.value.startsWith('_')
      ? '没有匹配「' + slotTail.value + '」的索引（仍可手输索引名）'
      : '当前集群暂无索引数据（仍可手输索引名）';
  }
  return '目录里没有匹配「' + (props.modelValue || '') + '」的端点（仍可手输任意路径）';
});

const {
  open, cursor, popStyle, teleportTo, inplace, listId, itemId,
  rootEl, listEl, openPanel, close, onKey,
} = usePopupList<EpiItem>({
  items: () => items.value,
  onChoose: it => choose(it),
  onEnter: () => emit('enter'),
  to: () => props.to,
  idPrefix: 'epi',
  activeSelector: '.epi-item.act',
});

function itemKey(it: EpiItem): string {
  /* /{index}/_mapping 有 GET/PUT 两条同 path 端点：key 必须含 methods */
  return it.kind === 'ep' ? 'ep:' + it.ep.methods.join(',') + ' ' + it.ep.path : 'idx:' + it.name;
}

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
  /* 输入即回端点段（段二打开时改字=放弃槽位选择回端点过滤） */
  stage.value = 'endpoint';
  pendingEp.value = null;
  slotBasis.value = null;
  cursor.value = 0;
  if (!open.value) openPanel();
}

function choose(it: EpiItem) {
  if (it.kind === 'ep') {
    /* 段一 choose 即发 endpoint（method 联动在选索引前生效）；无槽位端点同样发出 */
    emit('endpoint', it.ep);
    if (tplHasIndexSlot(it.ep.path)) {
      pendingEp.value = it.ep;
      /* 关键词（无 /）不是索引前缀：段二回退全量清单，避免「无匹配索引」死路 */
      slotBasis.value = (props.modelValue || '').includes('/') ? null : '';
      stage.value = 'slot';
      cursor.value = 0;
      return; /* 弹层保持开切段二；不回填 v-model（v-model 只承载最终路径） */
    }
    emit('update:modelValue', it.ep.path);
    close();
    refocusEnd();
    return;
  }
  /* 段二 choose 索引：fillIndexSlot 完整回填最终路径 */
  const tpl = pendingEp.value?.path || '';
  emit('update:modelValue', fillIndexSlot(tpl, it.name));
  close();
  refocusEnd();
}

/* 回填后光标置文本尾（重渲染 patch value 会重置 selectionStart，同 LuceneInput 处理） */
function refocusEnd() {
  nextTick(() => { const el = inputEl.value; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
}

/* 段回退统一收口：任何关层路径（Esc/点击外部/无候选 Enter/choose 完成）都回 endpoint 段 */
watch(open, v => { if (!v) { stage.value = 'endpoint'; pendingEp.value = null; slotBasis.value = null; } });
</script>

<style scoped>
.epi { position: relative; display: block; min-width: 0; }
/* focus-within 兜底：面板关闭但 input 仍聚焦时描边不丢（同 SettingsKeyInput 约定） */
.epi.focus, .epi:focus-within { border-color: var(--acc); }
.epi-inp { display: block; width: 100%; height: 100%; min-height: 24px; border: none; outline: none; background: transparent; color: inherit; font-size: inherit; padding: 0; font-family: var(--mono, ui-monospace, monospace); }

/* 壳属性（fixed/--z-island/bg/border/shadow/圆角）合并 theme.css .float-pop，本类只留坐标外裁切与字号 */
.epi-pop { overflow: hidden; font-size: var(--fs-sm); }
/* 就地模式：absolute 随 .epi 根（position:relative）定位（同 FieldPicker/LuceneInput 约定） */
.epi-pop.inplace { position: absolute; top: 100%; left: 0; min-width: 100%; z-index: 10; }
.epi-stage { padding: var(--sp-1h) var(--sp-2h); color: var(--muted); border-bottom: 1px solid var(--line); font-size: var(--fs-xs); }
.epi-stage b { color: var(--acc); font-weight: 600; }
.epi-hint { padding: var(--sp-3) var(--sp-2h); color: var(--muted); }
.epi-list { max-height: 240px; overflow: auto; padding: 3px 0; }
.epi-item { display: flex; align-items: center; gap: var(--sp-2); padding: 5px var(--sp-2h); cursor: pointer; }
.epi-item.act { background: var(--hover); }
.epi-p { flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.epi-d { flex: 1; min-width: 0; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.epi-idx { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 段二索引名命中子串高亮（全站 mark 语言，j-mark 同 warn-soft 底） */
.epi-mark { background: var(--warn-soft); color: inherit; border-radius: 2px; }
/* methods 徽标色系对齐 DevToolsView .dt-method（GET ok / POST warn / PUT dv-purple / DELETE err） */
.epi-m { flex: none; min-width: 52px; text-align: center; font-size: var(--fs-2xs); padding: 0 5px; border-radius: var(--r-xs); line-height: 16px; color: var(--muted); background: var(--hl); }
.epi-m[data-m="get"] { color: var(--ok); background: color-mix(in srgb, var(--ok) 13%, transparent); }
.epi-m[data-m="post"] { color: var(--warn); background: color-mix(in srgb, var(--warn) 13%, transparent); }
.epi-m[data-m="put"] { color: var(--dv-purple); background: color-mix(in srgb, var(--dv-purple) 13%, transparent); }
.epi-m[data-m="delete"] { color: var(--err); background: color-mix(in srgb, var(--err) 13%, transparent); }
.epi-ft { display: flex; align-items: center; justify-content: flex-end; padding: 5px var(--sp-2h); border-top: 1px solid var(--line); color: var(--muted); font-size: var(--fs-xs); }
/* 段二候选余量提示（靠左，与右侧快捷键提示同排） */
.epi-more { margin-right: auto; color: var(--muted); font-variant-numeric: tabular-nums; }
.mono { font-family: var(--mono, ui-monospace, monospace); }
</style>
