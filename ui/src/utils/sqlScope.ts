/* 1128：编辑器选区 → 执行范围。
   操作者心智：SQL 控制台里选一段就跑这一段（Kibana DevTools / DataGrip 同习惯），
   不必为试跑单条语句另开页面或把其余语句删掉。返回值同时给出选区在全文中的
   行列锚点，ES SQL 报错的 `line X:Y` 是相对执行文本的，需要按锚点映射回编辑器。 */
export interface SqlScope {
  /** 去掉首尾空白后的执行文本 */
  text: string;
  /** 执行文本在全文中的 [start, end) 偏移（trim 后） */
  start: number;
  end: number;
  /** 执行文本首字符在全文中的 1 基行列 */
  line: number;
  column: number;
  /** 来源：手动选区 / 光标所在语句（1129）。缺省按选区口径渲染 */
  kind?: 'selection' | 'statement';
}

function lineColAt(text: string, offset: number): { line: number; column: number } {
  const prefix = text.slice(0, offset);
  const line = (prefix.match(/\n/g)?.length ?? 0) + 1;
  const lastNl = prefix.lastIndexOf('\n');
  return { line, column: offset - lastNl };
}

/** 选区为空/纯空白 → null（整篇执行，既有行为零变化） */
export function selectionScope(sql: string, from: number, to: number): SqlScope | null {
  if (typeof sql !== 'string' || !sql) return null;
  const a = Math.max(0, Math.min(Math.trunc(from) || 0, sql.length));
  const b = Math.max(0, Math.min(Math.trunc(to) || 0, sql.length));
  let start = Math.min(a, b);
  let end = Math.max(a, b);
  while (start < end && /\s/.test(sql[start])) start++;
  while (end > start && /\s/.test(sql[end - 1])) end--;
  if (start >= end) return null;
  const { line, column } = lineColAt(sql, start);
  return { text: sql.slice(start, end), start, end, line, column, kind: 'selection' };
}

/* 1129：按顶层分号切语句——引号（''/""/`` 双写转义）、-- 行注释、块注释内的
   分号不算分隔符。只做切分与去空白，不改写任何原文。 */
export function statementsOf(sql: string): SqlScope[] {
  const out: SqlScope[] = [];
  const n = sql.length;
  const push = (from: number, to: number) => {
    let a = from, b = to;
    while (a < b && /\s/.test(sql[a])) a++;
    while (b > a && /\s/.test(sql[b - 1])) b--;
    if (a >= b) return;
    const { line, column } = lineColAt(sql, a);
    out.push({ text: sql.slice(a, b), start: a, end: b, line, column, kind: 'statement' });
  };
  let segStart = 0;
  let i = 0;
  while (i < n) {
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i++;
      while (i < n) {
        if (sql[i] === ch) {
          if (sql[i + 1] === ch) { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i = Math.min(n, i + 2);
      continue;
    }
    if (ch === ';') {
      push(segStart, i);
      segStart = i + 1;
    }
    i++;
  }
  push(segStart, n);
  return out;
}

/** 光标所在语句；光标落在语句之间的空白/注释里时取它前面最近的一条（没有则第一条）。 */
export function statementScopeAt(sql: string, offset: number): SqlScope | null {
  const stmts = statementsOf(sql);
  if (!stmts.length) return null;
  const off = Math.max(0, Math.min(Math.trunc(offset) || 0, sql.length));
  const hit = stmts.find(s => off >= s.start && off <= s.end);
  if (hit) return hit;
  let prev: SqlScope | null = null;
  for (const s of stmts) {
    if (s.end < off) prev = s;
    else break;
  }
  return prev ?? stmts[0];
}

/** 把改写后的文本放回它原来的 [start,end) 位置；null=整篇替换。 */
export function replaceScopeText(sql: string, scope: SqlScope | null, next: string): string {
  if (!scope) return next;
  return sql.slice(0, scope.start) + next + sql.slice(scope.end);
}

/** 把「相对执行文本」的报错位映射回编辑器全文坐标（1 基）。
   首行要叠加选区起始列，其余行只叠加行偏移——否则同一行多语句时锚点会歪。 */
export function mapScopedPos(
  pos: { line: number; column: number } | null,
  scope: SqlScope | null,
): { line: number; column: number } | null {
  if (!pos || !scope) return pos;
  return {
    line: pos.line + scope.line - 1,
    column: pos.line === 1 ? pos.column + scope.column - 1 : pos.column,
  };
}
