import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyResponseFilter, compileJq, jqSingle, JqError } from '../utils/jqFilter';

/* DevTools「过滤响应」表达式的语义锁（对标 Kibana Console 的 JQ / 正则双档）。
   核心约定：**算不对就报错，不许给错值**——任何不支持的语法必须抛错，
   而不是静默返回原响应或部分结果。 */

const DOC = {
  took: 12,
  timed_out: false,
  hits: {
    total: { value: 3, relation: 'eq' },
    hits: [
      { _id: 'a', _score: 2.5, _source: { city: '北京', n: 1 } },
      { _id: 'b', _score: 1.2, _source: { city: '上海', n: 2 } },
      { _id: 'c', _score: 0.4, _source: { city: '北京', n: 3 } },
    ],
  },
  tags: ['x', 'y', 'z'],
  nullable: null,
};
const run = (expr: string, input: unknown = DOC) => compileJq(expr).run(input);

describe('字段与数组访问', () => {
  it('顶层字段', () => expect(run('.took')).toEqual([12]));
  it('嵌套字段', () => expect(run('.hits.total.value')).toEqual([3]));
  it('数组下标', () => expect(run('.tags[0]')).toEqual(['x']));
  it('下标越界 → 空结果（不是 undefined）', () => expect(run('.tags[9]')).toEqual([]));
  it('缺失字段 → 空结果', () => expect(run('.nope')).toEqual([]));
  it('.键名 与 ["键名"] 等价', () => expect(run('.["took"]')).toEqual([12]));
  it('迭代数组', () => expect(run('.tags[]')).toEqual(['x', 'y', 'z']));
  it('迭代对象取 value', () => expect(run('.hits.total[]')).toEqual([3, 'eq']));
});

describe('管道与逗号', () => {
  it('管道链', () => expect(run('.hits.hits[0]._id')).toEqual(['a']));
  it('逗号产出多值', () => expect(run('.took, .timed_out')).toEqual([12, false]));
  it('管道 + 迭代 + 字段', () => expect(run('.hits.hits[]._source.city')).toEqual(['北京', '上海', '北京']));
  it('管道后接逗号作用于每拍', () => expect(run('.hits.hits[0] | ._id, ._score')).toEqual(['a', 2.5]));
});

describe('数组/对象构造与重塑', () => {
  it('[ ... ] 收集成数组', () => expect(run('[.tags[]]')).toEqual([['x', 'y', 'z']]));
  it('空数组字面量', () => expect(run('[]')).toEqual([[]]));
  it('对象构造', () => expect(run('{ id: .hits.hits[0]._id }')).toEqual([{ id: 'a' }]));
  it('对象构造多值取数组', () => expect(run('{ cities: [.hits.hits[]._source.city] }')).toEqual([{ cities: ['北京', '上海', '北京'] }]));
});

describe('select / 比较 / 逻辑', () => {
  it('select 保留满足条件的输入', () => expect(run('.hits.hits[] | select(._score > 1) | ._id')).toEqual(['a', 'b']));
  it('字符串相等', () => expect(run('.hits.hits[] | select(._source.city == "北京") | ._id')).toEqual(['a', 'c']));
  it('不等于', () => expect(run('.hits.hits[] | select(._id != "a") | ._id')).toEqual(['b', 'c']));
  it('逻辑 and', () => expect(run('.hits.hits[] | select(._score > 1 and ._id == "b") | ._id')).toEqual(['b']));
  it('逻辑 or', () => expect(run('.hits.hits[] | select(._id == "a" or ._id == "c") | ._id')).toEqual(['a', 'c']));
  it('null 参与比较不报错', () => expect(run('.nullable == null')).toEqual([true]));
  it('假值只有 false 与 null（0/空串为真）', () => {
    expect(run('select(0) | .took')).toEqual([12]);
    expect(run('select("") | .took')).toEqual([12]);
    expect(run('select(false) | .took')).toEqual([]);
  });
});

describe('替代运算符 //（缺失/假值时取右）', () => {
  it('字段缺失取右', () => expect(run('.nope // "默认"')).toEqual(['默认']));
  it('false 是假值，触发取右（JQ 标准：// 只跳过 false 与 null）', () => expect(run('.timed_out // "默认"')).toEqual(['默认']));
  it('null 触发取右', () => expect(run('.nullable // "空"')).toEqual(['空']));
});

describe('常用函数子集', () => {
  it('length 数组', () => expect(run('.tags | length')).toEqual([3]));
  it('length 对象', () => expect(run('.hits.total | length')).toEqual([2]));
  it('length 字符串', () => expect(run('.tags[0] | length')).toEqual([1]));
  it('keys 对象', () => expect(run('.hits.total | keys')).toEqual([['value', 'relation']]));
  it('type', () => expect(run('.tags | type')).toEqual(['array']));
  it('map', () => expect(run('.hits.hits | map(._id)')).toEqual([['a', 'b', 'c']]));
  it('join', () => expect(run('[.hits.hits[]._id] | join(",")')).toEqual(['a,b,c']));
  it('add 数字求和', () => expect(run('[.hits.hits[]._score] | add')[0]).toBeCloseTo(4.1, 10));
  it('tostring', () => expect(run('.took | tostring')).toEqual(['12']));
  it('contains 字符串', () => expect(run('.tags[0] | contains("x")')).toEqual([true]));
  it('startswith / endswith', () => {
    expect(run('.hits.hits[0]._id | startswith("a")')).toEqual([true]);
    expect(run('.hits.hits[0]._id | endswith("z")')).toEqual([false]);
  });
  it('递归下降 .. 收集全部子值', () => {
    const ids = run('.. | ._id? // empty');
    expect(ids).toEqual(['a', 'b', 'c']);
  });
});

describe('错误必须显式（不许给错值）', () => {
  it('未知函数报错', () => expect(() => run('foo(.took)')).toThrow(JqError));
  it('语法不完整报错', () => expect(() => run('.hits.')).not.toThrow()); // 尾随点合法（空过滤）
  it('括号不闭合报错', () => expect(() => run('(.took')).toThrow(JqError));
  it('尾部残留报错', () => expect(() => run('.took )')).toThrow(JqError));
  it('动态键不支持时明确报错', () => expect(() => run('{(.x): 1}')).toThrow(JqError));
  it('除零报错', () => expect(() => run('.took / 0')).toThrow(JqError));
  it('类型不匹配的 + 报错', () => expect(() => run('.took + .tags')).toThrow(JqError));
});

describe('applyResponseFilter：JQ 档', () => {
  const raw = JSON.stringify(DOC, null, 2);
  it('空表达式原样返回', () => {
    const r = applyResponseFilter(raw, '   ', 'jq');
    expect(r.ok).toBe(true);
    expect(r.text).toBe(raw);
  });
  it('多值逐条输出并按行拼接', () => {
    const r = applyResponseFilter(raw, '.hits.hits[]._id', 'jq');
    expect(r.ok).toBe(true);
    expect(r.count).toBe(3);
    expect(r.text.split('\n')).toEqual(['a', 'b', 'c']);
  });
  it('对象结果格式化输出', () => {
    const r = applyResponseFilter(raw, '.hits.total', 'jq');
    expect(r.ok).toBe(true);
    expect(JSON.parse(r.text)).toEqual({ value: 3, relation: 'eq' });
  });
  it('语法错误给出可读原因而非错值', () => {
    const r = applyResponseFilter(raw, '.hits[', 'jq');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/方括号|缺少|无法/);
  });
  it('响应非 JSON 时提示改用正则档', () => {
    const r = applyResponseFilter('not json at all', '.took', 'jq');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('正则');
  });
});

describe('applyResponseFilter：正则档', () => {
  const raw = 'line one\nERROR boom\nline three\nERROR again';
  it('逐行匹配返回命中行', () => {
    const r = applyResponseFilter(raw, 'ERROR', 'regex');
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);
    expect(r.text).toBe('ERROR boom\nERROR again');
  });
  it('无命中返回空串而非报错', () => {
    const r = applyResponseFilter(raw, 'NOPE', 'regex');
    expect(r.ok).toBe(true);
    expect(r.text).toBe('');
    expect(r.count).toBe(0);
  });
  it('非法正则报错', () => {
    const r = applyResponseFilter(raw, '[', 'regex');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('正则');
  });
  it('非 JSON 响应也能用正则', () => {
    const r = applyResponseFilter('plain text here', 'text', 'regex');
    expect(r.ok).toBe(true);
    expect(r.text).toBe('plain text here');
  });
});

describe('jqSingle 简化', () => {
  it('0 结果 → null', () => expect(jqSingle([])).toBeNull());
  it('1 结果 → 该值', () => expect(jqSingle([42])).toBe(42));
  it('多结果 → 数组', () => expect(jqSingle([1, 2])).toEqual([1, 2]));
});

/* ═══ DevTools 接线：过滤只作用于展示层，原文与执行链零触 ═══ */
describe('DevTools「过滤响应」接线（1126）', () => {
  const view = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');
  const code = view.replace(/<!--[\s\S]*?-->/g, '');

  it('工具栏提供 JQ / 正则双档与表达式输入', () => {
    expect(code).toContain('class="dt-resp-filter"');
    expect(code).toContain('<option value="jq">JQ</option>');
    expect(code).toContain('<option value="regex">正则</option>');
    expect(code).toContain('aria-label="过滤响应表达式"');
  });

  it('展示串走 respShown，原文 cur.result 不被改写', () => {
    expect(code).toContain(':model-value="respShown"');
    expect(code).toContain('const respShown = computed(');
    /* 原文只能被读取，不能被赋值（搜索 run 结果与过滤都不许回写） */
    expect(code).not.toMatch(/cur\.value\.result\s*=/);
  });

  it('表达式无效时回落到原文而不是空白（不给错值也不吞响应）', () => {
    const m = code.match(/const respShown = computed\(\(\) => \{[\s\S]{0,300}?\n\}\);/);
    expect(m).toBeTruthy();
    expect(m![0]).toContain('respFilterOut.value.ok ? respFilterOut.value.text : (cur.value?.result');
  });

  it('无效表达式在界面显式标红（而非静默）', () => {
    expect(code).toContain(":class=\"{ err: !respFilterOut.ok }\"");
    expect(code).toContain("respFilterOut.ok ? respFilterOut.count + ' 条' : '无效'");
  });

  it('表格档跟随过滤结果（与 Monaco 同源）', () => {
    /* 泛型里的 | 会干扰正则，直接按「表格档解析源」取片段比对 */
    const at = code.indexOf('const respTbl = computed');
    expect(at).toBeGreaterThan(-1);
    expect(code.slice(at, at + 900)).toContain('JSON.parse(respShown.value');
  });
});
