/* 1044 批：语句摘要条 date-math 人话化——1041 时间窗快选写入的 now-N 锚
   （now-7d/d/now-30d/d/now-90d/d/now-1y/y/now/y）在摘要条出人话（近7天/近30天/
   近90天/近一年/今年），时间窗心智从 builder 到摘要贯穿；非 date-math 值
   （绝对日期/数值）原样。querySentence 纯函数零 AST 关联。 */
import { describe, it, expect } from 'vitest';
import { buildQuerySentence } from '../utils/querySentence';

describe('1044 摘要条 date-math 人话化', () => {
  it('快选窗口锚出人话（近30天/今年）', () => {
    const tree: any = { root: { id: 'b0', type: 'bool', params: {}, arrForm: {}, children: [
      { occur: 'filter', node: { id: 'n1', type: 'leaf', op: 'range', field: 'pub_date', value: { gte: 'now-30d/d', lte: 'now' }, params: {}, raw: null } },
    ] } };
    const s = buildQuerySentence(tree as any);
    const text = s.query.map((p: any) => p.text).join('');
    expect(text).toContain('近30天');
    expect(text).not.toContain('now-30d/d');
    expect(text).not.toContain("≤ now'");
  });
  it('近7天/近90天/近一年/本周/本月全覆盖', () => {
    for (const [anchor, word] of [['now-7d/d', '近7天'], ['now-90d/d', '近90天'], ['now-1y/y', '近一年'], ['now/w', '本周'], ['now/M', '本月']] as Array<[string, string]>) {
      const tree: any = { root: { id: 'b0', type: 'bool', params: {}, arrForm: {}, children: [
        { occur: 'filter', node: { id: 'n1', type: 'leaf', op: 'range', field: 'pub_date', value: { gte: anchor }, params: {}, raw: null } },
      ] } };
      const s = buildQuerySentence(tree as any);
      const text = s.query.map((p: any) => p.text).join('');
      expect(text, anchor + ' → ' + word).toContain(word);
    }
  });
  it('绝对日期与数值原样（非锚值零扰动）', () => {
    const tree: any = { root: { id: 'b0', type: 'bool', params: {}, arrForm: {}, children: [
      { occur: 'filter', node: { id: 'n1', type: 'leaf', op: 'range', field: 'pub_date', value: { gte: '2026-01-01', lte: 100 }, params: {}, raw: null } },
    ] } };
    const s = buildQuerySentence(tree as any);
    const text = s.query.map((p: any) => p.text).join('');
    expect(text).toContain('2026-01-01');
    expect(text).toContain('100');
  });
});
