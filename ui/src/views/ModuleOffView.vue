<template>
  <div class="mod-off">
    <div class="mod-off-card card">
      <div class="mod-off-ic"><PackageOpen :size="26" :stroke-width="1.8" /></div>
      <div class="mod-off-kicker">{{ ui.product.name }}</div>
      <h1 class="mod-off-title">模块未启用</h1>
      <p class="mod-off-desc">
        <b>{{ pageName }}</b> 属于「{{ packName || '未命名模块' }}」功能包，
        当前部署没有启用它。这不是权限问题，而是产品面裁剪。
      </p>
      <div v-if="entries.length" class="mod-off-actions">
        <button
          v-for="e in entries" :key="e.pack.id"
          class="btn sm" :class="{ primary: e.pack.id === currentPackId }"
          @click="go(e.page.route)"
        >前往 {{ e.pack.name }}</button>
      </div>
      <p v-else class="mod-off-empty">
        当前部署没有启用任何功能包，请联系管理员检查
        <code class="mono">esquerystudio.console.features.packs</code>。
      </p>
      <p class="mod-off-hint">
        管理员可通过 <code class="mono">esquerystudio.console.features.packs</code>
        启用模块；单页可用 <code class="mono">exclude-pages</code> 再隐藏。
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { PackageOpen } from 'lucide-vue-next';
import { useUiConfigStore } from '../stores/uiConfig';

const route = useRoute();
const router = useRouter();
const ui = useUiConfigStore();

const pageName = computed(() => String(route.query.name || route.query.page || '该页面'));
const packName = computed(() => String(route.query.packName || ''));
const currentPackId = computed(() => String(route.query.pack || ''));

/* 已启用的包 → 各自第一个可落地页；空包（全关）给可解释提示而不是空白。 */
const entries = computed(() => ui.activePacks
  .map(pack => ({ pack, page: ui.firstRoute(pack.id) }))
  .filter((e): e is { pack: typeof e.pack; page: NonNullable<typeof e.page> } => !!e.page));

function go(path: string) {
  void router.push(path);
}
</script>

<style scoped>
.mod-off {
  min-height: 100%;
  display: flex; align-items: center; justify-content: center;
  padding: var(--sp-6) var(--sp-4);
}
.mod-off-card {
  width: min(560px, 100%);
  padding: var(--sp-6);
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-3);
}
.mod-off-ic {
  width: 46px; height: 46px; border-radius: var(--r-m);
  display: flex; align-items: center; justify-content: center;
  color: var(--ac-hi); background: var(--ac-soft); border: 1px solid var(--ac-line);
}
.mod-off-kicker {
  font-size: var(--fs-xs); letter-spacing: .08em; text-transform: uppercase;
  color: var(--tx2);
}
.mod-off-title { margin: 0; font-size: var(--fs-xl); font-weight: 650; color: var(--tx0); }
.mod-off-desc { margin: 0; color: var(--tx1); line-height: 1.7; }
.mod-off-desc b { color: var(--tx0); }
.mod-off-actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-1); }
.mod-off-empty { margin: 0; color: var(--warn); line-height: 1.6; }
.mod-off-hint {
  margin: var(--sp-2) 0 0; padding-top: var(--sp-3);
  border-top: 1px solid var(--line);
  font-size: var(--fs-xs); color: var(--tx2); line-height: 1.7;
}
.mod-off-hint code, .mod-off-empty code {
  font-size: var(--fs-xs); padding: 1px 5px; border-radius: var(--r-s);
  background: var(--bg2); color: var(--tx1);
}
</style>
