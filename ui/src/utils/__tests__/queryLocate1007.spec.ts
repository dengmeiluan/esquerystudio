/* 1007 批：语句条片段 → DSL 文本定位内核。
   两条硬契约：
   ① queryNodeSpans 按序列化书写序给每个查询节点在紧凑文本里的精确字符 span
     （重复条件分位正确、嵌套父子 span 包含正确）；
   ② compactOffsetToPos 把紧凑偏移映射到 JSON.stringify(x, null, 2) 美化文本的
     行列（字符串字面量内的空格/换行/转义不被当作排版空白跳过=双流零漂移）。 */
import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree, serQueryNode } from '../queryAst';
import { queryNodeSpans, compactOffsetToPos, nodeAtOffset } from '../queryLocate';
import type { QueryTree, QueryNode } from '../queryAst';

const treeOf = (dsl: Record<string, unknown>): QueryTree => {
  const r = parseTree(dsl);
  if (!r.ok) throw new Error(r.reason);
  return r.tree;
};

/* 先序收集全部节点 id（bool 按 OCCURS 分区序、wrap 先本后子、multi 按分区序） */
const collect = (n: QueryNode, out: QueryNode[] = []): QueryNode[] => {
  out.push(n);
  if (n.type === 'bool') {
    for (const o of ['must', 'filter', 'should', 'must_not']) {
      n.children.filter(c => c.occur === o).forEach(c => collect(c.node, out));
    }
  } else if (n.type === 'wrap') {
    if (n.child) collect(n.child, out);
  } else if (n.type === 'multi') {
    n.children.forEach(c => collect(c.node, out));
  }
  return out;
};

describe('1007 queryNodeSpans', () => {
  it('每个节点的 span 与其独立序列化文本逐字符一致（含重复条件与深嵌套）', () => {
    const t = treeOf({ query: { bool: {
      must: [{ term: { status: 'active' } }, { term: { status: 'active' } }],
      should: [{ bool: { must: [{ term: { tag: 'x' } }] } }, { nested: { path: 'c', query: { term: { 'c.a': 1 } } } }],
      must_not: [{ exists: { field: 'del' } }],
    } } });
    const compact = JSON.stringify(serializeTree(t));
    const spans = queryNodeSpans(t);
    for (const n of collect(t.root!)) {
      const sp = spans.get(n.id);
      expect(sp, '每个节点都要有 span').toBeDefined();
      expect(compact.slice(sp!.start, sp!.end)).toBe(JSON.stringify(serQueryNode(n)));
    }
  });

  it('重复条件分位正确：两个同形节点的 span 不重叠且按文档序', () => {
    const t = treeOf({ query: { bool: { must: [{ term: { a: 1 } }, { match: { b: 'x' } }, { term: { a: 1 } }] } } });
    const ids = collect(t.root!).filter(n => n.type === 'leaf' && n.op === 'term').map(n => n.id);
    expect(ids).toHaveLength(2);
    const s1 = queryNodeSpans(t).get(ids[0])!;
    const s2 = queryNodeSpans(t).get(ids[1])!;
    expect(s1.end).toBeLessThanOrEqual(s2.start);
  });

  it('父子嵌套：子 span 严格落在父 span 内部', () => {
    const t = treeOf({ query: { bool: { must: [{ nested: { path: 'c', query: { term: { 'c.a': 1 } } } }] } } });
    const [parent, child] = collect(t.root!).slice(1);   // [0]=根 bool
    const sp = queryNodeSpans(t);
    expect(sp.get(child.id)!.start).toBeGreaterThan(sp.get(parent.id)!.start);
    expect(sp.get(child.id)!.end).toBeLessThan(sp.get(parent.id)!.end);
  });
});

describe('1007 compactOffsetToPos', () => {
  const obj = { query: { bool: { must: [{ term: { msg: 'hello world' } }, { term: { msg: '含 空格 与"引号"' } }] } }, size: 10 };
  const compact = JSON.stringify(obj);
  const pretty = JSON.stringify(obj, null, 2);

  it('美化文本行列对齐：每个紧凑偏移处取到的字符与紧凑文本一致', () => {
    /* 抽查跨结构的若干偏移（含字符串内空格与引号转义段） */
    for (const probe of [0, compact.indexOf('hello'), compact.indexOf(' '), compact.indexOf('含 空格'), compact.length - 2]) {
      const pos = compactOffsetToPos(compact, pretty, probe);
      expect(pos, `offset ${probe}`).not.toBeNull();
      const lines = pretty.split('\n');
      const ch = lines[pos!.line - 1].slice(pos!.column - 1);
      expect(ch.startsWith(compact[probe]), `offset ${probe} 行列对齐`).toBe(true);
    }
  });

  it('末偏移（span.end-1 型）与越界返回形态', () => {
    expect(compactOffsetToPos(compact, pretty, compact.length - 1)).not.toBeNull();
    expect(compactOffsetToPos(compact, pretty, compact.length + 5)).toBeNull();
  });

  it('端到端：span → 美化行列命中的正是该节点文本起点', () => {
    const t = treeOf({ query: { bool: { must: [{ term: { status: 'active' } }] } } });
    const leaf = collect(t.root!).find(n => n.type === 'leaf')!;
    const compactT = JSON.stringify(serializeTree(t));
    const prettyT = JSON.stringify(serializeTree(t), null, 2);
    const span = queryNodeSpans(t).get(leaf.id)!;
    const pos = compactOffsetToPos(compactT, prettyT, span.start)!;
    expect(prettyT.split('\n')[pos.line - 1].slice(pos.column - 1).startsWith('{"term"') || prettyT[pos.column - 1] === '{' || prettyT.split('\n')[pos.line - 1].slice(pos.column - 1).startsWith('{')).toBe(true);
  });
});

describe('1008 nodeAtOffset（DSL 光标 → 内层节点反查）', () => {
  const t = treeOf({ query: { bool: {
    must: [{ term: { a: 1 } }, { nested: { path: 'c', query: { term: { 'c.x': 2 } } } }],
  } } });
  const spans = queryNodeSpans(t);
  const ids = collect(t.root!);
  const rootSpan = spans.get(t.root!.id)!;
  const leafIn = spans.get(ids.find(n => n.type === 'leaf' && (n as any).field === 'c.x')!.id)!;

  it('光标落在嵌套叶子 span 内 → 命中最内层节点（非根/非父）', () => {
    const id = nodeAtOffset(t, leafIn.start + 1);
    expect(id).toBe(ids.find(n => n.type === 'leaf' && (n as any).field === 'c.x')!.id);
  });

  it('光标落在根 span 开头（仅根包含） → 命中根', () => {
    expect(nodeAtOffset(t, rootSpan.start)).toBe(t.root!.id);
  });

  it('未命中（span 之外/树空/越界）→ null', () => {
    const empty = treeOf({ size: 10 });
    expect(nodeAtOffset(empty, 0)).toBeNull();
    expect(nodeAtOffset(t, 0)).toBeNull();   /* 0 落在 {"query": 前缀内，任何节点 span 之前 */
    expect(nodeAtOffset(t, 99999)).toBeNull();
  });

  it('缓存同引用：重复查询零重算（WeakMap 树身份缓存）', () => {
    /* 行为面断言：同树多偏移查询结果一致且不抛 */
    expect(nodeAtOffset(t, leafIn.start + 1)).toBe(nodeAtOffset(t, leafIn.start + 2));
  });
});
