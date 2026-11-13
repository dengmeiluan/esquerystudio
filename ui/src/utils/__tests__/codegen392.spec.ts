/**
 * 三百九十二批：codegen 三语言生成器行为单测——DevTools「复制为 curl/JS/Python」
 * （314 批接线）的底层，此前零直测。契约：方法大写归一/host 拼接/无 body 省 content 段/
 * pyLiteral 布尔空值转换（true→True/null→None）/generate 分派。
 */
import { describe, it, expect } from 'vitest';
import { toCurl, toJs, toPython, generate } from '../codegen';

describe('codegen 三语言生成（392 批）', () => {
  it('curl：方法大写/host 拼接/body 时带 Content-Type', () => {
    expect(toCurl('get', '/idx/_search')).toBe('curl -XGET "http://localhost:9200/idx/_search"');
    const withBody = toCurl('post', '/idx/_doc', '{"a":true}', 'http://es:9200');
    expect(withBody).toContain('curl -XPOST "http://es:9200/idx/_doc"');
    expect(withBody).toContain('-H "Content-Type: application/json"');
    /* 1439 起 body 用双引号包裹，JSON 内的 `"` 必须转义成 `\"`——原样写入会让 shell 提前收引号，
       命令被截断。这里断言转义形态，逐字还原由 codegenUsable1439 的往返用例负责。 */
    expect(withBody).toContain('-d "{\\"a\\":true}"');
  });

  it('js：无 body 省略 headers/body 行；有 body 走 JSON.stringify', () => {
    const bare = toJs('GET', '/');
    expect(bare).not.toContain('headers');
    expect(bare).not.toContain('body:');
    expect(bare).toContain('const data = await resp.json();');
    const full = toJs('delete', '/idx/_doc/1', '{"k":null}', 'http://es:9200');
    expect(full).toContain('method: "DELETE"');
    /* 1439 起 body 以 JSON 文本字符串字面量传入——直接内联成对象字面量时，
       键含连字符（{"a-b":1}）就是语法错误。 */
    expect(full).toContain('body: "{\\"k\\":null}"');
  });

  it('python：body 以原始 JSON 文本传递，不做文本替换', () => {
    const py = toPython('PUT', '/idx', '{"enabled":false,"tags":null,"n":1}');
    expect(py).toContain('requests.request(');
    /* 1439 起改走 data=<原始文本>：不再把 true/false/null 正则替换成 Python 字面量
       （那会把字符串里的 "true" 也改掉，见 codegenUsable1439 ⑥）。 */
    expect(py).toContain('data="{\\"enabled\\":false,\\"tags\\":null,\\"n\\":1}"');
    expect(py).toContain('"Content-Type": "application/json"');
  });

  it('generate 分派三语言', () => {
    expect(generate('curl', 'GET', '/x')).toBe(toCurl('GET', '/x'));
    expect(generate('js', 'GET', '/x')).toBe(toJs('GET', '/x'));
    expect(generate('python', 'GET', '/x')).toBe(toPython('GET', '/x'));
  });
});
