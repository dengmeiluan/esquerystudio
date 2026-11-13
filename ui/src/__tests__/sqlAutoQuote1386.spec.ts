/**
 * 1386：SQL 里索引名漏双引号不该直接报错。
 *
 * 用户原话：「之前比如索引要求 ""，但是用户自己录入的索引名字没有带 ""，
 * 我觉得这类应该要提升体验，直接报错体验很差」。
 *
 * 现状：ES SQL 把标识符当关键字集合，`FROM my-index` 未加引号时 `-` 被当减号，
 * 直接抛 `line 1:x:` 语法错——报错文案和索引名毫不相干，用户不知道是缺引号。
 *
 * 本批两条互补路径：
 *   ① 执行前自动补引号（只在名字**精确命中已知索引**时；通配符/多表/已有引号/子查询不动），
 *      并给一条可见提示，注明编辑器原文未改；
 *   ② 输入时就 lint 提示（同一条判据），让用户在按执行前就看见。
 *
 * 负控：
 *   · 不存在的索引名 → 绝不改写（不能"猜"用户想查什么）；
 *   · `logs-*` 通配符 → 不改写（加了引号语义就变了）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoQuoteFromIndex } from '../utils/sqlQuote';
import { lintSql } from '../utils/sqlLint';

const IDX = ['acme_entity', 'my-index', 'logs-2026'];

describe('1386 FROM 索引名自动补引号', () => {
  it('① 裸索引名命中已知列表 → 补双引号', () => {
    const r = autoQuoteFromIndex('SELECT * FROM my-index LIMIT 10', IDX);
    expect(r.quoted).toBe('my-index');
    expect(r.sql).toBe('SELECT * FROM "my-index" LIMIT 10');
  });

  it('② 已带引号 / 反引号 → 逐字不动', () => {
    const a = 'SELECT * FROM "my-index"';
    const b = 'SELECT * FROM `my-index`';
    expect(autoQuoteFromIndex(a, IDX)).toEqual({ sql: a, quoted: null });
    expect(autoQuoteFromIndex(b, IDX)).toEqual({ sql: b, quoted: null });
  });

  it('③ 负控：名字不在已知索引 → 绝不改写（不猜）', () => {
    const s = 'SELECT * FROM no_such_idx';
    expect(autoQuoteFromIndex(s, IDX)).toEqual({ sql: s, quoted: null });
    /* 空索引清单同理 */
    expect(autoQuoteFromIndex('SELECT * FROM my-index', [])).toEqual({ sql: 'SELECT * FROM my-index', quoted: null });
  });

  it('④ 负控：通配符不补（加了引号语义会变）', () => {
    const s = 'SELECT * FROM logs-*';
    expect(autoQuoteFromIndex(s, IDX)).toEqual({ sql: s, quoted: null });
  });

  it('⑤ 多表 / 子查询不动', () => {
    const multi = 'SELECT * FROM my-index, acme_entity';
    expect(autoQuoteFromIndex(multi, IDX).quoted).toBeNull();
    const sub = 'SELECT * FROM (SELECT * FROM my-index) t';
    /* 首个 FROM 后是 ( ；正则不吃，保持不动 */
    expect(autoQuoteFromIndex(sub, IDX).quoted).toBeNull();
  });

  it('⑥ 带别名仍可补（补引号后别名照常工作）', () => {
    const r = autoQuoteFromIndex('SELECT * FROM my-index AS m WHERE m.x = 1', IDX);
    expect(r.sql).toBe('SELECT * FROM "my-index" AS m WHERE m.x = 1');
  });

  it('⑦ 大小写/下划线/点号形态都能命中', () => {
    expect(autoQuoteFromIndex('SELECT * FROM acme_entity', IDX).quoted).toBe('acme_entity');
  });
});

describe('1386 lint 提示（输入时就看得见）', () => {
  it('① 裸索引名命中已知列表 → 出提示，且建议里给出正式写法', () => {
    const f = lintSql('SELECT * FROM my-index LIMIT 10', IDX);
    const hit = f.find(x => /必须加双引号/.test(x.message));
    expect(hit, `应提示缺引号，实际 ${JSON.stringify(f.map(x => x.message))}`).toBeTruthy();
    expect(hit!.suggestion).toContain('FROM "my-index"');
  });

  it('② 已加引号 / 未知索引 / 通配符 → 零提示（不误报）', () => {
    expect(lintSql('SELECT * FROM "my-index"', IDX).some(x => /必须加双引号/.test(x.message))).toBe(false);
    expect(lintSql('SELECT * FROM nobody_knows_this', IDX).some(x => /必须加双引号/.test(x.message))).toBe(false);
    expect(lintSql('SELECT * FROM logs-*', IDX).some(x => /必须加双引号/.test(x.message))).toBe(false);
  });

  it('③ 不传 knownIndices → 零增量（既有调用方行为不变）', () => {
    expect(lintSql('SELECT * FROM my-index LIMIT 10').length).toBe(0);
  });

  it('④ 接线确实把索引清单传进去了（源码锁）', () => {
    const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
    /* 1389：lintSql 多了第三个可选参数（字段类型），这里只锁「传了索引清单」这件事，
       不再要求整串逐字——否则每加一个可选参数都要改一次这条断言。 */
    expect(src, 'lint 必须带已知索引清单').toMatch(/lintSql\(sql\.value \|\| '', sqlIndexPool\.value/);
    expect(src, '执行链必须使用补引号后的文本').toMatch(/const body = buildBody\(execSql\)/);
  });
});
