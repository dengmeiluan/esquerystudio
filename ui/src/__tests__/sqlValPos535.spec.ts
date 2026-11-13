/**
 * 535 批 W1（轨1 智能提示残面）：sqlCompletion 值位/词位扩容回归。
 *  R1 词位上下文加权：③ 平铺字段按左扫最近子句键给类型置顶序（候选集不变仅提供序分档）；
 *  R2 值位扩容：比较符族（= <> != >= <= > < IN( LIKE BETWEEN）+ 非 keyword 已知类型静态格式候选；
 *  R3 值位异步化：provider 返回 Promise 首轮即出；context.token 取消弃迟到回填；缓存命中零网络。
 * monaco 最小 fake（sqlCompletionW2 同款）；pinia 预置（useTermsSuggest 内部依赖）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { ensureSqlCompletion, type SqlCompletionCtx } from '../utils/sqlCompletion';
import { api } from '../api';
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
  { path: 'flag', type: 'boolean' },
  { path: 'ip', type: 'ip' },
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
  return arr![arr!.length - 1];
}

beforeEach(() => { setActivePinia(createPinia()); });

/* ═══ R1：③ 平铺字段词位上下文加权（候选集不变，仅提供序分档） ═══ */
describe('535 R1：③ 词位上下文加权', () => {
  /* 551 同步更新：A3 Promise 化——③ 词位 provider 返回 Promise（④ keyword 档先例），
     断言 await 后取回填；try/finally 保 dispose（防断言抛错泄漏模块级单例殃及后续用例注册） */
  const labelsOf = (r: any) => (r.suggestions as any[]).map(s => s.label);

  it('ORDER BY 位：date+数值族置前（range 同表），其余殿后', async () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    try {
      const before = 'SELECT * FROM orders ORDER BY ';
      const r = await sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
      expect(labelsOf(r)).toEqual(['created', 'amount', 'flag', 'ip', 'name', 'title']);
    } finally { h.dispose(); }
  });

  it('WHERE / GROUP BY / HAVING 位：keyword 置前（term 同表）', async () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    try {
      for (const tail of ['WHERE ', 'GROUP BY ', 'HAVING ']) {
        const before = 'SELECT * FROM orders ' + tail;
        const r = await sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
        expect(labelsOf(r), tail).toEqual(['name', 'amount', 'created', 'flag', 'ip', 'title']);
      }
    } finally { h.dispose(); }
  });

  it('SELECT / LIMIT 位：零倾向原 rank 序（回归零扰动）', async () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    try {
      /* 1043 随迁：SELECT 位前置聚合函数候选（新增加法层，字段 rank 序零倾向语义不变）；LIMIT 位维持纯字段 */
      for (const [before, expected] of [
        ['SELECT ', ['COUNT(', 'AVG(', 'SUM(', 'MIN(', 'MAX(', 'KURTOSIS(', 'MAD(', 'PERCENTILE(', 'PERCENTILE_RANK(', 'SKEWNESS(', 'STDDEV_POP(', 'STDDEV_SAMP(', 'SUM_OF_SQUARES(', 'VAR_POP(', 'VAR_SAMP(', 'amount', 'created', 'flag', 'ip', 'name', 'title']],
        ['SELECT name FROM orders LIMIT ', ['amount', 'created', 'flag', 'ip', 'name', 'title']],
      ] as Array<[string, string[]]>) {
        const r = await sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
        expect(labelsOf(r), before).toEqual(expected);
      }
    } finally { h.dispose(); }
  });
});

/* ═══ R2：值位比较符族 + 非 keyword 已知类型静态格式候选 ═══ */
describe('535 R2：值位扩容', () => {
  it('比较符族全谱识别值位（keyword 列走 suggest）；= 原样保留为回归基线', async () => {
    vi.useFakeTimers();
    const m = makeMonaco();
    let h: { dispose(): void } | null = null;
    try {
      const spy = vi.spyOn(api, 'searchRaw').mockResolvedValue({
        aggregations: { suggest: { buckets: [{ key: 'act' }, { key: 'active' }] } },
      });
      h = ensureSqlCompletion(m.api as any, ctxFn());
      const forms = [
        "= 'a", "<> 'a", "!= 'a", ">= 'a", "<= 'a", "> 'a", "< 'a",
        "IN ('a", "LIKE 'a", "BETWEEN 'a", '> a' /* 裸词无引号 */,
      ];
      for (const [i, form] of forms.entries()) {
        __clearSuggestCache();
        spy.mockClear();
        const before = 'SELECT * FROM orders WHERE name ' + form;
        const p = sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
        await vi.advanceTimersByTimeAsync(10);
        const r = await p;
        expect(spy, 'form #' + i + ' ' + form).toHaveBeenCalledTimes(1);
        expect((r.suggestions as any[]).map(s => s.label), 'form #' + i + ' ' + form).toEqual(['act', 'active']);
      }
    } finally {
      h?.dispose();
      vi.useRealTimers();
      vi.restoreAllMocks();
      __clearSuggestCache();
    }
  });

  it('date 列值位：date-math 静态提示（同步快返零请求）；boolean/ip/数值族字面提示', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    const spy = vi.spyOn(api, 'searchRaw');
    try {
      const cases: Array<[string, string[], string]> = [
        ["SELECT * FROM orders WHERE created >= '", ['now-1d/d', 'now-1h/h'], 'date'],
        ['SELECT * FROM orders WHERE flag = ', ['true', 'false'], 'boolean'],
        /* 551 同步更新：ip 档补 CIDR 形态档（LuceneInput IP_HINTS 姊妹面同批对齐），点分示例不动 */
        ['SELECT * FROM orders WHERE ip = ', ['192.168.0.1', '192.168.0.0/24'], 'ip'],
        ['SELECT * FROM orders WHERE amount = ', ['100'], 'double'],
      ];
      for (const [before, want, tag] of cases) {
        const r = sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
        expect((r.suggestions as any[]).map(s => s.label), tag).toEqual(want);
        expect(String(r.suggestions[0].detail), tag).toContain(tag);
        expect(r.suggestions[0].kind, tag).toBe('Value');
      }
      expect(spy, '静态候选零请求').not.toHaveBeenCalled();
    } finally { h.dispose(); vi.restoreAllMocks(); }
  });

  it('text / 列未知：值位零候选，不落 ③ 字段名候选', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    try {
      for (const before of ["SELECT * FROM orders WHERE title = 'x", "SELECT * FROM orders WHERE nope = 'x"]) {
        const r = sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
        expect(r.suggestions, before).toEqual([]);
      }
    } finally { h.dispose(); }
  });
});

/* ═══ R3：值位异步 provider（首轮即出 + token 取消 + 缓存快返） ═══ */
describe('535 R3：值位候选首轮时延根治', () => {
  const before = "SELECT * FROM orders WHERE name = 'ac";

  it('context.token 取消：弃迟到回填（请求照发，回填口零候选）', async () => {
    vi.useFakeTimers();
    const m = makeMonaco();
    let h: { dispose(): void } | null = null;
    try {
      const spy = vi.spyOn(api, 'searchRaw').mockResolvedValue({
        aggregations: { suggest: { buckets: [{ key: 'act' }] } },
      });
      h = ensureSqlCompletion(m.api as any, ctxFn());
      const p = sqlProvider(m).provideCompletionItems(
        fakeModel(before, before.length), { lineNumber: 1 }, undefined, { isCancellationRequested: true });
      await vi.advanceTimersByTimeAsync(10);
      const r = await p;
      expect(spy).toHaveBeenCalledTimes(1);
      expect(r.suggestions, '取消后不得回填旧会话候选').toEqual([]);
    } finally {
      h?.dispose();
      vi.useRealTimers();
      vi.restoreAllMocks();
      __clearSuggestCache();
    }
  });

  it('缓存命中：二轮一拍快返零网络；token 缺省（undefined）不误伤', async () => {
    vi.useFakeTimers();
    const m = makeMonaco();
    let h: { dispose(): void } | null = null;
    try {
      const spy = vi.spyOn(api, 'searchRaw').mockResolvedValue({
        aggregations: { suggest: { buckets: [{ key: 'act' }, { key: 'active' }] } },
      });
      h = ensureSqlCompletion(m.api as any, ctxFn());
      /* 首轮：token 形参加位但值 undefined（旧调用方兼容口径） */
      const p1 = sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 }, undefined, undefined);
      await vi.advanceTimersByTimeAsync(10);
      const r1 = await p1;
      expect(spy).toHaveBeenCalledTimes(1);
      expect((r1.suggestions as any[]).map(s => s.label)).toEqual(['act', 'active']);
      /* 二轮同前缀：缓存命中，零新增请求 */
      const p2 = sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
      await vi.advanceTimersByTimeAsync(10);
      const r2 = await p2;
      expect(spy).toHaveBeenCalledTimes(1);
      expect((r2.suggestions as any[]).map(s => s.label)).toEqual(['act', 'active']);
    } finally {
      h?.dispose();
      vi.useRealTimers();
      vi.restoreAllMocks();
      __clearSuggestCache();
    }
  });
});
