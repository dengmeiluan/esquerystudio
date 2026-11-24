<template>
  <div class="mcp-console-page">
    <McpPanel :show="true" inline />
  </div>
</template>

<script setup lang="ts">
import McpPanel from '../components/McpPanel.vue';
</script>

<style scoped>
/* 让承载页本身变成确定高度的 flex 容器：.page 是滚动容器，普通块级子元素的
   height:100% 在 flex 项里解析不到；:has 只作用于 MCP 页，不影响其他页面滚动。 */
:global(.page:has(.mcp-console-page)) { display: flex; flex-direction: column; overflow: hidden; padding: var(--sp-2) 0 var(--sp-4); }
.mcp-console-page { flex: 1 1 auto; height: auto; min-height: 0; display: flex; flex-direction: column; box-sizing: border-box; width: 100%; max-width: none; margin: 0; padding: 0; }
.mcp-console-page :deep(.mcp-page-shell) { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.mcp-console-page :deep(.mcp-page-shell) > .mcp-panel { flex: 1 1 0; min-height: 0; height: auto; }
@media (max-width: 760px) {
  :global(.page:has(.mcp-console-page)) { display: block; overflow-y: auto; }
  .mcp-console-page { height: auto; padding: var(--sp-2) var(--sp-2h) var(--sp-4); }
  /* 移动端回到内容高度：桌面用的 flex:1 1 0 在无确定高度的父级里会把面板压成 0。 */
  .mcp-console-page :deep(.mcp-page-shell) { flex: 0 0 auto; }
  .mcp-console-page :deep(.mcp-page-shell) > .mcp-panel { flex: 0 0 auto; height: min(90vh, 820px); }
}
</style>
