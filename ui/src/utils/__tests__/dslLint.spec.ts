import { describe, it, expect } from 'vitest';
import { lintDsl } from '../dslLint';

const rules = (o: unknown) => lintDsl(o).map(f => f.rule).sort();

describe('lintDsl：前缀通配符', () => {
  it('wildcard 值以 * 开头命中', () => {
    const f = lintDsl({ query: { wildcard: { title: '*债券' } } });
    expect(f.map(x => x.rule)).toContain('prefix-wildcard');
    expect(f[0].anchor).toBe('wildcard');
    expect(f[0].path).toBe('query.wildcard.title');
  });

  it('wildcard 值以 ? 开头命中', () => {
    expect(rules({ query: { wildcard: { title: '?abc' } } })).toContain('prefix-wildcard');
  });

  it('wildcard 值中间有 * 不命中（后缀通配可用倒排）', () => {
    expect(rules({ query: { wildcard: { title: '债券*' } } })).not.toContain('prefix-wildcard');
  });

  it('query_string 的 query 以 * 开头命中', () => {
    expect(rules({ query: { query_string: { query: '*abc' } } })).toContain('prefix-wildcard');
  });

  it('bool.must 数组内的 wildcard 也命中，且 path 带下标', () => {
    const f = lintDsl({ query: { bool: { must: [{ term: { a: 1 } }, { wildcard: { b: '*x' } }] } } });
    const w = f.find(x => x.rule === 'prefix-wildcard')!;
    expect(w.path).toBe('query.bool.must[1].wildcard.b');
  });
});

describe('lintDsl：分页与 size', () => {
  it('from + size 超过 10000 命中深分页', () => {
    expect(rules({ from: 9990, size: 20 })).toContain('deep-paging');
  });

  it('from + size 正好 10000 不命中', () => {
    expect(rules({ from: 9980, size: 20 })).not.toContain('deep-paging');
  });

  it('size 超过 1000 命中超大 size', () => {
    expect(rules({ size: 5000 })).toContain('huge-size');
  });

  it('size 正好 1000 不命中', () => {
    expect(rules({ size: 1000 })).not.toContain('huge-size');
  });

  it('缺 from 时按 0 计算', () => {
    expect(rules({ size: 20 })).not.toContain('deep-paging');
  });
});

describe('lintDsl：缺 filter', () => {
  it('bool.must 全是精确匹配类命中 hint', () => {
    const f = lintDsl({ query: { bool: { must: [{ term: { a: 1 } }, { range: { b: { gte: 1 } } }] } } });
    const h = f.find(x => x.rule === 'missing-filter')!;
    expect(h.severity).toBe('hint');
  });

  it('bool.must 含 match（需要打分）不命中', () => {
    expect(rules({ query: { bool: { must: [{ term: { a: 1 } }, { match: { b: 'x' } }] } } }))
      .not.toContain('missing-filter');
  });

  it('已有 filter 时不再提示', () => {
    expect(rules({ query: { bool: { must: [{ term: { a: 1 } }], filter: [{ term: { c: 2 } }] } } }))
      .not.toContain('missing-filter');
  });

  it('bool.must 为空数组不命中', () => {
    expect(rules({ query: { bool: { must: [] } } })).not.toContain('missing-filter');
  });
});

describe('lintDsl：健壮性与 nth', () => {
  it('null / 非对象输入返回空数组，不抛', () => {
    expect(lintDsl(null)).toEqual([]);
    expect(lintDsl('nonsense')).toEqual([]);
    expect(lintDsl(42)).toEqual([]);
  });

  it('干净查询返回空数组', () => {
    expect(lintDsl({ query: { bool: { filter: [{ term: { a: 1 } }] } }, size: 20 })).toEqual([]);
  });

  it('同名锚点出现多次时 nth 递增', () => {
    const f = lintDsl({ query: { bool: { should: [{ wildcard: { a: '*1' } }, { wildcard: { b: '*2' } }] } } });
    const ws = f.filter(x => x.rule === 'prefix-wildcard');
    expect(ws).toHaveLength(2);
    expect(ws.map(x => x.nth)).toEqual([0, 1]);
  });

  /* nth 的语义是「该键名在全文里的第几次出现」，不是「第几条 finding」。
     消费方做 findMatches('"wildcard"') 后取 hits[nth]，两者必须对齐，
     否则黄线会画到无辜的那个 wildcard 上——比不提示更糟。 */
  it('两个 wildcard 只有第二个是前缀通配 → 唯一 finding 的 nth 是 1', () => {
    const f = lintDsl({ query: { bool: { must: [
      { wildcard: { a: 'good*' } },   // 后缀通配，不该命中
      { wildcard: { b: '*bad' } },    // 前缀通配，该命中
    ] } } });
    const ws = f.filter(x => x.rule === 'prefix-wildcard');
    expect(ws).toHaveLength(1);
    // 文本里 "wildcard" 出现两次，有问题的是第 2 个
    expect(ws[0].nth).toBe(1);
  });

  it('两个 wildcard 都是前缀通配 → 两条 finding 的 nth 分别是 0 和 1', () => {
    const f = lintDsl({ query: { bool: { must: [
      { wildcard: { a: '*x' } },
      { wildcard: { b: '*y' } },
    ] } } });
    const ws = f.filter(x => x.rule === 'prefix-wildcard');
    expect(ws).toHaveLength(2);
    expect(ws.map(x => x.nth)).toEqual([0, 1]);
  });

  it('size:20000 同时触发两条规则，锚点都是 size 的唯一那次出现 → nth 都是 0', () => {
    const f = lintDsl({ size: 20000 });
    expect(f).toHaveLength(2);
    const deep = f.find(x => x.rule === 'deep-paging')!;
    const huge = f.find(x => x.rule === 'huge-size')!;
    // 文本里 "size" 只出现一次，两条 finding 都该指向它
    expect(deep.anchor).toBe('size');
    expect(huge.anchor).toBe('size');
    expect(deep.nth).toBe(0);
    expect(huge.nth).toBe(0);
  });

  it('nth 对齐 aggs 里的同名键：root.size 不是文本里第一个 "size" 时也取对下标', () => {
    // 插入序：aggs 先、size 后 → 文本里第一个 "size" 在 aggs 内部
    const f = lintDsl({ aggs: { g: { terms: { field: 'f', size: 10 } } }, size: 20000 });
    const huge = f.find(x => x.rule === 'huge-size')!;
    expect(huge.nth).toBe(1);
  });
});

describe('lintDsl：deep-paging 的 path 与 anchor 归属', () => {
  it('没有 from 键时 path 反映实际情况，不硬编码 from', () => {
    const f = lintDsl({ size: 20000 });
    const deep = f.find(x => x.rule === 'deep-paging')!;
    expect(deep.path).toBe('size');
    expect(deep.anchor).toBe('size');
  });

  it('有 from 键时 path 与 anchor 都指 from', () => {
    const f = lintDsl({ from: 9990, size: 20 });
    const deep = f.find(x => x.rule === 'deep-paging')!;
    expect(deep.path).toBe('from');
    expect(deep.anchor).toBe('from');
  });

  /* from: 0 是显式写出的键，不该因为值 falsy 就被当作「没写 from」。
     anchor 指 from：它是深分页的语义主体，用户要调的是分页方式。 */
  it('from:0 显式写出时按「键存在」判断，anchor 指 from 而非 size', () => {
    const f = lintDsl({ from: 0, size: 20000 });
    const deep = f.find(x => x.rule === 'deep-paging')!;
    expect(deep.path).toBe('from');
    expect(deep.anchor).toBe('from');
    expect(deep.nth).toBe(0);
  });
});

/* ═══ W3：键拼写纠错规则包（零 ctx 依赖 + terms 结构错 + multi_match 字段表）═══
   每条规则正反例成对：拼错形态必报、合法形态零误报。 */

describe('W3 lintDsl：bool 组键拼写（bool-key-typo）', () => {
  it('shoud / fitler / mustnot 拼错键命中，anchor=拼错键、nth 走 markOccurrence 口径', () => {
    const f1 = lintDsl({ query: { bool: { shoud: [{ term: { a: 1 } }] } } });
    const w1 = f1.find(x => x.rule === 'bool-key-typo')!;
    expect(w1, 'shoud 应命中').toBeTruthy();
    expect(w1.anchor).toBe('shoud');
    expect(w1.nth).toBe(0);
    expect(w1.severity).toBe('warning');
    expect(w1.message).toContain('should');

    expect(lintDsl({ query: { bool: { fitler: { a: 1 } } } }).map(x => x.rule)).toContain('bool-key-typo');
    expect(lintDsl({ query: { bool: { mustnot: [{ term: { a: 1 } }] } } }).map(x => x.rule))
      .toContain('bool-key-typo');
  });

  it('七合法键零误报；嵌套 bool 同判；编辑距离 >2 的外来键不报', () => {
    const ok = { must: [], should: [], must_not: [], filter: [], minimum_should_match: 2, boost: 1, _name: 'n' };
    expect(lintDsl({ query: { bool: ok } }).map(x => x.rule)).not.toContain('bool-key-typo');
    const f2 = lintDsl({ query: { bool: { must: [{ bool: { shoud: [] } }] } } });
    expect(f2.map(x => x.rule)).toContain('bool-key-typo');
    /* adjust_pure_negative 等距离 >2 的真键不误报 */
    expect(lintDsl({ query: { bool: { must: [], adjust_pure_negative: true } } }).map(x => x.rule))
      .not.toContain('bool-key-typo');
  });

  it('同名拼错键多次出现时 nth 递增（与 findMatches 命中下标对齐）', () => {
    const f = lintDsl({ query: { bool: { shoud: [], must: [{ bool: { shoud: [] } }] } } });
    const ws = f.filter(x => x.rule === 'bool-key-typo');
    expect(ws.length).toBe(2);
    expect(ws.map(x => x.nth)).toEqual([0, 1]);
  });
});

describe('W3 lintDsl：根级键拼写（root-key-typo）', () => {
  it('frm 拼错命中（最接近 from），anchor=拼错键', () => {
    const f = lintDsl({ frm: 10, size: 10 });
    const w = f.find(x => x.rule === 'root-key-typo')!;
    expect(w, 'frm 应命中（最接近 from）').toBeTruthy();
    expect(w.anchor).toBe('frm');
    expect(w.path).toBe('frm');
    expect(w.message).toContain('from');
  });

  it('白名单键零误报；aggs/aggregations 双合法互不误报', () => {
    const okKeys = ['query', 'sort', 'aggs', 'aggregations', '_source', 'highlight', 'from', 'size',
      'track_total_hits', 'timeout', 'min_score', 'collapse', 'suggest', 'knn', 'post_filter'];
    for (const k of okKeys) {
      expect(lintDsl({ [k]: {} }).map(x => x.rule), k).not.toContain('root-key-typo');
    }
  });

  it('同名键非根层出现不判（只查根层）', () => {
    const f = lintDsl({ query: { bool: { must: [{ term: { frm: 1 } }] } } });
    expect(f.map(x => x.rule)).not.toContain('root-key-typo');
  });
});

describe('W3 lintDsl：terms 标量结构错（terms-scalar，error 档）', () => {
  it('terms 值为标量 → error 档 finding，anchor=字段名', () => {
    const f = lintDsl({ query: { terms: { status: 'active' } } });
    const w = f.find(x => x.rule === 'terms-scalar')!;
    expect(w, '标量值必须命中').toBeTruthy();
    expect(w.severity).toBe('error');
    expect(w.anchor).toBe('status');
    expect(w.path).toBe('query.terms.status');
  });

  it('数组值 / terms lookup 对象值 / boost 参数零误报；aggs 下的 terms 聚合体豁免', () => {
    expect(lintDsl({ query: { terms: { status: ['a', 'b'] } } }).map(x => x.rule))
      .not.toContain('terms-scalar');
    expect(lintDsl({ query: { terms: { status: { index: 'x', id: '1', path: 'y' } } } }).map(x => x.rule))
      .not.toContain('terms-scalar');
    expect(lintDsl({ query: { terms: { status: ['a'], boost: 2 } } }).map(x => x.rule))
      .not.toContain('terms-scalar');
    expect(lintDsl({ aggs: { g: { terms: { field: 'status', size: 10 } } } }).map(x => x.rule))
      .not.toContain('terms-scalar');
  });
});

describe('W3 lintDsl：range 操作符拼写（range-op-typo）', () => {
  const ctx = { fields: [{ path: 'created', type: 'date' }, { path: 'age', type: 'integer' }] };

  it('gtee / lte 键拼错命中，anchor=字段名、path 带拼错操作符', () => {
    const f = lintDsl({ query: { range: { created: { gtee: '2026-01-01' } } } }, ctx);
    const w = f.find(x => x.rule === 'range-op-typo')!;
    expect(w, 'gtee 应命中').toBeTruthy();
    expect(w.severity).toBe('warning');
    expect(w.anchor).toBe('created');
    expect(w.path).toBe('query.range.created.gtee');
    expect(w.message).toContain('gte');
    expect(lintDsl({ query: { range: { age: { lte: 5, gte: 1 } } } }, ctx).filter(x => x.rule === 'range-op-typo'))
      .toHaveLength(0);
  });

  it('format/time_zone/boost/relation 元参数键豁免', () => {
    const doc = (meta: Record<string, unknown>) =>
      lintDsl({ query: { range: { created: { gte: 'now-1d', ...meta } } } }, ctx)
        .filter(x => x.rule === 'range-op-typo');
    expect(doc({ format: 'MM/yyyy' })).toHaveLength(0);
    expect(doc({ time_zone: '+08:00' })).toHaveLength(0);
    expect(doc({ boost: 1 })).toHaveLength(0);
    expect(doc({ relation: 'intersect' })).toHaveLength(0);
  });

  it('不传 ctx 时类型系规则全哑，但 terms-scalar / 键拼写规则仍生效（零 ctx 依赖）', () => {
    expect(lintDsl({ query: { range: { created: { gtee: 'x' } } } }).map(x => x.rule))
      .not.toContain('range-op-typo');
    expect(lintDsl({ query: { terms: { status: 'x' } } }).map(x => x.rule)).toContain('terms-scalar');
  });
});

describe('W3 lintDsl：date-range 误报修复（format/time_zone 豁免）', () => {
  const ctx = { fields: [{ path: 'created', type: 'date' }] };

  it('自定义 format 下的非 ISO 值串不再误报（"gte":"01/2026","format":"MM/yyyy"）', () => {
    const doc = { query: { range: { created: { gte: '01/2026', format: 'MM/yyyy' } } } };
    expect(lintDsl(doc, ctx).map(x => x.rule)).not.toContain('date-range');
  });

  it('带 time_zone 的值对象同样豁免；无 format 的非日期串照报（不放松）', () => {
    expect(lintDsl({ query: { range: { created: { gte: '01/2026', time_zone: '+08:00' } } } }, ctx)
      .map(x => x.rule)).not.toContain('date-range');
    expect(lintDsl({ query: { range: { created: { gte: '不是日期' } } } }, ctx).map(x => x.rule))
      .toContain('date-range');
    expect(lintDsl({ query: { range: { created: { gte: '2026-01-01', format: 'MM/yyyy', lt: '乱语' } } } }, ctx)
      .map(x => x.rule)).not.toContain('date-range');
  });
});

describe('W3 lintDsl：multi_match fields 元素拼写（unknown-field 复用）', () => {
  const ctx = { fields: [{ path: 'title', type: 'text' }, { path: 'status', type: 'keyword' }] };

  it('非通配元素不在 mapping → unknown-field hint，anchor=元素字段名', () => {
    const f = lintDsl({ query: { multi_match: { query: 'x', fields: ['tittle'] } } }, ctx);
    const w = f.find(x => x.rule === 'unknown-field')!;
    expect(w, 'tittle 应命中（最接近 title）').toBeTruthy();
    expect(w.severity).toBe('hint');
    expect(w.anchor).toBe('tittle');
    expect(w.path).toBe('query.multi_match.fields');
    expect(w.message).toContain('title');
  });

  it('通配项 / 命中 mapping 项 / ^boost 后缀剥离后命中项零误报', () => {
    const doc = (fields: string[]) =>
      lintDsl({ query: { multi_match: { query: 'x', fields } } }, ctx)
        .filter(x => x.rule === 'unknown-field');
    expect(doc(['title*'])).toHaveLength(0);
    expect(doc(['*name'])).toHaveLength(0);
    expect(doc(['title', 'status^3'])).toHaveLength(0);
  });

  it('不传 ctx 时全哑（字段表依赖规则）', () => {
    expect(lintDsl({ query: { multi_match: { query: 'x', fields: ['tittle'] } } })
      .map(x => x.rule)).not.toContain('unknown-field');
  });
});

/* ═══ 五百二十五批：根级结构与聚合/排序四规则 ═══
   match-all（SearchSandboxView 私藏语义下沉）/ search-after-no-sort（error 档）/
   agg-size-default（hint 档）/ sort-unknown-field（unknown-field 口径复用）。 */

describe('五百二十五批 lintDsl：match_all / 空 query 全量扫描（match-all）', () => {
  it('根 query 为 {"match_all":{}} → warning，anchor=match_all', () => {
    const f = lintDsl({ query: { match_all: {} } });
    const w = f.find(x => x.rule === 'match-all')!;
    expect(w, 'match_all 应命中').toBeTruthy();
    expect(w.severity).toBe('warning');
    expect(w.anchor).toBe('match_all');
    expect(w.path).toBe('query.match_all');
    expect(w.message).toContain('全量扫描');
  });

  it('match_all 带参数形态（boost）同样命中（isMatchAll 的 in q 口径）', () => {
    expect(lintDsl({ query: { match_all: { boost: 2 } } }).map(x => x.rule)).toContain('match-all');
  });

  it('空对象 query → warning，anchor=query（等价 match_all 形态）', () => {
    const f = lintDsl({ query: {}, size: 10 });
    const w = f.find(x => x.rule === 'match-all')!;
    expect(w, '空 query 应命中').toBeTruthy();
    expect(w.anchor).toBe('query');
    expect(w.message).toContain('等价 match_all');
  });

  it('正常 query / bool 内嵌 match_all / 无 query 键均零误报', () => {
    expect(lintDsl({ query: { term: { a: 1 } } }).map(x => x.rule)).not.toContain('match-all');
    expect(lintDsl({ query: { bool: { should: [{ match_all: {} }] } } }).map(x => x.rule))
      .not.toContain('match-all');
    expect(lintDsl({ size: 10, aggs: { g: { terms: { field: 'a', size: 5 } } } }).map(x => x.rule))
      .not.toContain('match-all');
  });
});

describe('五百二十五批 lintDsl：search_after 无 sort（search-after-no-sort，error 档）', () => {
  it('根级 search_after 无 sort → error，anchor=search_after', () => {
    const f = lintDsl({ search_after: [123455], size: 10 });
    const w = f.find(x => x.rule === 'search-after-no-sort')!;
    expect(w, '无 sort 的 search_after 应命中').toBeTruthy();
    expect(w.severity).toBe('error');
    expect(w.anchor).toBe('search_after');
    expect(w.path).toBe('search_after');
  });

  it('带 sort / 根级 pit 豁免（隐式 _shard_doc 排序合法）/ 无 search_after 零误报', () => {
    expect(lintDsl({ search_after: [123455], sort: [{ ts: 'asc' }] }).map(x => x.rule))
      .not.toContain('search-after-no-sort');
    expect(lintDsl({ search_after: [123455], pit: { id: 'xxx' } }).map(x => x.rule))
      .not.toContain('search-after-no-sort');
    expect(lintDsl({ sort: [{ ts: 'asc' }] }).map(x => x.rule))
      .not.toContain('search-after-no-sort');
  });
});

describe('五百二十五批 lintDsl：terms 聚合缺 size（agg-size-default，hint 档）', () => {
  it('aggs 下 terms 未写 size → hint，anchor=terms', () => {
    const f = lintDsl({ aggs: { g: { terms: { field: 'status' } } } });
    const w = f.find(x => x.rule === 'agg-size-default')!;
    expect(w, '缺 size 应命中').toBeTruthy();
    expect(w.severity).toBe('hint');
    expect(w.anchor).toBe('terms');
    expect(w.path).toBe('aggs.g.terms');
    expect(w.message).toContain('10 桶');
  });

  it('aggregations 双拼写同判；嵌套 aggs 每个缺 size 的 terms 各报一条', () => {
    expect(lintDsl({ aggregations: { g: { terms: { field: 'status' } } } }).map(x => x.rule))
      .toContain('agg-size-default');
    const f = lintDsl({ aggs: { g: { terms: { field: 'a' }, aggs: { i: { terms: { field: 'b' } } } } } });
    expect(f.filter(x => x.rule === 'agg-size-default')).toHaveLength(2);
  });

  it('显式 size / query 体的 terms 子句 零误报', () => {
    expect(lintDsl({ aggs: { g: { terms: { field: 'status', size: 20 } } } }).map(x => x.rule))
      .not.toContain('agg-size-default');
    expect(lintDsl({ query: { terms: { status: ['a'] } } }).map(x => x.rule))
      .not.toContain('agg-size-default');
  });
});

describe('五百二十五批 lintDsl：sort 字段不在 mapping（sort-unknown-field）', () => {
  const ctx = { fields: [{ path: 'title', type: 'text' }, { path: 'status', type: 'keyword' }, { path: 'age', type: 'integer' }] };

  it('纯串 sort 字段不在 mapping → warning，anchor=字段名、nth 补记', () => {
    const f = lintDsl({ sort: ['tittle'] }, ctx);
    const w = f.find(x => x.rule === 'sort-unknown-field')!;
    expect(w, 'tittle 应命中（最接近 title）').toBeTruthy();
    expect(w.severity).toBe('warning');
    expect(w.anchor).toBe('tittle');
    expect(w.nth).toBe(0);
    expect(w.message).toContain('title');
  });

  it('对象形态 [{"f":{"order":"desc"}}] 同判，nth 走 occur 现值口径', () => {
    const f = lintDsl({ sort: [{ tittle: { order: 'desc' } }] }, ctx);
    const w = f.find(x => x.rule === 'sort-unknown-field')!;
    expect(w, '对象形态也应命中').toBeTruthy();
    expect(w.nth).toBe(0);
  });

  it('已知字段 / 元字段 / 编辑距离 >2 / 不传 ctx 均零误报', () => {
    const none = (o: unknown) => lintDsl(o, ctx).filter(x => x.rule === 'sort-unknown-field');
    expect(none({ sort: ['title'] })).toHaveLength(0);
    expect(none({ sort: [{ age: 'desc' }, '_doc', '_score'] })).toHaveLength(0);
    expect(none({ sort: ['zzzzzzzzzz'] })).toHaveLength(0);
    expect(lintDsl({ sort: ['tittle'] }).filter(x => x.rule === 'sort-unknown-field')).toHaveLength(0);
  });

  it('nth 与文本出现序对齐：字段先作查询键、后作 sort 串 → sort finding nth=1', () => {
    const f = lintDsl({ query: { term: { tittle: 'x' } }, sort: ['tittle'] }, ctx);
    const kf = f.find(x => x.rule === 'unknown-field')!;
    const sf = f.find(x => x.rule === 'sort-unknown-field')!;
    expect(kf.nth).toBe(0); // term 下的 tittle 是键，walk 记次
    expect(sf.nth).toBe(1); // sort 里的 tittle 是串值，发现时补记为第 2 次出现
  });
});
