/* 编辑器高度四档常量外置（自 DslQueryView 抽出；IndexHubView 后续复用）。
 四档 S/M/L/满 + 档位钮描述，视图只 import，不再各自手写口径。 */

/** Monaco 高度档位值（full 档经容器 flex 弹性拉伸，如 .dq-editor-full） */
export const EDITOR_HEIGHTS = { s: '200px', m: '360px', l: '560px', full: '100%' } as const;
export type EditorHKey = keyof typeof EDITOR_HEIGHTS;

/** 档位切换钮组（k=档位键，t=钮面文案） */
export const EDITOR_H_TIERS: { k: EditorHKey; t: string }[] = [
  { k: 's', t: 'S' }, { k: 'm', t: 'M' }, { k: 'l', t: 'L' }, { k: 'full', t: '满' },
];

/** 编辑器字号三档常量（自 DevToolsView 本地 ED_FONT_TIERS 合并单源；
 DQ dq.font / IH ih.font 同口径消费——轨4「同场景同一套」纪律，档位口径全站一口径） */
export const EDITOR_FONT_TIERS: number[] = [12.5, 14, 16];
