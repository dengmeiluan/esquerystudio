/**
 * 1439：表格「排除此值」的合并内核。
 *
 * 入口：结果表单元格右键「排除此值并重查」（此前只有正向「以此值过滤」，
 * 排除必须手改 DSL 加 must_not）。
 * 两条通道语言不同——DSL 对象 / Lucene 串——所以合并收在两个纯函数里，
 * 视图只负责取数与重查。
 */
import { describe, it, expect } from 'vitest';
import { mergeFilterIntoQuery, appendLuceneClause } from '../utils/filterMerge';

describe('1439 filterMerge', () => {
  it('DSL：无既有 query 时正向=子句本身，排除=bool.must_not', () => {
    const clause = { term: { status: 'A' } };
    expect(mergeFilterIntoQuery({}, clause)).toEqual(clause);
    expect(mergeFilterIntoQuery({}, clause, true)).toEqual({ bool: { must_not: [clause] } });
  });

  it('DSL：有既有 query 时把原 query 收进 must，新条件进 filter / must_not', () => {
    const root = { query: { match: { title: 'x' } }, size: 20 };
    const clause = { term: { status: 'A' } };
    expect(mergeFilterIntoQuery(root, clause)).toEqual({
      bool: { must: [{ match: { title: 'x' } }], filter: [clause] },
    });
    expect(mergeFilterIntoQuery(root, clause, true)).toEqual({
      bool: { must: [{ match: { title: 'x' } }], must_not: [clause] },
    });
  });

  it('DSL：不改动入参（原 query 对象不被就地改写）', () => {
    const root = { query: { match: { title: 'x' } } };
    const snapshot = JSON.stringify(root);
    mergeFilterIntoQuery(root, { term: { a: 1 } }, true);
    expect(JSON.stringify(root)).toBe(snapshot);
  });

  it('Lucene：正向 AND，排除 AND NOT；空检索词时直接给子句', () => {
    expect(appendLuceneClause('', 'status:"A"')).toBe('status:"A"');
    expect(appendLuceneClause('', 'status:"A"', true)).toBe('NOT status:"A"');
    expect(appendLuceneClause('title:"x"', 'status:"A"')).toBe('(title:"x") AND status:"A"');
    expect(appendLuceneClause('title:"x"', 'status:"A"', true)).toBe('(title:"x") AND NOT status:"A"');
  });

  it('Lucene：已有括号条件不被破坏', () => {
    expect(appendLuceneClause('(a:1 OR b:2)', 'c:3', true)).toBe('((a:1 OR b:2)) AND NOT c:3');
  });
});
