/**
 * 五百五十八批 G（轨4 editorTiers 合并 + 壳退役，静态源断言）：
 * ① 10 视图 15 个 pref 键的「TIERS 常量 + usePref + 手写 cycle 函数」三件套合并
 *    composables/useTierCycle 单源（554 批 adhoc.edH、552 批 xm.cfgRows 先例同件）——
 *    pref key 字面不变 = 用户已存档位零迁移；消费点（编辑框高度/宽度/行数绑定）
 *    按返回结构等值改写；原三件退役（usePref 键声明与手写 cycle 函数不在场）。
 * ② defVal 显式传参锚：默认档非首位的键（sql 三处 300/500/300、painless 两处 260、
 *    al.toksH 240；al.fieldsH 280 虽=首位亦按批次约定显式传）——缺省会漂到 tiers[0]
 *    破坏「默认档=原写死值」口径。
 * ③ AliasesView alv-panel 全站最后一个全局 .card 壳退役（约定④：border+底色+radius
 *    整块消除）→ border-top 分节承接（554 批 ar-sec 同刀），品牌弱化线语义保形转
 *    border-top-color=var(--ac-line)；AnalyzerLabView .al-lane 容器壳同刀退役
 *    （546 批豁免先例合并），消费面（token 胶囊区）零语义变动。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const rest = read('../views/RestView.vue');
const sys = read('../views/SystemView.vue');
const rankDebug = read('../views/RankDebugView.vue');
const scoreExplain = read('../views/ScoreExplainView.vue');
const reindexAdv = read('../views/ReindexAdvancedView.vue');
const aliases = read('../views/AliasesView.vue');
const lifecycle = read('../views/LifecycleView.vue');
const sqlConsole = read('../views/SqlConsoleView.vue');
const painless = read('../views/PainlessLabView.vue');
const analyzerLab = read('../views/AnalyzerLabView.vue');

/* 合并断言两件套：useTierCycle 接线在场（pref key 字面不变）+ 原私造三件退役 */
const adopted = (src: string, key: string, tail: string) => {
  expect(src).toContain(`useTierCycle('${key}'${tail})`);
  expect(src, `${key} 原 usePref 键声明退役`).not.toMatch(new RegExp(`usePref(?:<[^>]+>)?\\('${key.replace('.', '\\.')}'`));
};
const cycleFnRetired = (src: string, fn: string) => {
  expect(src, `${fn} 手写循环函数退役`).not.toMatch(new RegExp(`function ${fn}\\(`));
};

describe('五百五十八批①：editorTiers 三件套合并 useTierCycle 单源（10 视图 15 键）', () => {
  it('RestView：useTierCycle(rest.edH) 接线，原三件退役', () => {
    expect(rest).toContain("import { useTierCycle } from '../composables/useTierCycle'");
    adopted(rest, 'rest.edH', ', REST_ED_H_TIERS');
    cycleFnRetired(rest, 'cycleRestEdH');
    expect(rest).toMatch(/const \{ v: restEdH, cycle: cycleRestEdH \} = useTierCycle\('rest\.edH', REST_ED_H_TIERS\)/);
  });

  it('SystemView：useTierCycle(sys.edH) 接线，原三件退役', () => {
    adopted(sys, 'sys.edH', ', SYS_ED_H_TIERS');
    cycleFnRetired(sys, 'cycleSysEdH');
  });

  it('RankDebugView：useTierCycle(rd.edH) 接线，原三件退役', () => {
    adopted(rankDebug, 'rd.edH', ', RD_ED_H_TIERS');
    cycleFnRetired(rankDebug, 'cycleEdH');
  });

  it('ScoreExplainView：useTierCycle(se.edH) 接线，原三件退役', () => {
    adopted(scoreExplain, 'se.edH', ', SE_ED_H_TIERS');
    cycleFnRetired(scoreExplain, 'cycleEdH');
  });

  it('ReindexAdvancedView：ra.scriptH + ra.queryH 两处合并，原三件退役', () => {
    adopted(reindexAdv, 'ra.scriptH', ', SCRIPT_H_TIERS');
    adopted(reindexAdv, 'ra.queryH', ', QUERY_H_TIERS');
    cycleFnRetired(reindexAdv, 'cycleScriptH');
    cycleFnRetired(reindexAdv, 'cycleQueryH');
  });

  it('AliasesView：useTierCycle(aliases.filterH) 接线，原三件退役', () => {
    adopted(aliases, 'aliases.filterH', ', FILTER_H_TIERS');
    cycleFnRetired(aliases, 'cycleFilterH');
  });

  it('LifecycleView：useTierCycle(lifecycle.roH) 接线，原三件退役', () => {
    adopted(lifecycle, 'lifecycle.roH', ', RO_H_TIERS');
    cycleFnRetired(lifecycle, 'cycleRoH');
  });

  it('SqlConsoleView：sql.railW / sql.resultH / sql.codeH 三处合并，原三件退役', () => {
    adopted(sqlConsole, 'sql.railW', ', RAIL_W_TIERS, 300');
    adopted(sqlConsole, 'sql.resultH', ", RESULT_H_TIERS, 'fill'");
    adopted(sqlConsole, 'sql.codeH', ', CODE_H_TIERS, 300');
    cycleFnRetired(sqlConsole, 'cycleRailW');
    cycleFnRetired(sqlConsole, 'cycleResultH');
    cycleFnRetired(sqlConsole, 'cycleCodeH');
  });

  it('PainlessLabView：painless.outH + painless.railW 两处合并，原三件退役', () => {
    adopted(painless, 'painless.outH', ', OUT_H_TIERS, 260');
    adopted(painless, 'painless.railW', ', RAIL_W_TIERS, 260');
    cycleFnRetired(painless, 'cycleOutH');
    cycleFnRetired(painless, 'cycleRailW');
  });

  it('AnalyzerLabView：al.toksH + al.fieldsH 两处合并，原三件退役', () => {
    adopted(analyzerLab, 'al.toksH', ', TOKS_H_TIERS, 240');
    adopted(analyzerLab, 'al.fieldsH', ', FIELDS_H_TIERS, 280');
    cycleFnRetired(analyzerLab, 'cycleToksH');
    cycleFnRetired(analyzerLab, 'cycleFieldsH');
  });

  it('档值数组字面零迁（合并只换接线，档位口径原样）', () => {
    expect(rest).toContain("const REST_ED_H_TIERS = ['100%', 'max(180px, 56vh)', 'max(180px, 72vh)'];");
    expect(sys).toContain("const SYS_ED_H_TIERS = ['max(150px, 28vh)', 'max(150px, 42vh)', 'max(150px, 56vh)'];");
    expect(rankDebug).toContain("const RD_ED_H_TIERS = ['max(260px, 42vh)', 'max(340px, 56vh)', 'max(440px, 72vh)'];");
    expect(scoreExplain).toContain("const SE_ED_H_TIERS = ['max(300px, 42vh)', 'max(390px, 56vh)', 'max(500px, 72vh)'];");
    expect(reindexAdv).toContain("const SCRIPT_H_TIERS = ['max(110px, 42vh)', 'max(150px, 56vh)', 'max(220px, 72vh)'];");
    expect(reindexAdv).toContain('const QUERY_H_TIERS = [4, 10, 18];');
    expect(aliases).toContain('const FILTER_H_TIERS = [3, 9, 16];');
    expect(lifecycle).toContain('const RO_H_TIERS = [4, 10, 18];');
    expect(sqlConsole).toContain('const RAIL_W_TIERS = [240, 300, 360];');
    /* 1354：结果表默认档改「填满剩余空间」（用户反馈：默认 500px 屏幕越大浪费越多，
       实测 2560×1440 表下方空 589px）。档位表加 'fill' 首项；300 档退役（从未被选中过，
       填满已覆盖小窗口），500/800 两个手选档保留。判据意图不变：档值仍集中在一个字面数组。 */
    expect(sqlConsole).toContain("const RESULT_H_TIERS = ['fill', 500, 800] as const;");
    expect(sqlConsole).toContain('const CODE_H_TIERS = [200, 300, 500];');
    expect(painless).toContain('const OUT_H_TIERS = [180, 260, 400];');
    expect(painless).toContain('const RAIL_W_TIERS = [200, 260, 320];');
    expect(analyzerLab).toContain('const TOKS_H_TIERS = [160, 240, 360];');
    expect(analyzerLab).toContain('const FIELDS_H_TIERS = [280, 420, 600];');
  });
});

describe('五百五十八批②：defVal 非首位显式传参（防默认档漂移到 tiers[0]）', () => {
  it('七处显式传参锚：sql 三处 300/500/300、painless 两处 260、al 两处 240/280', () => {
    expect(sqlConsole).toMatch(/useTierCycle\('sql\.railW', RAIL_W_TIERS, 300\)/);
    /* 1354：默认档改 fill（首项也不再是唯一可选——必须显式传，防漂移的意图保留） */
    expect(sqlConsole).toMatch(/useTierCycle\('sql\.resultH', RESULT_H_TIERS, 'fill'\)/);
    expect(sqlConsole).toMatch(/useTierCycle\('sql\.codeH', CODE_H_TIERS, 300\)/);
    expect(painless).toMatch(/useTierCycle\('painless\.outH', OUT_H_TIERS, 260\)/);
    expect(painless).toMatch(/useTierCycle\('painless\.railW', RAIL_W_TIERS, 260\)/);
    expect(analyzerLab).toMatch(/useTierCycle\('al\.toksH', TOKS_H_TIERS, 240\)/);
    expect(analyzerLab).toMatch(/useTierCycle\('al\.fieldsH', FIELDS_H_TIERS, 280\)/);
  });
});

describe('五百五十八批③：alv-panel 全站最后一个全局 .card 壳退役 + al-lane 容器壳退役', () => {
  it('AliasesView：alv-panel 无 .card 壳（class 摘除），border-top 分节承接在场（ac-line 品牌弱化线保形）', () => {
    expect(aliases, '全局 .card 壳消费退役').not.toMatch(/class="card alv-panel"/);
    expect(aliases, 'alv-panel 类名保留（分节锚）').toMatch(/class="alv-panel"/);
    expect(aliases, 'border-top 分节承接（554 ar-sec 同刀）')
      .toMatch(/\.alv-panel \{ border-top: 1px solid var\(--ac-line\); padding: var\(--sp-3\) 14px; \}/);
    expect(aliases, '旧四边 border-color 覆写随壳退役').not.toMatch(/\.alv-panel \{[^}]*border-color/);
    expect(aliases, 'card-t 行首横排保留').toMatch(/\.alv-panel \.card-t \{ display: flex; align-items: center/);
    expect(aliases, 'card-t 类消费保留').toContain('<div class="card-t">');
  });

  it('AnalyzerLabView：.al-lane 容器壳（border+card-bg+radius）退役 → border-top 分节承接', () => {
    expect(analyzerLab, 'border-top 分节承接在场')
      .toMatch(/\.al-lane \{ border-top: 1px solid var\(--border\); overflow: hidden; display: flex; flex-direction: column; \}/);
    expect(analyzerLab, '壳底色退役').not.toMatch(/\.al-lane \{[^}]*background/);
    expect(analyzerLab, '壳圆角退役').not.toMatch(/\.al-lane \{[^}]*border-radius/);
    expect(analyzerLab, '壳四边框退役').not.toMatch(/\.al-lane \{[^}]*border: 1px solid/);
    /* 消费面零语义变动：token 胶囊区/表单/结果分节类原样 */
    expect(analyzerLab).toContain('class="al-lane"');
    expect(analyzerLab).toContain('class="al-lane-hd"');
    expect(analyzerLab).toMatch(/\.al-lane-toks|\.al-toks \{/);
  });
});
