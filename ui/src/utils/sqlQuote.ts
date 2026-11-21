/* 1386：FROM 里的索引名自动补双引号。
 *
 * 用户原话：「之前比如索引要求 ""，但是用户自己录入的索引名字没有带 ""，
 * 我觉得这类应该要提升体验，直接报错体验很差」。
 *
 * 背景：ES SQL 把标识符当关键字集合处理——`FROM my-index` 未加引号时，
 * `-` 会被当成减号解析，直接抛语法错误（`line 1:x: ...`），
 * 而用户的索引名里常有 `-`、`.`、数字等。报错文案与索引名毫无关系，
 * 用户根本不知道是自己少打了两个引号。
 *
 * 策略（只做**确定性**改写，绝不猜用户意图）：
 *  - 只看**第一个** FROM 后紧跟的单个裸标识符（多表/子查询一律不动）；
 *  - 该标识符必须**存在于当前已知索引列表**（精确匹配）才改写；
 *    不在列表里的一律不动（可能是通配符/模板索引/用户手误，改了反而误导）；
 *  - 已经带引号/反引号的跳过；
 *  - 只在**执行前**改写发给 ES 的文本，编辑器里的稿子保持用户原样（不擅自改用户的字），
 *    并把改写结果回告给调用方用于提示。
 * 纯函数、零 Vue/Monaco 依赖。 */

export interface QuoteFixResult {
  /** 实际发给 ES 的 SQL（无改动时与入参逐字相同） */
  sql: string;
  /** 补上的索引名（null = 未改写） */
  quoted: string | null;
}

/* 本层 FROM：`FROM` + **同一行的空白** + 表名位。
 * 用 `[ \t]` 而非 `\s`：`\s` 会跨行/跨括号，把子查询内层的 FROM 当成本层（实测踩到）。 */
const FROM_RE = /\bFROM[ \t]+(?:("(?:[^"]|"")*")|`([^`]+)`|([A-Za-z0-9_][\w.\-*]*))/i;
/* 第一个 FROM 之后紧接 `(` = 子查询。必须先判这个：否则上面的正则从 `(` 处失败，
   会继续往后扫到**内层**的 FROM，把内层表名当选成本层（实测踩到）。 */
const SUBQUERY_RE = /\bFROM[ \t]*\(/i;

export function autoQuoteFromIndex(sql: string, knownIndices: string[]): QuoteFixResult {
  const src = String(sql ?? '');
  if (!src.trim() || !knownIndices.length) return { sql: src, quoted: null };
  /* 子查询：表名位不是标识符而是 `(` —— 不动。
     注意要求它出现在**第一个 FROM** 之后紧邻，避免误伤 `WHERE x IN (SELECT ... FROM t)` 里
     正常的 `FROM t`（那种场景第一个 FROM 后确实是标识符，不受此条影响）。 */
  const firstFrom = /\bFROM/i.exec(src);
  if (firstFrom) {
    const tail = src.slice(firstFrom.index, firstFrom.index + 64);
    if (SUBQUERY_RE.test(tail)) return { sql: src, quoted: null };
  }
  const m = FROM_RE.exec(src);
  if (!m) return { sql: src, quoted: null };
  /* 已带引号/反引号：不做任何事（用户已按官方写法） */
  if (m[1] != null || m[2] != null) return { sql: src, quoted: null };
  const bare = m[3];
  if (!bare) return { sql: src, quoted: null };
  /* 通配符形态（logs-*）不补：加了引号会变成字面索引名，语义反而错 */
  if (bare.includes('*')) return { sql: src, quoted: null };
  /* 必须在已知索引里精确存在，否则不动（不猜） */
  if (!knownIndices.includes(bare)) return { sql: src, quoted: null };
  /* 后面紧跟逗号 = 多表，不动（首表之外还有源，单源语义不成立） */
  const after = src.slice(m.index + m[0].length);
  if (/^\s*,/.test(after)) return { sql: src, quoted: null };

  const quoted = '"' + bare.replace(/"/g, '""') + '"';
  const start = m.index + m[0].length - bare.length;
  return {
    sql: src.slice(0, start) + quoted + src.slice(start + bare.length),
    quoted: bare,
  };
}
