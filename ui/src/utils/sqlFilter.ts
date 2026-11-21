/* 1126：SQL 结果值 → 查询条件（结果区下钻）。只对结构可控的简单 SELECT 追加：
 拒绝 GROUP BY/HAVING/UNION/JOIN 与 FROM 派生表（追加 WHERE 会改变语义或直接非法）；
 ORDER BY / LIMIT / FETCH / 分号作为尾部原样保留。列名与值都做安全转义。
 纯函数、零依赖；不支持时返回 null，由调用方降级为「复制条件」。 */
const NUMERIC_TYPES = new Set([
  'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float',
  'scaled_float', 'unsigned_long',
]);

export function sqlLiteral(value: unknown, type?: string): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (type === 'boolean') {
    const s = String(value).toLowerCase();
    if (s === 'true' || s === 'false') return s;
  }
  if (type && NUMERIC_TYPES.has(type) && typeof value === 'string' && value.trim() !== ''
      && Number.isFinite(Number(value))) {
    return String(Number(value));
  }
  return "'" + String(value).replace(/'/g, "''") + "'";
}

/**
 * 1439：negate=true 生成「排除该值」的条件。
 *
 * 空值排除 = IS NOT NULL。
 * 非空值用 `(col <> v OR col IS NULL)` 而不是裸 `col <> v`：ES 侧
 * `must_not: term(col, v)` 会保留「该字段缺失」的文档，SQL 的 `<>` 会把 NULL 行一起滤掉——
 * 同一个「排除」动作在两条通道上结果不同。带上 OR IS NULL 才与 ES 语义一致。
 */
export function sqlPredicate(column: string, value: unknown, type?: string, negate = false): string | null {
  if (!/^[A-Za-z_][\w.]*$/.test(String(column || ''))) return null;
  const ident = '"' + column.replace(/"/g, '""') + '"';
  if (value === null || value === undefined) return negate ? `${ident} IS NOT NULL` : `${ident} IS NULL`;
  const lit = sqlLiteral(value, type);
  return negate ? `(${ident} <> ${lit} OR ${ident} IS NULL)` : `${ident} = ${lit}`;
}

/** 顶层 ORDER BY / LIMIT / FETCH / ; 的起点（跳过字符串、引号标识符、注释与括号内） */
function topLevelTailStart(src: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i], next = src[i + 1];
    if (quote) {
      if (ch === quote) {
        if (src[i + 1] === quote) i++; else quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '-' && next === '-') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; continue; }
    if (ch === '/' && next === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 1; continue; }
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); continue; }
    if (depth !== 0) continue;
    if (ch === ';') return i;
    const prev = i > 0 ? src[i - 1] : ' ';
    if (/[A-Za-z0-9_]/.test(prev)) continue;
    if (/^(order\s+by|limit|fetch)\b/i.test(src.slice(i))) return i;
  }
  return -1;
}

export function appendSqlFilter(
  sql: string, column: string, value: unknown, type?: string, negate = false,
): { sql: string; predicate: string } | null {
  const src = String(sql || '').trim();
  if (!src) return null;
  if (/\b(group\s+by|having|union|join)\b/i.test(src)) return null;
  if (/\bfrom\s*\(/i.test(src)) return null;   // 派生表：外层 WHERE 位置不可靠
  const predicate = sqlPredicate(column, value, type, negate);
  if (!predicate) return null;
  const cut = topLevelTailStart(src);
  const head = (cut >= 0 ? src.slice(0, cut) : src).trimEnd();
  const tail = cut >= 0 ? src.slice(cut) : '';
  if (!head) return null;
  const hasWhere = /\bwhere\b/i.test(head);
  const join = hasWhere ? ' AND ' : ' WHERE ';
  const out = head + join + predicate + (tail ? ' ' + tail : '');
  return { sql: out, predicate };
}

/* 1132：结果区「按此列排序并重查」——只改顶层 ORDER BY：
   已有则整段替换（点某列排序的意图是主排序就是它），没有则插在 LIMIT/FETCH/; 之前。
   UNION/派生表不可靠 → null，由宿主降级为复制排序子句。 */
function topLevelOrderBy(src: string): { start: number; bodyStart: number; end: number } | null {
  let depth = 0;
  let quote: string | null = null;
  let found: { start: number; bodyStart: number } | null = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i], next = src[i + 1];
    if (quote) {
      if (ch === quote) {
        if (src[i + 1] === quote) i++; else quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '-' && next === '-') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; continue; }
    if (ch === '/' && next === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 1; continue; }
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); continue; }
    if (depth !== 0) continue;
    const prev = i > 0 ? src[i - 1] : ' ';
    if (/[A-Za-z0-9_]/.test(prev)) continue;
    if (!found) {
      const m = /^order\s+by\b/i.exec(src.slice(i));
      if (m) { found = { start: i, bodyStart: i + m[0].length }; }
      continue;
    }
    if (ch === ';' || /^(limit|fetch)\b/i.test(src.slice(i))) {
      return { ...found, end: i };
    }
  }
  return found ? { ...found, end: src.length } : null;
}

export function appendSqlOrder(
  sql: string, column: string, dir: 'asc' | 'desc',
): { sql: string; clause: string } | null {
  const src = String(sql || '').trim();
  if (!src) return null;
  if (/\bunion\b/i.test(src) || /\bfrom\s*\(/i.test(src)) return null;
  if (!/^[A-Za-z_][\w.]*$/.test(String(column || ''))) return null;
  const ident = '"' + column.replace(/"/g, '""') + '"';
  const clause = `ORDER BY ${ident} ${dir === 'asc' ? 'ASC' : 'DESC'}`;
  const span = topLevelOrderBy(src);
  if (span) {
    const before = src.slice(0, span.start).trimEnd();
    const after = src.slice(span.end).trimStart();
    const joiner = after.startsWith(';') ? '' : ' ';
    return { sql: before + (before ? ' ' : '') + clause + (after ? joiner + after : ''), clause };
  }
  const cut = topLevelTailStart(src);
  const head = (cut >= 0 ? src.slice(0, cut) : src).trimEnd();
  const tail = cut >= 0 ? src.slice(cut) : '';
  if (!head) return null;
  const joiner = tail.startsWith(';') ? '' : ' ';
  return { sql: head + ' ' + clause + (tail ? joiner + tail : ''), clause };
}
