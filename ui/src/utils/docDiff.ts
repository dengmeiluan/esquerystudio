/* W2-3：同 ID 文档跨索引字段级对比。纯函数、零 Vue 依赖。
 为什么不复用 DiffEditorView 的 diffLines：那是朴素按行位置比对（a[i] vs b[i]，无 LCS），
 两个索引的文档键集合与顺序本就不同，行一错位就把后续全部误报为增删。见 spec 。 */

export type DiffKind = 'added' | 'removed' | 'changed' | 'same';

export interface FieldDiff {
  path: string;
  kind: DiffKind;
  left?: unknown;
  right?: unknown;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const MISSING = Symbol('missing');

export function diffDocFields(left: unknown, right: unknown): FieldDiff[] {
  const out: FieldDiff[] = [];
  if (!isPlainObject(left) && !isPlainObject(right)) return out;

  const walk = (l: unknown, r: unknown, prefix: string) => {
    const lo = isPlainObject(l) ? l : {};
    const ro = isPlainObject(r) ? r : {};
    const keys = new Set([...Object.keys(lo), ...Object.keys(ro)]);
    for (const k of keys) {
      const p = prefix ? `${prefix}.${k}` : k;
      const lv = k in lo ? lo[k] : MISSING;
      const rv = k in ro ? ro[k] : MISSING;

      if (lv === MISSING) { out.push({ path: p, kind: 'added', right: rv }); continue; }
      if (rv === MISSING) { out.push({ path: p, kind: 'removed', left: lv }); continue; }

      /* 两侧都是普通对象才递归；一侧对象一侧标量视为整体 changed，不进去 */
      if (isPlainObject(lv) && isPlainObject(rv)) { walk(lv, rv, p); continue; }

      /* 数组与标量一律整体比较（JSON 等价即 same） */
      const same = JSON.stringify(lv) === JSON.stringify(rv);
      out.push({ path: p, kind: same ? 'same' : 'changed', left: lv, right: rv });
    }
  };

  /* 一侧不是对象时，另一侧字段全部记为单侧存在 */
  if (!isPlainObject(left)) {
    for (const k of Object.keys(right as Record<string, unknown>)) {
      out.push({ path: k, kind: 'added', right: (right as Record<string, unknown>)[k] });
    }
  } else if (!isPlainObject(right)) {
    for (const k of Object.keys(left)) {
      out.push({ path: k, kind: 'removed', left: left[k] });
    }
  } else {
    walk(left, right, '');
  }

  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function diffSummary(diffs: FieldDiff[]) {
  const s = { added: 0, removed: 0, changed: 0, same: 0 };
  for (const d of diffs) s[d.kind]++;
  return s;
}
