/**
 * 1143：SQL 补全补上 CASE 表达式骨架（ES-SQL 官方支持，可作 GROUP BY 自定义分桶键）。
 *
 * 此前 CLAUSE_KEYWORDS 只有 DISTINCT/AND/OR 这类平铺关键字，条件分支只能手打；
 * CASE 是官方文档明示的结构能力（"CASE can be used as a GROUP BY key …
 * custom bucketing"），且多行骨架靠记忆书写极易漏 END。
 *
 * 约定：
 *  - SELECT / WHERE / GROUP BY / HAVING / ORDER BY 五个词位都出 CASE WHEN；
 *  - 骨架走 snippet（占位符可跳转）；测试桩缺 InsertTextRule 时退化为字面插入不抛错；
 *  - 空前缀位仍先给字段（CASE 需敲 c/ca 前缀才出现，不抢首屏）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { ensureSqlCompletion, type SqlCompletionCtx } from '../utils/sqlCompletion';
import { __clearSuggestCache } from '../composables/useTermsSuggest';

type Provider = { provideCompletionItems: (m: any, p: any) => any };

function makeMonaco(withRule = false) {
  const providers: Record<string, Provider[]> = {};
  return {
    providers,
    api: {
      languages: {
        registerCompletionItemProvider: (_l: string, p: Provider) => {
          (providers[_l] ||= []).push(p);
          return { dispose: () => {} };
        },
        CompletionItemKind: { Field: 'Field', Property: 'Property', Value: 'Value', Keyword: 'Keyword', Function: 'Function', Snippet: 'Snippet' },
        ...(withRule ? { CompletionItemInsertTextRule: { InsertAsSnippet: 4 } } : {}),
      },
    },
  };
}
const FIELDS = [{ path: 'title', type: 'text' }, { path: 'region', type: 'keyword' }];
const ctx = (): SqlCompletionCtx => ({
  indices: () => [{ index: 'orders' }], pickedIdx: () => 'orders',
  curFields: () => FIELDS, ensureCurFields: () => {},
});
/* 尾部单词（provider 用 word.word 做前缀过滤/字段护栏） */
const model = (t: string) => {
  const w = (t.match(/[A-Za-z_]\w*$/) || [''])[0];
  return {
    getValue: () => t, getOffsetAt: () => t.length,
    getWordUntilPosition: () => ({ startColumn: t.length - w.length + 1, endColumn: t.length + 1, word: w }),
  };
};

describe('1143 CASE 表达式骨架', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => { __clearSuggestCache(); vi.restoreAllMocks(); });

  it.each([
    'SELECT ca',
    'SELECT * FROM orders WHERE ca',
    'SELECT region, ca FROM orders GROUP BY ca',
    'SELECT region FROM orders GROUP BY region HAVING ca',
    'SELECT * FROM orders ORDER BY ca',
  ])('%s → 出 CASE WHEN 骨架（含 END，骨架无占位符缺失）', async (sql) => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctx);
    try {
      const r: any = await m.providers.sql[m.providers.sql.length - 1]!.provideCompletionItems(model(sql), { lineNumber: 1 });
      const item = (r.suggestions as any[]).find(s => String(s.label).includes('CASE'));
      expect(item, `${sql} 应出 CASE 候选`).toBeTruthy();
      expect(item.insertText).toContain('CASE');
      expect(item.insertText).toContain('END');
      expect(item.insertText).toContain('WHEN');
      expect(String(item.detail)).toContain('分桶');
    } finally { h.dispose(); }
  });

  it('有 InsertTextRule 时走 snippet；测试桩缺失时退化为字面插入不抛错', async () => {
    const withRule = makeMonaco(true);
    const h1 = ensureSqlCompletion(withRule.api as any, ctx);
    const r1: any = await withRule.providers.sql[withRule.providers.sql.length - 1]!.provideCompletionItems(model('SELECT ca'), { lineNumber: 1 });
    expect(r1.suggestions.find((s: any) => String(s.label).includes('CASE')).insertTextRules).toBe(4);
    h1.dispose();

    const noRule = makeMonaco(false);
    const h2 = ensureSqlCompletion(noRule.api as any, ctx);
    const r2: any = await noRule.providers.sql[noRule.providers.sql.length - 1]!.provideCompletionItems(model('SELECT ca'), { lineNumber: 1 });
    const item = r2.suggestions.find((s: any) => String(s.label).includes('CASE'));
    expect(item.insertTextRules).toBeUndefined();
    expect(item.insertText).toContain('CASE');
    h2.dispose();
  });

  it('空前缀位不倾倒 CASE（该位先给字段）', async () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctx);
    try {
      const r: any = await m.providers.sql[m.providers.sql.length - 1]!.provideCompletionItems(model('SELECT '), { lineNumber: 1 });
      expect((r.suggestions as any[]).some(s => String(s.label).includes('CASE'))).toBe(false);
      expect((r.suggestions as any[]).some(s => String(s.label) === 'title')).toBe(true);
    } finally { h.dispose(); }
  });
});
