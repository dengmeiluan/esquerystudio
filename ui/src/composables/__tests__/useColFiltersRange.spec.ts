/**
 * 五百二十批：useColFilters 类型感知区间过滤（col -> {min,max}，filterRows 尾部 AND 叠加）。
 * 锁定：区间命中（闭区间含端点）/单端与超界不命中/与等值勾选 AND 叠加/date ISO 文本
 * 与 epoch 数值双口径/空值一律不命中/clearFilter·clearAllFilters 连带清区间/
 * activeFilterCount 等值+区间并集计数/暗状态守卫连带清区间。
 */
import { describe, it, expect } from 'vitest';
import { ref, nextTick } from 'vue';
import { useColFilters } from '../useColFilters';

const rows = [
  { name: 'alice', age: 30, ts: '2024-01-01', ep: 1700000000000 },
  { name: 'bob', age: 25, ts: '2024-06-15', ep: 1600000000000 },
  { name: 'alice', age: 35, ts: '2023-12-31', ep: null },
];

function make(cols?: () => string[], onAutoClear?: () => void) {
  return useColFilters({
    rows: () => rows,
    getVal: (r: any, c: string) => r[c],
    labelOf: (v: any) => (v == null ? '∅' : String(v)),
    cols,
    onAutoClear,
  });
}

describe('useColFilters 区间过滤（五百二十批）', () => {
  it('数值区间命中：闭区间含端点；双端皆空不过滤', () => {
    const cf = make();
    cf.setRangeFilter('age', 'min', '26');
    cf.setRangeFilter('age', 'max', '35');
    expect(cf.filterRows(rows).map((r: any) => r.age)).toEqual([30, 35]);
    /* 单端：只有下界 */
    cf.setRangeFilter('age', 'max', '');
    expect(cf.filterRows(rows).map((r: any) => r.age)).toEqual([30, 35]);
    cf.setRangeFilter('age', 'min', '26');
    cf.setRangeFilter('age', 'max', '34');
    expect(cf.filterRows(rows).map((r: any) => r.age)).toEqual([30]);
    /* 端点空白串=该端不设限（rangeOn=false 时整列不过滤） */
    const cf2 = make();
    cf2.setRangeFilter('age', 'min', '');
    cf2.setRangeFilter('age', 'max', '');
    expect(cf2.filterRows(rows)).toHaveLength(3);
  });

  it('不命中：超界行被滤；空值行一律不命中（即使区间覆盖一切）', () => {
    const cf = make();
    cf.setRangeFilter('age', 'min', '36');
    expect(cf.filterRows(rows)).toHaveLength(0);
    /* 换列前清掉 age 区间（区间与等值同列叠加、跨列 AND） */
    cf.clearFilter('age');
    /* ep 列有 null 值：区间再宽也滤掉 null 行（区间语义=有值才可比） */
    cf.setRangeFilter('ep', 'min', '0');
    cf.setRangeFilter('ep', 'max', '9999999999999');
    expect(cf.filterRows(rows).map((r: any) => r.age)).toEqual([30, 25]);
  });

  it('与等值勾选 AND 叠加：勾 alice + age∈[26,34] → 只剩 age=30 的 alice', () => {
    const cf = make();
    cf.toggleFilterVal('name', 'alice');
    expect(cf.filterRows(rows)).toHaveLength(2);
    cf.setRangeFilter('age', 'min', '26');
    cf.setRangeFilter('age', 'max', '34');
    expect(cf.filterRows(rows).map((r: any) => r.age)).toEqual([30]);
  });

  it('date 文本区间（ISO 字符串值走时间戳比较）；数字优先口径对 epoch 数值生效', () => {
    const cf = make();
    cf.setRangeFilter('ts', 'min', '2024-01-01');
    expect(cf.filterRows(rows).map((r: any) => r.ts)).toEqual(['2024-01-01', '2024-06-15']);
    /* epoch 毫秒数值 × epoch 文本端点：Number 双方有限 → 数值比较（时区无关） */
    cf.setRangeFilter('ep', 'min', '1700000000000');
    cf.setRangeFilter('ep', 'max', '1700000000000');
    expect(cf.filterRows(rows).map((r: any) => r.age)).toEqual([30]);
    cf.setRangeFilter('ep', 'min', '1600000000000');
    cf.setRangeFilter('ep', 'max', '1700000000001');
    expect(cf.filterRows(rows).map((r: any) => r.age)).toEqual([30, 25]);
  });

  it('清空连带：clearFilter/clearAllFilters 一并清区间；activeFilterCount 并集计数', () => {
    const cf = make();
    cf.toggleFilterVal('name', 'alice');
    cf.setRangeFilter('age', 'min', '26');
    expect(cf.activeFilterCount.value).toBe(2);
    /* 同列等值+区间只算一次 */
    cf.toggleFilterVal('age', 30);
    expect(cf.activeFilterCount.value).toBe(2);
    cf.clearFilter('age');
    expect(cf.activeFilterCount.value).toBe(1);
    expect(cf.filterRows(rows)).toHaveLength(2);
    cf.clearAllFilters();
    expect(cf.activeFilterCount.value).toBe(0);
    expect(cf.filterRows(rows)).toHaveLength(3);
  });

  it('暗状态守卫：区间列被隐藏 → 区间连带清+onAutoClear 触发', async () => {
    const cols = ref(['name', 'age']);
    let cleared = 0;
    const cf = make(() => cols.value, () => { cleared++; });
    cf.setRangeFilter('age', 'min', '26');
    cols.value = ['name'];
    await nextTick();
    expect(cf.rangeFilters.value['age']).toBeUndefined();
    expect(cleared).toBe(1);
  });
});
