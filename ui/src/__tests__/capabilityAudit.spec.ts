/**
 * R40 capability 行为单测收口：canViewAllAudit/roleRank 角色矩阵——
 * 此前仅有源码锚（permGating 断言 auth store 引用行），无行为级红绿；
 * 大屏慢请求面板（rank3+ 门）与安全中心全量审计共用此判定，角色矩阵在此约定。
 * 语义镜像后端 ConsoleAuthInterceptor：AUDIT_OP/REBUILD_OP/CLUSTER_OP 三专项同 rank 互通；
 * 未知角色 fail-closed=最低 VIEWER。
 */
import { describe, it, expect } from 'vitest';
import { roleRank, canViewAllAudit, canCap } from '../utils/capability';

describe('R40 capability 角色矩阵行为测试', () => {
  it('roleRank：三专项同 rank3 互通（w66 文档说互斥、实现互通，以此为准）', () => {
    expect(roleRank('AUDIT_OP')).toBe(3);
    expect(roleRank('REBUILD_OP')).toBe(3);
    expect(roleRank('CLUSTER_OP')).toBe(3);
    expect(roleRank('ADMIN')).toBe(4);
    expect(roleRank('OPERATOR')).toBe(2);
    expect(roleRank('VIEWER')).toBe(1);
  });

  it('fail-closed：未知/大小写混杂/空角色 → 最低 VIEWER 兜底', () => {
    expect(roleRank('SUPER_GOD')).toBe(1);
    expect(roleRank('')).toBe(1);
    expect(roleRank(null)).toBe(1);
    expect(roleRank(undefined)).toBe(1);
    expect('大小写归一（trim+大写）').toBeDefined();
    expect(roleRank(' audit_op ')).toBe(3);
  });

  it('canViewAllAudit：rank3 三专项+ADMIN 全量审计；OPERATOR/VIEWER 及未知拒绝', () => {
    expect(canViewAllAudit('AUDIT_OP')).toBe(true);
    expect(canViewAllAudit('REBUILD_OP')).toBe(true);
    expect(canViewAllAudit('CLUSTER_OP')).toBe(true);
    expect(canViewAllAudit('ADMIN')).toBe(true);
    expect(canViewAllAudit('OPERATOR')).toBe(false);
    expect(canViewAllAudit('VIEWER')).toBe(false);
    expect(canViewAllAudit('SUPER_GOD')).toBe(false);
    expect(canViewAllAudit(null)).toBe(false);
  });

  it('canCap 三档位：write≥2 / ops≥3 / admin≥4', () => {
    expect(canCap('OPERATOR', 'write')).toBe(true);
    expect(canCap('VIEWER', 'write')).toBe(false);
    expect(canCap('AUDIT_OP', 'ops')).toBe(true);
    expect(canCap('OPERATOR', 'ops')).toBe(false);
    expect(canCap('ADMIN', 'admin')).toBe(true);
    expect(canCap('AUDIT_OP', 'admin')).toBe(false);
  });
});
