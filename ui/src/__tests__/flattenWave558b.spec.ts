/**
 * 五百五十八批(b)·轨4（天罗工蚁B）：扁平化剥壳 + 弹层空态合并 8 面。
 * 静态源码断言仿 flattenWave556/557 范式（strip 注释后逐字锚 + 组件本体零触防回流）。
 *
 * ① 编辑器外框退役 7 面（IlmView 为 557 已就位核对）：MonacoEditor .monaco-host /
 *    JsonArea .ja 外框（组件自带 1px line 框+radius）经视图侧规则退役，组件本体零触。
 *    分界承接：av 卡头 card-t / br-card-hd / pt-card-hd / md-mo-hd 既有 border-bottom、
 *    ilm/md 弹窗由 n-modal 卡头 + ja-bar 工具条自承分界。
 *    ⚠analyzeLayout525W4b:35 / sqlLint534:147 / sqlBridgeFlat535:140 逐字锁钉死
 *    「flex: 1 1 0; min-height: 260px; }」原行——该三面剥壳以同选择器独立规则追加
 *    （CSS 声明合并语义等价），不动被锁原文。
 * ② HealthReportView 弹层空态合并：两处 .hr-pop-hint 裸 div 换 EmptyState compact
 *    统一件（557 批 rp-empty/st-list-empty 先例同语言；SearchX 语义图标，
 *    ClusterSettingsView:60 先例同款）——文案逐字保留走 :text 绑定，窄弹层留白
 *    按原 hint 档收紧（compact 默认 16px 12px 在弹层内喧宾夺主）。
 *    healthArchivePopupPick.spec.ts:108 行为锁随批迁移锚（.hr-pop-hint → .hr-pop .es-text，
 *    该 spec 非禁改件）。
 *
 * 范围铁律：剥壳只动 scoped style（追加 border:none;border-radius:0），模板结构
 * 零变动（HealthReport 空态合并除外）；高度链/flex 语义零变动；禁改件零触。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcOf = (p: string) => readFileSync(join(__dirname, '..', 'views', p), 'utf-8');
/* 剥 CSS/HTML 注释：注释里的字面不算数（lrBarSingleTrack/emptyStatePadding 同一教训） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* ═══════════ ① 编辑器外框退役 8 面 ═══════════ */

describe('五百五十八批(b)①：编辑器外框退役 8 面（视图侧规则，组件本体零触）', () => {
  it('AnalyzeView：av-left 面剥壳规则在场（原 flex 行被 analyzeLayout525W4b 逐字锁，剥壳独立追加）', () => {
    const s = srcOf('AnalyzeView.vue');
    expect(s).toContain('.av-left > :deep(.monaco-host) { flex: 1 1 0; min-height: 260px; }');
    expect(s).toContain('.av-left > :deep(.monaco-host) { border: none; border-radius: 0; }');
  });
  it('SqlBridgeView：br-pane 面剥壳规则在场（原 flex 行被 sqlLint534/sqlBridgeFlat535 逐字锁，剥壳独立追加）', () => {
    const s = srcOf('SqlBridgeView.vue');
    expect(s).toContain('.br-pane > :deep(.monaco-host) { flex: 1 1 0; min-height: 260px; }');
    expect(s).toContain('.br-pane > :deep(.monaco-host) { border: none; border-radius: 0; }');
  });
  it('PitScrollView：pt-form 面 .ja 退壳（pt-card-hd border-bottom 既有承接）', () => {
    expect(srcOf('PitScrollView.vue')).toContain('.pt-form :deep(.ja) { border: none; border-radius: 0; }');
  });
  it('MappingDesignerView：加字段弹窗 md-mo-body 面 .ja 退壳（md-mo-hd border-bottom + ja-bar 自承分界）', () => {
    expect(srcOf('MappingDesignerView.vue')).toContain('.md-mo-body :deep(.ja) { border: none; border-radius: 0; }');
  });
  it('IlmView：策略编辑弹窗 ilm-policy-ja 剥壳已在场（557 批先例，核对不重做）', () => {
    expect(srcOf('IlmView.vue')).toContain('.ilm-policy-ja { border: none; border-radius: 0; }');
  });
  it('MappingView：新建弹窗两处 Monaco 直挂剥壳（monaco-host 组件根携本视图 scope id，scoped 类规则直接命中）', () => {
    expect(srcOf('MappingView.vue')).toContain('.monaco-host { border: none; border-radius: 0; }');
  });
  it('SynonymsManagerView：sy-rule-ed 面剥壳并入既有弹性规则（无源码锁，安全并入）', () => {
    expect(srcOf('SynonymsManagerView.vue'))
      .toContain('.sy-form > .sy-lb > .sy-rule-ed { min-height: max(290px, 42vh); border: none; border-radius: 0; }');
  });
  it('JsonArea 组件本体零触（.ja 原始带框规则原样，防回流锚）', () => {
    expect(readFileSync(join(__dirname, '..', 'components', 'JsonArea.vue'), 'utf-8'))
      .toContain('.ja { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--r-s); overflow: hidden; background: var(--bg0); }');
  });
  it('MonacoEditor 组件本体零触（根元素与自身带框规则原样，防回流锚）', () => {
    const s = readFileSync(join(__dirname, '..', 'components', 'MonacoEditor.vue'), 'utf-8');
    expect(s).toContain('<div ref="hostRef" class="monaco-host" :style="{ height }"></div>');
    expect(s).toContain('.monaco-host { width: 100%; border: 1px solid var(--line); border-radius: var(--r-m); overflow: hidden; }');
  });
});

/* ═══════════ ② HealthReportView 弹层空态合并 EmptyState ═══════════ */

describe('五百五十八批(b)②：HealthReportView 弹层空态合并 EmptyState compact（文案逐字保留）', () => {
  it('两处 hr-pop-hint 裸 div 空态退役（模板消费与样式规则清零）', () => {
    const s = strip(srcOf('HealthReportView.vue'));
    expect(s, 'hr-pop-hint 手写空态清零').not.toMatch(/hr-pop-hint/);
  });
  it('基准弹层空态换 EmptyState compact + SearchX（文案「没有匹配…存档报告」逐字保留）', () => {
    expect(strip(srcOf('HealthReportView.vue')))
      .toContain(`<EmptyState v-if="!baseItems.length" compact :icon="SearchX" :text="'没有匹配「' + baseKw + '」的存档报告'" />`);
  });
  it('对照弹层空态换 EmptyState compact + SearchX（同款）', () => {
    expect(strip(srcOf('HealthReportView.vue')))
      .toContain(`<EmptyState v-if="!cmpItems.length" compact :icon="SearchX" :text="'没有匹配「' + cmpKw + '」的存档报告'" />`);
  });
  it('SearchX 已 import；窄弹层留白收紧规则在场（compact 默认档在弹层内喧宾夺主）', () => {
    const s = srcOf('HealthReportView.vue');
    expect(s).toMatch(/import \{[^}]*SearchX[^}]*\} from 'lucide-vue-next';/);
    expect(s).toContain('.hr-pop :deep(.empty-state) { padding: var(--sp-2h) var(--sp-3); }');
  });
  it('healthArchivePopupPick 行为锁随批迁移：锚 .hr-pop-hint → .hr-pop .es-text（文案语义不变）', () => {
    expect(readFileSync(join(__dirname, 'healthArchivePopupPick.spec.ts'), 'utf-8'))
      .toContain(`expect(document.querySelector('.hr-pop .es-text')?.textContent).toContain('没有匹配');`);
  });
});
