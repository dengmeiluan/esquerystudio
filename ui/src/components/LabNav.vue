<template>
  <!-- 相关性实验室互跳导航——六 lab 此前只能回查询工作台再经 popover
 中转；现页头内置同族切换（当前页禁用高亮，其余一键直达） -->
  <nav class="lab-nav" aria-label="相关性实验室导航">
    <button
      type="button" class="lab-nav-btn lab-home"
      title="返回查询工作台（六 lab 的入口与出口）"
      @click="router.push('/search')"
    >
      <SearchCheck :size="12" /> 查询工作台
    </button>
    <span class="lab-sep" aria-hidden="true">·</span>
    <button
      v-for="l in RELEVANCE_LABS" :key="l.path"
      type="button" class="lab-nav-btn" :class="{ on: l.path === current }"
      :disabled="l.path === current"
      :title="l.path === current ? `当前：${l.name}` : `前往${l.name}`"
      :aria-current="l.path === current ? 'page' : undefined"
      @click="l.path !== current && router.push(l.path)"
    >
      {{ l.name }}
    </button>
  </nav>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { SearchCheck } from 'lucide-vue-next';
import { RELEVANCE_LABS } from '../utils/relevanceLabs';

defineProps<{ current: string }>();
const router = useRouter();
</script>

<style scoped>
.lab-nav { display: flex; gap: var(--sp-1h); align-items: center; flex-wrap: wrap; margin-bottom: var(--sp-3); }
.lab-nav-btn {
  padding: 3px var(--sp-2h); font-size: var(--fs-xs); border: 1px solid var(--line); border-radius: 99px;
  background: var(--bg1); color: var(--tx2); cursor: pointer; transition: color var(--tr), border-color var(--tr), background var(--tr);
}
.lab-nav-btn:hover:not(:disabled), .lab-nav-btn:focus-visible { color: var(--ac); border-color: var(--ac); outline: none; }
.lab-nav-btn:focus-visible { box-shadow: var(--focus-ring); }
.lab-home { display: inline-flex; align-items: center; gap: var(--sp-1); color: var(--ac); }
.lab-sep { color: var(--tx2); opacity: .5; }
.lab-nav-btn.on { color: var(--bg1); background: var(--ac); border-color: var(--ac); font-weight: 600; cursor: default; }
</style>
