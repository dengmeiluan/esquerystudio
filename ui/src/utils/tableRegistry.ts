/* P0-3：表格实例注册表——命令面板「跳转到列」的列名候选源与定向调用通道。
 广播模型（window table-cmd）适合无参命令；跳列带列名参数且需要「有哪些列」的清单，
 注册表直连：面板合成命令时遍历可见表实例，动作直接调该实例的 locate，天然避开
 「广播到不可见实例被静默丢弃」的协商问题。 */

interface TableRegEntry {
  /** 可跳转的列清单（可见列；调用时机=命令面板合成命令时） */
  cols: () => string[];
  /** 跳转到列：滚动+闪烁（隐藏列由实现方先自动显示） */
  locate: (col: string) => void;
  /** 实例是否可见（offsetParent 判据，与 table-cmd 接收端同一标准） */
  visible: () => boolean;
}

const reg = new Map<number, TableRegEntry>();
let seq = 0;

export function registerTable(entry: TableRegEntry): number {
  const id = ++seq;
  reg.set(id, entry);
  return id;
}

export function unregisterTable(id: number): void {
  reg.delete(id);
}

/** 当前可见的表格实例（happy-dom 下 offsetParent 为 undefined=不可见，与 T30 同判据） */
export function visibleTables(): { id: number; entry: TableRegEntry }[] {
  return [...reg.entries()]
    .filter(([, e]) => e.visible())
    .map(([id, entry]) => ({ id, entry }));
}

/** 测试隔离用（生产勿调） */
export function clearTablesForTest(): void {
  reg.clear();
  seq = 0;
}
