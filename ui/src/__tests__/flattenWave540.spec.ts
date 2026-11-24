/**
 * 五百四十批·轨4（工蚁 W4）：全站扁平化扫荡第三波（定向两件 + card 族判断式收尾）· 契约备案。
 *
 * 仿 flattenWave538 静态源码断言范式（happy-dom 不挂载）：
 * ① 定向两件：IndexOptimizerView .io-preview 大容器框（bg+border+radius）退役 → io-cur/io-recs
 *    538 同款 border-top 分节（io-preview-hd sec-t 行首保；io-preview-code 内容面 bg2 + 240 恒高
 *    随 538 锁原样，未触）；UpdateByQueryView .uq-script-hd code-bg 头条退役 → 约定②行首
 *    横排档（uq-card-hd 538 同语言：border-bottom 分界 + 650/tx1/.02em，muted 弱化档退役）；
 *    .uq-result code-bg 内容面按 .br-err-pre 先例保留（代码内容面底色豁免）。
 * ② card 族扫荡收尾（你域 8 视图逐 hit 判定）：DiffEditorView .df-card / RankDebugView .rd-card /
 *    SynonymsManagerView .sy-card 工作台分节壳 chrome 退役——内容直贴，分界由各自 -card-hd 既有
 *    border-bottom 承接（SqlBridge 535 先例）；布局骨架（flex column / overflow / wide 占位）逐字
 *    保留（等高双栏与收缩防撑破是结构语义非 chrome）。
 * ③ 豁免备案正锁（保留面防误退）：Watcher wt-card / Favorites fv-card 交互卡（hover 态 +
 *    命中/点选态）约定③豁免在场；SqlBridge .br-card 仅 wide 页面级卡（535 裁决，工作台 pane
 *    不得回流）；语义边框族（rd-duel-side.win / wt-alert warn 档）在场。
 * ④ 恒高字面冻结：纯视觉降层未动任何高度链，所触视图恒高逐字锁现状防回潮
 *    （io-preview-code 240 与 uq-err-msg 120 为 538 锁双源核对，其余为所触文件在册恒高）。
 * ⑤ pillSingleTrack MERGED 字典 cv-rp-badge 空键清退：538 改用 StatusPill 后类全形态清零，
 *    字典项空转（防回潮已由 flattenWave538④ 承接），字典项退役。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* ═══════════ ① 定向两件 ═══════════ */

describe('五百四十批①：io-preview 大容器框退役 / uq-script-hd code-bg 头条退役', () => {
  it('IndexOptimizerView：io-preview 壳 chrome 退役 → io-cur/io-recs 538 同款 border-top 分节', () => {
    const io = read('../views/IndexOptimizerView.vue');
    expect(io, '538 io-cur/io-recs 同款分节形逐字在场').toMatch(
      /\.io-preview \{ border-top: 1px solid var\(--line\); padding-top: var\(--sp-2\); \}/);
    expect(io, 'io-preview 底色块不回流').not.toMatch(/\.io-preview \{[^}]*background/);
    expect(io, 'io-preview 圆角壳不回流').not.toMatch(/\.io-preview \{[^}]*border-radius/);
    expect(io, 'io-preview-hd sec-t 行首保在场（538② 分节头不消义）').toMatch(/class="io-preview-hd sec-t"/);
  });

  it('UpdateByQueryView：uq-script-hd code-bg 头条退役 → 约定②行首横排档（uq-card-hd 同语言）', () => {
    const uq = read('../views/UpdateByQueryView.vue');
    expect(uq, 'border-bottom 分界承接 + 650/tx1/.02em 行首档（padding 原值不动）').toMatch(
      /\.uq-script-hd \{ display: flex; align-items: center; padding: var\(--sp-2\) var\(--sp-3\); border-bottom: 1px solid var\(--border\); font-size: var\(--fs-xs\); font-weight: 650; color: var\(--tx1\); letter-spacing: \.02em; \}/);
    expect(uq, 'code-bg 头条底色不回流').not.toMatch(/\.uq-script-hd \{[^}]*background/);
  });

  it('UpdateByQueryView：uq-result code-bg 内容面按 .br-err-pre 先例保留（代码内容面豁免）', () => {
    const uq = read('../views/UpdateByQueryView.vue');
    expect(uq, '结果输出面底色保留（误退即回潮）').toMatch(
      /\.uq-result \{ padding: var\(--sp-3\); font-size: var\(--fs-xs\); background: var\(--code-bg\); margin: 0; overflow-x: auto; \}/);
  });
});

/* ═══════════ ② card 族扫荡收尾（df / rd / sy） ═══════════ */

describe('五百四十批②：工作台分节壳 chrome 退役（分界归 -card-hd 既有 border-bottom）', () => {
  it('DiffEditorView：df-card 壳退役；flex column + overflow 骨架与 wide 占位逐字保留', () => {
    const df = read('../views/DiffEditorView.vue');
    expect(df, 'df-card 底色壳不回流').not.toMatch(/\.df-card \{[^}]*background/);
    expect(df, 'df-card 通栏 border/圆角壳不回流').not.toMatch(/\.df-card \{[^}]*border/);
    expect(df, '等高双栏骨架保留（overflow 收缩防撑破 + flex column）')
      .toMatch(/\.df-card \{ overflow: hidden; display: flex; flex-direction: column; \}/);
    expect(df, 'wide 网格占位同步更新保留').toMatch(/\.df-card\.wide \{ grid-column: 1 \/ -1; min-height: 0; \}/);
    expect(df, '分界由 df-card-hd 既有 border-bottom 承接（SqlBridge 535 先例）')
      .toMatch(/\.df-card-hd \{[^}]*border-bottom: 1px solid var\(--border\);/);
  });

  it('RankDebugView：rd-card 描边壳退役；rd-card-ed 533 骨架锚与 rd-card-hd 分界不动', () => {
    const rd = read('../views/RankDebugView.vue');
    expect(rd, 'rd-card 通栏 border 不回流').not.toMatch(/\.rd-card \{[^}]*border/);
    expect(rd, 'rd-card 圆角壳不回流').not.toMatch(/\.rd-card \{[^}]*border-radius/);
    expect(rd, 'overflow 承接保留（A/B 卡中卡根治后仍防内容撑破）').toMatch(/\.rd-card \{ overflow: hidden; \}/);
    expect(rd, 'assistLintWave533 骨架锚逐字不动').toMatch(/\.rd-card-ed \{ display: flex; flex-direction: column; flex: none; \}/);
    expect(rd, '分界由 rd-card-hd 既有 border-bottom 承接').toMatch(/\.rd-card-hd \{[^}]*border-bottom: 1px solid var\(--border\);/);
  });

  it('SynonymsManagerView：sy-card 壳退役；sy-card-hd border-bottom 分界承接', () => {
    const sy = read('../views/SynonymsManagerView.vue');
    expect(sy, 'sy-card 底色壳不回流').not.toMatch(/\.sy-card \{[^}]*background/);
    expect(sy, 'sy-card 通栏 border/圆角壳不回流').not.toMatch(/\.sy-card \{[^}]*border/);
    expect(sy, 'overflow 承接保留（Monaco 100% 高容器防撑破）').toMatch(/\.sy-card \{ overflow: hidden; \}/);
    expect(sy, '分界由 sy-card-hd 既有 border-bottom 承接').toMatch(/\.sy-card-hd \{[^}]*border-bottom: 1px solid var\(--border\);/);
  });
});

/* ═══════════ ③ 豁免备案正锁（保留面防误退） ═══════════ */

describe('五百四十批③：交互卡 / 页面级卡 / 语义边框豁免在场（保留面锁定）', () => {
  it('Watcher wt-card / Favorites fv-card 交互卡豁免：hover 态与命中/点选态在场（约定③豁免）', () => {
    const wt = read('../views/WatcherView.vue');
    const fv = read('../views/FavoritesView.vue');
    expect(wt, 'hover 态是列表卡交互语义，壳退役豁免').toMatch(/\.wt-card:hover \{ border-color: var\(--brand\); \}/);
    expect(wt, '命中高亮态（搜索定位）在场').toMatch(/\.wt-card\.hit-cur \{/);
    expect(fv, '点选态（多选删除）在场').toMatch(/\.fv-card\.fv-sel \{/);
    expect(fv).toMatch(/\.fv-card:hover \{ border-color: var\(--brand\); \}/);
    expect(fv, '命中高亮态在场').toMatch(/\.fv-card\.hit-cur \{/);
  });

  it('SqlBridge br-card：仅对比表页面级卡在场（535 裁决豁免，工作台 pane 不回流壳；562 批 err 面板脱壳 err-bar 承载后余一张）', () => {
    const br = read('../views/SqlBridgeView.vue');
    /* 首类即壳（534 口径）：br-card-hd 等连字类不算 br-card 消费 */
    const hits = [...br.matchAll(/class="([^"]*)"/g)].map(m => m[1].split(/\s+/)).filter(t => t[0] === 'br-card');
    expect(hits.length, '对比表页面级卡（562 批 err 面板已脱壳）').toBe(1);
    for (const t of hits) expect(t, '工作台 pane 级 br-card 不得回流').toContain('wide');
    expect(br, 'err 面板 err-bar 直贴（562 脱卡壳）').toContain('role="alert" class="err-bar br-err"');
  });

  it('语义边框族在场：rd-duel-side.win 胜出态 / wt-alert warn 档（语义豁免非残面）', () => {
    const rd = read('../views/RankDebugView.vue');
    const wt = read('../views/WatcherView.vue');
    expect(rd, '胜出态语义描边豁免').toMatch(/\.rd-duel-side\.win \{ border-color: var\(--warn\); background: var\(--warn-soft\); \}/);
    expect(wt, 'warn 语义条豁免').toMatch(/\.wt-alert \{[^}]*border: 1px solid var\(--warn-line\);/);
  });
});

/* ═══════════ ④ 恒高字面冻结（零高度改动，锁现状防回潮） ═══════════ */

describe('五百四十批④：所触视图恒高字面冻结（2.9.115/119 事故面口径）', () => {
  it('Optimizer/UBQ：io-preview-code 240 与 uq-err-msg 120 逐字在场（538 锁双源核对）', () => {
    const io = read('../views/IndexOptimizerView.vue');
    const uq = read('../views/UpdateByQueryView.vue');
    expect(io, 'flattenWave538③ 同源锁随批复核').toMatch(/\.io-preview-code \{[^}]*max-height: 240px; overflow-y: auto;/);
    expect(uq).toContain('.uq-err-msg { max-height: 120px; overflow: auto; white-space: pre-wrap; }');
  });

  it('DiffEditor：df-ta / df-ta-ja 300 保底逐字在场（等高双栏高度链未动）', () => {
    const df = read('../views/DiffEditorView.vue');
    expect(df).toMatch(/\.df-ta \{[^}]*min-height: 300px;/);
    expect(df).toContain('.df-ta-ja { min-height: 300px; }');
  });

  it('RankDebug/Synonyms：rd-tree 42vh 弹性档 / sy-preview 260 / sy-log 200 逐字在场', () => {
    const rd = read('../views/RankDebugView.vue');
    const sy = read('../views/SynonymsManagerView.vue');
    expect(rd).toMatch(/\.rd-tree \{[^}]*max-height: max\(280px, 42vh\);/);
    expect(sy).toMatch(/\.sy-preview \{[^}]*max-height: 260px;/);
    expect(sy).toMatch(/\.sy-log \{[^}]*max-height: 200px;/);
  });
});

/* ═══════════ ⑤ pillSingleTrack MERGED 空键清退 ═══════════ */

describe('五百四十批⑤：pillSingleTrack MERGED 字典 cv-rp-badge 空键清退', () => {
  it('字典项退役（538 改用 StatusPill 后类全形态清零，键空转；防回潮归 flattenWave538④）', () => {
    const pill = read('./pillSingleTrack.spec.ts');
    expect(pill, "MERGED 不再含 'cv-rp-badge' 空转键").not.toContain("'cv-rp-badge'");
    expect(read('../views/ConfigValidatorView.vue'), '类本体全形态清零（538④ 同源）').not.toContain('cv-rp-badge');
  });
});
