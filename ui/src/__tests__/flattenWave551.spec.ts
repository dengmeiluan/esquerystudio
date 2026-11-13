/**
 * 五百五十一批·轨4（工蚁 W4）：全站扁平化扫荡 · 统一组件化合并 · 契约备案。
 *
 * 静态源码断言仿 flattenWave546/550 范式 + ⑥运行时挂载抽查（useCurrentIdxWritePages525 mountView 骨架）：
 * ① 编辑器外框退役（约定③）四处——alv-fta / md-ta / pt-ta 三条死规则删除（模板早已 JsonArea 化，
 *    grep 0 引用实证）；DiffEditor .df-ta 已是内容直贴（border:0 无 radius），正锁防回流，
 *    code-bg 代码内容面语义保留（540 df 先例）。
 * ② 大容器框退役（约定④）六处七件——ra-card / tg-card / rc-card / slm-card 列表行卡壳
 *    （bg+border+radius 整块消除 → border-top 分节流，xm-res 547 先例语言）；hr-hero 大横幅框
 *    降为 border-bottom 分节（551 裁决推翻 545「hero 豁免」备案：hero 是 chrome 非语义，
 *    三态语义色由 hr-score-n 文本色承接）；qx-tabs / rd-tabs 容器框退役（dq-sw 先例：
 *    去 bg2+border+radius 容器，tab 本身控件语义/act 态保留）。类名全保留：
 *    protectThreeState（.slm-card）/ healthThreeState（.hr-hero）/ qualityThreeState（.tg-card）
 *    在场锁不受影响，obsStack530 1100 堆叠档 / layoutAdaptive533 rc-card-meta 锚随行复核。
 * ③ 私造胶囊改用 StatusPill 统一件七件——SecurityView role-tag×4 + act-tag（六色 r-* / 五色 a-*
 *    私造配色退役，tone 映射表备案：ADMIN→r / OPERATOR→y / REBUILD_OP orange→y / VIEWER 只读→g /
 *    CLUSTER_OP ac→b / AUDIT_OP violet→n；LOGIN ok→g / LOGIN_FAIL→y / WRITE→b / HIGH_RISK→r /
 *    PAGE_DENIED warn→y / READ→g / 其余→n（六百四十批 G24 危险等级隔离：HIGH_RISK 独占红、
 *    LOGIN_FAIL 降警告黄、WRITE 转信息蓝，与 PAGE_DENIED 分离））、UpdateByQuery uq-badge→n、Plugins pl-mo-tag→n、
 *    ClusterSettings cs-grp-chip→b（sweep524/tableKernelWave531 650 字面锁同步更新）、
 *    MatchMatrix mm-dead-tag→r（TriangleAlert 随统一件无图标位退役，iconSizeFloor420 锁同步更新）、
 *    Aliases alv-warn-tag→y。
 * ④ 私造 meta 行合并 MetaStrip mini（550 批 sv-repo-meta 先例）六处——MappingDesigner md-kv 九行、
 *    Workspace ws-kv 四行、IndexSettings ir-kv 三行、Slm slm-card-meta+slm-card-run 两行、
 *    Favorites fv-card-meta（fv-dest/fv-tag 语义特殊保留走插槽）、Aliases alv-meta（filter 段是
 *    popover 触发器走默认插槽，交互语义保留）。
 * ⑤ cardPrimitiveVerdict547 豁免册零新增：SecurityView 功能卡豁免（`<div class="card">` 正锁）
 *    未触，无需同步字典。
 * ⑥ 运行时挂载抽查三页——SecurityView 改用后 pill 渲染 + Roles 对照清单场景、SlmView 分节流
 *    （.slm-card 在场 + 卡内 MetaStrip）、MappingDesigner MetaStrip 渲染（点选字段后 md-kvs）。
 *
 * 范围铁律：纯视觉/语义层小刀——模板结构语义、高度链（max-height/height 定行）、六步卡结构零变动；
 * 不动任何文件的 --sp spacing 声明行（spSweep 三锁在 MatchMatrix 字面行原样）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* ═══════════ ① 编辑器外框退役（刀③，四处） ═══════════ */

describe('五百五十一批①：编辑器外框退役（约定③）', () => {
  it('AliasesView：.alv-fta 死规则退役（filter 编辑器早已 JsonArea 化，模板 0 引用实证）', () => {
    const s = read('../views/AliasesView.vue');
    expect(s, 'alv-fta 规则随外框退役删除（备案注释允许保留字样）').not.toMatch(/\.alv-fta \{/);
    expect(s, 'filter JsonArea 统一件消费不动（freeEditorTiers530 锚随行复核）').toContain('<JsonArea ref="filterJaRef"');
  });

  it('DiffEditorView：.df-ta 内容直贴形态正锁（border:0 无 radius；code-bg 语义内容面保留）', () => {
    const s = read('../views/DiffEditorView.vue');
    expect(s, '编辑器外框已退役的 border:0 形态不回流').toMatch(/\.df-ta \{[^}]*border: 0;/);
    expect(s, 'border/radius 外框不回流').not.toMatch(/\.df-ta \{[^}]*border-radius/);
    expect(s, 'code-bg 代码内容面语义保留（540 df 先例 carve-out）').toMatch(/\.df-ta \{[^}]*background: var\(--code-bg\);/);
  });

  it('MappingDesignerView：.md-ta 死规则退役（加字段额外 JSON 编辑器早已 JsonArea 化）', () => {
    const s = read('../views/MappingDesignerView.vue');
    expect(s, 'md-ta 规则随外框退役删除').not.toMatch(/\.md-ta \{/);
    expect(s, '额外 JSON JsonArea 统一件消费不动').toContain('<JsonArea ref="mdJaRef"');
  });

  it('PitScrollView：.pt-ta 死规则退役（filter 编辑器早已 JsonArea 化）', () => {
    const s = read('../views/PitScrollView.vue');
    expect(s, 'pt-ta 规则随外框退役删除').not.toMatch(/\.pt-ta \{/);
    expect(s, 'filter JsonArea 统一件消费不动').toContain('<JsonArea ref="ptJaRef"');
  });
});

/* ═══════════ ② 大容器框退役（刀④，六处七件） ═══════════ */

describe('五百五十一批②：大容器框退役（约定④，border-top/bottom 分节流）', () => {
  it('ReindexAdvancedView：ra-card 壳退役 → border-top 分节（xm-res 547 先例语言）', () => {
    const s = read('../views/ReindexAdvancedView.vue');
    expect(s, '分节流新形态在场').toMatch(/\.ra-card \{ border-top: 1px solid var\(--border-subtle\); margin-bottom: var\(--sp-3\); \}/);
    expect(s, 'panel 底色退役').not.toMatch(/\.ra-card \{[^}]*background/);
    expect(s, '全框 border 退役').not.toMatch(/\.ra-card \{[^}]*border: 1px/);
    expect(s, 'radius 退役').not.toMatch(/\.ra-card \{[^}]*border-radius/);
    expect(s, '类名保留（useCurrentIdxWritePages525 ra 面零触随行复核）').toContain('class="ra-card"');
  });

  it('TemplateGalleryView：tg-card 壳退役 → border-top 分节；tg-c-code 内容面 bg2 保留；浮起 chrome 退役', () => {
    const s = read('../views/TemplateGalleryView.vue');
    expect(s, '分节流新形态在场').toMatch(/\.tg-card \{[^}]*border-top: 1px solid var\(--line\);/);
    expect(s, 'bg1 底色退役').not.toMatch(/\.tg-card \{[^}]*background/);
    expect(s, 'radius 退役').not.toMatch(/\.tg-card \{[^}]*border-radius/);
    expect(s, 'hover 浮起（translateY+shadow）chrome 同步更新退役').not.toMatch(/\.tg-card:hover \{[^}]*translateY/);
    expect(s, 'tg-c-code 代码内容面 bg2 语义保留').toMatch(/\.tg-c-code \{[^}]*background: var\(--bg2\);/);
  });

  it('RemoteClustersView：rc-card 壳退役 → border-top 分节；布局锚与 1100 堆叠档保留', () => {
    const s = read('../views/RemoteClustersView.vue');
    expect(s, '分节流新形态在场').toMatch(/\.rc-card \{ display: flex; justify-content: space-between; align-items: flex-start; gap: var\(--sp-3\); padding: var\(--sp-3\) 0; border-top: 1px solid var\(--border-subtle\); \}/);
    expect(s, 'panel 底色退役').not.toMatch(/\.rc-card \{[^}]*background/);
    expect(s, 'radius 退役').not.toMatch(/\.rc-card \{[^}]*border-radius/);
    expect(s, '1100 堆叠档布局锚保留（obsStack530:326 锚随行复核）').toMatch(/@media \(max-width: 1100px\) \{[\s\S]*?\.rc-card \{ flex-direction: column; \}/);
    expect(s, 'MetaStrip 落位锚保留（layoutAdaptive533:32 锚随行复核）').toMatch(/<MetaStrip class="rc-card-meta" :items="metaOf\(r\)" \/>/);
  });

  it('SlmView：slm-card 壳退役 → border-top 分节；类名保留（protectThreeState 在场锁）', () => {
    const s = read('../views/SlmView.vue');
    expect(s, '分节流新形态在场').toMatch(/\.slm-card \{ display: flex; justify-content: space-between; align-items: flex-start; gap: var\(--sp-3\); padding: var\(--sp-3\) 0; border-top: 1px solid var\(--border-subtle\); \}/);
    expect(s, 'panel 底色退役').not.toMatch(/\.slm-card \{[^}]*background/);
    expect(s, 'radius 退役').not.toMatch(/\.slm-card \{[^}]*border-radius/);
    expect(s, '1100 堆叠档布局锚保留（obsStack530:330 锚随行复核）').toMatch(/@media \(max-width: 1100px\) \{[\s\S]*?\.slm-card \{ flex-direction: column; \}/);
    expect(s, '类名在场（protectThreeState 运行时锁消费面）').toContain('class="slm-card"');
  });

  it('HealthReportView：hr-hero 大横幅框退役 → border-bottom 分节（551 裁决推翻 545 hero 豁免备案）', () => {
    const s = read('../views/HealthReportView.vue');
    expect(s, '分节流新形态在场').toMatch(/\.hr-hero \{ display: flex; gap: var\(--sp-4\); padding: var\(--sp-1\) 0 var\(--sp-3\); border-bottom: 1px solid var\(--line\); \}/);
    expect(s, 'hero 底色/渐变退役').not.toMatch(/\.hr-hero \{[^}]*background/);
    expect(s, 'radius 退役').not.toMatch(/\.hr-hero \{[^}]*border-radius/);
    expect(s, '三态边框/渐变档退役（语义色改由分数文本色承接）').not.toMatch(/\.hr-hero\.(ok|warn|err) \{ border-color/);
    expect(s, '三态语义色由 hr-score-n 文本色承接（healthThreeState 语义保留）')
      .toContain('.hr-hero.ok .hr-score-n { color: var(--ok); }');
    expect(s, '类名保留（healthThreeState 在场锁消费面）').toContain('class="hr-hero"');
    expect(s, 'hr-hero-r meta-num 档不动（flattenWave550⑥ 锚随行复核）').toContain('<div class="hr-hero-r meta-num">');
  });

  it('QueryXrayView / RankDebugView：tabs 容器框退役 → 裸 tab 行（dq-sw 先例，act 态保留）', () => {
    const qx = read('../views/QueryXrayView.vue');
    expect(qx, 'qx-tabs 裸 flex 行').toContain('.qx-tabs { display: flex; gap: var(--sp-1); }');
    expect(qx, '容器 bg2/border/radius/padding 退役').not.toMatch(/\.qx-tabs \{[^}]*background|\.qx-tabs \{[^}]*border|\.qx-tabs \{[^}]*border-radius|\.qx-tabs \{[^}]*padding/);
    expect(qx, 'tab 控件语义/act 态保留').toMatch(/\.qx-tab\.act \{ background: var\(--bg3\);/);
    const rd = read('../views/RankDebugView.vue');
    expect(rd, 'rd-tabs 裸 flex 行').toContain('.rd-tabs { display: flex; gap: var(--sp-1); }');
    expect(rd, '容器 bg2/border/radius/padding 退役').not.toMatch(/\.rd-tabs \{[^}]*background|\.rd-tabs \{[^}]*border|\.rd-tabs \{[^}]*border-radius|\.rd-tabs \{[^}]*padding/);
    expect(rd, 'tab 控件语义/act 态保留').toMatch(/\.rd-tab\.act \{ background: var\(--bg3\);/);
  });
});

/* ═══════════ ③ 私造胶囊改用 StatusPill（七件） ═══════════ */

describe('五百五十一批③：私造胶囊改用 StatusPill 统一件（tone 五档映射备案）', () => {
  it('SecurityView：role-tag×4 + act-tag 改用；六色 r-* / 五色 a-* 私造配色退役', () => {
    const s = read('../views/SecurityView.vue');
    expect(s, '统一件 import 在场').toContain("import StatusPill from '../components/StatusPill.vue';");
    expect(s, '我的账号角色改用').toContain('<StatusPill :tone="roleTone(auth.me.role)" :label="auth.me.role" />');
    expect(s, '用户表/审计表角色列改用（两处同形）').toMatch(/<StatusPill :tone="roleTone\(String\(value\)\)" :label="String\(value\)" \/>/);
    expect((s.match(/<StatusPill :tone="roleTone\(String\(value\)\)" :label="String\(value\)" \/>/g) || []).length, '角色列恰两处（用户表+审计表）').toBe(2);
    expect(s, '角色对照清单改用（落位锚类同步更新）').toContain('<StatusPill class="role-pill" :tone="roleTone(rl)" :label="rl" />');
    expect(s, '审计动作列改用（securityReadability 动作代码 title 锚同步更新保真）')
      .toContain(`<StatusPill :tone="actTone(String(value))" :label="actionZh(String(value))" :title="'动作代码：' + value" />`);
    expect(s, 'role-tag 私造样式退役').not.toMatch(/\.role-tag \{/);
    expect(s, 'r-* 六色私造配色退役').not.toMatch(/\.(r-admin|r-operator|r-viewer|r-rebuild_op|r-cluster_op|r-audit_op) \{/);
    expect(s, 'act-tag/a-* 五色私造配色退役').not.toMatch(/\.act-tag \{|\.(a-login|a-login_fail|a-write|a-high_risk|a-page_denied) \{/);
    expect(s, 'tone 映射表备案在场（admin 危险→r）').toContain("ADMIN: 'r', OPERATOR: 'y', REBUILD_OP: 'y', VIEWER: 'g', CLUSTER_OP: 'b', AUDIT_OP: 'n',");
    expect(s, '动作 tone 映射表在场（六百四十批 G24 语义分层）').toContain("LOGIN: 'g', LOGIN_FAIL: 'y', WRITE: 'b', HIGH_RISK: 'r', PAGE_DENIED: 'y', READ: 'g',");
  });

  it('UpdateByQueryView：uq-badge 异步任务徽标改用 StatusPill n', () => {
    const s = read('../views/UpdateByQueryView.vue');
    expect(s, '改用在场').toContain(`<StatusPill v-if="result.taskId" tone="n" :label="'异步任务：' + result.taskId" />`);
    expect(s, '私造样式退役').not.toMatch(/\.uq-badge \{/);
    expect(s, '统一件 import 在场').toContain("import StatusPill from '../components/StatusPill.vue';");
  });

  it('PluginsView：pl-mo-tag 插件名徽标改用 StatusPill n', () => {
    const s = read('../views/PluginsView.vue');
    expect(s, '改用在场').toContain('<StatusPill v-if="currentPlugin" tone="n" :label="currentPlugin" />');
    expect(s, '私造样式退役').not.toMatch(/\.pl-mo-tag \{/);
  });

  it('ClusterSettingsView：cs-grp-chip 分组列改用 StatusPill b（sweep524/tableKernelWave531 字面锁同步更新）', () => {
    const s = read('../views/ClusterSettingsView.vue');
    expect(s, '改用在场（cs-grp-chip 落位锚保留）').toContain('<StatusPill class="cs-grp-chip" tone="b" :label="String(value)" />');
    expect(s, '650/ac-soft 私造底规则退役（色档归 pill 单源）').not.toMatch(/\.cs-grp-chip \{/);
  });

  it('MatchMatrixView：mm-dead-tag 改用 StatusPill r；TriangleAlert 随统一件无图标位退役（spSweep 字面行不动）', () => {
    const s = read('../views/MatchMatrixView.vue');
    expect(s, '改用在场').toContain('<StatusPill v-if="c.count === 0" tone="r" label="没起作用" />');
    expect(s, '私造样式退役').not.toMatch(/\.mm-dead-tag \{/);
    expect(s, '图标随统一件无图标位退役（import 一并清）').not.toContain('TriangleAlert');
    expect(s, 'spSweep540/544/545 字面行随 554 合并改锚（.mm-busy 6px/16px→token，14px 刻值保字面）').toMatch(/gap: var\(--sp-1h\); padding: 14px var\(--sp-4\)/);
  });

  it('AliasesView：alv-warn-tag write 异常警示改用 StatusPill y', () => {
    const s = read('../views/AliasesView.vue');
    expect(s, '改用在场').toContain('<StatusPill tone="y" :label="w.reason" />');
    expect(s, '私造样式退役').not.toMatch(/\.alv-warn-tag/);
  });
});

/* ═══════════ ④ 私造 meta 行合并 MetaStrip mini（六处） ═══════════ */

describe('五百五十一批④：私造 meta 行合并 MetaStrip mini（550 sv-repo-meta 先例）', () => {
  it('MappingDesignerView：md-kv 九行键值合并——值对段入 items，富内容三段走默认插槽', () => {
    const s = read('../views/MappingDesignerView.vue');
    expect(s, 'MetaStrip mini 档在场').toContain('<MetaStrip class="md-kvs" :items="pickedMeta">');
    expect(s, '值对 items 派生在场').toContain('const pickedMeta = computed<MetaStripItem[]>(() => {');
    expect(s, 'md-kv 私造行样式退役').not.toMatch(/\.md-kv \{|\.md-kv span|\.md-kv code/);
    expect(s, '类型 chip 全局单源消费保留（theme.css .chip mono 系豁免）').toContain('class="chip mono mft-type"');
  });

  it('WorkspaceView：ws-kv 四行合并 MetaStrip（长索引名段 tip 兜底）', () => {
    const s = read('../views/WorkspaceView.vue');
    expect(s, 'MetaStrip mini 档在场').toContain('<MetaStrip class="ws-strip"');
    expect(s, '选中段 tip 兜底（原 ellipsis+title 语义同步更新）').toContain("{ value: store.pickedIdx || '—', label: '选中', tip: store.pickedIdx || undefined }");
    expect(s, '统一件 import 在场').toContain("import MetaStrip from '../components/MetaStrip.vue';");
    expect(s, 'ws-kv 私造行样式退役').not.toMatch(/\.ws-kv \{|\.ws-kv b|\.ws-kv-v/);
  });

  it('IndexSettingsView：ir-kv 三行合并 MetaStrip（重建预估段）', () => {
    const s = read('../views/IndexSettingsView.vue');
    expect(s, 'MetaStrip mini 档在场').toContain('<MetaStrip class="ir-kvs"');
    expect(s, '三段值对齐（文档数/主分片体积/预计耗时）').toContain("label: '文档数'");
    expect(s, '统一件 import 在场').toContain("import MetaStrip from '../components/MetaStrip.vue';");
    expect(s, 'ir-kv 私造行样式退役').not.toMatch(/\.ir-kv \{|\.ir-kv span|\.ir-kv b/);
  });

  it('SlmView：slm-card-meta + slm-card-run 两行合并 MetaStrip（执行结果点随段迁移）', () => {
    const s = read('../views/SlmView.vue');
    expect(s, 'MetaStrip mini 档在场').toContain('<MetaStrip class="slm-card-meta" :items="slmCardMeta(p)" />');
    expect(s, 'items 派生函数在场').toContain('function slmCardMeta(p: any): MetaStripItem[] {');
    expect(s, '上次执行结果点 dot 语义随段迁移').toContain("dot: 'var(--ok)'");
    expect(s, 'slm-card-run 私造行退役').not.toMatch(/\.slm-card-run \{|\.slm-card-run \.dot/);
    expect(s, 'slm-card-meta 落位外距锚（rc-card-meta 同款范式）').toContain('.slm-card-meta { margin-top: var(--sp-2); }');
  });

  it('FavoritesView：fv-card-meta 合并 MetaStrip；fv-dest 保留插槽；fv-tag 合并 items text 段（561 批）', () => {
    const s = read('../views/FavoritesView.vue');
    /* 五百六十一批同步更新：tag chip 由插槽合并 MetaStrip items text 纯文本段（550 sv-repo 徽章
       先例同语言），私造 chip 皮退役——剥注释口径防历史备案字面误命中（flattenWave556 同款） */
    const code = s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    expect(code, 'MetaStrip mini 档在场（items 派生函数承接时间戳+tag 段）').toMatch(/<MetaStrip class="fv-card-meta" :items="fvCardMeta\(it\)">/);
    expect(s, 'fv-dest 重放目标 chip 保留').toContain('class="fv-dest"');
    expect(code, 'fv-tag 私造 chip 退役').not.toContain('fv-tag');
    expect(s, 'tag 段派生函数在场（#前缀随段并入）').toContain("({ text: '#' + t })");
    expect(s, '本类只留落位外距（flex/字号归 .ms 单源）').toContain('.fv-card-meta { margin-top: var(--sp-2); }');
  });

  it('AliasesView：alv-meta rt/filter 片合并 MetaStrip（filter popover 触发器走插槽保交互）', () => {
    const s = read('../views/AliasesView.vue');
    expect(s, 'MetaStrip mini 档在场').toContain('<MetaStrip v-if="r.routing || r.filter" class="alv-rowmeta"');
    expect(s, 'rt 值段入 items（title→tip 同步更新）').toContain("{ value: r.routing, label: 'rt', tip: 'index_routing' }");
    expect(s, 'alv-meta bg2 胶囊私造样式退役').not.toMatch(/\.alv-meta \{/);
    expect(s, 'filter 段 popover 触发器交互语义保留').toMatch(/class="ms-i alv-meta-filter"/);
  });
});

/* ═══════════ ⑥ 运行时挂载抽查（三页） ═══════════ */

/* ── 共享 mock 面（useCurrentIdxWritePages525 mountView 骨架同款）── */
const authUsersFn = vi.fn(async (..._a: any[]) => [{ username: 'bob', role: 'ADMIN', updatedAt: 1720000000000 }]);
const authAuditFn = vi.fn(async (..._a: any[]) => ({ hits: { hits: [] } }));
const slmPoliciesFn = vi.fn(async (..._a: any[]) => ({
  p1: {
    policy: { repository: 'repo1', schedule: '0 * * * * ?', config: { indices: ['idx_a', 'idx_b'] }, retention: { expire_after: '30d' } },
    last_success: { time: 1700000000000 },
    next_execution_millis: 1800000000000,
  },
}));
const slmStatusFn = vi.fn(async (..._a: any[]) => ({
  status: { operation_mode: 'RUNNING' },
  stats: { total_snapshots_taken: 3, total_snapshots_failed: 0, retention_runs: 1, retention_deletion_time_millis: 42 },
}));
const mappingDetailFn = vi.fn(async (..._a: any[]) => ({
  tree: [{ name: 'title', type: 'text', isNested: false, isObject: false, analyzer: 'ik_max_word' }],
  stats: { total: 1, text: 1 },
}));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      keys: () => Promise.resolve([]),
      slmPolicies: (...a: any[]) => slmPoliciesFn(...a),
      slmStatus: (...a: any[]) => slmStatusFn(...a),
      auth: {
        ...orig.api.auth,
        users: (...a: any[]) => authUsersFn(...a),
        opsAudit: (...a: any[]) => authAuditFn(...a),
        opsAuditMine: (...a: any[]) => authAuditFn(...a),
      },
      setup: { ...orig.api.setup, status: () => Promise.resolve({ bound: true, mode: 'BOOTSTRAP', endpoint: null, appName: 't' }) },
    },
  };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute'],
    template: '<div class="monaco-stub"></div>',
  },
}));

async function settle(n = 8) {
  const { nextTick } = await import('vue');
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function mountView(comp: any) {
  const { createApp, h } = await import('vue');
  const { createPinia, setActivePinia } = await import('pinia');
  const { useAppStore } = await import('../stores/app');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAppStore();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(comp) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  await settle();
  await wait(30);
  await settle();
  return { host, store, unmount: () => app.unmount() };
}

beforeEach(() => {
  document.body.innerHTML = '';
  sessionStorage.clear();
  localStorage.clear();
  authUsersFn.mockClear();
  authAuditFn.mockClear();
  slmPoliciesFn.mockClear();
  slmStatusFn.mockClear();
  mappingDetailFn.mockClear();
});

describe('五百五十一批⑥：运行时挂载抽查', () => {
  it('SecurityView：role/act 改用后 pill 渲染 + Roles 对照清单场景（role-pill×6、私造胶囊清零）', async () => {
    const View = (await import('../views/SecurityView.vue')).default;
    const w = await mountView(View);
    const { useAuthStore } = await import('../stores/auth');
    const auth = useAuthStore();
    auth.me = { username: 'root', displayName: 'root', role: 'ADMIN', fallback: false, delegated: false, pages: undefined } as any;
    await settle();
    await wait(30);
    await settle();
    /* Roles 对照清单：六角色各一枚落位锚 pill（roleTone 映射驱动） */
    expect(w.host.querySelectorAll('.role-pill').length, '六角色对照清单各一枚').toBe(6);
    const pills = Array.from(w.host.querySelectorAll('.pill'));
    expect(pills.some(p => (p.textContent || '').includes('ADMIN') && p.classList.contains('r')), 'ADMIN 落 r 档（roleTone 映射）').toBe(true);
    expect(pills.some(p => (p.textContent || '').includes('VIEWER') && p.classList.contains('g')), 'VIEWER 落 g 档（只读→g）').toBe(true);
    expect(w.host.querySelector('.role-tag'), '私造 role-tag 胶囊清零').toBeNull();
    expect(w.host.querySelector('.act-tag'), '私造 act-tag 胶囊清零').toBeNull();
    w.unmount();
  }, 20_000);

  it('SlmView：分节流在场（.slm-card 锚保留）+ 策略卡内 MetaStrip 渲染（slm-card-run 退役）', async () => {
    const View = (await import('../views/SlmView.vue')).default;
    const w = await mountView(View);
    const card = w.host.querySelector('.slm-card');
    expect(card, '策略卡在场（protectThreeState 锚随行复核）').toBeTruthy();
    expect(card!.querySelector('.ms'), '卡内 MetaStrip 渲染').toBeTruthy();
    expect(card!.textContent, 'indices 值对段入 items').toContain('indices');
    expect(card!.textContent, '上次/下次 执行段并入 MetaStrip').toContain('上次');
    expect(card!.querySelector('.slm-card-run'), '私造 run 行退役').toBeNull();
    w.unmount();
  });

  it('MappingDesignerView：点选字段后 md-kvs MetaStrip 渲染（值对段+类型 chip 插槽段）', async () => {
    const View = (await import('../views/MappingDesignerView.vue')).default;
    const w = await mountView(View);
    w.store.pick('md_idx');
    await wait(30);
    await settle();
    const node = w.host.querySelector('.md-node') as HTMLElement | null;
    expect(node, '字段树节点渲染（mappingDetail mock 回放）').toBeTruthy();
    node!.click();
    await settle();
    const strip = w.host.querySelector('.md-kvs');
    expect(strip, 'md-kvs MetaStrip 渲染').toBeTruthy();
    expect(strip!.textContent, '名称值对段在场').toContain('名称');
    expect(strip!.textContent, 'analyzer 值对段在场').toContain('ik_max_word');
    expect(strip!.querySelector('.mft-type'), '类型 chip 插槽段保留（全局单源消费）').toBeTruthy();
    expect(w.host.querySelector('.md-kv'), '私造键值行退役').toBeNull();
    w.unmount();
  });
});
