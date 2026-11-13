/**
 * 1439：Rollup 作业体（PUT /_rollup/job/<id>，6.x 兼容 _xpack/rollup）。
 *
 * 体是 {index_pattern,rollup_index,cron,page_size,groups,metrics,…}；
 * groups 下分 date_histogram/terms/histogram 三型，metrics 元素是 {field,metrics}。
 * 此前落 search 档，根键给 query/aggs 全非法。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, rollupJobBodyKeyItems, rollupGroupsKeyItems, rollupDateGroupKeyItems,
  rollupFieldGroupKeyItems, rollupMetricKeyItems, rollupJobBodyRootKeys, rollupGroupKeys,
  rollupDateGroupKeys, rollupTermsGroupKeys, rollupHistogramGroupKeys, rollupMetricKeys,
  ROLLUP_GROUP_TYPES, rollupRegionAt,
} from '../utils/dslCompletionContext';
import { lintStructuredBody } from '../utils/dslLint';

const SAMPLE = {
  index_pattern: 'logs-*',
  rollup_index: 'logs-rollup',
  cron: '0 */30 * * * ?',
  page_size: 1000,
  groups: {
    date_histogram: { field: '@timestamp', calendar_interval: '1h' },
    terms: { fields: ['host'] },
  },
  metrics: [{ field: 'bytes', metrics: ['min', 'max', 'sum'] }],
  timeout: '20s',
};

describe('1439 Rollup 作业体分档', () => {
  it('路径分派：PUT /_rollup/job/<id>（含 _xpack）；_start/GET 不抢', () => {
    expect(bodyKindForPath('/_rollup/job/daily', 'PUT')).toBe('rollup-job-body');
    expect(bodyKindForPath('/_xpack/rollup/job/daily', 'PUT')).toBe('rollup-job-body');
    expect(bodyKindForPath('/_rollup/job/daily/_start', 'POST')).toBe('search');
    expect(bodyKindForPath('/_rollup/job/daily', 'GET')).toBe('search');
  });

  it('目录：根八键 + 分组三型 + 指标元素', () => {
    expect(rollupJobBodyRootKeys).toEqual([
      'index_pattern', 'rollup_index', 'cron', 'page_size', 'groups', 'metrics', 'timeout', 'headers',
    ]);
    expect(ROLLUP_GROUP_TYPES).toEqual(['date_histogram', 'terms', 'histogram']);
    expect(rollupGroupKeys).toEqual(['date_histogram', 'terms', 'histogram']);
    expect(rollupDateGroupKeys).toEqual(['field', 'calendar_interval', 'fixed_interval', 'time_zone']);
    expect(rollupTermsGroupKeys).toEqual(['fields']);
    expect(rollupHistogramGroupKeys).toEqual(['fields', 'interval']);
    expect(rollupMetricKeys).toEqual(['field', 'metrics']);
    expect(rollupJobBodyKeyItems().find(i => i.label === 'metrics')?.detail).toContain('指标');
    expect(rollupFieldGroupKeyItems('histogram').map(i => i.label)).toContain('interval');
    expect(rollupMetricKeyItems().find(i => i.label === 'metrics')?.detail).toContain('min');
  });

  it('区域：根 / groups / 分组类型 / metric / 更深', () => {
    const at = (s: string) => rollupRegionAt(s, s.length);
    expect(at('{')).toBe('root');
    expect(at('{"groups": {')).toBe('groups');
    expect(at('{"groups": {"date_histogram": {')).toBe('date-group');
    expect(at('{"groups": {"terms": {')).toBe('terms-group');
    expect(at('{"groups": {"histogram": {')).toBe('histogram-group');
    expect(at('{"metrics": [{')).toBe('metric');
    expect(at('{"groups": {"terms": {"fields": [')).toBe('deep');
    expect(at('{"metrics": [{"field": "x", "metrics": [')).toBe('deep');
  });

  it('lint：样例体静默；根键/分组/时间分组/指标拼错分段点名；search 根键被拒', () => {
    expect(lintStructuredBody('rollup-job-body', JSON.stringify(SAMPLE))).toEqual([]);

    const root = lintStructuredBody('rollup-job-body', JSON.stringify({ index_patern: 'x' }));
    expect(root.some(f => f.message.includes('Rollup 作业体') && f.message.includes('最接近：index_pattern'))).toBe(true);

    const groups = lintStructuredBody('rollup-job-body', JSON.stringify({ groups: { date_historgram: {} } }));
    expect(groups.some(f => f.message.includes('Rollup 分组') && f.message.includes('最接近：date_histogram'))).toBe(true);

    const date = lintStructuredBody('rollup-job-body', JSON.stringify({
      groups: { date_histogram: { calender_interval: '1h' } },
    }));
    expect(date.some(f => f.message.includes('Rollup 时间分组') && f.message.includes('最接近：calendar_interval'))).toBe(true);

    const metric = lintStructuredBody('rollup-job-body', JSON.stringify({ metrics: [{ field: 'x', metricz: [] }] }));
    expect(metric.some(f => f.message.includes('Rollup 指标 #1') && f.message.includes('最接近：metrics'))).toBe(true);

    const q = lintStructuredBody('rollup-job-body', JSON.stringify({ query: {}, index_pattern: 'x' }));
    expect(q.some(f => f.message.includes('Rollup 作业体') && f.message.includes('query'))).toBe(true);
  });
});
