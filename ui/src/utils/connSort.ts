/**
 * 集群切换器列表排序纯函数（ClusterSwitcher 管理面板与快速菜单共用真源）。
 * 语义与边界详见 utils/__tests__/connSort.spec.ts。
 * 增 'manual' 档（623 设计稿 D3/D4 裁决落码）——按 manualOrder 序排列，
 * 不在序中的连接沉底（组内名称升序，新添加连接自然排尾）；moveInOrder 纯函数承担
 * 拖拽落位与 Ctrl+↑/↓ 键盘移位的共用语义（越界钳位、幂等、不改入参）。
 */
export type SortMode = 'status' | 'name' | 'latency' | 'manual';

export interface SortableConn {
  id: string;
  name: string;
  health?: { status?: string; latencyMs?: number | null } | null;
}

const isDown = (c: SortableConn): boolean => c.health?.status !== 'GREEN';

const byName = (a: SortableConn, b: SortableConn): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0; /* 码点序：ASCII 稳定排在中文前，不依赖 ICU locale 细节 */

const latencyOf = (c: SortableConn): number => {
  const v = c.health?.latencyMs;
  return typeof v === 'number' && Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
};

export function sortConns<T extends SortableConn>(conns: readonly T[], mode: SortMode, manualOrder?: readonly string[]): T[] {
  const cs = [...conns];
  if (mode === 'manual') {
    const pos = new Map((manualOrder ?? []).map((id, i) => [id, i]));
    /* 在序中的按序排，不在序中的沉底（组内名称升序） */
    cs.sort((a, b) => (pos.get(a.id) ?? pos.size) - (pos.get(b.id) ?? pos.size) || byName(a, b));
    return cs;
  }
  if (mode === 'name') {
    cs.sort((a, b) => byName(a, b));
    return cs;
  }
  if (mode === 'latency') {
    cs.sort((a, b) => {
      const da = isDown(a), db = isDown(b);
      if (da !== db) return da ? 1 : -1;               /* 异常沉底 */
      if (da) return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      return latencyOf(a) - latencyOf(b);
    });
    return cs;
  }
  /* status（默认）：异常/未知置顶，组内名称升序 */
  cs.sort((a, b) => {
    const da = isDown(a), db = isDown(b);
    if (da !== db) return da ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return cs;
}

/** usePref 脏值容错：非合法 mode 回落 'status' */
export function normalizeSortMode(v: unknown): SortMode {
  return v === 'name' || v === 'latency' || v === 'manual' ? v : 'status';
}

/**
 * 手动档落位纯函数——id 移到 toIndex（相对移除 id 后的数组，越界钳位）。
 * 拖拽落位（toIndex=目标行在序中的下标=插到目标行前）与键盘 Ctrl+↑/↓（toIndex=当前位±1）
 * 共用此语义；幂等、纯函数、不丢项。
 */
export function moveInOrder(order: readonly string[], id: string, toIndex: number): string[] {
  const rest = order.filter(x => x !== id);
  const i = Math.max(0, Math.min(toIndex, rest.length));
  return [...rest.slice(0, i), id, ...rest.slice(i)];
}
