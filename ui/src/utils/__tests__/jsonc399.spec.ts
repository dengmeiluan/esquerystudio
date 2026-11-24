/**
 * 三百九十九批：jsonc 工具行为单测——311 批 DevTools 宽容解析与 W1 树回解的底层。
 * 四契约：stripJsonComments 剥 // 与 /* *\/ 且字符串内的注释标记不受影响（转义串同理）/
 * tryParse 失败回 null 不抛/prettyJson 失败回退原文/highlightJson 转义安全（<> & 不产生注入面）。
 */
import { describe, it, expect } from 'vitest';
import { stripJsonComments, tryParse, prettyJson, highlightJson } from '../jsonc';

describe('stripJsonComments（399 批）', () => {
  it('剥 // 与 /* */，保留 JSON 语义', () => {
    const src = '{\n  // 单行注释\n  "a": 1, /* 多行\n注释 */\n  "b": 2\n}';
    expect(JSON.parse(stripJsonComments(src))).toEqual({ a: 1, b: 2 });
  });

  it('字符串内的 // 与 /* 不当注释（URL/正则场景）', () => {
    const src = '{"url": "http://es:9200/x", "re": "a/*b"}';
    expect(JSON.parse(stripJsonComments(src))).toEqual({ url: 'http://es:9200/x', re: 'a/*b' });
  });

  it('转义引号内的注释标记不受影响', () => {
    const src = '{"q": "say \\"// not comment\\""}';
    expect(JSON.parse(stripJsonComments(src))).toEqual({ q: 'say "// not comment"' });
  });
});

describe('tryParse / prettyJson / highlightJson（399 批）', () => {
  it('tryParse 失败回 null 不抛', () => {
    expect(tryParse('{"a":1}')).toEqual({ a: 1 });
    expect(tryParse('nope')).toBeNull();
  });

  it('prettyJson：字符串入参美化、对象直美化、坏入参回退原文', () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJson({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(prettyJson('broken{')).toBe('broken{');
    expect(prettyJson(null), 'JSON.stringify(null) 合法，回 "null"').toBe('null');
  });

  it('highlightJson：HTML 转义安全（<> & 先转义再高亮，无注入面）', () => {
    const out = highlightJson('{"a<script>": "<b>"}');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('&lt;b&gt;');
    expect(out).not.toContain('<script>');
    expect(out).toContain('j-key');
    expect(out).toContain('j-str');
  });
});
