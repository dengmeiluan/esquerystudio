<template>
  <div class="bs-only">
    <div class="bs-only-card card">
      <div class="bs-only-ic"><ServerOff :size="26" :stroke-width="1.8" /></div>
      <div class="bs-only-kicker">浏览器模式</div>
      <h1 class="bs-only-title">{{ info.name }}需要服务端</h1>
      <p class="bs-only-desc">{{ info.reason }}</p>
      <p class="bs-only-desc">
        插件仍以同一套原生 Vue 控制台运行；此页依赖宿主进程能力，无法在直连 Elasticsearch 的纯前端模式复刻。
        需要该能力时，请使用服务端模式部署（<code class="mono">/esquerystudio</code>）。
      </p>
      <div class="bs-only-actions">
        <button class="btn sm primary" @click="go('/overview')">返回概览</button>
        <button class="btn sm ghost" @click="go('/rest')">打开 REST 直连</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ServerOff } from 'lucide-vue-next';
import { browserServerOnlyOf } from '../utils/browserUnsupported';

const route = useRoute();
const router = useRouter();
const info = computed(() => browserServerOnlyOf(route.path) || { name: '该页面', reason: '此能力依赖服务端进程。' });
function go(path: string) { void router.push(path); }
</script>

<style scoped>
.bs-only {
  min-height: 100%;
  display: flex; align-items: center; justify-content: center;
  padding: var(--sp-6) var(--sp-4);
}
.bs-only-card {
  width: min(560px, 100%);
  padding: var(--sp-6);
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-3);
}
.bs-only-ic {
  width: 46px; height: 46px; border-radius: var(--r-m);
  display: flex; align-items: center; justify-content: center;
  color: var(--ac-hi); background: var(--ac-soft); border: 1px solid var(--ac-line);
}
.bs-only-kicker { font-size: var(--fs-xs); letter-spacing: .08em; color: var(--tx2); }
.bs-only-title { margin: 0; font-size: var(--fs-xl); font-weight: 650; color: var(--tx0); }
.bs-only-desc { margin: 0; color: var(--tx1); line-height: 1.7; font-size: var(--fs-sm); }
.bs-only-desc code { font-size: var(--fs-xs); padding: 1px 5px; border-radius: var(--r-s); background: var(--bg2); color: var(--tx1); }
.bs-only-actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-1); }
</style>
