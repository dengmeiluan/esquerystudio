/**
 * 五百四十五批 W1（轨1 智能提示与高亮·剩余盲区清零）：SQL 值位 wildcard 档 + 数值族九口径对齐。
 *
 *  A SQL 值位 wildcard 类型档：sqlCompletion VAL_FORMAT_HINTS 补 wildcard → ['pref%']。
 *    证据链：① SqlBridgeView 对照表「⚠ LIKE % ↔ wildcard/fuzzy DSL」——SQL 侧通配形态是 %
 *    （LIKE 语法），不平移 DSL 姊妹表的 'pref*'（那是 Lucene wildcard 语法）；② 姊妹表
 *    DSL_ARRAY_ELEM_TYPE_HINTS.wildcard（543）证 wildcard 字段类型档成立，本档是把同口径
 *    补到 SQL 值位。keyword 不入静态表（terms agg 动态候选专用）随手钉死防漂移。
 *  B 数值族九口径对齐：AFFINITY_FAMILIES.number 九种（dslCompletionContext「数值族九种
 *    （LuceneInput NUMERIC_TYPES 同表）」在册）vs queryAstOps 两处硬表只有八种——
 *    typePriorityForOp('range') 漏 unsigned_long（编辑器补全排序 orderFieldsByTypeForOp 与
 *    sqlCompletion ORDER BY 加权两条链随之漏置顶）、opsForType 漏 unsigned_long（builder
 *    算子下拉对 unsigned_long 字段只剩 exists，term/terms/range 全不推荐）。
 *
 * 纯函数 + monaco 最小 fake（sqlValPos535 同范式），零挂载。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { ensureSqlCompletion, VAL_FORMAT_HINTS, type SqlCompletionCtx } from '../utils/sqlCompletion';
import { typePriorityForOp, opsForType } from '../utils/queryAstOps';
import { dslFieldAffinityTypes, orderFieldsByTypeForOp } from '../utils/dslCompletionContext';
import { api } from '../api';

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
  { path: 'pat', type: 'wildcard' },
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
  return arr![arr!.length - 1];
}

beforeEach(() => { setActivePinia(createPinia()); });

/* ═══ A：SQL 值位 wildcard 类型档 ═══ */
describe('545 A：SQL 值位 wildcard 档（LIKE % 形态）', () => {
  it('= 与 LIKE 位都出 pref% 静态格式候选：零请求、detail 带类型名、kind=Value', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    const spy = vi.spyOn(api, 'searchRaw');
    try {
      for (const before of ["SELECT * FROM orders WHERE pat = 'p", "SELECT * FROM orders WHERE pat LIKE 'p"]) {
        const r = sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
        expect((r.suggestions as any[]).map(s => s.label), before).toEqual(['pref%']);
        expect(String(r.suggestions[0].detail), before).toContain('wildcard');
        expect(r.suggestions[0].kind, before).toBe('Value');
      }
      expect(spy, '静态档零请求').not.toHaveBeenCalled();
    } finally { h.dispose(); vi.restoreAllMocks(); }
  });

  it('已敲前缀不滤静态档（既有 date/boolean/ip 同口径）；text 列维持零候选压制', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    try {
      const r = sqlProvider(m).provideCompletionItems(
        fakeModel("SELECT * FROM orders WHERE pat = 'xyz", "SELECT * FROM orders WHERE pat = 'xyz".length), { lineNumber: 1 });
      expect((r.suggestions as any[]).map(s => s.label)).toEqual(['pref%']);
      const r2 = sqlProvider(m).provideCompletionItems(
        fakeModel("SELECT * FROM orders WHERE title = 'x", "SELECT * FROM orders WHERE title = 'x".length), { lineNumber: 1 });
      expect(r2.suggestions).toEqual([]);
    } finally { h.dispose(); }
  });

  it('表锁：wildcard 档定形；keyword 不入静态表（terms agg 动态候选专用）；既有档抽样零漂移', () => {
    expect(VAL_FORMAT_HINTS.wildcard).toEqual({ detail: 'LIKE 通配格式提示 · wildcard', values: ['pref%'] });
    expect(VAL_FORMAT_HINTS.keyword, 'keyword 走 terms agg 动态候选，不入静态表').toBeUndefined();
    expect(VAL_FORMAT_HINTS.date).toEqual({ detail: 'date-math 格式提示 · date', values: ['now-1d/d', 'now-1h/h'] });
    expect(VAL_FORMAT_HINTS.boolean).toEqual({ detail: '字面提示 · boolean', values: ['true', 'false'] });
    /* 551 同步更新：ip 档补 CIDR 形态档（LuceneInput IP_HINTS 姊妹面同批对齐）——detail 与点分示例不动 */
    expect(VAL_FORMAT_HINTS.ip).toEqual({ detail: '字面提示 · ip', values: ['192.168.0.1', '192.168.0.0/24'] });
    expect(VAL_FORMAT_HINTS.double).toEqual({ detail: '数值示例 · double', values: ['100'] });
  });
});

/* ═══ B：数值族九口径对齐（unsigned_long 补员） ═══ */
describe('545 B：unsigned_long 九族口径对齐', () => {
  it('typePriorityForOp(range)：date 置顶 + 数值族九种（补 unsigned_long，既有八种次序零变动）', () => {
    /* 548 锁同步更新：range 序补 date_nanos（紧跟 date 位置，opsForType date 分支并档同批约定）；
       原契约意图保持——date 族置顶、数值族九种相对次序零变动 */
    expect(typePriorityForOp('range')).toEqual([
      'date', 'date_nanos', 'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'unsigned_long',
    ]);
  });

  it('亲和展开链 dslFieldAffinityTypes(range) 含 unsigned_long（builder 字段候选置顶链愈合）', () => {
    expect(dslFieldAffinityTypes('range')).toContain('unsigned_long');
    expect(dslFieldAffinityTypes('range')[0]).toBe('date');
  });

  it('编辑器补全排序 orderFieldsByTypeForOp(range)：unsigned_long 字段随数值族置前（wildcard 不沾光）', () => {
    const fields = [
      { path: 'title', type: 'text' },
      { path: 'u', type: 'unsigned_long' },
      { path: 'created', type: 'date' },
      { path: 'name', type: 'keyword' },
    ];
    const out = orderFieldsByTypeForOp(fields, 'range');
    expect(out.map(f => f.path)).toEqual(['created', 'u', 'title', 'name']);
  });

  it('opsForType(unsigned_long)：数值算子族 term/terms/range/exists 全推荐（不再是孤 exists）', () => {
    expect(opsForType('unsigned_long')).toEqual(['term', 'terms', 'range', 'exists']);
  });
});
