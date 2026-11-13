/**
 * ES 索引名硬规则前置校验（纯函数，共享口径）——消费方：AdhocRebuildView destNameErr、
 * ReindexAdvancedView destIndexErr。在提交前用人话拦下非法字符与大写字母，
 * 不等 bulk/reindex 跑一半才报难懂的 invalid_index_name_exception。
 *
 * 为什么不合并 composables/useInputLint 的 indexNameRule()：那是 spec -1 钦定的
 * 严格 lint（额外拦 * : 空格、保留前缀、字节超长），而两页现行口径更宽松、错误文案
 * 已被即时红字与 submit 阻断链消费——本函数逐字保持既有文案与判定范围，不做语义升格。
 *
 * @returns '' = 合法；否则返回以「目标索引名…」开头的错误文案（两页原文，勿改字）
 */
export function indexNameProblem(name: string): string {
  const badChar = name.match(/[\\/?"<>|,#]/);
  if (badChar) return '目标索引名含非法字符 "' + badChar[0] + '"（ES 索引名不允许 \\ / ? " < > | , #）';
  if (/[A-Z]/.test(name)) return '目标索引名含大写字母（ES 索引名必须小写）';
  return '';
}
