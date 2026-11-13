/**
 * 二百二十批：capability 角色→能力映射守卫（镜像后端 ConsoleAuthInterceptor 强制语义）。
 * 锚点：三专项同 rank3 互通（w66 文档说互斥、实现是互通，以此为准）；
 * 无法识别身份 fail-closed 按 VIEWER；映射改动必须同步后端关键词清单。
 */
import { describe, it, expect } from 'vitest';
import { roleRank, canCap, canViewAllAudit } from '../capability';

describe('roleRank（镜像 ConsoleRole）', () => {
  it('六级 rank 与后端一致；无法识别 fail-closed=VIEWER', () => {
    expect(roleRank('VIEWER')).toBe(1);
    expect(roleRank('OPERATOR')).toBe(2);
    expect(roleRank('REBUILD_OP')).toBe(3);
    expect(roleRank('CLUSTER_OP')).toBe(3);
    expect(roleRank('AUDIT_OP')).toBe(3);
    expect(roleRank('ADMIN')).toBe(4);
    expect(roleRank('')).toBe(1);
    expect(roleRank(null)).toBe(1);
    expect(roleRank('super-root')).toBe(1); /* 未知角色绝不放大 */
  });
  it('大小写不敏感（后端 parse 同口径）', () => {
    expect(roleRank('admin')).toBe(4);
    expect(roleRank('Cluster_Op')).toBe(3);
  });
});

describe('canCap 三档能力（用户点名场景）', () => {
  it('VIEWER：只读——write/ops/admin 全拒（删索引/删文档按钮不得展示）', () => {
    expect(canCap('VIEWER', 'write')).toBe(false);
    expect(canCap('VIEWER', 'ops')).toBe(false);
    expect(canCap('VIEWER', 'admin')).toBe(false);
  });
  it('OPERATOR：普通写可，高危/超管拒', () => {
    expect(canCap('OPERATOR', 'write')).toBe(true);
    expect(canCap('OPERATOR', 'ops')).toBe(false);
    expect(canCap('OPERATOR', 'admin')).toBe(false);
  });
  it('专项三角色：rank3 档互通（后端 atLeast 语义），admin 拒', () => {
    for (const r of ['REBUILD_OP', 'CLUSTER_OP', 'AUDIT_OP'] as const) {
      expect(canCap(r, 'write')).toBe(true);
      expect(canCap(r, 'ops')).toBe(true);
      expect(canCap(r, 'admin')).toBe(false);
    }
  });
  it('ADMIN：全档', () => {
    expect(canCap('ADMIN', 'write')).toBe(true);
    expect(canCap('ADMIN', 'ops')).toBe(true);
    expect(canCap('ADMIN', 'admin')).toBe(true);
  });
});

describe('canViewAllAudit（全量审计 rank3 镜像）', () => {
  it('VIEWER/OPERATOR 不可看全量（走 /mine 自助）；rank3+ 可看', () => {
    expect(canViewAllAudit('VIEWER')).toBe(false);
    expect(canViewAllAudit('OPERATOR')).toBe(false);
    expect(canViewAllAudit('AUDIT_OP')).toBe(true);
    expect(canViewAllAudit('CLUSTER_OP')).toBe(true);
    expect(canViewAllAudit('ADMIN')).toBe(true);
  });
});
