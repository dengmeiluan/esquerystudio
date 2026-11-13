import { NAV_ITEMS } from '../router';
import { writeStoredRaw } from '../utils/safeJson';

/* 工作现场恢复——路由每次切换都记录「最后停留的现场」（fullPath 含 query，
 配合全站 URL 即现场的约定，query/idx/草稿键都在里面）。
 下次裸进站（#/ 或 #/overview，无深链意图）时 toast 提供「继续上次」一键回；
 深链进站是明确意图，不打扰；现场超过 7 天视为过期不再提示。 */

const LAST_KEY = 'esquerystudio.last-route';
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

interface LastRoute { fullPath: string; name: string; ts: number }

/** 记录现场：首页/根路径不算现场（回首页 ≠ 有工作要继续）；/forbidden 是错误态
    不是工作现场——记住它只会让「继续上次」把人带回拒绝页（产线实报）。 */
export function saveLastRoute(fullPath: string) {
  const path = fullPath.split('?')[0];
  if (path === '/' || path === '/overview' || path === '/forbidden') return;
  const name = NAV_ITEMS.find(n => n.path === path)?.name || path;
  writeStoredRaw(localStorage, LAST_KEY, JSON.stringify({ fullPath, name, ts: Date.now() } satisfies LastRoute));
}

export function readLastRoute(): LastRoute | null {
  try {
    const r = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
    return r && typeof r.fullPath === 'string' && typeof r.ts === 'number' ? r : null;
  } catch { return null; }
}

/** 裸进站（hash 为空 / #/ / #/overview 且无参数）且现场未过期才提供恢复。
    /forbidden 存量记录同样过滤（修复前已写入的浏览器不能把人带回拒绝页）。 */
export function restorable(entryHash: string, saved: LastRoute | null, now = Date.now()): LastRoute | null {
  if (!saved) return null;
  const bare = !entryHash || entryHash === '#' || entryHash === '#/' || entryHash === '#/overview';
  if (!bare) return null;
  if (now - saved.ts > MAX_AGE_MS) return null;
  if (saved.fullPath.split('?')[0] === '/forbidden') return null;
  return saved;
}
