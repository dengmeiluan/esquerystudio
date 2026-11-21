import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 1123：语法桥的跨模式 SQL 历史回放——索引现场跟随；带位置参数/非默认执行选项的
 条目只回填不自动试跑（桥的试跑只发送 {query}，无法还原现场）。 */
const view = readFileSync(join(__dirname, '../views/SqlBridgeView.vue'), 'utf-8');

describe('1123 语法桥历史回放现场', () => {
  it('历史行显示执行选项摘要（与控制台/抽屉同口径）', () => {
    expect(view).toContain("import { describeSqlOpts } from '../utils/sqlOpts';");
    expect(view).toContain('const sub = describeSqlOpts(i.opts);');
    expect(view).toContain('return sub ? { ...i, sub } : i;');
  });

  it('回放跟随索引；参数/选项现场只回填不自动跑', () => {
    expect(view).toContain('function replayHistRow(row: { query: string; params?: string; index?: string; opts?: Record<string, unknown> }, runIt: boolean) {');
    expect(view).toContain('store.pick(idx);');
    expect(view).toContain('const hasParams = !!row.params?.trim();');
    expect(view).toContain('const optSub = describeSqlOpts(row.opts);');
    expect(view).toContain('if (hasParams || optSub) {');
    expect(view).toContain('语法桥不支持${why}，已仅回填 SQL；请回 SQL 控制台回放');
    /* 身份门（autoRunAllowed 同口径）：回放改走 runSqlAuto（回填现场不变，载荷来自上一账号时不抢发） */
    expect(view).toContain('if (runIt) runSqlAuto();');
  });
});
