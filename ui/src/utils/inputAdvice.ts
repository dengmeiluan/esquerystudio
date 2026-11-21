/**
 * 五视图输入面轻量校验+纠错建议单源（轨1 纠错增强·独占域新增）。
 * 语义=「提示不阻断」——与 useInputLint warn 档同位（展示走既有 .il-hint 主题档），
 * 纯函数零请求；纠错建议只对「确定可修」的形态给改法，拿不准不说话（宁缺毋滥，
 * 防误报噪音盖过真问题）。
 *
 * 消费面（接线）：
 * - SearchTemplatesView 参数值输入（jsonShapeAdvice）——coerce 对 JSON 形态失败静默
 * 按字符串下发的盲区就地可见；
 * - SynonymsManagerView 坏行提示旁（synonymFixHint）——与既有 badLines 九类硬错互补：
 * badLines 说「哪错了」，本函数说「怎么改」。
 */

/** JSON 形态纠错建议：值以 { [ 开头但解析失败时给人话原因与修法；其余一律空串
 * （普通字符串/数字/布尔是参数输入的合法主形态，零打扰）。落因优先级：中文引号 →
 * 中文冒号 → 尾随逗号 → 括号不平衡 → 兜底（点破「会按字符串下发」的静默盲区）。 */
export function jsonShapeAdvice(v: string): string {
  const t = (v ?? '').trim();
  if (!t || !/^[{[]/.test(t)) return '';
  try { JSON.parse(t); return ''; } catch { /* 落因给建议 */ }
  if (/[“”‘’「」]/.test(t)) return '含中文引号——JSON 只认半角 "（中文引号会被当成字符串内容）';
  /* 中文冒号判定剥掉字符串字面量再查（值里合法含全角冒号，如 "备注：已完成"） */
  const bare = t.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  if (bare.includes('：')) return '键后用了中文冒号「：」——JSON 只认半角 :，替换后即可解析';
  if (/,\s*[}\]]/.test(bare)) return '尾随逗号——JSON 不允许最后一项后带逗号，删去即可';
  /* 括号不平衡（剥字符串后计数）：只报「不平衡」不报具体位置（轻量预检口径，同 jqLiteRule） */
  const open = (bare.match(/[{[]/g) || []).length;
  const close = (bare.match(/[}\]]/g) || []).length;
  if (open !== close) return open > close ? '括号不配对——有未闭合的 { 或 [，补全后再下发' : '括号不配对——有多余的 } 或 ]，删去后再下发';
  return 'JSON 形态不完整——当前会按字符串下发（结构不会被识别），检查引号/逗号后才会按结构解析';
}

/** 同义词坏行纠错建议：只对「确定可修」形态给一句改法；无建议空串。全角标点给半角
 * 改写结果（→, ：→: ＝→=，超长截断防提示条撑爆）；=> 右项缺失给补法示例；
 * 「,」与「=>」混用给裁决口径（与 badLines 检出原因一一对应，badLines 说哪错、
 * 这里说怎么改）。注释行/空行/健康行零打扰。 */
export function synonymFixHint(line: string): string {
  const s = (line ?? '').trim();
  if (!s || s.startsWith('#')) return '';
  if (/[，、：＝]/.test(s)) {
    const fixed = s.replace(/[，、]/g, ',').replace(/：/g, ':').replace(/＝/g, '=');
    if (fixed !== s) return '改为半角分隔即可解析：' + (fixed.length > 46 ? fixed.slice(0, 46) + '…' : fixed);
  }
  if (/=>\s*$/.test(s)) return '「=>」右侧缺词项——补上目标词，如：word => translation';
  if (s.includes(',') && s.includes('=>')) return '混用「,」与「=>」——同义组各词只用「,」分隔，单向替换删去「,」只留一个「=>」';
  return '';
}
