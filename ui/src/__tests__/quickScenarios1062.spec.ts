/* 1062：生产场景任务——按 mapping 业务角色自动绑定字段；缺角色不生成假字段 DSL。 */
import { describe, it, expect } from 'vitest';
import { QUICK_TASKS, quickTaskDsl, resolveQuickTaskField } from '../utils/queryHub';
import type { FieldItem } from '../composables/useIndexFields';

const FIELDS: FieldItem[] = [
  { path: 'amount', type: 'double' },
  { path: 'announcement_title', type: 'text' },
  { path: 'bond_rating', type: 'keyword' },
  { path: 'company_name', type: 'keyword' },
  { path: 'publish_time', type: 'date' },
];
const task = (k: string) => QUICK_TASKS.find(t => t.k === k)!;

describe('1062 生产场景字段解析', () => {
  it('按角色选真实字段：date / entity / category / text', () => {
    expect(resolveQuickTaskField(FIELDS, 'date')).toBe('publish_time');
    expect(resolveQuickTaskField(FIELDS, 'entity')).toBe('company_name');
    expect(resolveQuickTaskField(FIELDS, 'category')).toBe('bond_rating');
    expect(resolveQuickTaskField(FIELDS, 'text')).toBe('announcement_title');
  });

  it('entity 退化到 text 名称字段的 .keyword 子域；缺角色返回 null', () => {
    const textOnly: FieldItem[] = [
      { path: 'summary', type: 'text' },
      { path: 'summary.keyword', type: 'keyword' },
      { path: 'amount', type: 'double' },
    ];
    expect(resolveQuickTaskField(textOnly, 'entity')).toBe('summary.keyword');
    expect(resolveQuickTaskField([], 'date')).toBeNull();
  });
});

describe('1062 生产场景 DSL', () => {
  it('最近 7 天 → date range + 倒序 sort', () => {
    const r = quickTaskDsl(task('recent-window'), '', FIELDS);
    expect(r.field).toBe('publish_time');
    const d = JSON.parse(r.dsl!);
    expect(d.query.bool.filter[0].range.publish_time).toEqual({ gte: 'now-7d/d', lte: 'now' });
    expect(d.sort[0].publish_time.order).toBe('desc');
    expect(d.size).toBe(20);
  });

  it('主体 Top20 / 分类分布 → terms 聚合绑真实字段', () => {
    const e = JSON.parse(quickTaskDsl(task('entity-top'), '', FIELDS).dsl!);
    expect(e.aggs.top_entities.terms).toEqual({ field: 'company_name', size: 20 });
    expect(e.size).toBe(0);
    const c = JSON.parse(quickTaskDsl(task('category-top'), '', FIELDS).dsl!);
    expect(c.aggs.top_categories.terms.field).toBe('bond_rating');
  });

  it('正文关键词 → match 到 text 字段', () => {
    const r = quickTaskDsl(task('text-search'), '违约', FIELDS);
    expect(r.field).toBe('announcement_title');
    expect(JSON.parse(r.dsl!).query.match.announcement_title).toBe('违约');
  });

  it('组合场景：主体值 + 时间窗同时绑定两个角色', () => {
    const r = quickTaskDsl(task('entity-recent'), '示例公司', FIELDS);
    expect(r.field).toBe('company_name · publish_time');
    const d = JSON.parse(r.dsl!);
    expect(d.query.bool.must[0].term.company_name).toBe('示例公司');
    expect(d.query.bool.must[1].range.publish_time.gte).toBe('now-7d/d');
  });

  it('组合场景：关键词 + 时间窗；缺 date 时整体拒绝', () => {
    const r = quickTaskDsl(task('text-recent'), '违约', FIELDS);
    const d = JSON.parse(r.dsl!);
    expect(d.query.bool.must[0].match.announcement_title).toBe('违约');
    expect(d.query.bool.must[1].range.publish_time.gte).toBe('now-7d/d');
    const miss = quickTaskDsl(task('entity-recent'), 'x', [{ path: 'company_name', type: 'keyword' }]);
    expect(miss.dsl).toBeUndefined();
    expect(miss.missing).toContain('date 字段');
  });

  it('缺角色 → 返回 missing，不产出 DSL；传统任务不受影响', () => {
    const r = quickTaskDsl(task('recent-window'), '', [{ path: 'amount', type: 'double' }]);
    expect(r.dsl).toBeUndefined();
    expect(r.missing).toBe('date 字段');
    const legacy = quickTaskDsl(task('by-id'), 'a,b', []);
    expect(JSON.parse(legacy.dsl!).query.ids.values).toEqual(['a', 'b']);
  });
});
