/**
 * 1170：字段候选的「路径段感知」排序（智能字段匹配的实查缺口）。
 *
 * 实测生产命名（`bond_code` / `encode_flag` / `publisher.org_name` / `publish_date`）：
 * 修复前只比整串 rank，于是——
 *   输入 `code`  → `bond_code`（尾段正好是 code）与 `encode_flag`（en·code 仅段内子串）
 *                 同档，按字母序排，`encode_flag` 反而更靠前；
 *   输入 `publish` → `publisher.org_name`（另一个词根）排在 `publish_date` 前。
 * 用户拿到的是「像但不对」的候选，得逐个读全名，正是「字段自动匹配不智能」的体感来源。
 *
 * 锁：段边界（`.` 与 `_`）上的**整段命中**优先于段内子串；单段路径不参与分段分，
 * 维持既有「精确 > 前缀 > 包含，同级字母序」口径（顶层字段不得被嵌套路径压过）。
 */
import { describe, it, expect } from 'vitest';
import { searchFields } from '../fieldSearch';

const FIELDS = [
  { path: 'issuer_name', type: 'keyword' },
  { path: 'bond_code', type: 'keyword' },
  { path: 'encode_flag', type: 'keyword' },
  { path: 'pub_code', type: 'keyword' },
  { path: 'publish_code_x', type: 'keyword' },
  { path: 'publish_date', type: 'date' },
  { path: 'publishTime', type: 'date' },
  { path: 'publisher.org_name', type: 'keyword' },
  { path: 'publisher.org_code', type: 'keyword' },
  { path: 'comments.text', type: 'text' },
] as any;

const order = (q: string) => searchFields({ fields: FIELDS, query: q }).flat.map(h => h.path);

describe('1170 字段候选段感知排序', () => {
  it('输入 code：整段命中（bond_code/pub_code）全部排在段内子串（encode_flag）之前', () => {
    const o = order('code');
    const enc = o.indexOf('encode_flag');
    expect(enc).toBeGreaterThan(-1);
    for (const want of ['bond_code', 'pub_code', 'publisher.org_code']) {
      expect(o.indexOf(want), `${want} 必须压过 encode_flag`).toBeLessThan(enc);
    }
    /* 反向：修复前 encode_flag 因字母序排第一 */
    expect(o[0]).not.toBe('encode_flag');
  });

  it('输入 publish：publish* 前缀族排在 publisher.* 之前（不同词根不得抢先）', () => {
    const o = order('publish');
    const firstPublisher = Math.min(o.indexOf('publisher.org_name'), o.indexOf('publisher.org_code'));
    for (const want of ['publish_date', 'publishTime', 'publish_code_x']) {
      expect(o.indexOf(want), `${want} 必须排在 publisher.* 之前`).toBeLessThan(firstPublisher);
    }
  });

  it('尾段整段命中优先于首段子串：org → publisher.org_*（org 是尾段前缀）', () => {
    expect(order('org')).toEqual(['publisher.org_code', 'publisher.org_name']);
  });

  it('单段路径不吃分段分：name 仍维持「精确 > 前缀 > 包含」旧口径', () => {
    const o = order('name');
    expect(o[0]).toBe('issuer_name'); /* 尾段整段命中，压过嵌套的 org_name？——不，issuer_name 也命中尾段 */
    expect(o.indexOf('publisher.org_name')).toBeGreaterThan(0);
  });

  it('空查询：不引入任何分段偏置，保持原字母序', () => {
    const o = order('');
    expect(o).toEqual([...FIELDS.map((f: any) => f.path)].sort((a, b) => a.localeCompare(b)));
  });

  it('反向对照：段感知必须真的改变相对次序（关掉即与字母序一致）', () => {
    /* 旧口径下这四个「含 code」字段同档 rank=2，纯粹字母序：
       bond_code < encode_flag < pub_code < publish_code_x。
       段感知把「整段命中」的 bond_code/pub_code/… 提上来，且 publisher 尾段命中
       排在 publish_code_x（仅首段前缀命中）之前——两条次序都与纯字母序不同。
       若段感知被误删，排序会退回纯字母序，本断言即红。 */
    const kw = 'code';
    const legacyRank = (n: string) => n.toLowerCase() === kw ? 0 : n.toLowerCase().startsWith(kw) ? 1 : 2;
    const legacy = FIELDS
      .filter((f: any) => f.path.toLowerCase().includes(kw))
      .sort((a: any, b: any) => legacyRank(a.path) - legacyRank(b.path) || a.path.localeCompare(b.path))
      .map((f: any) => f.path);
    const now = order('code');
    expect(now).not.toEqual(legacy);
    /* 最强的区分点：encode_flag 在旧口径排第 2，新口径沉到最后 */
    expect(legacy.indexOf('encode_flag')).toBe(1);
    expect(now.indexOf('encode_flag')).toBe(now.length - 1);
  });
});
