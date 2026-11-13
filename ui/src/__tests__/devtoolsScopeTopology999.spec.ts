import { describe, it, expect } from 'vitest';
import { nonAdminDataPlaneWriteAllowed as ok } from '../utils/devtoolsScope';

/* 索引级分片拓扑读与根形态同权拒绝：后端 RAW_INDEX_TOPOLOGY_READ_DENY 的客户端镜像，
   分片恢复/段/存储/统计借索引前缀不得绕开根形态拒绝清单（所见即所得）。 */
describe('devtoolsScope index topology read deny', () => {
  it('索引级拓扑读在客户端即禁用', () => {
    expect(ok('GET', '/logs-2026/_stats')).toBe(false);
    expect(ok('GET', '/logs-2026/_recovery')).toBe(false);
    expect(ok('GET', '/logs-2026/_segments')).toBe(false);
    expect(ok('GET', '/logs-2026/_shard_stores')).toBe(false);
    expect(ok('GET', '/logs-2026/_stats/docs,store')).toBe(false);
    expect(ok('GET', '/logs-2026/_STATS')).toBe(false);
  });

  it('业务检索读不受影响', () => {
    expect(ok('GET', '/logs-2026/_search')).toBe(true);
    expect(ok('GET', '/logs-2026/_count')).toBe(true);
    expect(ok('GET', '/logs-2026/_search/scroll')).toBe(true);
  });
});
