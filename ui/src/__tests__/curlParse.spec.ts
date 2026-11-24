/**
 * W6 Task 3：parseCurl 纯函数硬契约——curl 命令文本 → {method,path,body}。
 * 仅解析形态（不校验语义）；识别不了返回 null（调用方提示不动手）。
 * 覆盖：基础 GET / -X+单引号 body / 双引号转义 body + -H 跳过 / 无 -X 有 -d 落 POST（curl 语义）/
 *       反斜杠续行拍平 / --compressed -k -u 跳过 / 非 curl 文本 null。
 */
import { describe, it, expect } from 'vitest';
import { parseCurl } from '../utils/curlParse';

describe('parseCurl', () => {
  it('基础 GET', () => {
    expect(parseCurl('curl http://localhost:9200/_cat/indices?v')).toEqual(
      { method: 'GET', path: '/_cat/indices?v', body: '' });
  });
  it('-X PUT + -d body（单引号）', () => {
    const r = parseCurl(`curl -X PUT 'http://es:9200/my-index' -d '{"settings":{"number_of_shards":1}}'`);
    expect(r).toEqual({ method: 'PUT', path: '/my-index', body: '{"settings":{"number_of_shards":1}}' });
  });
  it('双引号 body + -H 头跳过', () => {
    const r = parseCurl('curl -X POST "http://es:9200/idx/_search" -H "Content-Type: application/json" -d "{\\"query\\":{\\"match_all\\":{}}}"');
    expect(r?.method).toBe('POST'); expect(r?.path).toBe('/idx/_search');
    expect(r?.body).toBe('{"query":{"match_all":{}}}');
  });
  it('无 -X 有 -d → POST（curl 语义）', () => {
    expect(parseCurl('curl http://es:9200/idx/_doc -d "{}"')?.method).toBe('POST');
  });
  it('反斜杠续行拍平', () => {
    const r = parseCurl('curl -X GET \\\n  "http://es:9200/idx/_search"');
    expect(r?.path).toBe('/idx/_search');
  });
  it('--compressed / -k / -u 跳过', () => {
    const r = parseCurl(`curl --compressed -k -u admin:pass "https://es:9200/_cluster/health"`);
    expect(r).toEqual({ method: 'GET', path: '/_cluster/health', body: '' });
  });
  it('非 curl 文本 → null', () => {
    expect(parseCurl('GET /_search')).toBeNull();
    expect(parseCurl('')).toBeNull();
  });
});
