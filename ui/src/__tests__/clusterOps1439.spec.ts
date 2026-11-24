/**
 * 1439：集群运维体——_cluster/reroute 与 _cluster/allocation/explain。
 *
 * 两个端点此前都走默认 search 档：根键给 query/sort/aggs，写下去 ES 直接拒。
 * reroute 是 {commands:[{move|allocate_*|cancel:{…}}]}，allocation/explain 是
 * {index,shard,primary,…}；本批补根键/命令/命令参数三段补全与根键 lint。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, rerouteBodyKeyItems, rerouteCommandKeyItems, rerouteCommandParamKeyItems,
  rerouteBodyRootKeys, rerouteRegionAt, rerouteCommandNameAt, allocationExplainBodyKeyItems,
  allocationExplainBodyRootKeys,
} from '../utils/dslCompletionContext';
import { lintStructuredBody } from '../utils/dslLint';

describe('1439 集群运维体分档', () => {
  it('路径分派：reroute / allocation explain 单列；集群设置与 search 不受影响', () => {
    expect(bodyKindForPath('/_cluster/reroute', 'POST')).toBe('reroute-body');
    expect(bodyKindForPath('/_cluster/reroute?dry_run=true', 'POST')).toBe('reroute-body');
    expect(bodyKindForPath('/_cluster/allocation/explain', 'POST')).toBe('allocation-explain-body');
    expect(bodyKindForPath('/_cluster/settings', 'PUT')).toBe('cluster-settings-body');
    expect(bodyKindForPath('/logs/_search', 'POST')).toBe('search');
  });

  it('reroute 根键只有 commands；命令目录五种', () => {
    expect(rerouteBodyRootKeys).toEqual(['commands']);
    expect(rerouteBodyKeyItems()[0].detail).toContain('重路由');
    expect(rerouteCommandKeyItems().map(i => i.label)).toEqual([
      'move', 'cancel', 'allocate_replica', 'allocate_stale_primary', 'allocate_empty_primary',
    ]);
  });

  it('命令参数按命令分档：move 有 from/to；cancel 有 allow_primary；空主分片要 accept_data_loss', () => {
    const move = rerouteCommandParamKeyItems('move').map(i => i.label);
    expect(move).toContain('from_node');
    expect(move).toContain('to_node');
    const cancel = rerouteCommandParamKeyItems('cancel').map(i => i.label);
    expect(cancel).toContain('allow_primary');
    expect(cancel).not.toContain('from_node');
    const empty = rerouteCommandParamKeyItems('allocate_empty_primary').map(i => i.label);
    expect(empty).toContain('accept_data_loss');
    expect(empty).not.toContain('from_node');
  });

  it('reroute 区域：根/命令对象/命令参数对象/更深', () => {
    const at = (s: string, off = s.length) => rerouteRegionAt(s, off);
    expect(at('{')).toBe('root');
    expect(at('{"commands": [')).toBe('deep'); /* 数组裸元素位不出键（先有对象） */
    expect(at('{"commands": [{"')).toBe('command');
    const cmd = '{"commands": [{"move": {';
    expect(at(cmd)).toBe('params');
    expect(rerouteCommandNameAt(cmd, cmd.length)).toBe('move');
    const deep = '{"commands": [{"move": {"extra": {';
    expect(at(deep)).toBe('deep');
  });

  it('allocation/explain 根键：index/shard/primary/current_node/磁盘与决策开关', () => {
    expect(allocationExplainBodyRootKeys).toEqual([
      'index', 'shard', 'primary', 'current_node', 'include_disk_info', 'include_yes_decisions',
    ]);
    expect(allocationExplainBodyKeyItems().find(i => i.label === 'primary')?.detail).toContain('主分片');
  });

  it('lint：合法体静默；拼错根键点名；search 根键在运维体被拒', () => {
    expect(lintStructuredBody('reroute-body', JSON.stringify({
      commands: [{ move: { index: 'i', shard: 0, from_node: 'a', to_node: 'b' } }],
    }))).toEqual([]);
    expect(lintStructuredBody('allocation-explain-body', JSON.stringify({ index: 'i', shard: 0, primary: true }))).toEqual([]);
    const f = lintStructuredBody('reroute-body', JSON.stringify({ commandz: [] }));
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain('分片重路由体');
    expect(f[0].message).toContain('最接近：commands');
    const ae = lintStructuredBody('allocation-explain-body', JSON.stringify({ query: {} }));
    expect(ae).toHaveLength(1);
    expect(ae[0].message).toContain('分配诊断体');
  });
});
