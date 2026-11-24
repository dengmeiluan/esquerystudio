/**
 * 一千四百三十六批：表头排序闸门矩阵——哪些列该可排、哪些该被拦。
 *
 * 用户在表头点排序却「点了没反应」和「被标红」一样伤信任。闸门由
 * `sortableGuard = typeTierSuppressed`（类型黑名单 ∪ 元字段名）驱动，
 * 外加 `remoteSortBlocked`（远端档再走 resolveSortField 做 mapping 裁决）。
 *
 * 本批锁三件事：
 *  ① ES 可排序的类型（keyword/数值/date/boolean/ip/date_nanos/constant_keyword…）必须放行；
 *  ② 真正不可排序的类型（geo_point/nested/dense_vector/completion…）必须拦；
 *  ③ 元字段只拦 _source，_id/_index/_score/_seq_no 必须放行（它们排序有语义）。
 */
import { describe, it, expect } from 'vitest';
import { sortableGuard } from '../composables/tableSort';
import { isMetaNonBusinessField, typeTierSuppressed } from '../utils/semanticGuard';

/* 用 fieldTypes 字典模拟宿主下发；未登记的列回落按值采样（不抑制） */
function guardWith(types: Record<string, string>) {
  return sortableGuard(col => types[col]);
}

const SORTABLE: Array<[string, string]> = [
  ['keyword 列', 'keyword'],
  ['constant_keyword 列', 'constant_keyword'],
  ['wildcard 列', 'wildcard'],
  ['long 列', 'long'],
  ['integer 列', 'integer'],
  ['short 列', 'short'],
  ['byte 列', 'byte'],
  ['double 列', 'double'],
  ['float 列', 'float'],
  ['half_float 列', 'half_float'],
  ['scaled_float 列', 'scaled_float'],
  ['unsigned_long 列', 'unsigned_long'],
  ['date 列', 'date'],
  ['date_nanos 列', 'date_nanos'],
  ['boolean 列', 'boolean'],
  ['ip 列', 'ip'],
  ['token_count 列', 'token_count'],
];

const UNSORTABLE: Array<[string, string]> = [
  ['geo_point 列', 'geo_point'],
  ['geo_shape 列', 'geo_shape'],
  ['nested 列', 'nested'],
  ['object 列', 'object'],
  ['dense_vector 列', 'dense_vector'],
  ['sparse_vector 列', 'sparse_vector'],
  ['completion 列', 'completion'],
  ['histogram 列', 'histogram'],
  ['binary 列', 'binary'],
  ['flattened 列', 'flattened'],
  ['join 列', 'join'],
  ['percolator 列', 'percolator'],
  ['ip_range 列', 'ip_range'],
];

describe('1436 表头排序闸门矩阵', () => {
  it('① ES 可排序类型全部放行（点了没反应=误拦）', () => {
    const blocked = SORTABLE.filter(([, t]) => !guardWith({ c: t })('c')).map(([label]) => label);
    expect(blocked, '被误拦的可排序列：' + blocked.join(',')).toEqual([]);
  });

  it('② 真正不可排序的类型必须拦（放行=点下去发注定 400 的请求）', () => {
    const passed = UNSORTABLE.filter(([, t]) => guardWith({ c: t })('c')).map(([label]) => label);
    expect(passed, '应拦却放行：' + passed.join(',')).toEqual([]);
  });

  it('③ 元字段：只拦 _source，_id/_index/_score/_seq_no 放行', () => {
    expect(isMetaNonBusinessField('_source'), '_source 无可排序值').toBe(true);
    for (const f of ['_id', '_index', '_score', '_seq_no', '_doc']) {
      expect(isMetaNonBusinessField(f), f + ' 排序有语义，不得抑制').toBe(false);
    }
    /* 端到端：不带类型时元字段也应按名判定 */
    const g = guardWith({});
    expect(g('_source')).toBe(false);
    expect(g('_id')).toBe(true);
    expect(g('_score')).toBe(true);
    expect(g('_index')).toBe(true);
  });

  it('④ 未登记类型/业务列不抑制（宁缺勿错：不确定就放行，交 ES unmapped_type 兜底）', () => {
    const g = guardWith({});
    expect(g('business_source'), '带 source 词根的业务列不得被 _source 档误伤').toBe(true);
    expect(g('any_unknown_col')).toBe(true);
    /* 负控：把名字换回 _source，同样字典下必须被拦 */
    expect(g('_source')).toBe(false);
  });

  it('⑤ 闸门本体就是 typeTierSuppressed 单源（不另造判定）', () => {
    const t: Record<string, string> = { g: 'geo_point', k: 'keyword', s: '_source' };
    const g = sortableGuard(c => t[c]);
    for (const c of Object.keys(t)) {
      expect(g(c), c + ' 与单源判定不一致').toBe(!typeTierSuppressed(c, t[c]));
    }
  });
});
