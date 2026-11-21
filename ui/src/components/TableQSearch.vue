<!-- RT/QRT 双内核「searchable 内建搜索框」同构段合并片段组件（ W3，
 单根 span 无 fragment 规避 T39）。类名经 qCls prop 注入（rt-/qrt- 前缀串）；
 双绑走 update:kw（宿主 searchableKw 既有 ref 契约不变——输入驱动 quickFilter 过滤链、
 Esc 清词语义等值平移）。缺省 searchable=false 整块不渲染（零增量口径不变）。
 ⚠DOM 逐字节保真：结构/文案/aria 与两内核原模板零变动（546 行为锁零改锚）。
 ·单框双效：新增 enter 定向转 emit（SFB 547 同约定——Enter 不走根冒泡，
 宿主接 @enter=桥接滚动下一命中行；DOM 零变动）。 -->
<template>
  <span v-if="on" :class="qCls">
    <Search :size="12" :class="qCls + '-ic'" />
    <input :value="kw" :class="qCls + '-inp'" placeholder="搜索结果…"
      aria-label="快速过滤：跨可见列包含匹配" @input="$emit('update:kw', ($event.target as HTMLInputElement).value)" @keydown.esc.prevent="$emit('update:kw', '')" @keydown.enter.prevent="$emit('enter')" />
  </span>
</template>

<script setup lang="ts">
import { Search } from 'lucide-vue-next';

defineProps<{
  /* 类名注入：'rt-qsearch' / 'qrt-qsearch'（-ic/-inp 派生类同系拼接） */
  qCls: string;
  /* 是否渲染（原 v-if="searchable" 真值语义直传） */
  on?: boolean;
  /* 双绑词（宿主 searchableKw） */
  kw: string;
}>();

defineEmits<{ (e: 'update:kw', v: string): void; (e: 'enter'): void }>();
</script>

<!-- 样式为何不 scoped：同 TableAggFoot（片段元素无宿主 scopeId）。.rt/.qrt-qsearch 系
 全站仅本组件使用（两内核 scoped 原规则同步更新出退役），全局单一出处零泄漏。
 searchFilterBar547「rt-qsearch 异形豁免」锚同步更新读本文件。 -->
<style>
/* W3：searchable 内建搜索框（工具行同档高度，与 .btn.sm 同排对齐）
 根 span min-width:0=收缩使能（554 收缩序里原恒 160px 固宽不让位，
 左簇计数条 ellipsis 缓冲被独吸到近零）；-inp min-width 90px 地板=placeholder
 「搜索结果…」可读下限，挤压时快滤框至多让位 70px 后保形 */
.qrt-qsearch, .rt-qsearch { position: relative; display: inline-flex; align-items: center; min-width: 0; }
.qrt-qsearch-ic, .rt-qsearch-ic { position: absolute; left: var(--sp-2); color: var(--tx2); pointer-events: none; }
.qrt-qsearch-inp, .rt-qsearch-inp { width: 160px; min-width: 90px; padding: var(--sp-1) var(--sp-2) var(--sp-1) var(--sp-5); border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg2); color: var(--tx0); font-size: var(--fs-xs); font-family: var(--font); outline: none; }
/* 1150：收缩时输入框必须跟着容器一起缩——此前 span 让位到 90px、input 仍按 160px
 画，溢出段直接压到「刷新/导出」上（1148 实测 49px 压盖，正是用户说的按钮文案遮挡）。
 口径=地板宽放在 span 上（input 取容器宽），span 到哪 input 就到哪，不再互相越界。 */
/* 1166：地板 160→90 常驻（不再只在 ≤1280 档）。
 实测 1440 宽档：左簇只超出 15px，而唯一能缩的是 rt-info——命中数被压成
 「1/1 ·…」（scrollWidth 65 / 宽 50）。命中数是这条带子的主信息，快滤框的
 placeholder 是空态装饰：让位顺序必须反过来。地板 90px 仍是 placeholder
 「搜索结果…」的可读下限（1150 结论不变，只是不再分档）。 */
/* 1331：basis 从 auto(160px) 改成 90px 地板——换行决策用的是 hypothetical main size，
 收缩要等成行之后才发生。basis=auto 时这条带子先按 160px 排，放不下就直接换行，
 1166 想要的「快滤框先让位」在换行这一步根本不参与（实测 1100 档：工具行 68px 两行，
 把 basis 降到 90 后回到 41px 单行，框宽 98px 仍在地板之上）。max-width 保住宽档原宽，
 1440/1200 实测仍是 160px 零变化；1060 以下仍换行（1146 兜底不变）。 */
.qrt-qsearch, .rt-qsearch { flex: 1 1 90px; min-width: 90px; max-width: 160px; }
.qrt-qsearch-inp, .rt-qsearch-inp { flex: 1 1 auto; width: 100%; min-width: 0; max-width: 160px; }
.qrt-qsearch-inp:focus, .rt-qsearch-inp:focus { border-color: var(--ac-line); }
.qrt-qsearch-inp::placeholder, .rt-qsearch-inp::placeholder { color: var(--tx2); }
</style>
