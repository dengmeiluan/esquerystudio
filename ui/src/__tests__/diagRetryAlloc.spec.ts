/**
 *  第：DiagView 分配诊断现场一键重试（retry_failed）——
 * 此前 CmdPalette 有该运维命令但诊断现场（看到未分配 reason 的地方）没有，
 * 看到→处置之间断一层。askConfirm warn 门控（集群级分配动作）。
 * 演进：走结构化 /cluster/reroute/retry-failed（diag 页写键），按钮对无写权限者不渲染（canOps 门控）。
 * 1002 演进：retry-failed 是全集群动作，连接模型下后端额外要求 rank3 或 w:cluster-settings，
 *   前端门必须叠加 canClusterScope——否则 rank2 的 w:diag 持有人看到按钮、点下去 403。
 * 锁定（静态）：按钮接线（canOps+unassigned 双门控）+ reroute 路径 + askConfirm 门控顺序。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/DiagView.vue'), 'utf-8');

describe('Diag 分配重试（）', () => {
  it('按钮接线（canOps+unassigned 双门控）+ reroute 路径', () => {
    expect(src).toMatch(/v-if="canOps && allocation\.current_state === 'unassigned'"/);
    expect(src).toMatch(/@click="retryFailedAlloc"/);
    expect(src).toMatch(/api\.rerouteRetryFailed\(\)/);
    expect(src).toContain("auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/reroute/retry-failed', store.target)");
    expect(src).toContain('&& auth.canClusterScope(store.target)');
  });

  it('askConfirm warn 门控在提交之前', () => {
    expect(src).toMatch(/title: '重试失败分片分配'/);
    expect(src).toMatch(/level: 'warn'/);
    const gate = src.indexOf('if (!await askConfirm({');
    const submit = src.indexOf('api.rerouteRetryFailed()');
    expect(gate).toBeGreaterThan(-1);
    expect(submit).toBeGreaterThan(gate);
  });
});
