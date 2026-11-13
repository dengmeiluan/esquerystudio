/* 索引工作区——「文档」Tab 的检索 DSL 构造（纯函数，独立可测）。
 设计：空关键词 = match_all 全量浏览；非空 = query_string（支持 field:value / AND / 通配等
 ES 原生语法，lenient 容忍类型错配不 400），给不会写 DSL 的测试/产品「像搜索引擎一样搜文档」。 */

/** 关键词 → 文档检索 DSL 字符串（track_total_hits 布尔形态 6.0+ 通用，7.x 下解除 1w 封顶） */
/* 加 from 真分页——与查询工作台同款 Pagination 语义（from/size 真检索），
 「检索 N 条重查」旧范式退役。300+ 批：移除 track_total_hits:true——与查询工作台
 统一走 ES 默认（10,000 上限），大索引不再每次检索强制精确计数（性能），
 总页数/计数条语义两台一致（10,000+ 下界，relation 经后端 totalGte 透传） */
export function buildDocsDsl(q: string, size = 20, from = 0): string {
  const kw = (q || '').trim();
  const query = kw
    ? { query_string: { query: kw, default_operator: 'AND', lenient: true } }
    : { match_all: {} };
  return JSON.stringify({ query, from, size }, null, 2);
}

/** 检索条件的人话摘要（空态/结果条展示用） */
export function docsQuerySummary(q: string): string {
  const kw = (q || '').trim();
  return kw ? `匹配「${kw}」` : '全部文档';
}
