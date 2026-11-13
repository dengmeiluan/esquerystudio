/**
 * R130 一百九十一批：Topology 节点清单 Markdown 复制（带出体系收尾——
 * 分布表/节点表/热线程/分词表之外，拓扑分片分布盘点贴群）。
 * 锁定：工具钮接线+四列表（节点/IP/分片数/存储）+未分配桶不进清单。源码锁。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/TopologyView.vue'), 'utf-8');

describe('Topology 节点清单复制（一百九十一批）', () => {
  it('工具钮接线 + Markdown 四列表 + 未分配桶排除', () => {
    expect(src).toMatch(/@click="copyNodeList"/);
    expect(src).toMatch(/async function copyNodeList\(\)/);
    expect(src).toContain('| 节点 | IP | 分片数 | 存储 |');
    expect(src).toMatch(/filter\(g => g\.node !== '__UNASSIGNED__'\)/);
    expect(src).toContain('已复制 ${rows.length} 个节点（Markdown）');
  });
});
