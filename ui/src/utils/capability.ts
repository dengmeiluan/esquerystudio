/**
 * 控制台角色→能力单一真源（·安全架构收口）。
 *
 * 背景：此前全站只有 SecurityView/UserMenu 看角色，危险按钮（删索引/删文档/重建/raw 系命令）
 * 对所有角色可见——VIEWER 点下去 403 刷 PAGE_DENIED（190 审计刷屏的同类根因），
 * 生产集群「看着能点」就是事故温床。
 *
 * 此处镜像**后端 ConsoleAuthInterceptor 的强制语义**（不是文档语义）：
 * - VIEWER(1)：GET + 只读 POST（查询类）+ auth 自助；
 * - OPERATOR(2)：+ 普通写（文档编辑/analyze/模板渲染等未入高危清单的 POST）；
 * - 专项三角色（REBUILD_OP/CLUSTER_OP/AUDIT_OP，rank 3）：+ 重建迁移/索引生命周期/删数据/全量审计
 * ——后端 atLeast 按 rank 判定，三专项同 rank **互通**（w66 文档说互斥，实现是互通，以此为准）；
 * - ADMIN(4)：+ 用户管理/raw 透传/集群连接写/setup 重绑。
 *
 * 前端门禁只做「不展示/不可点」的体验层；真正的安全边界永远在后端拦截器——
 * 本文件是它的镜像，改动拦截器关键词清单时必须同步本表（守卫 capability.spec 锚住映射）。
 */

/** 角色→rank（镜像 ConsoleRole；无法识别的角色串按最低 VIEWER 兜底——fail-closed。
 注意分层：「身份未探测到（me=null）」不等于「无法识别角色」——前者由 auth store 判为
 「后端未启用鉴权」全放行（无鉴权部署全功能可用的既有语义），后者进本表才 fail-closed。 */
const ROLE_RANK: Record<string, number> = {
  VIEWER: 1,
  OPERATOR: 2,
  REBUILD_OP: 3,
  CLUSTER_OP: 3,
  AUDIT_OP: 3,
  ADMIN: 4,
};

export function roleRank(role: string | null | undefined): number {
  return ROLE_RANK[String(role || '').trim().toUpperCase()] ?? 1;
}

/** 能力档位：
 * - write：OPERATOR+ 普通写（文档编辑、新文档、analyze、模板渲染等）；
 * - ops：rank3+ 高危（删索引/删文档/重建/迁移/别名切换/settings/模板/快照/ILM/force-merge/全量审计）；
 * - admin：ADMIN 专属（用户管理、raw 透传、集群连接保存/删除/测试、setup 重绑）。 */
export type ConsoleCap = 'write' | 'ops' | 'admin';

export function canCap(role: string | null | undefined, cap: ConsoleCap): boolean {
  const r = roleRank(role);
  if (cap === 'write') return r >= 2;
  if (cap === 'ops') return r >= 3;
  return r >= 4;
}

/** 全量审计流水查看权（后端 /auth/ops-audit=rank3 镜像）；低于此档走 /auth/ops-audit/mine 自助 */
export function canViewAllAudit(role: string | null | undefined): boolean {
  return roleRank(role) >= 3;
}
