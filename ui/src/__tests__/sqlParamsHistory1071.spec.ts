/* 1071：参数化 SQL 的历史回放保真——历史存的是「查询文本 + 参数现场」，
   回放/切集群重跑/跨模式回放都必须成对恢复；只有文本没有参数 = 回放语义已变。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rd = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const sqlView = rd('views/SqlConsoleView.vue');
const hub = rd('views/QueryHubView.vue');
const panel = rd('components/QueryHistoryPanel.vue');

describe('1071 SQL 历史参数快照', () => {
  it('执行成功把参数快照写进历史（与 SQL 同一份执行现场）', () => {
    expect(sqlView).toContain("const paramsSnapshot = pp.value.length ? paramsText.value.trim() : undefined;");
    expect(sqlView).toContain("useQueryHistoryStore().push('sql', execSnapshot, indexFromSql(execSnapshot, sqlIndexPool.value) || indexOf(), undefined, true, paramsSnapshot, sqlRunOpts());");
    /* cursor 也绑到执行快照，而非 await 期间可能被改的新稿 */
    expect(sqlView).toContain('cursorSql.value = r.cursor ? sqlSnapshot : null;');
  });

  it('页内回放恢复参数；无参数条目清空当前参数（如实还原现场）', () => {
    expect(sqlView).toMatch(/function replayHistRow\(row: \{ query: string; params\?: string; index\?: string; opts\?: Record<string, unknown> \}/);
    expect(sqlView).toContain("paramsText.value = row.params || '';");
    expect(sqlView).toContain('if (row.params) paramOpen.value = true;');
  });

  it('跨页 prefill 与切集群重跑都携带参数键', () => {
    expect(sqlView).toContain("sessionStorage.getItem('esquerystudio.sql.prefill.params')");
    expect(sqlView).toContain("removeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.params')");
    expect(sqlView).toContain("writeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.params', carryParams)");
    expect(hub).toContain("if (it.params) writeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.params', it.params);");
    /* 非 SQL 回放不得把上一条 SQL 的参数残留带下去 */
    expect(hub).toContain("removeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.params');");
  });

  it('历史面板可见参数徽标，导出保留参数且无参数条目形态不变', () => {
    expect(panel).toContain('paramsTag(it.params)');
    expect(panel).toContain("...(it.params ? { params: it.params } : {}),");
    expect(panel).toContain("|| (it.params || '').toLowerCase().includes(k)");
  });
});
