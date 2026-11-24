/* W-A：TableShell 第二刀——ES 字段类型 → 语义档纯函数单一出处
 （QRT ≡ RT 逐字同构段抽取，双内核改引；行为零变化）。
 ⚠semanticTiers500 源码锁 QRT 文件内 `const NUMERIC_TYPES_RE = /^…$/` 字面——QRT 保留
 同字面本地声明（与本院导出逐字同值），RT 已全改引本院；另一份 typeCls 副本在
 ColDetailModal.vue（不在 W-A 独占清单，留档待后续批次合并）。 */

/* 数值族类型（语义档判据：数值右对齐/千分位/区间筛选/列统计 Σ/aggFoot 数值列） */
export const NUMERIC_TYPES_RE = /^(long|integer|short|byte|double|float|half_float|scaled_float|unsigned_long)$/;

/* 显式非语义类型抑制单源——binary/nested 等无「数值/区间」语义的类型族。
 双内核守卫点短路接入（显式类型在场即更早短路，不动既有白名单短路序；
 aggSpark/aggFoot 同守卫联动——值形态硬口径之外的第二道显式标注守卫）
 扩容 8 型（point/shape/dense_vector/sparse_vector/percolator/completion/
 histogram/aggregate_metric_double）——消费点（QRT isNumericCol/isRangeCol/isContainsCol/
 colStats/numericOfCount/aggSpark、RT 对称、ColDetailModal）全走 isNonSemanticType 自动
 生效零接线。豁免：rank_feature/rank_features（数值有语义，不收）。
 并入 ip_range（1 型）——contains/sem 链已被双内核 IP_TYPE_RE
 （/^ip(_range)?$/，QRT/RT 本地字面）先行抑制，isRangeCol 对其本就 false（不在数值∪日期
 白名单），唯一行为变化=列详情 top5 对 ip_range 列藏起（值是 gte/lte 对象，无阅读意义，
 与 8 型降级同性质）。
 豁免（561 判定）：integer/long/float/double/date 五型不收——它们是 NUMERIC_TYPES_RE/
 RANGE_DATE_RE 白名单核心成员，并入将在双内核 isRangeCol/isNumericCol/aggFoot/aggSpark/
 contains 等消费点短路（数值列 Σ 聚合、区间筛选、sparkline、高频值 top5 全被抑制），
 既有行为锁成片击穿，不可小步同步更新；余下 *_range 族（date_range/number_range 等）待解禁
 T4 复核：*_range 族解禁仍不做（562 判定=维持：解禁=并档抑制，
 date_range/number_range 现走 isRangeCol=false 未抑制面、解禁将翻转区间筛选可达性，
 557/561 行为锁在，待专项批评估消费面后同步更新） */
export const NON_SEMANTIC_TYPES_RE = /^(binary|nested|object|geo_point|geo_shape|attachment|flattened|join|point|shape|dense_vector|sparse_vector|percolator|completion|histogram|aggregate_metric_double|ip_range)$/;
export function isNonSemanticType(t?: string): boolean {
  return !!t && NON_SEMANTIC_TYPES_RE.test(t);
}

/* 区间筛选判据单源合并（RT:1021/QRT:1120 双份 RANGE_DATE_RE 字面 + 双份
 rangePlaceholder 逐字退役）。⚠RT isRangeCol 本体被 tableKernelTypeGuard545:161 源码锁
 逐字钉死「显式类型优先不回落采样」形态——只改判据引用（RANGE_DATE_RE 改引本院）不改形；
 QRT 文件内 NUMERIC_TYPES_RE 字面仍锁留本文件（semanticTiers500，typeTiers.ts:4-6 先例） */
export const RANGE_DATE_RE = /^(date|date_nanos)$/;

/* 区间判据核心：显式类型在场即白名单判（数值族 ∪ 日期族）；缺类型=false
 （QRT isRangeCol 委托此出口；RT isRangeCol 因 545 源码锁保留本地同构体） */
export function isRangeType(t?: string): boolean {
  return !!t && (NUMERIC_TYPES_RE.test(t) || RANGE_DATE_RE.test(t));
}

/* T1：IP 型判据单源合并（QRT/RT 双份本地 `const IP_TYPE_RE = /^ip(_range)?$/`
 字面退役，isIpCol 显式类型档/isContainsCol 抑制档改引 isIpType；ip 裸型与 ip_range 族同判，
 行为零变化）。列名兜底（IP_NAME_RE）留双内核本地——它是「名像 ip」启发式，非类型判据。 */
export const IP_TYPE_RE = /^ip(_range)?$/;
export function isIpType(t?: string): boolean {
  return !!t && IP_TYPE_RE.test(t);
}

/* 区间输入占位文案单源（RT/QRT 弹层 range-ph 双份逐字退役；原文案逐字保真）——
 date 列给 ISO/epoch 示例，其余列缺省「最小/最大值（含）」 */
export function rangePlaceholderTxt(t: string | undefined, side: 'min' | 'max'): string {
  const label = side === 'min' ? '最小值（含）' : '最大值（含）';
  return t && RANGE_DATE_RE.test(t) ? `${label}，如 2024-01-01 或 epoch 毫秒` : label;
}

/* P2-1：ES 类型 → 语义色类（五类简化版：数值蓝/日期琥珀/布尔绿/文本中性/keyword 青；
 dbx 有 9 类方案管理，简化为内置一套不做管理面） */
export function typeCls(t?: string): string {
  if (!t) return '';
  if (/^(long|integer|short|byte|double|float|half_float|scaled_float|unsigned_long)$/.test(t)) return 'rt-ty-num';
  if (/^(date|date_nanos)$/.test(t)) return 'rt-ty-date';
  if (t === 'boolean') return 'rt-ty-bool';
  if (t === 'text' || t === 'match_only_text') return 'rt-ty-text';
  return 'rt-ty-kw';
}
