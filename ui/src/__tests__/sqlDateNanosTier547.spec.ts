/**
 * 547 批轨1：sqlCompletion VAL_FORMAT_HINTS 补 date_nanos 档。
 *
 * 基线事实：LuceneInput 值位已 7 档含 date_nanos（DATE_HINTS 复用），=SQL 侧对齐收口——
 * date_nanos 列值位此前落 VAL_FORMAT_HINTS 缺档 → 零候选，与 Lucene 侧不一致。
 * detail 文案形同 date 档（'date-math 格式提示 · date_nanos'），values 复用
 * ['now-1d/d','now-1h/h']（date-math 对 date_nanos 同样合法，epoch_nanos 精度不影响格式提示）。
 *
 * 照 sqlValPos535.spec 形态（monaco 最小 fake + pinia 预置）：
 *  - 正向：WHERE ts_nanos >= ' 值位出 date-math 候选（同步快返零请求）；
 *  - 回归抽样：date/boolean/ip/double 既有档零漂移；text/列未知零候选不回退；
 *  - 表锁：VAL_FORMAT_HINTS.date_nanos 定形；keyword 仍不入静态表（terms agg 动态候选专用）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { ensureSqlCompletion, VAL_FORMAT_HINTS, type SqlCompletionCtx } from '../utils/sqlCompletion';
import { api } from '../api';

type Provider = { provideCompletionItems: (model: any, position: any, context?: any, token?: any) => any };

function makeMonaco() {
  const providers: Record<string, Provider[]> = {};
  const apiObj = {
    languages: {
      registerCompletionItemProvider: (_lang: string, p: Provider) => {
        (providers[_lang] ||= []).push(p);
        return { dispose: () => {} };
      },
      CompletionItemKind: { Field: 'Field', Property: 'Property', Value: 'Value' },
    },
  };
  return { api: apiObj, providers };
}

const ALL_FIELDS = [
  { path: 'ts_nanos', type: 'date_nanos' },
  { path: 'created', type: 'date' },
  { path: 'amount', type: 'double' },
  { path: 'title', type: 'text' },
  { path: 'flag', type: 'boolean' },
  { path: 'ip', type: 'ip' },
];

function ctxFn(): () => SqlCompletionCtx {
  return () => ({
    indices: () => [{ index: 'orders' }],
    pickedIdx: () => 'orders',
    curFields: () => ALL_FIELDS,
    ensureCurFields: () => {},
  });
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

describe('547：date_nanos 档（SQL 侧与 LuceneInput 7 档对齐收口）', () => {
  it('date_nanos 列值位：WHERE ts_nanos >= \' 出 date-math 候选（detail 带 date_nanos，同步快返零请求）', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
    const spy = vi.spyOn(api, 'searchRaw');
    try {
      const before = "SELECT * FROM orders WHERE ts_nanos >= '";
      const r = sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
      const sug = r.suggestions as any[];
      expect(sug.map(s => s.label)).toEqual(['now-1d/d', 'now-1h/h']);
      expect(String(sug[0].detail)).toContain('date_nanos');
      expect(sug[0].kind).toBe('Value');
      expect(spy, '静态候选零请求').not.toHaveBeenCalled();
    } finally { h.dispose(); vi.restoreAllMocks(); }
  });

  it('既有档回归抽样：date/boolean/ip/double 零漂移；text/列未知零候选不回退', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, ctxFn());
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
      }
      for (const before of ["SELECT * FROM orders WHERE title = 'x", "SELECT * FROM orders WHERE nope = 'x"]) {
        const r = sqlProvider(m).provideCompletionItems(fakeModel(before, before.length), { lineNumber: 1 });
        expect(r.suggestions, before).toEqual([]);
      }
    } finally { h.dispose(); }
  });

  it('表锁：date_nanos 定形（detail 形同 date 档）；keyword 仍不入静态表（545 表锁零同步更新）', () => {
    expect(VAL_FORMAT_HINTS.date_nanos).toEqual({ detail: 'date-math 格式提示 · date_nanos', values: ['now-1d/d', 'now-1h/h'] });
    expect(VAL_FORMAT_HINTS.keyword, 'keyword 走 terms agg 动态候选，不入静态表').toBeUndefined();
    expect(VAL_FORMAT_HINTS.date).toEqual({ detail: 'date-math 格式提示 · date', values: ['now-1d/d', 'now-1h/h'] });
  });
});
