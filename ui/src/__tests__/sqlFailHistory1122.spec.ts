import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 1122：SQL 失败语句入历史——ok=false + 错误摘要；刷新后失败标记不丢（normalize 修复）；
 历史红点 tooltip 直接给出失败原因。 */
const store = readFileSync(join(__dirname, '../stores/queryHistory.ts'), 'utf-8');
const view = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
const panel = readFileSync(join(__dirname, '../components/QueryHistoryPanel.vue'), 'utf-8');

describe('1122 SQL 失败历史', () => {
  it('store 保留 ok/error，失败写入、成功清除', () => {
    expect(store).toContain('error?: string');
    expect(store).toContain('ok: x.ok === false ? false : (x.ok === true ? true : undefined)');
    expect(store).toContain('error: x.ok === false && typeof x.error');
    expect(store).toContain('opts?: Record<string, unknown>, error?: string');
    expect(store).toContain('it.error = err;');
    expect(store).toContain('params: p, opts: o, error: err');
  });

  it('SQL 控制台失败分支用失败快照入历史（索引/参数/选项/错误）', () => {
    expect(view).toContain("useQueryHistoryStore().push('sql', execSnapshot, indexFromSql(execSnapshot, sqlIndexPool.value) || indexOf(), undefined, false, paramsSnapshot, sqlRunOpts(), runErr.value)");
  });

  it('历史红点 tooltip 带失败原因', () => {
    expect(panel).toContain('error?: string');
    expect(panel).toContain("it.error ? '上次执行失败：' + it.error : '上次执行失败——回放可重试'");
  });
});
