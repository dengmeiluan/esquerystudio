/**
 * 五百六十三批轨1：智能提示与排序·类型感知精化——
 *  A fieldSearch.valueHintsForType：字段类型 → 值位输入建议档（date 族优先 date 函数/
 *    now 族+范围语法，数值族优先范围算子，boolean 出字面量对，keyword/text 精确值语义
 *    无附加提示出空；token_count 与 opsForType 同口径排除，undefined/未知类型出空）。
 *  B fieldSearch.rankTermsByType：词项候选按字段类型精化排序（date 字段 ISO 形态排前、
 *    epoch 纯数字串殿后；数值字段数值形态排前；keyword/text 等原序零扰动=ES doc_count
 *    权威；纯函数不改入参数组；稳定排序同档保原序）。
 *  C useTermsSuggest 工厂可选第二参 types：响应到达后展示值经 rankTermsByType 精化
 *    （date 字段 ISO 排前）；不传 types 既有序零变（556 批「响应=suggestions 精确值」
 *    契约锁面不回退）；缓存/stash 存 ES 权威序（展示层精化不污染排序基准）。
 *  D useGridSearch 可选 colType：列类型感知第三遍——date 列日期分隔符归一（/ . 与 -
 *    互认，「2024/01/15」命中 kw「2024-01-15」）；既有 includes/数值归一两遍零回退；
 *    colType 未传零行为（229 批锁面不动）；文本 includes 命中优先，第三遍只兜底。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, defineComponent, h, type App } from 'vue';
import { createPinia } from 'pinia';

/* 只替换网络出口，composable/store 全用真的（suggestWave556 同款惰性包装防 TDZ） */
const searchRawFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api,
    searchRaw: (...a: any[]) => searchRawFn(...a),
    clusterIndices: () => Promise.resolve([]), overview: () => Promise.resolve({}),
    clusterHealth: () => Promise.resolve({}),
    setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
  } };
});

/* 动态导入（新导出在实施前不存在——undefined 呈红而非整文件载入崩，556 先例） */
const fsMod: any = await import('../utils/fieldSearch');

import { useTermsSuggest, __clearSuggestCache } from '../composables/useTermsSuggest';
import { useGridSearch } from '../composables/useGridSearch';

const apps: App[] = [];
function withSetup(index: () => string, types?: () => Record<string, string>) {
  let out!: ReturnType<typeof useTermsSuggest>;
  const Comp = defineComponent({ setup() { out = useTermsSuggest(index, types); return () => h('div'); } });
  const app = createApp(Comp);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  return out;
}

describe('五百六十三批 A：valueHintsForType 值位建议档', () => {
  it('date 族：now 函数族打头 + 范围语法，date_nanos 同档', () => {
    const hints = fsMod.valueHintsForType('date');
    expect(hints[0]).toBe('now');
    expect(hints).toContain('now-1d');
    expect(hints).toContain('>=');
    expect(hints).toContain('<=');
    expect(fsMod.valueHintsForType('date_nanos')).toEqual(hints);
  });

  it('数值族：范围算子全档；token_count 同 opsForType 口径排除出空', () => {
    expect(fsMod.valueHintsForType('long')).toEqual(['>=', '<=', '>', '<']);
    expect(fsMod.valueHintsForType('scaled_float')).toEqual(['>=', '<=', '>', '<']);
    expect(fsMod.valueHintsForType('token_count')).toEqual([]);
  });

  it('boolean 出字面量对；keyword/text/ip/undefined/未知类型出空（精确值语义无附加）', () => {
    expect(fsMod.valueHintsForType('boolean')).toEqual(['true', 'false']);
    expect(fsMod.valueHintsForType('keyword')).toEqual([]);
    expect(fsMod.valueHintsForType('text')).toEqual([]);
    expect(fsMod.valueHintsForType('ip')).toEqual([]);
    expect(fsMod.valueHintsForType(undefined)).toEqual([]);
    expect(fsMod.valueHintsForType('geo_point')).toEqual([]);
  });
});

describe('五百六十三批 B：rankTermsByType 词项候选类型精化', () => {
  it('date 字段：ISO 形态排前、epoch 纯数字串殿后、非日期串居中保序', () => {
    const out = fsMod.rankTermsByType(
      ['1700000000', 'abc', '2023-06-01T10:00:00', '1700000000000', '2024-01-15'],
      'date',
    );
    expect(out.slice(0, 2)).toEqual(['2023-06-01T10:00:00', '2024-01-15']);
    expect(out.slice(-2)).toEqual(['1700000000', '1700000000000']);
  });

  it('date_nanos 同档；date 字段同档内保 ES 原序（稳定排序）', () => {
    expect(fsMod.rankTermsByType(['2024-01-15', '2023-01-01'], 'date_nanos'))
      .toEqual(['2024-01-15', '2023-01-01']);
  });

  it('数值字段：数值形态排前、非数值殿后', () => {
    const out = fsMod.rankTermsByType(['abc', '123', 'def', '45.6'], 'long');
    expect(out.slice(0, 2)).toEqual(['123', '45.6']);
    expect(out.slice(-2)).toEqual(['abc', 'def']);
  });

  it('keyword/undefined：原序返回（ES doc_count 权威）；纯函数不改入参数组', () => {
    const src = ['b', 'a'];
    expect(fsMod.rankTermsByType(src, 'keyword')).toEqual(['b', 'a']);
    expect(fsMod.rankTermsByType(src, undefined)).toEqual(['b', 'a']);
    expect(src).toEqual(['b', 'a']);
    const iso = fsMod.rankTermsByType(['2024-01-15', '1700000000000'], 'date');
    expect(iso).not.toBe(iso.slice()); /* 返回新数组 */
  });
});

describe('五百六十三批 C：useTermsSuggest 可选 types 类型感知精化', () => {
  beforeEach(() => { vi.useFakeTimers(); __clearSuggestCache(); localStorage.clear(); searchRawFn.mockReset(); });
  afterEach(() => { vi.useRealTimers(); apps.forEach(a => a.unmount()); apps.length = 0; });

  it('传 types：date 字段响应 ISO 形态排前（展示值精化）', async () => {
    searchRawFn.mockResolvedValue({ aggregations: { suggest: { buckets: [
      { key: '1700000000000' }, { key: 'x-mid' }, { key: '2024-01-15' },
    ] } } });
    const s = withSetup(() => 'idx1', () => ({ dt: 'date' }));
    s.suggest('dt', '');
    await vi.advanceTimersByTimeAsync(400);
    expect(s.suggestions.value[0]).toBe('2024-01-15');
    expect(s.suggestions.value[s.suggestions.value.length - 1]).toBe('1700000000000');
  });

  it('不传 types：既有序零变（556 批「响应=精确值」契约不回退）', async () => {
    searchRawFn.mockResolvedValue({ aggregations: { suggest: { buckets: [
      { key: '1700000000000' }, { key: 'x-mid' }, { key: '2024-01-15' },
    ] } } });
    const s = withSetup(() => 'idx1');
    s.suggest('dt', '');
    await vi.advanceTimersByTimeAsync(400);
    expect(s.suggestions.value).toEqual(['1700000000000', 'x-mid', '2024-01-15']);
  });

  it('缓存命中同步段同样精化（second instance 同 key 零请求读缓存）', async () => {
    searchRawFn.mockResolvedValue({ aggregations: { suggest: { buckets: [
      { key: '1700000000000' }, { key: '2024-01-15' },
    ] } } });
    const s1 = withSetup(() => 'idx1', () => ({ dt: 'date' }));
    s1.suggest('dt', '');
    await vi.advanceTimersByTimeAsync(400);
    expect(s1.suggestions.value[0]).toBe('2024-01-15');
    /* 新实例同 key：同步段缓存命中（不再发网请求），回填同样精化 */
    const s2 = withSetup(() => 'idx1', () => ({ dt: 'date' }));
    s2.suggest('dt', '');
    expect(s2.suggestions.value[0]).toBe('2024-01-15');
    expect(searchRawFn).toHaveBeenCalledTimes(1);
  });
});

describe('五百六十三批 D：useGridSearch 可选 colType 列类型感知', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const TEXT = [['abc', '2024/01/15'], ['2024-01-15', '2024-01-16']];
  function make(colType?: (ci: number) => string | undefined) {
    return useGridSearch({
      rows: () => TEXT.length, cols: () => TEXT[0].length,
      getText: (ri, ci) => TEXT[ri][ci],
      ...(colType ? { colType } : {}),
    });
  }

  it('date 列：kw 半角连字符命中斜杠形态（分隔符归一）', async () => {
    const s = make(ci => (ci === 1 ? 'date' : undefined));
    s.kw.value = '2024-01-15';
    await vi.advanceTimersByTimeAsync(160);
    expect(s.matches.value).toContainEqual({ ri: 0, ci: 1 });
  });

  it('colType 未传：同 grid 同 kw 零命中（既有契约零回退）', async () => {
    const s = make();
    s.kw.value = '2024-01-15';
    await vi.advanceTimersByTimeAsync(160);
    expect(s.matches.value).toEqual([{ ri: 1, ci: 0 }]); /* 仅字面 includes 命中 */
  });

  it('文本 includes 优先：第二遍/第三遍只兜底，不重复计入', async () => {
    const s = make(ci => (ci === 1 ? 'date' : undefined));
    s.kw.value = '2024-01-16';
    await vi.advanceTimersByTimeAsync(160);
    expect(s.matches.value).toEqual([{ ri: 1, ci: 1 }]); /* 字面命中仅一格 */
  });
});
