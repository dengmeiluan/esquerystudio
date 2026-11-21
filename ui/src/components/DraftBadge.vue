<template>
  <span class="draft-badge">
    <span class="draft-badge-tt">已恢复草稿</span>
    <button type="button" class="draft-badge-x" title="丢弃恢复的草稿，回到默认内容" @click="$emit('clear')">清除</button>
  </span>
</template>

<script setup lang="ts">
/* 草稿：恢复指示徽标。useScopedDraft/useScopedDraftState 挂载时复原了
 非默认草稿 → 父级以 v-if="restored" 控制显隐；「清除」仅 emit，清稿动作
 （调用哪个 draft.clear()）归父级——徽标不持有任何状态，保持纯展示。
 视觉走最弱一档（--hl-soft 底 + --muted 字）：提示「现场回来了」而非打扰。 */
defineEmits<{ (e: 'clear'): void }>();
</script>

<style scoped>
.draft-badge {
  display: inline-flex; align-items: center; gap: var(--sp-1);
  padding: 0 var(--sp-1) 0 var(--sp-2);
  border-radius: 99px; font-size: var(--fs-xs); white-space: nowrap;
  background: var(--hl-soft); border: 1px solid var(--line); color: var(--muted);
}
.draft-badge-x {
  border: 0; background: transparent; padding: 1px var(--sp-2);
  border-radius: 99px; font-size: var(--fs-xs); color: var(--muted);
  cursor: pointer; transition: background var(--tr), color var(--tr);
}
.draft-badge-x:hover { background: var(--hl); color: var(--tx0); }
</style>
