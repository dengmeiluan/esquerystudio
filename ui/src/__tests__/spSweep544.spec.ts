/* 五百四十三批 W5(轨5):538 收 305 处 + 540 收 13 处后的残量精确等值收口防回潮——§6z 备案
 * 全域穷举(gap/padding/margin 系声明 × 档位值 2/4/6/8/10,theme.css:102-103 档表:
 * --sp-0:2/--sp-1:4/--sp-1h:6/--sp-2:8/--sp-2h:10)后,非禁区 views 侧真实残量
 * 4 文件 4 处,全部改用 var(--sp-N);本 spec 反向锁收口集内档位裸 px 计数恒 0
 * (同 spSweep540 先例,但口径收窄为五小档——12/16/24/32 布局语义大间距不收)。
 *
 * 豁免备案(全保字面,违者即事故):
 *  ① 538 头注⑤/540 头注③先例:MatchMatrixView .mm-busy 的 gap/padding 混合刻值行
 *     (gap: 6px + padding: 14px 16px 刻意值)整行保字面——半档位混合行不收,不造半收行。
 *     (五百五十二批同步更新:.mm-err 混合刻值行随「err 条数值档统一」落 var(--sp-*) 档,
 *     豁免条目退役,改新形态锚;原「.mm-err 行已被 spSweep540 逐字锁」双保险随之失效)
 *  ② 微型内衬:WatcherView .wt-act「padding: 1px 6px」——1px 随边框/内衬语义刻意值
 *     (538 头注①先例),整行保字面不造半收行。
 *  ③ 注释内历史备案文字(TopologyView:420/DiagView:615-659「原内联 gap:6px 收 scoped」等)
 *     非声明,不在断言面;本 spec 跳注释行,与 grep 人查口径一致。
 *
 * @media 口径核实结论(五百四十批台账「零 @media 只剩 4 文件」vs grep 实测 views+components
 * 60 文件 ~106 处,两口径不矛盾,只核实不改代码):
 *  - 台账口径出自 GOAL-534-FLATTEN-DEEP.md 轨5 与 V3-HEALTH-REPORT.md:667「零 @media 四文件
 *    豁免备案(DevTools WL 兜底/Forbidden/MatchMatrix/NotFound)」= 无任何断点的文件计数
 *    (529 起逐批为零断点视图补 900 档入册 responsive900Sweep529 VIEWS_* 在册表);
 *  - 实测现状:views 60 文件 57 个含 @media(102 处),零 @media 只剩 3(DevTools/Forbidden/
 *    NotFound——豁免四文件中的 MatchMatrix 已于 538 批补 900 档入册 VIEWS_538),
 *    components 3 文件 4 处,合计 60 文件 ~106 处 ≈ grep 实测量级;
 *  - block900Of 正则(/@media \(max-width: 900px\) \{[\s\S]*?\n\}/)只认 900px 独立成块档,
 *    scripts/ 下无独立 responsive 审计器,口径载体即 responsive900Sweep529.spec.ts;
 *    ReindexAdvanced 单行 900 档与该正则不兼容(540 头注既记,维持)。
 *  -  RankDebug/DiffEditor/Ubq 三处收口行均已在 900 档内,纯值等值替换,
 *    529 断言面(块在场非空/无 ≥300px 裸 width/1100 档在场)不受影响。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 收口文件(4):残量收口后反锁小档位 px 计数恒 0 */
const FILES = [
  'views/RankDebugView.vue',
  'views/DiffEditorView.vue',
  'views/UpdateByQueryView.vue',
  'views/SqlBridgeView.vue',
] as const;

const srcOf = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');
/* 口径同 spSweep540 但只五小档(2/4/6/8/10):前面不是字母/数字/点/负号——
   排除 -6px 负值豁免与 132px 之类长数字截断误命中 */
const TIER_PX = /(?:^|[^-\w.,])(2|4|6|8|10)px/;
const SPACING_DECL = /(?:padding|margin|gap|row-gap|column-gap)[a-z-]*\s*:\s*([^;}]+)/g;

describe('五百四十三批 W5:views 残量 --sp 精确等值收口防回潮(小档位 px → var(--sp-N))', () => {
  it('收口文件集内 spacing 声明的小档位裸 px 计数恒 0(2/4/6/8/10)', () => {
    const hits: string[] = [];
    for (const rel of FILES) {
      const lines = srcOf(rel).split('\n');
      let inStyle = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/<style/.test(line)) { inStyle = true; continue; }
        if (/<\/style>/.test(line)) { inStyle = false; continue; }
        if (!inStyle) continue;
        /* 注释行(备案文字,头注③)不查 */
        const t = line.trim();
        if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('//') || t.startsWith('<!--')) continue;
        for (const m of line.matchAll(SPACING_DECL)) {
          /* calc() 组合链整条豁免(同 538/540 口径) */
          if (m[1].includes('calc(')) continue;
          const hit = m[1].match(TIER_PX);
          if (hit) hits.push(`${rel}:${i + 1} ${line.trim()}`);
        }
      }
    }
    expect(hits, `小档位裸 px 应换 var(--sp-N)或备案豁免:\n${hits.join('\n')}`).toEqual([]);
  });

  it('豁免备案抽查:混合刻值行与微型内衬仍在场(防顺手过度合并),收口值档位落位正确', () => {
    /* 头注①:MatchMatrix 混合刻值行整行保字面。
       五百五十二批同步更新:.mm-err 豁免退役(err 条数值档统一),改锁新形态;
       五百五十四批同步更新:.mm-busy 6px/16px 合并(14px 刻值保字面),锚改新形态防半收回流;
       五百五十八批同步更新:.mm-err 红壳合并全局 err-bar(刻值行随私造规则退役,负锚防回流) */
    expect(srcOf('views/MatchMatrixView.vue')).not.toMatch(/\.mm-err \{[^}]*padding/);
    expect(srcOf('views/MatchMatrixView.vue')).toMatch(/gap: var\(--sp-1h\); padding: 14px var\(--sp-4\)/);
    /* 头注②:WatcherView .wt-act 1px 微型内衬保字面(五百五十四批同步更新:6px 收 --sp-1h) */
    expect(srcOf('views/WatcherView.vue')).toMatch(/padding: 1px var\(--sp-1h\)/);
    /* 收口落位抽查:900 档内三处 10px → var(--sp-2h),SqlBridge gap 2px → var(--sp-0) */
    expect(srcOf('views/RankDebugView.vue')).toMatch(/\.rd-verdict \{ padding: var\(--sp-2\) var\(--sp-2h\); \}/);
    expect(srcOf('views/RankDebugView.vue')).toMatch(/\.rd-duel-side \{ padding: var\(--sp-2h\) var\(--sp-2h\); \}/);
    expect(srcOf('views/DiffEditorView.vue')).toMatch(/\.df-page \{ padding: var\(--sp-2\) var\(--sp-2h\) var\(--sp-4\); \}/);
    expect(srcOf('views/UpdateByQueryView.vue')).toMatch(/\.uq-page \{ padding: var\(--sp-2\) var\(--sp-2h\) var\(--sp-4\); \}/);
    /* 五百六十二批同步更新：.br-sql-lint 私造形态随改用 theme.css .lint-bar 单源退役
       （gap 等值收口成果由单源 gap: var(--sp-0) 承接），模板锚 lint-bar 改用形态在场 */
    expect(srcOf('views/SqlBridgeView.vue')).not.toMatch(/\.br-sql-lint \{/);
    expect(srcOf('views/SqlBridgeView.vue')).toContain('class="lint-bar br-sql-lint lint-bar-warn" role="status"');
  });
});
