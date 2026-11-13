/* （531 遗留件③收口）：显式非语义类型抑制守卫纯函数单源——
 列类型分档展示（类型徽标/区间过滤/值分布/走势/排序档）对「显式非语义」列的抑制判定：
 ① 类型档：typeTiers.isNonSemanticType（⚠typeTiers.ts 黑名单禁改，只 import 其既有导出——
 binary/nested/geo 等 18 型正则，557/两次扩容在档）；
 ② 元字段档：_source 等非业务元字段（raw doc 对象列的排序/分布/分档展示皆无语义，按名抑制；
 显式类型常缺位，^_ 全等锚定防 business_source 类业务列误伤）。
 豁免：_id/_index/_score/_seq_no 排序/定位有语义不收。
 纯函数零副作用；消费点=useColStats（dist/seriesOf 抑制）+ tableSort（sortableGuard
 → useTableSort opts.sortableOf 抑制档）；双内核内联守卫（QRT/RT isNumericCol 等黑名单件）
 不动，换引下批随接线。 */

import { isNonSemanticType } from './typeTiers';

/* 非业务元字段名档（首收 1 名；扩容须逐名评估消费点：抑制即 Σ/分布/走势/排序全退） */
const META_NON_BUSINESS_FIELDS = new Set<string>(['_source']);

/** 元字段档判定（按名；与类型档独立——_source 常无显式类型） */
export function isMetaNonBusinessField(col: string): boolean {
  return META_NON_BUSINESS_FIELDS.has(col);
}

/** 抑制守卫出口：显式类型判真（typeTiers 单源）或元字段判真 → 该列分档展示抑制。
 * t 缺省/空串=无显式类型（按值采样链不受损，只走元字段档）。 */
export function typeTierSuppressed(col: string, t?: string): boolean {
  return isNonSemanticType(t) || isMetaNonBusinessField(col);
}
