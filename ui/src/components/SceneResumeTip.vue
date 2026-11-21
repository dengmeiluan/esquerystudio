<template>
  <!-- 进站「上次工作现场」提示——导航类信息，落左下（侧栏页脚上方）。
   为什么不做成 toast：naive-ui 的 placement 是 provider 级（逐条无效），
   而右下角正是结果表末行与回顶钮所在——一进站就先压住数据（实报「还要遮挡」）。
   这里是可关闭的常驻提示，不抢焦点、不盖表格。 -->
  <div v-if="show" class="srt" role="status" aria-live="polite">
    <div class="srt-tx">上次工作现场<b>{{ label }}</b></div>
    <div class="srt-acts">
      <button type="button" class="btn sm primary srt-go" @click="emit('resume')">继续上次</button>
      <button type="button" class="btn sm ghost srt-x" aria-label="关闭「上次工作现场」提示" title="关闭" @click="emit('close')">关闭</button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ show: boolean; label: string }>();
const emit = defineEmits<{ (e: 'resume'): void; (e: 'close'): void }>();
</script>

<style scoped>
.srt {
  position: fixed; left: 12px; bottom: 12px; z-index: var(--z-receipt); /* 回执档：压住页面内容，仍低于右键菜单/模态 */
  width: 208px; display: flex; flex-direction: column; gap: var(--sp-1h);
  padding: var(--sp-2); background: var(--bg1); border: 1px solid var(--line-strong);
  border-radius: var(--r-m); box-shadow: var(--shadow-pop);
}
.srt-tx { font-size: var(--fs-xs); color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.srt-tx b { color: var(--tx0); font-weight: 600; margin-left: var(--sp-1); }
.srt-acts { display: flex; gap: var(--sp-1); }
.srt-go { flex: 1 1 auto; }
.srt-x { flex: none; }
</style>
