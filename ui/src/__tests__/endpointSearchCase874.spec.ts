/**
 * 端点目录搜索 doc 兜底大小写规整一刀（filterEndpoints 单源）。
 * 背景：filterEndpoints 函数体内两套口径——path 侧匹配用规整后的 k（剥前导
 * 斜杠+toLowerCase），doc 兜底却用原始 kw。实际动线：DevTools/Rest 端点目录
 * 输入小写 "id" 时，「写入文档（自增 ID）」条目的 path（/{index}/_doc，不含
 * id 槽位段）与 doc（ID 为大写）双双落空，改输大写 "ID" 才能搜到；全站搜索面
 * （表格查找/命令面板/查询历史/索引清单/拓扑面板）均为大小写不敏感口径，
 * 本单源是同域漏网件。
 * 锁定：
 * 1) 小写 "id" 经 doc 兜底命中「写入文档（自增 ID）」（修复前漏）；
 * 2) 大小写对称：'ID' 与 'id' 的命中集合一致（修复前 'ID' 命中、'id' 漏）；
 * 3) 回归面：path 侧前缀/子串排序行为与中文 doc 匹配不受扰；
 * 4) 源码锁：doc 兜底禁用原始 kw（防两口径回潮）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ES_ENDPOINTS, filterEndpoints } from '../utils/esEndpoints';

const src = readFileSync(join(__dirname, '../utils/esEndpoints.ts'), 'utf-8');

const autodocPost = ES_ENDPOINTS.find(
  e => e.methods.includes('POST') && e.path === '/{index}/_doc',
)!;

describe('端点目录搜索 doc 兜底大小写规整', () => {
  it('小写 "id" 经 doc 兜底命中「写入文档（自增 ID）」（该条 path 不含 id 槽位段）', () => {
    expect(autodocPost.doc).toBe('写入文档（自增 ID）');
    const hits = filterEndpoints('id');
    expect(hits).toContain(autodocPost);
  });

  it('大小写对称：\'ID\' 与 \'id\' 的命中集合一致', () => {
    const pathsOf = (kw: string) => filterEndpoints(kw).map(e => e.path + ':' + e.methods.join('/'));
    expect(pathsOf('id')).toEqual(pathsOf('ID'));
  });

  it('回归面：path 侧前缀档排序与中文 doc 匹配不受扰', () => {
    const mapHits = filterEndpoints('mapping');
    expect(mapHits[0]?.path).toBe('/{index}/_mapping');
    const zhHits = filterEndpoints('自增');
    expect(zhHits).toContain(autodocPost);
    expect(filterEndpoints('/').length).toBe(ES_ENDPOINTS.length);
  });

  it('源码锁：doc 兜底禁用原始 kw（防两口径回潮）', () => {
    expect(src).not.toContain('doc.includes(kw');
  });
});
