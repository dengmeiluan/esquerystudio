/* 558b 批：ES highlight 片段 v-html 净化单源（SearchSandboxView 原地 hlSafe 平移，逻辑逐字不动）。
 片段是文档内容直出的 HTML（存储型注入面：<img onerror> 即进 DOM）。
 净化口径=整段先转义，再放行本站 auto-highlight 注入的受控标签 <em class="hl">
 （pre_tags 是我们自己写的常量，非文档可控）；其余标签（<script>/<img>/<EM CLASS> 大小写
 变体等）保持转义纯文本，失败闭合（fail-closed）。
 ① escapeHtml 三连转义导出单源（DiagView hotThreadsHtml / IntegrationGuide
 tintGuide 两处同构本地三连合并，hlSafe 内部改用之）；② hlSafe 放行段并档 RT 超集——
 既有 <em class="hl"> 段之外并 <em>/<mark>（可带一个双引号 class 属性）档（ResultTable
 同构正则逐字平移，立牌兑现：ResultTable 改 import 本单源，两处并存归一收敛）；
 大小写变体/单引号 class/附加属性仍保持转义 fail-closed（sandboxHlSafe500 既有锁零回归）。 */
/** 三连转义单源（& < > → 实体）：v-html 前置转义统一入口，调用方按需在转义结果上放行受控标签 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function hlSafe(raw: string): string {
  const esc = escapeHtml(raw);
  return esc
    .replace(/&lt;em class=&quot;hl&quot;&gt;/g, '<em class="hl">')
    .replace(/&lt;em class="hl"&gt;/g, '<em class="hl">')
    .replace(/&lt;\/em&gt;/g, '</em>')
    /* class 值白名单 [a-zA-Z0-9 _-]：引号已排除（无法逃逸属性造事件），但任意
       class 名仍可命中本站样式类造成视觉混淆——只放行合法类名字符集。 */
    .replace(/&lt;(\/?)(em|mark)((?:\s+class="[a-zA-Z0-9 _-]*")?)\s*&gt;/g, '<$1$2$3>');
}
/* T2：highlight 片段装配共用纯函数（ES 返回片段数组 → join ' … ' → hlSafe
 净化；空档短路=''即调用方回落普通渲染）。RT hlHtml 一行委托（模板 v-html="hlHtml(hit, c)"
 与 `import { hlSafe }` 行有 queryHighlightChain 源码锁，见 RT 内注释）；QRT highlight
 opt-in（新增）同源调用——双内核净化出口仍单源 hlSafe，本函数只收装配形态。 */
export function hlSegment(frags: string[] | undefined | null): string {
  if (!frags || !frags.length) return '';
  return hlSafe(frags.join(' … '));
}
