/* B：索引列表元信息排序（纯函数，单测直测）。
 7 种元信息 × 升/降，客户端排；缺字段/不可解析恒沉底（升/降都不做「反向置顶」）。 */
import { parseBytes } from './format';

export type IndexSortKey =
  | 'index' | 'docs.count' | 'store.size' | 'health' | 'pri' | 'rep' | 'creation.date.string';

/** 健康按严重度排序：red 最重（排最前）、green 最轻 */
const HEALTH_RANK: Record<string, number> = { red: 0, yellow: 1, green: 2 };

function sortValue(a: any, key: IndexSortKey): { v: number | string; missing: boolean } {
  switch (key) {
    case 'index': {
      const s = String(a.index ?? '');
      return { v: s, missing: !s };
    }
    case 'store.size': {
      const b = parseBytes(a['store.size']);
      return { v: b, missing: !isFinite(b) };
    }
    case 'health': {
      const r = HEALTH_RANK[a.health];
      return { v: r ?? 0, missing: r == null };
    }
    case 'creation.date.string': {
      const s = String(a['creation.date.string'] ?? '');
      return { v: s, missing: !s };
    }
    default: { /* docs.count / pri / rep */
      const n = Number(a[key]);
      return { v: n, missing: !isFinite(n) };
    }
  }
}

/** 返回新数组（不 mutate 入参）。缺字段/不可解析恒沉底，非缺失项按升/降比。
 Schwartzian：先 map 出每行排序键（n 次解析），再 sort（避免比较器里 O(n log n) 次重复 parseBytes）。 */
export function sortIndices<T extends Record<string, any>>(list: T[], key: IndexSortKey, dir: 'asc' | 'desc'): T[] {
  const sign = dir === 'desc' ? -1 : 1;
  return list
    .map(item => ({ item, ...sortValue(item, key) }))
    .sort((A, B) => {
      if (A.missing || B.missing) return A.missing === B.missing ? 0 : (A.missing ? 1 : -1);
      if (A.v === B.v) return 0;
      return (A.v < B.v ? -1 : 1) * sign;
    })
    .map(x => x.item);
}
