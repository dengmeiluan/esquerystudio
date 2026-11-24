/**
 * ·用户产线实报③「文档 diff 只改一个字段,变更超多」根治件。
 *
 * 原算法(DiffEditorView diffLines)=按下标逐行硬对齐(a[i] vs b[i]):任何位置插入/删除
 * 一行(如数组加一个元素)后,其后所有行下标错位,一行真实变更放大成整篇 -/+ 爆炸
 * (实报截图:改一个字段显示「Diff · 24 处变更」)。
 *
 * 本件=经典 LCS(最长公共子序列)行对齐:内容相同的行跨位置对齐为 eq,只有真实增删
 * 才出 del/add。文档 JSON 行数量级(几十~几千)下 O(n·m) DP + Uint32Array 完全可承受;
 * 超大输入(行积 > 4e6)保底退回「前缀对齐」防止内存膨胀(防御性,正常文档不可达)。
 */
type DiffLineOp = 'add' | 'del' | 'eq';

export function lcsDiffLines(a: string[], b: string[]): Array<{ op: DiffLineOp; tx: string }> {
  const n = a.length;
  const m = b.length;
  const out: Array<{ op: DiffLineOp; tx: string }> = [];
  /* 防御上限:行积超限退化为线性对齐(前缀 eq + 余量 del/add),不炸内存 */
  if (n * m > 4_000_000) {
    const common = Math.min(n, m);
    for (let i = 0; i < common; i++) out.push({ op: a[i] === b[i] ? 'eq' : 'del', tx: a[i] });
    for (let i = common; i < n; i++) out.push({ op: 'del', tx: a[i] });
    for (let j = common; j < m; j++) out.push({ op: 'add', tx: b[j] });
    return out;
  }
  /* dp[i][j] = a[i..] 与 b[j..] 的 LCS 长度 */
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ op: 'eq', tx: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ op: 'del', tx: a[i] }); i++; }
    else { out.push({ op: 'add', tx: b[j] }); j++; }
  }
  while (i < n) out.push({ op: 'del', tx: a[i++] });
  while (j < m) out.push({ op: 'add', tx: b[j++] });
  return out;
}
