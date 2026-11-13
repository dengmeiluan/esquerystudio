/* 五百四十五批 W5(轨5):544 收 4 文件后的全域残量重扫精确等值收口防回潮——§6z 备案
 * 口径同 spSweep544(五小档 2/4/6/8/10,theme.css:102-103 档表 --sp-0:2/--sp-1:4/
 * --sp-1h:6/--sp-2:8/--sp-2h:10;spacing 声明系 padding|margin|gap|row-gap|column-gap;
 * style 块内;跳注释行;calc() 整条豁免;正则排除负值/长数字截断误命中)。
 *
 * 全域重扫 18 命中三值裁决总表:
 *  - 收(2 文件 4 值,本 spec 反锁):components/FocusableSurface.vue:102
 *    (row-gap: 4px→var(--sp-1);padding: 4px 8px→var(--sp-1) var(--sp-2),行内 gap 已是
 *    token,gap 简写置后按 CSS 展开规则本就覆盖 row-gap,纯等值)、
 *    components/ResizablePane.vue:113(padding: 4px var(--sp-2)→var(--sp-1) var(--sp-2))。
 *    两文件均属轨5 独占域(components 非轨3 四表件),无他轨未提交改动(git status 核实)。
 *  - 保字面(豁免在册):
 *    ① MatchMatrixView .mm-busy 混合刻值行(gap: 6px + padding: 14px 16px
 *       刻意值整行保字面,544 头注①既记)。五百五十二批同步更新:.mm-err 混合刻值行随
 *       「err 条数值档统一」约定合并落 var(--sp-*) 档,豁免退役改新形态锚;
 *    ② WatcherView .wt-act「padding: 1px 6px」1px 微型内衬(544 头注②既记);
 *    ③ LuceneInput 四行(.li-inp padding: 6px 10px 纯档位可收,但同文件 .li-syntax
 *       gap: 5px 非档位刻意值 + padding: 3px 8px 混合刻值、.li-hint padding: 12px 10px
 *       12px 中档(544 口径「12/16/24/32 布局语义大间距不收」)、.li-item padding:
 *       5px 10px 5px 奇数微调)——混合刻值密度高,选择性收口必造半收行或破坏 544
 *       「收口集计数恒 0」文件级形态,整文件保字面备案,待混合行随上游刻值重审一并合并。
 *  - 让轨(禁改备案):AdhocRebuildView(轨2 域,且 .ar-input-tabs 为 538 契约整行锁、
 *    .tbl th padding: 5px 8px 中 5px 非档位混合行)、DslQueryView/QueryHubView/
 *    WorkbenchLayout(黑名单文件,另一并行 lane 在 dq/qh 区活跃)。
 *
 * @media 只复核不扩张(544 口径既核):零断点视图现三=DevTools/Forbidden/NotFound 豁免
 * 在册,载体正则 responsive900Sweep529;两收口文件均无 @media 块,529 断言面不受影响。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 收口文件(2):残量收口后反锁小档位 px 计数恒 0 */
const FILES = [
  'components/FocusableSurface.vue',
  'components/ResizablePane.vue',
] as const;

const srcOf = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');
/* 口径同 spSweep544 但只五小档(2/4/6/8/10):前面不是字母/数字/点/负号——
   排除 -6px 负值豁免与 132px 之类长数字截断误命中 */
const TIER_PX = /(?:^|[^-\w.,])(2|4|6|8|10)px/;
const SPACING_DECL = /(?:padding|margin|gap|row-gap|column-gap)[a-z-]*\s*:\s*([^;}]+)/g;

describe('五百四十五批 W5:components 残量 --sp 精确等值收口防回潮(小档位 px → var(--sp-N))', () => {
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
        /* 注释行(备案文字,544 头注③)不查 */
        const t = line.trim();
        if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('//') || t.startsWith('<!--')) continue;
        for (const m of line.matchAll(SPACING_DECL)) {
          /* calc() 组合链整条豁免(同 538/540/544 口径) */
          if (m[1].includes('calc(')) continue;
          const hit = m[1].match(TIER_PX);
          if (hit) hits.push(`${rel}:${i + 1} ${line.trim()}`);
        }
      }
    }
    expect(hits, `小档位裸 px 应换 var(--sp-N)或备案豁免:\n${hits.join('\n')}`).toEqual([]);
  });

  it('豁免备案抽查:混合刻值行与微型内衬仍在场(防顺手过度合并),收口值档位落位正确', () => {
    /* 头注③:LuceneInput 混合刻值行整文件保字面(3px/5px 非档刻意值 + 12px 中档不收)。
       五百六十批同步更新:.li-syntax 8px / .li-item 10px 两侧横向精确等值合并 var(--sp-2)/
       var(--sp-2h)(原「整文件保字面」备案修订合并),3px/5px 纵向与 gap:5px 仍保字面 */
    expect(srcOf('components/LuceneInput.vue')).toMatch(/padding: 3px var\(--sp-2\)/);
    expect(srcOf('components/LuceneInput.vue')).toMatch(/padding: 5px var\(--sp-2h\)/);
    /* 头注①:MatchMatrix 混合刻值行整行保字面。
       五百五十二批同步更新:.mm-err 豁免退役(err 条数值档统一落 token 档),改锁新形态;
       五百五十八批同步更新:.mm-err 红壳合并全局 err-bar(刻值行随私造规则退役,负锚防回流) */
    expect(srcOf('views/MatchMatrixView.vue')).not.toMatch(/\.mm-err \{[^}]*padding/);
    /* 头注②:WatcherView .wt-act 1px 微型内衬保字面(五百五十四批同步更新:6px 收 --sp-1h) */
    expect(srcOf('views/WatcherView.vue')).toMatch(/padding: 1px var\(--sp-1h\)/);
    /* 收口落位抽查:FocusableSurface row-gap/padding、ResizablePane padding 档位落位 */
    expect(srcOf('components/FocusableSurface.vue')).toMatch(/row-gap: var\(--sp-1\); gap: var\(--sp-1\); position: relative; padding: var\(--sp-1\) var\(--sp-2\);/);
    expect(srcOf('components/ResizablePane.vue')).toMatch(/padding: var\(--sp-1\) var\(--sp-2\);/);
  });
});
