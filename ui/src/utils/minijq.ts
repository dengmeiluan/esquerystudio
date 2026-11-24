/**
 * mini-jq：Kibana Console "Filter response" 同款响应过滤（子集实现）。
 * 支持：.a.b[0] / .a[] / .[] / 管道 | / select(.x == v, !=, >, <, >=, <=) / keys
 * 不支持抛 Error('Invalid JQ expression')
 */
type Token =
  | { t: 'path'; segs: (string | number | 'iter')[] }
  | { t: 'select'; field: string; op: string; value: any }
  | { t: 'keys' };

function tokenize(expr: string): Token[] {
  const pipes = expr.split('|').map(s => s.trim()).filter(Boolean);
  if (!pipes.length) throw new Error('Invalid JQ expression');
  return pipes.map(p => {
    if (p === 'keys' || p === 'keys_unsorted') return { t: 'keys' } as Token;
    const sel = p.match(/^select\(\s*\.?([\w.\[\]]+)\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*\)$/);
    if (sel) {
      return { t: 'select', field: sel[1], op: sel[2], value: parseLiteral(sel[3]) } as Token;
    }
    if (!p.startsWith('.')) throw new Error('Invalid JQ expression');
    const segs: (string | number | 'iter')[] = [];
    let i = 1;
    while (i < p.length) {
      if (p[i] === '.') { i++; continue; }
      if (p[i] === '[') {
        const close = p.indexOf(']', i);
        if (close < 0) throw new Error('Invalid JQ expression');
        const inner = p.slice(i + 1, close).trim();
        if (inner === '') segs.push('iter');
        else if (/^-?\d+$/.test(inner)) segs.push(Number(inner));
        else if (/^".*"$/.test(inner)) segs.push(inner.slice(1, -1));
        else throw new Error('Invalid JQ expression');
        i = close + 1;
        continue;
      }
      const m = p.slice(i).match(/^[\w$]+/);
      if (!m) throw new Error('Invalid JQ expression');
      segs.push(m[0]);
      i += m[0].length;
      // 紧跟 [] 迭代器
      if (p.slice(i, i + 2) === '[]') { segs.push('iter'); i += 2; }
    }
    if (!segs.length) throw new Error('Invalid JQ expression');
    return { t: 'path', segs } as Token;
  });
}

function parseLiteral(s: string): any {
  const t = s.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

function applyPath(input: any, segs: (string | number | 'iter')[]): any[] {
  let cur: any[] = [input];
  for (const seg of segs) {
    const next: any[] = [];
    for (const item of cur) {
      if (item == null) continue;
      if (seg === 'iter') {
        if (Array.isArray(item)) next.push(...item);
        else if (typeof item === 'object') next.push(...Object.values(item));
      } else if (typeof seg === 'number') {
        const v = Array.isArray(item) ? item[seg < 0 ? item.length + seg : seg] : undefined;
        if (v !== undefined) next.push(v);
      } else {
        if (typeof item === 'object' && seg in item) next.push(item[seg]);
      }
    }
    cur = next;
  }
  return cur;
}

function applySelect(items: any[], field: string, op: string, value: any): any[] {
  return items.filter(item => {
    const vals = applyPath(item, field.split('.').filter(Boolean));
    const v = vals[0];
    switch (op) {
      case '==': return v === value;
      case '!=': return v !== value;
      case '>': return v > value;
      case '<': return v < value;
      case '>=': return v >= value;
      case '<=': return v <= value;
      default: return false;
    }
  });
}

/** 对 data 应用 mini-jq 表达式，返回结果（数组形式） */
export function jq(data: any, expr: string): any {
  const tokens = tokenize(expr);
  let cur: any[] = [data];
  for (const tok of tokens) {
    if (tok.t === 'path') {
      cur = cur.flatMap(item => applyPath(item, tok.segs));
    } else if (tok.t === 'select') {
      cur = applySelect(cur, tok.field, tok.op, tok.value);
    } else if (tok.t === 'keys') {
      cur = cur.map(item => (item && typeof item === 'object' ? Object.keys(item) : null)).filter(v => v != null);
    }
  }
  return cur.length === 1 ? cur[0] : cur;
}
