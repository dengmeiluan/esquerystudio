/* 五百三十八批：--sp 精确等值收口守卫——components 侧 padding/margin/gap 系裸档位 px 字面
 * （恰落 theme.css 档表 --sp-0:2/-1:4/-1h:6/-2:8/-2h:10/-3:12/-4:16/-5:24/-6:32 者）
 * 全部改用 var(--sp-N)，本 spec 防回潮（档表口径同 spaceKey/527 系 spacing 守卫先例）。
 * 纪律（与任务同源，豁免备案落档）：
 *   ① 只收精确等值——1px 属边框/微型内衬语义豁免；3/5/7/9/14 等奇数微调为视觉刻意值保字面；
 *   ② width/height/top/left/right/border(-width/-radius)/line-height/letter-spacing/flex-basis
 *      等 layout/形状系一律不收（ModalShell width="480px" 宽度档由 flattenWave534 另锁）；
 *   ③ 被既有 spec/注释契约逐字锁住的字面保字面——QueryHistoryPanel .qhp-empty 与 EmptyState
 *      的 34px 16px 全站空态留白契约（theme.css .empty 注释明令）整行保字面
 *      （五百五十七批同步更新：16px 半边等值收 var(--sp-4)，34px 契约值仍保字面，
 *      扫描豁免与抽查锚同步改锁，adaptive556 扩锚同锁）；
 *   ④ 负 margin（HotkeyPanel .hk-x margin-right:-6px 拖拽补偿）与 calc 缩进链
 *      （ExplainTree .xt-row padding calc(6px+depth*14px) 的 14px 层级步进）为刻意值不入断言；
 *   ⑤ views 侧不在本 spec 盘子：MatchMatrixView .mm-err/.mm-busy 的 gap/padding 混合刻值行
 *      整行保字面（535 W7 先例），其 900 档归 responsive900Sweep529 管辖。
 * MatchMatrix 900 档入册（ VIEWS_538）与零 @media 三文件豁免备案
 * （Forbidden/NotFound/DevTools）均已在 responsive900Sweep529.spec.ts 头注落档。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 收口文件（核心 6 + 扩充面 29）：逐文件收口后反锁档位 px 清零 */
const FILES = [
  /* 核心盘子 */
  'components/GuardedActionButton.vue',
  'components/WelcomeWizard.vue',
  'components/SetupWizard.vue',
  'components/UserMenu.vue',
  'components/DocDiffModal.vue',
  'components/builder/QueryTreePane.vue',
  /* 扩充面（批一） */
  'components/ColPicker.vue',
  'components/ConfirmModal.vue',
  'components/QueryHistoryPanel.vue',
  'components/NotifyCenter.vue',
  'components/LoginOverlay.vue',
  'components/HotkeyPanel.vue',
  'components/SettingsGrid.vue',
  'components/IndexPicker.vue',
  'components/FieldPicker.vue',
  'components/devtools/EndpointPathInput.vue',
  'components/builder/RootExtrasPane.vue',
  /* 扩充面（批二） */
  'components/InsightRail.vue',
  'components/CurrentIdxChip.vue',
  'components/ReconcileReportDrawer.vue',
  'components/IntegrationGuide.vue',
  'components/SettingsKeyInput.vue',
  'components/Pagination.vue',
  'components/HitNav.vue',
  'components/JsonTree.vue',
  'components/CellContextMenu.vue',
  'components/CmdPalette.vue',
  /* 扩充面（批三） */
  'components/TableShell.vue',
  'components/SideNav.vue',
  'components/builder/BoolGroupNode.vue',
  'components/PageHeader.vue',
  'components/EmptyState.vue',
  'components/builder/FieldSelect.vue',
  'components/MetaStrip.vue',
  'components/MonacoEditor.vue',
  'components/RemoteSourceFields.vue',
  'components/LabNav.vue',
  'components/AutoRefreshSelect.vue',
  'components/JsonArea.vue',
  'components/IndexOptionRow.vue',
  'components/AggBarChart.vue',
  'components/ExplainTree.vue',
] as const;

const srcOf = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');
/* padding/margin/gap（含子属性）声明值里的裸档位 px（前面不是字母/数字/点/负号——
   排除 -6px 负值豁免与 132px 之类的长数字截断误命中）。按声明级切分：
   同行混排的 border-radius 等 layout 系档位字面（刻意不收）不误伤 */
const TIER_PX = /(?:^|[^-\w.,])(2|4|6|8|10|12|16|24|32)px/;
const SPACING_DECL = /(?:padding|margin|gap|row-gap|column-gap)[a-z-]*\s*:\s*([^;}]+)/g;

describe('五百三十八批：--sp 精确等值收口防回潮（components 侧档位 px → var(--sp-N)）', () => {
  it('收口清单内 spacing 声明不再出现裸档位 px（2/4/6/8/10/12/16/24/32）', () => {
    for (const rel of FILES) {
      const lines = srcOf(rel).split('\n');
      let inStyle = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/<style/.test(line)) { inStyle = true; continue; }
        if (/<\/style>/.test(line)) { inStyle = false; continue; }
        if (!inStyle) continue;
        /* 注释行（合同备案）不查 */
        const t = line.trim();
        if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('//') || t.startsWith('<!--')) continue;
        for (const m of line.matchAll(SPACING_DECL)) {
          /* 全站空态留白契约行（34px 16px，theme.css .empty 明令）整条豁免——
             34px 本就不在档表，同声明的 16px 随行保字面。
             calc() 组合值（ExplainTree 层级缩进链 depth*14px 步进）整条豁免，见头注 ④ */
          if (m[1].includes('34px') || m[1].includes('calc(')) continue;
          const hit = m[1].match(TIER_PX);
          expect(hit, `${rel}:${i + 1} spacing 声明残留档位 px（应换 var(--sp-N) 或备案豁免）：${line.trim()}`).toBeNull();
        }
      }
    }
  });

  it('豁免备案抽查：契约值与刻意值仍在场（防顺手过度合并）', () => {
    /* 空态留白全站契约 34px 保字面（theme.css .empty 明令）；16px 半边随五百五十七批
       等值收 var(--sp-4)（flattenWave554 st-list-empty/nf-card 先例，adaptive556 扩锚同锁） */
    expect(srcOf('components/QueryHistoryPanel.vue')).toMatch(/padding:\s*34px var\(--sp-4\)/);
    /* 负 margin 拖拽补偿刻意值保字面 */
    expect(srcOf('components/HotkeyPanel.vue')).toMatch(/margin-right:\s*-6px/);
    /* calc 层级缩进链（14px 步进）保字面 */
    expect(srcOf('components/ExplainTree.vue')).toMatch(/calc\(6px \+ var\(--xt-depth\) \* 14px\)/);
    /* 奇数微调刻意值抽样保字面（7px/9px 不在档表，永不合并） */
    expect(srcOf('components/ConfirmModal.vue')).toMatch(/gap:\s*9px/);
    expect(srcOf('components/WelcomeWizard.vue')).toMatch(/padding:\s*1px 5px/);
  });
});
