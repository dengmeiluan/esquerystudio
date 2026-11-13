import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintSql } from '../utils/sqlLint';

const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1389：GROUP BY / ORDER BY 打在 text 字段上会失败——除非 ES SQL 能给这个 text 找到一个
   **未归一化的 keyword 多字段**来代表精确值（官方 sql-data-types 原文：text 因为值依赖
   分析器，「not used for sorting or aggregations」；SQL 会挑 "the first keyword that it
   can find that is not normalized"）。没有 .keyword 子域 → 执行必失败。
   此前 lint 完全不知道字段类型，这条只能等用户拿到 400 才知道。 */
const TYPES = {
  title: 'text',            // 有 keyword 子域 → 合法
  'title.keyword': 'keyword',
  issuer_name: 'text',      // 无子域 → 必失败
  status: 'keyword',
  amount: 'double',
  publish_time: 'date',
  note: 'match_only_text',  // 同类（无 doc_values）且无子域 → 必失败
  'note.keyword': 'keyword',// 但这个有 → 应当放行
  summary: 'text',          // 第二个无子域的 text（多字段用例）
};

const rule7 = (sql: string, types: Record<string, string> = TYPES) =>
  lintSql(sql, [], types).filter(f => f.message.includes('排不了也分不了组'));

describe('1389 GROUP BY / ORDER BY 的 text 字段可排性', () => {
  it('无 .keyword 子域的 text → 点名，且给出可行动出路', () => {
    const g = rule7('SELECT issuer_name, COUNT(*) FROM "i" GROUP BY issuer_name');
    expect(g.length).toBe(1);
    expect(g[0]!.message).toContain('issuer_name');
    expect(g[0]!.message).toContain('text');
    expect(g[0]!.suggestion).toContain('.keyword');
    expect(g[0]!.line).toBe(1);

    const o = rule7('SELECT * FROM "i" ORDER BY issuer_name DESC');
    expect(o.length).toBe(1);
    expect(o[0]!.message).toContain('issuer_name');
  });

  it('有 .keyword 子域就一个字都不报（ES SQL 会自动挑它）', () => {
    expect(rule7('SELECT title, COUNT(*) FROM "i" GROUP BY title')).toEqual([]);
    expect(rule7('SELECT * FROM "i" ORDER BY title DESC')).toEqual([]);
    expect(rule7('SELECT * FROM "i" ORDER BY note')).toEqual([]);
  });

  it('keyword/date/数值字段与未知字段一律放行（宁缺勿错）', () => {
    expect(rule7('SELECT * FROM "i" ORDER BY status, amount, publish_time')).toEqual([]);
    /* 名字不在类型表里：运行时字段/别名/未加载 —— 没有证据不判 */
    expect(rule7('SELECT * FROM "i" ORDER BY some_other_field')).toEqual([]);
    /* 表达式/函数结果不是字段，不做类型裁决 */
    expect(rule7('SELECT * FROM "i" ORDER BY COUNT(*)')).toEqual([]);
    expect(rule7('SELECT * FROM "i" ORDER BY LOWER(issuer_name)')).toEqual([]);
  });

  it('同一字段多子句只报一次；行号落在该字段所在行', () => {
    const multi = rule7('SELECT issuer_name FROM "i"\nGROUP BY issuer_name\nORDER BY issuer_name DESC');
    expect(multi.length).toBe(1);
    const two = rule7('SELECT * FROM "i"\nGROUP BY issuer_name, summary');
    expect(two.length).toBe(2);
    expect(two.map(f => f.line)).toEqual([2, 2]);
  });

  it('负控：把子域信息抹掉，本该放行的 title 立刻变红（证明判据真的看子域）', () => {
    const noSub = { ...TYPES };
    delete (noSub as any)['title.keyword'];
    const r = rule7('SELECT * FROM "i" ORDER BY title', noSub);
    expect(r.length).toBe(1);
    expect(r[0]!.message).toContain('title');
    /* 对照：带子域时同一条 SQL 零告警 */
    expect(rule7('SELECT * FROM "i" ORDER BY title')).toEqual([]);
  });

  it('接线：SqlConsole 把字段源的类型表交给 lint（不传=零增量）', () => {
    expect(src).toContain('const sqlLintFieldTypes = computed<Record<string, string>>(() => {');
    expect(src).toContain('for (const f of sqlFieldsCtx.fields.value) out[f.path] = f.type;');
    expect(src).toContain("lintSql(sql.value || '', sqlIndexPool.value, sqlLintFieldTypes.value)");
    /* 不传类型时旧行为逐字不变 */
    expect(lintSql('SELECT issuer_name, COUNT(*) FROM "i" GROUP BY issuer_name').length).toBe(0);
  });
});
