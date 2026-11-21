/* 1109：ES SQL 错误锚点解析——纯函数、零 Monaco/Vue 依赖。
 ES SQL 的语法/列解析错误总是带 `line X:Y: ...` 前缀（X/Y 1-based），
 多行 SQL 里人眼很难按行列数过去；本函数只负责「从错误全文里取出锚点」，
 定位/高亮由 MonacoEditor.revealPosition 消费。取第一个命中（ES 只报首个错误），
 非法/缺失/0 值一律 null，调用方据此零增量。 */
export interface SqlErrPos {
  line: number;
  column: number;
}

/* `line 1:8:` / `line 1:8`（ES SQL 主形态）；`line 3, column 5` / `line 3 column 5`
 是 SQL 引擎/驱动的常见变体。左边界允许：行首、任意非字母（真实换行/引号/空格），
 以及 JSON 串化后的字面 `\n`（ES 错误面板里 reason 常以转义形态出现——此时 `line`
 前一字符是 `n`，普通 \b 会漏判）。`deadline 5:6` 这类词尾仍不命中。 */
const COLON_FORM = /(?:\\n|^|[^A-Za-z])line\s+(\d+)\s*:\s*(\d+)/i;
const COLUMN_FORM = /(?:\\n|^|[^A-Za-z])line\s+(\d+)\s*,?\s*column\s+(\d+)/i;

export function parseSqlErrorPos(text: string): SqlErrPos | null {
  if (!text) return null;
  const m = COLON_FORM.exec(text) || COLUMN_FORM.exec(text);
  if (!m) return null;
  const line = Number(m[1]);
  const column = Number(m[2]);
  if (!Number.isInteger(line) || !Number.isInteger(column)) return null;
  if (line < 1 || column < 1) return null;
  return { line, column };
}
