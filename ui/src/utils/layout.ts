export type ViewportProfile = 'embedded' | 'compact' | 'standard' | 'wide';
export type LayoutPreset = 'equal' | 'editor-first' | 'result-first' | 'reset';
type PaneSizeLimit = number | 'available';

/* ═══ 断点常量单源（合并，工具层）═══
 JS 判据（matchMedia / stacked）与 CSS @media 档互为锚——改档必须两处同步：
 · BP_STACK 与全站 CSS max-width:1100px 档互锚（workbenchStackBp527.spec 锚定）；
 · BP_NARROW 与 theme.css min-width:901px 补集锁步（responsiveGuard239.spec 锚④）；
 · BP_COMPACT / BP_WIDE 仅 getViewportProfile 内部档位。 */
export const BP_NARROW = 900;
const BP_COMPACT = 1000;
export const BP_STACK = 1100;
const BP_WIDE = 1600;

export interface PaneConstraint {
  id: string;
  min: number;
  defaultSize: number;
  max?: PaneSizeLimit;
}

export function clampPaneSize(value: number, pane: PaneConstraint, available: number): number {
  const safeAvailable = Math.max(0, Number.isFinite(available) ? available : 0);
  const base = Number.isFinite(value) ? value : pane.defaultSize;
  const minimum = Math.max(0, pane.min);
  const configuredMax = pane.max === 'available' || pane.max == null ? safeAvailable : pane.max;
  const maximum = Math.max(minimum, Math.min(configuredMax, safeAvailable));
  return Math.round(Math.max(minimum, Math.min(base, maximum)));
}

function paneMax(pane: PaneConstraint, available: number): number {
  return pane.max === 'available' || pane.max == null
    ? Math.max(0, available)
    : Math.max(0, Math.min(pane.max, available));
}

function distributeExtra(
  sizes: Record<string, number>,
  panes: PaneConstraint[],
  available: number,
  preferred: number[],
  reservedMin = 0,
): Record<string, number> {
  let remaining = Math.max(0, Math.round(available - Object.values(sizes).reduce((sum, size) => sum + size, 0)));
  while (remaining > 0) {
    let changed = false;
    for (const index of preferred) {
      const pane = panes[index];
      const current = sizes[pane.id];
      /* 上界除自身 max 外，还为未参与分配的 flex 兄弟（reservedMin）和其余
 sized pane 的当前值留位——否则编辑优先会把 flex 编辑器挤到 min 以下
 （对齐 WorkbenchLayout.maxOf 的 reservedForSiblings 口径） */
      const others = Object.entries(sizes).reduce((sum, [id, size]) => (id === pane.id ? sum : sum + size), 0);
      const bound = Math.min(paneMax(pane, available), Math.max(0, available - reservedMin - others));
      const room = Math.floor(bound - current);
      if (room <= 0) continue;
      const delta = Math.min(room, remaining);
      sizes[pane.id] += delta;
      remaining -= delta;
      changed = true;
      if (remaining === 0) break;
    }
    if (!changed) break;
  }
  return sizes;
}

export function distributePreset(
  preset: LayoutPreset,
  available: number,
  panes: PaneConstraint[],
  options: { reservedMin?: number } = {},
): Record<string, number> {
  if (!panes.length) return {};

  const safeAvailable = Math.max(0, Number.isFinite(available) ? available : 0);
  /* reservedMin = 未参与分配的 flex pane 的 minSize 合计（WorkbenchLayout 传入）。
 作用：①distributeExtra 上界为其保留，preset 不再把 flex 编辑器挤到 min 以下；
 ②reservedMin>0（存在 flex pane）时「结果优先」反向——sized 全部压到 min，余量由 flex 吸收。 */
  const reserved = Math.max(0, Math.round(options.reservedMin ?? 0));
  const sizes = Object.fromEntries(panes.map((pane) => [
    pane.id,
    clampPaneSize(pane.min, pane, safeAvailable),
  ]));

  if (preset === 'reset') {
    return Object.fromEntries(panes.map((pane) => [
      pane.id,
      clampPaneSize(pane.defaultSize, pane, safeAvailable),
    ]));
  }

  if (safeAvailable <= panes.reduce((sum, pane) => sum + Math.max(0, pane.min), 0)) {
    return sizes;
  }

  if (preset === 'result-first' && reserved > 0) {
    return sizes;
  }

  if (preset === 'equal') {
    /* 等分基数先扣掉 flex 保留额，否则 distributeExtra 的上界保留会被基数分配绕过 */
    const pool = Math.max(0, safeAvailable - reserved);
    const equal = Math.floor(pool / panes.length);
    panes.forEach((pane) => {
      sizes[pane.id] = clampPaneSize(equal, pane, safeAvailable);
    });
    return distributeExtra(sizes, panes, safeAvailable, panes.map((_, index) => index), reserved);
  }

  const preferred = preset === 'result-first'
    ? [...panes.keys()].reverse()
    : [...panes.keys()];
  return distributeExtra(sizes, panes, safeAvailable, preferred, reserved);
}

export function getViewportProfile(width: number, height: number): ViewportProfile {
  if (width < BP_NARROW || (width < BP_COMPACT && height < 620)) return 'embedded';
  if (width < BP_STACK || height < 560) return 'compact';
  if (width >= BP_WIDE) return 'wide';
  return 'standard';
}

export function migrateLegacySplit(raw: string | null, paneId: string): { size: number; source: 'legacy' } | null {
  if (paneId !== 'query-builder.tree' || raw == null) return null;
  const size = Number(raw);
  return Number.isFinite(size) && size > 0 ? { size, source: 'legacy' } : null;
}

/* 分栏互覆盖档位循环（纯函数，WorkbenchLayout.cycleMaximize 调用）——
 null=对半；点击序 对半→前位(prev)独占→后位(next)独占→对半。 */
export function cycleMaxState(cur: string | null, prevId: string, nextId: string): string | null {
  if (cur === prevId) return nextId;
  if (cur === nextId) return null;
  return prevId;
}
