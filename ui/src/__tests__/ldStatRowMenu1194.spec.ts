/**
 * 1194 巡检补齐：实时监控屏「逐序列窗内统计表」是屏上唯一没有右键的表。
 *
 * 1158 给 Top 表 / 慢请求 / 告警历史三张表挂了行右键，但同屏第四张表
 * （curve 档下方的 min/max/avg/current 统计表，`topStatRows`）漏了——
 * 用户在同一块面板上对同一行索引右键，一张有菜单一张没有，属于「右键能力不全」。
 *
 * 锁：① 统计行挂 contextmenu，且 kind 与 Top 表同为 'top'（同一行语义，同一套动作）；
 *     ② 统计行数据必须带 index / connId ——'top' 分支的菜单读这两个键（复制索引名、
 *        权限门 canSeeConn、setTarget 都靠它们），缺了会复制空名 / 跳过权限校验；
 *     ③ 负控：源码里统计表的 <tr> 不得裸着（去掉 contextmenu 即转红）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');

/* 取统计表那一段模板（从表头注释到 </table>）——避免全文匹配把 Top 表的挂载算进来 */
function statTableBlock(): string {
  const start = src.indexOf('ld-top-stats');
  expect(start, '统计表必须还在（类名是锚）').toBeGreaterThan(0);
  const end = src.indexOf('</table>', start);
  expect(end, '统计表必须闭合').toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('1194 监控屏统计表行右键', () => {
  it('统计行挂 contextmenu，kind = top（与 Top 表同一套动作）', () => {
    const blk = statTableBlock();
    expect(blk).toContain(`@contextmenu.prevent="openLdRowMenu($event, 'top', r)"`);
  });

  it('负控：统计表的行不得裸着（没有 contextmenu 即失败）', () => {
    const blk = statTableBlock();
    const row = /<tr v-for="r in topStatRows"[^>]*>/.exec(blk)?.[0] || '';
    expect(row, '统计行标签必须能被定位').not.toBe('');
    expect(row, '行上必须真的挂上右键（不是挂在表/外层）').toContain('@contextmenu');
  });

  it('统计行带 index / connId——top 菜单复制名与权限门都读这两个键', () => {
    const mapStart = src.indexOf('const topStatRows = computed');
    expect(mapStart).toBeGreaterThan(0);
    const mapEnd = src.indexOf('.sort((a, b) => b.cur - a.cur));', mapStart);
    const body = src.slice(mapStart, mapEnd);
    expect(body, '必须带出 index（否则「复制索引名」复制空串）').toMatch(/index:\s*s\.name/);
    expect(body, '必须带出 connId（否则 canSeeConn 权限门被跳过）').toMatch(/connId:\s*s\.connId/);
  });

  it('只读纪律不回退：统计表不引入任何写动作', () => {
    const blk = statTableBlock();
    for (const word of ['@click="del', 'doDelete', 'PUT ', 'POST ']) {
      expect(blk, `统计表不应含写动作：${word}`).not.toContain(word);
    }
  });
});
