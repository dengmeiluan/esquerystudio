import { describe, it, expect } from 'vitest';
import { opsForType } from '../utils/queryAstOps';

/* 1395：keyword 族特化类型的算子推荐。

 `constant_keyword` 是 ES 官方定义的 keyword 特化——「a specialization of the keyword field
 for the case that all documents in the index have the same value」，且文档明确说
 「you can filter on a constant keyword」。它与 keyword 的差别只在**写入侧**（值恒定），
 查询语义完全一致。

 此前 opsForType 没有这个分支 → 落兜底 ['exists']。用户选中 constant_keyword 字段后
 算子下拉只有「字段存在」，读成「这个字段不能查」——与 shape（1382 修过）完全同类的
 「支持读改、不支持新建」缺口。

 1382 那条普查抓不到它：该判据只在**注册表声明过该类型**时才检查，而 OPS_META 的
 term/terms 只声明了 `keyword`，不含 `constant_keyword`。因此单独立一条。 */
const KEYWORD_FAMILY_OPS = ['term', 'terms', 'prefix', 'wildcard', 'regexp', 'fuzzy', 'match', 'exists'];

describe('1395 constant_keyword 必须有 keyword 同款算子', () => {
  it('推荐与 keyword 逐项一致（值恒定只影响写入，不改变查询语义）', () => {
    expect(opsForType('constant_keyword')).toEqual(opsForType('keyword'));
    expect(opsForType('constant_keyword')).toEqual(KEYWORD_FAMILY_OPS);
  });

  it('不再落兜底（回归守卫：修好之前这里只有 exists）', () => {
    const rec = opsForType('constant_keyword');
    expect(rec.length, '只有 exists 就是本缺陷的原始形态').toBeGreaterThan(1);
    expect(rec).toContain('term');
    expect(rec).toContain('terms');
  });

  it('负控：真正无查询语义的类型仍然只有 exists（判据不是恒真）', () => {
    /* histogram 官方：「Because the data is not indexed, you only can use ...
       the exists query」；completion 只配合 suggester，不走 query 子句。
       这两类落兜底是**正确**的，不能被本修复顺手改掉。 */
    expect(opsForType('histogram')).toEqual(['exists']);
    expect(opsForType('completion')).toEqual(['exists']);
    expect(opsForType('binary')).toEqual(['exists']);
    expect(opsForType('__no_such_type__')).toEqual(['exists']);
  });
});
