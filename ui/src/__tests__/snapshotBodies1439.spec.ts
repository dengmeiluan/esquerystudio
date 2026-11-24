/**
 * 1439：快照三写体——注册仓库 / 创建快照 / 恢复快照。
 *
 * 这些路径此前落默认 search 档（根键给 query/sort/aggs，写下去 ES 拒）；
 * 三个端点体形态不同，按 `_snapshot` 后的段数与方法分流：
 *   PUT  /_snapshot/<repo>                    → snapshot-repo-body
 *   PUT|POST /_snapshot/<repo>/<snap>         → snapshot-create-body
 *   POST /_snapshot/<repo>/<snap>/_restore    → snapshot-restore-body
 * 只读子路径（_status / GET / DELETE）不进这些档。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, SNAPSHOT_REPO_TYPES, snapshotRepoBodyKeyItems, snapshotCreateBodyKeyItems,
  snapshotRestoreBodyKeyItems, snapshotRepoBodyRootKeys, snapshotCreateBodyRootKeys, snapshotRestoreBodyRootKeys,
} from '../utils/dslCompletionContext';
import { lintStructuredBody } from '../utils/dslLint';

describe('1439 快照写体分档', () => {
  it('路径分派：仓库 / 创建 / 恢复；只读子路径不抢档', () => {
    expect(bodyKindForPath('/_snapshot/my_backup', 'PUT')).toBe('snapshot-repo-body');
    expect(bodyKindForPath('/_snapshot/my_backup/snap-1', 'PUT')).toBe('snapshot-create-body');
    expect(bodyKindForPath('/_snapshot/my_backup/snap-1', 'POST')).toBe('snapshot-create-body');
    expect(bodyKindForPath('/_snapshot/my_backup/snap-1/_restore', 'POST')).toBe('snapshot-restore-body');
    /* 只读/无体：不误判成写体 */
    expect(bodyKindForPath('/_snapshot/_status', 'GET')).toBe('search');
    expect(bodyKindForPath('/_snapshot/my_backup/snap-1', 'GET')).toBe('search');
    expect(bodyKindForPath('/_snapshot/my_backup/snap-1/_status', 'GET')).toBe('search');
  });

  it('仓库体：type/settings/verify；type 值域给六类仓库', () => {
    expect(snapshotRepoBodyRootKeys).toEqual(['type', 'settings', 'verify']);
    expect(SNAPSHOT_REPO_TYPES.map(t => t.label)).toEqual(['fs', 'url', 's3', 'gcs', 'azure', 'hdfs']);
    expect(snapshotRepoBodyKeyItems().find(i => i.label === 'type')?.detail).toContain('仓库类型');
  });

  it('创建体与恢复体的根键与官方参数一致', () => {
    expect(snapshotCreateBodyRootKeys).toEqual([
      'indices', 'ignore_unavailable', 'include_global_state', 'partial', 'metadata', 'feature_states',
    ]);
    expect(snapshotRestoreBodyRootKeys).toEqual([
      'indices', 'ignore_unavailable', 'include_global_state', 'partial',
      'rename_pattern', 'rename_replacement', 'include_aliases',
      'index_settings', 'ignore_index_settings', 'feature_states',
    ]);
  });

  it('lint：三体合法静默；拼错根键点名；search 根键在快照体被拒', () => {
    expect(lintStructuredBody('snapshot-repo-body', JSON.stringify({ type: 'fs', settings: { location: '/mnt/backup' }, verify: true }))).toEqual([]);
    expect(lintStructuredBody('snapshot-create-body', JSON.stringify({ indices: 'logs-*', include_global_state: false }))).toEqual([]);
    expect(lintStructuredBody('snapshot-restore-body', JSON.stringify({
      indices: 'logs-*', rename_pattern: '(.+)', rename_replacement: 'restored_$1', include_aliases: false,
    }))).toEqual([]);

    const repo = lintStructuredBody('snapshot-repo-body', JSON.stringify({ typed: 'fs' }));
    expect(repo).toHaveLength(1);
    expect(repo[0].message).toContain('快照仓库体');
    expect(repo[0].message).toContain('最接近：type');

    const restore = lintStructuredBody('snapshot-restore-body', JSON.stringify({ query: {} }));
    expect(restore).toHaveLength(1);
    expect(restore[0].message).toContain('恢复快照体');
  });
});
