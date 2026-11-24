import { describe, it, expect } from 'vitest';
import { buildDocsDsl, docsQuerySummary } from '../workbench';

/* R62：索引工作区「文档」Tab 检索 DSL 构造契约——
   空关键词必须是 match_all（全量浏览），非空必须走 query_string 且 lenient（类型错配不 400） */
describe('buildDocsDsl', () => {
  it('空/纯空白关键词 → match_all', () => {
    for (const q of ['', '   ', '\t']) {
      const dsl = JSON.parse(buildDocsDsl(q, 20));
      expect(dsl.query).toEqual({ match_all: {} });
      expect(dsl.size).toBe(20);
      expect(dsl.track_total_hits, '300+ 批：统一 ES 默认语义，下界经 totalGte 标注').toBeUndefined();
    }
  });

  it('关键词 → query_string（AND 语义 + lenient 容错）', () => {
    const dsl = JSON.parse(buildDocsDsl('  status:open AND foo  ', 50));
    expect(dsl.query.query_string).toEqual({
      query: 'status:open AND foo',
      default_operator: 'AND',
      lenient: true,
    });
    expect(dsl.size).toBe(50);
  });

  it('size 默认 20，输出为可解析 JSON 文本', () => {
    const raw = buildDocsDsl('a');
    expect(typeof raw).toBe('string');
    expect(JSON.parse(raw).size).toBe(20);
  });
});

describe('docsQuerySummary', () => {
  it('空关键词 → 全部文档', () => {
    expect(docsQuerySummary('')).toBe('全部文档');
    expect(docsQuerySummary('  ')).toBe('全部文档');
  });
  it('非空 → 匹配「kw」', () => {
    expect(docsQuerySummary(' foo ')).toBe('匹配「foo」');
  });
});
