/* 五百五十一批 W5(轨5 自适应与全栈):views 裸 px 终态巡检——档位可收面恒零反锁 + 豁免逐字
 * 保字面防误收(零产品码改动,--sp 残量已终态零可收面,本 spec 只反锁)。
 * 口径沿 spSweep545(TIER_PX 前缀负扫 + SPACING_DECL 声明系 + style 块内 + 跳注释行 +
 * calc() 整条豁免),档位集改正档五枚(4/8/12/16/24,theme.css:102 --sp-1..--sp-5;
 * 半档 2/6/10 已归 spSweep540/544 收口域,不重扫)。
 *
 * ① 收口集档位裸 px 恒 0:views style 块 spacing 声明的档位裸 px 命中必须全部落在在册
 *    豁免行内(实测恰 4 行:AdhocRebuildView .tbl th「5px 8px」混合行/MatchMatrixView
 *    .mm-busy「14px 16px」混合刻值/NotFoundView .nf-card 与 SearchTemplatesView
 *    .st-list-empty「34px 16px」全站空态契约)——出现第 5 行(新纯档位行或未备案混合行)即红;
 *    (五百五十二批同步更新:.mm-err 混合刻值行随「err 条数值档统一」落 var(--sp-*) 档,
 *    在册豁免 5 行→4 行,锚与逐字锁同步更新)
 * ② 13 处豁免逐字反锁在场(保字面防误收:半收行/拆契约行即红——混合刻值行收档位必造半收行,
 *    1px 微型内衬、负 margin/负档、非档位整数 18/20/22/34 均为刻意值,540/544 头注既记)。
 *
 * 直方图备案(实测,口径=SPACING_DECL 声明系×\d+px,views 55 文件 style 块,跳注释行/calc):
 *   裸 px 值 265 个/含值行 240 行;刻意值族 3px×65/5px×65/1px×57/14px×32/7px×14 主导
 *   (合计 201 占 76%),非档位整数 9/18/22/30/34 零星,档位值命中仅 5 行(16px×4/8px×1)且
 *   全部在册(①)。旧台账「~255 处待收」与「118 处」行数口径勘误为本表(口径差=值计数 vs
 *   行计数,正则可复现,以本表为准)——views 档位可收面终态为零,与「--sp 残量终态零可收面」
 *   批次结论一致。 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const viewsDir = join(__dirname, '..', 'views');
const srcOf = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');

/* 口径同 spSweep545,档位集改正档五枚(4/8/12/16/24):前面不是字母/数字/点/负号——
   排除 -4px 负值豁免与 140px/480px 之类长数字截断误命中 */
const TIER_PX = /(?:^|[^-\w.,])(4|8|12|16|24)px/;
const SPACING_DECL = /(?:padding|margin|gap|row-gap|column-gap)[a-z-]*\s*:\s*([^;}]+)/g;

/* ① 在册豁免行锚(行文本含其一即视为已备案):3 处档位混合行/契约行的规则选择器字面
   (五百五十二批同步更新:'.mm-err' 锚随该行落 var(--sp-*) 档退役,豁免册见 540/544 头注;
    五百六十一批同步更新:'.st-list-empty' 死码规则立删,豁免册锚随之退役——负锁见 flattenWave554) */
const TIER_EXEMPT_ANCHORS = ['.tbl th', '.mm-busy', '.nf-card'];

/* 收集 views style 块内 spacing 声明的档位裸 px 命中(文件:行 + 行文本) */
function tierHits(): { at: string; text: string }[] {
  const hits: { at: string; text: string }[] = [];
  for (const f of readdirSync(viewsDir).filter((x) => x.endsWith('.vue')).sort()) {
    const lines = readFileSync(join(viewsDir, f), 'utf-8').split('\n');
    let inStyle = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/<style/.test(line)) { inStyle = true; continue; }
      if (/<\/style>/.test(line)) { inStyle = false; continue; }
      if (!inStyle) continue;
      const t = line.trim();
      if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('//') || t.startsWith('<!--')) continue;
      for (const m of line.matchAll(SPACING_DECL)) {
        if (m[1].includes('calc(')) continue; /* calc() 组合链整条豁免(538/540/544/545 同口径) */
        if (TIER_PX.test(m[1])) hits.push({ at: `${f.replace(/\.vue$/, '')}:${i + 1}`, text: t });
      }
    }
  }
  return hits;
}

describe('五百五十一批 W5:views 裸 px 终态巡检(档位可收面恒零 + 13 处豁免保字面)', () => {
  it('① views spacing 声明档位裸 px(4/8/12/16/24)命中全部在册,收口集恒 0(第 6 行即红)', () => {
    const hits = tierHits();
    /* 收口集 = 命中行减在册豁免行(行文本含豁免锚);终态应为空 */
    const open = hits.filter((h) => !TIER_EXEMPT_ANCHORS.some((a) => h.text.includes(a)));
    expect(
      open.map((h) => `${h.at} ${h.text}`),
      `档位裸 px 出现未备案新行(应收 var(--sp-N)或先备案豁免):\n${hits.map((h) => `${h.at} ${h.text}`).join('\n')}`,
    ).toEqual([]);
  });

  it('② 12 处豁免逐字在场(保字面防误收:契约锁/混合刻值/微型内衬/负档/非档位整数;552 同步更新 .mm-err 退役;558 同步更新 .mm-err 合并 err-bar 负锚)', () => {
    /* 540 头注①:AdhocRebuildView .ar-input-tabs 契约整行锁(rebuildFlat534)。
       五百五十四批同步更新:2px/2px 收口 var(--sp-0)(等值),锚改新形态 */
    expect(srcOf('views/AdhocRebuildView.vue')).toMatch(/gap: var\(--sp-0\); padding: var\(--sp-0\)/);
    /* 540 头注①:同文件 .tbl th「5px 8px」混合行(w10ReduceSteps525 锁字面)。
       五百五十四批同步更新:8px 收 var(--sp-2)(5px 奇数刻值保字面),锚改新形态 */
    expect(srcOf('views/AdhocRebuildView.vue')).toMatch(/padding: 5px var\(--sp-2\)/);
    /* 540 头注④:负 margin 刻意值 */
    expect(srcOf('views/AdhocRebuildView.vue')).toMatch(/margin: -4px 0 var\(--sp-2\)/);
    /* 538/540/544 头注先例:MatchMatrixView 混合刻值行。
       五百五十二批同步更新:.mm-err 豁免退役(err 条数值档统一落 token 档),改锁新形态;
       五百五十四批同步更新:.mm-busy 6px/16px 合并(14px 刻值保字面),锚改新形态;
       五百五十八批同步更新:.mm-err 红壳合并全局 err-bar(刻值行随私造规则退役,负锚防回流) */
    expect(srcOf('views/MatchMatrixView.vue')).not.toMatch(/\.mm-err \{[^}]*padding/);
    expect(srcOf('views/MatchMatrixView.vue')).toMatch(/gap: var\(--sp-1h\); padding: 14px var\(--sp-4\)/);
    /* 544 头注②:WatcherView .wt-act 1px 微型内衬(五百五十四批同步更新:6px 收 --sp-1h) */
    expect(srcOf('views/WatcherView.vue')).toMatch(/padding: 1px var\(--sp-1h\)/);
    /* 540 头注②:全站空态留白契约 34px(theme.css .empty 明令;五百五十四批同步更新:16px 收 --sp-4)。
       五百六十一批同步更新:SearchTemplatesView st-list 空态死码行随规则立删,改负锁
       (flattenWave554 负锚同源;'34px var(--sp-4)' 全站契约由 NotFoundView .nf-card 行继续反锁) */
    expect(srcOf('views/NotFoundView.vue')).toMatch(/padding: 34px var\(--sp-4\)/);
    expect(srcOf('views/SearchTemplatesView.vue')).not.toMatch(/\.st-list-empty/);
    /* 540 头注⑤:非档位整数 20px(RankDebug 空态内衬/SqlConsole 列表缩进) */
    expect(srcOf('views/RankDebugView.vue')).toMatch(/padding: 20px/);
    expect(srcOf('views/SqlConsoleView.vue')).toMatch(/margin: var\(--sp-1\) 0 var\(--sp-1h\) 20px/);
    /* 540 头注④:树挂负档(var(--sp-1) -6px -6px) */
    expect(srcOf('views/TasksView.vue')).toMatch(/margin: var\(--sp-1\) -6px -6px/);
    /* 540 头注⑤:NotFound 18/22px 非档位节奏 */
    expect(srcOf('views/NotFoundView.vue')).toMatch(/margin-top: 18px/);
    expect(srcOf('views/NotFoundView.vue')).toMatch(/margin-top: 22px/);
    /* 540 头注⑤:LuceneQueryView 列表缩进 18px(ul disc 语义) */
    expect(srcOf('views/LuceneQueryView.vue')).toMatch(/padding-left: 18px/);
  });
});
