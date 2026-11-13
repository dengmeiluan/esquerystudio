/**
 * 四百七十二批：useIndexFields 行为单测——W1 字段元数据中心（FieldPicker/Lucene
 * 输入/Monaco 补全统一消费），作者预留 __clearFieldCache 测试钩子但直测缺位。
 * 五契约：空索引早退/嵌套 properties 递归拍平（multi-fields 展开）+排序/
 * 缓存命中不二次请求/竞态守卫（切换索引后旧响应静默丢弃）/失败零降级置 loadErr。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useIndexFields, __clearFieldCache } from '../useIndexFields';
import { api } from '../../api';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return { ...actual, api: { ...actual.api, mappingDetail: vi.fn() } };
});

const mappingDetail = vi.mocked(api.mappingDetail);

beforeEach(() => {
  setActivePinia(createPinia());
  __clearFieldCache();
  mappingDetail.mockReset();
});

describe('useIndexFields 行为契约（487 批）', () => {
  it('空索引早退：不发请求、清空字段', async () => {
    const f = useIndexFields(() => '');
    await f.ensure();
    expect(mappingDetail).not.toHaveBeenCalled();
    expect(f.fields.value).toEqual([]);
    expect(f.loadErr.value).toBe('');
  });

  it('mapping 拍平：嵌套 properties 递归+multi-fields 子字段+路径排序', async () => {
    mappingDetail.mockResolvedValue({
      raw: { properties: {
        title: { type: 'text', fields: { kw: { type: 'keyword' } } },
        meta: { properties: { created: { type: 'date' } } },
      } },
    });
    const f = useIndexFields(() => 'idx-1');
    await f.ensure();
    const paths = f.fields.value.map(x => x.path);
    expect(paths).toContain('title');
    expect(paths).toContain('title.kw');
    expect(paths).toContain('meta.created');
    expect(paths).toContain('meta');
    const sorted = [...paths].sort();
    expect(paths).toEqual(sorted);
  });

  it('缓存命中：同索引二次 ensure 不二次请求', async () => {
    mappingDetail.mockResolvedValue({ raw: { properties: { a: { type: 'keyword' } } } });
    const f = useIndexFields(() => 'idx-2');
    await f.ensure();
    await f.ensure();
    expect(mappingDetail).toHaveBeenCalledTimes(1);
  });

  it('竞态守卫：切换索引后旧响应静默丢弃，不污染新索引字段', async () => {
    let resolveA: (v: any) => void = () => {};
    mappingDetail.mockImplementation((idx: string) => idx === 'slow'
      ? new Promise(r => { resolveA = r; })
      : Promise.resolve({ raw: { properties: { fast: { type: 'keyword' } } } }));
    let idx = 'slow';
    const f = useIndexFields(() => idx);
    const p1 = f.ensure(); // slow 请求在飞
    idx = 'fast';
    const p2 = f.ensure();
    await p2;
    resolveA({ raw: { properties: { slowField: { type: 'text' } } } });
    await p1;
    await Promise.resolve();
    expect(f.fields.value.map(x => x.path), '旧 slow 响应不回写').toEqual(['fast']);
  });

  it('失败零降级：loadErr 置位，调用方可退化手输', async () => {
    mappingDetail.mockRejectedValue(new Error('boom'));
    const f = useIndexFields(() => 'idx-err');
    await f.ensure();
    expect(f.loadErr.value).toContain('boom');
    expect(f.loading.value).toBe(false);
  });
});
