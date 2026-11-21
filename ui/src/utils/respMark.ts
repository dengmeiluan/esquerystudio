/**
 * 视图内搜索 mark 内核单源——RestView.markHtml 与 DslQueryView.jsonMarkedHtml
 * 同构实现合并（escapeRe 正则转义 + split(/(<[^>]+>)/g) 文本/标签分轨 + 递增 data-hit-idx
 * + 当前命中 j-mark-cur）。两处类名 j-mark/j-mark-cur 与 data-hit-idx 属性逐字保形
 * （既有行为锁同步更新本单源：标签段 i%2!==0 不参与替换，搜索词出现在
 * class 属性值里不误标；计数与渲染解耦由调用方各自传 cur——计数传 0，isCur 恒假不标记）。
 */

/** 正则元字符转义（单源）：搜索词进 new RegExp 前必经（jsonFindEscape500 H4 行为锁锚点） */
export function escapeRe(kw: string): string {
  return kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * HTML 上包 mark：文本段（偶数下标）按 kw 全部命中包 <mark>，第 cur 个命中附加
 * j-mark-cur 当前命中档并写 data-hit-idx=序号（querySelector 定位链用）；
 * cur 传 0 即纯计数模式（不产生标记串，count 与渲染同函数解耦——防
 * matchCount→marked→hitCur→matchCount 成环的 useHitNav TDZ，RestView/DslQueryView 同口径）。
 * kw 为空原样返回（count=0）。
 */
export function markHtmlAll(html: string, kw: string, cur: number): { html: string; count: number } {
  if (!kw) return { html, count: 0 };
  const parts = html.split(/(<[^>]+>)/g);
  let count = 0;
  const re = new RegExp(escapeRe(kw), 'gi');
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = parts[i].replace(re, (m) => {
      count++;
      const isCur = count === cur;
      return `<mark class="j-mark${isCur ? ' j-mark-cur' : ''}" data-hit-idx="${count}">${m}</mark>`;
    });
  }
  return { html: parts.join(''), count };
}
