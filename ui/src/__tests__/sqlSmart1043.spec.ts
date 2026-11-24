/* 1043 批：SQL 智能化盲区双补——①聚合函数族补全（SELECT 词位按前缀出
   COUNT/AVG/SUM/MIN/MAX 候选，插文本带左括号直落列参数位；此前聚合词只能
   盲打词表兜底）；②UnknownColumn 智能纠错（ES-SQL verification_exception
   「Unknown column [typo]」错误面板给 editDistance 相近字段 chips，一键替换
   SQL 中的列名——列名敲错是 SQL 高频错误，此前只报错不给建议）。 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureSqlCompletion, suggestColumnsFor, type SqlCompletionCtx } from '../utils/sqlCompletion';
import { __clearSuggestCache } from '../composables/useTermsSuggest';

type Provider = { provideCompletionItems: (model: any, position: any, context?: any, token?: any) => any };

function makeMonaco() {
  const providers: Record<string, Provider[]> = {};
  const api = {
    languages: {
      registerCompletionItemProvider: (_lang: string, p: Provider) => {
        (providers[_lang] ||= []).push(p);
        return { dispose: () => {} };
      },
      CompletionItemKind: { Field: 'Field', Property: 'Property', Value: 'Value' },
    },
  };
  return { api, providers };
}

const ALL_FIELDS = [
  { path: 'name', type: 'keyword' },
  { path: 'amount', type: 'double' },
  { path: 'created', type: 'date' },
  { path: 'title', type: 'text' },
];

function makeCtx(over: Partial<SqlCompletionCtx> = {}): SqlCompletionCtx {
  return {
    indices: () => [{ index: 'orders' }],
    pickedIdx: () => 'orders',
    curFields: () => ALL_FIELDS,
    ensureCurFields: () => {},
    ...over,
  };
}
function ctxFn(over: Partial<SqlCompletionCtx> = {}): () => SqlCompletionCtx {
  return () => makeCtx(over);
}
function fakeModel(text: string, offset: number, word = '') {
  return {
    getValue: () => text,
    getOffsetAt: () => offset,
    getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1 + word.length, word }),
  };
}
function sqlProvider(monaco: ReturnType<typeof makeMonaco>): Provider {
  const arr = monaco.providers.sql;
  expect(arr, 'sql 语言 provider 必须已注册').toBeTruthy();
  return arr[0];
}

const srcOf = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

/* ensureSqlCompletion 是模块级单例（provider 只注册一份）——本文件全部测试共享
   同一 monaco fake（在首个用例内注册一次），后续用例复用同一 provider。 */
const shared = (() => {
  const monaco = makeMonaco();
  return { monaco, provider: null as Provider | null };
})();
function sharedProvider(): Provider {
  if (!shared.provider) ensureSqlCompletion(shared.monaco.api as any, ctxFn());
  return sqlProvider(shared.monaco);
}

describe('1043 聚合函数族补全', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    __clearSuggestCache();
    vi.restoreAllMocks();
  });
  it('SELECT 词位：空前缀出聚合函数候选（插文本带左括号）', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ values: [] }), { status: 200 }))));
    const p = sharedProvider();
    const text = 'SELECT  FROM "orders"';
    const r = await p.provideCompletionItems(fakeModel(text, 7, ''), { lineNumber: 1 }, null, null);
    const labels = (r.suggestions || []).map((s: any) => s.label);
    expect(labels, '聚合函数候选在场').toEqual(expect.arrayContaining(['COUNT(', 'AVG(', 'SUM(', 'MIN(', 'MAX(']));
    vi.unstubAllGlobals();
  });
  it('前缀过滤：敲 cou 只出 COUNT', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ values: [] }), { status: 200 }))));
    const p = sharedProvider();
    const text = 'SELECT cou FROM "orders"';
    const r = await p.provideCompletionItems(fakeModel(text, 10, 'cou'), { lineNumber: 1 }, null, null);
    const labels = (r.suggestions || []).map((s: any) => s.label);
    expect(labels).toContain('COUNT(');
    expect(labels, '前缀不匹配的聚合函数不出现').not.toContain('AVG(');
    vi.unstubAllGlobals();
  });
});

describe('1043 UnknownColumn 智能纠错', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    __clearSuggestCache();
  });
  it('错误文本解析列名 + editDistance 相近字段建议', () => {
    const r = suggestColumnsFor(
      'ES 400 ... verification_exception ... Unknown column [amnt]',
      ALL_FIELDS.map(f => ({ path: f.path, type: f.type })),
    );
    expect(r, '解析出列名').toBeTruthy();
    expect(r!.col).toBe('amnt');
    expect(r!.suggestions[0].path, '相近字段首位').toBe('amount');
  });
  it('无 UnknownColumn 字样返回 null（零扰动）', () => {
    expect(suggestColumnsFor('some other error', [{ path: 'a', type: 'keyword' }])).toBeNull();
  });
  it('SqlConsoleView 错误面板挂接纠错 chips（源码锁）', () => {
    const src = srcOf('views/SqlConsoleView.vue');
    expect(src).toContain('suggestColumnsFor');
    expect(src).toContain('applyColFix');
  });
});
