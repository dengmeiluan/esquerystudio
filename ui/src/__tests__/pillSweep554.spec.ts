/**
 * 五百五十四批·工蚁E（全站统一组件化：胶囊改用 + 交互统一）。静态源码断言仿 flattenWave552 范式。
 *
 * ① HealthReportView 三族私造胶囊改用 StatusPill 统一件：
 *    - hr-diff-pct（213 批得分/变化率徽标）：up 升→g / down 降→r（升降语义直映主档；
 *      965 起 diff 行变化率徽标改 tone 随指标性质分档——score 涨绿保持/健康量族反转/其余中性，
 *      见 healthDiffTone965；得分差徽标 deltaUp 语义不变）；
 *    - hr-sec-cnt（分节计数徽标 ×3）：中性计数→n；
 *    - hr-pop-mark（弹层「当前基准/对照」选中标记 ×4）：本弹层自身角色的当前选中（原 .on
 *      强调态）→b info 强调档 / 另一角色选中（原弱化态）→n 中性档。mark 徽标语义判断备案：
 *      它是「圆角小徽标标注定项」而非搜索命中高亮——MarkText（<mark> 分段高亮件）语义不合，
 *      StatusPill 是正确归口。
 * ② BoostTunerView bt-cnt 计数徽标改用：默认中性计数→n，N>10 热（原 hot warn 档）→y。
 * ③ IndexOptimizerView io-recs-cnt 计数徽标改用：中性计数→n。
 * ④ QueryHubView qh-ver 版本门槛徽标改用：warn 语义（需更高版本）→y，title 语义走组件 prop。
 *
 * 【tone 映射总备案（对 StatusPill 五主档 g/y/r/b/n）】
 *    升/好转 → g；降/退化 → r；门槛/热档警告 → y；强调标记/推导类 → b；中性计数/弱标记 → n。
 *    原私形（.up/.down/.hot/.on 色档、outline 描边、bg3 底）一律退役归 theme.css .pill 单源
 *    （pillSingleTrack FORBIDDEN 口径：锚类只留 DOM/布局锚，不得再自带尺寸/色值）。
 *    胶囊尺寸对齐原 span：原 2xs 档三族（hr-diff-pct/bt-cnt/qh-ver）挂全局 .pill.xs；
 *    原 fs-xs 档两族（hr-sec-cnt/io-recs-cnt）用 .pill 默认档。
 * ⑤ SqlConsoleView 展开/收起双钮合一：工具行「模板」展开钮（v-if=!railOpen）+ 侧栏头「收起」
 *    钮 → 工具行常驻单 toggle（data-sq-rail-toggle），随态换文案 模板/收起 + chevron 随态旋转
 *    （XmigrateView 页头单钮先例同语言）；railOpen usePref 状态机零改动。
 * ⑥ ResizablePane axis-vertical 竖排标题轨死码退役（R125 v2 设计随 519/538 批全部 pane spec
 *    title:'' 消费清零而失活；layoutOcclusionGuard501/flattenWave534⑤ 字面锁同步更新翻负）。
 *    边界备案：只退役「竖排轨」——横排 title 头分支与 .rp-title/.rp-toggle 基础档保留
 *    （horizontal 轴 dormant 路径 + WorkbenchPaneSpec title 契约，非本范式射程）。
 * ⑦ WorkbenchLayout wl-restore-rail（553 独占态还原轨）豁免备案：独占还原轨非标题轨，
 *    不在「竖排标题轨退役」范式射程内——零行为变更，只立备案注释。
 *
 * 范围铁律：纯视觉/组件层——高度结构语义零变动；不动任何 <script> 业务逻辑
 * （⑤ 的 railOpen toggle 表达式除外，状态机本身不动）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
/* 剥 CSS/HTML 注释：注释里的字面不算数（lrBarSingleTrack/emptyStatePadding 同一教训） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* ═══════════ ① HealthReportView：三族胶囊改用 ═══════════ */

describe('五百五十四批①：HealthReportView 三族胶囊改用 StatusPill', () => {
  const s = read('../views/HealthReportView.vue');

  it('三族私造胶囊皮退役（尺寸/色值归 .pill 单源；锚类只留 DOM/布局锚）', () => {
    const t = strip(s);
    expect(t, '.hr-diff-pct 私造皮退役（含 .up/.down 色档）').not.toMatch(/\.hr-diff-pct[^{]*\{/);
    expect(t, '.hr-sec-cnt 私造皮退役').not.toMatch(/\.hr-sec-cnt\s*\{/);
    expect(t, '.hr-pop-mark 强调/描边档退役（.on 变体全形态清零）').not.toMatch(/\.hr-pop-mark\.on/);
    expect(t, '.hr-pop-mark 仅剩布局锚（margin-left:auto 推右 + flex:none）')
      .toMatch(/\.hr-pop-mark \{ margin-left: auto; flex: none; \}/);
  });

  it('hr-diff-pct 改用在场：得分差 up→g / down→r；变化率徽标 tone 随指标性质分档（965 色档语义，healthDiffTone965；xs 档对齐原 2xs，mono 保数字档）', () => {
    expect(s, 'summary 得分差徽标').toContain(
      '<StatusPill v-if="scoreDelta" class="hr-diff-pct mono xs" :tone="deltaUp ? \'g\' : \'r\'" :label="scoreDelta" />');
    expect(s, 'diff 行变化率徽标（tone 分档：score 涨绿保持/健康量族反转/其余中性）').toContain(
      '<StatusPill v-if="d.pct" class="hr-diff-pct mono xs" :tone="d.tone" :label="d.pct" />');
    expect(s, '旧「涨绿跌红」二元形态防回潮').not.toContain("d.up ? 'g'");
  });

  it('hr-sec-cnt 改用在场 ×3：中性计数→n（检查项/不健康索引/节点负载）', () => {
    expect(s).toContain('<StatusPill class="hr-sec-cnt" tone="n" :label="String(data.checks?.length || 0)" />');
    expect(s).toContain('<StatusPill class="hr-sec-cnt" tone="n" :label="String(data.unhealthyIndices.length)" />');
    expect(s).toContain('<StatusPill class="hr-sec-cnt" tone="n" :label="String(data.nodes.length)" />');
  });

  it('hr-pop-mark 改用在场 ×4：本弹层当前选中(.on)→b / 另一角色→n（MarkText 语义不合备案见头注）', () => {
    const t = strip(s);
    expect(t.match(/class="hr-pop-mark" tone="b"/g)?.length, '强调档两处（基准/对照弹层各一）').toBe(2);
    expect(t.match(/class="hr-pop-mark" tone="n"/g)?.length, '弱化档两处').toBe(2);
    expect(t, '「当前基准」标记在场').toContain('label="当前基准"');
    expect(t, '「当前对照」标记在场').toContain('label="当前对照"');
  });
});

/* ═══════════ ② BoostTunerView：bt-cnt 改用 ═══════════ */

describe('五百五十四批②：BoostTunerView bt-cnt 计数徽标改用 StatusPill', () => {
  const s = read('../views/BoostTunerView.vue');

  it('bt-cnt 私造皮退役（含 .hot warn 档；类名留作 boostMgmt525 DOM 锚）', () => {
    const t = strip(s);
    expect(t).not.toMatch(/\.bt-cnt \{/);
    expect(t, '.hot 色档随皮退役').not.toMatch(/\.bt-cnt\.hot/);
  });

  it('改用在场：默认中性→n、N>10 热→y（停用尾注并入 label，boostMgmt525 字面锁同步更新）', () => {
    expect(s).toContain(
      '<StatusPill class="bt-cnt xs" :tone="fields.length > 10 ? \'y\' : \'n\'" :label="`共 ${fields.length} 字段${offCount ? \' · 停用 \' + offCount : \'\'}`" />');
  });
});

/* ═══════════ ③④ IndexOptimizer / QueryHub：计数与版本门槛徽标 ═══════════ */

describe('五百五十四批③：IndexOptimizerView io-recs-cnt 计数徽标改用 StatusPill', () => {
  const s = read('../views/IndexOptimizerView.vue');
  it('私造皮退役 + 改用在场（中性计数→n）', () => {
    expect(strip(s)).not.toMatch(/\.io-recs-cnt\s*\{/);
    expect(s).toContain('<StatusPill class="io-recs-cnt" tone="n" :label="String(recs.length)" />');
  });
});

describe('五百五十四批④：QueryHubView qh-ver 版本门槛徽标改用 StatusPill', () => {
  const s = read('../views/QueryHubView.vue');
  it('私造皮（outline 描边）退役 + 改用在场（warn 语义→y，title 走组件 prop）', () => {
    expect(strip(s)).not.toMatch(/\.qh-ver\s*\{/);
    expect(s).toContain('class="qh-ver xs" tone="y"');
    expect(s).toMatch(/<StatusPill v-if="m\.minVer && store\.verBelow\(m\.minVer\)" class="qh-ver xs" tone="y"/);
    expect(s, 'title 语义同步更新（组件 title prop，不出 DOM 丢提示）')
      .toContain(':title="`当前集群 ES ${store.esVersion}，此通道需要 ES ${m.minVer}+`"');
  });
});

/* ═══════════ ⑤ SqlConsoleView：展开/收起双钮合一 ═══════════ */

describe('五百五十四批⑤：SqlConsoleView 模板侧栏展开/收起双钮合一', () => {
  const s = read('../views/SqlConsoleView.vue');

  it('双钮反模式退役：data-sq-rail-open/close 全形态清零（注释字面一并清）', () => {
    const t = strip(s);
    expect(t, '工具行条件展开钮退役').not.toContain('data-sq-rail-open');
    expect(t, '侧栏头收起钮退役').not.toContain('data-sq-rail-close');
  });

  it('单 toggle 常驻工具行：随态换文案 + railOpen = !railOpen 翻转（chevron 随态旋转）', () => {
    const t = strip(s);
    expect(t.match(/data-sq-rail-toggle/g)?.length, '单钮唯一出处').toBe(1);
    expect(t, '同钮随态换文案（模板/收起）').toContain("{{ railOpen ? '收起' : '模板' }}");
    expect(t, '点击翻转').toContain('@click="railOpen = !railOpen"');
    expect(t, 'title 随态（XmigrateView 先例同语言）').toContain(':title="railOpen ? \'收起模板侧栏\' : \'展开模板侧栏\'"');
    expect(t, 'chevron 随态旋转').toMatch(/rotate\(180deg\)/);
  });

  it('状态机零改动：usePref sql.railOpen 默认开 + rail-off 网格档 + 宽度档钮留守', () => {
    const t = strip(s);
    expect(t, 'usePref 状态机逐字不动').toContain("usePref('sql.railOpen', true)");
    expect(t, 'rail-off 折叠档保留').toContain("'rail-off': !railOpen");
    expect(t, '宽度档钮（data-sq-rail-w）留守').toContain('data-sq-rail-w');
  });
});

/* ═══════════ ⑥ ResizablePane：竖排标题轨死码退役 ═══════════ */

describe('五百五十四批⑥：ResizablePane axis-vertical 竖排标题轨死码退役', () => {
  const s = read('../components/ResizablePane.vue');

  it('竖排轨 CSS 退役（501/534⑤ 字面锁同步更新翻负；消费端 519/538 批起全量 title:\'\'）', () => {
    const t = strip(s);
    expect(t, '.axis-vertical > .rp-title 竖排轨整块退役').not.toMatch(/\.axis-vertical > \.rp-title/);
    expect(t, '竖排 writing-mode 随轨退役').not.toContain('writing-mode');
    expect(t, '34px 竖轨宽档退役').not.toMatch(/\.rp-title[^{]*\{[^}]*flex: 0 0 34px/);
  });

  it('边界备案：横排 title 头分支与 .rp-title/.rp-toggle 基础档保留（非竖排轨范式射程）', () => {
    const t = strip(s);
    expect(t, 'title 头分支保留（horizontal dormant 路径 + 契约未来消费）').toContain('v-if="title"');
    expect(t, '.rp-title 基础横排档保留').toMatch(/\.rp-title \{/);
    expect(t, '.rp-toggle 基础档保留').toMatch(/\.rp-toggle \{/);
  });
});

/* ═══════════ ⑦ WorkbenchLayout：wl-restore-rail 豁免备案（零行为变更） ═══════════ */

describe('五百五十四批⑦：WorkbenchLayout wl-restore-rail 豁免备案（零行为变更）', () => {
  const s = read('../components/WorkbenchLayout.vue');

  it('豁免备案注释在场：独占还原轨非标题轨（与竖排标题轨退役范式的边界）', () => {
    expect(s).toContain('独占还原轨非标题轨');
  });

  it('行为零变更：还原轨模板接线与两档形态逐字在场（dqUx553 同锚防误伤）', () => {
    expect(s).toContain('wl-restore-rail');
    expect(s).toMatch(/v-if="isMaxHidden\(spec\)"/);
    const vertical = s.match(/\.wl:not\(\.stacked\):not\(\[data-layout-axis='horizontal'\]\) \.wl-restore-rail \{[^}]*\}/)?.[0];
    expect(vertical, '行布局竖排轨形态不动').toBeTruthy();
    expect(vertical).toContain('writing-mode: vertical-rl');
    const horizontal = s.match(/\.wl\.stacked \.wl-restore-rail[^{]*\{[^}]*\}/)?.[0];
    expect(horizontal, 'stacked 横向退化形态不动').toBeTruthy();
  });
});
