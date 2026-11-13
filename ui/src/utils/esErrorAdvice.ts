/* 写链路错误建议统一出口——RA/UBQ/Bulk 三视图原先各留一份逐字同构的 permDeniedAdvice
 小函数（z5 轮改动面限定未抽），收敛到本 util 后行为与文案逐字等价，单一出处。 */

/**
 * 403/权限不足错误原文上补「下一步出路」建议——viewer 只会空转重试，
 * 告诉他换账号或找管理员；非权限类错误原样透传（version_conflict 等排障明细不受扰动）。
 * 各写视图角色档不同（bulk/ubq=REBUILD_OP、reindex=OPERATOR），文案保持角色无关。
 *
 * <p>：防双拼——api.ts 对 403+CONN_FORBIDDEN 已替换为自带完整出路的友好文案
 * （「…请联系管理员调整连接的最低角色…」），仅凭 {@code status===403} 判断会再叠一层
 * 「角色不足」建议成双重指引噪音。故消息里已含「联系管理员」出路（或已拼过本建议）时
 * 不再追加；raw ES security_exception 等无出路的 403 仍照常补。</p>
 */
export function permDeniedAdvice(e: any): string {
  const s = String(e?.message ?? e);
  const denied = e?.status === 403 || /FORBIDDEN|权限不足/.test(s);
  return denied && !s.includes('联系管理员')
    ? s + '——当前账号角色不足：请切换更高权限账号后重试，或联系管理员开通对应写权限'
    : s;
}
