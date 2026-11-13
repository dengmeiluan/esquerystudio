/* 1045 批：SQL 子句关键字 + GROUP BY/ORDER BY .keyword + 索引名纠错（纯函数） */
import { describe, it, expect } from 'vitest';
import { completionKeywordItems, preferKeywordField, suggestIndicesFor } from '../sqlCompletion';
import { searchFields } from '../fieldSearch';

describe('1045 SQL 子句级补全', () => {
  it('各子句给出下一段最可能的关键字，且按已敲前缀过滤', () => {
    expect(completionKeywordItems('', '').map(k => k.label)).toContain('SELECT');
    expect(completionKeywordItems('WHERE', '').map(k => k.label)).toEqual(expect.arrayContaining(['AND', 'OR', 'LIKE', 'BETWEEN', 'GROUP BY']));
    expect(completionKeywordItems('GROUP BY', '').map(k => k.label)).toEqual(expect.arrayContaining(['HAVING', 'ORDER BY', 'LIMIT']));
    expect(completionKeywordItems('ORDER BY', '').map(k => k.label)).toEqual(expect.arrayContaining(['ASC', 'DESC']));
    expect(completionKeywordItems('WHERE', 'or').map(k => k.label)).toEqual(expect.arrayContaining(['OR']));
    expect(completionKeywordItems('SELECT', 'dis').map(k => k.label)).toEqual(['DISTINCT']);
    expect(completionKeywordItems('SELECT', 'zzz')).toEqual([]);
  });

  it('GROUP BY / ORDER BY 把 text 基字段换成真实存在的 .keyword 子字段', () => {
    const fields = [
      { path: 'title', type: 'text' },
      { path: 'title.keyword', type: 'keyword' },
      { path: 'content', type: 'text' },       // 无 .keyword：保留原字段（ES 报错即教育）
      { path: 'industry', type: 'keyword' },
    ];
    const hits = searchFields({ fields, query: '' }).flat;
    const grouped = preferKeywordField(hits, fields, 'GROUP BY').map(h => h.path);
    expect(grouped).toContain('title.keyword');
    expect(grouped).not.toContain('title');
    expect(grouped).toContain('content');
    expect(grouped).toContain('industry');
    expect(new Set(grouped).size).toBe(grouped.length);
    /* WHERE 位不替换（分组/排序专属规则） */
    expect(preferKeywordField(hits, fields, 'WHERE').map(h => h.path)).toContain('title');
  });
});

describe('1045 SQL 索引名纠错', () => {
  const indices = [{ index: 'acme_entity' }, { index: 'acme_report' }, { index: 'logs-2026' }];

  it('Unknown index / no such index 两种错误文案都识别', () => {
    expect(suggestIndicesFor('Unknown index [acme_entty]', indices)?.suggestions[0].path).toBe('acme_entity');
    expect(suggestIndicesFor('no such index [acme_repor]', indices)?.suggestions[0].path).toBe('acme_report');
  });

  it('无错误文案/无相近项返回 null 或空建议', () => {
    expect(suggestIndicesFor('Unknown column [foo]', indices)).toBeNull();
    expect(suggestIndicesFor('Unknown index [completely-different]', indices)?.suggestions).toEqual([]);
  });
});
