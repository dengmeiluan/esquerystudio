/* 构建器内部协作总线（避免深层组件事件透传）。
 TREE_BUS：落点分区 → 顶层统一 moveNode。DRAG_KEY：window 上被拖节点 id 暂存。
 fireDrag：拖拽开始/结束广播，BoolGroupNode 借此亮出空分区作落点。 */
import type { InjectionKey, Ref } from 'vue';
import type { Occur, NamedSpecItem } from '../../utils/queryAst';

export interface TreeBus {
  /** anchorId（991）：同分区某子句 id = 行级插入（该行之后）；缺省 = 分区末尾追加 */
  move(dragId: string, targetBoolId: string, occur: Occur, anchorId?: string | null): void;
  /** 条件行「参与/不参与」开关：按叶子 id 递归翻 disabled（ClauseNode 直调，免逐层事件透传） */
  toggleDisabled(leafId: string, disabled: boolean): void;
  /** 1069 续：条件字段不在 mapping 时一键补运行时字段（类型由行内值保守推断）；
   * 返回 true=已写入树（重名/空名 false，调用方据此提示）。 */
  defineRuntime(name: string, type: string): boolean;
  /** 1069 续：树内 runtime_mappings 的响应式快照——条件行判断「该字段是运行时字段且缺 script」。
   * 可选：迷你树等没有运行时字段区的宿主不提供，行内提示自然不出现。 */
  runtimeItems?: Ref<NamedSpecItem[]>;
  /** 1069 续：从条件行跳去补 script（宿主展开检索参数块并定位运行时字段区）。 */
  editRuntime?: (name: string) => void;
}
export const TREE_BUS: InjectionKey<TreeBus> = Symbol('qtp-tree-bus');

/* 1049：多选批量操作总线——QueryTreePane 持有开关/选中集合，任意层级行只读渲染复选框。 */
export interface SelectBus {
  enabled: Ref<boolean>;
  selected: Ref<Set<string>>;
  /** shift=true：从上次勾选行到当前行连续区间（按当前可见行顺序） */
  toggle(id: string, shift?: boolean): void;
}
export const SELECT_BUS: InjectionKey<SelectBus> = Symbol('qtp-select-bus');
export const DRAG_KEY = '__qtpDragId';
export const DRAG_EVENT = 'qtp-drag';
export function fireDrag(on: boolean) { window.dispatchEvent(new CustomEvent(DRAG_EVENT, { detail: { on } })); }
