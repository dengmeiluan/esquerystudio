import { writeStoredRaw } from './safeJson';
const KEY = 'es_vars';

export function loadVars(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export function saveVars(vars: Record<string, string>) {
  writeStoredRaw(localStorage, KEY, JSON.stringify(vars));
}

/**
 * Console Variables：${var} 插值（Kibana Console 同款）。
 *
 * 语义（与 Kibana 对齐，且在「路径」与「JSON 体」两种上下文里有区别）：
 *  - **路径**（`pathMode`）：一律按字符串原文替换，绝不加引号——
 *    `/${idx}/_search` 必须得到 `/orders/_search`，加引号会变成合法但错误的路径。
 *  - **JSON 体**：`"${var}"`（值两侧紧贴引号）→ 字符串替换；
 *    裸 `${var}` → 值本身是合法 JSON 时按 JSON 注入（数字/数组/对象），
 *    否则加引号成字符串（保证产出仍是合法 JSON）。
 *  - **三引号** `"""${var}"""` → 强制字符串替换（Kibana 同款）。用于值是合法 JSON
 *    但希望它当字符串的场景：`{"code": """${n}"""}` → `{"code": "5"}`。
 *    三引号围栏本身要收成一对普通引号（否则 `"""5"""` 不是合法 JSON），
 *    所以必须**先于**常规替换单独扫一遍——`replace` 回调只能改 `${}` 自身，
 *    没法同时吃掉外侧的两个引号。
 *  - 未定义变量原样保留，由 `missingVars` 在发送前显式提示。
 */
export function applyVars(text: string, vars?: Record<string, string>, opts?: { pathMode?: boolean }): string {
  const v = vars || loadVars();
  const pathMode = !!opts?.pathMode;
  if (pathMode) {
    return text.replace(/\$\{([\w.-]+)\}/g, (raw, name: string) => (name in v ? v[name] : raw));
  }
  /* 先把三引号整段收口成普通字符串字面量："""...${var}...""" → "..." + 值 + "..."
     内部若还含 ${other} 会继续被下面的常规替换处理。 */
  const collapsed = text.replace(/"""([\s\S]*?)"""/g, (_m, inner: string) =>
    JSON.stringify(inner.replace(/\$\{([\w.-]+)\}/g, (raw, name: string) => (name in v ? v[name] : raw))));
  return collapsed.replace(/\$\{([\w.-]+)\}/g, (raw, name: string, offset: number, full: string) => {
    if (!(name in v)) return raw;
    const value = v[name];
    const before = full[offset - 1];
    const after = full[offset + raw.length];
    if (before === '"' && after === '"') {
      // 引号内 → 纯字符串替换（不转义）
      return value;
    }
    // 裸值 → 尝试 JSON 语义注入
    try { JSON.parse(value); return value; } catch { return JSON.stringify(value); }
  });
}

/** 文本里出现、但变量表里没有的占位符（去重，保持首现序）。
 *  存在的意义：执行前必须能告诉用户「你引用了未定义的变量」——
 *  静默把 `${var}` 原样发给 ES 会得到难懂的语法错误，用户以为控制台坏了。 */
export function missingVars(text: string, vars?: Record<string, string>): string[] {
  const v = vars || loadVars();
  const out: string[] = [];
  const re = /\$\{([\w.-]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    if (!(name in v) && !out.includes(name)) out.push(name);
  }
  return out;
}

/** 是否有任何占位符（用于「本次请求用到了变量」的顺带提示） */
export function hasVars(text: string): boolean {
  return /\$\{[\w.-]+\}/.test(text);
}
