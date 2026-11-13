/* 1036：跨查询子树剪贴（query builder 子树复用）。
   复制=任意节点序列化入 sessionStorage 暂存（跨查询/跨索引/刷新后仍在），
   粘贴=parseQueryNode 重建（全新节点 id，与原树零引用纠缠）。暂存不限制来源：
   叶/bool/wrap/multi 一律可复制，粘贴目标=任意条件组分区（occur 下）。
   系统「剪贴」语义由本 stash 单源承担（不写系统剪贴板：无手势环境下
   clipboard.writeText 权限不稳，且跨查询复用本就是控制台内部动线）。 */
import { ref } from 'vue';
import { writeStoredRaw, removeStoredRaw } from './safeJson';
import { parseQueryNode, serQueryNode, type QueryNode } from './queryAst';

const KEY = 'esquerystudio.qb.subtree';

/** 暂存现状（null=空）；组件读它决定粘贴钮显隐 */
export const subtreeStash = ref<string | null>(null);

try {
  const raw = sessionStorage.getItem(KEY);
  if (raw) subtreeStash.value = raw;
} catch { /* 存储不可用容忍（隐私模式） */ }

/** 复制子树入暂存（serQueryNode 文本化）；返回是否成功（非法节点不可能，守卫兜底） */
export function copySubtreeToStash(node: QueryNode): boolean {
  try {
    const text = JSON.stringify(serQueryNode(node), null, 2);
    writeStoredRaw(sessionStorage, KEY, text);
    subtreeStash.value = text;
    return true;
  } catch {
    return false;
  }
}

/** 换号清理：磁盘键被前缀清掉后，模块 ref 仍持有上一账号的条件子树——
 *  不清会让新账号的「粘贴子树」按钮可用并粘出旧账号的查询条件。 */
export function clearSubtreeStash() {
  subtreeStash.value = null;
  try {
    removeStoredRaw(sessionStorage, KEY);
  } catch { /* 存储不可用容忍 */ }
}

/** 读暂存为全新节点（全新 id，零纠缠）；暂存空/非法 JSON → null（粘贴钮侧静默降级） */
export function readStashSubtree(): QueryNode | null {
  const text = subtreeStash.value;
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    return parseQueryNode(parsed);
  } catch {
    return null;
  }
}
