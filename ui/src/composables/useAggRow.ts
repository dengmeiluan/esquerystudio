import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';
import type { DistBin } from '../utils/distBins';
import { writeStoredRaw } from '../utils/safeJson';

/* ═══ W-A：TableShell 第二刀——双内核「聚合 footer 行」开关与 Σ/avg 底行单一出处 ═══
 QRT（≡ RT（逐字同构段抽取；唯一差=列源（QRT shownCols vs RT visibleCols）
 → 参数 renderCols；RT tfoot 的 chk/act 两个占位 cell 留各自模板。行为零变化：
 开关键空间 es_tbl_agg:<dim>、落盘仅记忆维度（无 dimension 仅内存态=SQL 通道零增量）、
 Σ/avg 由调用方注入 statsOf 数值口径（两内核同为 useColStats.statsOf().numeric）。
 diagTableAgg/healthTablesGraft 挂载级行为锁（tfoot 渲染/落盘/重挂恢复）零改锚。 */

export interface AggNum { sum: number; avg: number; min: number; max: number;
  /** 非空值计数档（可选——useColStats.statsOf().count 注入，调用方组装；
 可选形态保 tableShellSecondCut528 的四值字面构造与 toEqual 形状锁零触碰） */
  count?: number;
  /** 数值中位数档（可选——useColStats.statsOf().median 注入，调用方组装；
 可选形态同 count 先例，双内核 tfoot「· med x」append 档消费） */
  median?: number }

/* 落盘键前缀（useTablePrefs 键体系旁，沿用其读写范式）；无维度（SQL 通道）不落盘 */
function readAggPref(d: string | null): boolean {
  if (!d) return false;
  return localStorage.getItem('es_tbl_agg:' + d) === '1';
}

export function useAggRow(
  dimension: Ref<string | null> | ComputedRef<string | null>,
  renderCols: () => string[],
  numericOf: (col: string) => AggNum | null | undefined,
  /* 迷你走势数据源（可选——不传恒 null，既有三参调用形态零触碰） */
  seriesOf?: (col: string) => number[] | null,
  /* 值分布数据源（可选第 5 参——同 seriesOf 先例，既有四参调用形态零触碰；
 推荐 useColStats.statsOf(col).dist 直连（utils/distBins 单源；守卫列天然 null 不出），
 TableAggFoot dist prop（可选，缺省零渲染）消费，接线下批 */
  distOf?: (col: string) => { bins: DistBin[] } | null,
) {
  const aggOn = ref(readAggPref(dimension.value));
  watch(dimension, (d) => { aggOn.value = readAggPref(d); });
  function toggleAggRow() {
    aggOn.value = !aggOn.value;
    if (dimension.value) writeStoredRaw(localStorage, 'es_tbl_agg:' + dimension.value, aggOn.value ? '1' : '0');
  }
  /* 数值列 Σ/avg 底行数据（列=renderCols 所见即所聚合，与列详情弹窗同一数字） */
  const aggFoot = computed<Record<string, AggNum> | null>(() => {
    if (!aggOn.value) return null;
    const out: Record<string, AggNum> = {};
    for (const c of renderCols()) {
      const n = numericOf(c);
      if (n) out[c] = n;
    }
    return out;
  });
  /* 数值列迷你走势数据（与 aggFoot 同列源同开关同 computed 守卫——
 aggOn 关闭恒 null 零求值；未注入 seriesOf 恒 null；可见性由模板 ≥2 点门槛把关） */
  const aggSpark = computed<Record<string, number[]> | null>(() => {
    if (!aggOn.value || !seriesOf) return null;
    const out: Record<string, number[]> = {};
    for (const c of renderCols()) {
      const s = seriesOf(c);
      if (s && s.length) out[c] = s;
    }
    return out;
  });
  /* 数值列值分布 mini-bar 数据（aggSpark 同构——aggOn 关闭恒 null 零求值；
 未注入 distOf 恒 null；null/空 bins 不出，可见性由模板侧把关） */
  const aggDist = computed<Record<string, { bins: DistBin[] }> | null>(() => {
    if (!aggOn.value || !distOf) return null;
    const out: Record<string, { bins: DistBin[] }> = {};
    for (const c of renderCols()) {
      const d = distOf(c);
      if (d && d.bins.length) out[c] = d;
    }
    return out;
  });
  return { aggOn, toggleAggRow, aggFoot, aggSpark, aggDist };
}
