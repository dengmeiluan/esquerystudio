/**
 * 1439：Ingest 管道体（PUT /_ingest/pipeline/<id>）。
 *
 * 体是 {description,version,processors,on_failure,_meta}；processors/on_failure 的元素是
 * 「处理器类型 → 参数」对象。此前落 search 档，根键给 query/aggs 全非法。
 * 处理器对象还允许 tag/description/if/ignore_failure/on_failure 公共键，lint 不得误报。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, ingestPipelineBodyKeyItems, ingestProcessorKeyItems, ingestPipelineBodyRootKeys,
  INGEST_PROCESSOR_TYPES, INGEST_PROCESSOR_COMMON_KEYS, ingestPipelineRegionAt,
} from '../utils/dslCompletionContext';
import { lintStructuredBody } from '../utils/dslLint';

const SAMPLE = {
  description: 'parse logs',
  version: 1,
  processors: [
    { set: { field: 'env', value: 'prod' }, if: 'ctx.env == null' },
    { rename: { field: 'msg', target_field: 'message' }, ignore_failure: true },
    { grok: { field: 'message', patterns: ['%{GREEDYDATA:msg}'] } },
  ],
  on_failure: [{ set: { field: 'error.message', value: '{{ _ingest.on_failure_message }}' } }],
  _meta: { owner: 'ops' },
};

describe('1439 Ingest 管道体分档', () => {
  it('路径分派：PUT /_ingest/pipeline/<id>；_simulate 归试跑体、GET 不抢', () => {
    expect(bodyKindForPath('/_ingest/pipeline/logs-v1', 'PUT')).toBe('ingest-pipeline-body');
    expect(bodyKindForPath('/_ingest/pipeline/logs-v1', 'GET')).toBe('search');
    expect(bodyKindForPath('/_ingest/pipeline/_simulate', 'POST')).toBe('ingest-simulate-body');
  });

  it('目录：根五键；处理器类型全目录与公共开关', () => {
    expect(ingestPipelineBodyRootKeys).toEqual(['description', 'version', 'processors', 'on_failure', '_meta']);
    expect(ingestPipelineBodyKeyItems().find(i => i.label === 'processors')?.detail).toContain('处理器');
    for (const t of ['set', 'rename', 'remove', 'convert', 'date', 'grok', 'dissect', 'json', 'kv', 'csv', 'script', 'pipeline', 'foreach', 'fail', 'drop', 'enrich', 'geoip', 'user_agent']) {
      expect(INGEST_PROCESSOR_TYPES, t).toContain(t);
      expect(ingestProcessorKeyItems().map(i => i.label), t).toContain(t);
    }
    expect(INGEST_PROCESSOR_COMMON_KEYS).toEqual(['tag', 'description', 'if', 'ignore_failure', 'on_failure']);
  });

  it('区域：根 / processors 元素 / on_failure（数组元素或单对象）/ 更深', () => {
    const at = (s: string) => ingestPipelineRegionAt(s, s.length);
    expect(at('{')).toBe('root');
    expect(at('{"processors": [{')).toBe('processor');
    expect(at('{"processors": [{"set": {')).toBe('deep');
    expect(at('{"on_failure": [{')).toBe('processor');
    expect(at('{"on_failure": {')).toBe('processor');
  });

  it('lint：样例体静默（公共开关 if/ignore_failure 不误报）；拼错处理器/根键分段点名', () => {
    expect(lintStructuredBody('ingest-pipeline-body', JSON.stringify(SAMPLE))).toEqual([]);

    const proc = lintStructuredBody('ingest-pipeline-body', JSON.stringify({
      processors: [{ sett: { field: 'x', value: 'y' } }],
    }));
    expect(proc.some(f => f.message.includes('Ingest 处理器 #1') && f.message.includes('最接近：set'))).toBe(true);

    const fail = lintStructuredBody('ingest-pipeline-body', JSON.stringify({
      on_failure: [{ set: { field: 'x', value: 'y' }, iff: 'true' }],
    }));
    expect(fail.some(f => f.message.includes('Ingest on_failure #1') && f.message.includes('iff'))).toBe(true);

    const root = lintStructuredBody('ingest-pipeline-body', JSON.stringify({ processor: [] }));
    expect(root.some(f => f.message.includes('Ingest 管道体') && f.message.includes('最接近：processors'))).toBe(true);
  });
});
