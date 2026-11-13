/**
 * 1439：ML 异常检测作业体（PUT /_ml/anomaly_detectors/<id>，6.x 兼容 _xpack/ml）。
 *
 * 体是 {analysis_config,analysis_limits,data_description,…}；detectors[] 元素
 * 是「检测函数 + 字段」，analysis_config/analysis_limits/data_description 各自闭集。
 * 此前落 search 档，根键给 query/aggs 全非法。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, mlJobBodyKeyItems, mlAnalysisConfigKeyItems, mlDetectorKeyItems,
  mlAnalysisLimitsKeyItems, mlDataDescriptionKeyItems, mlJobBodyRootKeys, mlAnalysisConfigKeys,
  mlDetectorKeys, mlAnalysisLimitsKeys, mlDataDescriptionKeys, mlJobRegionAt,
} from '../utils/dslCompletionContext';
import { lintStructuredBody } from '../utils/dslLint';

const SAMPLE = {
  job_id: 'latency-job',
  analysis_config: {
    bucket_span: '15m',
    detectors: [{ function: 'mean', field_name: 'responsetime', by_field_name: 'airline' }],
    influencers: ['airline'],
  },
  analysis_limits: { model_memory_limit: '1024mb', categorization_examples_limit: 4 },
  data_description: { time_field: '@timestamp' },
  description: 'latency anomaly job',
  background_persist_interval: '1h',
  model_plot_config: { enabled: true },
  model_snapshot_retention_days: 10,
  renormalization_window_days: 30,
  results_retention_days: 30,
  allow_lazy_open: false,
};

describe('1439 ML 作业体分档', () => {
  it('路径分派：PUT /_ml/anomaly_detectors/<id>（含 _xpack）；_update/GET 不抢', () => {
    expect(bodyKindForPath('/_ml/anomaly_detectors/latency', 'PUT')).toBe('ml-job-body');
    expect(bodyKindForPath('/_xpack/ml/anomaly_detectors/latency', 'PUT')).toBe('ml-job-body');
    expect(bodyKindForPath('/_ml/anomaly_detectors/latency/_update', 'POST')).toBe('search');
    expect(bodyKindForPath('/_ml/anomaly_detectors/latency', 'GET')).toBe('search');
  });

  it('目录：根十六键 + 分析配置/检测器/上限/数据描述', () => {
    expect(mlJobBodyRootKeys).toEqual([
      'job_id', 'analysis_config', 'analysis_limits', 'data_description', 'description', 'groups',
      'background_persist_interval', 'model_plot_config',
      'model_snapshot_retention_days', 'daily_model_snapshot_retention_after_days',
      'renormalization_window_days', 'results_retention_days',
      'results_index_name', 'allow_lazy_open', 'custom_settings', 'datafeed_config',
    ]);
    expect(mlAnalysisConfigKeys).toEqual([
      'bucket_span', 'latency', 'detectors', 'influencers',
      'categorization_field_name', 'categorization_filters', 'summary_count_field_name',
    ]);
    expect(mlDetectorKeys).toEqual([
      'function', 'field_name', 'by_field_name', 'over_field_name', 'partition_field_name',
      'detector_description', 'exclude_frequent', 'use_null',
    ]);
    expect(mlAnalysisLimitsKeys).toEqual(['model_memory_limit', 'categorization_examples_limit']);
    expect(mlDataDescriptionKeys).toEqual(['time_field', 'time_format']);
    expect(mlJobBodyKeyItems().find(i => i.label === 'analysis_config')?.detail).toContain('detectors');
    expect(mlDetectorKeyItems().find(i => i.label === 'function')?.detail).toContain('mean');
  });

  it('区域：根 / analysis_config / detectors 元素 / analysis_limits / data_description', () => {
    const at = (s: string) => mlJobRegionAt(s, s.length);
    expect(at('{')).toBe('root');
    expect(at('{"analysis_config": {')).toBe('analysis-config');
    expect(at('{"analysis_config": {"detectors": [{')).toBe('detector');
    expect(at('{"analysis_limits": {')).toBe('analysis-limits');
    expect(at('{"data_description": {')).toBe('data-description');
    expect(at('{"analysis_config": {"detectors": [{"function": {')).toBe('deep');
  });

  it('lint：样例体静默；根/分析配置/检测器/上限拼错分段点名；search 根键被拒', () => {
    expect(lintStructuredBody('ml-job-body', JSON.stringify(SAMPLE))).toEqual([]);

    const root = lintStructuredBody('ml-job-body', JSON.stringify({ analysis_confg: {} }));
    expect(root.some(f => f.message.includes('ML 作业体') && f.message.includes('最接近：analysis_config'))).toBe(true);

    const cfg = lintStructuredBody('ml-job-body', JSON.stringify({ analysis_config: { bucket_spam: '15m' } }));
    expect(cfg.some(f => f.message.includes('ML 分析配置') && f.message.includes('最接近：bucket_span'))).toBe(true);

    const det = lintStructuredBody('ml-job-body', JSON.stringify({ analysis_config: { detectors: [{ funtion: 'mean' }] } }));
    expect(det.some(f => f.message.includes('ML 检测器 #1') && f.message.includes('最接近：function'))).toBe(true);

    const lim = lintStructuredBody('ml-job-body', JSON.stringify({ analysis_limits: { model_memory_limt: '1gb' } }));
    expect(lim.some(f => f.message.includes('ML 分析上限') && f.message.includes('最接近：model_memory_limit'))).toBe(true);

    const q = lintStructuredBody('ml-job-body', JSON.stringify({ aggs: {}, analysis_config: {} }));
    expect(q.some(f => f.message.includes('ML 作业体') && f.message.includes('aggs'))).toBe(true);
  });
});
