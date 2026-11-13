<template>
  <span class="dotkey mono" :title="full || k"><template v-for="(c, i) in cells" :key="i"><mark v-if="c.m" class="dotkey-mark">{{ c.t }}</mark><template v-else>{{ c.s }}<wbr v-if="c.w" /></template></template></span>
</template>

<script setup lang="ts">
/**
 * dot-key 原子组件——断行只允许发生在「.」后（<wbr> 软断点），
 * 根治 word-break:break-all 把 query.info 撕成「query.i / nfo」的词中撕裂。
 * hover title 恒给全量 key（展示被剪前缀时用 full 传原始 key）。
 * v3.0.0：可选 kw——过滤输入命中片段 <mark>（splitMark 全 key 切分；
 * 命中段内不再插 <wbr>，跨点关键字（query.i）高亮在 mark 内可读性优先）。
 */
import { computed } from 'vue';
import { dotKeySegments } from '../utils/settingsView';
import { splitMark } from '../composables/useGridSearch';

const props = defineProps<{ k: string; full?: string; kw?: string }>();

interface Cell { s?: string; w?: boolean; m?: boolean; t?: string }

const cells = computed<Cell[]>(() => {
  const kw = props.kw?.trim();
  if (!kw) return dotKeySegments(props.k).map(s => ({ s, w: true }));
  const out: Cell[] = [];
  for (const seg of splitMark(props.k, kw)) {
    if (seg.m) { out.push({ m: true, t: seg.t }); continue; }
    for (const s of dotKeySegments(seg.t)) out.push({ s, w: true });
  }
  return out;
});
</script>

<style scoped>
/* overflow-wrap:anywhere 兜底：单段仍超宽（极端无点长词）时允许段内断，优先级仍在 <wbr> 之后 */
.dotkey { overflow-wrap: anywhere; word-break: normal; min-width: 0; }
.dotkey-mark { background: var(--warn); color: var(--tx-on-strong); border-radius: 2px; padding: 0 1px; }
</style>
