/**
 * 响应过滤表达式求值（DevTools「过滤响应」档，对标 Kibana Console 的 JQ / 正则双档）。
 *
 * 只实现 Kibana 文档列出的 JQ 子集：字段/数组访问、迭代、递归下降、管道、
 * select、比较、逻辑、重塑（对象构造）、字符串函数、join。不引第三方依赖——
 * 依赖会打进 361KB 的主包，而这里只需要一个可解释的小子集。
 *
 * 与 Kibana 的差异（有意为之、且会显式报错而非静默给出错值）：
 *   - 不支持 $变量、reduce/foreach、@base64 等格式串；
 *   - 不支持 `?` 可选链简写（用 `// empty` 表达缺失）。
 * 不支持的语法一律抛 `JqError`，调用方据此显示「表达式无效」，与 Kibana 的
 * "Invalid JQ expression" 同语义。
 */

export class JqError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JqError';
  }
}

/* ── 词法与语法：先解析成 AST，避免边解析边求值带来的回溯歧义 ── */
type Node =
  | { t: 'identity' }
  | { t: 'literal'; v: unknown }
  | { t: 'field'; name: string }
  | { t: 'index'; n: number }
  | { t: 'iterate' }
  | { t: 'recurse' }
  | { t: 'pipe'; l: Node; r: Node }
  | { t: 'comma'; items: Node[] }
  | { t: 'array'; body: Node | null }
  | { t: 'object'; pairs: { key: string; value: Node }[] }
  | { t: 'select'; cond: Node }
  | { t: 'binop'; op: string; l: Node; r: Node }
  | { t: 'not'; v: Node }
  | { t: 'call'; name: string; args: Node[] }
  | { t: 'optional'; body: Node };

interface Tok { k: 'num' | 'str' | 'ident' | 'punct'; v: string }

/* 多字符符号必须排在单字符前：`..` 先于 `.`、`//` 先于 `/`、`<=`/`>=`/`==`/`!=` 先于 `<`/`>`/`=`。
   否则 lex 会把 `..` 切成两个 `.`，递归下降就永远解析不出来。 */
const PUNCT = ['//', '==', '!=', '<=', '>=', '..', '|', ',', ':', ';', '.', '(', ')', '[', ']', '{', '}', '<', '>', '+', '-', '*', '/', '?'];

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < src.length) {
          const n = src[j + 1];
          s += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n;
          j += 2;
        } else { s += src[j++]; }
      }
      if (j >= src.length) throw new JqError('字符串未闭合');
      out.push({ k: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i + 1;
      while (j < src.length && /[0-9.eE+-]/.test(src[j])) j++;
      out.push({ k: 'num', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ k: 'ident', v: src.slice(i, j) });
      i = j;
      continue;
    }
    const p = PUNCT.find(x => src.startsWith(x, i));
    if (!p) throw new JqError(`无法识别的字符 '${c}'`);
    out.push({ k: 'punct', v: p });
    i += p.length;
  }
  return out;
}

class Parser {
  private i = 0;
  constructor(private toks: Tok[]) {}
  private peek(): Tok | undefined { return this.toks[this.i]; }
  private eat(v: string): boolean {
    const t = this.peek();
    if (t && t.k === 'punct' && t.v === v) { this.i++; return true; }
    return false;
  }
  private expect(v: string): void {
    if (!this.eat(v)) throw new JqError(`缺少 '${v}'`);
  }
  parse(): Node {
    const n = this.pipe();
    if (this.i < this.toks.length) throw new JqError('表达式后有多余内容');
    return n;
  }
  /* 优先级（低→高）：, | // or and 比较 +- */ 
  private pipe(): Node {
    const l = this.comma();
    if (this.eat('|')) return { t: 'pipe', l, r: this.pipe() };
    return l;
  }
  private comma(): Node {
    const items = [this.alt()];
    while (this.eat(',')) items.push(this.alt());
    return items.length === 1 ? items[0] : { t: 'comma', items };
  }
  private alt(): Node {
    const l = this.or();
    if (this.eat('//')) return { t: 'binop', op: '//', l, r: this.alt() };
    return l;
  }
  private or(): Node {
    const l = this.and();
    while (this.peek()?.k === 'ident' && this.peek()!.v === 'or') { this.i++; return { t: 'binop', op: 'or', l, r: this.or() }; }
    return l;
  }
  private and(): Node {
    const l = this.cmp();
    while (this.peek()?.k === 'ident' && this.peek()!.v === 'and') { this.i++; return { t: 'binop', op: 'and', l, r: this.and() }; }
    return l;
  }
  private cmp(): Node {
    const l = this.add();
    const t = this.peek();
    if (t && t.k === 'punct' && ['==', '!=', '<', '>', '<=', '>='].includes(t.v)) {
      this.i++;
      return { t: 'binop', op: t.v, l, r: this.add() };
    }
    return l;
  }
  private add(): Node {
    const l = this.mul();
    const t = this.peek();
    if (t && t.k === 'punct' && ['+', '-'].includes(t.v)) { this.i++; return { t: 'binop', op: t.v, l, r: this.mul() }; }
    return l;
  }
  private mul(): Node {
    const l = this.unary();
    const t = this.peek();
    if (t && t.k === 'punct' && ['*', '/'].includes(t.v)) { this.i++; return { t: 'binop', op: t.v, l, r: this.unary() }; }
    return l;
  }
  private unary(): Node {
    if (this.eat('..')) return { t: 'recurse' };
    if (this.eat('.')) {
      /* `.foo` 是字段访问；单独 `.` 是 identity。两者区别只在于点后是否紧跟键名。 */
      const t = this.peek();
      if (t?.k === 'ident' && !['and', 'or', 'not', 'select', 'true', 'false', 'null', 'empty'].includes(t.v)) {
        this.i++;
        return this.postfix({ t: 'field', name: t.v });
      }
      if (t?.k === 'str') { this.i++; return this.postfix({ t: 'field', name: t.v }); }
      return this.postfix({ t: 'identity' });
    }
    if (this.eat('[')) {
      if (this.eat(']')) return this.postfix({ t: 'array', body: null });
      const body = this.pipe();
      this.expect(']');
      return this.postfix({ t: 'array', body });
    }
    if (this.eat('{')) {
      const pairs: { key: string; value: Node }[] = [];
      if (!this.eat('}')) {
        do {
          const kt = this.peek();
          let key: string;
          if (kt?.k === 'ident' || kt?.k === 'str') { key = kt.v; this.i++; }
          else if (this.eat('(')) { throw new JqError('不支持动态键 {(...)}'); }
          else throw new JqError('对象构造需要键名');
          /* `{key: value}` 的冒号必须消费；`{key}` 简写等价 `{key: .key}` */
          if (this.eat(':')) {
            pairs.push({ key, value: this.pipe() });
          } else {
            pairs.push({ key, value: { t: 'field', name: key } });
          }
        } while (this.eat(','));
        this.expect('}');
      }
      return this.postfix({ t: 'object', pairs });
    }
    if (this.eat('(')) { const n = this.pipe(); this.expect(')'); return this.postfix(n); }
    if (this.eat('not')) {
      /* not 是零参过滤器：not <expr> 语义为 expr | not */
      return { t: 'not', v: this.unary() };
    }
    const t = this.peek();
    if (!t) throw new JqError('表达式不完整');
    if (t.k === 'num') { this.i++; return this.postfix({ t: 'literal', v: Number(t.v) }); }
    if (t.k === 'str') { this.i++; return this.postfix({ t: 'literal', v: t.v }); }
    if (t.k === 'ident') {
      if (t.v === 'true') { this.i++; return { t: 'literal', v: true }; }
      if (t.v === 'false') { this.i++; return { t: 'literal', v: false }; }
      if (t.v === 'null') { this.i++; return { t: 'literal', v: null }; }
      if (t.v === 'empty') { this.i++; return { t: 'call', name: 'empty', args: [] }; }
      if (t.v === 'select') {
        this.i++;
        this.expect('(');
        const cond = this.pipe();
        this.expect(')');
        return this.postfix({ t: 'select', cond });
      }
      /* 具名函数：length/keys/values/tostring/tonumber/type/ascii_downcase 等 */
      this.i++;
      if (this.eat('(')) {
        const args: Node[] = [];
        if (!this.eat(')')) {
          do { args.push(this.pipe()); } while (this.eat(','));
          this.expect(')');
        }
        return this.postfix({ t: 'call', name: t.v, args });
      }
      return this.postfix({ t: 'call', name: t.v, args: [] });
    }
    throw new JqError(`无法解析起点 '${t.v}'`);
  }
  private postfix(n: Node): Node {
    let cur = n;
    for (;;) {
      if (this.eat('.')) {
        const t = this.peek();
        if (t?.k === 'ident') { this.i++; cur = { t: 'pipe', l: cur, r: { t: 'field', name: t.v } }; continue; }
        if (t?.k === 'str') { this.i++; cur = { t: 'pipe', l: cur, r: { t: 'field', name: t.v } }; continue; }
        continue; /* 尾随点（`foo.`）视同空过滤 */
      }
      if (this.eat('[')) {
        if (this.eat(']')) { cur = { t: 'pipe', l: cur, r: { t: 'iterate' } }; continue; }
        const t = this.peek();
        if (t?.k === 'num') { this.i++; this.expect(']'); cur = { t: 'pipe', l: cur, r: { t: 'index', n: Number(t.v) } }; continue; }
        if (t?.k === 'str') { this.i++; this.expect(']'); cur = { t: 'pipe', l: cur, r: { t: 'field', name: t.v } }; continue; }
        throw new JqError('方括号内只支持数字下标或键名字符串');
      }
      if (this.eat('?')) { cur = { t: 'optional', body: cur }; continue; }
      return cur;
    }
  }
}

/* ── 求值：每个节点产出「值序列」（JQ 的模型，逗号与迭代都是多值） ── */
const EMPTY: unique symbol = Symbol('empty');
type Stream = unknown[] | typeof EMPTY;

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function truthy(v: unknown): boolean {
  return !(v === false || v === null);
}
function cmpKey(v: unknown): [number, number | string] {
  if (v === null) return [0, 0];
  if (v === false) return [1, 0];
  if (v === true) return [2, 0];
  if (typeof v === 'number') return [3, v];
  if (typeof v === 'string') return [4, v];
  return [5, JSON.stringify(v)];
}
function deepEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEq(x, b[i]));
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => deepEq(a[k], b[k]));
  }
  return false;
}

function evalStream(n: Node, input: unknown): Stream {
  switch (n.t) {
    case 'identity': return [input];
    case 'literal': return [n.v];
    case 'field': return isObj(input) && n.name in input ? [input[n.name]] : EMPTY;
    case 'index': return Array.isArray(input) && n.n < input.length ? [input[n.n]] : EMPTY;
    case 'iterate': return Array.isArray(input) ? input.slice() : isObj(input) ? Object.values(input) : EMPTY;
    case 'recurse': {
      const out: unknown[] = [input];
      const walk = (v: unknown) => {
        if (Array.isArray(v)) for (const x of v) { out.push(x); walk(x); }
        else if (isObj(v)) for (const x of Object.values(v)) { out.push(x); walk(x); }
      };
      walk(input);
      return out;
    }
    case 'pipe': {
      const l = evalStream(n.l, input);
      if (l === EMPTY) return EMPTY;
      const out: unknown[] = [];
      for (const v of l) {
        const r = evalStream(n.r, v);
        if (r !== EMPTY) out.push(...r);
      }
      return out.length ? out : EMPTY;
    }
    case 'comma': {
      const out: unknown[] = [];
      for (const it of n.items) {
        const v = evalStream(it, input);
        if (v !== EMPTY) out.push(...v);
      }
      return out.length ? out : EMPTY;
    }
    case 'array': {
      if (!n.body) return [[]];
      const v = evalStream(n.body, input);
      return [v === EMPTY ? [] : v];
    }
    case 'object': {
      const o: Record<string, unknown> = {};
      for (const { key, value } of n.pairs) {
        const v = evalStream(value, input);
        if (v === EMPTY) continue;
        o[key] = v.length === 1 ? v[0] : v;
      }
      return [o];
    }
    case 'select': {
      const c = evalStream(n.cond, input);
      if (c === EMPTY) return EMPTY;
      return c.some(truthy) ? [input] : EMPTY;
    }
    case 'not': {
      const v = evalStream(n.v, input);
      if (v === EMPTY) return [true];
      return [!v.some(truthy)];
    }
    case 'optional': {
      /* `foo?` 的作用是「吞掉本节点的错误」，不改流元素——曾经写成 try/catch 包住
         evalStream 的整条返回值是错的：`._id?` 在缺失字段时返回 EMPTY 而非报错，
         包一层后仍应保持 EMPTY，但外层 `// empty` 才不会被误判为「有值」。 */
      try { return evalStream(n.body, input); } catch { return EMPTY; }
    }
    case 'binop': return evalBinop(n, input);
    case 'call': return evalCall(n, input);
    default: throw new JqError('内部：未知节点');
  }
}

function evalBinop(n: Extract<Node, { t: 'binop' }>, input: unknown): Stream {
  if (n.op === '//') {
    const l = evalStream(n.l, input);
    if (l !== EMPTY && l.some(truthy)) return l;
    return evalStream(n.r, input);
  }
  const l = evalStream(n.l, input);
  if (l === EMPTY) return EMPTY;
  const r = evalStream(n.r, input);
  if (r === EMPTY) return EMPTY;
  const out: unknown[] = [];
  for (const a of l) for (const b of r) {
    switch (n.op) {
      case 'or': out.push(truthy(a) || truthy(b)); break;
      case 'and': out.push(truthy(a) && truthy(b)); break;
      case '==': out.push(deepEq(a, b)); break;
      case '!=': out.push(!deepEq(a, b)); break;
      case '<': out.push(compare(a, b) < 0); break;
      case '>': out.push(compare(a, b) > 0); break;
      case '<=': out.push(compare(a, b) <= 0); break;
      case '>=': out.push(compare(a, b) >= 0); break;
      case '+':
        if (typeof a === 'number' && typeof b === 'number') out.push(a + b);
        else if (typeof a === 'string' && typeof b === 'string') out.push(a + b);
        else if (Array.isArray(a) && Array.isArray(b)) out.push([...a, ...b]);
        else if (isObj(a) && isObj(b)) out.push({ ...a, ...b });
        else throw new JqError('+ 只支持数字/字符串/数组/对象');
        break;
      case '-':
        if (typeof a === 'number' && typeof b === 'number') out.push(a - b);
        else if (Array.isArray(a) && Array.isArray(b)) out.push(a.filter(x => !b.some(y => deepEq(x, y))));
        else throw new JqError('- 只支持数字或数组差集');
        break;
      case '*':
        if (typeof a === 'number' && typeof b === 'number') out.push(a * b);
        else throw new JqError('* 只支持数字');
        break;
      case '/':
        if (typeof a === 'number' && typeof b === 'number') {
          if (b === 0) throw new JqError('除数为 0');
          out.push(a / b);
        } else throw new JqError('/ 只支持数字');
        break;
      default: throw new JqError(`不支持的运算符 ${n.op}`);
    }
  }
  return out.length ? out : EMPTY;
}
function compare(a: unknown, b: unknown): number {
  const [ka, va] = cmpKey(a), [kb, vb] = cmpKey(b);
  if (ka !== kb) return ka - kb;
  return va < vb ? -1 : va > vb ? 1 : 0;
}

function evalCall(n: Extract<Node, { t: 'call' }>, input: unknown): Stream {
  const first = n.args[0] ? evalStream(n.args[0], input) : null;
  const argc = n.args.length;
  switch (n.name) {
    case 'empty': return EMPTY;
    case 'length':
      if (typeof input === 'number') return [Math.abs(input)];
      if (typeof input === 'string' || Array.isArray(input)) return [input.length];
      if (isObj(input)) return [Object.keys(input).length];
      if (input === null) return [0];
      throw new JqError('length 只适用于字符串/数组/对象/数字/null');
    case 'keys':
      if (Array.isArray(input)) return [input.map((_, i) => i)];
      if (isObj(input)) return [Object.keys(input)];
      throw new JqError('keys 只适用于数组/对象');
    case 'values':
      if (isObj(input)) return [Object.values(input)];
      if (Array.isArray(input)) return [input];
      throw new JqError('values 只适用于数组/对象');
    case 'type': {
      const t = input === null ? 'null' : Array.isArray(input) ? 'array' : typeof input === 'object' ? 'object' : typeof input;
      return [t];
    }
    case 'tostring':
      return [typeof input === 'string' ? input : JSON.stringify(input)];
    case 'tonumber':
      if (typeof input === 'number') return [input];
      if (typeof input === 'string' && input.trim() !== '' && Number.isFinite(Number(input))) return [Number(input)];
      throw new JqError('tonumber 无法解析');
    case 'ascii_downcase': return [String(input).toLowerCase()];
    case 'ascii_upcase': return [String(input).toUpperCase()];
    case 'ltrimstr': {
      const p = first === null || first === EMPTY ? '' : String(first[0]);
      return [typeof input === 'string' && input.startsWith(p) ? input.slice(p.length) : input];
    }
    case 'rtrimstr': {
      const p = first === null || first === EMPTY ? '' : String(first[0]);
      return [typeof input === 'string' && input.endsWith(p) ? input.slice(0, input.length - p.length) : input];
    }
    case 'startswith': {
      const p = first === null || first === EMPTY ? '' : String(first[0]);
      return [typeof input === 'string' && input.startsWith(p)];
    }
    case 'endswith': {
      const p = first === null || first === EMPTY ? '' : String(first[0]);
      return [typeof input === 'string' && input.endsWith(p)];
    }
    case 'contains': {
      const b = first === null || first === EMPTY ? null : first[0];
      if (typeof input === 'string' && typeof b === 'string') return [input.includes(b)];
      if (Array.isArray(input) && Array.isArray(b)) return [b.every(x => input.some(y => deepEq(x, y)))];
      if (isObj(input) && isObj(b)) return [Object.entries(b).every(([k, v]) => k in input && deepEq(input[k], v))];
      return [deepEq(input, b)];
    }
    case 'has': {
      const k = first === null || first === EMPTY ? null : first[0];
      if (isObj(input)) return [typeof k === 'string' && k in input];
      if (Array.isArray(input)) return [typeof k === 'number' && k >= 0 && k < input.length];
      return [false];
    }
    case 'join': {
      const sep = first === null || first === EMPTY ? '' : String(first[0]);
      if (!Array.isArray(input)) throw new JqError('join 只适用于数组');
      return [input.map(x => (x === null || x === undefined ? '' : typeof x === 'string' ? x : JSON.stringify(x))).join(sep)];
    }
    case 'map': {
      if (argc !== 1) throw new JqError('map 需要 1 个参数');
      const arr = Array.isArray(input) ? input : null;
      if (!arr) throw new JqError('map 只适用于数组');
      const out: unknown[] = [];
      for (const it of arr) {
        const v = evalStream(n.args[0], it);
        if (v !== EMPTY) out.push(...v);
      }
      return [out];
    }
    case 'add': {
      if (!Array.isArray(input)) throw new JqError('add 只适用于数组');
      if (!input.length) return [null];
      return [input.reduce((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') return a + b;
        if (typeof a === 'string' && typeof b === 'string') return a + b;
        if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
        if (isObj(a) && isObj(b)) return { ...a, ...b };
        return b;
      })];
    }
    default:
      throw new JqError(`不支持的函数 ${n.name}()（本控制台实现 Kibana 文档列出的 JQ 子集）`);
  }
}

/** 编译表达式；语法错误在此阶段抛出（调用方可即时提示，不必等求值）。 */
export function compileJq(expr: string): { run: (input: unknown) => unknown[] } {
  const src = String(expr || '').trim();
  if (!src) throw new JqError('表达式为空');
  const ast = new Parser(lex(src)).parse();
  return {
    run(input: unknown) {
      const r = evalStream(ast, input);
      return r === EMPTY ? [] : r;
    },
  };
}

/** 单值简化：0 结果 → null，1 结果 → 该值，多结果 → 数组（与 Kibana 逐行输出对齐由调用方决定）。 */
export function jqSingle(results: unknown[]): unknown {
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];
  return results;
}

export interface FilterOutcome {
  ok: boolean;
  /** 过滤后的展示文本（ok=true 时有效） */
  text: string;
  /** 命中的条数（多值表达式逐条输出） */
  count: number;
  /** 失败原因（ok=false 时有效） */
  error?: string;
}

/**
 * 对响应原文应用过滤表达式。
 *
 * - `mode='jq'`：编译 + 求值，多值逐行输出（Kibana 多结果形态）；
 * - `mode='regex'`：逐行匹配，不含分隔符与 flags（与 Kibana 正则档一致），
 *   原文不是 JSON 也能用，返回命中的行。
 *
 * 任何失败都返回 `ok:false` + `error`，由 UI 显示「表达式无效」，绝不给错值。
 */
export function applyResponseFilter(raw: string, expr: string, mode: 'jq' | 'regex'): FilterOutcome {
  const src = String(expr || '');
  if (!src.trim()) return { ok: true, text: String(raw ?? ''), count: 0 };
  if (mode === 'regex') {
    let re: RegExp;
    try { re = new RegExp(src); } catch (e: any) { return { ok: false, text: '', count: 0, error: '正则无效：' + (e?.message || e) }; }
    const lines = String(raw ?? '').split('\n').filter(l => re.test(l));
    return { ok: true, text: lines.join('\n'), count: lines.length };
  }
  let compiled: { run: (i: unknown) => unknown[] };
  try { compiled = compileJq(src); } catch (e: any) { return { ok: false, text: '', count: 0, error: e?.message || String(e) }; }
  let input: unknown;
  try { input = JSON.parse(String(raw ?? '')); } catch { return { ok: false, text: '', count: 0, error: '响应不是合法 JSON，无法用 JQ 过滤（可改用正则档）' }; }
  try {
    const results = compiled.run(input);
    const text = results.map(r => (typeof r === 'string' ? r : JSON.stringify(r, null, 2))).join('\n');
    return { ok: true, text, count: results.length };
  } catch (e: any) {
    return { ok: false, text: '', count: 0, error: e?.message || String(e) };
  }
}
