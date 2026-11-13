/**
 * 1439：NDJSON 行键 lint（_msearch 头行 / _bulk 动作行）。
 *
 * 补全只在键位给目录，写错时仍需立刻说清楚：头行写了 indxe、动作行写了 indx，
 * ES 直接拒绝整行。nth 必须按 anchor 在全文中的同名键出现次数计——
 * 查询体/文档行里出现同名键时，后续头行的 marker 才能落到正确那一处。
 */
import { describe, it, expect } from 'vitest';
import { lintNdjsonLineKeys } from '../utils/dslLint';

describe('1439 NDJSON 行键 lint', () => {
  it('msearch：合法头行零输出；拼错给最近键；文档键中的同名键参与 nth', () => {
    expect(lintNdjsonLineKeys('{"index":"a"}\n{"query":{"indxe":1}}', 'msearch')).toEqual([]);
    const f = lintNdjsonLineKeys('{"indxe":"a"}\n{"query":{}}', 'msearch');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ rule: 'ndjson-line-key', severity: 'warning', anchor: 'indxe', nth: 0 });
    expect(f[0].message).toContain('_msearch 头行');
    expect(f[0].message).toContain('最接近：index');
    /* 体行里先出现同名键 → 第三行（第二个头行）犯错时 nth=1 */
    const dup = lintNdjsonLineKeys('{"index":"a"}\n{"indxe":1}\n{"indxe":"b"}\n{"query":{}}', 'msearch');
    expect(dup).toHaveLength(1);
    expect(dup[0].nth).toBe(1);
  });

  it('bulk：动作行拼错告警；文档行键不判；delete 后一行仍是动作行', () => {
    expect(lintNdjsonLineKeys('{"index":{"_index":"a"}}\n{"foo":1}', 'bulk')).toEqual([]);
    const one = lintNdjsonLineKeys('{"indx":{"_index":"a"}}', 'bulk');
    expect(one).toHaveLength(1);
    expect(one[0].message).toContain('批量动作行');
    expect(one[0].message).toContain('最接近：index');
    expect(lintNdjsonLineKeys('{"delete":{"_index":"a"}}\n{"index":{"_index":"b"}}', 'bulk')).toEqual([]);
    /* 文档行里的同名键先计数：第三行动作拼错的 nth=1 */
    const dup = lintNdjsonLineKeys('{"index":{"_index":"a"}}\n{"indxe":1}\n{"indxe":{}}', 'bulk');
    expect(dup).toHaveLength(1);
    expect(dup[0].nth).toBe(1);
  });

  it('负控：非 JSON 行/空体零输出', () => {
    expect(lintNdjsonLineKeys('', 'msearch')).toEqual([]);
    expect(lintNdjsonLineKeys('{bad}\n{"query":{}}', 'msearch')).toEqual([]);
  });
});
