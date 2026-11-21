/**
 * 1439：管道试跑体（POST /_ingest/pipeline[_/<id>]/_simulate）。
 *
 * 体是 {pipeline?,docs,verbose}；pipeline 内是处理器链（与管道体同源），
 * docs[] 元素给 _index/_id/_source/_routing。此前落 search 档，根键给 query/aggs 全非法。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, ingestSimulateBodyKeyItems, ingestSimulateDocKeyItems,
  ingestSimulateBodyRootKeys, ingestSimulateDocKeys, ingestSimulateRegionAt,
} from '../utils/dslCompletionContext';
import { lintStructuredBody } from '../utils/dslLint';

const SAMPLE = {
  pipeline: { processors: [{ set: { field: 'env', value: 'prod' } }] },
  docs: [{ _index: 'logs-2026', _id: '1', _source: { message: 'hello' } }],
  verbose: true,
};

describe('1439 管道试跑体分档', () => {
  it('路径分派：POST …/_simulate（含 id 形态）；管道体/GET 不受影响', () => {
    expect(bodyKindForPath('/_ingest/pipeline/_simulate', 'POST')).toBe('ingest-simulate-body');
    expect(bodyKindForPath('/_ingest/pipeline/logs-v1/_simulate', 'POST')).toBe('ingest-simulate-body');
    expect(bodyKindForPath('/_ingest/pipeline/logs-v1', 'PUT')).toBe('ingest-pipeline-body');
    expect(bodyKindForPath('/_ingest/pipeline/logs-v1', 'GET')).toBe('search');
  });

  it('目录：根三键 + docs 元素键', () => {
    expect(ingestSimulateBodyRootKeys).toEqual(['pipeline', 'docs', 'verbose']);
    expect(ingestSimulateDocKeys).toEqual(['_index', '_id', '_source', '_routing']);
    expect(ingestSimulateBodyKeyItems().find(i => i.label === 'docs')?.detail).toContain('_source');
    expect(ingestSimulateDocKeyItems().find(i => i.label === '_source')?.detail).toContain('文档内容');
  });

  it('区域：根 / pipeline / pipeline.processors·on_failure / docs 元素 / 更深', () => {
    const at = (s: string) => ingestSimulateRegionAt(s, s.length);
    expect(at('{')).toBe('root');
    expect(at('{"pipeline": {')).toBe('pipeline');
    expect(at('{"pipeline": {"processors": [{')).toBe('pipeline-processor');
    expect(at('{"pipeline": {"on_failure": {')).toBe('pipeline-processor');
    expect(at('{"docs": [{')).toBe('doc');
    expect(at('{"docs": [{"_source": {')).toBe('deep');
    expect(at('{"pipeline": {"processors": [{"set": {')).toBe('deep');
  });

  it('lint：样例体静默；根键/处理器/文档键拼错分段点名；search 根键被拒', () => {
    expect(lintStructuredBody('ingest-simulate-body', JSON.stringify(SAMPLE))).toEqual([]);

    const root = lintStructuredBody('ingest-simulate-body', JSON.stringify({ docz: [] }));
    expect(root.some(f => f.message.includes('管道试跑体') && f.message.includes('最接近：docs'))).toBe(true);

    const proc = lintStructuredBody('ingest-simulate-body', JSON.stringify({
      pipeline: { processors: [{ sett: { field: 'x', value: 'y' } }] },
    }));
    expect(proc.some(f => f.message.includes('试跑处理器 #1') && f.message.includes('最接近：set'))).toBe(true);

    const doc = lintStructuredBody('ingest-simulate-body', JSON.stringify({ docs: [{ _sorce: {} }] }));
    expect(doc.some(f => f.message.includes('试跑文档 #1') && f.message.includes('最接近：_source'))).toBe(true);

    const q = lintStructuredBody('ingest-simulate-body', JSON.stringify({ query: {}, docs: [] }));
    expect(q.some(f => f.message.includes('管道试跑体') && f.message.includes('query'))).toBe(true);
  });
});
