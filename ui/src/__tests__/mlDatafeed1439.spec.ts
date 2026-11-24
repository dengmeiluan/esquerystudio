/**
 * 1439：ML 数据馈送体（PUT /_ml/datafeeds/<id>，6.x 兼容 _xpack/ml）。
 *
 * 体是 {job_id,indexes,query,frequency,scroll_size,delayed_data_check_config,
 * chunking_config,indices_options,…}；query 是 Query DSL（回落整棵查询补全）。
 * 此前落 search 档，根键给 query/aggs 全非法。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, mlDatafeedBodyKeyItems, mlDelayedCheckKeyItems, mlChunkingKeyItems,
  mlIndicesOptionsKeyItems, mlDatafeedBodyRootKeys, mlDelayedKeys, mlChunkingKeys,
  mlIndicesOptionsKeys, mlDatafeedRegionAt,
} from '../utils/dslCompletionContext';
import { lintStructuredBody } from '../utils/dslLint';

const SAMPLE = {
  job_id: 'latency-job',
  indexes: ['logs-*'],
  query: { term: { env: 'prod' } },
  query_delay: '60s',
  frequency: '60s',
  scroll_size: 1000,
  delayed_data_check_config: { enabled: true, check_window: '1h' },
  chunking_config: { mode: 'auto' },
  indices_options: { expand_wildcards: ['open'], ignore_unavailable: true },
};

describe('1439 ML 数据馈送体分档', () => {
  it('路径分派：PUT /_ml/datafeeds/<id>（含 _xpack）；_update/GET 不抢', () => {
    expect(bodyKindForPath('/_ml/datafeeds/latency', 'PUT')).toBe('ml-datafeed-body');
    expect(bodyKindForPath('/_xpack/ml/datafeeds/latency', 'PUT')).toBe('ml-datafeed-body');
    expect(bodyKindForPath('/_ml/datafeeds/latency/_update', 'POST')).toBe('search');
    expect(bodyKindForPath('/_ml/datafeeds/latency', 'GET')).toBe('search');
  });

  it('目录：根十一键 + 三个嵌套配置', () => {
    expect(mlDatafeedBodyRootKeys).toEqual([
      'job_id', 'indexes', 'query', 'query_delay', 'frequency', 'scroll_size',
      'aggregations', 'script_fields', 'max_empty_searches',
      'delayed_data_check_config', 'chunking_config', 'indices_options', 'runtime_mappings', 'headers',
    ]);
    expect(mlDelayedKeys).toEqual(['enabled', 'check_window']);
    expect(mlChunkingKeys).toEqual(['mode', 'time_span']);
    expect(mlIndicesOptionsKeys).toEqual(['expand_wildcards', 'ignore_unavailable', 'allow_no_indices']);
    expect(mlDatafeedBodyKeyItems().find(i => i.label === 'query')?.detail).toContain('Query DSL');
    expect(mlChunkingKeyItems().find(i => i.label === 'mode')?.detail).toContain('auto');
  });

  it('区域：根 / query / 延迟检查 / 分块 / 索引选项 / 更深', () => {
    const at = (s: string) => mlDatafeedRegionAt(s, s.length);
    expect(at('{')).toBe('root');
    expect(at('{"query": {')).toBe('query');
    expect(at('{"query": {"bool": {')).toBe('query');
    expect(at('{"delayed_data_check_config": {')).toBe('delayed');
    expect(at('{"chunking_config": {')).toBe('chunking');
    expect(at('{"indices_options": {')).toBe('indices');
    expect(at('{"indices_options": {"expand_wildcards": [')).toBe('deep');
  });

  it('lint：样例体静默；根键/延迟/分块拼错分段点名；search 根键被拒', () => {
    expect(lintStructuredBody('ml-datafeed-body', JSON.stringify(SAMPLE))).toEqual([]);
    expect(lintStructuredBody('ml-datafeed-body', JSON.stringify({
      job_id: 'summary-job',
      indexes: ['logs-*'],
      aggregations: { by_host: { terms: { field: 'host' } } },
      script_fields: { hour: { script: { source: 'doc["@timestamp"].value.hour' } } },
      max_empty_searches: 10,
    }))).toEqual([]);

    const root = lintStructuredBody('ml-datafeed-body', JSON.stringify({ jobidd: 'x' }));
    expect(root.some(f => f.message.includes('ML 数据馈送体') && f.message.includes('最接近：job_id'))).toBe(true);

    const delayed = lintStructuredBody('ml-datafeed-body', JSON.stringify({
      delayed_data_check_config: { enabledd: true },
    }));
    expect(delayed.some(f => f.message.includes('ML 延迟检查') && f.message.includes('最接近：enabled'))).toBe(true);

    const chunk = lintStructuredBody('ml-datafeed-body', JSON.stringify({ chunking_config: { modee: 'auto' } }));
    expect(chunk.some(f => f.message.includes('ML 分块配置') && f.message.includes('最接近：mode'))).toBe(true);

    const q = lintStructuredBody('ml-datafeed-body', JSON.stringify({ aggs: {}, indexes: ['x'] }));
    expect(q.some(f => f.message.includes('ML 数据馈送体') && f.message.includes('aggs'))).toBe(true);
  });
});
