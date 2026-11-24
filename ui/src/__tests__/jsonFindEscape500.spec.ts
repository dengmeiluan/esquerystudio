/**
 * v3.0.0 高亮纠错深扫：JSON 视图内搜索正则与定位链。
 * 两个实锤 bug 的回归锁：
 *   H2 DslQueryView jsonMarkedHtml/watch 里模板串写成 ${"${n}"}（字面量）——
 *      data-hit-idx 恒为字面量文本，当前命中滚动定位整链失效；
 *   H3/H4 escapeRe 字符类错位（[\\]\\ 而非 [\]\\）——元字符替换零命中，
 *      含 . { } ( 的搜索词在 RestView 恒 0 命中。
 * 与源码结构断言（459 批 sandbox spec 同款轻量挂法）+ 正则行为直测。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dsl = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
/* 五百六十一批同步更新：mark 内核（escapeRe/markHtmlAll）合并 utils/respMark 单源——
   H2 mark 串与 H4 escapeRe 字符类两处源锚同步更新单源文件（原 RestView 源锚随单源退役移除） */
const respMark = readFileSync(join(__dirname, '../utils/respMark.ts'), 'utf-8');

describe('JSON 视图内搜索：正则与定位链（v3.0.0 纠错）', () => {
  it('H2: jsonMarkedHtml 的 data-hit-idx 必须是真插值（禁止 ${"..." 字面量形态）', () => {
    /* 五百六十一批同步更新：mark 串产本体的 ${n} → 单源 markHtmlAll 内 ${count} */
    expect(respMark).toContain('data-hit-idx="${count}"');
    expect(dsl).toContain('data-hit-idx="${jsonFindCur.value}"');
    expect(dsl).not.toContain('${"${n}"}');
    expect(dsl).not.toContain('${"${jsonFindCur.value}"}');
  });

  it('H4: escapeRe 字符类必须是标准写法（[\\]\\\\ 而非 [\\\\]\\\\；五百六十一批同步更新单源锚）', () => {
    expect(respMark).toContain("kw.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')");
    expect(respMark).not.toContain('[\\\\]\\\\]/g');
  });

  it('行为直测：escapeRe 后的正则对元字符关键字计数正确', () => {
    const escapeRe = (kw: string) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const html = '<span class="j-key">"name"</span>: <span class="j-str">"a.b(c)"</span>';
    const parts = html.split(/(<[^>]+>)/g);
    const re = new RegExp(escapeRe('a.b(c)'), 'gi');
    let c = 0;
    for (let i = 0; i < parts.length; i += 2) c += (parts[i].match(re) || []).length;
    expect(c).toBe(1);
  });

  it('markHtml 输出的 data-hit-idx 是递增数字（querySelector 定位可用）', () => {
    const escapeRe = (kw: string) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const html = 'foo bar foo';
    const parts = html.split(/(<[^>]+>)/g);
    let count = 0;
    const re = new RegExp(escapeRe('foo'), 'gi');
    const marked = parts.map((p, i) => {
      if (i % 2 !== 0) return p;
      return p.replace(re, (m) => `<mark data-hit-idx="${++count}">${m}</mark>`);
    }).join('');
    expect(marked).toContain('data-hit-idx="1"');
    expect(marked).toContain('data-hit-idx="2"');
    // 挂到真实 DOM 验证 querySelector 定位链（此前恒空=当前命中滚动失效根因）
    const host = document.createElement('div');
    host.innerHTML = marked;
    document.body.appendChild(host);
    expect(host.querySelector<HTMLElement>('[data-hit-idx="2"]')?.textContent).toBe('foo');
    host.remove();
  });
});
