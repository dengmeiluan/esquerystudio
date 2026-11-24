/* 1064：查询失败字段定位——只认查询上下文错误，sort/agg/parse 不误指条件行。 */
import { describe, it, expect } from 'vitest';
import { errorFieldOf, findLeafIdByField } from '../utils/queryErrorLocate';
import { parseTree, type QueryNode } from '../utils/queryAst';

const treeRoot = (dsl: Record<string, unknown>): QueryNode => {
  const r = parseTree(dsl);
  if (!r.ok) throw new Error(r.reason);
  return r.tree.root!;
};

describe('1064 错误字段提取', () => {
  it('查询上下文错误提取字段', () => {
    expect(errorFieldOf('search_phase_execution_exception: failed to create query: field [title] not found')).toBe('title');
    expect(errorFieldOf('No field found for [company_name] in mapping')).toBe('company_name');
    expect(errorFieldOf('Cannot search on field [content] since it is not indexed')).toBe('content');
    expect(errorFieldOf('failed to find field [publish_time]')).toBe('publish_time');
  });

  it('排序/聚合/文档解析错误不误指条件', () => {
    expect(errorFieldOf('No mapping found for [ts] in order to sort on')).toBeNull();
    expect(errorFieldOf('Field [title] of type [text] is not supported for aggregation')).toBeNull();
    expect(errorFieldOf('failed to parse field [ts] of type [date]')).toBeNull();
    expect(errorFieldOf('')).toBeNull();
  });
});

describe('1064 条件树字段匹配', () => {
  it('精确字段命中；.keyword 与主字段互认；不存在返回 null', () => {
    const root = treeRoot({ query: { bool: { must: [
      { term: { title: 'x' } },
      { term: { 'company_name.keyword': 'y' } },
      { exists: { field: 'content' } },
    ] } } });
    const titleId = findLeafIdByField(root, 'title');
    expect(titleId).toBeTruthy();
    expect(findLeafIdByField(root, 'title.keyword')).toBe(titleId);
    expect(findLeafIdByField(root, 'company_name')).toBeTruthy();
    expect(findLeafIdByField(root, 'publish_time')).toBeNull();
    expect(findLeafIdByField(null, 'title')).toBeNull();
  });

  it('嵌套/容器内条件也能命中', () => {
    const root = treeRoot({ query: { nested: { path: 'shareholders', query: { term: { 'shareholders.name': 'x' } } } } });
    expect(findLeafIdByField(root, 'shareholders.name')).toBeTruthy();
    expect(findLeafIdByField(root, 'shareholders.name.keyword')).toBeTruthy();
  });
});
