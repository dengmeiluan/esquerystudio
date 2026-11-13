import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useQueryHistoryStore } from '../stores/queryHistory';

const view = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
const hub = readFileSync(join(__dirname, '../views/QueryHubView.vue'), 'utf-8');

/* 1089：SQL 历史也是执行现场——时区/页超时/列式/宽容/取数与 SQL、参数同权。
 * 只回放文本会让「当时跑出这组结果」的上下文丢失（日期口径、响应形态、取数量都会变）。 */
describe('1089 SQL 历史执行选项', () => {
  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

  it('历史条目保存执行选项；同语句重跑以最近一次为准', () => {
    const s = useQueryHistoryStore();
    s.push('sql', 'SELECT 1', 'idx', 12, true, undefined, { fetchSize: 50, timeZone: 'Asia/Shanghai', columnar: true });
    expect(s.items[0].opts).toEqual({ fetchSize: 50, timeZone: 'Asia/Shanghai', columnar: true });
    s.push('sql', 'SELECT 1', 'idx', 20, true, undefined, { fetchSize: 200, lenient: true });
    expect(s.items.length, '同语句同参数仍去重').toBe(1);
    expect(s.items[0].opts).toEqual({ fetchSize: 200, lenient: true });
  });

  it('持久化后重新载入保留选项（且过滤非标量脏值）', () => {
    const s = useQueryHistoryStore();
    s.push('sql', 'SELECT 2', 'idx', 5, true, undefined, { fetchSize: 100, nested: { a: 1 } as any, timeZone: 'Asia/Tokyo' });
    setActivePinia(createPinia());
    const s2 = useQueryHistoryStore();
    expect(s2.items[0].opts).toEqual({ fetchSize: 100, timeZone: 'Asia/Tokyo' });
  });

  it('视图接线：执行历史上报选项，页内回放恢复选项', () => {
    expect(view).toContain('function sqlRunOpts(): Record<string, string | number | boolean> {');
    expect(view).toContain('if (row.opts) applySqlOpts(row.opts);');
    expect(view).toContain("function replayHistRow(row: { query: string; params?: string; index?: string; opts?: Record<string, unknown> }");
  });

  it('跨模式历史回放把选项写入 prefill 通道（无选项先清旧键）', () => {
    expect(hub).toContain("removeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.opts');");
    expect(hub).toContain("if (it.opts) writeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.opts', JSON.stringify(it.opts));");
  });
});
