/* 1387：SQL「SELECT * 一键展开」的列清单（纯函数，SqlConsoleView 消费）。
 两条硬约束都是真机实测出来的：

 ① object / nested 容器**不是可 SELECT 的列**。ES SQL 把它们映射成 STRUCT，
    直接选中会失败（elastic/elasticsearch#37801 原文：「selecting a nested or an object
    field will fail the query」；官方 SQL limitations 同口径：nested 字段只能通过
    `nested_field.sub_field` 访问）。而 mapping 拍平后容器与叶子在同一张清单里，
    旧实现只滤 `.keyword` 子域，于是 `publisher` 被当成一列写进 SELECT —— 展开完照样报错。
    实测：research_report 展开 19 列，其中 `publisher` 是 object 容器。

 ② 字段源必须属于语句自己的 FROM。通配/多表/未知表名时 `indexFromSql` 返回空，
    视图层的 `effectiveSqlIndex` 会回落到顶栏选中索引，展开就把 A 索引的列写进查 B 的
    语句（Unknown column）。这条守卫在视图层（要看响应式上下文），本函数只做列挑选。

 宁缺勿错：这里只剔除有明确证据会报错的容器类型。rank_features / shape / flattened
 等「SQL 未列出」的类型没有选中即报错的一手证据，不做推测性剔除。 */
export interface StarExpansion {
  /** 已加双引号、逗号分隔的列清单（直接替换 SELECT * 用） */
  cols: string;
  /** 实际写入的列数 */
  picked: number;
  /** 候选池大小（剔除容器与 .keyword 子域之后） */
  pool: number;
  /** 被跳过的容器字段数（object/nested） */
  skippedContainers: number;
}

const CONTAINER_TYPES = new Set(['object', 'nested']);

/** 把字段清单展开成 SELECT 列清单。
 * - 容器字段（object/nested）剔除；
 * - `.keyword` 多字段子域默认不展开（冗余列），只有全是子域时才退化全量；
 * - cap 上限防把编辑器写爆。 */
export function expandStarColumns(
  fields: Array<{ path: string; type: string }>, cap = 60,
): StarExpansion {
  const leaf = fields.filter(f => !CONTAINER_TYPES.has(String(f.type)));
  const nonSub = leaf.filter(f => !f.path.endsWith('.keyword'));
  const base = nonSub.length ? nonSub : leaf;
  const picked = base.slice(0, Math.max(0, cap));
  const cols = picked.map(f => '"' + String(f.path).replace(/"/g, '""') + '"').join(', ');
  return {
    cols,
    picked: picked.length,
    pool: base.length,
    skippedContainers: fields.length - leaf.length,
  };
}
