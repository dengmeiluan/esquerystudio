/* ES 版本比较（简化 semver，只比 major.minor）——导航级能力降级标注用 */
export function verLt(cur: string, min: string): boolean {
  const p = (s: string) => s.split('.').map(n => parseInt(n, 10) || 0);
  const [a1 = 0, a2 = 0] = p(cur);
  const [b1 = 0, b2 = 0] = p(min);
  return a1 !== b1 ? a1 < b1 : a2 < b2;
}
