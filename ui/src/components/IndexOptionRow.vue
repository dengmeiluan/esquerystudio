<template>
  <div class="ior">
    <div class="ior-main">
      <span v-if="kind === 'alias'" class="ior-tag">别名</span>
      <span v-else class="ior-dot" :class="'h-' + (health || 'grey')" :title="'health: ' + (health || '-')"></span>
      <span class="ior-name mono" :title="name"><!--
        --><template v-for="(seg, si) in nameSegs" :key="si"><!--
          --><mark v-if="seg.m">{{ seg.t }}</mark><!--
          --><template v-else>{{ seg.t }}</template><!--
        --></template><!--
      --></span>
      <span v-if="meta" class="ior-meta">{{ meta }}</span>
      <button :aria-label="'复制：' + name" class="ior-copy" :title="'复制：' + name" @mousedown.stop.prevent @click.stop="doCopy">
        <Copy :size="11" />
      </button>
    </div>
    <div v-if="aliases && aliases.length" class="ior-aliases">
      <span
        v-for="a in aliases" :key="a"
        class="ior-chip" :title="'以别名查询：' + a" tabindex="0" role="button" :aria-label="'以别名查询：' + a"
        @mousedown.stop.prevent @click.stop="emit('select-alias', a)"
        @keydown.enter.prevent="emit('select-alias', a)" @keydown.space.prevent="emit('select-alias', a)"
      >{{ a }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/* W3 D7：下拉/列表通用的索引条目——双行宽松形态。
 首行：health 点/别名 tag + 中段省略名 + meta + hover 复制钮；次行：别名 chips。
 复制/chip 双拦（mousedown/click）：弹层 mousedown 会关面板、click 会触发行选中。 */
import { computed } from 'vue';
import { Copy } from 'lucide-vue-next';
import { copyText } from '../utils/format';
/* 命中高亮收口 splitMark 分段渲染——原 esc()+<mark> 串接只标首处（indexOf 单点），
 且 v-html 是本组件唯一注入面。模板 v-for 插值天然转义：多命中全标 + 数值归一白得，
 字面行为零漂移（kw 空白 trim 后视同无高亮，单段原文）。 */
import { splitMark } from '../composables/useGridSearch';
import { useAppStore } from '../stores/app';

const props = withDefaults(defineProps<{
  kind?: 'index' | 'alias';
  name: string;
  aliases?: string[];
  health?: string;
  meta?: string;
  /** 搜索关键词：命中段渲染 <mark>（作用于省略后的显示串，被省略部分命不中属正常） */
  hl?: string;
}>(), { kind: 'index', aliases: () => [] });

const emit = defineEmits<{ (e: 'select-alias', name: string): void }>();
const store = useAppStore();

/* v3.0.1:去中段省略双重截断（原 midEllipsis 已于 退役）——CSS ellipsis+title 全文已兜底,JS 再截会让高亮定位失真且复制语义混乱。
 v-html 面退役——splitMark 分段直接模板渲染（多命中全标），shown/esc 一并退役 */
const nameSegs = computed(() => splitMark(props.name, props.hl || ''));

async function doCopy() {
  if (await copyText(props.name)) store.notify('success', '已复制：' + props.name);
}
</script>

<style scoped>
.ior { flex: 1; min-width: 0; }
.ior-main { display: flex; align-items: center; gap: 7px; min-width: 0; }
.ior-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-sm); }
.ior-name :deep(mark) { background: none; color: var(--acc); font-weight: 600; }
.ior-meta { flex-shrink: 0; color: var(--tx2); font-size: var(--fs-xs); white-space: nowrap; }
.ior-copy {
  flex-shrink: 0; display: inline-flex; border: none; background: none; color: var(--tx2);
  cursor: pointer; padding: var(--sp-0); border-radius: var(--r-xs); opacity: 0; transition: opacity .12s;
}
.ior:hover .ior-copy, .ior-copy:focus-visible { opacity: 1; }
.ior-copy:hover { color: var(--tx0); background: var(--bg3); }
.ior-aliases { display: flex; flex-wrap: wrap; gap: var(--sp-1); margin-top: 3px; padding-left: 14px; }
.ior-chip {
  font-size: var(--fs-2xs); padding: 0 5px; border-radius: var(--r-xs); line-height: 15px; cursor: pointer;
  color: var(--dv-purple); background: var(--dv-purple-soft);
}
.ior-chip:hover { background: var(--dv-purple-soft); }
.ior-tag {
  flex: none; font-size: var(--fs-2xs); padding: 0 5px; border-radius: var(--r-xs); line-height: 16px;
  color: var(--dv-purple); background: var(--dv-purple-soft);
}
.ior-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; }
.h-green { background: var(--ok); } .h-yellow { background: var(--warn); } .h-red { background: var(--err); } .h-grey { background: var(--tx2); }
.mono { font-family: var(--mono, ui-monospace, monospace); }
</style>
