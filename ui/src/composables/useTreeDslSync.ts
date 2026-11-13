/* W1：条件树 ↔ DSL 文本双向同步引擎（设计文档 ）。
 防环：树写 dsl 前置 origin='tree'，dsl watch 见到即清标记跳过；
 手改 dsl debounce 250ms 回解；失败（非法 JSON）树冻结 stale=true，dsl 一字不动。
 回解只 stripJsonComments、不 applyVars——${var} 占位符必须随树往返（零降级）。
 shallowRef：树不可变更新（ 契约），引用变化即新树，免深响应代理开销。 */
import { shallowRef, ref, watch, onScopeDispose, getCurrentScope, type Ref } from 'vue';
import { stripJsonComments, tryParse } from '../utils/jsonc';
import { parseTree, serializeTree, emptyTree, type QueryTree } from '../utils/queryAst';

export function useTreeDslSync(dsl: Ref<string>) {
  const tree = shallowRef<QueryTree>(emptyTree());
  const stale = ref(false);
  let origin: 'tree' | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function onTreeUpdate(t: QueryTree) {
    tree.value = t;
    stale.value = false;          // 写出的 dsl 恒合法，冻结态同步解除
    origin = 'tree';
    dsl.value = JSON.stringify(serializeTree(t), null, 2);
  }

  function resyncNow() {
    const parsed = tryParse(stripJsonComments(dsl.value));
    const r = parsed ? parseTree(parsed) : null;
    if (r && r.ok) { tree.value = r.tree; stale.value = false; }
    else stale.value = true;
  }

  watch(dsl, () => {
    if (origin === 'tree') { origin = null; if (timer) { clearTimeout(timer); timer = null; } return; }
    if (timer) clearTimeout(timer);
    timer = setTimeout(resyncNow, 250);
  });

  /* 组件卸载时清 pending 回解（裸调用如无组件 scope 则跳过，避免 Vue warn） */
  if (getCurrentScope()) onScopeDispose(() => { if (timer) clearTimeout(timer); });

  return { tree, stale, onTreeUpdate, resyncNow };
}
