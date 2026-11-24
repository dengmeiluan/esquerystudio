/**
 * 四百七十四批：useIndexFieldTypes 行为直测——QRT 双层列头类型徽标数据源
 * （171 批 IndexHub 收编为 composable）。四契约：空索引清空/多形态响应回退
 * （raw.properties → body.properties → 单索引值内 properties）/只取顶层叶子
 * （object 容器不进）/切索引竞态（seq 守卫丢弃过期响应）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ref, nextTick } from 'vue';
import { useIndexFieldTypes } from '../useIndexFieldTypes';
import { api } from '../../api';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return { ...actual, api: { ...actual.api, mappingDetail: vi.fn() } };
});

const mappingDetail = vi.mocked(api.mappingDetail);

beforeEach(() => {
  setActivePinia(createPinia());
  mappingDetail.mockReset();
});

describe('useIndexFieldTypes 行为契约（474 批）', () => {
  it('空索引清空且不发请求', async () => {
    const idx = ref('');
    const f = useIndexFieldTypes(idx);
    await nextTick();
    expect(mappingDetail).not.toHaveBeenCalled();
    expect(f.value).toEqual({});
  });

  it('raw.properties 主形态：只取顶层叶子，object 容器不进', async () => {
    mappingDetail.mockResolvedValue({
      raw: { properties: {
        title: { type: 'text' },
        meta: { properties: { created: { type: 'date' } } },
      } },
    });
    const idx = ref('idx-1');
    const f = useIndexFieldTypes(idx);
    await nextTick();
    await vi.waitFor(() => { if (!Object.keys(f.value).length) throw new Error('pending'); });
    expect(f.value, 'object 容器无 type 键不进（与扁平 _source 键一致）').toEqual({ title: 'text' });
  });

  it('旧形态回退：body.properties 与单索引值内 properties', async () => {
    mappingDetail.mockResolvedValueOnce({ mappings: { properties: { a: { type: 'keyword' } } } });
    mappingDetail.mockResolvedValueOnce({ myIdx: { mappings: { properties: { b: { type: 'long' } } } } });
    const f1 = useIndexFieldTypes(ref('i1'));
    await nextTick();
    await vi.waitFor(() => { if (!Object.keys(f1.value).length) throw new Error('pending'); });
    expect(f1.value).toEqual({ a: 'keyword' });
  });

  it('切索引竞态：seq 守卫丢弃过期响应', async () => {
    let resolveSlow: (v: any) => void = () => {};
    mappingDetail.mockImplementation((idx: string) => idx === 'slow'
      ? new Promise(r => { resolveSlow = r; })
      : Promise.resolve({ raw: { properties: { fast: { type: 'keyword' } } } }));
    const idx = ref('slow');
    const f = useIndexFieldTypes(idx);
    await nextTick();
    idx.value = 'fast';
    await nextTick();
    await vi.waitFor(() => { if (!Object.keys(f.value).length) throw new Error('pending'); });
    expect(f.value).toEqual({ fast: 'keyword' });
    resolveSlow({ raw: { properties: { slowField: { type: 'text' } } } });
    await nextTick();
    expect(f.value, '过期响应不回写').toEqual({ fast: 'keyword' });
  });
});
