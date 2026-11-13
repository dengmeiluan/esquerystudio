/**
 * 五百一十九批：矩阵复制内核（RT copySelRows 格式化平移泛化 + copyRegionTsv TSV 分支同源合并）。
 * 锁定：TSV 表头行+制表符矩阵+单元格内换行制表折空格；MD 表头/分隔行/竖线转义；
 * JSON jsonRow 钩子（RT 行复制 _id+全文档语义）与缺省按列构造（缺值补 null）。
 * 值域样例与 rtRegionSelect/rtCellDetail 既有剪贴板行为锁同值（防两实现漂移）。
 */
import { describe, it, expect } from 'vitest';
import { matrixTsv, matrixMd, matrixJson, matrixText } from '../utils/copyMatrix';

interface Row { id: string; src: Record<string, unknown> }
const rows: Row[] = [
  { id: 'a', src: { name: 'banana', age: 2 } },
  { id: 'b', src: { name: 'apple', age: 3 } },
];
const opts = {
  rows,
  cols: ['name', 'age'],
  getVal: (r: Row, c: string) => r.src[c],
};

describe('copyMatrix（五百一十九批）', () => {
  it('TSV：表头行+矩形值（与 RT 框选复制既有锁同值）', () => {
    expect(matrixTsv(opts)).toBe('name\tage\nbanana\t2\napple\t3');
  });

  it('TSV：单元格内 \\t \\r \\n 折空格、null/undefined 空串、对象 JSON', () => {
    const rs: { id: string; src: Record<string, unknown> }[] = [
      { id: 'x', src: { v: 'a\tb\nc\rd' } },
      { id: 'y', src: { v: null } },
      { id: 'z', src: { v: { k: 1 } } },
    ];
    expect(matrixTsv({ rows: rs, cols: ['v'], getVal: (r, c) => r.src[c] }))
      .toBe('v\na b c d\n\n{"k":1}');
  });

  it('MD：表头+分隔行+| 转义（与 RT copySelRows md 口径一致）', () => {
    expect(matrixMd(opts)).toBe([
      '| name | age |',
      '| --- | --- |',
      '| banana | 2 |',
      '| apple | 3 |',
    ].join('\n'));
    const rs: { id: string; src: Record<string, unknown> }[] = [{ id: 'x', src: { v: 'a|b' } }];
    expect(matrixMd({ rows: rs, cols: ['v'], getVal: (r, c) => r.src[c] })).toContain('a\\|b');
  });

  it('JSON：jsonRow 钩子保留 RT 行复制 _id+全文档语义；缺省按列构造缺值补 null', () => {
    const hooked = matrixJson({ ...opts, jsonRow: r => ({ _id: r.id, ...r.src }) });
    expect(JSON.parse(hooked)).toEqual([
      { _id: 'a', name: 'banana', age: 2 },
      { _id: 'b', name: 'apple', age: 3 },
    ]);
    const def = matrixJson({ rows, cols: ['name', 'miss'], getVal: (r, c) => r.src[c] });
    expect(JSON.parse(def)).toEqual([
      { name: 'banana', miss: null },
      { name: 'apple', miss: null },
    ]);
  });

  it('matrixText 按格式分发', () => {
    expect(matrixText(opts, 'tsv')).toBe(matrixTsv(opts));
    expect(matrixText(opts, 'md')).toBe(matrixMd(opts));
    expect(matrixText(opts, 'json')).toBe(matrixJson(opts));
  });
});
