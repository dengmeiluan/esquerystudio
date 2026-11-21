/* 1070：SQL 位置参数（? 占位 + params 数组）前端内核。
   生产场景里日期/主体名/代码等条件常随查询变化，用户不该每次手改 SQL 字面量：
   ES SQL 支持 body.params 按 ? 出现顺序绑定。这里提供两件纯函数——
   ① countSqlPlaceholders：忽略字符串字面量/带引号标识符/注释里的 ?，只数真正的占位符，
      避免把 LIKE '%?%' 或 -- 注释里的问号算成参数（误报比不报更伤）；
   ② parseSqlParams：把用户填的 JSON 数组解析成 params 值，非数组/语法错给出人话错误。
   cursor 续页 ES 只认 columnar/time_zone，params 仅首查生效（调用侧不随 cursor 发送）。 */

export type SqlParamsResult = { ok: true; value: unknown[] } | { ok: false; error: string };

export function parseSqlParams(text: string): SqlParamsResult {
  const t = (text || '').trim();
  if (!t) return { ok: true, value: [] };
  let v: unknown;
  try {
    v = JSON.parse(t);
  } catch (e: any) {
    return { ok: false, error: 'JSON 语法错误：' + String(e?.message || e) };
  }
  if (!Array.isArray(v)) return { ok: false, error: '参数必须是 JSON 数组（按 ? 出现顺序），如 ["宁德时代", 10]' };
  return { ok: true, value: v };
}

/* 单引号字符串（'' 转义）、双引号/反引号标识符、-- 行注释、块注释里的 ? 都不算占位符。 */
export function countSqlPlaceholders(sql: string): number {
  const s = sql || '';
  let n = 0;
  let i = 0;
  const len = s.length;
  while (i < len) {
    const c = s[i];
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      i++;
      while (i < len) {
        if (s[i] === q) {
          if (s[i + 1] === q) { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === '-' && s[i + 1] === '-') {
      i += 2;
      while (i < len && s[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      i += 2;
      while (i < len && !(s[i] === '*' && s[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '?') n++;
    i++;
  }
  return n;
}
