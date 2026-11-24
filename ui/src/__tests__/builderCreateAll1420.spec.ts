/**
 * 一千四百二十批：全部已注册算子的「创建路径」扫描（渲染可创建性）。
 *
 * 已有覆盖的缺口：1131 锁官方骨架进树、1181 锁骨架往返、1378 锁参数保真——
 * 都是从 DSL 出发。但用户是在**构建器里点出来**的：下拉选一个算子 → makeNodeByOp 造节点
 * → 用户填字段/值 → serQueryNode 写回。只要某个已注册算子的创建路径造出 match_all 或
 * raw 叶，它在下拉里就是「点了没反应」，而往返测试完全发现不了。
 *
 * 判据：
 *  ① 每个 RICH_OPS 成员都能造出节点，且 op 名与所选一致（除 match_all/match_none 本就是叶）；
 *  ② 造出的节点写回后仍是该算子（不是 match_all/raw 兜底）；
 *  ③ 负控：传一个未注册算子名 → 必须回落 match_all（证明上面的断言不是恒真）。
 */
import { describe, it, expect } from 'vitest';
import { makeNodeByOp, serQueryNode } from '../utils/queryAst';
import { RICH_OPS, WRAP_LABELS, MULTI_LABELS } from '../utils/queryAstOps';

const NON_LEAF = new Set([...Object.keys(WRAP_LABELS), ...Object.keys(MULTI_LABELS)]);
/* 这两个算子本身就是 match_all 叶，op 名不变 */
const SELF_LEAF = new Set(['match_all', 'match_none']);

describe('1420 全部已注册算子都能从构建器创建', () => {
  it('① 每个算子造出的节点都认得出自己（不是 match_all 兜底、不是 raw）', () => {
    const bad: string[] = [];
    for (const op of RICH_OPS) {
      const n: any = makeNodeByOp(op);
      if (SELF_LEAF.has(op)) {
        if (n.type !== 'leaf' || n.op !== op) bad.push(`${op} → ${n.type}/${n.op}`);
        continue;
      }
      if (NON_LEAF.has(op)) {
        const want = WRAP_LABELS[op] ? 'wrap' : 'multi';
        if (n.type !== want || n.op !== op) bad.push(`${op} → ${n.type}/${n.op}（期望 ${want}）`);
        continue;
      }
      if (n.type !== 'leaf' || n.op !== op) bad.push(`${op} → ${n.type}/${n.op}`);
    }
    expect(bad, '创建路径失效的算子：\n' + bad.join('\n')).toEqual([]);
  });

  it('② 造出的节点写回 DSL 仍是该算子（不被兜底成 match_all / __raw__）', () => {
    const bad: string[] = [];
    for (const op of RICH_OPS) {
      const n = makeNodeByOp(op);
      let body: any;
      try { body = serQueryNode(n); } catch (e: any) { bad.push(`${op} 写回抛错：${e?.message}`); continue; }
      const keys = Object.keys(body || {});
      if (!keys.includes(op)) bad.push(`${op} 写回成 {${keys.join(',')}}`);
    }
    expect(bad, '写回丢算子的：\n' + bad.join('\n')).toEqual([]);
  });

  it('③ 负控：未注册算子名必须回落 match_all（证明 ①② 不是恒真）', () => {
    const n: any = makeNodeByOp('__not_a_real_op__');
    expect(n.op, '未知算子应回落 match_all').toBe('match_all');
    /* 若 ① 的判据恒真，这条会红——因为它明确期望「造不出自己」 */
    expect(RICH_OPS).not.toContain('__not_a_real_op__');
  });
});
