/**
 * 1181：全算子骨架「进树 + 写回」扫描。
 *
 * 为什么要在 1143 的生产语料往返测之外再加一条：1131 的补全目录里每个算子都带有
 * 一条**官方骨架**（`QUERY_SNIPPETS`），那是「这个算子的合法体长什么样」的单一出处。
 * 生产语料只覆盖真实用到的写法——本表却要承诺「任何 DSL 都能双向渲染」。
 * 这里逐条把骨架喂给 parse→serialize，锁两件事：
 *   ① **结构位认对了**：官方体里的字段 / 主值 / 多字段 / 容器分区必须落进节点的对应位置。
 *      只比对回写文本是不够的——未识别的体也会走「raw 权威」原样写回，
 *      文本相等却等于树里没有语义位（用户看不到字段选择器、主值输入）。
 *   ② 写回与输入**同构**（忽略对象键序——ES 不认键序，锁键序只会锁住实现细节）。
 * 骨架表新增算子时自动纳入（只锁总数，防静默丢项）。
 */
import { describe, it, expect } from 'vitest';
import { QUERY_SNIPPETS } from '../utils/dslCompletionContext';
import { parseQueryNode, serQueryNode, type QueryNode } from '../utils/queryAst';
import { OPS_META, WRAP_LABELS, MULTI_LABELS } from '../utils/queryAstOps';

/* 键序无关的稳定序列化（数组保序——数组顺序在 ES 里有语义，必须锁） */
function stable(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

const WRAP_OPS = new Set(Object.keys(WRAP_LABELS));
const MULTI_OPS = new Set(Object.keys(MULTI_LABELS));

function bodyOf(op: string): any {
  return JSON.parse('{' + QUERY_SNIPPETS[op].replace(/\$\{[^}]*\}/g, '0') + '}');
}

/* 结构位体检：返回 null = 认对；返回字符串 = 缺什么（直接进断言消息） */
function shapeProblem(op: string, n: QueryNode): string | null {
  if (op === 'bool') return n.type === 'bool' ? null : `期望 bool 节点，得到 ${n.type}`;
  if (MULTI_OPS.has(op)) return n.type === 'multi' && n.op === op ? null : `期望 multi/${op}，得到 ${n.type}/${(n as any).op}`;
  if (WRAP_OPS.has(op)) return n.type === 'wrap' && n.op === op ? null : `期望 wrap/${op}，得到 ${n.type}/${(n as any).op}`;
  if (n.type !== 'leaf') return `期望叶子，得到 ${n.type}`;
  if (n.op !== op) return `算子记成了 ${n.op}`;
  const form = OPS_META[op]?.form ?? 'field';
  if (form === 'field' && !n.field) return 'field 形态没认出字段位';
  if (form === 'named') {
    if (!n.field) return 'named 形态没认出字段位';
    if (n.hasMain === false) return 'named 形态没认出主值位';
  }
  if (form === 'fields' && !Array.isArray(n.fields)) return 'fields 形态没认出多字段位';
  if (form === 'none' && n.hasMain === false) return 'none 形态没认出主值位';
  return null;
}

describe('1181 全算子骨架进树与写回', () => {
  const ops = Object.keys(QUERY_SNIPPETS);

  it('骨架表仍是全量 63 项（少一个都意味着某算子没有官方体可对照）', () => {
    expect(ops.length).toBe(63);
  });

  it('每个算子的官方骨架都落进对应结构位，且写回同构（忽略键序）', () => {
    const wrong: string[] = [];
    const drift: string[] = [];
    for (const op of ops) {
      const body = bodyOf(op);
      const n = parseQueryNode(body);
      const p = shapeProblem(op, n);
      if (p) { wrong.push(`${op}：${p}`); continue; }
      const back = serQueryNode(n);
      if (stable(back) !== stable(body)) drift.push(`${op}：${stable(back)} ≠ ${stable(body)}`);
    }
    expect(wrong, '结构位没认对：\n' + wrong.join('\n')).toEqual([]);
    expect(drift, '写回与骨架不同构：\n' + drift.join('\n')).toEqual([]);
  });

  it('多键对象与标量体走 raw 兜底（树不是「什么都装得下」的假象）', () => {
    const multiKey = parseQueryNode({ term: { a: 1 }, match: { b: 2 } } as any) as any;
    expect(multiKey.op).toBe('__raw__');
    const badRange = parseQueryNode({ range: 'not-an-object' } as any) as any;
    expect(badRange.type).toBe('leaf');
    /* 负控的点在这里：同一个 range，体非法时结构位体检必须报「没认出字段位」 */
    expect(shapeProblem('range', badRange)).toBeTruthy();
  });

  it('负控：官方体被改坏时不再同构（写回锁不会恒真）', () => {
    const body = bodyOf('term');
    const back = serQueryNode(parseQueryNode(body)) as any;
    back.term.value = 'changed';
    expect(stable(back)).not.toBe(stable(body));
  });
});
