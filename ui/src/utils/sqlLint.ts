/**
 * P0-3：SQL 静态 lint（SqlConsoleView / SqlBridgeView 划线+banner 双通道消费）。
 * 纯函数、零 Monaco/Vue 依赖，规则可穷举单测；输出 { line, message, suggestion } 行号形态
 * （MonacoEditor.setLineMarkers 行号直射契约，SynonymsManagerView 范式）。
 *
 * 规则宁少勿误报（dslLint 同哲学）——五条：
 * ① 引号未闭合（单/双引号，'' "" 双写转义；未闭合时只报此一条，其余规则整体跳过——
 * 字符串挖除不可靠，LuceneInput.syntaxIssues 同口径防噪音叠加）
 * ② 括号不平衡（()[]{} 栈扫描：配对错乱报错位行，残栈报首个未闭合括号行）
 * ③ FROM 缺表名（FROM 后无表名 token：EOF/标点/保留字开头均缺；引号壳与 ( 子查询算在场）
 * ④ 保留字拼写（SELECT/FROM/WHERE/GROUP/ORDER 词表编辑距离 ≤2，且只在「词位证据」成立时
 * 提示——后随运算符/函数括号/限定点/保留字即视为标识符用法豁免，列名 form/wheres 等
 * 同形词不误报；GROUP/ORDER 额外要求后随 ≈BY；SELECT 要求语句起始位）
 * ⑤ 行尾悬空 AND/OR（逐行；大小写不敏感；RANDOM/FOR 等词内命中被 \b 挡住）
 */
import { editDistance } from './editDistance';

interface SqlLintFinding {
  line: number;
  message: string;
  suggestion: string;
}

/** 词法 token（挖除后的掩码文本上切）：word=标识符/数字词，否则单字符符号。 */
interface SqlTok { w: string; word: boolean; line: number }

/** 保留字精确表：两个用途——FROM 缺表名的「后随保留字」判定、拼写候选的「后随词是保留字
 * → 标识符用法」豁免。收录常用子句/操作词即可（宁小勿误）。 */
const RESERVED = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'ORDER', 'BY', 'LIMIT', 'HAVING',
  'AND', 'OR', 'NOT', 'AS', 'ASC', 'DESC', 'BETWEEN', 'IN', 'IS', 'NULL',
  'LIKE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'UNION', 'ALL',
  'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'INTERVAL',
]);

/** 拼写词表（规则④）：GROUP BY / ORDER BY 拆单词判，BY 由词位守卫补验 */
const KW_VOCAB = ['SELECT', 'FROM', 'WHERE', 'GROUP', 'ORDER'];

/** 标识符用法豁免的后随符号集：出现即说明该词是名字不是关键字 */
const IDENT_NEXT_SYMS = new Set(['=', '<', '>', '!', '+', '-', '/', ',', ';', ')', '.']);
/* 注意：'*' 不入集——SELECT 后随 * 是关键字证据（语句起始位守卫另行把关，见 ruleKeyword） */

const WORD_RE = /[A-Za-z0-9_$#]/;

function tokenize(s: string, lineOf: (i: number) => number): SqlTok[] {
  const toks: SqlTok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (WORD_RE.test(ch)) {
      let j = i;
      while (j < s.length && WORD_RE.test(s[j])) j++;
      toks.push({ w: s.slice(i, j), word: true, line: lineOf(i) });
      i = j;
    } else {
      toks.push({ w: ch, word: false, line: lineOf(i) });
      i++;
    }
  }
  return toks;
}

/** 词表内最近候选（严格最小才返回；并列/无 ≤2 候选 → null，宁少勿误报）。 */
function nearestKeyword(w: string): string | null {
  let best: string | null = null;
  let bestD = 3;
  let tie = false;
  for (const kw of KW_VOCAB) {
    const d = editDistance(w, kw);
    if (d === 0 || d > 2) continue;
    if (d < bestD) { bestD = d; best = kw; tie = false; }
    else if (d === bestD) tie = true;
  }
  return best && !tie ? best : null;
}

/** 词位证据守卫下的拼写候选判定（kw=nearestKeyword 命中的词表关键字，分支按词表关键字
 * 而非拼错词本身）：返回是否可报。
 * - GROUP/ORDER：后随词 ≈BY（编辑距离 ≤1）即关键字证据（GROP BY / ORDR BY）；
 * - SELECT：语句起始位（文首/`;`/`(` 之后）且后随 `*` 或标识符样；
 * - FROM/WHERE：后随标识符样（非保留词或引号壳）且前驱非保留字（表名位豁免）。
 * 运算符后随/函数括号/限定点三种标识符用法在各分支前置豁免。 */
function keywordTypo(kw: string, t: SqlTok, pv: SqlTok | undefined, nx: SqlTok | undefined, nx2: SqlTok | undefined): boolean {
  if (!nx) return false;
  if (kw === 'GROUP' || kw === 'ORDER') {
    const nxU = nx.word ? nx.w.toUpperCase() : '';
    return !!nxU && editDistance(nxU, 'BY') <= 1;
  }
  if (nx.w === '(') return false; /* 函数调用：COUNT( 之类 */
  if (nx.w === '.' || pv?.w === '.') return false; /* 限定名片段：a.form / form.x */
  const nxIdentLike = nx.word ? !RESERVED.has(nx.w.toUpperCase()) : nx.w === '"' || nx.w === "'";
  if (!nxIdentLike && nx.w !== '*') return false; /* 后随运算符/标点 = 标识符用法 */
  if (kw === 'SELECT') {
    /* 语句起始位才判（列名 selects 等豁免） */
    return !pv || pv.w === ';' || pv.w === '(';
  }
  if (kw === 'FROM' || kw === 'WHERE') {
    if (!nxIdentLike) return false; /* 后随 `*` 只属 SELECT 语义，FROM/WHERE 不判 */
    if (pv && RESERVED.has(pv.w.toUpperCase())) return false; /* 前驱保留字=表名/值位豁免 */
    if (kw === 'FROM' && nx2 && nx2.word && !RESERVED.has(nx2.w.toUpperCase())) return false;
    /* FROM 的表名位后不应再跟普通标识符（别名须 AS）——`select a form t x` 形态存疑不判，
 `select a, b form t where` 的 nx2=WHERE 才出证据（EOF/`;`/保留字跟随均放行） */
    return true;
  }
  return false;
}

/* ⑦（1389）：GROUP BY / ORDER BY 里排不了、分不了组的 text 字段。

 依据（ES SQL 官方）：text 字段的值依赖分词器，官方原文是它「not used for sorting
 or aggregations」；能用的情况只有一种——SQL 自己找到一个**未归一化的 keyword 多字段**
 来代表精确值（"the first keyword that it can find that is not normalized"）。
 所以：text 字段有 `.keyword` 子域 → 合法，一个字都不报；没有子域 → 执行必失败，
 提前点名，别等用户拿到一个 400。

 只认**精确的字段名证据**：名字不在 fieldTypes 里（未加载/运行时字段/别名/表达式别名）
 一律不判——宁缺勿错。 */
const SQL_TEXT_TYPES = new Set(['text', 'match_only_text']);

/** 逐条找出「在 GROUP BY / ORDER BY 里、是 text 且没有 .keyword 子域」的字段。
 *  `clause` 是掩码文本里该子句之后、下一个子句之前的那段。 */
function unmaterializableSortField(
  field: string, fieldTypes: Record<string, string>, lineOf: (i: number) => number, offset: number,
): SqlLintFinding | null {
  const name = field.trim();
  if (!name || name.includes('(') || name.includes('.')) return null;
  const type = fieldTypes[name];
  if (!type || !SQL_TEXT_TYPES.has(type)) return null;
  if (fieldTypes[name + '.keyword'] === 'keyword') return null;
  return {
    line: lineOf(offset),
    message: `「${name}」是 text 字段且没有 .keyword 子域，ES SQL 排不了也分不了组`,
    suggestion: `给该字段加 ${name}.keyword 子域后重建索引，或改用 keyword/date/数值字段；`
      + `text 字段的分词值只能全文检索，不能排序/分组`,
  };
}

/** 拆 GROUP BY / ORDER BY 的条目（逗号分隔，跳过括号内），返回 {name, offset} 列表 */
function clauseItems(text: string, start: number): Array<{ name: string; offset: number }> {
  const out: Array<{ name: string; offset: number }> = [];
  let depth = 0, cur = '', curStart = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === ',' || ch === ';')) {
      if (cur.trim()) out.push({ name: cur.trim(), offset: start + (curStart < 0 ? i : curStart) });
      cur = ''; curStart = -1; continue;
    }
    if (!cur.trim() && !/\s/.test(ch) && curStart < 0) curStart = i;
    cur += ch;
  }
  if (cur.trim()) out.push({ name: cur.trim(), offset: start + (curStart < 0 ? 0 : curStart) });
  return out;
}

/** 7：GROUP BY / ORDER BY 里不可排序的 text 字段（见上方依据）。
 *  只用原文 sql（masked 已把引号壳挖空，字段名会丢）。 */
function textFieldRule(sql: string, fieldTypes: Record<string, string>, lineOf: (i: number) => number): SqlLintFinding[] {
  const out: SqlLintFinding[] = [];
  const seen = new Set<string>();
  const re = /\b(GROUP\s+BY|ORDER\s+BY)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const bodyStart = m.index + m[0].length;
    const rest = sql.slice(bodyStart);
    /* 子句结束点：下一个子句关键字 / 分号 / 文字末尾 */
    const endM = /\b(?:HAVING|ORDER\s+BY|LIMIT|FETCH|GROUP\s+BY)\b|;/i.exec(rest);
    const body = endM ? rest.slice(0, endM.index) : rest;
    for (const item of clauseItems(body, bodyStart)) {
      /* 只取纯字段名：`col DESC` / `"col"` / `col` 三种写法；表达式（函数/别名）不判 */
      const fm = /^(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][\w.]*))(?:\s+(?:ASC|DESC))?\s*$/.exec(item.name);
      if (!fm) continue;
      const field = fm[1] ?? fm[2] ?? fm[3] ?? '';
      if (seen.has(field)) continue;
      const hit = unmaterializableSortField(field, fieldTypes, lineOf, item.offset);
      if (hit) { seen.add(field); out.push(hit); }
    }
  }
  return out;
}

/** 8：LIKE / RLIKE 打在无 .keyword 子域的 text 字段上（1389 同族）。
 *  官方原文（Like and RLike operators）：「If the field used with LIKE / RLIKE doesn't
 *  have an exact not-normalized sub-field (of keyword type) Elasticsearch SQL will not be
 *  able to run the query.」——有子域时 SQL 自己会用，没有就必失败。
 *  与 ⑦ 一样只认精确类型证据（未知名/表达式/子域名不判）。 */
function likeTextFieldRule(sql: string, fieldTypes: Record<string, string>, lineOf: (i: number) => number): SqlLintFinding[] {
  const out: SqlLintFinding[] = [];
  const seen = new Set<string>();
  /* `field LIKE` / `field NOT LIKE` / `field RLIKE`——左侧允许引号标识符与点分路径 */
  const re = /(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][\w.]*))\s+(?:NOT\s+)?(?:LIKE|RLIKE)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1] ?? m[2] ?? m[3] ?? '';
    /* 子域名本身就是精确字段（xxx.keyword LIKE 合法） */
    if (!name || name.endsWith('.keyword')) continue;
    const type = fieldTypes[name];
    if (!type || !SQL_TEXT_TYPES.has(type)) continue;
    if (fieldTypes[name + '.keyword'] === 'keyword') continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({
      line: lineOf(m.index),
      message: `「${name}」是 text 字段且没有 .keyword 子域，LIKE 在 ES SQL 里跑不了`,
      suggestion: `LIKE 只能作用于精确（keyword）值：给该字段加 ${name}.keyword 子域后写成 `
        + `"${name}.keyword" LIKE '…'；只想全文检索就改用 MATCH(${name}, '…')`,
    });
  }
  return out;
}

/** SQL 静态 lint 主入口。空/全空白输入零误报返回 []。
 * `knownIndices`（可选）用于第 ⑥ 条规则：FROM 后的裸索引名若**精确命中**已知索引，
 * 说明用户是漏了双引号（ES SQL 要求标识符带引号，否则 `-`/`.` 会被当运算符报语法错）。
 * `fieldTypes`（可选，1389）用于第 ⑦ 条规则：GROUP BY / ORDER BY 里的 text 字段若
 * 没有 `.keyword` 子域，ES SQL 排不了也分不了组。
 * 两个都可省略——不传即零增量，其余规则与既有契约完全不变。 */
export function lintSql(sql: string, knownIndices: string[] = [], fieldTypes?: Record<string, string>): SqlLintFinding[] {
  const out: SqlLintFinding[] = [];
  if (!sql || !sql.trim()) return out;

  /* 行号工具：掩码与原文同索引（串内容挖成空格、换行保留），lineOf 对两者通用 */
  const lineStarts: number[] = [0];
  for (let i = 0; i < sql.length; i++) if (sql[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (idx: number): number => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };

  /* ① 引号未闭合 + 字符串挖除（'' "" 双写转义；串内挖成空格、引号壳保留——表名/串值
 词法上退化为壳 token，行号不变）。 */
  const chars = sql.split('');
  let unclosedLine = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch !== '\'' && ch !== '"') continue;
    let j = i + 1;
    let closed = false;
    while (j < chars.length) {
      if (chars[j] === ch) {
        if (chars[j + 1] === ch) { j += 2; continue; } /* 双写转义 */
        closed = true;
        break;
      }
      j++;
    }
    if (!closed) { unclosedLine = lineOf(i); break; }
    for (let k = i + 1; k < j; k++) if (chars[k] !== '\n') chars[k] = ' ';
    i = j;
  }
  if (unclosedLine) {
    return [{
      line: unclosedLine,
      message: '引号未闭合（缺收尾引号）',
      suggestion: 'SQL 串用单引号、标识符用双引号；串内引号双写转义（两个连续引号表示一个字面引号）',
    }];
  }
  const masked = chars.join('');

  /* ② 括号不平衡（栈扫描：右括号弹栈不配对报错位行；残栈报首个未闭合括号行） */
  {
    const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
    const stack: { ch: string; line: number }[] = [];
    let mismatchLine = 0;
    for (let i = 0; i < masked.length; i++) {
      const ch = masked[i];
      if (ch === '(' || ch === '[' || ch === '{') stack.push({ ch, line: lineOf(i) });
      else if (ch === ')' || ch === ']' || ch === '}') {
        const top = stack.pop();
        if (!top || top.ch !== PAIRS[ch]) { mismatchLine = lineOf(i); break; }
      }
    }
    if (mismatchLine) {
      out.push({
        line: mismatchLine,
        message: '括号不平衡（()[]{} 配对错乱）',
        suggestion: '检查括号配对：函数调用/子查询的 ( 需有对应 )',
      });
    } else if (stack.length) {
      out.push({
        line: stack[0].line,
        message: `括号不平衡（${stack[0].ch} 未闭合）`,
        suggestion: '补齐对应的闭括号；子查询/函数实参各占一对',
      });
    }
  }

  const toks = tokenize(masked, lineOf);

  /* ③ FROM 缺表名 */
  for (let ti = 0; ti < toks.length; ti++) {
    const t = toks[ti];
    if (!t.word || t.w.toUpperCase() !== 'FROM') continue;
    const nx = toks[ti + 1];
    /* 缺表名形态：EOF / 后随保留字 / 后随标点（引号壳=表名在场、( =子查询，均豁免） */
    const missing = !nx
      || (nx.word && RESERVED.has(nx.w.toUpperCase()))
      || (!nx.word && nx.w !== '"' && nx.w !== "'" && nx.w !== '(');
    if (missing) {
      out.push({
        line: t.line,
        message: 'FROM 缺少表名',
        suggestion: 'FROM 后写目标索引名，如 FROM "my-index"（标识符须双引号包裹）',
      });
    }
  }

  /* ④ 保留字拼写（词位证据守卫，见 keywordTypo） */
  for (let ti = 0; ti < toks.length; ti++) {
    const t = toks[ti];
    if (!t.word) continue;
    const upper = t.w.toUpperCase();
    if (RESERVED.has(upper)) continue;
    const near = nearestKeyword(upper);
    if (near && keywordTypo(near, t, toks[ti - 1], toks[ti + 1], toks[ti + 2])) {
      out.push({
        line: t.line,
        message: `保留字「${t.w}」疑似拼写错误（最接近：${near}）`,
        suggestion: `改为 ${near}；ES SQL 关键字不区分大小写，拼错会被当成列名报 Unknown column`,
      });
    }
  }

  /* ⑥ FROM 后的裸索引名缺双引号（1386）——只在名字**精确命中已知索引**时报，不猜。
     ⚠ 必须在**原文 sql 上**匹配，不能用 masked：masked 把引号壳与串内容挖成空格，
     `FROM "my-index"` 会退化成看起来像裸名的形态，反而假报（实测踩到）。
     排除规则与 utils/sqlQuote.autoQuoteFromIndex 完全一致：通配符 / 多表 / 子查询不动。

     1435：**只对「不加引号会真的解析失败」的名字报**（含 `.` / `-` 等非标识符字符）。
     此前对所有裸名都报——`FROM research_report` 是完全合法的写法，用户写对了却看到
     红字，正是「误报会让人改坏正确查询或无视告警」的典型。执行侧本来就会自动补引号
     （autoQuoteFromIndex），没必要在编辑期对合法输入报问题。 */
  if (knownIndices.length) {
    const known = new Set(knownIndices);
    const fm = /\bFROM[ \t]+(?:("(?:[^"]|"")*")|`([^`]+)`|([A-Za-z0-9_][\w.\-*]*))/i.exec(sql);
    const bare = fm && fm[1] == null && fm[2] == null ? fm[3] : null;
    if (fm && bare && !bare.includes('*') && known.has(bare) && /[^\w]/.test(bare)) {
      const after = sql.slice(fm.index + fm[0].length);
      if (!/^\s*,/.test(after)) {
        out.push({
          line: lineOf(fm.index),
          message: `索引名「${bare}」必须加双引号才合法`,
          suggestion: `名字里有 . 或 - 等非标识符字符，ES SQL 无法裸写：改成 FROM "${bare}"`,
        });
      }
    }
  }

  /* ⑤ 行尾悬空 AND/OR（逐行；大小写不敏感；词内命中被 \b 挡住） */
  const maskedLines = masked.split('\n');
  for (let i = 0; i < maskedLines.length; i++) {
    const m = /\b(AND|OR)\s*$/i.exec(maskedLines[i]);
    if (m) {
      out.push({
        line: i + 1,
        message: `行尾悬空 ${m[1].toUpperCase()}：缺右侧条件`,
        suggestion: 'AND/OR 两侧都要有完整条件表达式，或删去行尾悬空的运算符',
      });
    }
  }

  /* ⑦（1389）：GROUP BY / ORDER BY 里排不了也分不了组的 text 字段。
     需要字段类型证据；调用方没给类型就整条跳过（零增量）。 */
  if (fieldTypes && Object.keys(fieldTypes).length) {
    out.push(...textFieldRule(sql, fieldTypes, lineOf));
    out.push(...likeTextFieldRule(sql, fieldTypes, lineOf));
  }

  /* 1391：按行号升序输出。各规则是独立扫描、结果按规则追加，命中多条时顺序是
     「规则序」而不是「文档序」——实测同一条 SQL 出过 第1行/第3行/第2行 的排法，
     用户读起来像乱的。同行的保持规则序（稳定排序），规则内部语义不受影响。 */
  out.sort((a, b) => a.line - b.line);

  return out;
}
