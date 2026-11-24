/* 索引名纠错（DSL / SQL 共用）——从 ES 错误文本读出不存在的索引，按编辑距离给相近候选。
   只在错误文本明确出现 `no such index [x]` / `Unknown index [x]` 时工作，宁缺勿错。 */
import { editDistance } from './editDistance';

export function suggestIndexNames(errText: string, names: string[]): { index: string; suggestions: Array<{ path: string; score: number }> } | null {
  const m = String(errText || '').match(/(?:Unknown index|no such index) \[([^\]]+)\]/i);
  if (!m) return null;
  const index = m[1];
  if (!index) return null;
  const maxD = index.length <= 3 ? 2 : 3;
  const lc = index.toLowerCase();
  const pool = names.map(n => String(n || '')).filter(Boolean);
  const suggestions = pool
    .map(n => ({ path: n, score: editDistance(lc, n.toLowerCase()) }))
    .filter(s => s.score > 0 && s.score <= maxD)
    .sort((a, b) => a.score - b.score || a.path.localeCompare(b.path))
    .slice(0, 3);
  return { index, suggestions };
}
