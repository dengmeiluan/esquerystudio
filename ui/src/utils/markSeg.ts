/**
 * 件⑤：文本切 mark 段纯函数件（splitMark/normNumStr 自 composables/useGridSearch
 * 平移至此，函数体逐字同形零行为漂移）。平移动因：utils/fieldSearch 反向 import
 * composables/useGridSearch 的依赖方向倒挂在本文件落地后退役（useGridSearch re-export
 * 保全站 10+ 消费方 import 路径零改，见彼文件头注）。
 *
 * splitMark：文本切 mark 段（大小写不敏感；无命中返回单段原文）。纯函数供模板渲染
 * <mark> 切分——与 JsonTree renderHl 同思路，走 vnode/模板分支，不开 v-html 注入面。
 * 字面失配时经 normNumStr 数值归一二次比对（同 useGridSearch matches 第二遍同口径：
 * 仅两侧都「看起来是数字」且归一后 includes 才算命中），命中产整段 mark——修
 * 「数值归一命中格内无 mark」（匹配矩阵归一命中、渲染切分只认字面的两遍口径错位）；
 * 归一命中无法安全映射回原文子串区间（千分位/空白位偏移），整段标 mark 是覆盖面
 * 只增不减的最小实现。既有字面切分行为零漂移。
 */

/** W4：数值双口径归一——仅对「看起来是数字」的串生效：千分位形态
 * ^-?\d{1,3}(,\d{3})+(\.\d+)?$ 去千分位，或纯数字串去空白位；返回归一后的数字串。
 * 其余串（"a,b" 普通文本、"12,34" 非千分位形态）返回 null 不参与归一——避免去逗号误伤。 */
export function normNumStr(s: string): string | null {
  const t = s.replace(/\s+/g, '');
  if (t.indexOf(',') >= 0) {
    return /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(t) ? t.replace(/,/g, '') : null;
  }
  return /^-?\d+(?:\.\d+)?$/.test(t) ? t : null;
}

export function splitMark(text: string, kw: string): { t: string; m: boolean }[] {
  const k = kw.trim();
  if (!k) return [{ t: text, m: false }];
  const lower = text.toLowerCase(), lk = k.toLowerCase();
  const out: { t: string; m: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const at = lower.indexOf(lk, i);
    if (at < 0) {
      /* 字面扫不动时数值归一二次比对——归一命中整段标 mark，否则平文收尾 */
      const nk = normNumStr(k), nt = normNumStr(text);
      if (nk !== null && nt !== null && nt.includes(nk)) out.push({ t: text.slice(i), m: true });
      else out.push({ t: text.slice(i), m: false });
      break;
    }
    if (at > i) out.push({ t: text.slice(i, at), m: false });
    out.push({ t: text.slice(at, at + k.length), m: true });
    i = at + k.length;
  }
  return out;
}
