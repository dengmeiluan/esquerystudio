/* 全站 scoped 死类残量清零刀看守（785 批·死规则族第三刀）。
 *
 * 治理本体：七文件 13 条「模板/脚本/全树零挂载」的 scoped 死规则。780 批清了
 * .page-head 跨页族、783 批清了 theme.css 死全局四族，本刀是 views/components
 * scoped 层残量收官——本刀收口后全站 scoped 死类存量清零（死规则族战役闭册）。
 *
 * ── 13 条死因证据链（785 实勘：全树 grep 字面量+动态拼接前缀逐类甄别）──────
 * ① TemplateGallery .tg-hd-l/-ic/-tt/-sub 四条（原 212~216 区）：页头左组死类族
 *    （PageHeader 合并漏删族——713 G53/715 G56/717 G61/721 G72/727 G86/729 G94
 *    先例链在薄面档轮转期逐页清除，本页 708 首刀早于该方法成型故漏网）。
 *    全 src 树仅 style 段定义处 1 次出现；'tg-' 前缀无任何动态拼接形态
 *    （CmdPalette 的 'tgt-' 是另一命名域）。随删 G6-C 史志注释一条
 *    （它只服务 .tg-hd-tt）。
 * ② SqlConsole .sq-hd-hi（原 633）：孤儿强调样式——sq-hd 家族仅此一条，
 *    模板零 class="sq-hd*" 挂载（页头早已合并 PageHeader），无拼接前缀。
 * ③ DiagView .dg-grid/.dg-col/.dg-sk/.dg-chips 四条（原 637/638/644/645）：
 *    模板 class="dg*" 挂载全集实勘不含此四者（布局由 .dg 根容器 flex 流与
 *    .dg-ops-grid 承担）；529 批 900 档注释（原 711）提及 .dg-grid 同步诚实化。
 * ④ Templates .tv2-title（原 412）：模板零挂载（标题行已用 .tv2/.seg 语言）。
 * ⑤ Xmigrate .xm-jid（原 1304）：模板零挂载（作业 ID 已并入 QRT 行语言）。
 * ⑥ MappingFieldTree .mft-parent（原 330）：模板 :class 对象全集=
 *    {mft-pollute, mft-struct, mft-hit}，无 parent 态；字段树缩进由
 *    .mft-guide 深度 span 承担。
 * ⑦ AdhocRebuild .cd-same .cd-kind（原 2376）：kind 值域虽含 same，但
 *    utils/configDiffView.ts cfgParts 构建处 `if (r.kind === 'same' ||
 *    r.kind === 'ignored') continue` 恒剪除——same 行永不进 real/benign 桶，
 *    `'cd-' + row.kind` 挂载不可达=恒空匹配。相邻 .cd-added/.cd-removed/
 *    .cd-changed/.cd-conflict 四条活（kind 值域可达）保留。
 *
 * 假阳性甄别记录（本刀不动的近亲，防后人误抄回删）：
 * 'lv-'+'level'、'st-'+'state'、'qrt/rt-sem-'+'tone'、'av-'+'role'、
 * 'h-'+'health'、prefix+'-agg-mm'、qCls+'-ic'、'cd-'+'kind'（changed/conflict
 * 可达）、sw-fade-*（Transition name 生成类）——全是运行时拼接活类。
 *
 * ── 断言口径（与 783 同款）────────────────────────────────────
 * 落在源文本上；strip 注释后断言（史志注释允许提死符号，705-C1）；尾界
 * (?![\w-]) 防前缀近亲（.tg-hd-l 不误伤 .tg-hd-legit 族）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = join(__dirname, '..');
const vue = (rel: string) => readFileSync(join(srcDir, rel), 'utf8');
const strip = (s: string) => s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
const hasSel = (code: string, cls: string) =>
  new RegExp('\\.' + cls + '(?![\\w-])').test(strip(code));

describe('deadClassSweep785 · 全站 scoped 死类残量清零（死规则族第三刀）', () => {
  /* —— A 组：13 死符号任何形态不得回魂（先红主战场） —— */

  it('A1 TemplateGallery tg-hd-l/-ic/-tt/-sub 四死类清零（PageHeader 合并漏删族收官）', () => {
    const code = vue('views/TemplateGalleryView.vue');
    for (const cls of ['tg-hd-l', 'tg-hd-ic', 'tg-hd-tt', 'tg-hd-sub']) {
      expect(hasSel(code, cls), `死类 .${cls} 复发`).toBe(false);
    }
  });

  it('A2 SqlConsole sq-hd-hi 死类清零（sq-hd 孤儿强调样式）', () => {
    expect(hasSel(vue('views/SqlConsoleView.vue'), 'sq-hd-hi'), '死类 .sq-hd-hi 复发').toBe(false);
  });

  it('A3 DiagView dg-grid/dg-col/dg-sk/dg-chips 四死类清零（布局由 .dg 流与 .dg-ops-grid 承担）', () => {
    const code = vue('views/DiagView.vue');
    for (const cls of ['dg-grid', 'dg-col', 'dg-sk', 'dg-chips']) {
      expect(hasSel(code, cls), `死类 .${cls} 复发`).toBe(false);
    }
  });

  it('A4 Templates tv2-title 死类清零', () => {
    expect(hasSel(vue('views/TemplatesView.vue'), 'tv2-title'), '死类 .tv2-title 复发').toBe(false);
  });

  it('A5 Xmigrate xm-jid 死类清零', () => {
    expect(hasSel(vue('views/XmigrateView.vue'), 'xm-jid'), '死类 .xm-jid 复发').toBe(false);
  });

  it('A6 MappingFieldTree mft-parent 死类清零（树态三元组 pollute/struct/hit 之外无 parent 态）', () => {
    expect(hasSel(vue('components/MappingFieldTree.vue'), 'mft-parent'), '死类 .mft-parent 复发').toBe(false);
  });

  it('A7 AdhocRebuild cd-same 死类清零（same 行被 cfgParts continue 恒剪除=挂载不可达）', () => {
    expect(hasSel(vue('views/AdhocRebuildView.vue'), 'cd-same'), '死类 .cd-same 复发（same 行永不渲染，样式恒空匹配）').toBe(false);
  });

  it('A8 BulkEditor be-hd-r 死类清零（页头并入 PageHeader 后右组修饰零挂载，规则与滞留「保留」头注随刀清）', () => {
    expect(hasSel(vue('views/BulkEditorView.vue'), 'be-hd-r'), '死类 .be-hd-r 复发（模板零挂载，样式恒空匹配）').toBe(false);
  });

  /* —— B 组：相邻活类正向锚（防全删绿；规则形态断言非宽松 includes） —— */

  it('B1 TemplateGallery 活锚 .tg-hd / .tg-search 规则在场', () => {
    const code = strip(vue('views/TemplateGalleryView.vue'));
    expect(/\.tg-hd\s*\{/.test(code), '.tg-hd 活锚丢失').toBe(true);
    expect(/\.tg-search\s*\{/.test(code), '.tg-search 活锚丢失').toBe(true);
  });

  it('B2 SqlConsole 活锚 .sq-tog / .sq-warn 规则在场', () => {
    const code = strip(vue('views/SqlConsoleView.vue'));
    expect(/\.sq-tog\s*\{/.test(code), '.sq-tog 活锚丢失').toBe(true);
    expect(/\.sq-warn\s*\{/.test(code), '.sq-warn 活锚丢失').toBe(true);
  });

  it('B3 DiagView 活锚 .dg-auto-lbl / .dg-okline / .dg-ops-grid 规则在场', () => {
    const code = strip(vue('views/DiagView.vue'));
    for (const cls of ['dg-auto-lbl', 'dg-okline', 'dg-ops-grid']) {
      expect(new RegExp('\\.' + cls + '\\s*\\{').test(code), `.${cls} 活锚丢失`).toBe(true);
    }
  });

  it('B4 Templates 活锚 .tv2-tab-n 规则在场', () => {
    expect(/\.tv2-tab-n\s*\{/.test(strip(vue('views/TemplatesView.vue'))), '.tv2-tab-n 活锚丢失').toBe(true);
  });

  it('B5 Xmigrate 活锚 .xm-hit 深度规则在场（QRT 行定位强调）', () => {
    expect(/tr\.xm-hit/.test(strip(vue('views/XmigrateView.vue'))), '.xm-hit 活锚丢失').toBe(true);
  });

  it('B6 MappingFieldTree 活锚 .mft-tree / .mft-name 规则在场', () => {
    const code = strip(vue('components/MappingFieldTree.vue'));
    expect(/\.mft-tree\s*\{/.test(code), '.mft-tree 活锚丢失').toBe(true);
    expect(/\.mft-name\s*\{/.test(code), '.mft-name 活锚丢失').toBe(true);
  });

  it('B7 AdhocRebuild 活锚 cd- 四态规则在场（added/removed/changed/conflict 值域可达）', () => {
    const code = strip(vue('views/AdhocRebuildView.vue'));
    for (const cls of ['cd-added', 'cd-removed', 'cd-changed', 'cd-conflict']) {
      expect(new RegExp('\\.' + cls + '\\s+\\.cd-kind').test(code), `.${cls} .cd-kind 活锚丢失`).toBe(true);
    }
  });

  it('B8 BulkEditor 活锚 .be-card-hd / .be-stat 规则在场（A8 只清 be-hd-r 孤儿，家族活类不动）', () => {
    const code = strip(vue('views/BulkEditorView.vue'));
    expect(/\.be-card-hd\s*\{/.test(code), '.be-card-hd 活锚丢失').toBe(true);
    expect(/\.be-stat\s*\{/.test(code), '.be-stat 活锚丢失').toBe(true);
  });

  /* —— C 组：结构锚 —— */

  it('C1 AdhocRebuild cd-kind 色规则恰 4 条（added/removed/changed/conflict；same 已剪）', () => {
    const code = strip(vue('views/AdhocRebuildView.vue'));
    const n = (code.match(/\.cd-[\w-]+\s+\.cd-kind\s*\{/g) || []).length;
    expect(n, `cd-kind 色规则应恰 4 条，实得 ${n}`).toBe(4);
  });
});
