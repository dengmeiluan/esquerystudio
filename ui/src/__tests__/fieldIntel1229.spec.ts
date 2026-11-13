/**
 * 1229：字段智能（自动匹配 / 排序 / 默认算子）的回归锁。
 *
 * 用户反复强调「字段自动匹配排序」。这套内核已经分层做得比较细，但一直只有零散用例；
 * 它又是最容易被后续改动悄悄破坏的部分（改一个 `typePriorityForOp` 的分支就能让所有
 * term 条件的候选顺序变味）。这里把实测确认的行为整条钉住。
 *
 * 实测（`vite-node` 直调真实模块）：
 *  · `searchFields` rank：空 query 纯字母序；`title` 精确档把 title/title.keyword 提前；
 *    `pub`/`publish` 前缀与**段感知**都把 publish_time 排在 publisher.org_name 之前；
 *  · `typePriority` 真生效：`q=a` 时 keyword 优先会把 status/publisher.org_name 提到 amount 前；
 *  · `typePriorityForOp` 随算子变：term→['keyword']、match→['text','keyword']、
 *    range→[date + 全数值族]、geo_distance→typeFilter=['geo_point']、knn→['dense_vector']；
 *  · `defaultOpForField(path,type)` 按类型给默认算子：text→match、keyword→term、date→range、
 *    boolean→term、geo_point→geo_distance、dense_vector→knn、semantic_text→semantic、
 *    join→parent_id、rank_features→rank_feature。
 *
 * ⚠ 注意签名：`defaultOpForField(path, type)` 是**两个参数**。我一度按 `{path,type}` 对象调用，
 * 结果 type 恒 undefined → 全部落到末尾的 `return 'term'`，据此误报「text 也返回 term」。
 * 调这个函数前先看签名，别用对象。
 */
import { describe, it, expect } from 'vitest';
import { searchFields } from '../utils/fieldSearch';
import { typePriorityForOp, typeFilterForOp } from '../utils/queryAstOps';
import { defaultOpForField } from '../utils/fieldRole';

const FIELDS = [
  { path: 'title', type: 'text' },
  { path: 'publisher.org_name', type: 'keyword' },
  { path: 'publish_time', type: 'date' },
  { path: 'amount', type: 'double' },
  { path: 'status', type: 'keyword' },
  { path: 'title.keyword', type: 'keyword' },
] as any;

const flat = (q: string, extra: any = {}) =>
  (searchFields({ fields: FIELDS, query: q, cap: 10, ...extra }) as any).flat.map((h: any) => h.path);

describe('1229 字段智能', () => {
  it('空 query = 纯字母序（不瞎猜）', () => {
    expect(flat('')).toEqual(['amount', 'publish_time', 'publisher.org_name', 'status', 'title', 'title.keyword']);
  });

  it('精确档优先', () => {
    expect(flat('title')).toEqual(['title', 'title.keyword']);
  });

  it('前缀 / 段感知：publish 时 publish_time 排在 publisher.org_name 之前', () => {
    expect(flat('pub')).toEqual(['publish_time', 'publisher.org_name']);
    expect(flat('publish')).toEqual(['publish_time', 'publisher.org_name']);
  });

  it('typePriority 真生效（keyword 优先把 keyword 字段提到数值之前）', () => {
    const plain = flat('a');
    expect(plain[0]).toBe('amount');
    const kwFirst = flat('a', { typePriority: ['keyword'] });
    expect(kwFirst.slice(0, 2)).toEqual(['status', 'publisher.org_name']);
    expect(kwFirst).toContain('amount');
  });

  it('typePriorityForOp 随算子变', () => {
    expect(typePriorityForOp('term')).toEqual(['keyword']);
    expect(typePriorityForOp('match')).toEqual(['text', 'keyword']);
    expect(typePriorityForOp('range')).toContain('date');
    expect(typePriorityForOp('range')).toContain('double');
    /* geo / knn 走 typeFilter（限定候选集），不是排序优先 */
    expect(typeFilterForOp('geo_distance')).toEqual(['geo_point']);
    expect(typeFilterForOp('knn')).toEqual(['dense_vector']);
  });

  it('defaultOpForField 按类型给默认算子（注意是两参签名）', () => {
    expect(defaultOpForField('title', 'text')).toBe('match');
    expect(defaultOpForField('status', 'keyword')).toBe('term');
    expect(defaultOpForField('publish_time', 'date')).toBe('range');
    expect(defaultOpForField('flag', 'boolean')).toBe('term');
    expect(defaultOpForField('loc', 'geo_point')).toBe('geo_distance');
    expect(defaultOpForField('vec', 'dense_vector')).toBe('knn');
    expect(defaultOpForField('body', 'semantic_text')).toBe('semantic');
    expect(defaultOpForField('join_f', 'join')).toBe('parent_id');
    expect(defaultOpForField('rank_x', 'rank_features')).toBe('rank_feature');
  });
});
