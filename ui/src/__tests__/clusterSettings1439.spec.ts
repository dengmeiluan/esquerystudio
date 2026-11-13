/**
 * 1439：集群设置体（PUT /_cluster/settings）。
 *
 * 此前 `_cluster/settings` 走默认 search 档——根键给 query/sort/aggs，写下去 ES 直接拒；
 * 而它其实只有 persistent/transient 两层，里层是 CLUSTER_SETTINGS_CATALOG 的键。
 * 本批单列 cluster-settings-body：根键 → 设置键目录（与 ClusterSettingsView 同源）→ lint。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, clusterSettingsBodyKeyItems, clusterSettingsKeyItems,
  clusterSettingsBodyRootKeys, clusterSettingsRegionAt,
} from '../utils/dslCompletionContext';
import { lintStructuredBody } from '../utils/dslLint';
import { CLUSTER_SETTINGS_CATALOG } from '../utils/indexSettingsCatalog';

describe('1439 集群设置体分档', () => {
  it('路径分派：_cluster/settings → cluster-settings-body；索引设置仍是 settings', () => {
    expect(bodyKindForPath('/_cluster/settings', 'PUT')).toBe('cluster-settings-body');
    expect(bodyKindForPath('/_cluster/settings?flat_settings=true', 'PUT')).toBe('cluster-settings-body');
    expect(bodyKindForPath('/my-idx/_settings', 'PUT')).toBe('settings');
    expect(bodyKindForPath('/_cluster/health', 'GET')).toBe('search'); /* 无体端点不受影响 */
  });

  it('根键只有持久/临时两层', () => {
    expect(clusterSettingsBodyRootKeys).toEqual(['persistent', 'transient']);
    expect(clusterSettingsBodyKeyItems().find(i => i.label === 'persistent')?.detail).toContain('重启');
  });

  it('设置键目录由 CLUSTER_SETTINGS_CATALOG 派生（无手抄漂移）', () => {
    const items = clusterSettingsKeyItems();
    expect(items.length).toBe(CLUSTER_SETTINGS_CATALOG.length);
    for (const s of CLUSTER_SETTINGS_CATALOG) {
      const it = items.find(i => i.label === s.key);
      expect(it, s.key).toBeTruthy();
      expect(it!.detail).toContain(s.desc);
      expect(it!.insertText).toBe('"' + s.key + '"');
    }
    expect(items.map(i => i.label)).toContain('cluster.routing.allocation.enable');
    expect(items.map(i => i.label)).toContain('indices.breaker.total.limit');
  });

  it('区域：根层 / persistent·transient 设置层 / 更深层', () => {
    const at = (s: string) => clusterSettingsRegionAt(s, s.length);
    expect(at('{')).toBe('root');
    expect(at('{"persistent": {')).toBe('settings');
    expect(at('{"transient": {')).toBe('settings');
    const deep = '{"persistent": {"a": {';
    expect(at(deep)).toBe('deep');
  });

  it('lint：两层根键合法静默；拼错根键点名「集群设置体」；未知设置键不误报（插件键开放）', () => {
    expect(lintStructuredBody('cluster-settings-body', JSON.stringify({
      persistent: { 'cluster.routing.allocation.enable': 'all' },
      transient: { 'search.max_buckets': 100000 },
    }))).toEqual([]);
    const f = lintStructuredBody('cluster-settings-body', JSON.stringify({ persistant: {} }));
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain('集群设置体');
    expect(f[0].message).toContain('最接近：persistent');
    const far = lintStructuredBody('cluster-settings-body', JSON.stringify({ persist: {} }));
    expect(far[0].message).toContain('没有根键「persist」');
    /* 内层设置键按目录解释，但 lint 不白名单（插件可注册新键） */
    expect(lintStructuredBody('cluster-settings-body', JSON.stringify({
      persistent: { 'plugin.custom.key': true },
    }))).toEqual([]);
  });

  it('负控：search 根键（query/aggs）在集群设置体必须被点名', () => {
    const f = lintStructuredBody('cluster-settings-body', JSON.stringify({ query: {}, transient: {} }));
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain('query');
  });
});
