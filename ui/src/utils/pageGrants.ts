/**
 * 安全中心页面授权解析纯函数（SecurityView 我的账号/页面授权区消费）。
 * 语义与边界详见 utils/__tests__/pageGrants.spec.ts。
 */

interface ConnGrant {
  connId: string;
  /** 可见页 key（读键或写键任一） */
  visible: string[];
  /** 可写页 key（精确 w: 键） */
  writable: string[];
}

export interface GrantSummary {
  /** 连接模型：grantedPages 含 conn: 前缀键 */
  connModel: boolean;
  /** 按连接分组的授权明细（连接模型时） */
  conns: ConnGrant[];
  /** 汇总：visible=去重后的页面 key 数（含全局静态页）；writable=去重后的可写页面 key 数 */
  totals: { visible: number; writable: number };
  /** 全局静态页（无 conn: 前缀）——连接模型混合授权时也必须展示，不能丢；
   *  null=SPI 未启用（grantedPages=null） */
  staticKeys: string[] | null;
}

export function summarizeGrants(grantedPages: string[] | null): GrantSummary {
  if (grantedPages == null) {
    return { connModel: false, conns: [], totals: { visible: 0, writable: 0 }, staticKeys: null };
  }
  const staticKeys = grantedPages.filter(k => typeof k === 'string' && !k.startsWith('conn:'));
  const connKeys = grantedPages.filter(k => typeof k === 'string' && k.startsWith('conn:'));
  if (connKeys.length === 0) {
    return { connModel: false, conns: [], totals: { visible: 0, writable: 0 }, staticKeys: [...staticKeys] };
  }

  const conns = new Map<string, ConnGrant>();
  for (const key of connKeys) {
    /* 键形态：conn:{cid}:{page} | conn:{cid}:w:{page}（w: 后可能再无 page=裸写键段，忽略） */
    const body = key.slice('conn:'.length);
    const sep = body.indexOf(':w:');
    if (sep >= 0) {
      const connId = body.slice(0, sep);
      const pageKey = body.slice(sep + 3);
      if (!pageKey) continue;
      const g = conns.get(connId) ?? { connId, visible: [], writable: [] };
      if (!g.writable.includes(pageKey)) g.writable.push(pageKey);
      if (!g.visible.includes(pageKey)) g.visible.push(pageKey);
      conns.set(connId, g);
    } else {
      const slash = body.indexOf(':');
      if (slash < 0) continue;
      const connId = body.slice(0, slash);
      const pageKey = body.slice(slash + 1);
      if (!pageKey) continue;
      const g = conns.get(connId) ?? { connId, visible: [], writable: [] };
      if (!g.visible.includes(pageKey)) g.visible.push(pageKey);
      conns.set(connId, g);
    }
  }

  const list = [...conns.values()].sort((a, b2) => a.connId.localeCompare(b2.connId));
  const visibleSet = new Set<string>(staticKeys);
  const writableSet = new Set<string>();
  for (const g of list) {
    for (const p of g.visible) visibleSet.add(p);
    for (const p of g.writable) writableSet.add(p);
  }
  return {
    connModel: true,
    conns: list,
    /* 页面 key 去重计数：同一页在多个连接可写只算一页，保证「可写 ≤ 可见」 */
    totals: { visible: visibleSet.size, writable: writableSet.size },
    staticKeys: [...staticKeys],
  };
}
