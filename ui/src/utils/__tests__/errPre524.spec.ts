/**
 * 五百二十四批：errPreHtml 两形态契约——错误面板 pre v-html 收口内核。
 *  ① 内容含 '{' → 走 highlightJson（span 着色 + 内部已转义）；
 *  ② 纯平文 → HTML 转义（& < > 三字符），无 span 注入；
 *  ③ 转义安全：'<script>' 等注入形态不得以可执行字面量出现在输出里。
 */
import { describe, it, expect } from 'vitest';
import { errPreHtml } from '../errPre';
import { highlightJson } from '../jsonc';

describe('errPreHtml（五百二十四批）', () => {
  it('含 { 走 highlightJson：输出带语法 span、且原文特殊字符已转义', () => {
    const html = errPreHtml('{"error":{"root_cause":[{"type":"a < b"}]}}');
    expect(html).toContain('<span class="j-key">');
    expect(html).toContain('<span class="j-str">');
    expect(html).toContain('&lt;'); /* '<' 已转义，v-html 不可注入 */
  });

  it('纯平文走转义：无 span 注入、换行原样保留（pre 白名单语义）', () => {
    const html = errPreHtml('连接失败: A & B < C\n请重试');
    expect(html).not.toContain('<span');
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;');
    expect(html).toContain('\n');
  });

  it('转义安全：<script> / <img onerror> 在两形态下都不以字面量出现', () => {
    const plain = errPreHtml('<script>alert(1)</script>');
    expect(plain).not.toContain('<script>');
    const jsonish = errPreHtml('{"msg":"<img src=x onerror=alert(1)>"}');
    expect(jsonish).not.toContain('<img');
    expect(jsonish).toContain('&lt;img');
  });

  it('json-view 契约：合法 JSON 着色类与 highlightJson 输出完全一致', () => {
    const src = '{"took": 5, "ok": true, "n": null}';
    expect(errPreHtml(src)).toBe(highlightJson(src));
  });

  it('空串/undefined 兜底不抛（错误位可能是空 ref 初值）', () => {
    expect(errPreHtml('')).toBe('');
    expect(errPreHtml(undefined as unknown as string)).toBe('');
  });

  /* ═══ 五百三十三批随迁：可选 meta 不破坏单参契约（徽标/端点本体断言在 obsProgress533） ═══ */
  it('五百三十三批：不传 meta 与传空 meta 输出与单参完全一致（旧调用零漂移）', () => {
    const json = '{"code":"X"}';
    const plain = '连接失败: A < B';
    expect(errPreHtml(json)).toBe(errPreHtml(json, {}));
    expect(errPreHtml(plain)).toBe(errPreHtml(plain, {}));
    expect(errPreHtml(json, {})).toBe(highlightJson(json));
  });
});
