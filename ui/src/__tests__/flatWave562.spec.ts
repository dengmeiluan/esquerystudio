/**
 * 五百六十二批（工蚁4·轨4 全站扁平化扫荡第二波）：lint-bar 改用第二波 + 编辑器外框
 * strip 两波 + 红壳/标题档/裸红字合并 + 响应断点补齐。
 *
 *  ① lint-bar 改用第二波（561 约定 .lint-bar 单源，dt-lint「lint-bar + 原类名锚 + 档位」
 *     先例）：ScoreExplain .se-lint / UpdateByQuery .uq-lint / SqlConsole .sq-sql-lint /
 *     SqlBridge .br-sql-lint / BulkEditor .be-lint-warn 五面模板挂 lint-bar 双档，scoped
 *     私造形态退役（uq-lint 的 grid-column 落位与 BulkEditor info 版 .be-hint 基础档保留）；
 *  ② 编辑器外框 strip 第一波（560 批 sq-editor/be-card-editor 同语言视图侧独立追加）：
 *     RestView rt-body-ed / SystemView sy-qcard / PainlessLabView pl-editor 双编辑器；
 *  ③ strip 第二波：UpdateByQuery uq-script / ReindexAdvanced ra-f.wide / RawIoModal 弹窗
 *     双 Monaco / CreateIndexModal 弹窗双 Monaco（后两处沿 MappingView 弹窗裸类先例）；
 *  ④ ReconcileReportDrawer .rr-err 私造红壳合并 err-bar（558b pf-err 先例）+ role=alert；
 *  ⑤ SqlBridgeView 一键转换失败面板脱 .br-card 卡壳，err-bar 形态承载（.br-err-pre 槽类
 *     保留，对比表 br-card 页面级卡不动）+ role=alert；
 *  ⑥ sec-t 私造合并（挂全局 .sec-t 字排档，本地只留布局职责）：PainlessLab .pl-sec-tt /
 *     ProfileFlame .pf-section-tt；
 *  ⑦ SystemView .sy-inspect-err 裸红字挂全局 .il-hint.il-err（字排/色档同值，flex 布局留
 *     本地锚，margin-top 中和保原落位）；
 *  ⑧ ProfileFlameView .pf-summary 补 1100 档四列→两列（全站 1100 断点语言对齐，900 档
 *     既有两列不冲突）。
 *
 * 走源文本匹配理由同 flatWave561.spec.ts:20-22：happy-dom 下 scoped <style> 不参与计算，
 * 布局/接线断言只能是源文本断言；剥注释同 emptyStatePadding.spec.ts:29 教训——注释字面不算数。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const se = read('../views/ScoreExplainView.vue');
const uq = read('../views/UpdateByQueryView.vue');
const sql = read('../views/SqlConsoleView.vue');
const br = read('../views/SqlBridgeView.vue');
const be = read('../views/BulkEditorView.vue');
const rest = read('../views/RestView.vue');
const sys = read('../views/SystemView.vue');
const pl = read('../views/PainlessLabView.vue');
const ra = read('../views/ReindexAdvancedView.vue');
const pf = read('../views/ProfileFlameView.vue');
const rim = read('../components/RawIoModal.vue');
const cim = read('../components/CreateIndexModal.vue');
const rrd = read('../components/ReconcileReportDrawer.vue');
const theme = read('../theme.css');

/* ═══════════ ① lint-bar 改用第二波（561 约定单源，dt-lint 锚先例）═══════════ */

describe('562①：lint-bar 改用第二波——模板挂 lint-bar 双档（原类名锚并存）', () => {
  it('ScoreExplainView：se-lint 锚 + lint-bar err/warn 双档，role 语义保形', () => {
    expect(se).toContain('<div v-if="seLintErrors.length" role="alert" class="lint-bar se-lint lint-bar-err">');
    expect(se).toContain('<div v-else-if="seLintWarns.length" role="status" class="lint-bar se-lint lint-bar-warn">');
  });
  it('UpdateByQueryView：uq-lint 锚 + lint-bar 双档（全量删除红条 role=alert 保形）', () => {
    expect(uq).toContain('<div v-if="fullDeleteWarn" role="alert" class="lint-bar uq-lint lint-bar-err">');
    expect(uq).toContain('<div v-else-if="queryLintWarnings.length" class="lint-bar uq-lint lint-bar-warn">');
  });
  it('SqlConsoleView：sq-sql-lint 锚 + lint-bar-warn（role=status 保形）', () => {
    expect(sql).toContain('<div v-if="sqlLintFindings.length" class="lint-bar sq-sql-lint lint-bar-warn" role="status">');
  });
  it('SqlBridgeView：br-sql-lint 锚 + lint-bar-warn（role=status 保形）', () => {
    expect(br).toContain('<div v-if="brSqlLint.length" class="lint-bar br-sql-lint lint-bar-warn" role="status">');
  });
  it('BulkEditorView：warn 态改用 lint-bar 家族（be-lint-warn 锚并存），info 态保 be-hint', () => {
    expect(be).toContain(`<div v-if="ndjsonLint" :class="ndjsonLint.level === 'warn' ? 'be-lint-warn lint-bar lint-bar-warn' : 'be-hint'">`);
    expect(be, 'info 版静态 be-hint（:64 用途不同）勿动').toContain('<div class="be-hint">');
  });
  it('theme.css .lint-bar 单源三件仍在场（561 约定不回退）', () => {
    expect(theme).toMatch(/\.lint-bar \{[^}]*display: flex/);
    expect(theme).toMatch(/\.lint-bar-warn \{ background: var\(--warn-soft\); color: var\(--warn\); \}/);
    expect(theme).toMatch(/\.lint-bar-err \{ background: var\(--err-soft\); color: var\(--err\); \}/);
  });
});

describe('562①：lint-bar 改用第二波——scoped 私造形态退役（剥注释）', () => {
  it('ScoreExplainView：.se-lint 三条退役', () => {
    const s = strip(se);
    expect(s, '私造形态三条归 lint-bar 单源').not.toMatch(/\.se-lint(-warn|-err)? \{/);
  });
  it('UpdateByQueryView：.uq-lint 只留 grid-column 落位，双档退役', () => {
    const s = strip(uq);
    expect(s, '落位归父级保留').toContain('.uq-lint { grid-column: 1 / -1; }');
    expect(s, '私造形态不回流').not.toMatch(/\.uq-lint \{[^}]*padding/);
    expect(s, 'warn 档不回流').not.toMatch(/\.uq-lint-warn \{/);
    expect(s, 'err 档不回流').not.toMatch(/\.uq-lint-err \{/);
  });
  it('SqlConsoleView：.sq-sql-lint 私造外观整条退役（warn-line 边线随单源软底退役）', () => {
    const s = strip(sql);
    /* 1391：.sq-sql-lint 有了功能性规则（max-height / overflow），但**外观**仍必须归
       .lint-bar 单源——本条守的是「padding/背景/边框/warn-line 不回流」，不是禁止一切声明。 */
    expect(s, '私造外观不回流').not.toMatch(/\.sq-sql-lint \{[^}]*(padding|background|border|border-radius)/);
    expect(s, 'warn-line 边线不回流').not.toMatch(/\.sq-sql-lint[^}]*warn-line/);
  });
  it('SqlBridgeView：.br-sql-lint 整条退役', () => {
    expect(strip(br)).not.toMatch(/\.br-sql-lint \{/);
  });
  it('BulkEditorView：.be-hint.be-lint-warn 私造 warn 档退役，.be-hint 基础档保留', () => {
    const s = strip(be);
    expect(s, 'warn 态归 lint-bar-warn 单源').not.toMatch(/\.be-hint\.be-lint-warn/);
    expect(s, 'info 版基础档勿动').toMatch(/\.be-hint \{ display: flex; gap: var\(--sp-2\); padding: var\(--sp-2\); background: var\(--code-bg\);/);
  });
});

/* ═══════════ ② 编辑器外框 strip 第一波（560 批同语言视图侧追加）═══════════ */

describe('562②：编辑器外框 strip 第一波——视图侧独立规则追加', () => {
  it('RestView：rt-body-ed 外框退役（538 min-height 锚行零触）', () => {
    expect(rest).toContain('.rt-body-wrap > .rt-body-ed { border: none; border-radius: 0; }');
    expect(rest, '既有 min-height 锚行不触').toContain('.rt-body-wrap > .rt-body-ed { min-height: max(180px, 42vh); }');
  });
  it('SystemView：sy-qcard 下 monaco-host 外框退役', () => {
    expect(sys).toContain('.sy-qcard > :deep(.monaco-host) { border: none; border-radius: 0; }');
  });
  it('PainlessLabView：pl-editor 双编辑器（pl-src-ed/pl-params-ed）外框一条退役', () => {
    expect(pl).toContain('.pl-editor > :deep(.monaco-host) { border: none; border-radius: 0; }');
  });
});

/* ═══════════ ③ strip 第二波（弹窗沿 MappingView 裸类先例）═══════════ */

describe('562③：编辑器外框 strip 第二波', () => {
  it('UpdateByQueryView：uq-script 下 script 编辑器外框退役', () => {
    expect(uq).toContain('.uq-script > :deep(.monaco-host) { border: none; border-radius: 0; }');
  });
  it('ReindexAdvancedView：ra-f.wide source 编辑器外框退役', () => {
    expect(ra).toContain('.ra-f.wide > :deep(.monaco-host) { border: none; border-radius: 0; }');
  });
  it('RawIoModal：弹窗内请求/响应双 Monaco 裸类退役（MappingView 先例，本组件仅此两处 Monaco）', () => {
    expect((rim.match(/<MonacoEditor/g) ?? []).length, '仅两处 Monaco 全量覆盖').toBe(2);
    expect(rim).toContain('.monaco-host { border: none; border-radius: 0; }');
  });
  it('CreateIndexModal：弹窗内 Settings/Mapping 双 Monaco 裸类退役（MappingView 先例）', () => {
    expect((cim.match(/<MonacoEditor/g) ?? []).length, '仅两处 Monaco 全量覆盖').toBe(2);
    expect(cim).toContain('.monaco-host { border: none; border-radius: 0; }');
  });
});

/* ═══════════ ④ ReconcileReportDrawer 红壳合并 err-bar（558b pf-err 先例）═══════════ */

describe('562④：ReconcileReportDrawer .rr-err 合并 err-bar', () => {
  it('role=alert 在场 + err-bar 类挂载（v-if="loadErr" 条件保形）', () => {
    expect(rrd).toContain('<div v-if="loadErr" role="alert" class="err-bar rr-err">');
  });
  it('私造红壳退役（err 色/err-soft 底/radius/padding 归 theme.css :554 单源）', () => {
    const s = strip(rrd);
    expect(s).not.toMatch(/\.rr-err \{/);
  });
  it('theme.css .err-bar 单源仍在场', () => {
    expect(theme).toMatch(/\.err-bar \{[^}]*border: 1px solid var\(--err-line\);/);
  });
});

/* ═══════════ ⑤ SqlBridgeView 失败面板脱卡壳（err-bar 承载）═══════════ */

describe('562⑤：SqlBridgeView 一键转换失败面板脱 br-card 卡壳', () => {
  it('role=alert + err-bar 形态承载（br-card 壳退役，margin 内联落位保形）', () => {
    expect(br).toContain('<div v-if="convErr" role="alert" class="err-bar br-err" style="margin-bottom:var(--sp-3)">');
    expect(br, 'br-card 壳不再挂失败面板').not.toContain('class="br-card wide br-err"');
  });
  it('.br-err 只留多行富内容顶对齐（pf-err 先例），红壳三件套退役', () => {
    const s = strip(br);
    expect(s, '多行面板顶对齐保留').toMatch(/\.br-err \{ align-items: flex-start; \}/);
    expect(s, 'err-soft 底不回流').not.toMatch(/\.br-err \{[^}]*err-soft/);
    expect(s, 'err-line 边色不回流').not.toMatch(/\.br-err \{[^}]*err-line/);
    expect(s, '私造 padding 不回流').not.toMatch(/\.br-err \{[^}]*padding/);
  });
  it('.br-err-pre 槽类与对比表页面级 br-card 卡保留', () => {
    expect(br).toContain('.br-err-pre {');
    expect(br).toContain('<div class="br-card wide">');
  });
});

/* ═══════════ ⑥ sec-t 私造合并（全局 .sec-t 字排档）═══════════ */

describe('562⑥：sec-t 私造合并——挂全局 .sec-t，本地只留布局职责', () => {
  it('PainlessLabView：pl-sec-tt 挂 sec-t（字排三件归单源），padding 布局留本地', () => {
    expect(pl).toContain('<div class="sec-t pl-sec-tt">params（JSON）</div>');
    expect(strip(pl)).toContain('.pl-sec-tt { padding: var(--sp-1h) 0; }');
    expect(strip(pl), '字号/字重/色不回流').not.toMatch(/\.pl-sec-tt \{[^}]*font-size/);
  });
  it('ProfileFlameView：pf-section-tt 三处挂 sec-t，本地留分界线与行内排布', () => {
    expect((pf.match(/class="sec-t pf-section-tt"/g) ?? []).length, '三处标题全量改用').toBe(3);
    const s = strip(pf);
    expect(s).toMatch(/\.pf-section-tt \{ padding: var\(--sp-1h\) 0; border-bottom: 1px solid var\(--border\); display: flex; align-items: center; gap: var\(--sp-1h\); \}/);
    expect(s, '字号/字重/色不回流').not.toMatch(/\.pf-section-tt \{[^}]*font-size/);
  });
  it('theme.css .sec-t 单源仍在场', () => {
    expect(theme).toContain('.sec-t { font-size: var(--fs-sm); font-weight: 600; color: var(--tx1); }');
  });
});

/* ═══════════ ⑦ SystemView 裸红字挂 il-hint（561 RA il-hint 全站语言）═══════════ */

describe('562⑦：SystemView .sy-inspect-err 挂全局 il-hint.il-err', () => {
  it('模板挂 il-hint il-err（字排/色档归 theme.css :565-566 单源）', () => {
    expect(sys).toContain('<div v-if="inspectErr" class="sy-inspect-err il-hint il-err">');
  });
  it('本地只留 flex 布局锚（重试钮行内排布），字号/色退役；margin-top 中和保原落位', () => {
    const s = strip(sys);
    expect(s, 'flex 布局锚保留').toMatch(/\.sy-inspect-err \{[^}]*display: flex/);
    expect(s, '字号不回流').not.toMatch(/\.sy-inspect-err \{[^}]*font-size/);
    expect(s, 'err 色字面不回流').not.toMatch(/\.sy-inspect-err \{[^}]*color: var\(--err\)/);
  });
});

/* ═══════════ ⑧ ProfileFlameView 1100 档补齐 ═══════════ */

describe('562⑧：ProfileFlameView .pf-summary 补 1100 档两列', () => {
  it('@media (max-width:1100px) 四列降两列在场（全站 1100 断点语言对齐）', () => {
    expect(pf).toMatch(/@media \(max-width: 1100px\) \{\s*\.pf-summary \{ grid-template-columns: repeat\(2, 1fr\); \}\s*\}/);
  });
  it('900 档既有两列不回退', () => {
    expect(pf).toMatch(/@media \(max-width: 900px\) \{\s*\.pf-summary \{ grid-template-columns: repeat\(2, 1fr\); \}\s*\}/);
  });
});
