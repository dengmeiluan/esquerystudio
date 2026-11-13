<template>
  <!-- 统一 inline 元信息串（IndexHubView .ih-meta 同款范式合并）：
 值亮(b tabular-nums)+单位弱化+标签暗(i)，· 分隔，flex-wrap 窄屏换行，tip 走 :title 兜底。
 tone 走语义 token 色；to 可选点击跳转（键盘可达：role=link + Enter）。默认插槽承接自定义段，
 起其前自动补段间分隔（消费方手写 ih-meta-sep/dg-slot-sep/tv-meta-ksep 等随之退役）。 -->
  <div class="ms">
    <template v-for="(it, i) in items" :key="i">
      <span v-if="i" class="ms-sep" aria-hidden="true">·</span>
      <!-- text 段：无值/标签的暗色纯文本（DiagView dg-sub 副行类描述并入同一条时承接），
 不参与 link/help 交互语义 -->
      <span v-if="it.text" class="ms-i ms-t">{{ it.text }}</span>
      <span
        v-else
        class="ms-i" :class="{ link: !!it.to, help: !it.to && !!it.tip }" :title="it.tip || undefined"
        :role="it.to ? 'link' : undefined" :tabindex="it.to ? 0 : undefined"
        @click="it.to && go(it)" @keydown.enter.prevent="it.to && go(it)"
      >
        <!-- dot：值前状态圆点（色值直传）——冗余色标，状态不只靠 tone 文本色分辨（DiagView 集群状态） -->
        <span v-if="it.dot" class="ms-dot" :style="{ background: it.dot }" aria-hidden="true"></span>
        <b :class="it.tone ? 'ms-' + it.tone : undefined">{{ it.value }}</b><span v-if="it.unit" class="ms-unit">{{ it.unit }}</span> <i v-if="it.label">{{ it.label }}</i>
      </span>
    </template>
    <!-- 默认插槽前自动渲染段间分隔。与 items 段间分隔同语义（分隔只出现在段与段之间）：
 items 为空时插槽即首段，不带前导「·」，防头部悬挂点。组件全量核实仅此一个默认插槽 -->
    <span v-if="items.length && $slots.default" class="ms-sep" aria-hidden="true">·</span>
    <slot />
  </div>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';
import { useRouter } from 'vue-router';

export interface MetaStripItem {
  /** 标签（值后的暗色说明，可含括号副文案；缺省只渲染值） */
  label?: string;
  /** 主值（加粗亮色）；text 纯文本段时省略（二者的互斥契约见 text） */
  value?: string | number;
  /** 值后独立弱化单位（如 %、GB——规则 B 数字单一语言） */
  unit?: string;
  /** 值语义色档 */
  tone?: 'ok' | 'warn' | 'err' | 'info';
  /** 全量文本兜底（title；有 tip 无 to 时 cursor:help） */
  tip?: string;
  /** 可选点击跳转（键盘 Enter 同路） */
  to?: RouteLocationRaw;
  /** 值前状态圆点（CSS 色值直传，如 clusterColor）——色盲不只靠 tone 文本色分辨的冗余色标 */
  dot?: string;
  /**
 * 纯文本段（暗色、无值/标签包装）。仅当本段不是「值对」而是描述行（如卡头副标题）
 * 时使用，与同条 items 共用分隔节奏；与 value/label 互斥，取 text 时其余字段不渲染
 */
  text?: string;
}

defineProps<{ items: MetaStripItem[] }>();

const router = useRouter();
function go(it: MetaStripItem) {
  if (it.to) void router.push(it.to);
}
</script>

<style scoped>
/* （台账 G'2）：窄档两行换行补行距节奏——row-gap 走 --sp-2；
 列距 7px 刻意紧凑值保字面（651「精确等值才收」同律），单行渲染零变化 */
.ms { display: flex; align-items: center; gap: var(--sp-2) 7px; flex-wrap: wrap; font-size: var(--fs-xs); font-family: var(--mono); color: var(--tx1); min-width: 0; }
.ms b { color: var(--tx0); font-weight: 600; font-variant-numeric: tabular-nums; }
.ms b.ms-ok { color: var(--ok); }
.ms b.ms-warn { color: var(--warn); }
.ms b.ms-err { color: var(--err); }
.ms b.ms-info { color: var(--info); }
.ms i { font-style: normal; color: var(--tx2); font-size: var(--fs-xs); }
/* 值后独立弱化单位（数值 b 之外单列） */
.ms-unit { color: var(--tx2); font-size: var(--fs-xs); }
.ms-sep { color: var(--tx2); opacity: .45; }
.ms-i { display: inline-flex; align-items: baseline; gap: var(--sp-1); }
.ms-i.help { cursor: help; }
.ms-i.link { cursor: pointer; }
.ms-i.link:hover b { text-decoration: underline; }
.ms-t { color: var(--tx2); }
/* Lead 收尾：插槽段（消费方挂 ms-i/ms-t，如 took 徽标段）——scoped 规则不命中插槽内容，:slotted 承接 */
.ms :slotted(.ms-i) { display: inline-flex; align-items: baseline; gap: var(--sp-1); }
.ms :slotted(.ms-i i) { font-style: normal; color: var(--tx2); font-size: var(--fs-xs); }
.ms :slotted(.ms-t) { color: var(--tx2); }
.ms-dot { width: 8px; height: 8px; border-radius: 50%; align-self: center; flex-shrink: 0; }
</style>
