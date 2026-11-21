/**
 * 五百二十一批：dslLint 四条新规则逐条契约。
 *  ① terms 并入 text-term（值取数组元素判型——元素存在即报）；
 *  ② text-sort：sort 打 text 字段（fielddata 高频 400），三种字段形态 + nth 与 findMatches 对齐；
 *  ③ regexp 前缀通配并入 prefix-wildcard（.* / * 开头）；
 *  ④ date-range：date 字段 range 收非日期串（合法口径=isLegalDateValue 白名单）。
 * 全部 warning 档；不传 ctx 时类型系规则全哑（零回归）。纯函数测试，无挂载。
 */
import { describe, it, expect } from 'vitest';
import { lintDsl } from '../dslLint';

const FIELDS = [
  { path: 'title', type: 'text' },
  { path: 'title.keyword', type: 'keyword' },
  { path: 'status', type: 'keyword' },
  { path: 'created', type: 'date' },
  { path: 'created_nanos', type: 'date_nanos' },
  { path: 'age', type: 'integer' },
];
const ctx = { fields: FIELDS };

describe('dslLint 规则①扩展：terms 打 text 字段（并入 text-term）', () => {
  it('terms 数组值打 text → warning，建议带 .keyword、anchor=字段名', () => {
    const fs = lintDsl(JSON.parse('{"query":{"terms":{"title":["a","b"]}}}'), ctx);
    const f = fs.find(x => x.rule === 'text-term');
    expect(f, '应产出 text-term finding').toBeTruthy();
    expect(f!.severity).toBe('warning');
    expect(f!.suggestion).toContain('title.keyword');
    expect(f!.anchor).toBe('title');
    expect(f!.message).toContain('terms');
  });

  it('terms 打 title.keyword / keyword 字段 → 不报', () => {
    const r1 = lintDsl(JSON.parse('{"query":{"terms":{"title.keyword":["a"]}}}'), ctx).map(x => x.rule);
    expect(r1).not.toContain('text-term');
    const r2 = lintDsl(JSON.parse('{"query":{"terms":{"status":["a"]}}}'), ctx).map(x => x.rule);
    expect(r2).not.toContain('text-term');
  });

  it('terms 数组元素是数字同样报（判型只看字段类型，与元素值形态无关）', () => {
    expect(lintDsl(JSON.parse('{"query":{"terms":{"title":[1,2]}}}'), ctx).map(x => x.rule))
      .toContain('text-term');
  });

  it('term/wildcard 既有行为不回归', () => {
    expect(lintDsl(JSON.parse('{"query":{"term":{"title":"x"}}}'), ctx).map(x => x.rule)).toContain('text-term');
    expect(lintDsl(JSON.parse('{"query":{"wildcard":{"title":"x*"}}}'), ctx).map(x => x.rule)).toContain('text-term');
  });

  it('不传 ctx 时 terms 扩展全哑（零回归）', () => {
    expect(lintDsl(JSON.parse('{"query":{"terms":{"title":["a"]}}}')).map(x => x.rule))
      .not.toContain('text-term');
  });
});

describe('dslLint 规则②：text-sort（sort 打 text 字段）', () => {
  it('对象形态 [{"f": {"order": …}}] → warning，anchor=字段名', () => {
    const fs = lintDsl(JSON.parse('{"sort":[{"title":{"order":"desc"}}]}'), ctx);
    const f = fs.find(x => x.rule === 'text-sort');
    expect(f, '应产出 text-sort finding').toBeTruthy();
    expect(f!.severity).toBe('warning');
    expect(f!.anchor).toBe('title');
    expect(f!.nth).toBe(0);
    expect(f!.suggestion).toContain('title.keyword');
  });

  it('纯串形态 ["f"] 与根级裸串 "f" 也报', () => {
    expect(lintDsl(JSON.parse('{"sort":["title"]}'), ctx).map(x => x.rule)).toContain('text-sort');
    expect(lintDsl(JSON.parse('{"sort":"title"}'), ctx).map(x => x.rule)).toContain('text-sort');
  });

  it('短形态 [{"f": "desc"}] 也报', () => {
    expect(lintDsl(JSON.parse('{"sort":[{"title":"desc"}]}'), ctx).map(x => x.rule)).toContain('text-sort');
  });

  it('title.keyword / date / numeric 字段与 _score 元字段不报', () => {
    expect(lintDsl(JSON.parse('{"sort":[{"title.keyword":{"order":"asc"}}]}'), ctx).map(x => x.rule))
      .not.toContain('text-sort');
    expect(lintDsl(JSON.parse('{"sort":[{"created":{"order":"asc"}}]}'), ctx).map(x => x.rule))
      .not.toContain('text-sort');
    expect(lintDsl(JSON.parse('{"sort":[{"age":"desc"}]}'), ctx).map(x => x.rule))
      .not.toContain('text-sort');
    expect(lintDsl(JSON.parse('{"sort":["_score"]}'), ctx).map(x => x.rule))
      .not.toContain('text-sort');
  });

  /* nth 契约：字段名先以键出现（term.title 记 nth=0），sort 里的同一字段名是第二次出现 → nth=1，
     消费方 findMatches('"title"') 取 hits[1] 才能画到 sort 那一处。 */
  it('同名字段先出现于 term 子句 → text-sort 的 nth 对齐第二次出现', () => {
    const fs = lintDsl(JSON.parse('{"query":{"term":{"title":"x"}},"sort":[{"title":{"order":"desc"}}]}'), ctx);
    const f = fs.find(x => x.rule === 'text-sort')!;
    expect(f.nth).toBe(1);
  });

  it('不传 ctx 时全哑（零回归）', () => {
    expect(lintDsl(JSON.parse('{"sort":["title"]}')).map(x => x.rule)).not.toContain('text-sort');
  });
});

describe('dslLint 规则③：regexp 前缀通配并入 prefix-wildcard', () => {
  it('regexp 值以 .* 开头 → prefix-wildcard warning', () => {
    const fs = lintDsl(JSON.parse('{"query":{"regexp":{"title":".*x"}}}'));
    const f = fs.find(x => x.rule === 'prefix-wildcard');
    expect(f, '应产出 prefix-wildcard finding').toBeTruthy();
    expect(f!.severity).toBe('warning');
    expect(f!.anchor).toBe('regexp');
    expect(f!.path).toBe('query.regexp.title');
  });

  it('regexp 对象形态 {value} 以 * 开头同样报', () => {
    expect(lintDsl({ query: { regexp: { title: { value: '*x' } } } }).map(x => x.rule))
      .toContain('prefix-wildcard');
  });

  it('中缀/锚定开头不报（后缀与正则锚点可用倒排）', () => {
    expect(lintDsl(JSON.parse('{"query":{"regexp":{"title":"x.*"}}}')).map(x => x.rule))
      .not.toContain('prefix-wildcard');
    expect(lintDsl(JSON.parse('{"query":{"regexp":{"title":"^x"}}}')).map(x => x.rule))
      .not.toContain('prefix-wildcard');
  });

  it('wildcard/query_string 既有分支不回归', () => {
    expect(lintDsl(JSON.parse('{"query":{"wildcard":{"title":"*x"}}}')).map(x => x.rule))
      .toContain('prefix-wildcard');
    expect(lintDsl(JSON.parse('{"query":{"query_string":{"query":"*x"}}}')).map(x => x.rule))
      .toContain('prefix-wildcard');
  });
});

describe('dslLint 规则④：date-range（date 字段 range 收非日期串）', () => {
  it('非日期串 → warning，anchor=字段名、path 带操作符', () => {
    const fs = lintDsl(JSON.parse('{"query":{"range":{"created":{"gte":"不是日期"}}}}'), ctx);
    const f = fs.find(x => x.rule === 'date-range');
    expect(f, '应产出 date-range finding').toBeTruthy();
    expect(f!.severity).toBe('warning');
    expect(f!.anchor).toBe('created');
    expect(f!.path).toBe('query.range.created.gte');
    expect(f!.message).toContain('不是日期');
  });

  it('合法口径白名单：ISO / now 日期数学 / ||复合 / epoch 毫秒串 / 数字值不报', () => {
    const ok = (v: unknown) => lintDsl(JSON.parse('{"query":{"range":{"created":{"gte":' + JSON.stringify(v) + '}}}}'), ctx)
      .map(x => x.rule);
    expect(ok('2026-01-01')).not.toContain('date-range');
    expect(ok('2026-01-01T10:00:00')).not.toContain('date-range');
    expect(ok('now')).not.toContain('date-range');
    expect(ok('now-7d/d')).not.toContain('date-range');
    expect(ok('now+1h')).not.toContain('date-range');
    expect(ok('2026-01-01||+1M')).not.toContain('date-range');
    expect(ok('1700000000000')).not.toContain('date-range');
    expect(ok(1700000000000)).not.toContain('date-range');
  });

  it('白名单外形态报：基串非法的 ||复合 / 数学段乱写 / 纯文案', () => {
    const bad = (v: string) => lintDsl(JSON.parse('{"query":{"range":{"created":{"gte":"' + v + '"}}}}'), ctx)
      .map(x => x.rule);
    expect(bad('乱语||+1M')).toContain('date-range');
    expect(bad('2026-01-01||abc')).toContain('date-range');
    expect(bad('hello world')).toContain('date-range');
  });

  it('date_nanos 同判；date 字段不再触发 range-type（numeric 规则判定域不变）', () => {
    expect(lintDsl(JSON.parse('{"query":{"range":{"created_nanos":{"lt":"zzz"}}}}'), ctx).map(x => x.rule))
      .toContain('date-range');
    expect(lintDsl(JSON.parse('{"query":{"range":{"created":{"gte":"zzz"}}}}'), ctx).map(x => x.rule))
      .not.toContain('range-type');
  });

  it('不传 ctx 时全哑（零回归）', () => {
    expect(lintDsl(JSON.parse('{"query":{"range":{"created":{"gte":"zzz"}}}}')).map(x => x.rule))
      .not.toContain('date-range');
  });
});
