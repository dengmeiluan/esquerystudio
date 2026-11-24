/* 1065：零命中诊断——单条件停用探针。
   对每个启用叶子生成「停用它」的最小查询（size=0 / track_total_hits），
   由视图逐个执行并比较命中数。只做单条件消融：能定位单条限制项，
   不声称能证明组合过窄或索引为空。 */
import {
  setDisabledForIds, serializeTree,
  type QueryNode, type QueryTree,
} from './queryAst';
import { briefValue } from './querySentence';

export interface AblationTarget { id: string; label: string }

/** 收集可探针的启用叶子（组/容器不单独停用；match_all 无意义）。最多 cap 条。 */
export function collectAblationTargets(root: QueryNode | null, cap = 12): { targets: AblationTarget[]; total: number } {
  const all: AblationTarget[] = [];
  if (root) {
    const walk = (n: QueryNode) => {
      if (n.type === 'bool') { n.children.forEach(c => walk(c.node)); return; }
      if (n.type === 'wrap') { if (n.child) walk(n.child); return; }
      if (n.type === 'multi') { n.children.forEach(c => walk(c.node)); return; }
      if (n.disabled || n.op === 'match_all') return;
      const head = n.field ? `${n.field} ${n.op}` : n.op;
      const val = n.value === null || n.value === undefined ? '' : briefValue(n.value, 28);
      all.push({ id: n.id, label: (head + (val && val !== '{}' && val !== '[]' ? ' ' + val : '')).slice(0, 44) });
    };
    walk(root);
  }
  return { targets: all.slice(0, cap), total: all.length };
}

/** 停用某叶子后的最小探针 body：只保留 query，去掉聚合/排序/翻页等旁路开销。 */
export function buildAblationBody(tree: QueryTree, id: string): string | null {
  if (!tree.root) return null;
  const root = setDisabledForIds(tree.root, new Set([id]), true);
  const clean: QueryTree = {
    ...tree, root,
    size: undefined, from: undefined,
    aggs: null, sort: null, source: null, highlight: null, postFilter: null, collapse: null,
    knn: null, rescore: null, suggest: null, scriptFields: null, runtimeMappings: null, retriever: null,
    searchParams: {}, extras: {},
  };
  const body = serializeTree(clean) as Record<string, unknown>;
  body.size = 0;
  body.track_total_hits = true;
  return JSON.stringify(body);
}
