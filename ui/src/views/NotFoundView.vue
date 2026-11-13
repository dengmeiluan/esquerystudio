<template>
  <div class="page nf-page">
    <div class="nf-card">
      <Compass :size="40" class="nf-ic" />
      <div class="nf-code mono">404</div>
      <div class="nf-title">页面不存在</div>
      <div class="nf-path mono">{{ route.fullPath }}</div>
      <!-- 未匹配路由不再静默空白——给相近路由猜测，输错一两个字符也能一键到达 -->
      <div v-if="guesses.length" class="nf-guess">
        <div class="nf-guess-t">你是不是想去：</div>
        <button v-for="g in guesses" :key="g.path" class="btn ghost sm" @click="router.push(g.path)">
          {{ g.name }} <span class="mono nf-guess-p">{{ g.path }}</span>
        </button>
      </div>
      <div class="nf-actions">
        <button class="btn" @click="router.push('/overview')"><Home :size="13" /> 回到概览</button>
        <button class="btn ghost" @click="router.back()"><ArrowLeft :size="13" /> 返回上一页</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Compass, Home, ArrowLeft } from 'lucide-vue-next';
import { NAV_ITEMS } from '../router';
import { useUiConfigStore } from '../stores/uiConfig';

const route = useRoute();
const router = useRouter();
const ui = useUiConfigStore();

/* 简易相近度：路径子串互含或去掉分隔符后的编辑距离 ≤2，最多给 3 个候选 */
const guesses = computed(() => {
  const raw = String(route.params.pathMatch || route.path).replace(/^\/+/, '').toLowerCase();
  if (!raw) return [];
  const scored = NAV_ITEMS.filter(n => ui.pageEnabled(n.pageKey)).map(n => {
    const p = n.path.slice(1).toLowerCase();
    let score = Infinity;
    // 子串包含是最强信号（/xray → /query-xray），永远优于编辑距离命中
    if (p.includes(raw) || raw.includes(p)) score = 0;
    else score = editDistance(raw, p);
    return { ...n, score };
  }).filter(x => x.score <= 3).sort((a, b) => a.score - b.score);
  return scored.slice(0, 3);
});

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
</script>

<style scoped>
/* W8：视口口径合并 --vh-offset（标准偏移 210px）；404 页无顶栏工具条，回补 delta 90px（等价旧值 120px） */
.nf-page { display: flex; align-items: center; justify-content: center; min-height: calc(100vh - var(--vh-offset) + 90px); }
/* 空态/留白契约：padding 走全站空态契约 34px（theme.css .empty 注释明令），不再用大留白档。
 16px 收 --sp-4（34px 契约值保字面；/551 锚同步更新） */
.nf-card { text-align: center; padding: 34px var(--sp-4); max-width: 480px; }
.nf-ic { color: var(--tx2); opacity: .5; }
/* 44px 归展示数字三档 --fs-num-xl（数字档消费守卫=650+mono+tabular-nums，mono 由模板 .mono 挂）；
 letter-spacing: 4px 为 404 展示字刻意宽距豁免保字面（px 级字距族不入 --ls em 梯） */
.nf-code { font-size: var(--fs-num-xl); font-weight: 650; color: var(--tx2); letter-spacing: 4px; margin-top: var(--sp-1); font-variant-numeric: tabular-nums; }
/* 15px 归档裁决：nf-title 是 404 卡内主文案（视觉权重介于小标题与页头之间），
 取 --fs-xl（16px）页头/主标题档——它与 .nf-code 44px 构成「主数字+主文案」两级，
 若取 --fs-lg(14px) 会被下方 .nf-path(--fs-sm 12px) 淹没层级差不足 */
.nf-title { font-size: var(--fs-xl); font-weight: 600; margin-top: var(--sp-0); }
.nf-path { font-size: var(--fs-sm); color: var(--tx2); margin-top: var(--sp-1h); word-break: normal; overflow-wrap: anywhere; }
.nf-guess { margin-top: 18px; display: flex; flex-direction: column; gap: var(--sp-1h); align-items: center; }
.nf-guess-t { font-size: var(--fs-sm); color: var(--tx2); }
.nf-guess-p { font-size: var(--fs-xs); color: var(--tx2); margin-left: var(--sp-1); }
.nf-actions { margin-top: 22px; display: flex; gap: var(--sp-2); justify-content: center; }
</style>
