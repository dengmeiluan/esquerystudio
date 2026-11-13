/* 表头点击排序的字段裁决单源（RT/QRT remote 档与本地档共用）。
 背景：结果表列名来自 _source 键，和 mapping 类型并不一一对应。直接拿列名下发
 sort 会在两类字段上翻车：
 ·
 text 字段（title/issuer_name…）没有 doc_values，ES 默认 fielddata 关闭，
 sort 直接 400「Fielddata is disabled on text fields」——真实点击一次就报错。
 · 列名同名的 multi-field 子域（如 title 的 keyword 子域）才是可排序路径。
 因此点击列 → 真实 sort 路径走本函数裁决，而不是把列名原样透传。

 裁决口径（宁缺勿错——不确定就放行原列名，交给 ES 的 unmapped_type 兜底）：
 ① 元字段（_id/_score/_doc/_index…）不参与 mapping，原样放行；
 ② 已带子域后缀（a.keyword）视为调用方已裁决，原样放行；
 ③ mapping 已知 text：有 <field>.keyword → 改写子域；无子域 → 不可排序（reason）；
 ④ 其它类型（keyword/数值/date/boolean…）原样放行；
 ⑤ mapping 无此字段（未加载/运行时字段/动态映射）→ 原样放行。 */
export interface SortFieldResolution {
  /** 实际下发给 ES 的 sort 字段路径 */
  field: string;
  /** true=可下发；false=该列不可排序，调用方应给用户可行动提示且不改查询 */
  ok: boolean;
  /** ok=false 时的原因（面向用户的中文短句） */
  reason?: string;
}

const META_SORT_FIELDS = new Set(['_id', '_index', '_score', '_doc', '_type']);

export function resolveSortField(col: string, types: Record<string, string> | undefined): SortFieldResolution {
  const field = String(col || '').trim();
  if (!field) return { field, ok: false, reason: '列名为空，无法排序' };
  if (field.startsWith('_') && META_SORT_FIELDS.has(field)) return { field, ok: true };
  if (field.endsWith('.keyword')) return { field, ok: true };
  const type = types?.[field];
  if (type !== 'text') return { field, ok: true };
  const twin = field + '.keyword';
  if (types?.[twin] === 'keyword') return { field: twin, ok: true };
  return {
    field,
    ok: false,
    reason: `「${field}」是 text 字段且没有 .keyword 子域，ES 无法对它排序；请换成 keyword/date/数值字段`,
  };
}
