/**
 * W2 批：SQL 补全单例（utils/sqlCompletion.ts）——原 SqlBridgeView 内联 provider 抽出，
 * SqlConsoleView 同享。锁三件事：
 *  ① 引用计数防重复注册：两使用方先后 ensure 只注册一份；最后一个 dispose 才注销；
 *  ② 全量释放后再 ensure 可复活（重进页面语义）；
 *  ③ 三类上下文候选不变（FROM 表名位=索引候选 / 限定列位=该表字段 / 词位=当前索引字段）。
 *
 * monaco 用最小 fake（registerCompletionItemProvider 捕获入档）；ctx 用静态闭包；
 * ② 限定列位链路的 useIndexFields 依赖 pinia store——setActivePinia 预置。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { ensureSqlCompletion, type SqlCompletionCtx } from '../sqlCompletion';
import { api } from '../../api';
import { __clearSuggestCache } from '../../composables/useTermsSuggest';
import { __clearFieldCache } from '../../composables/useIndexFields';

type Provider = { triggerCharacters?: string[]; provideCompletionItems: (model: any, position: any) => any };

function makeMonaco() {
  const providers: Record<string, Provider[]> = {};
  const api = {
    languages: {
      registerCompletionItemProvider: (_lang: string, p: Provider) => {
        (providers[_lang] ||= []).push(p);
        return { dispose: () => { const arr = providers[_lang]!; const i = arr.indexOf(p); if (i >= 0) arr.splice(i, 1); } };
      },
      CompletionItemKind: { Field: 'Field', Property: 'Property', Value: 'Value' },
    },
  };
  return { api, providers };
}

function makeCtx(over: Partial<SqlCompletionCtx> = {}): SqlCompletionCtx {
  return {
    indices: () => [{ index: 'orders' }, { index: 'users' }],
    pickedIdx: () => 'orders',
    curFields: () => [{ path: 'orderNo', type: 'keyword' }, { path: 'amount', type: 'double' }],
    ensureCurFields: () => {},
    ...over,
  };
}

function fakeModel(text: string, offset: number, word = '') {
  return {
    getValue: () => text,
    getOffsetAt: () => offset,
    getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1 + word.length, word }),
  };
}

/** getCtx 是「返回上下文的函数」——统一包一层箭头 */
function ctxFn(over: Partial<SqlCompletionCtx> = {}): () => SqlCompletionCtx {
  return () => makeCtx(over);
}

function sqlProvider(monaco: ReturnType<typeof makeMonaco>): Provider {
  const arr = monaco.providers.sql;
  expect(arr, 'sql 语言 provider 必须已注册').toBeTruthy();
  return arr![arr!.length - 1];
}

beforeEach(() => { setActivePinia(createPinia()); });

describe('W2 批：SQL 补全单例（引用计数）', () => {
  it('两使用方先后 ensure 只注册一份；最后一个 dispose 才注销', () => {
    const m = makeMonaco();
    const h1 = ensureSqlCompletion(m.api as any, ctxFn());
    expect(m.providers.sql!.length, '首次 ensure 注册一份').toBe(1);
    const h2 = ensureSqlCompletion(m.api as any, ctxFn());
    expect(m.providers.sql!.length, '二次 ensure 不重复注册').toBe(1);
    h1.dispose();
    expect(m.providers.sql!.length, '还有持有时不注销').toBe(1);
    h2.dispose();
    expect(m.providers.sql!.length, '最后一个 dispose 才真正注销').toBe(0);
  });

  it('全量释放后再 ensure 复活；triggerCharacters 保持 ["."]', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    h.dispose();
    const h2 = ensureSqlCompletion(m.api as any, ctxFn());
    expect(m.providers.sql!.length).toBe(1);
    expect(sqlProvider(m).triggerCharacters).toEqual(['.']);
    h2.dispose();
  });

  it('① FROM 表名位 → ctx.indices() 索引名候选（detail=ES-SQL 表名）', () => {
    const m = makeMonaco();
    const ensureCalls: number[] = [];
    const h = ensureSqlCompletion(m.api as any, ctxFn({ ensureCurFields: () => { ensureCalls.push(1); } }));
    const r = sqlProvider(m).provideCompletionItems(
      fakeModel('SELECT * FROM "', 16), { lineNumber: 1 });
    expect(r.suggestions.map((s: any) => s.label)).toEqual(['orders', 'users']);
    expect(r.suggestions[0].detail).toBe('索引（ES-SQL 表名）');
    expect(ensureCalls.length, '表名位不触发词位字段预载').toBe(0);
    h.dispose();
  });

  it('③ 其余词位 → ctx.curFields() 字段候选 + pickedIdx detail；ensureCurFields 被预载', async () => {
    const m = makeMonaco();
    let ensured = 0;
    const h = ensureSqlCompletion(m.api as any, ctxFn({ ensureCurFields: () => { ensured++; } }));
    /* 551 随迁：A3 Promise 化——③ 词位 provider await ensureCurFields 到位后回填（④ keyword 档
       先例），「预载」语义保持：回填口执行前 ensureCurFields 恰被调用一次。
       dispose 放 finally：中途断言失败也不泄漏模块级引用计数（provider 单例连锁打红下个用例） */
    try {
      const r = await sqlProvider(m).provideCompletionItems(
        fakeModel('SELECT o', 9, 'o'), { lineNumber: 1 });
      expect(r.suggestions.map((s: any) => s.label)).toEqual(['orderNo', 'amount']);
      expect(r.suggestions[1].detail).toContain('当前索引 orders');
      expect(ensured, '词位必须预载字段（await 到位后回填，回填前恰调一次）').toBe(1);
    } finally { h.dispose(); }
  });

  it('② 限定列位 tbl.col → 单例内部表名位字段源（首轮 await ensure 即出候选，不炸）', async () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    /* mappingDetail spy：await 路径需确定性数据源（真 api 会打网络） */
    const mappingSpy = vi.spyOn(api, 'mappingDetail').mockResolvedValue({ raw: { properties: { na: { type: 'keyword' } } } });
    try {
      /* 551 随迁：A3 Promise 化——表名位字段源 ensure 由 fire-and-forget 改 await（④ keyword 档
         先例）：首轮字段到位即出候选，不再空过一轮等下次触发；mapping 请求失败仍零候选不炸
         （useIndexFields 失败静默 catch），原「无缓存不炸」意图保持 */
      const r = await sqlProvider(m).provideCompletionItems(
        fakeModel('SELECT u.na FROM users u', 11, 'na'), { lineNumber: 1 });
      expect(r.suggestions.map((s: any) => s.label)).toEqual(['na']);
      expect(String(r.suggestions[0].detail)).toContain('来自 u');
    } finally {
      h.dispose();
      mappingSpy.mockRestore();
      __clearFieldCache(); /* tblCtx 模块级字段缓存（key 含表名），防串下个用例 */
    }
  });
});

/* 533 批：① FROM 位连字符修复 + ④ keyword 列值位候选（useTermsSuggest 出口） */
describe('533 批：① 连字符索引 FROM 候选 + ④ 值位候选', () => {
  beforeEach(() => { setActivePinia(createPinia()); __clearSuggestCache(); });

  it('① 修复回归：连字符/点分索引名在 FROM 位可候选（\\w 不含 -/. 旧失配落错分支）', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn({
      indices: () => [{ index: 'logs-2026.01' }, { index: 'orders' }],
    }));
    const r = sqlProvider(m).provideCompletionItems(
      fakeModel('SELECT * FROM logs-', 19), { lineNumber: 1 });
    /* 旧正则 (\w*)$ 在 'logs-' 处失配 → 修前落 ③ 词位分支出字段候选；修后出索引名候选 */
    expect(r.suggestions.map((s: any) => s.label)).toEqual(['logs-2026.01']);
    expect(r.suggestions[0].detail).toBe('索引（ES-SQL 表名）');
    h.dispose();
  });

  it('④ keyword 列值位候选（535 R3：provider 异步化，首轮即出）', async () => {
    vi.useFakeTimers();
    /* dispose 放 finally：中途断言失败也不泄漏模块级引用计数（provider 单例连锁打红下个用例） */
    const m = makeMonaco();
    let h: { dispose(): void } | null = null;
    try {
      const spy = vi.spyOn(api, 'searchRaw').mockResolvedValue({
        aggregations: { suggest: { buckets: [{ key: 'act' }, { key: 'active' }] } },
      });
      h = ensureSqlCompletion(m.api as any, ctxFn({
        pickedIdx: () => 'orders',
        curFields: () => [{ path: 'status', type: 'keyword' }, { path: 'amount', type: 'double' }],
      }));
      const before = "SELECT * FROM orders WHERE status = 'ac";
      /* 首轮触发：provider 返回 Promise，await 防抖(0ms)+searchRaw 兑现后即出候选（535 R3 语义反转：
         旧口径首轮零候选等下次触发；新口径首轮即出，token 缺省=未取消） */
      const p1 = sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
      await vi.advanceTimersByTimeAsync(10);
      const r1 = await p1;
      expect(spy).toHaveBeenCalledTimes(1);
      expect(r1.suggestions.map((s: any) => s.label)).toEqual(['act', 'active']);
      expect(String(r1.suggestions[0].detail)).toContain('keyword');
      /* 二轮同前缀：缓存命中一拍快返，零新增请求 */
      const p2 = sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
      await vi.advanceTimersByTimeAsync(10);
      const r2 = await p2;
      expect(spy).toHaveBeenCalledTimes(1);
      expect(r2.suggestions.map((s: any) => s.label)).toEqual(['act', 'active']);
    } finally {
      h?.dispose();
      vi.useRealTimers();
      vi.restoreAllMocks();
      __clearSuggestCache();
    }
  });

  it('④ 非 keyword 已知类型（double）值位出静态格式候选（535 R2），不落 ③ 字段名候选', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn({
      pickedIdx: () => 'orders',
      curFields: () => [{ path: 'status', type: 'keyword' }, { path: 'amount', type: 'double' }],
    }));
    try {
      const before = 'SELECT * FROM orders WHERE amount = 1';
      const r = sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
      const labels = r.suggestions.map((s: any) => s.label);
      expect(labels.length, 'double 出静态候选（数值示例）').toBeGreaterThan(0);
      expect(labels, '静态候选不含字段名').not.toContain('amount');
      expect(labels).not.toContain('status');
      expect(String(r.suggestions[0].detail)).toContain('double');
    } finally { h.dispose(); }
  });
});
