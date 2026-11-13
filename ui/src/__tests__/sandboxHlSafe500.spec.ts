/**
 * v3.0.0 高亮纠错深扫：SearchSandbox highlight 净化（hlSafe）。
 * 背景：ES highlight 片段是文档内容直出的 HTML，此前裸 v-html 渲染=存储型注入面
 * （文档含 <img onerror> 即进 DOM）。净化口径=整段转义后只放行本页 auto-highlight
 * 注入的受控标签 <em class="hl">（pre_tags 是页面常量，非文档可控）。
 * 558b 同步更新：hlSafe 单源迁 utils/highlightSanitize（SearchSandboxView 改 import 消费，
 * 逻辑逐字平移），本件从源码正则抽取改为直接 import 单源验证；断言逐字保留。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hlSafe } from '../utils/highlightSanitize';

const v = readFileSync(join(__dirname, '../views/SearchSandboxView.vue'), 'utf-8');

describe('hlSafe：ES highlight 片段净化（v3.0.0）', () => {

  it('模板接线：v-html 走 hlSafe 且数组 join 后仍净化', () => {
    expect(v).toContain('v-html="hlSafe(Array.isArray(v) ? v.join(\' … \') : String(v))"');
  });

  it('受控 <em class="hl"> 标签原样放行（高亮渲染保真）', () => {
    const out = hlSafe('前<em class="hl">词</em>后');
    expect(out).toBe('前<em class="hl">词</em>后');
  });

  it('文档携带的 <script>/<img onerror> 全转义为纯文本', () => {
    const out = hlSafe('<img src=x onerror=alert(1)>正常<em class="hl">词</em>');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(out).not.toContain('<img');
    expect(out).toContain('<em class="hl">词</em>');
  });

  it('大小写变体/单引号变体的伪 hl 标签不放行', () => {
    const out = hlSafe('<EM CLASS="hl">x</EM><em class=\'hl\'>y</em>');
    expect(out).not.toContain('<em');
    expect(out).not.toContain('<EM');
    expect(out).toContain('&lt;');
  });

  it('裸 & < > 转义不破坏（文档内容保真展示）', () => {
    expect(hlSafe('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('无标签纯文本原样通过', () => {
    expect(hlSafe('普通文本 123')).toBe('普通文本 123');
  });
});
