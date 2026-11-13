/**
 * 五百六十一批扫尾改用——源码契约看守（searchFilterBar547/metaStripAdoption 同款范式）。
 * 判据（斥候勘明锚点，动手前实读 4 件 props 契约核实）：
 *   1) SearchFilterBar 第 15/16 胞：AnalysisSettingsView .as-filter-bar / BrowserView .bw-search
 *      （547「异形豁免册」bw 条目由合并约定推翻）——胶囊壳三件套与内建 Search 图标归组件
 *      单源，落位类透传组件根，input padding-left:30px 违规同步更新退役；Esc 清空内建承接
 *      （filterEscClear379 锚同步更新）；
 *   2) 状态圆点四胞退役→MetaStrip dot 形态单源（先例 DiagView dgMeta dot: 色值直传）：
 *      BrowserView .bw-hdot（tab+表格槽两处）/HealthReportView .hr-hdot/OverviewView .ov-h-dot/
 *      LiveDashboardView .ld-node-tone；
 *   3) tag 三处退役：FavoritesView .fv-tag（合并 MetaStrip items text 段，550 sv-repo 先例）/
 *      TemplateGalleryView .tg-tag+.tg-tag-danger（StatusPill，危险→r 档）/ConfigValidatorView
 *      .cv-tag（StatusPill n 档）；ScoreExplainView .se-mq-chip 同批顺带（MetaStrip mini）；
 *   4) 红壳合并：ScoreExplainView .se-err 私造红壳→theme.css .err-bar（body/pre/acts 留作槽）/
 *      AnalyzeView .av-err（err-bar 基座，并行面终态同锁）/SlmView .slm-stats-err warn 壳→
 *      EmptyState compact+action 重试（IlmView explain 先例）；.se-empty-sub 裸 div→EmptyState
 *      compact；
 *   5) DiagView .dg-tip 裸 div 五处→EmptyState compact（失败档带 action 重试、空态不带——
 *      532 批本文件先例对齐）；SearchTemplatesView .st-list 容器壳剥壳（约定④）+
 *      st-list 空态死码规则立删（flattenWave554/557/spSweep551 锚同步更新）；
 *   6) 死类 panel 删类名（TaskTreeView/ClusterSettingsView 六处，全站零样式定义零视觉）。
 * 负锁一律剥注释后断言（flattenWave556 口径：历史备案注释里的字面不算数）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
/* 剥 CSS/HTML 注释：负锁防历史备案字面误命中（flattenWave556 同一教训） */
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('五百六十一批①：SearchFilterBar 第 15/16 胞改用', () => {
  it('AnalysisSettingsView：as-filter-bar 改用（落位透传 + input-class 锚 + 清除钮走插槽）', () => {
    const s = codeOf('views/AnalysisSettingsView.vue');
    expect(s, '统一件接线（v-model/落位类/input-class 锚/placeholder 逐字；插入属性容忍）')
      .toMatch(/<SearchFilterBar v-model="filterKw"[^>]*class="as-filter-bar" input-class="as-filter-ipt" placeholder="过滤 analyzer\/tokenizer\/filter…">/);
    expect(s, '清除钮走默认插槽原位').toMatch(/<SearchFilterBar[\s\S]*?class="btn ghost xs" @click="filterKw = ''">清除<\/button>[\s\S]*?<\/SearchFilterBar>/);
    expect(s, '手写胶囊（input.ipt 形态）退役').not.toMatch(/<input[^>]*as-filter-ipt/);
    expect(s, '绝对定位图标与 30px 左衬违规退役').not.toContain('as-filter-ic');
    expect(s, '落位与内衬归本类（gap/margin + padding 对齐 .ipt 原值，高度链零变动）')
      .toContain('.as-filter-bar { gap: var(--sp-1h); margin-bottom: var(--sp-3); padding: var(--sp-1h) var(--sp-2h); }');
  });

  it('BrowserView：bw-search 改用（547 豁免条目推翻；min() 钳制与 900 档独占行同步更新）', () => {
    const s = codeOf('views/BrowserView.vue');
    expect(s, '统一件接线（v-model/落位类/placeholder 逐字）')
      .toContain('<SearchFilterBar v-model="kw" class="bw-search" placeholder="搜索索引名…" />');
    expect(s, '手写胶囊与绝对定位图标退役').not.toMatch(/<input[^>]*搜索索引名/);
    expect(s, 'inline padding-left:30px 违规退役').not.toContain('padding-left:30px');
    expect(s, '落位与内衬归本类（min(240px,100%) 钳制保形 + padding 对齐 .inp 原值）')
      .toContain('.bw-search { width: min(240px, 100%); padding: var(--sp-1h) var(--sp-2h); }');
    expect(s, '900 档独占行同步更新').toMatch(/@media \(max-width: 900px\)[\s\S]*\.bw-search \{ flex: 0 0 100%; \}/);
  });
});

describe('五百六十一批②：状态圆点四胞退役→MetaStrip dot 形态单源', () => {
  it('四胞私造圆点类全部退役（剥注释负锁）', () => {
    expect(codeOf('views/BrowserView.vue'), 'bw-hdot 退役').not.toContain('bw-hdot');
    expect(codeOf('views/HealthReportView.vue'), 'hr-hdot 退役').not.toContain('hr-hdot');
    expect(codeOf('views/OverviewView.vue'), 'ov-h-dot 退役').not.toContain('ov-h-dot');
    expect(codeOf('views/LiveDashboardView.vue'), 'ld-node-tone 退役').not.toContain('ld-node-tone');
  });

  it('BrowserView：健康 tab 与 #cell-健康 槽两处接线 MetaStrip dot（dot-only 形态保形）', () => {
    const s = codeOf('views/BrowserView.vue');
    expect(s, 'tab 色点 dot-only（inline 落位挂 .bw-tab-ms 防块级折行）')
      .toContain('<MetaStrip v-if="h.dot" class="bw-tab-ms" :items="[{ dot: h.dot }]" />');
    expect(s, '表格健康槽仍是纯色点无文字（DOM 逐字保形），title 走段级 tip')
      .toContain('<MetaStrip :items="[{ dot: healthColor(value), tip: String(value ?? \'\') }]" />');
    expect(s, '落位规则在场（seg 钮 flex 结构居中+圆点右距 --sp-1；vertical-align 手调补偿退役）')
      .toContain('.seg .bw-tab-ms { display: inline-flex; margin-right: var(--sp-1); }');
    expect(s, 'seg 钮 flex 结构居中（色点垂直居中由 align-items 承担）')
      .toContain('.seg button { display: inline-flex; align-items: center; }');
  });

  it('HealthReportView：#cell-health 色点改用（dot+value 段，中文主显文案不变，title 留槽级 span）', () => {
    const s = codeOf('views/HealthReportView.vue');
    expect(s).toContain('<MetaStrip :items="[{ dot: healthColor(String(value || \'\')), value: healthZh(value) || value }]" />');
    expect(s, '槽级 span title 兜底保留').toMatch(/<span class="hr-cell-health" :title="String\(value \?\? ''\)">/);
    expect(s, 'hd-g/y/r 三档色规则同步更新退役').not.toMatch(/\.hd-(g|y|r) \{/);
  });

  it('OverviewView / LiveDashboardView：色点接线（色值直传 dot 位，LiveDashboard 走 nodeToneDot 映射）', () => {
    expect(codeOf('views/OverviewView.vue')).toContain('<MetaStrip :items="[{ dot: h.color }]" />');
    const ld = codeOf('views/LiveDashboardView.vue');
    expect(ld).toContain('<MetaStrip :items="[{ dot: nodeToneDot(n) }]" />');
    expect(ld, 'ok/warn/bad 档名→色值映射单一出处').toContain("return t === 'ok' ? 'var(--ok)' : t === 'warn' ? 'var(--warn)' : 'var(--err)';");
  });
});

describe('五百六十一批③：tag 三处 + 命中子句 chip 合并', () => {
  it('FavoritesView：fv-tag 合并 MetaStrip items text 段（#前缀随段并入，550 sv-repo 先例）', () => {
    const s = codeOf('views/FavoritesView.vue');
    expect(s, 'items 派生函数接线').toContain('<MetaStrip class="fv-card-meta" :items="fvCardMeta(it)">');
    expect(s, 'tag text 段派生（#前缀随段并入）').toContain("({ text: '#' + t })");
    expect(s, 'fv-tag 私造 chip 退役').not.toContain('fv-tag');
    expect(s, 'fv-dest 重放目标 chip 保留走插槽').toContain('class="fv-dest"');
  });

  it('TemplateGalleryView：tg-tag 双档改用 StatusPill（危险→r 档、普通→n 档）', () => {
    const s = codeOf('views/TemplateGalleryView.vue');
    expect(s).toContain('<StatusPill v-for="tag in t.tags" :key="tag" :tone="tag === \'危险\' ? \'r\' : \'n\'" :label="tag" />');
    expect(s, 'tg-tag/tg-tag-danger 私造皮退役').not.toContain('tg-tag');
  });

  it('ConfigValidatorView：cv-tag 改用 StatusPill n 档', () => {
    const s = codeOf('views/ConfigValidatorView.vue');
    expect(s).toContain('<StatusPill v-for="tag in t.tags" :key="tag" tone="n" :label="tag" />');
    expect(s, 'cv-tag 私造皮退役').not.toContain('cv-tag');
  });

  it('ScoreExplainView：se-mq-chip 合并 MetaStrip mini（引导词保留，value 亮色段）', () => {
    const s = codeOf('views/ScoreExplainView.vue');
    expect(s).toContain('<MetaStrip :items="h.matched_queries.map((m: string) => ({ value: m }))" />');
    expect(s, '「命中子句：」引导词保留').toContain('命中子句：<MetaStrip');
    expect(s, 'se-mq-chip 私造皮退役').not.toContain('se-mq-chip');
  });
});

describe('五百六十一批④：红壳合并 err-bar / EmptyState', () => {
  it('ScoreExplainView：se-err 私造红壳退役合并 err-bar（结构留作槽）', () => {
    const s = codeOf('views/ScoreExplainView.vue');
    expect(s, '私造红壳四件套退役').not.toMatch(/\.se-err \{/);
    expect(s, '失败面板走 err-bar 基座（role=alert + rise-in 语义）').toMatch(/role="alert" class="err-bar rise-in"/);
    expect(s, '.se-err-body 内容槽保留').toContain('.se-err-body { flex: 1; min-width: 0; }');
    expect(s, '.se-err-pre 回看槽保留').toMatch(/\.se-err-pre \{/);
    expect(s, '.se-err-acts 行动槽保留').toMatch(/\.se-err-acts \{/);
  });

  it('ScoreExplainView：se-empty-sub 裸 div 合并 EmptyState compact（文案逐字保留）', () => {
    const s = codeOf('views/ScoreExplainView.vue');
    expect(s).toContain('<EmptyState v-else compact :icon="Info" text="此 hit 无 _explanation（检查 explain:true 是否被覆盖）" />');
    expect(s, '裸占位类退役').not.toContain('se-empty-sub');
  });

  it('AnalyzeView：av-err 红壳退役走 err-bar 基座（role=alert 在场，并行面终态同锁）', () => {
    const s = codeOf('views/AnalyzeView.vue');
    expect(s, 'err-bar 基座 + role=alert').toMatch(/role="alert" class="err-bar av-err"/);
    expect(s, '私造红壳（err-soft 底/border/radius）退役').not.toMatch(/\.av-err \{[^}]*err-soft/);
    expect(s, '内层标题与 errPre 结构保留').toMatch(/class="av-err-h"/);
    /* 重试路径=重跑主钮（threeStateContract WHITELIST「重跑即重试」口径），本面无独立重试钮 */
  });

  it('SlmView：slm-stats-err warn 壳合并 EmptyState compact+action（语义=统计不可用，IlmView 先例）', () => {
    const s = codeOf('views/SlmView.vue');
    expect(s, 'EmptyState compact 接线（文案逐字走 :text，action 重试）')
      .toMatch(/<EmptyState v-else-if="available && statsErr" compact :icon="AlertTriangle"\s*:text="'SLM 状态\/统计拉取失败：' \+ statsErr" action-text="重试" @action="loadAll" \/>/);
    expect(s, '私造 warn 皮退役').not.toMatch(/\.slm-stats-err/);
  });
});

describe('五百六十一批⑤：DiagView dg-tip 五处→EmptyState compact', () => {
  it('五处裸占位全数接线（失败档带 action 重试、空态/引导不带；文案逐字保留）', () => {
    const s = codeOf('views/DiagView.vue');
    expect(s, 'nodesErr 失败档（action 重试）')
      .toContain('<EmptyState v-else-if="nodesErr" compact :icon="Activity" text="节点快照拉取失败" action-text="重试" @action="loadOps" />');
    expect(s, 'pendingErr 失败档（action 重试）')
      .toContain('<EmptyState v-else-if="pendingErr" compact :icon="Hourglass" text="pending tasks 拉取失败" action-text="重试" @action="loadOps" />');
    expect(s, '分配健康正向占位（空态不带 action，✓ 前缀属文案原文）')
      .toContain('<EmptyState v-else-if="allocHealthy" compact :icon="CheckCircle2" text="✓ 所有分片均已分配——集群分配健康，无需诊断" />');
    expect(s, '探测引导（空态不带 action，端点串逐字保留）')
      .toContain('<EmptyState v-else compact :icon="Compass" text="点击探测：请求 _cluster/allocation/explain 定位无法分配的分片原因" />');
    expect(s, '热线程未采样（空态不带 action）')
      .toContain('<EmptyState v-else compact :icon="Flame" text="尚未采样" />');
    expect(s, '裸 dg-tip 规则退役').not.toMatch(/\.dg-tip/);
  });
});

describe('五百六十一批⑥：SearchTemplatesView st-list 剥壳 + 死码立删', () => {
  it('st-list 容器壳退役（约定④：border+radius 消除，flex/max-height 骨架零触）', () => {
    const s = codeOf('views/SearchTemplatesView.vue');
    expect(s, '931 批随迁：overflow:hidden 剪裁换 overflow-y:auto（溢出条目滚动可达，防撑破 max-height 零触）')
      .toContain('.st-list { overflow-y: auto; display: flex; flex-direction: column; max-height: calc(100vh - var(--vh-offset) + 50px); }');
    expect(s, 'border+radius 壳不回流').not.toMatch(/\.st-list \{[^}]*border/);
    expect(s, '分界由 st-list-hd border-bottom 承接').toMatch(/\.st-list-hd \{[^}]*border-bottom: 1px solid var\(--border\);/);
  });

  it('st-list 空态死码规则立删（模板消费 557 已清零，负锁见 flattenWave554/spSweep551）', () => {
    const s = codeOf('views/SearchTemplatesView.vue');
    expect(s, '死码规则退役').not.toMatch(/\.st-list-empty/);
    expect(s, '三态 EmptyState 接线保持（失败档+真空态+过滤空档）').toMatch(/<EmptyState v-if="loadErr" compact/);
    expect(s).toContain('<EmptyState v-if="tplFilter && !filteredTemplates.length" compact :icon="LayoutTemplate" text="无匹配模板" />');
  });
});

describe('五百六十一批⑦：死类 panel 删类名（零样式定义零视觉）', () => {
  it('TaskTreeView / ClusterSettingsView 六处 panel 类名清零', () => {
    expect(codeOf('views/TaskTreeView.vue'), 'tt-bar/tt-left/tt-right panel 删除').not.toMatch(/ panel[ "]/);
    expect(codeOf('views/ClusterSettingsView.vue'), 'cs-bar/cs-body/cs-preview panel 删除').not.toMatch(/ panel[ "]/);
    expect(read('theme.css'), '全站无 .panel 样式定义（删类名零视觉的前提）').not.toMatch(/^\.panel \{/m);
  });
});
