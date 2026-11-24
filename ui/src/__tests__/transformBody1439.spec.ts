/**
 * 1439：Transform 体（PUT /_transform/<id>，兼容 /_transform/transforms/<id>）。
 *
 * 体是 {source,dest,pivot|latest,sync,retention_policy,…}；source.query 是 Query DSL
 * （回落整棵查询补全），sync/retention 的 time 各有自己的配置键。
 * 此前落 search 档，根键给 query/aggs 全非法。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, transformBodyKeyItems, transformSourceKeyItems, transformDestKeyItems,
  transformPivotKeyItems, transformTimeKeyItems, transformTimeConfigKeyItems,
  transformBodyRootKeys, transformSourceKeys, transformDestKeys, transformPivotKeys,
  transformSyncKeys, transformSyncTimeKeys, transformRetentionKeys, transformRetentionTimeKeys,
  transformRegionAt,
} from '../utils/dslCompletionContext';
import { lintStructuredBody } from '../utils/dslLint';

const SAMPLE = {
  source: { index: ['logs-*'], query: { term: { env: 'prod' } } },
  dest: { index: 'transformed-logs' },
  pivot: {
    group_by: { day: { date_histogram: { field: '@timestamp', calendar_interval: '1d' } } },
    aggregations: { avg_score: { avg: { field: 'score' } } },
  },
  sync: { time: { field: '@timestamp', delay: '1m' } },
  retention_policy: { time: { field: '@timestamp', max_age: '30d' } },
  description: 'daily rollup',
  frequency: '1m',
  max_page_search_size: 500,
};

describe('1439 Transform 体分档', () => {
  it('路径分派：PUT /_transform/<id>（含 transforms 形态）；_start/GET 不抢', () => {
    expect(bodyKindForPath('/_transform/daily', 'PUT')).toBe('transform-body');
    expect(bodyKindForPath('/_transform/transforms/daily', 'PUT')).toBe('transform-body');
    /* 预览未创建作业 / 更新作业：体同为 transform 定义档 */
    expect(bodyKindForPath('/_transform/_preview', 'POST')).toBe('transform-body');
    expect(bodyKindForPath('/_transform/daily/_update', 'POST')).toBe('transform-body');
    expect(bodyKindForPath('/_transform/transforms/daily/_update', 'POST')).toBe('transform-body');
    expect(bodyKindForPath('/_transform/daily/_update/', 'POST')).toBe('transform-body');
    /* 已存作业的 preview 无体、动作子路由不受扰 */
    expect(bodyKindForPath('/_transform/daily/_preview', 'POST')).toBe('search');
    expect(bodyKindForPath('/_transform/_preview', 'GET')).toBe('search');
    expect(bodyKindForPath('/_transform/daily/_start', 'POST')).toBe('search');
    expect(bodyKindForPath('/_transform/daily', 'GET')).toBe('search');
  });

  it('目录：根十一键 + source/dest/pivot/sync/retention 分层', () => {
    expect(transformBodyRootKeys).toEqual([
      'source', 'dest', 'pivot', 'latest', 'sync', 'retention_policy',
      'description', 'settings', 'frequency', 'max_page_search_size', '_meta',
    ]);
    expect(transformSourceKeys).toEqual(['index', 'query', 'remote']);
    expect(transformDestKeys).toEqual(['index', 'pipeline']);
    expect(transformPivotKeys).toEqual(['group_by', 'aggregations']);
    expect(transformSyncKeys).toEqual(['time']);
    expect(transformSyncTimeKeys).toEqual(['field', 'delay']);
    expect(transformRetentionKeys).toEqual(['time']);
    expect(transformRetentionTimeKeys).toEqual(['field', 'max_age']);
    expect(transformBodyKeyItems().find(i => i.label === 'pivot')?.detail).toContain('group_by');
    expect(transformTimeKeyItems('sync')[0].detail).toContain('时间');
    expect(transformTimeConfigKeyItems('sync').map(i => i.label)).toContain('delay');
    expect(transformTimeConfigKeyItems('retention').map(i => i.label)).toContain('max_age');
  });

  it('区域：根 / source / source.query / dest / pivot / sync(.time) / retention(.time)', () => {
    const at = (s: string) => transformRegionAt(s, s.length);
    expect(at('{')).toBe('root');
    expect(at('{"source": {')).toBe('source');
    expect(at('{"source": {"query": {')).toBe('source-query');
    expect(at('{"dest": {')).toBe('dest');
    expect(at('{"pivot": {')).toBe('pivot');
    expect(at('{"sync": {')).toBe('sync');
    expect(at('{"sync": {"time": {')).toBe('sync-time');
    expect(at('{"retention_policy": {')).toBe('retention');
    expect(at('{"retention_policy": {"time": {')).toBe('retention-time');
    expect(at('{"source": {"index": [')).toBe('deep');
  });

  it('lint：样例体静默；根键/源/sync.time 拼错分段点名；search 根键被拒', () => {
    expect(lintStructuredBody('transform-body', JSON.stringify(SAMPLE))).toEqual([]);

    const root = lintStructuredBody('transform-body', JSON.stringify({ sourc: {} }));
    expect(root.some(f => f.message.includes('Transform 体') && f.message.includes('最接近：source'))).toBe(true);

    const src = lintStructuredBody('transform-body', JSON.stringify({ source: { indez: ['x'] } }));
    expect(src.some(f => f.message.includes('Transform 源') && f.message.includes('最接近：index'))).toBe(true);

    const sync = lintStructuredBody('transform-body', JSON.stringify({ sync: { time: { dely: '1m' } } }));
    expect(sync.some(f => f.message.includes('Transform 同步时间') && f.message.includes('最接近：delay'))).toBe(true);

    const q = lintStructuredBody('transform-body', JSON.stringify({ query: {}, dest: { index: 'x' } }));
    expect(q.some(f => f.message.includes('Transform 体') && f.message.includes('query'))).toBe(true);
  });
});
