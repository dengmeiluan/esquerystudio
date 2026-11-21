<template>
  <!-- 页头过滤胶囊统一件——三处同场景（wt-search-head/fv-search/tg-search）
 三份手写同构合并一处。根元素 v-bind="$attrs"（inheritAttrs 关闭显式透传）：
 class 落位类（wt-search-head/fv-search/tg-search）透传到根，视图 scoped 样式
 （flex:1/margin-left:auto/gap/padding 等落位与内衬）照常命中，layout 归视图零漂移；
 胶囊壳三件套（panel 底+border-subtle 弱边+8px 圆角）归本组件单源——tg 值漂移
 （bg1/line/6px）随合并归一（searchFilterBar547 锁）。
 Enter 走 input 定向 emit('enter')（不走根冒泡：插槽里 HitNav 按钮的键击不误触）；
 Esc 清空内建（update:modelValue('')，三消费方原 @keydown.esc.prevent="kw = ''" 行为等价；
 filterEscClear379 守卫口径同步更新）。异形不收（豁免）：IndexHub .ih-search（Esc 两级
 语义）/SideNav .nav-search/ResultTable .rt-qsearch。⚠：.bw-search 异形
 豁免由 第 16 胞改用约定推翻（unifyWave561 锁），IndexHub docs/query tab 同步
 改用让位（共享树并行 lane 在途域）。 -->
  <div class="sfb" v-bind="$attrs">
    <Search :size="12" />
    <input
      class="sfb-i"
      :class="inputClass"
      :value="modelValue"
      :placeholder="placeholder"
      :aria-label="placeholder"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keydown.enter.prevent="$emit('enter', $event)"
      @keydown.esc.prevent="$emit('update:modelValue', '')"
    />
    <slot />
  </div>
</template>

<script setup lang="ts">
import { Search } from 'lucide-vue-next';

defineOptions({ inheritAttrs: false });

withDefaults(defineProps<{
  modelValue: string;        /* v-model 过滤词 */
  placeholder: string;       /* 兼作 aria-label（裸输入框可读性） */
  inputClass?: string;       /* 透传到 input（保留原 input 类名锚：wt-search-i/fv-search-i） */
}>(), { inputClass: '' });

defineEmits<{
  (e: 'update:modelValue', v: string): void;
  (e: 'enter', ev: KeyboardEvent): void;   /* Enter 定向转出（HitNav 接线在视图侧不变） */
}>();
</script>

<style scoped>
/* 胶囊壳三件套单源（wt/fv 同值统一；tg 漂移 bg1/line/6px 归一）。
 gap/padding 不在此处——落位类在视图侧（「padding 对齐现行」，高度结构语义零变动） */
.sfb { display: flex; align-items: center; background: var(--panel); border: 1px solid var(--border-subtle); border-radius: var(--r-m); }
/* 裸输入形态内建（原 wt-search-i/fv-search-i 同值单源：flex:1 收缩 + 透明无边框 + 继承字） */
.sfb-i { flex: 1; min-width: 0; background: transparent; border: 0; outline: 0; color: var(--text); font: inherit; }
</style>
