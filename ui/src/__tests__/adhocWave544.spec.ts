/**
 * 五百四十三批 W2：「翻页/展示形式统一在表格头」范式第三页穿透评估备案（AdhocRebuildView）。
 *
 * 裁决（逐表，grep `<table` 实地定位；任务单「约 295 行 job 表」为漂移前口径——job 表
 * 已于 529 批 W-B 换 QRT rows 型，本页现存两处裸 `<table class="tbl">` 实为：
 *   ① cfgDiff「期望 vs 实际」diff 表 —— 备案不迁：
 *     - 无分页/排序/列宽/复制诉求：diff 报告的行序即语义（真差异区恒前、噪声区折叠在后，
 *       区内按档位/字段排序），排序会摧毁分区叙事；长表浏览已由 .ar-diff 42vh 容器内滚动
 *       +表头吸顶承担（w10ReduceSteps525 ④ 锁该弹性档）；
 *     - 结构性障碍：等价噪声折叠条是 tbody 中段 colspan=5 的 role=button tr（rowChipA11y372
 *       键盘可达锚），QRT rows 型是均匀行模型，无法寄居「表体中段交互行」；
 *     - 锁面：rowChipA11y372:42 逐字锁折叠条 tr 整行、adhocDiffWiring 真挂载锁
 *       td.cd-kind/.cd-real/.cd-benign DOM 语义——均不在可同步更新清单（仅 w10/rebuildFlat
 *       有同步更新权限），强迁即触不可同步更新锁。
 *   ② rounds「轮次」表 —— 备案不迁：
 *     - 纯静态小表：job.rounds 按 round+phase 追加，典型 2~8 行（FULL/FINAL 主干+CATCHUP
 *       变体），无翻页/排序/列宽/复制诉求；
 *     - tfoot Σ 行是「跨列人工判读」展示行（Σcreated+Σupdated 趋近 Σtotal、Σconflicts 高涨
 *       =源仍被写），QRT 内核聚合行是列头菜单开关的 sum/avg/min/max 数值聚合（useAggRow），
 *       语义不同构；adhocJobsTable524:119-121 逐字锁 <tfoot class="ar-rounds-agg">+roundSum
 *       三调用（不在可同步更新清单）。
 * 故本页无「翻页/展示形式寄居表格头」的对象：唯一符合范式判据的 jobs 表已 QRT 在场；
 * 全文件零 #bar-prepend / :page= 消费即本裁决的形态锚。
 *
 * 附：--sp 残量甄别备案（顺手项）——本文件 spacing 声明的档位裸 px(2/4/6/8/10/12/
 * 16/24/32) 此前仅存两契约行（.tbl th「padding: 5px 8px」/ .ar-input-tabs「gap: 2px; padding: 2px」）。
 * 五百五十四批 P2 两行全收口 var(--sp-*)（四锁 adhocWave544 本条/rebuildFlat534/spSweep540/
 * w10ReduceSteps525 同批同步更新改锚）；其余裸 px 均为非档位奇数刻意值（1/3/5/7px，spSweep540
 * 头注④豁免口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('五百四十三批：AdhocRebuildView 表格内核穿透评估备案', () => {
  const src = read('../views/AdhocRebuildView.vue');

  it('裸 .tbl 恰两处（cfgDiff diff 表 + rounds 轮次表），jobs 表已 QRT 在场', () => {
    /* 877 同步更新：rounds 表挂 .ar-rounds 修饰类（tbody 数字列与 Σ 共右轴的对齐钩子），
     裸表计数口径改为 .tbl 前缀——仍恒两处，迁一补锚，全迁改本锁 */
    expect(src.split('<table class="tbl').length - 1, '本页裸表恒两处——迁一补锚，全迁改本锁').toBe(2);
    expect(src).toContain('<table class="tbl ar-rounds"');
    expect(src).toContain('<QueryResultTable :cols="JOB_COLS"');
  });

  it('本页无分页寄居对象：零 #bar-prepend / :page= 消费（范式第三页无可寄居表）', () => {
    expect(src, '两表均备案不迁，不应出现 bar-prepend 寄居').not.toContain('#bar-prepend');
    expect(src, 'QRT 内建分页三参未接线（jobs 表走 kw 过滤+漏斗，非翻页形态）').not.toContain(':page=');
  });

  it('cfgDiff 表锚：折叠条 tr 字面在场（rowChipA11y372:42 逐字锁兼容）', () => {
    expect(src).toMatch(/<tr v-if="cfgParts\.benign\.length" class="cd-benign-toggle" role="button" tabindex="0" :aria-label="benignOpen \? '收起无风险变更' : '展开无风险变更'" @click="benignOpen = !benignOpen" @keydown\.enter\.prevent="benignOpen = !benignOpen" @keydown\.space\.prevent="benignOpen = !benignOpen">/);
    /* adhocDiffWiring 真挂载锚的模板侧前提：tbody 分区类与吸顶头 */
    expect(src).toContain('<table class="tbl">');
    expect(src).toMatch(/\.ar-diff \.tbl th \{ position: sticky; top: 0; background: var\(--bg2\); z-index: 1; \}/);
  });

  it('rounds 表锚：<tfoot class="ar-rounds-agg"> + roundSum 恰三调用（adhocJobsTable524:119-121 锁兼容）', () => {
    expect(src).toContain('<tfoot class="ar-rounds-agg">');
    expect(src.match(/roundSum\('(created|updated|versionConflicts)'\)/g)?.length).toBe(3);
  });
});

describe('五百四十三批：AdhocRebuildView --sp 残量甄别备案（554 两契约行收口同步更新）', () => {
  const src = read('../views/AdhocRebuildView.vue');

  it('原两契约行收口后新形在场（554 同步更新：档位裸 px 归 var(--sp-*)，5px 奇数保字面）', () => {
    expect(src).toMatch(/\.tbl th \{ text-align: left; padding: 5px var\(--sp-2\); color: var\(--tx2\); border-bottom: 1px solid var\(--line\); \}/);
    expect(src).toMatch(/\.ar-input-tabs \{ display: inline-flex; gap: var\(--sp-0\); padding: var\(--sp-0\); background: var\(--bg2\); border-radius: var\(--r-m\); margin-bottom: var\(--sp-3\); \}/);
  });

  it('豁免两契约行后，spacing 声明的档位值裸 px 计数恒 0（口径同 spSweep540）', () => {
    /* 口径同 spSweep540:58-59：padding/margin/gap 系声明值里的裸档位 px（负值/长数字不误命中） */
    const TIER_PX = /(?:^|[^-\w.,])(2|4|6|8|10|12|16|24|32)px/;
    const SPACING_DECL = /(?:padding|margin|gap|row-gap|column-gap)[a-z-]*\s*:\s*([^;}]+)/g;
    const CONTRACT_LINE = [/\.tbl th \{/, /\.ar-input-tabs \{/];
    const hits: string[] = [];
    const lines = src.split('\n');
    let inStyle = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/<style/.test(line)) { inStyle = true; continue; }
      if (/<\/style>/.test(line)) { inStyle = false; continue; }
      if (!inStyle) continue;
      const t = line.trim();
      if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('//') || t.startsWith('<!--')) continue;
      if (CONTRACT_LINE.some(re => re.test(line))) continue;
      for (const m of line.matchAll(SPACING_DECL)) {
        if (m[1].includes('calc(')) continue;
        const hit = m[1].match(TIER_PX);
        if (hit) hits.push(`${i + 1} ${t}`);
      }
    }
    expect(hits, `档位值裸 px 应换 var(--sp-N)或契约备案:\n${hits.join('\n')}`).toEqual([]);
  });
});
