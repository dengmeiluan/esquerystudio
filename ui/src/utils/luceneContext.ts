/* Lucene 光标段判定：只看光标左侧文本，从尾向前扫描。
 覆盖 field:/AND/OR/NOT/括号/引号短语/范围；长尾语法（模糊~/正则）一律兜底为 field/value 段（零降级）。
 尾部 boost^2/^2.5 剥离——`status^2:ok` 判 field=status（原误判 `status^2`）、
 `status:ok^2` 值前缀剥净（原 terms 前缀滤空）；提权语法本身不拦（零降级保留）。
 W2 ：LuceneInput（的判段纯函数 —— field 段→字段补全；value 段→terms 建议；
 phrase 段→不出层；op 段→AND/OR/NOT 提示。 */
import { isEscapedQuote } from './dslCompletionContext';

export type LuceneSeg =
  | { kind: 'field'; prefix: string }
  | { kind: 'value'; field: string; prefix: string }
  | { kind: 'op'; prefix: string }
  | { kind: 'phrase'; field: string | null; prefix: string };

const OPS = ['AND', 'OR', 'NOT'];

export function luceneSegment(text: string, cursor: number): LuceneSeg {
  const left = text.slice(0, Math.max(0, Math.min(cursor, text.length)));

  /* 1+2. 单趟前扫：引号状态 inQ + 未闭合范围栈（[ 与 { 同为 opener，] 与 } 同为 closer，跨类型 pop 可接受）。
 引号内括号不计数（'msg:"[WARN" AND sta' 的 [ 不污染栈）；范围语法内的空白不是结构边界
 （'age:[10 TO ' 的尾部空格不断词）。inQ 收尾为真 → 光标在未闭合短语内：前缀=引号后内容，字段=引号前最近的 field: */
  let inQ = false;
  let lastQ = -1;
  const stack: number[] = [];
  for (let j = 0; j < left.length; j++) {
    const ch = left[j];
    if (ch === '"' && !isEscapedQuote(left, j)) { inQ = !inQ; if (inQ) lastQ = j; }
    else if (!inQ && (ch === '[' || ch === '{')) stack.push(j);
    else if (!inQ && (ch === ']' || ch === '}')) stack.pop();
  }
  if (inQ) {
    const beforeQ = left.slice(0, lastQ);
    const m = beforeQ.match(/([\w.*]+)\s*:\s*$/);
    return { kind: 'phrase', field: m ? m[1] : null, prefix: left.slice(lastQ + 1) };
  }
  const lastOpen = stack.length > 0 ? stack[stack.length - 1] : -1;

  /* 3. 从尾向前扫描到最近的结构边界（空白/括号；未闭合 [/{ 之后的空白跳过）。
 空白含 tab/换行等任意 \s（'status:ok AND\tmes' 的 tab 同样断词） */
  let i = left.length - 1;
  for (; i >= 0; i--) {
    const ch = left[i];
    if (/\s/.test(ch) || ch === '(' || ch === ')') {
      if (/\s/.test(ch) && lastOpen >= 0 && i > lastOpen) continue;
      break;
    }
  }
  const start = i + 1;
  const token = left.slice(start);

  /* 尾部 boost 剥离——query_string 提权语法 `field^2:value^2` 此前被判成
 field=`status^2`（未知字段误报）/ 值前缀带 ^2（terms 前缀滤空补全失效）。
 field 段前缀、value 段字段名与值前缀三处同剥，补全恢复命中；语义零降级不拦输入 */
  const deboost = (s: string) => s.replace(/\^\d+(?:\.\d+)?$/, '');

  /* 4. token 内含冒号 → value 段；范围值前缀取最后一个空白之后（'[10 TO ' → ''） */
  const colon = token.indexOf(':');
  if (colon >= 0) {
    const field = deboost(token.slice(0, colon));
    const raw = token.slice(colon + 1);
    const sp = raw.lastIndexOf(' ');
    return { kind: 'value', field, prefix: deboost(sp >= 0 ? raw.slice(sp + 1) : raw) };
  }

  /* 5. 前一词以 field: 收尾且光标前是空白/左括号 → value 段（'status: '、'foo:(' 场景）；
 字段名允许带 boost（`status^2: ` → field=status） */
  const before = left.slice(0, start).replace(/[()]+$/, '');
  const fm = before.match(/([\w.*]+)(?:\^\d+(?:\.\d+)?)?:\s*$/);
  if (fm && start > 0 && /[\s(]/.test(left[start - 1])) {
    return { kind: 'value', field: fm[1], prefix: deboost(token) };
  }

  /* 6. 操作符整词判定 */
  if (OPS.includes(token)) return { kind: 'op', prefix: token };

  /* 7. 默认字段段（前缀尾部 boost 剥净，`status^2` → 字段补全照常命中） */
  return { kind: 'field', prefix: deboost(token) };
}
