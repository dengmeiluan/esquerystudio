/* 1069 续：生产高频问法——每主体最新一篇（collapse 去重）、主体分类构成。
   字段继续按 mapping 业务角色自动绑定；缺角色拒绝生成（宁缺勿假）。 */
import { describe, it, expect } from 'vitest';
import { QUICK_TASKS, quickTaskDsl } from '../utils/queryHub';
import type { FieldItem } from '../composables/useIndexFields';

const FIELDS: FieldItem[] = [
  { path: 'amount', type: 'double' },
  { path: 'announcement_title', type: 'text' },
  { path: 'bond_rating', type: 'keyword' },
  { path: 'company_name', type: 'keyword' },
  { path: 'publish_time', type: 'date' },
];
const task = (k: string) => QUICK_TASKS.find(t => t.k === k)!;

describe('1076 每主体最新一篇', () => {
  it('collapse 绑主体字段 + 时间窗 + 倒序 sort（近 90 天，避免全量折叠）', () => {
    const r = quickTaskDsl(task('entity-latest'), '', FIELDS);
    expect(r.field).toBe('company_name · publish_time');
    const d = JSON.parse(r.dsl!);
    expect(d.collapse.field).toBe('company_name');
    expect(d.query.bool.filter[0].range.publish_time).toEqual({ gte: 'now-90d/d', lte: 'now' });
    expect(d.sort[0].publish_time.order).toBe('desc');
    expect(d.size).toBe(20);
    expect(d.track_total_hits).toBe(true);
  });

  it('缺主体或时间字段 → 拒绝生成并说明缺什么', () => {
    expect(quickTaskDsl(task('entity-latest'), '', [{ path: 'publish_time', type: 'date' }]).missing).toContain('主体/名称字段');
    expect(quickTaskDsl(task('entity-latest'), '', [{ path: 'company_name', type: 'keyword' }]).missing).toContain('date 字段');
  });
});

describe('1076 主体分类构成', () => {
  it('主体 term + 分类 terms 聚合（size 0 只看分布）', () => {
    const r = quickTaskDsl(task('entity-category-top'), ' 示例公司 ', FIELDS);
    const d = JSON.parse(r.dsl!);
    expect(d.query.term.company_name).toBe('示例公司');
    expect(d.aggs.by_category.terms).toEqual({ field: 'bond_rating', size: 20 });
    expect(d.size).toBe(0);
  });

  it('缺分类字段 → 拒绝生成', () => {
    const r = quickTaskDsl(task('entity-category-top'), 'x', [{ path: 'company_name', type: 'keyword' }]);
    expect(r.dsl).toBeUndefined();
    expect(r.missing).toContain('分类字段');
  });
});

describe('1076 场景分组纪律', () => {
  it('生产场景只保留一个分组头（新任务并入，不重复起节）', () => {
    const heads = QUICK_TASKS.filter(t => t.head);
    expect(heads.map(t => t.head)).toEqual(['生产场景（按 mapping 自动绑定字段）']);
    const production = QUICK_TASKS.filter(t => t.autoRoles?.length || t.autoRole);
    expect(production.map(t => t.k)).toEqual(expect.arrayContaining(['entity-latest', 'entity-category-top']));
  });
});
