/**
 * JSONC 注释剥离：支持 // 单行与 /\* *\/ 多行，字符串内的 // 与 /* 不受影响。
 * Kibana Console 同款体验——调试时注释掉某个 filter 子句。
 */
import { ROOT_KEYS, QUERY_SNIPPETS, AGG_SNIPPETS, ANALYSIS_PARAM_ZH } from './dslCompletionContext';

/* 件①：字符串感知注释扫描抽出为导出单源（stripJsonComments 的扫描内核平移，
 消费方=monacoJsonQuickFix json provider 自扫注释出「删除注释」quickfix——MonacoEditor
 setDiagnosticsOptions({ allowComments, comments:'ignore' }) 下 JSON worker 永不产注释
 marker，的 comments quickfix 无 lint 源是死代码，自扫复活面）。
 返回字符串（"…"，含 \\ 转义）之外的全部注释区间（offset，end 不含界外字符）：
 // 行注释止于换行前（不含 \n）；块注释区间含 /* 与 *\/ 定界符；未闭合钳制到文末。 */
export function findCommentRanges(src: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let i = 0;
  const n = src.length;
  let inStr = false;
  while (i < n) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') { i += 2; continue; }
      if (c === '"') inStr = false;
      i++;
      continue;
    }
    if (c === '"') { inStr = true; i++; continue; }
    if (c === '/' && i + 1 < n && src[i + 1] === '/') {
      const start = i;
      while (i < n && src[i] !== '\n') i++;
      ranges.push({ start, end: i });
      continue;
    }
    /* `#` 行注释：Kibana Console 的第二种单行注释语法（官方键位/语法表列明）。
       此前只认 `//`，用户照 Kibana 写 `# 说明` 会被原样发给 ES 报语法错。 */
    if (c === '#') {
      const start = i;
      while (i < n && src[i] !== '\n') i++;
      ranges.push({ start, end: i });
      continue;
    }
    if (c === '/' && i + 1 < n && src[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i + 1 < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      ranges.push({ start, end: Math.min(i, n) });
      continue;
    }
    i++;
  }
  return ranges;
}

export function stripJsonComments(src: string): string {
  /* 件①：改消费 findCommentRanges 单源（区间拼装与旧逐字符拼非注释字符
 逐字等价，devtoolsJsonc311 行为锁保形） */
  const ranges = findCommentRanges(src);
  if (!ranges.length) return src;
  let out = '';
  let i = 0;
  for (const r of ranges) { out += src.slice(i, r.start); i = r.end; }
  out += src.slice(i);
  return out;
}

/** 安全 JSON.parse：返回 null 而非抛异常 */
export function tryParse(text: string): any {
  try { return JSON.parse(text); } catch { return null; }
}

/** 美化 JSON（失败回退原文） */
export function prettyJson(v: any): string {
  try { return typeof v === 'string' ? JSON.stringify(JSON.parse(v), null, 2) : JSON.stringify(v, null, 2); }
  catch { return String(v ?? ''); }
}

/** JSON 语法高亮 HTML（转义安全） */
export function highlightJson(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc(text).replace(
    /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(\.\d+)?([eE][+-]?\d+)?)/g,
    (m) => {
      let cls = 'j-num';
      if (m.startsWith('"')) cls = m.endsWith(':') ? 'j-key' : 'j-str';
      else if (m === 'true' || m === 'false') cls = 'j-bool';
      else if (m === 'null') cls = 'j-null';
      return `<span class="${cls}">${m}</span>`;
    }
  );
}

/* DSL 语义键表（highlightDslJson 的 j-clause 着色域）——键源收口 dslCompletionContext
 既有导出只读 import（单源不重复造表）：ROOT_KEYS 根层键（query/sort/aggs/_source/highlight/
 from/size/track_total_hits）、QUERY_SNIPPETS 查询子句类型（match/term/terms/range/exists/
 wildcard/bool…）、AGG_SNIPPETS 聚合类型（含 aggs 嵌套入口）、ANALYSIS_PARAM_ZH 分析参数键；
 另补 bool 容器内部键 must/should/must_not/filter（bool 骨架 snippet 中的容器键，该文件
 无独立导出——filter 与 ANALYSIS_PARAM_ZH 交集自然去重）。 */
const DSL_SEMANTIC_KEYS: ReadonlySet<string> = new Set([
  ...ROOT_KEYS,
  ...Object.keys(QUERY_SNIPPETS),
  ...Object.keys(AGG_SNIPPETS),
  ...Object.keys(ANALYSIS_PARAM_ZH),
  'must', 'should', 'must_not', 'filter',
]);

/** DSL 语义高亮（复用既有语法遍正则（highlightJson）后做第二遍键位查表——
 * 键名命中 DSL 语义表的 j-key 升级 j-clause（语义色与普通键区分），词表外键维持 j-key。
 * span 只换类名不改文本，textContent 与 highlightJson 输出逐字一致（errPre/bt-dsl/raw 面
 * 既有 textContent 消费零扰动）；转义安全性与 highlightJson 同内核。 */
export function highlightDslJson(text: string): string {
  return highlightJson(text).replace(
    /<span class="j-key">("(?:[^"\\]|\\.)*")(:?)<\/span>/g,
    (m, lit: string, colon: string) => {
      let key: string | null = null;
      try { key = JSON.parse(lit); } catch { /* 残缺转义序列：维持 j-key */ }
      return key !== null && DSL_SEMANTIC_KEYS.has(key)
        ? `<span class="j-clause">${lit}${colon}</span>`
        : m;
    },
  );
}
