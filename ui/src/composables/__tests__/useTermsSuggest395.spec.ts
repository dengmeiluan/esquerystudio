/**
 * 三百九十五批：useTermsSuggest 行为级单测——W2 值建议内核（terms agg top20，
 * 300ms 防抖+序号守卫+TTL 缓存+前缀转义），作者预留 __clearSuggestCache 测试钩子
 * 但 spec 缺位。五契约：空参早退复位/防抖后请求与 bucket 提取/序号守卫丢弃旧响应/
 * 缓存命中不二次请求/prefix 元字符转义进 include。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useTermsSuggest, __clearSuggestCache } from '../useTermsSuggest';
import { api } from '../../api';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return { ...actual, api: { ...actual.api, searchRaw: vi.fn() } };
});

const searchRaw = vi.mocked(api.searchRaw);

beforeEach(() => {
  setActivePinia(createPinia());
  __clearSuggestCache();
  searchRaw.mockReset();
  vi.useFakeTimers();
});

afterEach(() => { vi.useRealTimers(); });

describe('useTermsSuggest 行为契约（395 批）', () => {
  it('空索引/空字段早退：不发请求、复位 suggesting', async () => {
    const s = useTermsSuggest(() => '');
    s.suggest('status', 'a');
    expect(s.suggesting.value, '防抖窗内已置位（548 A4 起步置位）').toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRaw).not.toHaveBeenCalled();
    expect(s.suggesting.value, '早退即 false').toBe(false);
    expect(s.suggestions.value).toEqual([]);
  });

  it('防抖后请求：bucket 提取 top20、suggesting 生命周期', async () => {
    searchRaw.mockResolvedValue({
      aggregations: { suggest: { buckets: [{ key: 'A' }, { key: 'B' }, { key: 'C' }] } },
    });
    const s = useTermsSuggest(() => 'idx-1');
    s.suggest('status', '');
    /* 548 锁随迁：防抖起步置位立法（A4）——原契约「防抖窗内未标记 false」废止，
       改为「防抖窗内已标记 true、早退即 false」双态断言（早退态见上一用例） */
    expect(s.suggesting.value, '防抖窗内已标记').toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRaw).toHaveBeenCalledTimes(1);
    const body = JSON.parse(searchRaw.mock.calls[0][1] as string);
    expect(body.aggs.suggest.terms.field).toBe('status');
    expect(body.aggs.suggest.terms.include, '空前缀省略 include').toBeUndefined();
    expect(s.suggestions.value).toEqual(['A', 'B', 'C']);
    expect(s.suggesting.value, '完成后复位').toBe(false);
  });

  it('序号守卫：连续两次 suggest，旧响应丢弃不写回', async () => {
    searchRaw.mockImplementation((_idx: string, body: string) =>
      Promise.resolve({ aggregations: { suggest: { buckets: [{ key: body.includes('fieldA') ? 'OLD' : 'NEW' }] } } }));
    const s = useTermsSuggest(() => 'idx-1');
    s.suggest('fieldA', '');
    await vi.advanceTimersByTimeAsync(100);
    s.suggest('fieldB', '');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRaw, '旧定时器被清，只发最新一次').toHaveBeenCalledTimes(1);
    expect(s.suggestions.value).toEqual(['NEW']);
  });

  it('缓存：同参数命中不二次请求；prefix 元字符转义进 include', async () => {
    searchRaw.mockResolvedValue({ aggregations: { suggest: { buckets: [{ key: 'X(1)' }] } } });
    const s = useTermsSuggest(() => 'idx-1');
    s.suggest('status', 'X(');
    await vi.advanceTimersByTimeAsync(300);
    const body = JSON.parse(searchRaw.mock.calls[0][1] as string);
    expect(body.aggs.suggest.terms.include).toBe('X\\(.*');
    s.suggest('status', 'X(');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRaw, 'TTL 内命中缓存不重发').toHaveBeenCalledTimes(1);
    expect(s.suggestions.value).toEqual(['X(1)']);
  });
});
