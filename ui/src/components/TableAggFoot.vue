<!-- RT/QRT 双内核「聚合 footer 行」同构段合并片段组件（TableShell 
 「同文件多组件」范式的单文件版：单根 tfoot，无 fragment 规避 T39）。
 类名经 prefix prop 注入（'rt' / 'qrt'）——守卫与 534/源码锁锚 rt-/qrt- 字面，
 串由调用方传参保住单一出处；差异位全参数化：RT 多 chk/act 两个占位 cell（prefix==='rt'
 渲染分支），列源 QRT=shownCols / RT=visibleCols → cols prop。
 ⚠DOM 逐字节保真：类名/结构/渲染条件与两内核原模板零变动（wave535/538/551/552/554
 contains 行为锁零改锚）。 -->
<template>
  <tfoot>
    <tr :class="prefix + '-agg-row'">
      <td v-if="prefix === 'rt'" :class="prefix + '-chk'" aria-hidden="true"></td>
      <td :class="prefix + '-idx'" aria-hidden="true">Σ<span v-if="selHint" :class="prefix + '-agg-sel'">{{ selHint }}</span></td>
      <td v-for="c in cols" :key="c" :class="[prefix + '-agg-cell mono', { [prefix + '-col-frozen']: frozenOf(c), 'num-col': !!foot?.[c] }]"
          :style="styleOf ? styleOf(c) : undefined">
        <!-- 补 min~max 小字（AggNum 四值 起即齐算，此前只印 Σ/avg）——
 追加段在既有「Σ … · avg …」之后（diagTableAgg:96 等行为锁 contains 断言前缀不动）
 再 append count 档（AggNum.count 非空值计数，agg-cnt 小字同款
 append-only，前缀 contains 锁仍兼容）
 末尾 append 迷你走势（SparkLine ≥2 点才画；spark 与 foot
 同守卫，显式非语义/非数值列天然不出）
 append「· med」档（statsOf().median 数值中位，AggNum.median 注入；
 append-only——「Σ … · avg …」前缀 contains 锁兼容，既有段零触碰）
 append「· 空值率 N%」档（emptyPct 从 statsOf().emptyRate 另取
 ——numericOfCount 装配 return 行 538 源码锁逐字禁动，不塞装配层；foot 在场=
 数值列口径与非语义守卫一致，Math.round 与 ColDetailModal.emptyRatePct 同源；
 append-only）
 append 值分布 8 桶 mini-bar 档（dist 可选 prop——缺省不传零渲染，
 QRT/RT 既有接线 DOM 零变化；数据面 useColStats.statsOf(col).dist 经 useAggRow
 aggDist 注入，utils/distBins 单源与 ColDetailModal 分布段同语汇） -->
        <template v-if="foot?.[c]">Σ {{ fmtNum(foot[c].sum) }} · avg {{ foot[c].avg.toFixed(2) }}<span :class="prefix + '-agg-mm'"> · min {{ fmtNum(foot[c].min) }} · max {{ fmtNum(foot[c].max) }}</span><span :class="prefix + '-agg-cnt'"> · count {{ fmtNum(foot[c].count) }}</span><span :class="prefix + '-agg-med'"> · med {{ fmtNum(foot[c].median) }}</span><span :class="prefix + '-agg-empty'"> · 空值率 {{ emptyPct[c] }}%</span><span :class="prefix + '-agg-spark'"><SparkLine v-if="(spark?.[c]?.length ?? 0) >= 2" :data="spark?.[c] ?? []" :w="72" :h="14" /></span><span v-if="binsOf(c).length" :class="prefix + '-agg-dist'" aria-hidden="true"><i v-for="(b, bi) in binsOf(c)" :key="bi" :title="`${b.from}~${b.to}: ${b.count}`" :style="{ height: distH(c, b.count) }"></i></span></template>
      </td>
      <td v-if="prefix === 'rt'" :class="prefix + '-act'" aria-hidden="true"></td>
    </tr>
  </tfoot>
</template>

<script setup lang="ts">
import SparkLine from './SparkLine.vue';
import { fmtNum } from '../utils/format';
import type { AggNum } from '../composables/useAggRow';
import type { DistBin } from '../utils/distBins';

const props = defineProps<{
  /* 双内核类名前缀：'rt' / 'qrt'（agg-row/idx/agg-cell/col-frozen/chk/act/agg-mm… 全系拼接） */
  prefix: string;
  /* 循环列源：QRT=shownCols、RT=visibleCols */
  cols: string[];
  /* useAggRow 装配产物（原 aggFoot/aggSpark/aggEmptyPct 直传） */
  foot: Record<string, AggNum> | null;
  spark: Record<string, number[]> | null;
  emptyPct: Record<string, number>;
  /* 冻结列判定：QRT=prefsOn && isFrozenCol(c)、RT=isFrozenCol(c)（原绑定位门控随参收口） */
  frozenOf: (c: string) => boolean;
  /* 冻结列内联 style：QRT=prefsOn ? frozenStyle(c) : undefined、RT=frozenStyle(c) */
  styleOf?: (c: string) => Record<string, string> | undefined;
  /* 数值列值分布 8 桶（可选——useAggRow.aggDist 直传；缺省不传零渲染，
 QRT/RT 既有接线 DOM 零变化；数据源 utils/distBins 单源与 ColDetailModal 分布段同源） */
  dist?: Record<string, { bins: DistBin[] } | null> | null;
  /* 行选聚合口径徽标（可选——「选中 N 行」/「选中 K/N 行」，两内核
 aggSelHint 直传；缺省不传零渲染=562 缺省零增量纪律，无选中恒 null 同零渲染） */
  selHint?: string | null;
}>();

/* dist mini-bar 视图档——binsOf 该列桶集（未传/null 列→空集零渲染）；
 distH 桶高归一（count/该列最大桶 count 取整 %，与 ColDetailModal.distBarH 同口径） */
const binsOf = (c: string) => props.dist?.[c]?.bins ?? [];
const distH = (c: string, n: number) => {
  const bins = binsOf(c);
  const max = Math.max(1, ...bins.map(b => b.count));
  return Math.round((n / max) * 100) + '%';
};
</script>

<!-- 样式为何不 scoped：本组件模板元素无宿主内核 scopeId，内核 scoped 规则（含
 .qrt-tbl td 通用面与 td.*-col-frozen sticky）打不中——TableShell .rt-expand 先例同款，
 全局单一出处=纯去重零泄漏（*-agg-row 系类名全站唯二内核使用）。
 RT 侧规则原字面随块平移（wave538:锚同字面）。 -->
<style>
/* RT 侧（原 ResultTable scoped 迁出，字面保形） */
.rt-agg-row td { background: var(--bg2); border-top: 1px solid var(--line-strong); font-size: var(--fs-xs); padding: var(--sp-1) var(--sp-2); white-space: nowrap; }
/* QRT 侧（原 QueryResultTable scoped 迁出）——td 通用面（原 .qrt-tbl th/.qrt-tbl td 规则
 对迁出 td 失效的补齐：padding/border-bottom/text-align 同值）随 agg 覆盖合并单条 */
.qrt-agg-row td { background: var(--bg2); border-top: 1px solid var(--line-strong); white-space: nowrap; padding: var(--sp-1) var(--sp-2); border-bottom: 1px solid var(--line); text-align: left; }
/* 行高三档联动（原 .qrt-tbl.dense/.cozy td 规则对迁出 td 失效的补齐；RT 侧 dense/cozy
 系 :deep 规则 .rt.dense .rt-tbl[data-v] td 仍命中，无需补） */
.qrt-tbl.dense .qrt-agg-row td { padding-top: var(--sp-0); padding-bottom: var(--sp-0); }
.qrt-tbl.cozy .qrt-agg-row td { padding-top: var(--sp-3); padding-bottom: var(--sp-3); }
/* 聚合行 min~max 小字（次级文字档，弱于 Σ/avg 主口径） */
.qrt-agg-mm, .rt-agg-mm { color: var(--tx2); }
/* 行选聚合口径徽标（Σ 旁品牌青小字——数字变档的可感知解释位；
 --sp-1h 阶梯与同格 spark 间距同档） */
.qrt-agg-sel, .rt-agg-sel { margin-left: var(--sp-1h); color: var(--acc); }
/* 聚合行迷你走势（内联弹性 shrink:0，不挤 Σ/avg 主口径） */
.qrt-agg-spark, .rt-agg-spark { display: inline-block; vertical-align: middle; margin-left: var(--sp-2h); flex-shrink: 0; }
/* 数值列聚合行值分布 8 桶 mini-bar（ColDetailModal 分布段同语汇——最高桶满高/
 零值桶零高/var(--acc)；14px 档与同格 spark 同尺度不另起高度语义；桶条 flex 均分、
 1px 缝为微型内衬豁免档；缺省 dist 不传零渲染——562 缺省零增量纪律） */
.qrt-agg-dist, .rt-agg-dist { display: inline-flex; align-items: flex-end; gap: 1px; width: 56px; height: 14px; vertical-align: middle; margin-left: var(--sp-2h); flex-shrink: 0; }
.qrt-agg-dist i, .rt-agg-dist i { flex: 1 1 0; min-width: 0; background: var(--acc); opacity: .55; }
/* 冻结列 sticky（原内核 td.*-col-frozen 规则对迁出 td 失效的补齐；背景档序与内核一致：
 冻结 bg 压过 agg-row 的 bg2；hover/sel/focus 覆盖系 tbody 专属不涉 tfoot） */
.qrt-agg-row td.qrt-col-frozen, .rt-agg-row td.rt-col-frozen { position: sticky; z-index: 3; box-shadow: inset -1px 0 0 var(--line-strong); background: var(--bg1); }
/* 横向滚动态冻结缘投影（原内核 is-hscrolled 规则对迁出 td 失效的补齐，投影值同源） */
.qrt.is-hscrolled .qrt-agg-row td.qrt-col-frozen { box-shadow: inset -1px 0 0 var(--line-strong), 8px 0 10px -6px rgba(0, 0, 0, .38); }
.rt.is-hscrolled .rt-agg-row td.rt-col-frozen { box-shadow: inset -1px 0 0 var(--line-strong), 8px 0 10px -6px rgba(15, 23, 42, .16); }
</style>
