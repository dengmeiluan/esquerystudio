/**
 * 1186：排序的特殊形态也要双向无损。
 *
 * 查询子句有 1181/1182 两条全目录锁，**排序侧一直没有**：生产里 `_geodistance`
 * （按距离排）、`_script`（相关性/公式排）、`_score`、`nested` 路径、`missing`
 * 五类写法都真在用。它们都写成「单键对象」或「裸字符串」，
 * 一旦被归一成普通字段排序，用户改一次参数就把原写法洗掉了。
 *
 * 实测：五类全部以 form='full' / 'str' 保真（params 原样带 nested/missing/unit…），
 * 写回逐字节相同。此前只是没有锁——这里把它钉住。
 */
import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree } from '../utils/queryAst';

const CASES: Array<{ name: string; body: any; field: string; form: 'str' | 'full' }> = [
  {
    name: '_geo_distance（按距离排）',
    body: { query: { match_all: {} }, sort: [{ _geo_distance: { location: { lat: 1, lon: 2 }, order: 'asc', unit: 'km' } }] },
    field: '_geo_distance', form: 'full',
  },
  {
    name: '_script（公式/相关性排）',
    body: { query: { match_all: {} }, sort: [{ _script: { type: 'number', script: { source: 'doc["x"].value' }, order: 'desc' } }] },
    field: '_script', form: 'full',
  },
  {
    name: 'nested 路径排序',
    body: { query: { match_all: {} }, sort: [{ 'comments.likes': { order: 'desc', nested: { path: 'comments' } } }] },
    field: 'comments.likes', form: 'full',
  },
  {
    name: '_score 裸字符串',
    body: { query: { match_all: {} }, sort: ['_score'] },
    field: '_score', form: 'str',
  },
  {
    name: 'missing=_last',
    body: { query: { match_all: {} }, sort: [{ pub: { order: 'asc', missing: '_last' } }] },
    field: 'pub', form: 'full',
  },
];

describe('1186 排序特殊形态双向无损', () => {
  it(`${CASES.length} 类排序写法保真且写回一致`, () => {
    const bad: string[] = [];
    for (const c of CASES) {
      const r = parseTree(c.body);
      if (!r.ok) { bad.push(c.name + '：解析失败 ' + (r as any).reason); continue; }
      const s = r.tree.sort?.[0];
      if (!s) { bad.push(c.name + '：排序项丢失'); continue; }
      if (s.field !== c.field) bad.push(`${c.name}：字段记成 ${s.field}`);
      if (s.form !== c.form) bad.push(`${c.name}：形态记成 ${s.form}（期望 ${c.form}）`);
      const back = serializeTree(r.tree);
      if (JSON.stringify(back) !== JSON.stringify(c.body)) bad.push(c.name + '：写回不一致 ' + JSON.stringify(back));
    }
    expect(bad, '\n' + bad.join('\n')).toEqual([]);
  });

  it('负控：普通字段排序仍按最简档记号（不会被上面的锁顺手升级）', () => {
    const body = { query: { match_all: {} }, sort: [{ title: 'asc' }] };
    const r = parseTree(body);
    expect(r.ok).toBe(true);
    if (r.ok) {
      /* 单键 + 方向字符串 = short；带 order 的对象档才是 full */
      expect(r.tree.sort?.[0]?.form, '单键+字符串 = short').toBe('short');
      expect(JSON.stringify(serializeTree(r.tree))).toBe(JSON.stringify(body));
    }
    const simple = parseTree({ query: { match_all: {} }, sort: ['title'] });
    expect(simple.ok && simple.tree.sort?.[0]?.form).toBe('str');
    const full = parseTree({ query: { match_all: {} }, sort: [{ title: { order: 'asc' } }] });
    expect(full.ok && full.tree.sort?.[0]?.form).toBe('full');
  });
});
