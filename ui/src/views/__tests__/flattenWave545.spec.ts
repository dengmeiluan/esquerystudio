/**
 * 五百四十五批·轨4（工蚁 W4）：全站扁平化扫荡第五波（立法①②③④残面清零九件）· 契约记档。
 *
 * 仿 flattenWave540/544 静态源码断言范式（happy-dom 不挂载）：
 * ① Workbench pane 内第一层壳漏收补刀（534 立法①残面）：ConfigDriftView .cd-list（407 批接
 *    WorkbenchLayout 后 pane 内壳，534 只清了 cd-card settings/mapping 两壳）壳三件套退役 →
 *    类名保留作模板锚（qualityThreeState 挂载断言在册，538 io-cur 先例：壳死类名不陪葬）；
 *    cd-list-head bg2 头条底色退役（540 uq-script-hd 同语言：分界归既有 border-bottom 承接）。
 * ② 540 card 族同语言收尾（立法④）：AnalysisSettingsView as-card / ConfigValidatorView
 *    cv-card / MappingDesignerView md-card 三视图工作台分节壳 chrome 退役——内容直贴，分界由
 *    各自 -card-hd 既有 border-bottom 承接（540 df/rd/sy 先例）；overflow hidden + flex
 *    column + min-height 0 骨架逐字保留（等高收缩防撑破是结构语义非 chrome；cv-card
 *    monaco-host 260px 锚 selectorUnify532/flattenWave538 双源在册不动）。
 * ③ 直排分节壳降层（立法④，540 io-preview / 538 io-cur 同语言）：HealthReportView hr-sec ×4
 *    中性大容器框退役转 border-top 分节（hr-sec-hd card-t 行首档保）；hr-hero 评分卡原豁免
 *    记档已被 551 批裁决推翻随横幅壳退役（三态语义色改由 hr-score-n 文本色承接，③用例已随迁）；
 *    LifecycleView lc-panel ×3 转 border-top 分节；PainlessLabView pl-panel ×2 转 border-top
 *    分节（rail rail 内两分节，间距由 pl-left flex gap 承担）。
 * ④ 立法②弱化档标题转正：PainlessLabView pl-panel-tt（muted+uppercase+0.5px 弱化档退役）
 *    → 650/tx1/.02em 行首档（540 uq-script-hd 同语言，.btn 复位补丁随 uppercase 孤儿化退役）；
 *    AnalyzeView av-block-t（tx2+uppercase+.05em）同语言转正（av-tk-bar 工具条组合类布局不动）。
 * ⑤ DiffEditorView df-topbar 工具条壳三件套退役（538 cv-import 同语言：flex 布局/gap/margin
 *    原样，bg/border/radius/padding 壳 chrome 退役，内容直贴）。
 * ⑥ 豁免记档正锁（保留面防误退）：SlmView slm-card / RemoteClustersView rc-card hover 交互卡
 *    （540 fv-card/wt-card 判例：壳级 hover 态=列表卡交互语义；551 批两卡壳随立法④退役、
 *    hover 态由顶部 hairline 变色承接仍在场）；ReindexAdvancedView ra-card 原页面级卡豁免
 *    551 批随立法④退役（用例已随迁 border-top 分节新形态）；PluginsView pl-matrix
 *    矩阵裸表豁免（插件×节点二维标记矩阵+行级 contextmenu 交互，QRT rows 型不可表达；
 *    raw 表 525 W5 已入 QRT 内核）；SqlBridge br-cmp 对比表随 br-card 535 豁免域维持。
 * ⑦ 恒高字面冻结（本批纯视觉降层零高度链改动，锁现状防回潮）：cv-grid 42vh 定行与
 *    monaco-host 260px 兜底（538 锁双源核对）/ hr-alloc-pre 200 / lc-panel-tt 与 pl-panel-tt
 *    无高度字面不新增——全批未触任何 height/max-height/min-height 声明。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* ═══════════ ① Workbench pane 内壳漏收补刀（cd-list） ═══════════ */

describe('五百四十五批①：cd-list pane 内壳三件套退役（534 立法①残面漏收补刀）', () => {
  it('ConfigDriftView：cd-list 底色/通栏 border/圆角不回流；类名保留作模板锚', () => {
    const cd = read('../ConfigDriftView.vue');
    expect(cd, 'cd-list 底色壳不回流').not.toMatch(/\.cd-list \{[^}]*background/);
    expect(cd, 'cd-list 通栏 border 不回流').not.toMatch(/\.cd-list \{[^}]*border/);
    expect(cd, 'cd-list 圆角壳不回流').not.toMatch(/\.cd-list \{[^}]*border-radius/);
    expect(cd, '类名保留作模板锚（qualityThreeState 挂载断言在册）').toMatch(/class="cd-list"/);
  });

  it('cd-list-head bg2 头条底色退役（540 uq-script-hd 同语言：分界归 border-bottom）', () => {
    const cd = read('../ConfigDriftView.vue');
    expect(cd, '头条底色不回流').not.toMatch(/\.cd-list-head \{[^}]*background/);
    expect(cd, '分界由既有 border-bottom 承接（不消义）')
      .toMatch(/\.cd-list-head \{ display: flex; align-items: center; gap: var\(--sp-2\); padding: var\(--sp-2\) var\(--sp-3\); border-bottom: 1px solid var\(--border\); \}/);
    expect(cd, '行首横排档 cd-list-tt 逐字不动（534 锚随批复核）')
      .toMatch(/\.cd-list-tt \{ font-size: var\(--fs-xs\); font-weight: 650; color: var\(--tx1\); letter-spacing: \.02em; flex-shrink: 0; \}/);
  });
});

/* ═══════════ ② 540 card 族同语言收尾（as/cv/md） ═══════════ */

describe('五百四十五批②：as-card/cv-card/md-card 工作台分节壳 chrome 退役（540 df/rd/sy 同语言）', () => {
  const TRIO: Array<[string, string, string]> = [
    ['AnalysisSettingsView', 'as-card', 'as-card-hd'],
    ['ConfigValidatorView', 'cv-card', 'cv-card-hd'],
    ['MappingDesignerView', 'md-card', 'md-card-hd'],
  ];

  it('三视图壳 chrome 退役：bg/border/radius 不回流；骨架逐字保留', () => {
    for (const [view, card, hd] of TRIO) {
      const s = read(`../${view}.vue`);
      expect(s, `${view} ${card} 底色壳不回流`).not.toMatch(new RegExp(String.raw`\.${card} \{[^}]*background`));
      expect(s, `${view} ${card} 通栏 border 不回流`).not.toMatch(new RegExp(String.raw`\.${card} \{[^}]*border[^-]`));
      expect(s, `${view} ${card} 圆角壳不回流`).not.toMatch(new RegExp(String.raw`\.${card} \{[^}]*border-radius`));
      expect(s, `${view} overflow 承接骨架保留（Monaco 100% 高容器防撑破，540 df-card 同款）`)
        .toMatch(new RegExp(String.raw`\.${card} \{ overflow: hidden; display: flex; flex-direction: column; min-height: 0; \}`));
      expect(s, `${view} 分界由 ${hd} 既有 border-bottom 承接（SqlBridge 535 先例）`)
        .toMatch(new RegExp(String.raw`\.${hd} \{[^}]*border-bottom: 1px solid var\(--border\);`));
    }
  });

  it('cv-card monaco-host 260px 兜底锚双源复核（selectorUnify532/flattenWave538 在册不动）', () => {
    const cv = read('../ConfigValidatorView.vue');
    expect(cv).toMatch(/\.cv-card > :deep\(\.monaco-host\) \{ flex: 1 1 0; min-height: 260px; \}/);
    expect(cv, 'cv-grid 42vh 定行逐字（538 锁双源核对）').toContain('.cv-grid { grid-template-rows: minmax(300px, 42vh); }');
  });
});

/* ═══════════ ③ 直排分节壳降层（hr-sec/lc-panel/pl-panel） ═══════════ */

describe('五百四十五批③：直排分节壳降层（立法④ io-preview/io-cur 同语言）', () => {
  it('HealthReportView：hr-sec ×4 中性大容器框退役 → border-top 分节；hr-sec-hd 行首档保', () => {
    const hr = read('../HealthReportView.vue');
    expect(hr, 'hr-sec 底色块不回流').not.toMatch(/\.hr-sec \{[^}]*background/);
    expect(hr, 'hr-sec 通栏 border/圆角壳不回流').not.toMatch(/\.hr-sec \{[^}]*border[^-]/);
    expect(hr, 'hr-sec 圆角壳不回流').not.toMatch(/\.hr-sec \{[^}]*border-radius/);
    expect(hr, 'io-preview 540 同款分节形逐字在场')
      .toMatch(/\.hr-sec \{ border-top: 1px solid var\(--line\); padding-top: var\(--sp-2\); \}/);
    expect((hr.match(/class="hr-sec"/g) || []).length, '四处分节消费（检查项/不健康索引/节点负载/分配解释）').toBe(4);
    expect(hr, 'hr-sec-hd card-t 行首档保（降层不消义）').toMatch(/class="card-t hr-sec-hd"/);
  });

  it('hr-hero 评分语义色正锁（ok/warn/err 三态语义色由 hr-score-n 文本色承接；540 rd-duel-side.win 同判）', () => {
    /* 五百五十一批随迁：hero 大横幅壳随 551 裁决退役（推翻本批「hero 豁免」记档：hero 是 chrome
       非语义）——边框+渐变壳档退役，三态语义色改由 hr-score-n 文本色承接（分数即状态，语义色
       不丢的意图不变）；断言随迁为新承接形态正锁（防语义色丢失 + 旧壳档回流双负锁） */
    const hr = read('../HealthReportView.vue');
    expect(hr, 'ok 语义色承接在场').toMatch(/\.hr-hero\.ok \.hr-score-n \{ color: var\(--ok\); \}/);
    expect(hr, 'warn 语义色承接在场').toMatch(/\.hr-hero\.warn \.hr-score-n \{ color: var\(--warn\); \}/);
    expect(hr, 'err 语义色承接在场').toMatch(/\.hr-hero\.err \.hr-score-n \{ color: var\(--err\); \}/);
    expect(hr, '旧边框+渐变壳档不回流').not.toMatch(/\.hr-hero\.(ok|warn|err) \{ border-color/);
  });

  it('LifecycleView：lc-panel ×3 面板壳退役 → io-cur 538 同款 border-top 分节（margin 间距载体原样）', () => {
    const lc = read('../LifecycleView.vue');
    expect(lc, 'lc-panel 底色块不回流').not.toMatch(/\.lc-panel \{[^}]*background/);
    expect(lc, 'lc-panel 圆角壳不回流').not.toMatch(/\.lc-panel \{[^}]*border-radius/);
    expect(lc, 'lc-panel 通栏 border 不回流（仅 border-top 分界）').not.toMatch(/\.lc-panel \{[^}]*border[^-]/);
    expect(lc, 'io-cur/io-recs 538 同款分节形逐字在场 + 原间距载体保留')
      .toMatch(/\.lc-panel \{ border-top: 1px solid var\(--line\); padding-top: var\(--sp-2\); margin-bottom: var\(--sp-3\); \}/);
    expect((lc.match(/class="lc-panel"/g) || []).length, '三处分节消费').toBe(3);
    expect(lc, 'lc-panel-tt 行首横排档保（600 字重达标档不动）').toMatch(/\.lc-panel-tt \{ font-size: var\(--fs-xs\); font-weight: 600;/);
  });

  it('PainlessLabView：pl-panel ×2 面板壳退役 → border-top 分节（pl-left gap 承担节间距）', () => {
    const pl = read('../PainlessLabView.vue');
    expect(pl, 'pl-panel 底色块不回流').not.toMatch(/\.pl-panel \{[^}]*background/);
    expect(pl, 'pl-panel 圆角壳不回流').not.toMatch(/\.pl-panel \{[^}]*border-radius/);
    expect(pl, 'pl-panel 通栏 border 不回流（仅 border-top 分界）').not.toMatch(/\.pl-panel \{[^}]*border[^-]/);
    expect(pl, 'border-top 分节形逐字在场').toMatch(/\.pl-panel \{ border-top: 1px solid var\(--line\); padding-top: var\(--sp-2\); \}/);
    expect((pl.match(/class="pl-panel"/g) || []).length, '两处分节消费').toBe(2);
  });
});

/* ═══════════ ④ 立法②弱化档标题转正（pl-panel-tt / av-block-t） ═══════════ */

describe('五百四十五批④：弱化档区块标题转 650/tx1/.02em 行首档（540 uq-script-hd 同语言）', () => {
  it('PainlessLabView：pl-panel-tt muted+uppercase 弱化档退役 → 行首横排档逐字', () => {
    const pl = read('../PainlessLabView.vue');
    expect(pl, 'muted 弱化色不回流').not.toMatch(/\.pl-panel-tt \{[^}]*color: var\(--muted\)/);
    expect(pl, 'uppercase 弱化形不回流').not.toMatch(/\.pl-panel-tt \{[^}]*text-transform/);
    expect(pl, '650/tx1/.02em 行首档逐字在场（.btn 复位补丁随 uppercase 孤儿化退役）')
      .toMatch(/\.pl-panel-tt \{ font-size: var\(--fs-xs\); font-weight: 650; color: var\(--tx1\); letter-spacing: \.02em; margin-bottom: var\(--sp-1\); display: flex; align-items: center; \}/);
    expect(pl, '.btn 补丁孤儿化退役（text-transform:none 复位无对象）').not.toMatch(/\.pl-panel-tt \.btn \{[^}]*text-transform/);
  });

  it('AnalyzeView：av-block-t tx2+uppercase 弱化档退役 → 行首横排档逐字（av-tk-bar 组合类布局不动）', () => {
    const av = read('../AnalyzeView.vue');
    expect(av, 'tx2 弱化色不回流').not.toMatch(/\.av-block-t \{[^}]*color: var\(--tx2\)/);
    expect(av, 'uppercase 弱化形不回流').not.toMatch(/\.av-block-t \{[^}]*text-transform/);
    expect(av, '650/tx1/.02em 行首档逐字在场（margin/padding 原值不动）')
      .toMatch(/\.av-block-t \{ font-size: var\(--fs-xs\); font-weight: 650; color: var\(--tx1\); letter-spacing: \.02em; margin: var\(--sp-2h\) 0 var\(--sp-1h\); padding: 0 var\(--sp-1\); \}/);
    expect(av, 'av-tk-bar 工具条组合类布局零触').toMatch(/\.av-tk-bar \{ display: flex; align-items: center; gap: var\(--sp-2\); flex-wrap: wrap; \}/);
  });
});

/* ═══════════ ⑤ df-topbar 工具条壳退役（538 cv-import 同语言） ═══════════ */

describe('五百四十五批⑤：df-topbar 工具条壳三件套退役（cv-import 538 同语言）', () => {
  it('DiffEditorView：bg/border/radius/padding 壳 chrome 退役；flex 布局三件原样', () => {
    const df = read('../DiffEditorView.vue');
    expect(df, '工具条底色不回流').not.toMatch(/\.df-topbar \{[^}]*background/);
    expect(df, '工具条描边/圆角不回流').not.toMatch(/\.df-topbar \{[^}]*border/);
    expect(df, 'flex 布局三件与间距载体原样（cv-import 同语言：裸 flex 条）')
      .toMatch(/\.df-topbar \{ display: flex; justify-content: space-between; align-items: end; gap: var\(--sp-2\) var\(--sp-3\); flex-wrap: wrap; margin-bottom: var\(--sp-3\); \}/);
    /* 540 锁随批复核：df-card 540 形态零触 */
    expect(df, 'df-card 540 退役形态零触（flex 骨架逐字）').toMatch(/\.df-card \{ overflow: hidden; display: flex; flex-direction: column; \}/);
  });
});

/* ═══════════ ⑥ 豁免记档正锁（保留面防误退） ═══════════ */

describe('五百四十五批⑥：交互卡/页面级卡/矩阵裸表豁免正锁（保留面锁定）', () => {
  it('slm-card / rc-card hover 交互卡在场（540 fv-card/wt-card 判例：壳级 hover=列表卡交互语义）', () => {
    const slm = read('../SlmView.vue');
    const rc = read('../RemoteClustersView.vue');
    expect(slm, 'slm-card hover 态在场（壳退役豁免）').toMatch(/\.slm-card:hover \{ border-color: var\(--brand\); \}/);
    expect(rc, 'rc-card hover 态在场（壳退役豁免）').toMatch(/\.rc-card:hover \{ border-color: var\(--brand\); \}/);
  });

  it('ra-card 单卡连体页面级分节（551 批：原页面级卡豁免随立法④退役 → border-top 分节新形态；类名保留模板锚）', () => {
    /* 五百五十一批随迁：原三件套正锁随壳退役失效，改锚 border-top 分节新形态正锁（防壳档回流）；
       ra-top border-bottom 与 ra-sec 间 border-top 既有内部分节线承接分界（分组标题语义原样） */
    const ra = read('../ReindexAdvancedView.vue');
    expect(ra, 'ra-card 页面级连体卡在场').toMatch(/class="ra-card"/);
    expect(ra, 'ra-card border-top 分节新形态在场（551）').toMatch(
      /\.ra-card \{ border-top: 1px solid var\(--border-subtle\); margin-bottom: var\(--sp-3\); \}/);
    expect(ra, '旧三件套壳档不回流').not.toMatch(/\.ra-card \{ background: var\(--panel\)/);
  });

  it('五百六十一批随迁：pl-matrix 豁免翻案——矩阵表换 QRT rows 型（#cell-插件 槽+row-actions 承接）', () => {
    const pl = read('../PluginsView.vue');
    expect(pl, '矩阵表换 QRT rows 型（豁免理由消除：cols=nodeNames 直映射可表达二维标记矩阵）')
      .toContain('storage-key="plugins:matrix"');
    expect(pl, '行级 contextmenu 交互迁 #row-actions 槽（原 tr contextmenu 随裸表退役）')
      .toMatch(/<template #row-actions="\{ row \}">/);
    expect(pl, 'raw 记录表已寄居 QRT 内核（525 W5 收编在册）').toContain('storage-key="plugins:raw"');
  });
});
