/**
 * Levenshtein 编辑距离共享小实现（dslLint 内部同款算法抽出共享——dslLint.ts
 * 是兄弟 lane 成品禁改，本文件供新消费方 import；dslLint 内部私有实现维持原样不迁移）。
 * 纯函数、零依赖。消费方：utils/sqlLint.ts（保留字拼写）、components/LuceneInput.vue
 * （未知字段最近候选）。
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
