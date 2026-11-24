/* 1064：查询失败字段定位——从 ES 错误文本提取「查询条件相关字段」，
   再在构建树里找对应叶子。只认查询上下文错误（failed to create query / no field found /
   cannot search on field / field not indexed），sort/agg 错误不误指到条件行。 */
import type { QueryNode } from './queryAst';
import { editDistance } from './editDistance';

const FIELD_PATTERNS: RegExp[] = [
  /failed to create query:[^\n]*?field\s*\[([^\]]+)\]/i,
  /no field found for\s*\[([^\]]+)\]/i,
  /cannot search on field\s*\[([^\]]+)\]/i,
  /field\s*\[([^\]]+)\]\s*not found/i,
  /\[([^\]]+)\]\s*is not indexed/i,
  /failed to find field\s*\[([^\]]+)\]/i,
];

/** 从错误文本提取条件字段；非查询上下文（排序/聚合/文档解析）返回 null。 */
export function errorFieldOf(message: string): string | null {
  const msg = String(message || '');
  if (!msg) return null;
  /* 明确的非查询上下文：排序 / 聚合 / 文档写入解析——不定位条件行 */
  if (/in order to sort on/i.test(msg) || /aggregation/i.test(msg) || /failed to parse field/i.test(msg)) return null;
  for (const re of FIELD_PATTERNS) {
    const m = msg.match(re);
    const f = m?.[1]?.trim();
    if (f) return f;
  }
  return null;
}

const norm = (f: string) => f.replace(/\.keyword$/i, '');

/* 1112：运行时 unknown-field 之一键纠错——错误字段 + mapping 候选按编辑距离 top-3。
 与静态 lint 的 unknown-field 同一「宁缺勿错」口径：只认 errorFieldOf 已过滤的查询
 上下文，短名收紧距离阈值，没有相近候选就返回空 suggestions（调用方不出按钮）。 */
export function suggestFieldsFor(
  errText: string, fields: string[],
): { field: string; suggestions: Array<{ path: string; score: number }> } | null {
  const field = errorFieldOf(errText);
  if (!field) return null;
  const base = norm(field);
  const pool = (fields || []).map(f => String(f || '')).filter(Boolean);
  if (!pool.length) return null;
  const maxD = base.length <= 4 ? 2 : 3;
  const lc = base.toLowerCase();
  const suggestions = pool
    .filter(p => p !== field && p !== base)
    .map(p => ({ path: p, score: editDistance(lc, p.toLowerCase()) }))
    .filter(s => s.score > 0 && s.score <= maxD)
    .sort((a, b) => a.score - b.score || a.path.localeCompare(b.path))
    .slice(0, 3);
  return { field, suggestions };
}

/** 在条件树里找字段对应的叶子 id（a 与 a.keyword 互认）；找不到返回 null。 */
export function findLeafIdByField(root: QueryNode | null, field: string): string | null {
  if (!root || !field) return null;
  const target = norm(field);
  let found: string | null = null;
  const walk = (n: QueryNode) => {
    if (found) return;
    if (n.type === 'bool') { n.children.forEach(c => walk(c.node)); return; }
    if (n.type === 'wrap') { if (n.child) walk(n.child); return; }
    if (n.type === 'multi') { n.children.forEach(c => walk(c.node)); return; }
    if (n.field && norm(n.field) === target) found = n.id;
  };
  walk(root);
  return found;
}
