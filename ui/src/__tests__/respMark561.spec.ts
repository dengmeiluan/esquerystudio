/**
 * 五百六十一批：视图内搜索 mark 内核合并 utils/respMark 单源。
 * ① 行为锁：markHtmlAll/escapeRe（RestView.markHtml 与 DslQueryView.jsonMarkedHtml
 *    同构实现的公共内核——jsonFindEscape500 批 H2/H4 行为锁同步更新单源）；
 * ② 双视图改引源码锚：两视图本地实现退役、只 import 单源；类名 j-mark/j-mark-cur 与
 *    data-hit-idx 属性逐字保形；
 * ③ 同批单源合并：errPre.ts 私造 escHtml 退役 → highlightSanitize.escapeHtml（560 批
 *    IntegrationGuide 先例，三连转义逐字等价改用）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeRe, markHtmlAll } from '../utils/respMark';
import { escapeHtml } from '../utils/highlightSanitize';

const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf-8');
const respMarkSrc = src('utils/respMark.ts');
const rest = src('views/RestView.vue');
const dsl = src('views/DslQueryView.vue');
const errPre = src('utils/errPre.ts');

describe('respMark 单源：escapeRe 行为（jsonFindEscape500 H4 同步更新）', () => {
  it('元字符关键字转义后正则命中（含 . { } ( 的搜索词不丢命中）', () => {
    const re = new RegExp(escapeRe('a.b(c)'), 'gi');
    expect('x a.b(c) y'.match(re)).toEqual(['a.b(c)']);
    expect('x aXbYc y'.match(re)).toBeNull(); /* 转义后不做通配匹配 */
  });

  it('源码锚：字符类是标准写法且单源在场（视图内本地副本退役）', () => {
    expect(respMarkSrc).toContain("kw.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')");
    expect(respMarkSrc).not.toContain('[\\\\]\\\\]/g');
    expect(rest).not.toContain('function escapeRe');
    expect(dsl).not.toContain('jsonEscapeRe');
  });
});

describe('respMark 单源：markHtmlAll 行为', () => {
  it('kw 空原样返回（count=0，不做任何标记）', () => {
    expect(markHtmlAll('<pre>原文</pre>', '', 1)).toEqual({ html: '<pre>原文</pre>', count: 0 });
  });

  it('文本段命中包 j-mark + 递增 data-hit-idx，第 cur 个命中加 j-mark-cur', () => {
    const r = markHtmlAll('foo bar foo', 'foo', 2);
    expect(r.count).toBe(2);
    expect(r.html).toContain('<mark class="j-mark" data-hit-idx="1">foo</mark>');
    expect(r.html).toContain('<mark class="j-mark j-mark-cur" data-hit-idx="2">foo</mark>');
  });

  it('cur 越界/为 0（纯计数模式）不出 j-mark-cur——计数与渲染解耦防 TDZ 环', () => {
    expect(markHtmlAll('foo foo', 'foo', 0).html).not.toContain('j-mark-cur');
    expect(markHtmlAll('foo foo', 'foo', 9).html).not.toContain('j-mark-cur');
    expect(markHtmlAll('foo foo', 'foo', 0).count).toBe(2);
  });

  it('标签段不参与替换：搜索词出现在 class 属性值里不误标', () => {
    const html = '<span class="j-key">"name"</span>';
    const r = markHtmlAll(html, 'j-key', 1);
    expect(r.count).toBe(0);
    expect(r.html).toBe(html);
  });

  it('大小写不敏感（gi）+ DOM 定位链可用（querySelector data-hit-idx）', () => {
    const r = markHtmlAll('Foo bar FOO', 'foo', 2);
    expect(r.count).toBe(2);
    const host = document.createElement('div');
    host.innerHTML = r.html;
    document.body.appendChild(host);
    expect(host.querySelector<HTMLElement>('[data-hit-idx="2"]')?.textContent).toBe('FOO');
    host.remove();
  });
});

describe('双视图改引源码锚（单源合并后本地实现退役）', () => {
  it('RestView：import markHtmlAll，计数（cur=0）与渲染（hitCur）两路同源', () => {
    expect(rest).toContain("import { markHtmlAll } from '../utils/respMark';");
    expect(rest).toContain('markHtmlAll(displayHtml.value, searchKw.value, 0).count');
    expect(rest).toContain('markHtmlAll(displayHtml.value, searchKw.value, hitCur.value).html');
    expect(rest).not.toContain('function hitsInHtml');
    expect(rest).not.toContain('function markHtml');
  });

  it('DslQueryView：import markHtmlAll，jsonMarkedHtml/计数两路同源；data-hit-idx 定位链保留', () => {
    expect(dsl).toContain("import { markHtmlAll } from '../utils/respMark';");
    expect(dsl).toContain('markHtmlAll(jsonViewHtml.value, jsonKw.value.trim(), 0).count');
    expect(dsl).toContain('markHtmlAll(jsonViewHtml.value, jsonKw.value.trim(), jsonFindCur.value).html');
    expect(dsl).not.toContain('function jsonHitsInHtml');
    /* jsonFindEscape500 H2 后半同步更新：当前命中 querySelector 定位串仍在视图（滚动链） */
    expect(dsl).toContain('data-hit-idx="${jsonFindCur.value}"');
    expect(dsl).not.toContain('${"${n}"}');
    expect(dsl).not.toContain('${"${jsonFindCur.value}"}');
  });

  it('jsonFindEscape500 H2 前半同步更新单源：mark 串是真插值（respMark 源）', () => {
    expect(respMarkSrc).toContain('data-hit-idx="${count}"');
    expect(respMarkSrc).not.toContain('${"${count}"}');
  });

  it('类名/属性逐字保形（单源内 j-mark/j-mark-cur/data-hit-idx 字面）', () => {
    expect(respMarkSrc).toContain('class="j-mark');
    expect(respMarkSrc).toContain('j-mark-cur');
  });
});

describe('同批单源合并：errPre escHtml → highlightSanitize.escapeHtml', () => {
  it('errPre.ts 改引单源（本地 function escHtml 退役）', () => {
    expect(errPre).toContain("import { escapeHtml } from './highlightSanitize';");
    expect(errPre).not.toContain('function escHtml');
    expect(errPre).toContain('escapeHtml(t)');
    expect(errPre).toContain('${escapeHtml(meta.code)}');
    expect(errPre).toContain('${escapeHtml(meta.endpoint)}');
  });

  it('escapeHtml 三连转义语义（& < > → 实体，与原 escHtml 逐字等价）', () => {
    expect(escapeHtml('a&b<c>d')).toBe('a&amp;b&lt;c&gt;d');
  });
});
