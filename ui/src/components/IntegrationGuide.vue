<template>
  <NDrawer :show="show" :width="560" :style="{ maxWidth: '94vw' }" placement="right" @update:show="v => emit('update:show', v)">
    <NDrawerContent title="接入文档" closable>
      <div class="ig-meta mono">{{ coordinate }}</div>
      <div v-for="s in tintedSections" :key="s.id" class="ig-sec">
        <div class="ig-sec-t">{{ s.title }}</div>
        <!-- W-C 批：pom/config 片段轻量着色（XML 标签=info、点分 config key=品牌青），
 内容由 tintGuide 整段转义后再包 span，未转义文本零注入 -->
        <pre class="ig-sec-b" v-html="s.html"></pre>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>

<script setup lang="ts">
/* 2.5.0 接入文档抽屉：内容来自 data/integrationGuide.ts（数据与展示分离，版本号构建期注入） */
import { computed } from 'vue';
import { NDrawer, NDrawerContent } from 'naive-ui';
import { GUIDE_SECTIONS, mavenCoordinate } from '../data/integrationGuide';
import { escapeHtml } from '../utils/highlightSanitize'; /* ：三连转义合并单源（DiagView 同步合并，语义逐字不变） */

defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>();

const sections = GUIDE_SECTIONS;
const coordinate = computed(() => mavenCoordinate());

/* W-C 批：片段轻量着色——安全口径与 DiagView 热线程/highlightJson 同规：
 先整段转义（& < >），再对已转义文本按序包受控 span。两档：
 ① XML 标签（&lt;tag&gt; / 带属性 / 自闭合）→ --info；② 点分 config key（行首 esquerystudio.elasticsearch.*:）→ --ac-hi。
 内联 style 直用 token：双主题自适应，v-html 内容拿不到 scoped 属性。
 三连转义合并 utils/highlightSanitize escapeHtml 导出单源 */
function tintGuide(src: string): string {
  const esc = escapeHtml(src);
  return esc
    .replace(/&lt;(\/?)([a-zA-Z][\w.-]*)((?:\s[^&<>]*)?\/?)&gt;/g,
      (_m, close: string, tag: string, rest: string) =>
        '<span style="color:var(--info)">&lt;' + close + tag + rest + '&gt;</span>')
    .replace(/^(\s*)([a-zA-Z][\w.-]*(?:\.[\w-]+)+)(:)/gm,
      (_m, ind: string, key: string, colon: string) =>
        ind + '<span style="color:var(--ac-hi)">' + key + '</span>' + colon);
}
const tintedSections = computed(() => sections.map(s => ({ ...s, html: tintGuide(s.body) })));
</script>

<style scoped>
.ig-meta { font-size: var(--fs-xs); color: var(--tx2); margin-bottom: var(--sp-3); user-select: all; }
.ig-sec { margin-bottom: 18px; }
.ig-sec-t { font-size: var(--fs-md); font-weight: 600; margin-bottom: var(--sp-1h); }
.ig-sec-b {
  margin: 0; padding: var(--sp-2h) var(--sp-3); font-size: var(--fs-xs); line-height: 1.7;
  font-family: var(--mono); white-space: pre-wrap; word-break: normal; overflow-wrap: anywhere;
  background: var(--code-bg); border: 1px solid var(--line); border-radius: var(--r-s);
}
</style>
