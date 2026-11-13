/* -13：goto 快捷键唯一权威源。
 *
 * 原先「App.vue 里的 GOTO_MAP」与「HotkeyPanel.vue 里的硬编码文案」是两份数据，
 * App.vue 的注释自己写着「登记表在 HotkeyPanel.vue 内维护」——明写的手工同步点。
 * 退役 OpsView/HistoryView 时 GOTO_MAP 删了 p/h，面板文案没跟着改，
 * 于是面板宣传 p/h 两个不存在的绑定（g,p 静默无反应；g,h 穿透到 NAV 的 h→/workspace，
 * 说去「历史」实际去工作台）。硬编码字符串 vue-tsc 和单测都抓不到。
 *
 * 现在 path 与 label 并列存于此：App.vue 取 path 做跳转，HotkeyPanel.vue 取 label 渲染。
 * 面板不再是「需要同步的第二份数据」，而是本表的投影——同步点在结构上消失，
 * 而非仅靠测试看守。hotkeys.spec.ts 另做双向断言兜住 label 与 NAV 真实名称的漂移。
 *
 * label 取 router.ts NAV_ITEMS 里该 path 的 name，由 hotkeys.spec.ts 逐条钉死。 */
interface GotoTarget {
  path: string;
  label: string;
}

/* 键 = g 之后按下的字母；顺序即速查面板展示顺序 */
export const GOTO_TARGETS: Readonly<Record<string, GotoTarget>> = {
  /* q/s 指向查询工作台对应模式（旧路径也有 redirect 兜底，这里直达省一跳） */
  o: { path: '/overview', label: '概览' },
  q: { path: '/search', label: '查询工作台' },
  m: { path: '/mapping', label: 'Mapping' },
  b: { path: '/browser', label: '数据浏览器' },
  r: { path: '/rest', label: 'REST 直连' },
  /* -13：h 原登记的「历史」随 HistoryView 退役被删，但 NAV 有单键 h→/workspace，
 App.vue 的 chord 分支查不到 GOTO 时会落到 NAV 单键回退，g,h 因此仍能跳——
 跳的是工作台。既然行为真实存在就如实登记，否则就是「有功能没人知道」。 */
  h: { path: '/workspace', label: '工作台' },
  d: { path: '/diag', label: '诊断' },
  x: { path: '/xmigrate', label: '跨集群迁移' },
  t: { path: '/tasks', label: '任务' },
  a: { path: '/analyze', label: '分词验证' },
  l: { path: '/aliases', label: '别名管控' },
  c: { path: '/topology', label: '拓扑' },
  e: { path: '/templates', label: '索引模板' },
  n: { path: '/snapshots', label: '快照' },
  s: { path: '/search?mode=sandbox', label: '沙盒' },
  k: { path: '/index-settings', label: '热Setting' },
  i: { path: '/ilm', label: 'ILM' },
  f: { path: '/cluster-settings', label: '集群设置' },
  j: { path: '/task-tree', label: '任务树' },
  y: { path: '/reindex-preview', label: 'Reindex预估' },
  v: { path: '/health-report', label: '一键体检' },
  w: { path: '/templates-gallery', label: '模板画廊' },
  z: { path: '/optimizer', label: '优化向导' },
  /* g→u 到 watcher。q/r/b/x 已被既有占用（query/rest/browser/xmigrate），
 就直接用 NAV 单键 u/q/r/b/x 即可（看 router.ts） */
  u: { path: '/watcher', label: 'Watcher 告警' },
  /* 26 字母单键已全占用，索引工作区走 gg chord（vim 风） */
  g: { path: '/indices', label: '索引工作区' },
};

/* App.vue 的 onKey 只要 path，保留原 GOTO_MAP 形状避免调用处改动 */
export const GOTO_MAP: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(GOTO_TARGETS).map(([k, v]) => [k, v.path]),
);
