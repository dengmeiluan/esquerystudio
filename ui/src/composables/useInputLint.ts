import { ref, type Ref } from 'vue';

/* ux2 ：非编辑器输入智能——实体名查重/命名规则 + 结构化格式值校验。
 composable 只出数据（hint/level/check/clear），提示条样式全仓单一出处 theme.css .il-hint */

type LintLevel = 'err' | 'warn';
export type LintRule = (v: string) => { msg: string; level?: LintLevel } | null;

interface InputLint {
  hint: Ref<string>;
  level: Ref<LintLevel | ''>;
  /** 逐规则跑、首个命中胜出；trim 后空串一律放行（空值语义交必填/默认值逻辑）。返回是否通过 */
  check: (v: string) => boolean;
  clear: () => void;
}

export function useInputLint(rules: LintRule[]): InputLint {
  const hint = ref('');
  const level = ref<LintLevel | ''>('');
  function clear() { hint.value = ''; level.value = ''; }
  function check(v: string): boolean {
    clear();
    const t = (v || '').trim();
    if (!t) return true;
    for (const r of rules) {
      const hit = r(t);
      if (hit) { hint.value = hit.msg; level.value = hit.level ?? 'err'; return false; }
    }
    return true;
  }
  return { hint, level, check, clear };
}

/** ES 索引名规则（spec -1 钦定）：全小写；禁 \/*?"<>| 空格 , # :；禁 . / _ 开头；≤255 字节 */
export function indexNameRule(): LintRule {
  return (v) => {
    if (/[A-Z]/.test(v)) return { msg: '索引名必须全小写' };
    if (/[\\/*?"<>| ,#:]/.test(v)) return { msg: '索引名含非法字符（\\ / * ? " < > | 空格 , # :）' };
    if (/^[._]/.test(v)) return { msg: '索引名不得以 . 或 _ 开头（保留给系统索引）' };
    if (new TextEncoder().encode(v).length > 255) return { msg: '索引名超长（>255 字节）' };
    return null;
  };
}

/** 实体查重：默认 warn（put 覆盖语义）；建索引等硬失败场景传 'err' */
export function dupRule(existing: () => Iterable<string>, what: string, level: LintLevel = 'warn'): LintRule {
  return (v) => {
    for (const e of existing()) {
      if (e === v) return { msg: `${what}「${v}」已存在${level === 'err' ? '' : '，保存将覆盖'}`, level };
    }
    return null;
  };
}

/** 结构化格式值：正则一次性判定 */
export function patternRule(re: RegExp, msg: string): LintRule {
  return (v) => (re.test(v) ? null : { msg });
}

export const TIME_RE = /^-1$|^\d+(ms|s|m|h|d)$/;
export const SLICES_RE = /^auto$|^\d+$/;
export const RPS_RE = /^-1$|^\d+(\.\d+)?$/;

/** jq 轻量预检（spec -2：括号配对/非法起始符，不引 jq 引擎）。
 一律 warn——字符串字面量内括号可能误报，只提醒不阻断。
 执行实证修正：起始符放行 `{`/`(`（计划原正则 /^[.|[]/ 与本计划测试自相矛盾——`{a: .}` 钦定合法、`(.a` 钦定走「未闭合」而非起始拦截；以测试为权威规格校准，msg 文案测试钉死不动） */
export function jqLiteRule(): LintRule {
  const close: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  return (v) => {
    if (!/^[.[{(]/.test(v)) return { msg: 'jq 表达式通常以 . 或 [ 起始', level: 'warn' };
    const stack: string[] = [];
    for (const ch of v) {
      if (ch === '(' || ch === '[' || ch === '{') stack.push(ch);
      else if (ch in close) {
        if (stack.pop() !== close[ch]) return { msg: `括号不配对：「${ch}」无匹配开放符`, level: 'warn' };
      }
    }
    if (stack.length) return { msg: '括号不配对：有未闭合括号', level: 'warn' };
    return null;
  };
}
