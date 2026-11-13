/**
 * 三百八十七批：useColFilters 行为级单测——229 批下沉的列值筛选内核（RT/QRT 双宿主），
 * 此前只有视图级源码锁。六契约：normVal 归一（null→'' 空集键/对象 JSON 化）/
 * filterVals 值内搜索与计数/基数降级（超限按计数取前 N+hasMore）/toggle 与整列清/
 * filterRows 多列 AND 管线/暗状态守卫（被隐藏列筛选自动清+onAutoClear 连带回调）。
 */
import { describe, it, expect } from 'vitest';
import { ref, nextTick } from 'vue';
import { useColFilters } from '../useColFilters';

const rows = [
  { name: 'alice', age: 30, tags: { a: 1 } },
  { name: 'bob', age: 25, tags: { a: 1 } },
  { name: 'alice', age: 35, tags: null },
];

function make() {
  return useColFilters({
    rows: () => rows,
    getVal: (r, c) => (r as any)[c],
    labelOf: (v: any) => (v == null ? '∅' : String(v)),
  });
}

describe('useColFilters 行为契约（387 批）', () => {
  it('normVal 归一：null/undefined → 空集键，对象 JSON 化', () => {
    const cf = make();
    expect(cf.normVal(null)).toBe('');
    expect(cf.normVal(undefined)).toBe('');
    expect(cf.normVal({ a: 1 })).toBe('{"a":1}');
  });

  it('filterVals：去重计数；kw 对 label/norm 双口径匹配', () => {
    const cf = make();
    const all = cf.filterVals('name');
    expect(all.total).toBe(2);
    expect(all.vals.find(v => v.v === 'alice')?.n).toBe(2);
    const hit = cf.filterVals('name', 'bo');
    expect(hit.vals).toHaveLength(1);
    expect(hit.vals[0].v).toBe('bob');
    expect(hit.total, 'total 是无 kw 全量基数，不受搜索词影响').toBe(2);
  });

  it('基数降级：超 maxUnique 按计数降序取前 N+hasMore', () => {
    // 10 行 hot（n=10）+260 个全异值 → 去重 261 > 200 触发降级
    const many = [
      ...Array.from({ length: 10 }, () => ({ v: 'hot' })),
      ...Array.from({ length: 260 }, (_, i) => ({ v: `u${i}` })),
    ];
    const cf = useColFilters({
      rows: () => many,
      getVal: (r, c) => (r as any)[c],
      labelOf: String,
    });
    const r = cf.filterVals('v', '', 200);
    expect(r.hasMore).toBe(true);
    expect(r.vals).toHaveLength(200);
    expect(r.vals[0].v, '高频值排最前').toBe('hot');
  });

  it('toggle 与清除：勾选再取消；filterRows 多列 AND；空选集不过滤', () => {
    const cf = make();
    cf.toggleFilterVal('name', 'alice');
    expect(cf.activeFilterCount.value).toBe(1);
    expect(cf.filterRows(rows)).toHaveLength(2);
    cf.toggleFilterVal('age', 30);
    expect(cf.filterRows(rows), 'name=alice AND age=30 → 1 行').toHaveLength(1);
    cf.toggleFilterVal('name', 'alice'); // 再点取消勾选
    expect(cf.filterRows(rows), 'name 列选集空=不过滤该列').toHaveLength(1);
    cf.clearFilter('age');
    expect(cf.activeFilterCount.value).toBe(0);
    cf.toggleFilterVal('name', 'bob');
    cf.clearAllFilters();
    expect(cf.filterRows(rows), '全清=原行集').toHaveLength(3);
  });

  it('暗状态守卫：列被隐藏后其筛选自动清+onAutoClear 连带回调', async () => {
    const cols = ref(['name', 'age']);
    let cleared = 0;
    const cf = useColFilters({
      rows: () => rows,
      getVal: (r, c) => (r as any)[c],
      labelOf: String,
      cols: () => cols.value,
      onAutoClear: () => { cleared++; },
    });
    cf.toggleFilterVal('age', 30);
    cf.toggleFilterVal('name', 'alice');
    cols.value = ['name']; // age 列被隐藏
    await nextTick(); // watch 回调微任务调度
    expect(cf.colFilters.value['age'], '被隐藏列筛选自动清').toBeUndefined();
    expect(cf.colFilters.value['name'], '可见列筛选保留').toBeDefined();
    expect(cleared).toBe(1);
  });
});
