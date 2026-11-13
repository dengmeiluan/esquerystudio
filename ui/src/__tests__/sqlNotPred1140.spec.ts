/**
 * 一千一百四十批：SQL 值位补全的 NOT 前缀谓词（col NOT IN / NOT LIKE / NOT BETWEEN）。
 *
 * 病根：值位主正则只认正向操作符，`NOT` 留在 LHS 尾 → 列名左扫取到 "NOT"，
 * 类型分派必落空（keyword 不出 terms 候选、date 不出 date-math 档）。
 * 修订：主正则前置可选 `NOT\s+` 一并吃掉；IN 列表第 2+ 项支路把 NOT 留在 LHS，
 * 统一剥尾一次。正向逐字零漂移（同表同列同候选）。
 *
 * stub 范式照 hintWave557 C 段（monaco 最小 fake + pinia + api spy）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { ensureSqlCompletion, type SqlCompletionCtx } from '../utils/sqlCompletion';
import { api } from '../api';
import { __clearSuggestCache } from '../composables/useTermsSuggest';

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
        CompletionItemKind: { Field: 'Field', Property: 'Property', Value: 'Value' },
      },
    },
  };
}

const ALL_FIELDS = [
  { path: 'name', type: 'keyword' },
  { path: 'created', type: 'date' },
  { path: 'amount', type: 'double' },
  { path: 'code', type: 'wildcard' },
  { path: 'note', type: 'text' },
];

function makeCtx(): () => SqlCompletionCtx {
  return () => ({
    indices: () => [{ index: 'orders' }],
    pickedIdx: () => 'orders',
    curFields: () => ALL_FIELDS,
    ensureCurFields: () => {},
  });
}
function fakeSqlModel(text: string) {
  return {
    getValue: () => text,
    getOffsetAt: () => text.length,
    getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1, word: '' }),
  };
}
function sqlProvider(m: ReturnType<typeof makeMonaco>): Provider {
  const arr = m.providers.sql;
  expect(arr, 'sql 语言 provider 必须已注册').toBeTruthy();
  return arr![arr!.length - 1];
}

describe('1140：NOT 前缀谓词值位补全', () => {
  beforeEach(() => { setActivePinia(createPinia()); });
  afterEach(() => { __clearSuggestCache(); vi.restoreAllMocks(); });

  it("NOT IN 首项：col NOT IN ('ac␣ → keyword terms 候选（detail 带 name）", async () => {
    vi.useFakeTimers();
    const m = makeMonaco();
    const spy = vi.spyOn(api, 'searchRaw').mockResolvedValue({
      aggregations: { suggest: { buckets: [{ key: 'act' }, { key: 'active' }] } },
    });
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      const before = "SELECT * FROM orders WHERE name NOT IN ('ac";
      const p = sqlProvider(m).provideCompletionItems(fakeSqlModel(before), { lineNumber: 1 });
      await vi.advanceTimersByTimeAsync(10);
      const r = await p;
      expect(spy).toHaveBeenCalledTimes(1);
      expect((r.suggestions as any[]).map(s => s.label)).toEqual(['act', 'active']);
      expect(String(r.suggestions[0].detail)).toContain('name');
    } finally { h.dispose(); vi.useRealTimers(); }
  });

  it("NOT IN 第 2 项：col NOT IN ('a', 'ac␣ → 走 IN 尾项支路且 LHS 剥掉 NOT", async () => {
    vi.useFakeTimers();
    const m = makeMonaco();
    const spy = vi.spyOn(api, 'searchRaw').mockResolvedValue({
      aggregations: { suggest: { buckets: [{ key: 'act' }] } },
    });
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      const before = "SELECT * FROM orders WHERE name NOT IN ('a', 'ac";
      const p = sqlProvider(m).provideCompletionItems(fakeSqlModel(before), { lineNumber: 1 });
      await vi.advanceTimersByTimeAsync(10);
      const r = await p;
      expect(spy, '列名必须还原成 name（NOT 不作列名）').toHaveBeenCalledTimes(1);
      expect((r.suggestions as any[]).map(s => s.label)).toEqual(['act']);
      expect(String(r.suggestions[0].detail)).toContain('name');
    } finally { h.dispose(); vi.useRealTimers(); }
  });

  it('NOT IN 第 2 项 date 列双形态前缀 + 第 3 项：静态档零请求', () => {
    const m = makeMonaco();
    const spy = vi.spyOn(api, 'searchRaw');
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      const cases = [
        "SELECT * FROM orders WHERE created NOT IN ('2026-01-01', '2026-",
        "SELECT * FROM orders WHERE created NOT IN ('2026-01-01', '2026-02-02', '",
      ];
      for (const before of cases) {
        const r: any = sqlProvider(m).provideCompletionItems(fakeSqlModel(before), { lineNumber: 1 });
        expect((r.suggestions as any[]).map(s => s.label), before).toEqual(['now-1d/d', 'now-1h/h']);
        expect(String(r.suggestions[0].detail), before).toContain('date');
      }
      expect(spy, '静态档零请求').not.toHaveBeenCalled();
    } finally { h.dispose(); }
  });

  it("NOT LIKE 'pref␣ → wildcard 列通配格式档（列名还原）", () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      const r: any = sqlProvider(m).provideCompletionItems(
        fakeSqlModel("SELECT * FROM orders WHERE code NOT LIKE 'pref"), { lineNumber: 1 });
      expect((r.suggestions as any[]).map(s => s.label)).toEqual(['pref%']);
      expect(String(r.suggestions[0].detail)).toContain('wildcard');
    } finally { h.dispose(); }
  });

  it('NOT BETWEEN 数值列 → 区间形态 10 AND 20（正向 BETWEEN 逐字零漂移）', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      const neg: any = sqlProvider(m).provideCompletionItems(
        fakeSqlModel('SELECT * FROM orders WHERE amount NOT BETWEEN '), { lineNumber: 1 });
      expect((neg.suggestions as any[]).map(s => s.label)).toEqual(['10 AND 20']);
      const pos: any = sqlProvider(m).provideCompletionItems(
        fakeSqlModel('SELECT * FROM orders WHERE amount BETWEEN '), { lineNumber: 1 });
      expect((pos.suggestions as any[]).map(s => s.label)).toEqual(['10 AND 20']);
    } finally { h.dispose(); }
  });

  it('正向谓词零漂移：= / IN 首项 / IN 第 2 项 / LIKE 候选与 detail 不变', async () => {
    vi.useFakeTimers();
    const m = makeMonaco();
    vi.spyOn(api, 'searchRaw').mockResolvedValue({
      aggregations: { suggest: { buckets: [{ key: 'act' }, { key: 'active' }] } },
    });
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      const cases = [
        "SELECT * FROM orders WHERE name = 'ac",
        "SELECT * FROM orders WHERE name IN ('ac",
        "SELECT * FROM orders WHERE name IN ('a', 'ac",
      ];
      for (const before of cases) {
        const p = sqlProvider(m).provideCompletionItems(fakeSqlModel(before), { lineNumber: 1 });
        await vi.advanceTimersByTimeAsync(10);
        const r = await p;
        const labels = (r.suggestions as any[]).map(s => s.label);
        expect(labels.every((l: string) => l === 'act' || l === 'active'), before).toBe(true);
        expect(labels.length, before).toBeGreaterThan(0);
      }
      const dt: any = sqlProvider(m).provideCompletionItems(
        fakeSqlModel("SELECT * FROM orders WHERE created = '2026-"), { lineNumber: 1 });
      expect((dt.suggestions as any[]).map(s => s.label)).toEqual(['now-1d/d', 'now-1h/h']);
    } finally { h.dispose(); vi.useRealTimers(); }
  });

  it('未知列 NOT IN → 零候选（宁缺勿错口径不变）', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      const r: any = sqlProvider(m).provideCompletionItems(
        fakeSqlModel("SELECT * FROM orders WHERE nope NOT IN ('a', 'x"), { lineNumber: 1 });
      expect(r.suggestions).toEqual([]);
    } finally { h.dispose(); }
  });
});
