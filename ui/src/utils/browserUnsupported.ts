/** 纯浏览器模式没有服务端进程/存储，以下页面依赖宿主侧能力。
 *  进入时展示明确的「需服务端模式」说明，而不是让页面发请求拿 501 红条。 */
export const BROWSER_SERVER_ONLY: Record<string, { name: string; reason: string }> = {
};

/** 端点级服务端独占白名单：每一项必须写明原因；能搬则搬，不能搬才留在这里。
 *  gate: scripts/check-browser-parity.mjs 会拒绝没有原因或未登记的 server-only 端点。 */
export const BROWSER_SERVER_ONLY_ENDPOINTS: Record<string, string> = {
  '/rebuild': '页面契约遗留前缀；现行 UI 使用 /adhoc-rebuild/*，浏览器模式已覆盖',
  '/rebuild-empty': '服务端 provider 驱动的空索引重建；UI 客户端面已退役，端点保留服务端直连调用',
  '/status': '服务端 provider 重建的只读状态查询；UI 客户端面已退役（现行重建走 /adhoc-rebuild/status），端点保留服务端直连调用',
  '/': 'xMigrate 由 browserFetch 在通用路由之前走独立本机 transport；此条只为页面契约前缀解析',
  '/inspect': '页面契约遗留前缀；现行前端走 /cluster/inspect，浏览器模式已覆盖',
  '/query': '页面契约遗留前缀；现行前端走 /cluster/query，浏览器模式已覆盖',
  '/cluster/shard-stores': '索引分片存储明细；当前前端没有消费入口，保留服务端端点',
  '/desired-state': '宿主 client 侧期望配置静态页；浏览器模式没有宿主静态服务，UI 在浏览器模式禁用入口',
  '/desired-state.html': '同上；浏览器模式没有宿主静态服务，UI 在浏览器模式禁用入口',
  '/mcp/keys': 'MCP API key 保护服务端 /mcp HTTP 端点；浏览器标签页不监听 TCP，仅提供页面内 window.ESQueryStudioMCP，不需要也不签发服务端 key',
  '/boot/health': 'Boot 3/4 并行产物的共享探针（返回集群 version.number）；浏览器模式不使用该进程，UI 也不消费该端点，仅服务端诊断',
  '/boot/search': 'Boot 3/4 并行产物 Phase 0 的受控 DSL 搜索代理；浏览器模式直连 ES 已有同一能力，UI 不消费该诊断端点',
  '/boot/sql': 'Boot 3/4 并行产物的现代 _sql 代理；浏览器模式直连 ES 已有同一能力，UI 不消费该诊断端点',
  '/pages': '页面契约投影端点；浏览器构建期已内联同一份 53 页 JSON，运行时不请求该端点',
  '/xmigrate/jobs': '跨集群迁移走独立 transport /internal/es/xmigrate/**（browserFetch 在通用路由之前分流）；此条仅为 Boot 适配器同名端点登记',
};

export function browserServerOnlyOf(path: string): { name: string; reason: string } | null {
  return BROWSER_SERVER_ONLY[path] || null;
}
