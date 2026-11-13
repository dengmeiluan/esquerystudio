/**
 * 五百三十批 W-C「编辑框与嵌套批」（静态源断言——涉 Monaco 组件一律不挂载，happy-dom 必炸）：
 * ① 编辑框高度三档循环可调：Aliases filter（aliases.filterH）/ Lifecycle rollover（lifecycle.roH）/
 *    ReindexAdvanced query（ra.queryH）照 ra.scriptH 既有形态（usePref + TIERS 循环），
 *    走 JsonArea 既有 rows 行数写法（默认档 3/4/4 行不变——rebuildThreeState 黑名单锁 92px stub 与
 *    rawBody fill '100%' 唯一性，故不用 fill 容器档）；MatchMatrix 编辑卡走 qx.taH 范式
 *    （CSS resize + pointerup 实高落盘 usePref('mm.taH')）；
 * ② DevTools curl 粘贴稿草稿化：独立键 es_devtools_curl_draft（形态对齐主 DRAFT_KEY 的 :target 合并键）；
 * ③ lint 消费：Aliases cFilter 换 lintClause（裸子句零误报）；Lifecycle rollover 条件挂 lintClause 零 ctx；
 * ④ 嵌套框冗余清：IndexSettings 三张 ir-card 降单卡三分节（sec-t + 上边框）；
 *    ReindexPreview .rp-adv 空壳 div 退役 margin 归钮；DevTools .dt-body-area 死 CSS 删。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const aliases = read('../views/AliasesView.vue');
const lifecycle = read('../views/LifecycleView.vue');
const reindexAdv = read('../views/ReindexAdvancedView.vue');
const matchMatrix = read('../views/MatchMatrixView.vue');
const devtools = read('../views/DevToolsView.vue');
const indexSettings = read('../views/IndexSettingsView.vue');
const reindexPreview = read('../views/ReindexPreviewView.vue');

describe('五百三十批①：编辑框高度三档循环（ra.scriptH 形态）', () => {
  it('AliasesView：useTierCycle(aliases.filterH) 合并接线 + TIERS 档值（558 击穿同步更新：三件套合并单源）', () => {
    /* 五百五十八批同步更新（击穿者：558 工蚁G——TIERS+usePref+手写 cycle 三件套合并
       composables/useTierCycle 单源，adhoc.edH 554 同件）：usePref 键声明与手写循环
       退役，字面改合并接线锚（pref key/档值/消费点 rows 绑定零迁） */
    expect(aliases).toContain("useTierCycle('aliases.filterH', FILTER_H_TIERS)");
    expect(aliases).toContain('FILTER_H_TIERS');
    expect(aliases).toMatch(/const \{ v: filterH, cycle: cycleFilterH \} = useTierCycle\(/);
  });

  it('AliasesView：filter JsonArea 走 rows 行数档（默认 3 行不变）、循环钮 data-test=alv-filter-h', () => {
    expect(aliases).toMatch(/v-model="cFilter" :rows="filterH" :dsl-assist="filterAssist"/);
    expect(aliases).toMatch(/const FILTER_H_TIERS = \[3, 9, 16\];/);
    expect(aliases).toContain('data-test="alv-filter-h"');
  });

  it('LifecycleView：useTierCycle(lifecycle.roH) 合并接线 + TIERS 档值（558 击穿同步更新）', () => {
    /* 五百五十八批同步更新（击穿者：558 工蚁G，aliases.filterH 同刀）：字面改合并接线锚 */
    expect(lifecycle).toContain("useTierCycle('lifecycle.roH', RO_H_TIERS)");
    expect(lifecycle).toContain('RO_H_TIERS');
    expect(lifecycle).toMatch(/const \{ v: roH, cycle: cycleRoH \} = useTierCycle\(/);
  });

  it('LifecycleView：rollover JsonArea 走 rows 行数档（默认 4 行不变）、循环钮 data-test=lc-ro-h', () => {
    expect(lifecycle.split('\n').some(l => l.includes('v-model="rolloverCond"') && l.includes(':rows="roH"'))).toBe(true);
    expect(lifecycle).toMatch(/const RO_H_TIERS = \[4, 10, 18\];/);
    expect(lifecycle).toContain('data-test="lc-ro-h"');
  });

  it('ReindexAdvancedView：ra.queryH + 既有 ra.scriptH 合并 useTierCycle（558 击穿同步更新）', () => {
    /* 五百五十八批同步更新（击穿者：558 工蚁G，aliases.filterH 同刀）：两处 usePref 键声明
       与手写循环退役，字面改合并接线锚（script/query 两档键与档值零迁） */
    expect(reindexAdv).toContain("useTierCycle('ra.queryH', QUERY_H_TIERS)");
    expect(reindexAdv).toContain('QUERY_H_TIERS');
    expect(reindexAdv).toMatch(/const \{ v: queryH, cycle: cycleQueryH \} = useTierCycle\(/);
    expect(reindexAdv).toContain("useTierCycle('ra.scriptH', SCRIPT_H_TIERS)");
    expect(reindexAdv).toMatch(/const \{ v: scriptH, cycle: cycleScriptH \} = useTierCycle\(/);
    expect(reindexAdv).toContain('data-test="ra-query-h"');
  });

  it('ReindexAdvancedView：query JsonArea rows 行数档默认 4 行（92px stub 锁不破，script 面零改动）', () => {
    expect(reindexAdv).toMatch(/v-model="srcQueryStr" :rows="queryH" :dsl-assist="raQueryAssist"/);
    expect(reindexAdv).toMatch(/const QUERY_H_TIERS = \[4, 10, 18\];/);
    expect(reindexAdv).toMatch(/:height="scriptH"/);
  });

  it('MatchMatrixView：usePref(mm.taH) 声明 + saveTaH pointerup 实高落盘（qx.taH 范式）', () => {
    expect(matchMatrix).toContain("usePref<string>('mm.taH'");
    expect(matchMatrix).toMatch(/function saveTaH\(e: PointerEvent\)/);
    expect(matchMatrix).toContain('getBoundingClientRect().height');
    expect(matchMatrix).toContain('@pointerup="saveTaH"');
    expect(matchMatrix).toMatch(/class="mm-card" :style="\{ height: taH \}"/);
  });

  it('MatchMatrixView：编辑卡 flex:none + resize:vertical（拖拽把手），200px 下限保留', () => {
    expect(matchMatrix).toMatch(/\.mm-card \{[^}]*flex: none;/);
    expect(matchMatrix).toMatch(/\.mm-card \{[^}]*resize: vertical;/);
    expect(matchMatrix).toMatch(/\.mm-card \{[^}]*min-height: 200px;/);
  });
});

describe('五百三十批②：DevTools curl 粘贴稿草稿化', () => {
  it('独立键 es_devtools_curl_draft 带集群 :target 合并键（对齐主 DRAFT_KEY 形态）', () => {
    expect(devtools).toContain("CURL_DRAFT_KEY = computed(() => `es_devtools_curl_draft:${store.target || 'host'}`)");
    expect(devtools).toContain("DRAFT_KEY = computed(() => `es_devtools_draft:${store.target || 'host'}`)");
  });

  it('打开弹窗不再清 curlText（草稿不被打开动作拍掉）', () => {
    expect(devtools).not.toContain("curlOpen = true; curlText = ''");
    expect(devtools).toContain('@click="curlOpen = true; curlErr = \'\'"');
  });

  it('粘贴稿写入走 redactDraft 凭据掩埋，导入成功清稿', () => {
    expect(devtools).toContain("import { redactDraft } from '../composables/useScopedDraft'");
    expect(devtools).toMatch(/writeStoredRaw\(sessionStorage, CURL_DRAFT_KEY\.value, redactDraft\(v\)\)/);
    expect(devtools).toMatch(/curlText\.value = '';[^\n]*导入成功清粘贴稿/);
  });

  it('死 CSS 清：.dt-body-area 段删除；.dt-tab-ren 保留（双击重命名模板在用，非残留）', () => {
    expect(devtools).not.toMatch(/\.dt-body-area \{/);
    expect(devtools).toContain('.dt-tab-ren {');
    expect(devtools).toContain('class="dt-tab-ren mono"');
  });
});

describe('五百三十批③：lintClause 消费', () => {
  it('AliasesView：cFilter lint 换 lintClause（裸子句出口），提示条形态保持', () => {
    expect(aliases).toContain("import { lintClause } from '../utils/dslLint'");
    expect(aliases).toMatch(/return lintClause\(JSON\.parse\(cFilter\.value \|\| ''\)\)/);
    expect(aliases).not.toMatch(/lintDsl\(JSON\.parse\(cFilter/);
    /* 五百六十一批同步更新：alv-lint 族改用 theme.css .lint-bar 单源 */
    expect(aliases).toContain('class="lint-bar lint-bar-err"');
    expect(aliases).toContain('class="lint-bar lint-bar-warn"');
  });

  it('LifecycleView：rolloverCond 挂 lintClause 零 ctx（fields 传 []），提示条三态类在场', () => {
    expect(lifecycle).toContain("import { lintClause } from '../utils/dslLint'");
    expect(lifecycle).toMatch(/lintClause\(JSON\.parse\(rolloverCond\.value \|\| ''\), \{ fields: \[\] \}\)/);
    expect(lifecycle).not.toMatch(/lintDsl\(JSON\.parse\(rolloverCond/);
    expect(lifecycle).toContain('class="lc-lint lc-lint-err"');
    expect(lifecycle).toContain('class="lc-lint lc-lint-warn"');
  });
});

describe('五百三十批④：嵌套框冗余清', () => {
  it('IndexSettingsView：ir-card 卡壳三降一（单卡三分节），三节文案语义全保留', () => {
    /* 五百五十四批同步更新：残壳 .card 摘除（552 is-form 同页收尾），ir-card 类名保留作分节锚 */
    expect((indexSettings.match(/class="ir-card"/g) || []).length).toBe(1);
    expect(indexSettings).not.toMatch(/class="card ir-card"/);
    expect(indexSettings).toContain('<Activity :size="13" /> 变更总览');
    expect(indexSettings).toContain('<Hammer :size="13" /> 就地重建预估');
    expect(indexSettings).toContain('<AlertTriangle :size="13" /> 非法项阻断');
    expect(indexSettings).not.toMatch(/class="card-t"[^>]*><Activity/);
  });

  it('IndexSettingsView：分节标题走全局 sec-t 档，分节间上边框分隔（ir-sec + ir-sec）', () => {
    expect((indexSettings.match(/class="sec-t ir-sec-t"/g) || []).length).toBe(3);
    expect(indexSettings).toMatch(/\.ir-sec \+ \.ir-sec \{[^}]*border-top: 1px solid/);
    expect(indexSettings).not.toMatch(/\.ir-card \.card-t \{/);
  });

  it('IndexSettingsView：非法项分节保留 err 语义（标题红字 + 分隔线 err 档）', () => {
    expect(indexSettings).toMatch(/class="sec-t ir-sec-t" style="color:var\(--err\)"/);
    expect(indexSettings).toMatch(/\.ir-sec\.ir-block \{ border-top-color: var\(--err-line\); \}/);
  });

  it('ReindexPreviewView：.rp-adv 空壳 div 退役，类直接挂钮且 margin 归钮', () => {
    expect(reindexPreview).not.toContain('<div class="rp-adv">');
    expect(reindexPreview).toContain('class="btn sm ghost rp-adv"');
    expect(reindexPreview).toMatch(/\.rp-adv \{ display: block; margin-left: auto;/);
    expect(reindexPreview).not.toMatch(/\.rp-adv \{[^}]*justify-content: flex-end/);
    expect(reindexPreview).toContain('@click="goAdvanced"');
  });
});
