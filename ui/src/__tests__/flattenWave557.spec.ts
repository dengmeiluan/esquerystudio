/**
 * 五百五十七批（工蚁5·轨4）：扁平化·编辑器外框退壳 + 手写空态合并 EmptyState。
 * 静态源码断言仿 flattenWave554 范式（strip 注释后逐字锚 + 不回流负锁）。
 *
 * ① 编辑器外框退役 7 面：.ja 外框（JsonArea 根 1px line 框+radius）经视图侧 :deep 覆盖退役
 *    （AnalysisSettingsView as-card-raw:365 / RankDebug:418 等五先例同语言；JsonArea 组件
 *    本体零触）。⚠SearchTemplatesView 面编辑器是 MonacoEditor（非 JsonArea），外框在组件
 *    .monaco-host（禁改件）——视图侧 :deep(.monaco-host) 同手法退役，spec 特记 monaco 面。
 *    分界承接：ss-editor/df-card-hd/st-card-hd 既有 border-bottom；rp-left/tv2-editor 全局
 *    .card-t 无 border 补承接线；pf-inputs 工具条行补 border-bottom；ilm 弹窗面由
 *    n-modal 卡头 + ja-bar 工具条自承分界（备案不另补）。
 * ② 手写空态合并 EmptyState 6 面 8 处（文案逐字保留，只换容器形态）：rp-empty「运行中…」、
 *    st-list-empty ×2（拉取失败档 + 过滤空档）、df-diff-empty「无差异」、al-empty「尚未运行…」、
 *    bt-empty-sub ×2、as-empty-sub「-」。
 *    ⚠豁免备案：SearchTemplatesView .st-list-empty CSS 规则文本被 flattenWave554:159
 *    源码锁钉死（彼 spec 非独占域不可改）——规则暂留、模板消费清零，随其解锁一并退役。
 * ③ AnalyzerLabView token type 视觉档：type 此前只进 :title 全列同色——tokTier 纯函数
 *    （<>壳剥离+小写后数值/同义两族精确匹配，防 <ALPHANUM> 裸 includes('num') 误入数值档）
 *    → info/warn 两色档 class，其余维持默认档；纯 class 附加零结构。
 * ④ 固定宽 min() 极窄钳制（546 AliasesView / 547 paneShell 同范式）：IlmView 过滤框内联
 *    width:200px、BoostTunerView .bt-ii 180px / .bt-fname 140px。
 * ⑤ esError 兜底 ×2（XmigrateView w80 先例）：IlmView ilm/move 失败、AnalysisSettingsView
 *    保存失败裸 err → friendlyEsError(String(e?.message ?? e))。
 *
 * 范围铁律：纯视觉层——高度链/flex 语义零变动（退壳只摘框）、ProfileFlameView QRT
 * max-height=420px 与 :loading 锁（tableKernelWave532）零触、禁改件零触。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
/* 剥 CSS/HTML 注释：注释里的字面不算数（lrBarSingleTrack/emptyStatePadding 同一教训） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* ═══════════ ① 编辑器外框退役 7 面 ═══════════ */

describe('五百五十七批①：编辑器外框退役 7 面（视图侧 :deep 覆盖，组件本体零触）', () => {
  it('SearchSandboxView：ss-editor 面 .ja 退壳（card-t border-bottom 既有承接）', () => {
    expect(read('../views/SearchSandboxView.vue')).toContain('.ss-editor :deep(.ja) { border: none; border-radius: 0; }');
  });
  it('ReindexPreviewView：rp-left 面 .ja 退壳 + card-t 承接线补齐（全局 .card-t 无 border）', () => {
    const s = read('../views/ReindexPreviewView.vue');
    expect(s).toContain('.rp-left :deep(.ja) { border: none; border-radius: 0; }');
    expect(s).toContain('.rp-left > .card-t { border-bottom: 1px solid var(--border); padding-bottom: var(--sp-2); }');
  });
  it('SearchTemplatesView：st-ed-wrap 面 monaco-host 退壳（组件禁改，视图侧覆盖）', () => {
    expect(read('../views/SearchTemplatesView.vue')).toContain('.st-ed-wrap :deep(.monaco-host) { border: none; border-radius: 0; }');
  });
  it('TemplatesView：tv2-editor 面 .ja 退壳 + card-t 承接线补齐（全局 .card-t 无 border）', () => {
    const s = read('../views/TemplatesView.vue');
    expect(s).toContain('.tv2-editor :deep(.ja) { border: none; border-radius: 0; }');
    expect(s).toContain('.tv2-editor > .card-t { border-bottom: 1px solid var(--border); padding-bottom: var(--sp-2); }');
  });
  it('IlmView：策略编辑弹窗 ilm-policy-ja 面 .ja 退壳（ja-bar 自承分界，备案不另补线）', () => {
    expect(read('../views/IlmView.vue')).toContain('.ilm-policy-ja { border: none; border-radius: 0; }');
  });
  it('ProfileFlameView：pf-body-wrap 面 .ja 退壳 + pf-inputs 工具条承接线补齐', () => {
    const s = read('../views/ProfileFlameView.vue');
    expect(s).toContain('.pf-body-wrap :deep(.ja) { border: none; border-radius: 0; }');
    expect(s).toMatch(/\.pf-inputs \{[^}]*border-bottom: 1px solid var\(--border\);/);
  });
  it('DiffEditorView：df-card 面 .ja 退壳（df-card-hd border-bottom 既有承接）', () => {
    expect(read('../views/DiffEditorView.vue')).toContain('.df-card :deep(.ja) { border: none; border-radius: 0; }');
  });
  it('AnalysisSettingsView：as-card-raw 先例已在场（365 先例，只核对不重做）', () => {
    expect(read('../views/AnalysisSettingsView.vue')).toContain('.as-card-raw :deep(.ja) { flex: 1; min-height: 0; border: none; border-radius: 0; }');
  });
  it('JsonArea 组件本体零触（.ja 原始带框规则原样，防回流锚）', () => {
    expect(read('../components/JsonArea.vue')).toContain('.ja { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--r-s); overflow: hidden; background: var(--bg0); }');
  });
});

/* ═══════════ ② 手写空态合并 EmptyState 6 面 ═══════════ */

describe('五百五十七批②：手写空态合并 EmptyState 6 面（文案逐字保留，只换容器形态）', () => {
  it('ReindexPreviewView：rp-empty「运行中…」合并 compact（裸 div 与本地规则双退役）', () => {
    const s = strip(read('../views/ReindexPreviewView.vue'));
    expect(s).toContain('<EmptyState v-if="busy && !result" compact :icon="RefreshCw" text="运行中…" />');
    expect(s, 'rp-empty 模板消费与样式规则清零').not.toMatch(/rp-empty/);
  });
  it('SearchTemplatesView：st-list-empty ×2 合并（失败档+过滤空档）；死码规则随 561 批退役', () => {
    const s = strip(read('../views/SearchTemplatesView.vue'));
    expect(s).toContain("<EmptyState v-if=\"loadErr\" compact :icon=\"RefreshCw\" :text=\"'拉取失败：' + loadErr\" action-text=\"重试\" @action=\"load\" />");
    expect(s).toContain('<EmptyState v-if="tplFilter && !filteredTemplates.length" compact :icon="LayoutTemplate" text="无匹配模板" />');
    expect(s, 'st-list-empty 模板消费清零').not.toMatch(/class="st-list-empty/);
    expect(s, '失败档专用规则随合并退役').not.toMatch(/\.st-list-err/);
    /* 五百六十一批同步更新：死码 CSS 规则立删（554:159 源码锁同步更新负锁防回流） */
    expect(strip(read('../views/SearchTemplatesView.vue'))).not.toMatch(/\.st-list-empty/);
  });
  it('DiffEditorView：df-diff-empty「无差异」合并 compact（裸 div 与本地规则双退役）', () => {
    const s = strip(read('../views/DiffEditorView.vue'));
    expect(s).toContain('<EmptyState v-if="diffLines.length === 0" compact :icon="GitCompareArrows" text="无差异" />');
    expect(s).not.toMatch(/df-diff-empty/);
  });
  it('AnalyzerLabView：al-empty「尚未运行…」合并 compact（裸 div 与本地规则双退役）', () => {
    const s = strip(read('../views/AnalyzerLabView.vue'));
    expect(s).toContain('<EmptyState v-else-if="!l.tokens.length" compact :icon="Play" text="尚未运行 · 点「试跑」查看分词结果" />');
    expect(s).not.toMatch(/al-empty/);
  });
  it('BoostTunerView：bt-empty-sub ×2 合并 compact（真空 + 过滤空；「无匹配字段」textContent 锚保真）', () => {
    const s = strip(read('../views/BoostTunerView.vue'));
    expect(s).toContain('<EmptyState v-if="!fields.length" compact :icon="Plus" text="点「加字段」，输入参与打分的字段名" />');
    expect(s).toContain('<EmptyState v-if="fields.length && !shownFields.length" compact :icon="Search" text="无匹配字段——清空上方过滤词恢复全部行" />');
    expect(s).not.toMatch(/bt-empty-sub/);
  });
  it('AnalysisSettingsView：as-empty-sub「-」分组空占位合并 compact（524 保留裁决由覆盖）', () => {
    const s = strip(read('../views/AnalysisSettingsView.vue'));
    expect(s).toContain('<EmptyState v-if="!g.shown || !Object.keys(g.shown).length" compact :icon="Info" text="-" />');
    expect(s).not.toMatch(/as-empty-sub/);
  });
});

/* ═══════════ ③ token type 视觉档 ═══════════ */

describe('五百五十七批③：AnalyzerLabView token type 视觉档（:title 之外给色档）', () => {
  it('tokTier 接线：:class 挂载 + 纯函数在场 + 数值/同义两色档 CSS（默认档零迁）', () => {
    const s = strip(read('../views/AnalyzerLabView.vue'));
    expect(s).toContain(':class="tokTier(t.type)"');
    expect(s).toMatch(/function tokTier\(/);
    expect(s).toContain('.al-tok.al-tok-num { background: var(--info-soft); color: var(--info); }');
    expect(s).toContain('.al-tok.al-tok-syn { background: var(--warn-soft); color: var(--warn); }');
  });
  it('ALPHANUM 防误档判据在场（<>壳剥离后再精确族匹配，不裸 includes）', () => {
    expect(strip(read('../views/AnalyzerLabView.vue'))).toContain(".replace(/[<>]/g, '')");
  });
});

/* ═══════════ ④ 固定宽 min() 钳制 ═══════════ */

describe('五百五十七批④：固定宽 min() 极窄钳制（546 AliasesView / 547 paneShell 同范式）', () => {
  it('IlmView：过滤框内联宽 200px → min(200px,100%)（裸 200px 不回流）', () => {
    const s = read('../views/IlmView.vue');
    expect(s).toContain('style="width:min(200px,100%)"');
    expect(s).not.toContain('style="width:200px"');
  });
  it('BoostTunerView：bt-ii 随 772 首刀 G245 整删（死类不回潮），bt-fname 140px min() 钳制保留', () => {
    /* 五百五十七批原锁 .bt-ii min(180px,100%)——IndexPicker 五百二十五批退役后该输入框
       模板零引用，772 首刀 G245 死规则整删（760 先例：改属性连锁断源码锁→同步更新负向锚） */
    const s = read('../views/BoostTunerView.vue');
    expect(s, '.bt-ii 死规则不回潮（模板零引用）').not.toMatch(/\.bt-ii\b/);
    expect(s).toContain('.bt-fname { width: min(140px, 100%);');
  });
});

/* ═══════════ ⑤ esError 兜底 ×2 ═══════════ */

describe('五百五十七批⑤：esError 兜底 ×2（XmigrateView w80 先例）', () => {
  it('IlmView：ilm/move 失败 toast 裸 err → friendlyEsError', () => {
    expect(read('../views/IlmView.vue')).toContain("'ilm/move 失败：' + friendlyEsError(String(e?.message ?? e))");
  });
  it('AnalysisSettingsView：保存失败 toast 裸 err → friendlyEsError', () => {
    expect(read('../views/AnalysisSettingsView.vue')).toContain("'保存失败：' + friendlyEsError(String(e?.message ?? e))");
  });
});
