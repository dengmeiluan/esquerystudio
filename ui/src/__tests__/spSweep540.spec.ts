/* 五百四十批 W5(轨5 自适应):views 侧 --sp 精确等值收口防回潮——§6y 备案
 * 「--sp views 余 10 处+刮余零星」的域内残量(11 文件 13 处)全部改用 var(--sp-N),
 * 本 spec 反向锁:收口文件集内 spacing 声明(padding/margin/gap 系)的档位值裸 px
 * 计数恒 0(2/4/6/8/10/12/16/24/32,档表口径 theme.css:102-103,同 spSweep538 先例)。
 *
 * 豁免备案(全保字面,违者即事故——逐处等值核实后不入收口):
 *  ① 契约整行锁(既有 spec 逐字锁行,动即红,永不合并):
 *     - AdhocRebuildView .tbl th「padding: 5px 8px」整行(w10ReduceSteps525 锁 th 600 基线同步更新字面);
 *     - AdhocRebuildView .ar-input-tabs「gap: 2px; padding: 2px」整行(rebuildFlat534 锁 seg 档
 *       「bg2+2px 内衬」;rebuildMigrate531 另锁其结构序)。同文件 .tbl td 无锁,照收 var(--sp-2)。
 *  ② 空态留白全站契约 34px(theme.css .empty 明令,同 538 头注③):SearchTemplatesView
 *     .st-list-empty 与 NotFoundView .nf-card「34px 16px」整条保字面。
 *     (五百四十七批锁同步更新:IndexSettingsView .is-empty「34px var(--sp-4)」条目随失败态整卡
 *     退役删除——EmptyState centered 直贴,留白归组件单源,原三处在场改两处,断言同步更新)
 *  ③ 538 头注⑤先例:MatchMatrixView .mm-busy 的 gap/padding 混合刻值行
 *     (gap: 6px,padding: 14px 16px)整行保字面,其 900 档归 responsive900Sweep529 管辖。
 *     (五百五十二批同步更新:.mm-err 混合刻值行随「err 条数值档统一」落 var(--sp-*) 档,
 *     豁免条目退役——err 条语义红框保留只统一数值档,原保字面豁免随之失效)
 *  ④ 刻意值/微型内衬:1px(内衬/随边框语义)、3/5/7/9/14 奇数与步进微调、负 margin
 *     (AdhocRebuildView .ar-dest-err「-4px 0 var(--sp-2)」、TasksView .tv-tree
 *     「var(--sp-1) -6px -6px」树挂负档)——全保字面。
 *  ⑤ 非档位整数(18/20/22/30 等:LuceneQuery ul 缩进 18px、SqlConsole 列表缩进 20px、
 *     NotFound 18/22px 节奏)与 layout 形状系(width/height/top/left/bottom/flex-basis)
 *     本就不在收口三属性(padding·margin·gap)内。
 *  ⑥ 模板内联 style(SnapshotsView 骨架态 padding:14px、TaskTreeView gap:10px、
 *     IlmView margin-left:14px、BrowserView padding-left:30px、SecurityView margin-bottom:9px)
 *     为结构位,红线禁动,不在本 spec 断言面。
 *  ⑦ pillSingleTrack 头注明载 gap 不入其 FORBIDDEN 名单(「as-badge/pt-badge 的 2px/4px
 *     是内嵌小图标真实差异,有意保留」)—— AnalysisSettingsView .as-badge gap:2px 收
 *     var(--sp-0) 后计算值仍 2px,视觉差异原样,与其备案不冲突(其断言面仅
 *     font-size/border-radius/background/font-weight/padding)。
 *
 * responsive900Sweep529 入册复核: 11 文件中 10 个已在 VIEWS_529/531/533/534 在册
 * (纯等值替换零结构动,900 档断言不受影响,无需扩表);ReindexAdvancedView 维持该 spec
 * 头注既有(单行 900 档与 block900Of 提取正则不兼容,非 900 档缺失,不动)。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 收口文件(11):逐文件收口后反锁档位 px 计数恒 0 */
const FILES = [
  'views/ConfigDriftView.vue',
  'views/ConfigValidatorView.vue',
  'views/AnalysisSettingsView.vue',
  'views/AnalyzerLabView.vue',
  'views/LifecycleView.vue',
  'views/AdhocRebuildView.vue',
  'views/MappingDesignerView.vue',
  'views/PitScrollView.vue',
  'views/ScoreExplainView.vue',
  'views/SnapshotsView.vue',
  'views/ReindexAdvancedView.vue',
] as const;

/* 契约整行锁豁免(头注①):行内含这些 selector 字面即整行保字面 */
const CONTRACT_LINE = [/\.tbl th \{/, /\.ar-input-tabs \{/];

const srcOf = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');
/* 口径同 spSweep538:padding/margin/gap(含子属性)声明值里的裸档位 px(前面不是字母/数字/
   点/负号——排除 -6px 负值豁免与 132px 之类长数字截断误命中) */
const TIER_PX = /(?:^|[^-\w.,])(2|4|6|8|10|12|16|24|32)px/;
const SPACING_DECL = /(?:padding|margin|gap|row-gap|column-gap)[a-z-]*\s*:\s*([^;}]+)/g;

describe('五百四十批 W5:views 侧 --sp 精确等值收口防回潮(档位 px → var(--sp-N))', () => {
  it('收口文件集内 spacing 声明的档位值裸 px 计数恒 0(2/4/6/8/10/12/16/24/32)', () => {
    const hits: string[] = [];
    for (const rel of FILES) {
      const lines = srcOf(rel).split('\n');
      let inStyle = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/<style/.test(line)) { inStyle = true; continue; }
        if (/<\/style>/.test(line)) { inStyle = false; continue; }
        if (!inStyle) continue;
        /* 注释行(备案)与契约整行锁(头注①)不查 */
        const t = line.trim();
        if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('//') || t.startsWith('<!--')) continue;
        if (CONTRACT_LINE.some(re => re.test(line))) continue;
        for (const m of line.matchAll(SPACING_DECL)) {
          /* 空态 34px 契约值与 calc() 组合链整条豁免(同 538 头注②④口径) */
          if (m[1].includes('34px') || m[1].includes('calc(')) continue;
          const hit = m[1].match(TIER_PX);
          if (hit) hits.push(`${rel}:${i + 1} ${line.trim()}`);
        }
      }
    }
    expect(hits, `档位值裸 px 应换 var(--sp-N)或备案豁免:\n${hits.join('\n')}`).toEqual([]);
  });

  it('豁免备案抽查:契约行与刻意值仍在场(防顺手过度合并)', () => {
    /* 头注①:两契约整行锁——五百五十四批 P2 收口同步更新改锚（档位值 2px/8px 归 var(--sp-0)/var(--sp-2)，
       5px 奇数刻意值保字面） */
    expect(srcOf('views/AdhocRebuildView.vue')).toMatch(/\.tbl th \{ text-align: left; padding: 5px var\(--sp-2\);/);
    expect(srcOf('views/AdhocRebuildView.vue')).toMatch(/\.ar-input-tabs \{ display: inline-flex; gap: var\(--sp-0\); padding: var\(--sp-0\);/);
    /* 头注②:空态 34px 契约(五百四十七批锁同步更新:IndexSettingsView .is-empty 条目
       随失败态整卡退役删除,EmptyState centered 承接留白)。
       五百五十四批同步更新:16px 收 --sp-4(34px 契约值保字面),锚改新形态。
       五百六十一批同步更新:SearchTemplatesView st-list 空态死码行随规则立删(EmptyState compact
       承接留白),改负锁防回流;34px 契约由 NotFoundView .nf-card 行继续反锁 */
    expect(srcOf('views/SearchTemplatesView.vue')).not.toMatch(/\.st-list-empty/);
    expect(srcOf('views/NotFoundView.vue')).toMatch(/padding:\s*34px var\(--sp-4\)/);
    /* 头注③:MatchMatrix 混合刻值行保字面(538 头注⑤先例)。
       五百五十二批同步更新:.mm-err 混合刻值豁免退役(err 条数值档统一落 token 档),
       改锁新形态防半收回流;.mm-busy 混合行仍在册(544/551 双保险)。
       五百五十八批同步更新:.mm-err 红壳合并全局 err-bar(view 侧 gap/padding 随私造规则退役,
       --sp 收口标的自然清零;合并形态锚 errBarWave558b/adaptiveFullstack550) */
    expect(srcOf('views/MatchMatrixView.vue')).not.toMatch(/\.mm-err \{[^}]*padding/);
    /* 头注④:负 margin 刻意值保字面 */
    expect(srcOf('views/AdhocRebuildView.vue')).toMatch(/margin:\s*-4px 0 var\(--sp-2\)/);
    expect(srcOf('views/TasksView.vue')).toMatch(/margin:\s*var\(--sp-1\) -6px -6px/);
    /* 非档位整数/奇数微调抽样:18px 缩进与 5px/7px 间隙永不合并 */
    expect(srcOf('views/LuceneQueryView.vue')).toMatch(/padding-left:\s*18px/);
    expect(srcOf('views/AliasesView.vue')).toMatch(/gap:\s*5px/);
    expect(srcOf('views/ConfigDriftView.vue')).toMatch(/padding:\s*1px 7px/);
  });
});
