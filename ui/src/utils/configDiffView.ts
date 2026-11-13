/* -9 修复：configDiff 的**呈现层**纯函数（标签 / 提示 / 该不该比对）。
 从 AdhocRebuildView.vue 模板里提出来，唯一目的是让它们可被断言 ——
 评审 I-4：「KIND_LABEL 与 added 提示挂载点零测试看守」，而挂载点
 （v-else-if="row.kind === 'added'"）正是当初写反过的地方，
 常量自等式（expect(KIND_LABEL.added).toBe('期望有…')）抓不到它。

 === 本文件的主命题：区分「没有提供」与「提供了一个空值」 ===
 C-1 的根因不是少了一个 if，而是用 {} 这个**合法值**表示「缺席」。
 {} 既可能是「用户没粘贴任何期望」，也可能是「期望确实是空对象」，
 一旦混同，diffConfig 就会把整棵 actual 判成 removed，
 界面于是断言「你的期望里没有这些字段」—— 而用户根本没提供期望。

 本项目第三次撞这个坑（Wave 2 docDiff 的 MISSING 哨兵、 walk 把缺席侧
 退化成 {}）。所以这里不打补丁，而是把「缺席」提升成类型上的一等公民：
 parseExpectedMapping 返回 null 表示缺席，shouldDiff 据此裁决，
 缺席永远不进 diffConfig —— 不产出行，而不是产出一屏方向错误的行。 */

import type { ConfigDiffKind, ConfigDiffRow } from './configDiff';

/* kind 是 已评审的契约不改，但 added/removed 两个词对使用者天然歧义
 （"added" 听起来像"新出现的"，实际是"期望有、实际没有"），界面一律显示人话。
 brief 本身就把这对语义写反过一次，故本表由 diffConfig 真实输出驱动的断言看守。 */
const KIND_LABEL: Record<ConfigDiffKind, string> = {
  added: '期望有，实际没有',
  removed: '实际有，期望没有',
  changed: '两侧都有但值不同',
  same: '一致',
  ignored: '已忽略',
  conflict: '剥前缀后撞车',
};

/** 人话标签。未知 kind 原样返回（宁可露出 raw kind，也不要显示一个错的人话）。 */
export function kindLabel(kind: string): string {
  return KIND_LABEL[kind as ConfigDiffKind] || kind;
}

/**
 * added 行的补充说明。**只挂 added，不挂 removed** —— 这是挂载点，
 * 当初写反的就是这里：ES 丢弃「显式声明但等于默认值」的属性，这只会让
 * 「期望侧声明了、ES 没回报」（added）变得可疑；removed 是 ES 有而期望没有，
 * 与「ES 丢弃默认值」毫无关系，挂上去就是对着另一个方向胡说。
 *
 * reason 优先（ignored / conflict 自带 reason，那是更具体的解释）。
 * 返回空串表示该行无补充说明。
 */
export function kindNote(row: Pick<ConfigDiffRow, 'kind' | 'reason'>): string {
  if (row.reason) return row.reason;
  if (row.kind === 'added') {
    return 'ES 未回报此项。ES 会丢弃「显式声明但等于该类型默认值」的属性'
      + '（实测 6.7.2：doc_values:true、type:"object" 会被丢，而 coerce:true 不会），'
      + '因此这可能是等价的，也可能是真的没生效 —— 需要人工判断。';
  }
  return '';
}

/**
 * 该 diff 行是否为「ES 已知等价默认值噪声」——期望侧显式声明了某属性,而 ES 因其
 * 等于该字段类型的默认值而不回报,导致 diff 报 added(期望有、实际没有)。
 *
 * 仅 added 且属性值等于 ES 6.7.2 已知默认值时判 true。判据来自 ES 官方默认值,
 * 逐条列举、不猜:命中规则外的一律 false(宁可多报,不漏报真差异)。
 * removed / changed 永不判噪声——removed 是 ES 有而期望没有(如 _class 注入、
 * dynamic_templates),changed 是两侧值不同,都是需人工看的真差异。
 *
 * 领域知识:coerce:true 实测 ES 6.7.2 会回报(不像 norms/doc_values 等会被丢),
 * 故它不算噪声,不列入 case —— 由 default 兜底返回 false。
 */
export function isBenignDefault(row: Pick<ConfigDiffRow, 'kind' | 'path' | 'expected'>): boolean {
  if (row.kind !== 'added') return false;
  const leaf = row.path.slice(row.path.lastIndexOf('.') + 1);
  const v = row.expected;
  // ES 6.7.2 已知默认值:属性名 -> 判定该值是否等于默认
  switch (leaf) {
    case 'norms':       return v === true;   // text/keyword norms 默认 true,ES 不回报
    case 'store':       return v === false;  // store 默认 false
    case 'doc_values':  return v === true;   // 多数类型 doc_values 默认 true
    case 'index':       return v === true;   // index 默认 true
    default:            return false;
  }
}

/**
 * 把「期望侧 mapping 文本」解析成可比对的对象；**缺席返回 null**。
 *
 * 缺席的三种来源，语义上完全一致（都是「业务侧没有声明 mapping」）：
 * ① 用户压根没粘贴 → 文本为 ''
 * ② 粘了但该索引 mappingJson 为 null → pickPaste 置 ''（ 裁定 null 原样透传）
 * ③ 粘了一份空白/纯空格文本 → trim 后为 ''
 * 三者都不该产出 diff —— 没有期望就没有「期望 vs 实际」这回事。
 *
 * 解析失败同样返回 null 而不是 {}：坏 JSON 不是「期望为空」，
 * 拿 {} 去比会得到与 C-1 一模一样的满屏假 removed。
 */
export function parseExpectedMapping(text: string | null | undefined): Record<string, unknown> | null {
  if (typeof text !== 'string') return null;
  const s = text.trim();
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    /* 顶层必须是对象。数组/标量/null 不是 mapping，交给 diffConfig 会走它的
 「顶层不是对象」分支产出一条无路径的行，对使用者毫无意义。 */
    return typeof v === 'object' && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * 是否应该展示「期望 vs 实际」比对。
 *
 * 判据是「**期望侧确实提供了 mapping**」，而不是「用户粘贴过」——
 * 评审给的最小修法 pasteIdx >= 0 是后者。二者不等价，且在真实路径上会分叉：
 * 粘贴了一条 mappingJson 为 null 的索引（ 明确支持的路径，e2e 5-4 正在跑）
 * 时 pasteIdx >= 0 成立但 mappingJson 为 ''，仍会拿 {} 去比 —— C-1 原样复发。
 * 故取「有期望 mapping」为判据，它才是 computeDiff 真正依赖的前提。
 */
export function shouldDiffMapping(expected: Record<string, unknown> | null): expected is Record<string, unknown> {
  return expected !== null;
}

/**
 * 把 diff 行分成「真差异」(默认展开)与「等价噪声」(默认折叠)两区。
 * same / ignored 不是差异,两区都不进——它们不需要用户关注。
 */
export function partitionDiffRows(rows: ConfigDiffRow[]): { real: ConfigDiffRow[]; benign: ConfigDiffRow[] } {
  const real: ConfigDiffRow[] = [];
  const benign: ConfigDiffRow[] = [];
  for (const r of rows) {
    if (r.kind === 'same' || r.kind === 'ignored') continue;
    if (isBenignDefault(r)) benign.push(r); else real.push(r);
  }
  return { real, benign };
}
