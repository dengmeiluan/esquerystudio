/**
 * 一千一百四十五批：SELECT 输出列别名在 GROUP BY / ORDER BY / HAVING 位补全。
 *
 * 依据（ES-SQL 官方文档）：
 * - GROUP BY：「It can be a column name, alias or ordinal number of a column」
 * - ORDER BY：「Represents an input column, an output column or an ordinal number」
 * - HAVING：官方示例即 `SELECT languages AS l, COUNT(*) AS c ... HAVING c BETWEEN 15 AND 20`
 * - WHERE：仅行过滤，别名不可用 → 该位不出别名候选（宁缺勿错）
 *
 * 解析口径：显式 `AS x` 与隐式 `ts d` 都收；括号/引号内逗号不切分；
 * 隐式末词是 SQL 关键字（END / DESC / DAY…）时不当别名。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { ensureSqlCompletion, selectAliasNames, aliasClauseOk, type SqlCompletionCtx } from '../utils/sqlCompletion';

type Provider = { provideCompletionItems: (model: any, position: any, context?: any, token?: any) => any };

function makeMonaco() {
  const providers: Record<string, Provider[]> = {};
  return {
    providers,
    api: {
      languages: {
        registerCompletionItemProvider: (_lang: string, p: Provider) => {
          (providers[_lang] ||= []).push(p);
          return { dispose: () => {} };
        },
        CompletionItemKind: { Field: 'Field', Property: 'Property', Value: 'Value', Function: 'Function', Keyword: 'Keyword', Reference: 'Reference' },
      },
    },
  };
}

const FIELDS = [
  { path: 'name', type: 'keyword' },
  { path: 'created', type: 'date' },
  { path: 'amount', type: 'double' },
  { path: 'status', type: 'keyword' },
];

const ctx = (): SqlCompletionCtx => ({
  indices: () => [{ index: 'orders' }],
  pickedIdx: () => 'orders',
  curFields: () => FIELDS,
  ensureCurFields: () => {},
});

function fakeSqlModel(text: string, word = '') {
  return {
    getValue: () => text,
    getOffsetAt: () => text.length,
    getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1, word }),
  };
}
function sqlProvider(m: ReturnType<typeof makeMonaco>): Provider {
  const arr = m.providers.sql;
  expect(arr, 'sql provider 已注册').toBeTruthy();
  return arr![arr!.length - 1];
}

describe('1145 SELECT 别名解析（纯函数）', () => {
  it('显式 AS：单列 / 聚合 / 带引号别名', () => {
    expect(selectAliasNames('SELECT name AS n, COUNT(*) AS c FROM orders')).toEqual(['n', 'c']);
    expect(selectAliasNames('SELECT name AS "名称" FROM orders')).toEqual(['名称']);
  });

  it('隐式别名：末词即别名；括号内逗号不切分（SUM(a, b) 算一列）', () => {
    expect(selectAliasNames('SELECT name n, created d FROM orders')).toEqual(['n', 'd']);
    expect(selectAliasNames('SELECT COALESCE(a, b) cc FROM orders')).toEqual(['cc']);
  });

  it('隐式末词是关键字/非标识符时不收（CASE ... END、INTERVAL 1 DAY、DESC）', () => {
    expect(selectAliasNames("SELECT CASE WHEN a=1 THEN 'x' ELSE 'y' END FROM orders")).toEqual([]);
    expect(selectAliasNames('SELECT DATE_ADD(ts, INTERVAL 1 DAY) FROM orders')).toEqual([]);
  });

  it('无 FROM / 无别名 → 空；重复别名去重', () => {
    expect(selectAliasNames('SELECT name')).toEqual([]);
    expect(selectAliasNames('SELECT name AS n, status AS n FROM orders')).toEqual(['n']);
  });

  it('别名只在可写别名的子句可用（WHERE 不可）', () => {
    expect(['GROUP BY', 'ORDER BY', 'HAVING'].every(aliasClauseOk)).toBe(true);
    expect(aliasClauseOk('WHERE')).toBe(false);
    expect(aliasClauseOk('SELECT')).toBe(false);
  });
});

describe('1145 provider：别名进入补全候选', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => vi.restoreAllMocks());

  it('GROUP BY 位出别名候选（detail 说明子句），同名字段不重复出', async () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctx);
    try {
      const sql = 'SELECT status AS s, COUNT(*) AS c FROM orders GROUP BY ';
      const r = await sqlProvider(m).provideCompletionItems(fakeSqlModel(sql), { lineNumber: 1 });
      const labels = r.suggestions.map((s: any) => s.label);
      expect(labels).toContain('s');
      expect(labels).toContain('c');
      const aliasItem = r.suggestions.find((s: any) => s.label === 's');
      expect(aliasItem.detail).toBe('SELECT 别名（GROUP BY 可用）');
      /* 字段 status 仍在（别名 s 是真的新名字，不是字段） */
      expect(labels).toContain('status');
    } finally { h.dispose(); }
  });

  it('HAVING 位：按已敲前缀过滤别名（敲 c 只出 c 别名 + 以 c 开头的字段）', async () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctx);
    try {
      const sql = 'SELECT name AS n, COUNT(*) AS c FROM orders GROUP BY n HAVING c';
      const r = await sqlProvider(m).provideCompletionItems(fakeSqlModel(sql, 'c'), { lineNumber: 1 });
      const labels = r.suggestions.map((s: any) => s.label);
      expect(labels).toContain('c');
      expect(labels).not.toContain('n');
    } finally { h.dispose(); }
  });

  it('别名前缀命中时不倾泻函数（GROUP BY c 指的是输出列，不是 CTAN/CBRT 大屏）', async () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctx);
    try {
      const sql = 'SELECT name AS n, COUNT(*) AS c FROM orders GROUP BY c';
      const r = await sqlProvider(m).provideCompletionItems(fakeSqlModel(sql, 'c'), { lineNumber: 1 });
      const labels = r.suggestions.map((s: any) => s.label);
      /* 别名在列（关键字之后再于字段之前），且整屏不再有函数族候选 */
      expect(labels).toContain('c');
      expect(labels.indexOf('c')).toBeLessThan(labels.indexOf('created'));
      expect(labels.some((l: string) => /\((?:\))?$/.test(l) && /^[A-Z_]{2,}$/.test(l.replace(/\($/, ''))),
        '函数族不随别名前缀倾泻').toBe(false);
      /* sortText 前缀 ' ' 让别名排在关键字之后、字段之前（Monaco 按 sortText 排） */
      const alias = r.suggestions.find((s: any) => s.label === 'c');
      expect(alias.sortText.startsWith(' ')).toBe(true);
    } finally { h.dispose(); }
  });

  it('WHERE 位不出别名（行过滤不能引用输出列）', async () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctx);
    try {
      const sql = 'SELECT status AS s FROM orders WHERE ';
      const r = await sqlProvider(m).provideCompletionItems(fakeSqlModel(sql), { lineNumber: 1 });
      expect(r.suggestions.map((s: any) => s.label)).not.toContain('s');
      expect(r.suggestions.map((s: any) => s.label)).toContain('status');
    } finally { h.dispose(); }
  });
});
