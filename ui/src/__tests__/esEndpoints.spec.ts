import { describe, it, expect } from 'vitest';
import { ES_ENDPOINTS, filterEndpoints, tplHasIndexSlot, fillIndexSlot } from '../utils/esEndpoints';

describe('esEndpoints', () => {
  it('目录完整性：每条含 methods/path/doc；≥30 条；覆盖 _search/_mapping/_settings/_cat/_cluster/_reindex', () => {
    expect(ES_ENDPOINTS.length).toBeGreaterThanOrEqual(30);
    for (const e of ES_ENDPOINTS) {
      expect(e.methods.length).toBeGreaterThan(0);
      expect(e.path.startsWith('/')).toBe(true);
      expect(e.doc.length).toBeGreaterThan(0);
    }
    for (const probe of ['_search', '_mapping', '_settings', '/_cat/', '/_cluster/', '_reindex']) {
      expect(ES_ENDPOINTS.some(e => e.path.includes(probe)), probe).toBe(true);
    }
  });
  it('filterEndpoints 按路径前缀/子串过滤，_search 关键词命中 /{index}/_search', () => {
    const hits = filterEndpoints('_sea');
    expect(hits.some(e => e.path === '/{index}/_search')).toBe(true);
    expect(filterEndpoints('/').length).toBe(ES_ENDPOINTS.length);
  });
  it('tplHasIndexSlot / fillIndexSlot', () => {
    expect(tplHasIndexSlot('/{index}/_search')).toBe(true);
    expect(tplHasIndexSlot('/_cluster/health')).toBe(false);
    expect(fillIndexSlot('/{index}/_search', 'logs-2026.08')).toBe('/logs-2026.08/_search');
  });
  it('_search 端点带 body snippet（含 query 骨架）', () => {
    const ep = ES_ENDPOINTS.find(e => e.path === '/{index}/_search')!;
    expect(ep.body).toContain('"query"');
  });
  /* 增补用例（计划 4 条之上附加，不改动计划条目）： */
  it('增补：body snippet 为合法 JSON（bulk 端点为逐行 NDJSON）', () => {
    for (const e of ES_ENDPOINTS) {
      if (!e.body) continue;
      try {
        JSON.parse(e.body);
      } catch {
        const lines = e.body.split('\n').map(s => s.trim()).filter(Boolean);
        expect(lines.length, e.path).toBeGreaterThan(0);
        for (const line of lines) {
          expect(() => JSON.parse(line), `${e.path}: ${line}`).not.toThrow();
        }
      }
    }
  });
  it('增补：filterEndpoints 支持 doc 中文匹配（"集群健康" 命中 _cluster/_cat health）', () => {
    const hits = filterEndpoints('集群健康');
    expect(hits.some(e => e.path === '/_cluster/health')).toBe(true);
    expect(hits.some(e => e.path === '/_cat/health')).toBe(true);
  });
  it('增补：结果上限 30 条（宽关键词 "_" 触发截断）', () => {
    const hits = filterEndpoints('_');
    expect(hits.length).toBeLessThanOrEqual(30);
    expect(hits.length).toBe(30);
  });
  it('增补：T9 评审 under-listing 补全——_refresh 收 GET、_bulk 收 PUT（7.10 spec 合法方法，method gating 不误灰）', () => {
    expect(ES_ENDPOINTS.find(e => e.path === '/{index}/_refresh')!.methods).toEqual(['POST', 'GET']);
    expect(ES_ENDPOINTS.find(e => e.path === '/{index}/_bulk')!.methods).toEqual(['POST', 'PUT']);
  });

  it('管理面预设方法跟官方 spec：PUT/POST 双方法不误灰（1439）', () => {
    const methodsOf = (path: string) => ES_ENDPOINTS.find(e => e.path === path)!.methods;
    expect(methodsOf('/_security/api_key')).toEqual(['PUT', 'POST']);
    expect(methodsOf('/_security/_query/api_key')).toEqual(['POST']);
    expect(methodsOf('/_security/privilege')).toEqual(['PUT', 'POST']);
    expect(methodsOf('/_security/role/{name}')).toEqual(['PUT', 'POST']);
    expect(methodsOf('/_security/user/{name}')).toEqual(['PUT', 'POST']);
    expect(methodsOf('/_security/role_mapping/{name}')).toEqual(['PUT', 'POST']);
    expect(methodsOf('/_snapshot/{repository}')).toEqual(['PUT', 'POST']);
    expect(methodsOf('/_snapshot/{repository}/{snapshot}/_clone/{target_snapshot}')).toEqual(['PUT']);
    expect(methodsOf('/_index_template/{name}')).toEqual(['PUT', 'POST']);
    expect(methodsOf('/_component_template/{name}')).toEqual(['PUT', 'POST']);
    expect(methodsOf('/_license')).toEqual(['PUT', 'POST']);
    expect(methodsOf('/_watcher/watch/{watch_id}')).toEqual(['PUT', 'POST']);
    expect(methodsOf('/_scripts/{id}')).toEqual(['PUT', 'POST']);
  });
});
