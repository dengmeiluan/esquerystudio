import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintSql } from '../utils/sqlLint';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');
const bridge = read('views/SqlBridgeView.vue');
const consoleView = read('views/SqlConsoleView.vue');

/* 1388：同一条 lint 规则必须在两个用 SQL 的页面里都生效。
   1386 加的「FROM 后裸索引名缺双引号」靠**精确命中已知索引**才报（不猜），
   所以调用方必须把索引清单传进来。SqlConsole 传了，SqlBridge 漏了——
   同一条 SQL 在控制台提示、在语法桥不提示。
   判据分两层：纯函数层（清单决定报不报）+ 接线层（两个调用点都传清单）。 */
const INDICES = ['research_report', 'bond_issuer', 'logs-2026'];

describe('1388 裸索引名提示在两页都生效', () => {
  it('纯函数：清单命中原样裸名才报，未知名/通配/多表不报', () => {
    /* 1435：只对「不加引号会真的解析失败」的名字报（含 . / - 等非标识符字符）。
       logs-2026 这类名字裸写 ES SQL 无法解析，必须引号。 */
    const hit = lintSql('SELECT title FROM logs-2026 LIMIT 5', INDICES)
      .find(f => f.message.includes('必须加双引号'));
    expect(hit, '含连字符的已知索引应报').toBeTruthy();
    expect(hit!.line).toBe(1);
    expect(hit!.message).toContain('logs-2026');
    expect(hit!.suggestion).toContain('FROM "logs-2026"');

    /* 纯下划线名是合法写法，不报（1435 收窄：此前对合法输入也报） */
    expect(lintSql('SELECT title FROM research_report LIMIT 5', INDICES)
      .some(f => f.message.includes('必须加双引号')), '合法裸名不得报').toBe(false);

    /* 未知名不猜 */
    expect(lintSql('SELECT title FROM someone_elses_index', INDICES)
      .some(f => f.message.includes('必须加双引号'))).toBe(false);
    /* 带引号是正确写法 */
    expect(lintSql('SELECT title FROM "logs-2026"', INDICES)
      .some(f => f.message.includes('必须加双引号'))).toBe(false);
    /* 通配/多表：不猜单个索引 */
    expect(lintSql('SELECT * FROM "logs-*"', INDICES)
      .some(f => f.message.includes('必须加双引号'))).toBe(false);
    /* 不传清单=零增量（旧契约） */
    expect(lintSql('SELECT title FROM logs-2026')
      .some(f => f.message.includes('必须加双引号'))).toBe(false);
  });

  it('接线：SqlConsole 与 SqlBridge 调用点都传索引清单', () => {
    /* 1389：lintSql 多了第三个可选参数（字段类型），这里锁「传了索引清单」而不是整串。 */
    expect(consoleView).toMatch(/lintSql\(sql\.value \|\| '', sqlIndexPool\.value/);
    expect(bridge).toContain("lintSql(sql.value || '', store.indices.map(i => String(i.index || '')).filter(Boolean))");
  });

  it('负控：桥停传清单时上面第二条必红（模拟改回单参调用）', () => {
    const singleArg = 'const brSqlLint = computed(() => lintSql(sql.value || \'\'));';
    expect(bridge.includes(singleArg)).toBe(false);
    expect(bridge.includes("store.indices.map(i => String(i.index || ''))")).toBe(true);
  });
});
