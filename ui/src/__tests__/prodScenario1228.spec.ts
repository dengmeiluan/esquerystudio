/**
 * 1228：**生产场景**端到端往返锁（研报 / 债券 / 公告 / 舆情后台）。
 *
 * 1181/1190/1221 分别锁了算子、聚合、可选参数形态。它们都是"语法维度"的切片；
 * 这条按**真实业务写法**整条锁一遍——一条查询里同时出现 identity 字段、日期区间、
 * 状态多选、嵌套、聚合、折叠、分页、向量……看整棵树是否还认得出来。
 *
 * 关键判据除"无损往返"外，还有 **`tree.extras` 必须为空**：
 * extras 是"没认出来的顶层键"的兜底袋；某个键落进去 = 语法上写得出、树里没有语义位
 * （用户看不到对应控件，只能改原文）。extras 非空就是结构化覆盖的缺口信号。
 *
 * 实测（12 条全 OK、extras 全空）：研报-机构+日期+状态、债券-数值+关键词、
 * 公告-嵌套、舆情-高亮+裁剪、研报-聚合(order/子聚合/time_zone)、债券-折叠+后置过滤、
 * 公告-分页+search_after、研报-function_score(functions/score_mode)、舆情-simple_query_string、
 * 债券-script_fields+runtime_mappings、研报-knn、公告-retriever(rrf 组合)。
 */
import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree } from '../utils/queryAst';

const stable = (v: any): string => Array.isArray(v)
  ? '[' + v.map(stable).join(',') + ']'
  : (v && typeof v === 'object')
    ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
    : JSON.stringify(v);

const SCENARIOS: Record<string, any> = {
  '研报 机构+日期+状态': { query: { bool: { must: [
    { term: { 'publisher.org_name': '中诚信国际' } },
    { range: { publish_time: { gte: '2026-01-01', lte: '2026-06-30' } } },
    { terms: { status: ['已披露', '存续'] } },
  ] } }, size: 20 },
  '债券 数值过滤+多键排序': { query: { bool: {
    must: [{ match: { issuer_name: '城投' } }],
    filter: [{ range: { amount: { gte: 100000000 } } }],
    must_not: [{ term: { status: '已兑付' } }],
  } }, sort: [{ score: 'desc' }, { publish_time: 'asc' }] },
  '公告 嵌套文档': { query: { nested: { path: 'attachments', query: { bool: { must: [
    { match: { 'attachments.name': '年报' } }, { range: { 'attachments.size': { gt: 1000 } } },
  ] } }, score_mode: 'avg' } } },
  '舆情 高亮+字段裁剪': { _source: ['title', 'publisher.org_name', 'score'],
    highlight: { fields: { title: {} } }, query: { match: { title: '违约' } } },
  '研报 聚合': { size: 0, aggs: {
    by_org: { terms: { field: 'publisher.org_name', size: 20, order: { _count: 'desc' } },
      aggs: { avg_score: { avg: { field: 'score' } } } },
    by_month: { date_histogram: { field: 'publish_time', calendar_interval: 'month', time_zone: '+08:00' } },
  } },
  '债券 折叠+后置过滤': { collapse: { field: 'issuer_name' }, post_filter: { term: { status: '存续' } },
    query: { match_all: {} }, size: 50 },
  '公告 分页+游标': { query: { match_all: {} }, from: 40, size: 20,
    track_total_hits: true, search_after: [1700000000000] },
  '研报 function_score': { query: { function_score: { query: { match: { title: '研报' } },
    functions: [{ weight: 3 }, { filter: { term: { status: '存续' } }, weight: 2 }],
    score_mode: 'sum', boost_mode: 'multiply' } } },
  '舆情 simple_query_string': { query: { simple_query_string: {
    query: '"债券违约" -担保', fields: ['title', 'content'], default_operator: 'and' } } },
  '债券 脚本字段+运行时': { runtime_mappings: { days: { type: 'long', script: { source: 'emit(1)' } } },
    script_fields: { age: { script: { source: 'doc["amount"].value / 10000' } } }, query: { match_all: {} } },
  '研报 knn': { knn: { field: 'vec', query_vector: [0.1, 0.2], k: 10, num_candidates: 50 } },
  '公告 retriever 组合': { retriever: { rrf: { retrievers: [
    { standard: { query: { match: { title: '年报' } } } },
    { knn: { field: 'vec', query_vector: [0.1], k: 5 } },
  ], rank_window_size: 50 } } },
};

describe('1228 生产场景整条往返', () => {
  it('每条都无损耗回，且没有键掉进 extras（掉进去=树里没语义位）', () => {
    const drift: string[] = [];
    const leaked: string[] = [];
    for (const [name, dsl] of Object.entries(SCENARIOS)) {
      const r: any = parseTree(dsl);
      expect(r.ok, `${name} 解析失败：${r.reason}`).toBe(true);
      const back = serializeTree(r.tree);
      if (stable(back) !== stable(dsl)) drift.push(`${name}：${stable(back).slice(0, 120)}`);
      const ex = Object.keys(r.tree.extras || {});
      if (ex.length) leaked.push(`${name} → extras=${JSON.stringify(ex)}`);
    }
    expect(drift, '往返漂移:\n' + drift.join('\n')).toEqual([]);
    expect(leaked, '顶层键没有语义位（落进 extras）:\n' + leaked.join('\n')).toEqual([]);
  });

  it('样本量护栏', () => {
    expect(Object.keys(SCENARIOS).length).toBe(12);
  });
});
