/**
 * W-A：dslLint 字段类型错配四规则（text-term / range-type / unknown-field / keyword-range）。
 * 锁定：ctx（mapping 字段表）传入时四规则各自触发与豁免；不传 ctx 时零回归
 * （原四规则照跑、新规则全哑）。纯函数测试，无挂载。
 */
import { describe, it, expect } from 'vitest';
import { lintDsl } from '../utils/dslLint';

const FIELDS = [
  { path: 'title', type: 'text' },
  { path: 'title.keyword', type: 'keyword' },
  { path: 'status', type: 'keyword' },
  { path: 'age', type: 'integer' },
  { path: 'created', type: 'date' },
];
const ctx = { fields: FIELDS };
const rulesOf = (dsl: string, c?: typeof ctx) => lintDsl(JSON.parse(dsl), c).map(f => f.rule);

describe('dslLint 规则① text-term：term/wildcard 打 text 字段', () => {
  it('term 打 text 无 .keyword 后缀 → warning，建议带 .keyword', () => {
    const fs = lintDsl(JSON.parse('{"query":{"term":{"title":"hello world"}}}'), ctx);
    const f = fs.find(x => x.rule === 'text-term');
    expect(f, '应产出 text-term finding').toBeTruthy();
    expect(f!.severity).toBe('warning');
    expect(f!.suggestion).toContain('title.keyword');
    expect(f!.anchor).toBe('title');
    expect(f!.path).toContain('term.title');
  });

  it('term 打 text.keyword 子字段 → 不报（multi-field 精确匹配是正解）', () => {
    expect(rulesOf('{"query":{"term":{"title.keyword":"hello"}}}', ctx)).not.toContain('text-term');
  });

  it('wildcard 打 text 同样报 text-term', () => {
    expect(rulesOf('{"query":{"wildcard":{"title":"hel*"}}}', ctx)).toContain('text-term');
  });

  it('term 打 keyword 字段 → 不报', () => {
    expect(rulesOf('{"query":{"term":{"status":"active"}}}', ctx)).not.toContain('text-term');
  });
});

describe('dslLint 规则② range-type：range 值与字段类型错配', () => {
  it('numeric 字段收到非数值串 → warning', () => {
    const fs = lintDsl(JSON.parse('{"query":{"range":{"age":{"gte":"abc"}}}}'), ctx);
    const f = fs.find(x => x.rule === 'range-type');
    expect(f, '应产出 range-type finding').toBeTruthy();
    expect(f!.severity).toBe('warning');
    expect(f!.message).toContain('abc');
  });

  it('数值串/真数字不报；date 字段收字符串不报', () => {
    expect(rulesOf('{"query":{"range":{"age":{"gte":"123"}}}}', ctx)).not.toContain('range-type');
    expect(rulesOf('{"query":{"range":{"age":{"gte":18}}}}', ctx)).not.toContain('range-type');
    expect(rulesOf('{"query":{"range":{"created":{"gte":"2026-01-01"}}}}', ctx)).not.toContain('range-type');
  });
});

describe('dslLint 规则③ unknown-field：字段不在 mapping 附最近字段', () => {
  it('编辑距离 ≤2 → hint 带「最接近：」', () => {
    const fs = lintDsl(JSON.parse('{"query":{"term":{"statu":"a"}}}'), ctx); // status 距离 1
    const f = fs.find(x => x.rule === 'unknown-field');
    expect(f, '应产出 unknown-field finding').toBeTruthy();
    expect(f!.severity).toBe('hint');
    expect(f!.message).toContain('最接近：status');
  });

  it('编辑距离 >2 → 不提示（防噪音）', () => {
    expect(rulesOf('{"query":{"term":{"zzzzzzz":"a"}}}', ctx)).not.toContain('unknown-field');
  });

  it('元字段 _id 与未替换变量 ${var} 不判', () => {
    expect(rulesOf('{"query":{"term":{"_id":"1"}}}', ctx)).not.toContain('unknown-field');
    expect(rulesOf('{"query":{"term":{"${field}":"1"}}}', ctx)).not.toContain('unknown-field');
  });
});

describe('dslLint 规则④ keyword-range：range 打 keyword 字段', () => {
  it('range 打 keyword → info 提示字典序', () => {
    const fs = lintDsl(JSON.parse('{"query":{"range":{"status":{"gte":"a","lte":"z"}}}}'), ctx);
    const f = fs.find(x => x.rule === 'keyword-range');
    expect(f, '应产出 keyword-range finding').toBeTruthy();
    expect(f!.severity).toBe('info');
    expect(f!.message).toContain('字典序');
  });

  it('range 打 date 字段 → 不报', () => {
    expect(rulesOf('{"query":{"range":{"created":{"gte":"now-7d/d"}}}}', ctx)).not.toContain('keyword-range');
  });
});

describe('dslLint 规则⑤ text-range：range 打 text 字段（五百一十九批）', () => {
  it('range 打 text → warning「分词词项上字典序比较」', () => {
    const fs = lintDsl(JSON.parse('{"query":{"range":{"title":{"gte":"a"}}}}'), ctx);
    const f = fs.find(x => x.rule === 'text-range');
    expect(f, '应产出 text-range finding').toBeTruthy();
    expect(f!.severity).toBe('warning');
    expect(f!.message).toContain('title');
    expect(f!.message).toContain('字典序');
    expect(f!.anchor).toBe('title');
  });

  it('range 打 title.keyword（keyword 类型）只报 keyword-range，不误报 text-range', () => {
    const rules = rulesOf('{"query":{"range":{"title.keyword":{"gte":"a"}}}}', ctx);
    expect(rules).not.toContain('text-range');
    expect(rules).toContain('keyword-range');
  });

  it('range 打 keyword/date 字段不报 text-range', () => {
    expect(rulesOf('{"query":{"range":{"status":{"gte":"a"}}}}', ctx)).not.toContain('text-range');
    expect(rulesOf('{"query":{"range":{"created":{"gte":"2026-01-01"}}}}', ctx)).not.toContain('text-range');
  });

  it('不传 ctx 时 text-range 全哑（零回归）', () => {
    expect(rulesOf('{"query":{"range":{"title":{"gte":"a"}}}}')).not.toContain('text-range');
  });
});

describe('dslLint 不传 ctx 零回归', () => {
  it('类型错配 DSL 不传 ctx 时新规则全哑', () => {
    const rules = rulesOf('{"query":{"bool":{"must":[{"term":{"title":"x"}},{"range":{"status":{"gte":"a"}}}]}}}');
    expect(rules).not.toContain('text-term');
    expect(rules).not.toContain('keyword-range');
    expect(rules).not.toContain('unknown-field');
    expect(rules).not.toContain('range-type');
  });

  it('原四规则不传 ctx 仍照跑', () => {
    expect(rulesOf('{"query":{"wildcard":{"title":"*x"}}}')).toContain('prefix-wildcard');
    expect(rulesOf('{"from":10000,"size":100}')).toContain('deep-paging');
    expect(rulesOf('{"size":2000}')).toContain('huge-size');
    expect(rulesOf('{"query":{"bool":{"must":[{"term":{"a":1}}]}}}')).toContain('missing-filter');
  });

  it('传 ctx 时原四规则不受影响（共存）', () => {
    expect(rulesOf('{"size":2000}', ctx)).toContain('huge-size');
    expect(rulesOf('{"query":{"bool":{"must":[{"term":{"a":1}}]}}}', ctx)).toContain('missing-filter');
  });
});
