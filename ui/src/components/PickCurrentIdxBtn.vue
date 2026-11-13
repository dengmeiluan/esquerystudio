<template>
  <!-- 「用当前索引」一键回填统一件（兑现）——写类视图
 IndexPicker 旁的内联小钮合并（AdhocRebuildView 首个消费，其余四写类视图由后续批
 按同一契约改用）。自读 store（pickedIdx），空索引整钮不渲染（根 v-if，与内联钮
 逐字等价）；点击只 emit('pick')，回填语义归消费方（各页回填目标不同，组件不猜）。 -->
  <button v-if="store.pickedIdx" type="button" class="btn ghost sm" data-test="use-current-idx"
          :title="'用当前索引：' + store.pickedIdx + '（覆盖当前输入）'" aria-label="用当前索引：填入顶栏选中的索引"
          @click="emit('pick')"><Crosshair :size="13" /></button>
</template>

<script setup lang="ts">
/* 无 props 自读 store（CurrentIdxChip 同消费形态）；data-test/title/aria-label 与
 五写类视图既有内联钮逐字一致——消费方 spec 若锚字面由组件保真透传。 */
import { Crosshair } from 'lucide-vue-next';
import { useAppStore } from '../stores/app';

const store = useAppStore();
const emit = defineEmits<{ (e: 'pick'): void }>();
</script>
