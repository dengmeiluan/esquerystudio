/* 1007：语句条片段 → DSL 文本定位内核（纯函数，Monaco/视图零依赖）。
   用途：点语句摘要片段时，右侧 DSL 编辑器滚动到对应节点文本并短闪。
   设计：
   · queryNodeSpans——按 serializeTree 的书写序先序走 query 子树（bool 按 OCCURS
     分区序、wrap 先本后子、multi 按分区键序），在「紧凑文本」
     （JSON.stringify(serializeTree(tree))）里用前向游标 indexOf 逐节点定字符 span。
     顺序游标天然处理两类难点：同形重复条件（兄弟按文档序依次命中不同位置）、
     父子嵌套（子节点 needle 是父 needle 的子串，但搜索起点在父 span 内部，
     先父后子的先序保证命中正确位置）。
   · compactOffsetToPos——紧凑偏移 → 美化文本（JSON.stringify(x, null, 2)）行列。
     两文本 token 流相同、仅排版空白不同；字符串字面量内的空格/换行是内容字符，
     逐字比对不跳过（转义序列两侧一致），否则双指针漂移。 */
import { OCCURS, serializeTree, serQueryNode, type QueryTree, type QueryNode } from './queryAst';

export interface NodeSpan { start: number; end: number }
export interface TextPos { line: number; column: number }

export function queryNodeSpans(tree: QueryTree): Map<string, NodeSpan> {
  const spans = new Map<string, NodeSpan>();
  const root = tree.root;
  if (!root) return spans;
  const compact = JSON.stringify(serializeTree(tree));
  const kidsOf = (n: QueryNode): QueryNode[] => {
    if (n.type === 'bool') {
      /* serializeTree 按 OCCURS 序写分区——子节点搜索顺序必须同序 */
      const out: QueryNode[] = [];
      for (const o of OCCURS) for (const c of n.children) if (c.occur === o) out.push(c.node);
      return out;
    }
    if (n.type === 'wrap') return n.child ? [n.child] : [];
    if (n.type === 'multi') return n.children.map(c => c.node);
    return [];
  };
  const visit = (n: QueryNode, from: number): number => {
    const needle = JSON.stringify(serQueryNode(n));
    const start = compact.indexOf(needle, from);
    if (start < 0) return from;   /* 停用节点 ser 为 match_none 占位、文本里可能缺席——缺 span 即不可定位 */
    const end = start + needle.length;
    spans.set(n.id, { start, end });
    let childFrom = start + 1;
    for (const k of kidsOf(n)) childFrom = Math.max(childFrom, visit(k, childFrom));
    return end;
  };
  visit(root, 0);
  return spans;
}

export function compactOffsetToPos(compact: string, pretty: string, offset: number): TextPos | null {
  if (offset < 0 || offset >= compact.length) return null;
  let ci = 0;
  let pi = 0;
  let line = 1;
  let col = 1;
  let inStr = false;
  let escC = false;   /* 紧凑流内当前字符是否被转义（决定 " 是否闭合） */
  let escP = false;   /* 美化流同款（两侧转义序列一致，双闸独立走防串扰） */
  const ws = (ch: string | undefined) => ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r';
  while (pi < pretty.length) {
    const pc = pretty[pi];
    if (inStr) {
      if (ci === offset) return { line, column: col };
      const cc = compact[ci];
      /* 先判两侧的 " 是否为未转义闭合（两侧字符串内容一致，同步闭合） */
      const closesP = pc === '"' && !escP;
      const closesC = cc === '"' && !escC;
      if (pc === '\n') { line++; col = 1; } else col++;
      ci++; pi++;
      escP = pc === '\\' && !escP;
      escC = cc === '\\' && !escC;
      if (closesP || closesC) inStr = false;
      continue;
    }
    if (pc === '"') {
      if (ci === offset) return { line, column: col };
      inStr = true; escC = false; escP = false;
      ci++; pi++; col++;
      continue;
    }
    if (ws(pc)) {
      if (pc === '\n') { line++; col = 1; } else col++;
      pi++;
      continue;
    }
    if (ci === offset) return { line, column: col };
    ci++; pi++; col++;
  }
  return ci === offset ? { line, column: col } : null;
}

/* ═══ 1008：DSL 光标 → 内层节点反查（反向联动内核）═══
   树按不可变约定流转（每次编辑换新引用）→ WeakMap 按树身份缓存 span 集，
   光标高频移动零重复序列化。命中=包含偏移的 span 中最内层（start 最大）者；
   节点间隙（逗号/键名等不属于任何节点）返回 null=联动静默不打扰。 */
const spanCache = new WeakMap<QueryTree, Map<string, NodeSpan>>();

export function nodeAtOffset(tree: QueryTree, offset: number): string | null {
  if (!tree.root) return null;
  let spans = spanCache.get(tree);
  if (!spans) {
    spans = queryNodeSpans(tree);
    spanCache.set(tree, spans);
  }
  let bestId: string | null = null;
  let bestStart = -1;
  for (const [id, sp] of spans) {
    if (offset >= sp.start && offset < sp.end && sp.start > bestStart) {
      bestStart = sp.start;
      bestId = id;
    }
  }
  return bestId;
}
