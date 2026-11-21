/**
 * 533 批「智能提示/纠错接线」契约看守（工蚁 A）。
 *
 * 五件事：
 *  A 五视图 setMarkers 挂法锚——RankDebug/ScoreExplain/Aliases(filter)/ReindexAdvanced
 *    (srcQuery+body 两路)/QueryXray：lint computed/banner 已有但编辑器内零划线，补
 *    ref + watch + setMarkers（SearchSandboxView 524 批范式：debounce → info 降级 hint →
 *    jaRef.value?.setMarkers?.；banner 保留双通道）；
 *  B RankDebug 手写 sessionStorage 'esquerystudio.link.rankdebug' 三连退役换 useLinkCarry
 *    （负向断言锁字面键名不得回潮，正向锁 receive 消费链）；
 *  C RD/SE 编辑器三档高度循环（RD/SE_ED_H_TIERS + usePref('rd.edH'/'se.edH')），
 *    红线：不引入 height:100% 结构——规则体逐字锁；
 *  D AliasesView 760 野断点并档 900（全站 900/1100 双档纪律）——负向锁 760px 不回潮；
 *  E sqlCompletion 行为：连字符索引 FROM 候选（① 正则修复回归）+ JsonArea dslAssist
 *    analyzers 契约补全（MonacoEditor 同名契约此前分叉）+ quickFix 513「双逗号删一」安全子集。
 *
 * 源码锁口径（semanticTier531 同理由）：happy-dom 不参与 scoped <style>/Monaco 内核计算，
 * 划线/断点/高度档都是接线形态契约，落源文本最稳。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setActivePinia, createPinia } from 'pinia';
import { ensureSqlCompletion } from '../utils/sqlCompletion';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');
const readView = (name: string) => read(`views/${name}.vue`);

const rd = readView('RankDebugView');
const se = readView('ScoreExplainView');
const alv = readView('AliasesView');
const ra = readView('ReindexAdvancedView');
const qx = readView('QueryXrayView');

/* SearchSandboxView 524 批范式的核心一行：info 降级 hint 后喂 setMarkers（五视图逐字同款） */
const DOWNGRADE_LINE = "severity: f.severity === 'info' ? 'hint' as const : f.severity";

describe('A 五视图 setMarkers 挂法锚（banner 保留双通道）', () => {
  it('RankDebugView：rdJaRef 模板挂点 + 防抖 setMarkers（info 降级 hint）', () => {
    expect(rd).toMatch(/<JsonArea ref="rdJaRef" v-model="dsl"/);
    expect(rd).toContain('const rdJaRef');
    expect(rd).toContain('rdJaRef.value?.setMarkers?.(rdLint.value');
    expect(rd).toContain(DOWNGRADE_LINE);
    expect(rd).toContain('watch(dsl, () => { queueLintMarkers(); }, { immediate: true });');
    /* banner 提示条保留（双通道，不因划线退役） */
    expect(rd).toMatch(/rdLintErrors\.length" role="alert"/);
    expect(rd).toMatch(/rdLintWarns\.length" role="status"/);
  });

  it('ScoreExplainView：seJaRef 同款', () => {
    expect(se).toMatch(/<JsonArea ref="seJaRef" v-model="dsl"/);
    expect(se).toContain('seJaRef.value?.setMarkers?.(seLint.value');
    expect(se).toContain(DOWNGRADE_LINE);
    expect(se).toMatch(/seLintErrors\.length" role="alert"/);
  });

  it('AliasesView：filter 编辑器 filterJaRef（lintClause findings 与 setMarkers 同形）', () => {
    expect(alv).toMatch(/<JsonArea ref="filterJaRef" v-model="cFilter"/);
    expect(alv).toContain('filterJaRef.value?.setMarkers?.(filterLint.value');
    expect(alv).toContain(DOWNGRADE_LINE);
    expect(alv).toMatch(/filterLintErrors\.length" role="alert"/);
  });

  it('ReindexAdvancedView：srcQuery 与手编 body 两路各一套 ref+watch', () => {
    expect(ra).toMatch(/<JsonArea ref="raQueryJaRef" v-model="srcQueryStr"/);
    expect(ra).toMatch(/<JsonArea ref="raBodyJaRef" :model-value="rawBody"/);
    expect(ra).toContain('raQueryJaRef.value?.setMarkers?.(raQueryLint.value');
    expect(ra).toContain('raBodyJaRef.value?.setMarkers?.(raBodyLint.value');
    expect(ra).toContain('watch(srcQueryStr, () => { queueQueryLintMarkers(); }, { immediate: true });');
    expect(ra).toContain('watch(rawBody, () => { queueBodyLintMarkers(); }, { immediate: true });');
  });

  it('QueryXrayView：dsl-assist 之外补 lintDsl 一路（JSON 非法静默清 markers）', () => {
    expect(qx).toMatch(/<JsonArea ref="qxJaRef" v-model="dsl"/);
    /* 五百六十二批同步更新（击穿者：562 工蚁1——qxLint computed 单源合并，Finding 闭包类型退役，import 收敛单符号） */
    expect(qx).toContain("import { lintDsl } from '../utils/dslLint'");
    /* 五百六十二批同步更新（击穿者：562 工蚁1——qxLint computed 单源合并，setMarkers 消费 qxLint 全量，降级映射行内联） */
    expect(qx).toContain('qxJaRef.value?.setMarkers?.(qxLint.value.map(');
    expect(qx).toContain(DOWNGRADE_LINE);
    /* 五百六十二批同步更新（同上：lintDsl 求值收进 qxLint computed，return 形态+行内条全量兜底） */
    expect(qx).toContain('return lintDsl(JSON.parse(dsl.value || \'\'), { fields: assistFields.value });');
  });
});

describe('B RankDebug useLinkCarry 合并（手写 sessionStorage 三连退役）', () => {
  it('负向：字面键名 esquerystudio.link.rankdebug 不得回潮（统一件内拼前缀）', () => {
    expect(rd).not.toContain('esquerystudio.link.rankdebug');
  });
  it('正向：useLinkCarry(\'rankdebug\') + receive 先焚再解消费链在場', () => {
    expect(rd).toContain("rankDebugCarry = useLinkCarry<{ index?: string; id?: string; query?: string }>('rankdebug')");
    expect(rd).toContain('const p = rankDebugCarry.receive();');
    expect(rd).toContain('if (!p) return;');
    /* 解析分支原样保留：index 回填 / query 草稿回灌 / id 开审三支 */
    expect(rd).toContain('if (p.index) index.value = p.index;');
    expect(rd).toContain('if (p.query) {');
    expect(rd).toContain('if (p.id) {');
  });
});

describe('C RD/SE 编辑器三档高度循环（红线：不引入 height:100% 结构）', () => {
  it('RD_ED_H_TIERS 三档 + useTierCycle(\'rd.edH\') 合并 + 「高」钮；.rd-card-ed 规则体无 height', () => {
    expect(rd).toContain("RD_ED_H_TIERS = ['max(260px, 42vh)', 'max(340px, 56vh)', 'max(440px, 72vh)']");
    /* 五百五十八批同步更新（击穿者：558 工蚁G——三件套合并 useTierCycle 单源）：键声明字面改接线锚 */
    expect(rd).toContain("useTierCycle('rd.edH', RD_ED_H_TIERS)");
    expect(rd).toContain('data-test="rd-ed-h"');
    /* 规则体逐字锁：高度走模板 :style 内联，CSS 只留布局骨架（height:100% 红线） */
    expect(rd).toMatch(/\.rd-card-ed \{ display: flex; flex-direction: column; flex: none; \}/);
  });

  it('SE_ED_H_TIERS 起档 max(300px, 42vh) + useTierCycle(\'se.edH\') 合并；.se-card 规则体无 height', () => {
    expect(se).toContain("SE_ED_H_TIERS = ['max(300px, 42vh)', 'max(390px, 56vh)', 'max(500px, 72vh)']");
    expect(se).toContain("useTierCycle('se.edH', SE_ED_H_TIERS)");
    expect(se).toContain('data-test="se-ed-h"');
    /* 五百五十四批同步更新（击穿者：554 工蚁D⑧——se-card 编辑器外框退役）：框壳字面改退役形，
       布局骨架（flex 纵向/flex:none/overflow）与「规则体无 height」锁意图零触 */
    expect(se).toMatch(/\.se-card \{ border: 0; border-radius: 0; overflow: hidden; display: flex; flex-direction: column; flex: none; \}/);
  });
});

describe('D AliasesView 760 野断点并档（全站 900/1100 双档纪律）', () => {
  it('负向：760px 断点删除不回潮', () => {
    expect(alv).not.toMatch(/max-width:\s*760px/);
  });
  it('正向：折行后复选框独占整行规则并入 900 档', () => {
    expect(alv).toMatch(/@media \(max-width: 900px\) \{\s*\.alv-form > \.alv-chk \{ flex: 1 0 100%; \}\s*\}/);
  });
});

describe('E sqlCompletion / JsonArea / quickFix 契约', () => {
  it('JsonArea dslAssist 契约补 analyzers 可选字段（与 MonacoEditor 同名契约对齐）', () => {
    const ja = read('components/JsonArea.vue');
    expect(ja).toContain('analyzers?: () => string[]');
  });

  it('quickFix 513（PropertyExpected）只出「双逗号删一」安全子集 action', () => {
    const qf = read('utils/monacoJsonQuickFix.ts');
    expect(qf).toContain("code === '513' || /property expected/i.test(m.message)");
    expect(qf).toContain("'双逗号删一'");
    /* 安全子集证据闸：行内无字面 ',,' 不出 action */
    expect(qf).toMatch(/indexOf\(',,'\)/);
  });

  it('行为：连字符索引 FROM 位可候选（① 正则修复回归，直接 import 驱动 provider）', () => {
    setActivePinia(createPinia());
    /* monaco 最小 fake（sqlCompletionW2 同款）；本用例只走 ① FROM 分支，不触 api */
    const providers: any[] = [];
    const api = {
      languages: {
        registerCompletionItemProvider: (_l: string, p: any) => { providers.push(p); return { dispose: () => {} }; },
        CompletionItemKind: { Field: 'Field', Property: 'Property', Value: 'Value' },
      },
    };
    const h = ensureSqlCompletion(api as any, () => ({
      indices: () => [{ index: 'logs-2026.01' }, { index: 'orders' }],
      pickedIdx: () => 'orders',
      curFields: () => [],
      ensureCurFields: () => {},
    }));
    const before = 'SELECT * FROM logs-';
    const r = providers[0]!.provideCompletionItems(
      { getValue: () => before, getOffsetAt: () => before.length, getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1, word: '' }) },
      { lineNumber: 1 },
    );
    expect(r.suggestions.map((s: any) => s.label)).toEqual(['logs-2026.01']);
    h.dispose();
  });
});

beforeEach(() => { setActivePinia(createPinia()); });
