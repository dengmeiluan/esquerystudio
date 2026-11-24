/**
 * 1445：行内 code 位点统一吃 theme.css 全局 chip 档（六页收口看守）。
 *
 * 背景：theme.css 已落全局档 `code:not(pre code){background:var(--bg2);padding:1px 5px;
 * border-radius:var(--r-xs);font-size:.92em;overflow-wrap:anywhere}`。此前六页各自为政：
 * 四种私造皮（IndexSettings bg2+3px / Aliases bg2+3px / Ilm bg1+2px / Lucene code-bg+2px）、
 * 模板卡 .lc-tpl-c 又一种，另有一批位点（Dsl taskId / Forbidden 权限信息 / Lucene 语法速查
 * 裸 code）完全无皮。收口原则：局部规则只许留差异化（color/字号/折行），容器皮三件
 * （background/padding/border-radius）一律退役吃全局档——同底同距同圆角。
 *
 * 本 spec 源码锚（adhocWave544 范式）：
 *  ① 前提：theme.css 全局 chip 档在场（消费前提；档本体形态由全局侧看守）；
 *  ② 六页 style 块内「选择器含 code 的规则行」不得再声明 background/padding/border-radius；
 *  ③ 收口后差异化残行逐字锚（is-hint/ilm-ex-unmg 只剩 info 色；lc-tpl-c 只留落位）；
 *  ④ 裸 code 位点标签锚：taskId/权限信息/语法速查均为 <code> 标签（吃全局档的前提）；
 *  ⑤ 同批原生 <select> 清零（IndexSettings blocks.* 三处 / Lucene order / Dsl 请求选项
 *     enum 参数）换 NSelect（v-model:value + options 映射，选项语义不变）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

const PAGES = [
  '../views/IndexSettingsView.vue',
  '../views/AliasesView.vue',
  '../views/IlmView.vue',
  '../views/LuceneQueryView.vue',
  '../views/DslQueryView.vue',
  '../views/ForbiddenView.vue',
];

/** style 块内选择器含 code 元素的规则行，提取出「选择器 { 声明 }」文本（注释行剔除） */
function codeRuleLines(src: string): string[] {
  const hits: string[] = [];
  let inStyle = false;
  for (const raw of src.split('\n')) {
    if (/<style/.test(raw)) { inStyle = true; continue; }
    if (/<\/style>/.test(raw)) { inStyle = false; continue; }
    if (!inStyle) continue;
    const t = raw.trim();
    if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('//')) continue;
    /* 选择器段含独立 code 词（.dq-dbq code / .is-hint code；排除 ecode 之类误命中） */
    const m = t.match(/(^|[^-\w])code[^{]*\{[^}]*\}/);
    if (m) hits.push(t);
  }
  return hits;
}

describe('1445 行内 code chip 全局档收口', () => {
  it('① 前提：theme.css 全局 chip 档在场（bg2 底 + 内距 + xs 圆角）', () => {
    const css = read('../theme.css');
    expect(css).toMatch(/code:not\(pre code\)\s*\{\s*background:\s*var\(--bg2\);\s*padding:\s*1px 5px;\s*border-radius:\s*var\(--r-xs\);/);
    expect(css).toMatch(/code, pre, \.mono \{ font-family: var\(--mono\); \}/);
  });

  it('② 六页局部 code 规则的 background/padding/border-radius 声明恒零（差异化豁免）', () => {
    const dirty: string[] = [];
    for (const p of PAGES) {
      for (const line of codeRuleLines(read(p))) {
        if (/background\s*:|padding|border-radius/.test(line)) dirty.push(`${p}: ${line}`);
      }
    }
    expect(dirty, `局部 code 规则不得私造容器皮，一律吃全局档:\n${dirty.join('\n')}`).toEqual([]);
  });

  it('③ 收口后差异化残行逐字锚（只留 color/落位，容器皮不回潮则本锚不红）', () => {
    expect(read('../views/IndexSettingsView.vue')).toContain('.is-hint code { color: var(--info); }');
    expect(read('../views/IlmView.vue')).toContain('.ilm-ex-unmg code { color: var(--info); }');
    expect(read('../views/LuceneQueryView.vue')).toContain('.lc-tpl-c { display: inline-block; margin-right: var(--sp-1h); }');
    /* Aliases 无差异化保留项：整行退役，负向锁不回潮 */
    expect(read('../views/AliasesView.vue')).not.toContain('.alv-sw-hint code');
    expect(read('../views/LuceneQueryView.vue')).not.toContain('.lc-syn-col code');
  });

  it('④ 裸 code 位点均为 <code> 标签（taskId / 权限信息 / 语法速查自动吃全局档）', () => {
    expect(read('../views/DslQueryView.vue')).toContain('taskId <code>{{ dbqTaskId }}</code>');
    expect(read('../views/DslQueryView.vue')).toMatch(/\.dq-dbq code \{ color: var\(--ac-hi\); word-break: break-all; \}/);
    expect(read('../views/ForbiddenView.vue')).toMatch(/\.fb-row code \{ font-family: var\(--mono\); font-size: var\(--fs-xs\); color: var\(--tx2\); \}/);
    /* 语法速查裸 code 抽查首尾锚 */
    const lq = read('../views/LuceneQueryView.vue');
    expect(lq).toContain('<li><code>field:value</code> 精确</li>');
    expect(lq).toContain('<li><code>msg:"quick fox"~5</code> 邻近</li>');
  });
});

describe('1445 原生 select 换 NSelect（同批散页清理）', () => {
  it('⑤a 三页原生 <select> 清零', () => {
    for (const p of ['../views/IndexSettingsView.vue', '../views/LuceneQueryView.vue', '../views/DslQueryView.vue']) {
      expect(read(p), `${p} 不应再有原生 select`).not.toContain('<select');
    }
  });

  it('⑤b NSelect 落位锚：import + v-model:value + options 单源（控件升档批同步更新 import 面）', () => {
    const isv = read('../views/IndexSettingsView.vue');
    expect(isv).toContain("import { NSelect, NInputNumber } from 'naive-ui'");
    expect(isv).toMatch(/<n-select v-model:value="form\['blocks\.read_only'\]" :options="blockOpts\(/);
    expect(isv).toMatch(/<n-select v-model:value="form\['blocks\.read_only_allow_delete'\]"/);
    expect(isv).toMatch(/<n-select v-model:value="form\['blocks\.write'\]"/);
    expect(isv).toContain("{ label: '- 未设置 -', value: '' }");

    const lq = read('../views/LuceneQueryView.vue');
    expect(lq).toContain("import { NModal, NSelect, NInputNumber } from 'naive-ui'");
    expect(lq).toMatch(/<n-select v-model:value="sortOrder" :options="ORDER_OPTS"/);

    const dq = read('../views/DslQueryView.vue');
    expect(dq).toContain("import { NModal, NPopover, NSelect, NCheckbox, NRadioGroup, NRadio } from 'naive-ui'");
    expect(dq).toMatch(/<n-select v-if="p\.options" v-model:value="reqValues\[p\.key\]" :options="reqOptsOf\(p\)"/);
    expect(dq).toMatch(/\[\{ label: '默认', value: '' \}, \.\.\.\(p\.options \?\? \[\]\)\.map\(o => \(\{ label: o, value: o \}\)\)\]/);
  });
});
