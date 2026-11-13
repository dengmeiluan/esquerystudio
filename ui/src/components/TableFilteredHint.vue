<!-- RT/QRT 双内核「筛选态提示 span」同构段合并片段组件（169/230/
 暗状态可见性+组合档切换钮，单根 span 无 fragment 规避 T39）。
 类名经 props 注入（rt-/qrt- 前缀串）；行数档两内核行源不同（QRT filteredRows/rawRows、
 RT filteredHits/hits）→ shown/total props；动作双 emit（toggle-mode/clear）。
 ⚠DOM 逐字节保真：结构/文案/渲染条件与两内核原模板零变动（534 fmode 双注入位与
 554 单行纪律锁同步更新读本文件）。 -->
<template>
  <span v-if="active" :class="spanCls"
        title="仅筛选当前结果集（前端内存），不修改查询；要改查询条件请用单元格菜单「加入查询条件并重查」">
  已筛选 {{ active }} 列 · {{ shown }}/{{ total }} 行
  <button :class="fmodeCls" :aria-label="'筛选组合档：' + mode + '（点击切换）'"
    :title="'多列筛选组合：' + mode + '（点击切换为 ' + (mode === 'AND' ? 'OR 任一列命中' : 'AND 全部命中') + '）'"
    @click="$emit('toggle-mode')">{{ mode }}</button>
  <button :class="clearCls" aria-label="清除全部筛选" title="清除全部筛选" @click="$emit('clear')">✕</button>
  </span>
</template>

<script setup lang="ts">
/* mode 改可选（缺省 'AND' 向后兼容）——未传档位的调用方不破渲染
 （561 双内核接线恒传，行为不变）；其余 prop 维持既有形态。 */
withDefaults(defineProps<{
  /* 类名注入：'rt-filtered mono' / 'qrt-filtered mono'；fmode/clear 同系 */
  spanCls: string;
  fmodeCls: string;
  clearCls: string;
  /* 行数档：QRT=filteredRows.length/rawRows.length、RT=filteredHits.length/hits.length */
  active: number;
  shown: number;
  total: number;
  /* 组合档运行态（useFilterMode.filterModeLive 直传；缺省 'AND'） */
  mode?: 'AND' | 'OR';
}>(), { mode: 'AND' });

defineEmits<{ (e: 'toggle-mode'): void; (e: 'clear'): void }>();
</script>

<!-- 样式为何不 scoped：同 TableAggFoot（片段元素无宿主 scopeId，内核 scoped 打不中）。
 工蚁1「防折行 nowrap 纪律」规则原字面随块平移（wave554:321-锚）。
 ⚠两内核原值微差有意保留（rt-filtered=文本 inline 流 fs-xs、qrt-filtered=inline-flex
 fs-2xs；clear 色档/padding 各按原档）——合并只去重不统一视觉。
 -fmode 系规则内核侧仍在（两内核筛选弹层槽第二注入位使用），此处为提示行位同款复制
 （双址互锚，值变更须同步两内核 scoped 与本处）。 -->
<style>
/* QRT 侧（原 QueryResultTable scoped 迁出；554 工蚁1 nowrap 约定） */
.qrt-filtered { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-2xs); color: var(--info); white-space: nowrap; }
.qrt-filtered-clear { border: 0; background: transparent; color: var(--info); cursor: pointer; font-size: var(--fs-2xs); padding: 0 var(--sp-0); }
/* RT 侧（原 ResultTable scoped 迁出；554 nowrap 约定——条件渲染元素缺省态不存在） */
.rt-filtered { font-size: var(--fs-xs); color: var(--info); white-space: nowrap; }
.rt-filtered-clear { border: 0; background: none; color: var(--tx2); cursor: pointer; padding: 0 3px; }
.rt-filtered-clear:hover { color: var(--err); }
/* W3：筛选组合档切换钮（提示行/筛选弹层共用，AND/OR 就地翻转；双内核同值） */
.qrt-fmode, .rt-fmode { border: 1px solid var(--line); background: transparent; color: var(--info); cursor: pointer; font-size: var(--fs-2xs); border-radius: 3px; padding: 0 var(--sp-1); line-height: 1.4; }
.qrt-fmode:hover, .rt-fmode:hover { border-color: var(--info); }
</style>
