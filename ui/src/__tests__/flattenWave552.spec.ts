/**
 * 五百五十二批·轨4（工蚁4）：扁平化扫荡。静态源码断言仿 flattenWave546/550/551 范式。
 *
 * ① IndexSettingsView is-custom 卡中卡退役（约定④：dashed border+bg0+radius 子框整块消除
 *    → border-top 分节；同页 is-diff 530 批已裁决形态为逐字参照系；is-custom-head sec-t
 *    标题行首横排锚在场）。
 * ② 三视图页顶工具条 card 壳退役（约定③：IndexSettings is-bar / SearchSandbox ss-bar /
 *    Topology tp-bar → 裸 lr-bar 行 + border-bottom 分界）——lr-bar 骨架单轨不动
 *    （lrBarSingleTrack CONSUMERS 在册）；tp-canvas/tp-palette 547 豁免正锁
 *    （paneShellWave547/cardPrimitiveVerdict547 在册，零触防误伤）。
 * ③ AdhocRebuildView 私造胶囊三族改用 StatusPill 统一件（已填/留空→n、注解推导→b、
 *    轮次阶段→b；en 英文小字归组件 sp-en 单源）；步②审编卡头补 Terminal 原始 IO 钮
 *    （openRawIo last 扩 /config-lab/ 回退——审编校验走 /config-lab/validate 不在
 *    /adhoc-rebuild/ 记录特征下；rawIo545 字面锁同步更新）。
 * ④ 死 fallback 清扫六处四文件——token 均在 theme.css 在场（--line-strong/--r-m/--r-s/
 *    --err-line/--err-soft/--ok-line/--fg），`, fallback` 恒死分支。
 * ⑤ ClusterSettingsView 死规则 .empty .btn 删（模板 class="empty" 零引用实证）+ err 条
 *    三兄弟数值档统一（--r-m/--sp-*；语义红框 err 保留只统一数值档）。
 *
 * 范围铁律：纯视觉层重构——模板结构语义、高度链（WorkbenchLayout fill-viewport=false
 * 裁决不回退）、六步卡结构零变动。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
/* 剥 CSS/HTML 注释：注释里的字面不算数（lrBarSingleTrack/emptyStatePadding 同一教训） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* ═══════════ ① IndexSettingsView：is-custom 卡中卡退役（约定④） ═══════════ */

describe('五百五十二批①：IndexSettingsView is-custom 卡中卡退役（border-top 分节流）', () => {
  it('is-custom 子框（bg0+dashed+radius）退役 → is-diff 同语言 border-top 分节', () => {
    const s = read('../views/IndexSettingsView.vue');
    expect(s, '卡中卡底色退役').not.toMatch(/\.is-custom \{[^}]*background/);
    expect(s, 'dashed 子框退役').not.toMatch(/\.is-custom \{[^}]*dashed/);
    expect(s, 'radius 退役').not.toMatch(/\.is-custom \{[^}]*border-radius/);
    expect(s, '分节流新形态在场（is-diff 530 裁决逐字参照系）')
      .toMatch(/\.is-custom \{ margin-top: var\(--sp-3\); padding-top: var\(--sp-3\); border-top: 1px solid var\(--line\); \}/);
    expect(s, '同页 is-diff 参照系锚随行复核（零触）')
      .toContain('.is-diff { margin-top: var(--sp-3); padding-top: var(--sp-3); border-top: 1px solid var(--line); }');
    expect(s, '行首横排内缩随分节流（head/rows 自携 --sp-4，与 is-diff-t 同语言）')
      .toContain('.is-custom-head { display: flex; align-items: center; gap: var(--sp-3); margin: 0 var(--sp-4); }');
  });

  it('is-custom-head sec-t 标题行首锚在场（五百二十七批分节标题档不回退）', () => {
    const s = read('../views/IndexSettingsView.vue');
    expect(s).toContain('<span class="is-custom-title sec-t">自定义 setting</span>');
    expect(s, '分节标题弱档单源（.sec-t 全局）').toContain('.is-custom-title { flex-shrink: 0; }');
  });

  it('热参数 .card.is-form 壳退役（五百五十二批收口抓茧：visual-judge 同页双标实锤）', () => {
    const s = read('../views/IndexSettingsView.vue');
    expect(s, 'card 壳类不回流').not.toContain('card is-form');
    expect(s, 'is-form 裸分节行首横排').toContain('.is-form { padding: 0 0 var(--sp-3); }');
    expect(s, '行内容与 card-t 同 x=0').toContain('.is-rows { padding: 0; }');
  });
});

/* ═══════════ ② 三视图工具条 card 壳退役（约定③） ═══════════ */

describe('五百五十二批②：三视图 -bar card 壳退役（裸 lr-bar 行 + border-bottom 分界）', () => {
  const bars: Array<[string, string, string]> = [
    ['IndexSettingsView.vue', 'is-bar', 'var(--sp-3)'],
    ['SearchSandboxView.vue', 'ss-bar', 'var(--sp-2h)'],
    ['TopologyView.vue', 'tp-bar', 'var(--sp-3)'],
  ];

  it('三视图不再有 -bar card lr-bar 卡壳；裸行锚与 border-bottom 分界在场', () => {
    for (const [f, bar, pad] of bars) {
      const s = read('../views/' + f);
      expect(s, `${f} 的 -bar card 卡壳退役`).not.toMatch(/class="[a-z-]*-bar card lr-bar"/);
      /* 1034 冻结首行推广：工具条挂 freeze 修饰类（锚改前缀形态随批迁移） */
      expect(s, `${f} 裸行锚保留（lrBarSingleTrack 骨架单轨 CONSUMERS 在册）`).toContain(`class="${bar} lr-bar freeze"`);
      expect(s, `${f} border-bottom 分界在场（padding 沿用原竖距档 ${pad}）`)
        .toContain(`.${bar} { padding: ${pad} 0; border-bottom: 1px solid var(--line); }`);
    }
  });

  it('TopologyView：tp-canvas/tp-palette 547 豁免壳退役（554 击穿同步更新：border-top 分节承接，本类 padding 零触）', () => {
    const s = read('../views/TopologyView.vue');
    /* 五百五十四批同步更新（击穿者：554 工蚁D④——两 .card 壳退役）：552「豁免不动」正锁改退役形
       + 分节锚在场（paneShellWave547/cardPrimitiveVerdict547 同步同步更新） */
    expect(s, 'tp-canvas 卡壳退役（554 击穿同步更新）').not.toMatch(/class="card tp-canvas"/);
    expect(s, 'tp-palette 卡壳退役（554 击穿同步更新）').not.toMatch(/class="card tp-palette"/);
    expect(s, 'tp-canvas 分节锚承接（554）').toContain('class="tp-canvas"');
    expect(s, 'tp-palette 分节锚承接（554）').toContain('class="tp-palette"');
    expect(s, '豁免册卡壳 padding 零触').toContain('.tp-canvas { padding: var(--sp-4); min-height: 300px;');
  });
});

/* ═══════════ ③ AdhocRebuildView：私造胶囊三族改用 + 原始 IO 回退链 ═══════════ */

describe('五百五十二批③：AdhocRebuildView 三族胶囊改用 StatusPill + 原始 IO 钮', () => {
  it('三族私造胶囊类名退役（CSS+模板全形态清零，注释字面一并清）', () => {
    const s = strip(read('../views/AdhocRebuildView.vue'));
    for (const cls of ['ar-manual-tag', 'ar-derived-tag', 'ph-tag']) {
      expect(s, `.${cls} 私造胶囊退役（改用 StatusPill 统一件）`).not.toContain(cls);
    }
  });

  it('StatusPill import 锚 + 改用在场（已填/留空→n、注解推导→b、轮次阶段→b + en 小字组件化）', () => {
    const s = read('../views/AdhocRebuildView.vue');
    expect(s).toContain("import StatusPill from '../components/StatusPill.vue';");
    expect(s, '手动 settings 已填徽标').toContain('<StatusPill v-if="manualSettings.trim()" tone="n" label="✓ 已填" />');
    expect(s, '手动 settings 留空提示徽标').toContain('<StatusPill v-else tone="n" label="留空 = 沿用源索引" />');
    expect(s, '注解推导徽标（title 语义同步更新）').toMatch(/<StatusPill v-if="mappingFromDerived" tone="b" label="来自注解推导"/);
    expect(s, '轮次阶段徽标（roundZh 未收录回退原英文；en 小字归组件 sp-en）')
      .toContain('<StatusPill tone="b" :label="roundZh(r.phase) || r.phase" :en="roundZh(r.phase) ? r.phase : undefined" />');
  });

  it('openRawIo last 扩 /config-lab/ 回退（rawIo545 字面锁同步更新）+ 步②审编卡头原始 IO 钮', () => {
    const s = read('../views/AdhocRebuildView.vue');
    expect(s, '回退链：托管链无记录时回落 config-lab 校验记录（审编校验走 /config-lab/validate）')
      .toContain("ioRecorder.last('/adhoc-rebuild/') ?? ioRecorder.last('/config-lab/')");
    expect(s, '步②审编卡头原始 IO 钮在场（判空 notify 口径归 openRawIo 既有单源）')
      .toContain('aria-label="查看原始 IO（审编校验）"');
  });
});

/* ═══════════ ④ 死 fallback 清扫（六处四文件） ═══════════ */

describe('五百五十二批④：死 fallback 清零（token 在 theme.css 在场，fallback 恒死分支）', () => {
  it('六处 fallback 逐文件清零：--line-strong/--r-m/--r-s/--err-line/--err-soft/--ok-line/--fg', () => {
    const files = ['IndexSettingsView.vue', 'AdhocRebuildView.vue', 'RankDebugView.vue', 'ScoreExplainView.vue'];
    for (const f of files) {
      expect(read('../views/' + f), `${f} 死 fallback 清零`)
        .not.toMatch(/var\(--(line-strong|r-m|r-s|err-line|err-soft|ok-line|fg),/);
    }
  });

  it('token 在场自证（fallback 退役前先证 token 单源在册）', () => {
    const css = read('../theme.css');
    for (const t of ['--line-strong:', '--r-m:', '--r-s:', '--err-line:', '--err-soft:', '--ok-line:', '--fg:']) {
      expect(css, `${t} 定义在场`).toContain(t);
    }
  });
});

/* ═══════════ ⑤ ClusterSettings 死规则删 + err 条数值档统一 ═══════════ */

describe('五百五十二批⑤：ClusterSettings 死规则删 + err 条三兄弟数值档统一（语义红框保留）', () => {
  it('ClusterSettingsView：.empty .btn 死规则退役（模板 class="empty" 零引用实证）', () => {
    const s = read('../views/ClusterSettingsView.vue');
    expect(s).not.toMatch(/\.empty \.btn/);
    expect(s, 'EmptyState compact 统一件消费面不动（空态归组件单源）').toContain('<EmptyState');
  });

  it('err 条 radius/gap/padding px 字面统一（--r-m/--sp-*；border 语义红框零触）', () => {
    const se = read('../views/ScoreExplainView.vue');
    /* 五百六十一批同步更新：.se-err 私造红壳合并全局 err-bar（558b pf-err 同语言）——
       radius/border 断言随私造规则退役改锁「不回流」+ role=alert 语义锚 */
    expect(se, '.se-err 私造红壳不回流（radius/border 归 err-bar 单源）').not.toMatch(/\.se-err \{/);
    expect(se, '失败面板走 err-bar 基座（role=alert 语义在场）').toMatch(/role="alert" class="err-bar rise-in"/);
    expect(se, '.se-err-body 内容槽保留').toContain('.se-err-body { flex: 1; min-width: 0; }');
    const pf = read('../views/ProfileFlameView.vue');
    /* 五百五十八批同步更新：.pf-err 红壳合并全局 err-bar（radius/border/err-soft 归 theme.css :554
       单源，557 IH .ih-qerr 先例；合并形态锚 errBarWave558b）——radius/border 断言随私造规则
       退役改锁「不回流」 */
    expect(pf, '.pf-err 私造红壳不回流（border/radius 归 err-bar 单源）').not.toMatch(/\.pf-err \{[^}]*border/);
    expect(pf, '.pf-err err-soft 底不回流').not.toMatch(/\.pf-err \{[^}]*err-soft/);
    const mm = read('../views/MatchMatrixView.vue');
    /* 五百五十八批同步更新：.mm-err 同上合并（token 行退役），只留顶对齐与落位节奏 */
    expect(mm, '.mm-err 私造红壳不回流（border/radius 归 err-bar 单源）').not.toMatch(/\.mm-err \{[^}]*border/);
    expect(mm, '.mm-err 合并形态（顶对齐+落位）在场').toMatch(/\.mm-err \{ align-items: flex-start; margin-bottom: 0; \}/);
  });
});
