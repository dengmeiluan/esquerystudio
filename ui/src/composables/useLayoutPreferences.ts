import { ref } from 'vue';
import {
  clampPaneSize,
  migrateLegacySplit,
  type PaneConstraint,
  type ViewportProfile,
} from '../utils/layout';
import { removeStoredRaw, writeStoredRaw } from '../utils/safeJson';

export interface LayoutScope {
  target: string;
  route: string;
  mode: string;
  profile: ViewportProfile;
}

interface PaneState {
  size: number;
  collapsed?: boolean;
}

interface LayoutSnapshot {
  version: 1;
  updatedAt: number;
  panes: Record<string, PaneState>;
}

const EMPTY_SNAPSHOT = (): LayoutSnapshot => ({ version: 1, updatedAt: 0, panes: {} });

/* v2: 偏好 key 版本升 v2——v1 里存着 560px 窄树宽，加宽默认(680)对存量用户
 会被旧偏好覆盖；升版本即全部视图布局一次性回新 defaultSize，代价可接受 */
export function layoutStorageKey(scope: LayoutScope): string {
  return `esquerystudio.layout.v2:${scope.target || 'host'}:${scope.route}:${scope.mode}:${scope.profile}`;
}

function parseSnapshot(raw: string | null, constraints: Record<string, PaneConstraint>): LayoutSnapshot {
  if (!raw) return EMPTY_SNAPSHOT();
  try {
    const parsed = JSON.parse(raw) as Partial<LayoutSnapshot>;
    if (parsed.version !== 1 || !parsed.panes || typeof parsed.panes !== 'object') return EMPTY_SNAPSHOT();
    const panes: Record<string, PaneState> = {};
    for (const [id, value] of Object.entries(parsed.panes)) {
      if (constraints[id] === undefined && Object.keys(constraints).length > 0) continue;
      if (!value || typeof value !== 'object' || !Number.isFinite(value.size)) continue;
      panes[id] = {
        size: value.size,
        ...(typeof value.collapsed === 'boolean' ? { collapsed: value.collapsed } : {}),
      };
    }
    return {
      version: 1,
      updatedAt: Number.isFinite(parsed.updatedAt) ? Number(parsed.updatedAt) : 0,
      panes,
    };
  } catch {
    return EMPTY_SNAPSHOT();
  }
}

function readStorage(key: string, constraints: Record<string, PaneConstraint>): LayoutSnapshot {
  try {
    return parseSnapshot(localStorage.getItem(key), constraints);
  } catch {
    return EMPTY_SNAPSHOT();
  }
}

export function createLayoutPreferences(
  scope: LayoutScope,
  constraints: Record<string, PaneConstraint> = {},
) {
  const key = layoutStorageKey(scope);
  const initial = readStorage(key, constraints);
  const snapshot = ref<LayoutSnapshot>(initial);

  if (initial.updatedAt === 0 && scope.route === '/search') {
    const legacyRaw = readLegacySplit();
    const migrated = migrateLegacySplit(legacyRaw, 'query-builder.tree');
    if (migrated) {
      snapshot.value = {
        version: 1,
        updatedAt: Date.now(),
        panes: { 'query-builder.tree': { size: migrated.size } },
      };
      writeSnapshot(key, snapshot.value);
    }
    /* 迁移成功或确认无旧值后清除遗留键（此前只读不删，localStorage 永久残留） */
    if (legacyRaw != null || migrated) {
      removeStoredRaw(localStorage, 'esquerystudio_qb_split');
    }
  }

  function persist(next: LayoutSnapshot) {
    writeStoredRaw(localStorage, key, JSON.stringify(next));
  }

  function writeSnapshot(storageKey: string, next: LayoutSnapshot) {
    writeStoredRaw(localStorage, storageKey, JSON.stringify(next));
  }

  function readLegacySplit(): string | null {
    try { return localStorage.getItem('esquerystudio_qb_split'); } catch { return null; }
  }

  function setPane(id: string, state: PaneState) {
    if (!Number.isFinite(state.size)) return;
    const current = readStorage(key, constraints);
    const next: LayoutSnapshot = {
      version: 1,
      updatedAt: Date.now(),
      panes: {
        ...current.panes,
        [id]: {
          size: state.size,
          ...(typeof state.collapsed === 'boolean' ? { collapsed: state.collapsed } : {}),
        },
      },
    };
    snapshot.value = next;
    persist(next);
  }

  function restorePane(id: string, pane: PaneConstraint, available: number): number {
    return clampPaneSize(snapshot.value.panes[id]?.size ?? pane.defaultSize, pane, available);
  }

  function reset() {
    snapshot.value = EMPTY_SNAPSHOT();
    removeStoredRaw(localStorage, key);
  }

  return { key, snapshot, setPane, restorePane, reset };
}
