import { describe, it, expect } from 'vitest';
import { flattenMapping, detectDslPollution, visibleRows, descendantCount } from '../mappingTree';

/* R81：Mapping 字段树领域逻辑契约锁——MappingView 与索引工作区 Mapping Tab 共用口径。
   起因：真实索引 qa_sentiment_news_published 被查询 DSL 误写入污染出 query.bool.* 字段树，
   旧展示全量铺开不可读、还让用户误以为控制台坏了。 */

/** 模拟被 DSL 污染的真实 mapping 形态（节选自事故索引） */
const POLLUTED_PROPS = {
  provinceCodeArray: { type: 'long' },
  publishStatus: { type: 'integer' },
  sentimentTitle: {
    type: 'text', analyzer: 'my_hanlp_index_store_analyzer',
    fields: { standard: { type: 'text' } },
  },
  query: {
    properties: {
      bool: {
        properties: {
          adjust_pure_negative: { type: 'boolean' },
          boost: { type: 'float' },
          must: {
            properties: {
              bool: {
                properties: {
                  filter: {
                    properties: {
                      range: {
                        properties: {
                          issueTime: { properties: { boost: { type: 'float' }, from: { type: 'long' } } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

describe('flattenMapping 拍平（R81）', () => {
  it('先序拍平：父在子前，path/depth/parent 正确', () => {
    const rows = flattenMapping(POLLUTED_PROPS);
    const byPath = new Map(rows.map(r => [r.path, r]));
    expect(byPath.get('query')!.depth).toBe(0);
    expect(byPath.get('query.bool')!.parent).toBe('query');
    const deep = byPath.get('query.bool.must.bool.filter.range.issueTime.from')!;
    expect(deep.depth).toBe(7);
    expect(deep.type).toBe('long');
    expect(deep.ancestors[0]).toBe('query');
    /* 父在子前 */
    expect(rows.findIndex(r => r.path === 'query')).toBeLessThan(rows.findIndex(r => r.path === 'query.bool'));
  });

  it('object 容器 hasChildren=true，叶子 false；attrs 汇总 analyzer；multi-fields 层级化为子行（R84）', () => {
    const rows = flattenMapping(POLLUTED_PROPS);
    const q = rows.find(r => r.path === 'query')!;
    expect(q.hasChildren).toBe(true);
    expect(q.type).toBe('object');
    const t = rows.find(r => r.path === 'sentimentTitle')!;
    /* R84：带 fields 的字段也是可折叠容器；fields 摘要不再塞 attrs 被截断 */
    expect(t.hasChildren).toBe(true);
    expect(t.attrs).toContain('analyzer: my_hanlp_index_store_analyzer');
    expect(t.attrs).not.toContain('standard');
    /* multi-field 产出为真实可查询路径的子行，层级/祖先/标记齐全 */
    const mf = rows.find(r => r.path === 'sentimentTitle.standard')!;
    expect(mf.multi).toBe(true);
    expect(mf.type).toBe('text');
    expect(mf.depth).toBe(1);
    expect(mf.parent).toBe('sentimentTitle');
    expect(mf.ancestors).toContain('sentimentTitle');
    /* 折叠父字段时 multi 子行同样隐藏，+N 计数覆盖 */
    const vis = visibleRows(rows, new Set(['sentimentTitle']));
    expect(vis.some(r => r.path === 'sentimentTitle.standard')).toBe(false);
    expect(descendantCount(rows, 'sentimentTitle')).toBe(1);
  });

  it('空/null properties 回落空数组', () => {
    expect(flattenMapping(null)).toEqual([]);
    expect(flattenMapping({})).toEqual([]);
  });
});

describe('detectDslPollution 查询体污染识别（R81）', () => {
  it('识别出被 DSL 固化的顶层 query 字段', () => {
    expect(detectDslPollution(POLLUTED_PROPS)).toEqual(['query']);
  });

  it('正常业务 mapping 零误报（即使有名为 query 的 keyword 叶子）', () => {
    expect(detectDslPollution({
      title: { type: 'text' },
      query: { type: 'keyword' }, // 叶子字段不是容器，不误报
      nested_biz: { properties: { name: { type: 'keyword' } } },
    })).toEqual([]);
  });

  it('顶层名不在 DSL 根集合内的深层结构不误报', () => {
    expect(detectDslPollution({
      config: { properties: { filter: { type: 'keyword' }, range: { type: 'keyword' } } },
    })).toEqual([]);
  });

  it('命中关键词不足 2 个时保守放行', () => {
    expect(detectDslPollution({
      sort: { properties: { field: { type: 'keyword' }, order: { type: 'keyword' } } },
    })).toEqual([]);
  });
});

describe('visibleRows 折叠可见性 + descendantCount（R81）', () => {
  it('折叠 query 后其整棵子树隐藏，其余行保留', () => {
    const rows = flattenMapping(POLLUTED_PROPS);
    const vis = visibleRows(rows, new Set(['query']));
    expect(vis.some(r => r.path === 'query')).toBe(true); // 容器自身仍可见（供展开）
    expect(vis.some(r => r.path.startsWith('query.'))).toBe(false);
    expect(vis.some(r => r.path === 'sentimentTitle')).toBe(true);
  });

  it('折叠中层节点只隐藏其后代', () => {
    const rows = flattenMapping(POLLUTED_PROPS);
    const vis = visibleRows(rows, new Set(['query.bool.must']));
    expect(vis.some(r => r.path === 'query.bool.boost')).toBe(true);
    expect(vis.some(r => r.path === 'query.bool.must')).toBe(true);
    expect(vis.some(r => r.path.startsWith('query.bool.must.'))).toBe(false);
  });

  it('descendantCount 统计整棵后代（折叠行 +N 数据源）', () => {
    const rows = flattenMapping(POLLUTED_PROPS);
    const total = rows.filter(r => r.path.startsWith('query.')).length;
    expect(descendantCount(rows, 'query')).toBe(total);
    /* R84：multi-fields 层级化后，sentimentTitle 有 1 个 fields 子行（standard） */
    expect(descendantCount(rows, 'sentimentTitle')).toBe(1);
    expect(descendantCount(rows, 'provinceCodeArray')).toBe(0);
  });
});
