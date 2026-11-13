/**
 * 一千四百三十七批：检索器（retriever）六变体的「创建 → 写回」普查。
 *
 * retriever 是 8.14+ 的声明式检索面，构建器有专属编辑器（RetrieverEditor）。
 * 1420 在查询算子上发现的「创建路径静默兜底」问题（match_none → match_all），
 * 这里同样要防：`makeRetrieverByOp` 对未注册变体会回落 standard——
 * 若某个已注册变体也走到这条回落，用户在下拉里选它就等于选了 standard。
 *
 * 判据：
 *  ① 每个 RETRIEVER_META 变体造出的节点 op 与所选一致；
 *  ② 写回 DSL 后顶层键仍是该变体（不是 standard）；
 *  ③ 必填子项的变体带可用初值（否则一创建就是非法 DSL）；
 *  ④ 负控：未注册变体必须回落 standard（证明 ① 不是恒真）。
 */
import { describe, it, expect } from 'vitest';
import { makeRetrieverByOp, serRetriever } from '../utils/queryAst';
import { RETRIEVER_META } from '../utils/queryAstOps';

describe('1437 retriever 六变体创建与写回', () => {
  const ops = Object.keys(RETRIEVER_META);

  it('变体表非空（防止用例空转）', () => {
    expect(ops.length, 'RETRIEVER_META 至少 6 个变体').toBeGreaterThanOrEqual(6);
  });

  it('① 每个变体造出的节点 op 与所选一致', () => {
    const bad: string[] = [];
    for (const op of ops) {
      const n: any = makeRetrieverByOp(op);
      if (n.op !== op) bad.push(`${op} → ${n.op}`);
    }
    expect(bad, '创建路径认错变体：\n' + bad.join('\n')).toEqual([]);
  });

  it('② 写回后顶层键仍是该变体', () => {
    const bad: string[] = [];
    for (const op of ops) {
      let body: any;
      try { body = serRetriever(makeRetrieverByOp(op)); } catch (e: any) { bad.push(`${op} 写回抛错 ${e?.message}`); continue; }
      const keys = Object.keys(body || {});
      if (!keys.includes(op)) bad.push(`${op} 写回成 {${keys.join(',')}}`);
    }
    expect(bad, '写回丢变体：\n' + bad.join('\n')).toEqual([]);
  });

  it('③ 需要子项的变体带可用初值（创建即合法）', () => {
    const bad: string[] = [];
    for (const op of ops) {
      const meta: any = RETRIEVER_META[op];
      const n: any = makeRetrieverByOp(op);
      if (meta.kind === 'query' && !n.query) bad.push(op + ' 缺 query 初值');
      if (meta.kind === 'list' && !(n.children || []).length) bad.push(op + ' 缺子检索器初值');
      if (meta.kind === 'child' && !meta.childOptional && !n.child) bad.push(op + ' 缺 child 初值');
    }
    expect(bad, '创建即非法：\n' + bad.join('\n')).toEqual([]);
  });

  it('④ 负控：未注册变体回落 standard', () => {
    const n: any = makeRetrieverByOp('__not_a_retriever__');
    expect(n.op).toBe('standard');
    expect(ops).not.toContain('__not_a_retriever__');
  });
});
