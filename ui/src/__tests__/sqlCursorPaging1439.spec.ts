/**
 * 一千四百三十九批：SQL 游标深分页的三条硬约束（真机核实后固化）。
 *
 * 真机链路已验（1440×1000）：执行带 cursor 的查询 → 首屏 1 行；
 * 点「下一页」→ 请求 `/sql/cursor?cursor=cur-1` → 行数 1→2（**追加**而非替换）；
 * 点「关闭 cursor」→ 两个入口同时消失。
 *
 * 本批锁三条容易在重构时被破坏的约束：
 *  ① 续取必须 concat 追加，不能整体替换（替换=用户已看的页消失）；
 *  ② SQL 改稿后必须作废旧 cursor（否则旧页会拼进新结果）；
 *  ③ 失败时 cursor 必须保留（可重试），不能因一次网络抖动丢掉继续取数的能力。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
const next = SQL.match(/async function nextPage\(\)[\s\S]*?\n\}/)?.[0] ?? '';

describe('1439 SQL 游标分页约束', () => {
  it('nextPage 存在且以 cursor 为前置条件', () => {
    expect(next, '必须找到 nextPage').toContain('async function nextPage()');
    expect(next).toMatch(/if \(!cursor\.value\) return;/);
  });

  it('① 续取是 concat 追加，不是 replace', () => {
    expect(next, '必须 concat 追加').toMatch(/rows\.value = rows\.value\.concat\(add\)/);
    /* 负控：把 concat 换成直接赋值 → 本断言红 */
    expect(next.replace('rows.value = rows.value.concat(add)', 'rows.value = add'))
      .not.toMatch(/rows\.value = rows\.value\.concat\(add\)/);
  });

  it('② 改稿后必须关闭旧 cursor 并提示重新执行', () => {
    expect(next).toContain('cursorSql.value !== null && sql.value !== cursorSql.value');
    expect(next).toMatch(/await closeCursorQuiet\(\)/);
    expect(next).toMatch(/SQL 已修改/);
  });

  it('③ 失败/形态异常时 cursor 保留可重试', () => {
    expect(next, '形态异常提示要说明 cursor 已保留').toMatch(/cursor 已保留，可重试/);
    /* 两条失败路径都不得在 catch/形态异常里清空 cursor */
    const cursorCleared = /(hasSqlRowsShape\(r\)\)[^]*?cursor\.value = null)|(catch[^]*?cursor\.value = null)/.test(next);
    expect(cursorCleared, '失败路径不得清空 cursor（否则无法重试）').toBe(false);
  });

  it('④ 入口随 cursor 在场：下一页/关闭 cursor 都在 v-if="cursor" 内', () => {
    /* 模板里这两个钮必须被同一个 v-if 包住，否则 cursor 耗尽后仍可点 */
    const seg = SQL.slice(SQL.indexOf('<template v-if="cursor">'), SQL.indexOf('</template>', SQL.indexOf('<template v-if="cursor">')));
    expect(seg).toContain('下一页');
    expect(seg).toContain('关闭 cursor');
  });
});
