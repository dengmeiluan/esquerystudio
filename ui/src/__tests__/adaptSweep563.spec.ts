/**
 * 五百六十三批（轨5 自适应与全栈）：--sp 残量收口 + 零 @media 裁决落档。
 * ① --sp：独占域 30 组件 spacing 声明档位裸 px 复扫恒零（spSweep538/545/flattenWave560-sp
 *    收口面反锁延续，实测零可收面）；theme.css 存量两行精确等值合并——
 *    .pill.xs「1px 6px」6px 半边收 var(--sp-1h)（1px 微衬刻意值保字面，flattenWave554
 *    WatcherView .wt-act「1px var(--sp-1h)」先例同款）、.btn gap 6px 收 var(--sp-1h)；
 *    三行逐字锁（.kbd.inline=kbdUnify429、.chip.xs=themeDiscipline525、
 *    .focus-tools=focusVisual451，adaptive556 头注②豁免册在案）保字面负锁。
 * ② 零 @media 裁决：独占域 30 组件逐一裁决——WelcomeWizard 补 900 窄档（与 theme.css
 *    900 档/utils/layout.ts BP_NARROW 单源互锚；档内纯 CSS 零结构动：双列卡格降单列 +
 *    三列快捷键行竖排；档内零 height/flex-basis 尺寸声明，高度链红线自证）；其余 28 组件
 *    备案豁免（浮层 vw 钳制 8 / 壳层 JS 档已立 4 / 定宽壳栏带收纳开关 1 / pane 内容单列 15，
 *    逐文件台账见 GOAL-534-563-OBS-NOTES.md 附表），census 负锁防未裁决 @media 潜入。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcOf = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');
/* 剥注释：注释字面不算数（flattenWave560-sp 同一教训） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ═══════════ ① --sp 残量收口（theme.css 两行等值 + 逐字锁豁免册负锁） ═══════════ */

describe('五百六十三批 ①：theme.css --sp 精确等值合并 2 行（逐字锁三行豁免保字面）', () => {
  it('档表等值锚：--sp-1h === 6px（换算精确性单一出处）', () => {
    expect(srcOf('theme.css')).toContain('--sp-1h: 6px;');
  });

  it('.pill.xs：6px 半边收 var(--sp-1h)，1px 微衬刻意值保字面（裸 1px 6px 退役）', () => {
    const s = srcOf('theme.css');
    expect(s, '.pill.xs 新形态（1px 保字面 + 6px 归档）')
      .toMatch(/\.pill\.xs \{ font-size: var\(--fs-2xs\); padding: 1px var\(--sp-1h\); \}/);
    expect(strip(s), '裸「padding: 1px 6px」退役').not.toMatch(/\.pill\.xs \{[^}]*padding: 1px 6px/);
  });

  it('.btn：gap 6px 精确等值收 var(--sp-1h)（padding 5px 刻意/12px 等值行 adaptive556 锁零触）', () => {
    const s = srcOf('theme.css');
    expect(s, '.btn 规则内 gap 归档').toMatch(/\.btn \{[^}]*gap: var\(--sp-1h\);/);
    expect(strip(s), '.btn 规则内裸 gap: 6px 退役').not.toMatch(/\.btn \{[^}]*gap: 6px/);
    /* 既有 adaptive556 部分正则锚随行在场（.btn 5px 刻意/12px 等值半边不回归） */
    expect(s).toMatch(/\.btn \{[^}]*padding: 5px var\(--sp-3\);/);
  });

  it('逐字锁三行豁免保字面（adaptive556 头注②豁免册：kbdUnify429/themeDiscipline525/focusVisual451 锚定）', () => {
    const s = srcOf('theme.css');
    expect(s).toMatch(/\.kbd\.inline \{ display: inline-block; padding: 1px 4px; font-size: var\(--fs-xs\); background: var\(--hl\); border-radius: 2px; margin-left: 3px; \}/);
    expect(s).toMatch(/\.chip\.xs\s*\{\s*padding:\s*1px 6px;\s*border-radius:\s*var\(--r-s\);\s*\}/);
    expect(s).toContain('.focus-tools { display: flex; gap: 8px; align-items: center; justify-content: flex-end; margin-bottom: 8px; }');
  });

  it('独占域 30 组件 spacing 声明档位裸 px 复扫恒零（spSweep538/545/560-sp 收口面延续反锁）', () => {
    const FILES = [
      'SideNav', 'TopBar', 'UserMenu', 'ClusterSwitcher', 'CmdPalette', 'HotkeyPanel',
      'LabNav', 'WelcomeWizard', 'SetupWizard', 'LoginOverlay', 'WorkbenchLayout',
      'ResizablePane', 'SplitHandle', 'FocusableSurface', 'GuardedActionButton',
      'AutoRefreshSelect', 'SettingsKeyInput', 'IndexOptionRow', 'ProfileTree',
      'ExplainTree', 'MappingFieldTree', 'JsonArea', 'JsonTree', 'DocDiffModal',
      'CellContextMenu', 'IntegrationGuide', 'QueryHistoryPanel', 'RemoteSourceFields',
      'FieldPicker', 'PickCurrentIdxBtn',
    ] as const;
    const TIER_PX = /(?:^|[^-\w.,])(2|4|6|8|10|12|16|24|32)px/;
    const SPACING_DECL = /(?:padding|margin|gap|row-gap|column-gap)[a-z-]*\s*:\s*([^;}]+)/g;
    const hits: string[] = [];
    for (const f of FILES) {
      const lines = srcOf(`components/${f}.vue`).split('\n');
      let inStyle = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/<style/.test(line)) { inStyle = true; continue; }
        if (/<\/style>/.test(line)) { inStyle = false; continue; }
        if (!inStyle) continue;
        const t = line.trim();
        if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('//') || t.startsWith('<!--')) continue;
        for (const m of t.matchAll(SPACING_DECL)) {
          /* 全站空态留白契约 34px 与 calc() 组合链整条豁免（spSweep538 同口径） */
          if (m[1].includes('34px') || m[1].includes('calc(')) continue;
          if (TIER_PX.test(m[1])) hits.push(`${f}.vue:${i + 1} ${t}`);
        }
      }
    }
    expect(hits, `独占域组件 spacing 档位裸 px 残量（应收 var(--sp-N) 或备案豁免）\n${hits.join('\n')}`).toEqual([]);
  });
});

/* ═══════════ ② 零 @media 裁决（WelcomeWizard 补 900 档 + 28 文件豁免 census 负锁） ═══════════ */

/* 豁免册（28 文件，裁决分类见头注②/GOAL-534-563-OBS-NOTES.md 附表）：
   - 浮层自适配（vw 钳制/居中，无需断点档）8：CmdPalette/HotkeyPanel/SetupWizard/LoginOverlay/
     UserMenu/ClusterSwitcher/CellContextMenu/DocDiffModal
   - 壳层断点机制已立（JS 档/壳接管）4：WorkbenchLayout/ResizablePane/SplitHandle/FocusableSurface
   - 定宽壳栏带收纳开关 1：SideNav（App.vue navHidden）
   - pane 内容单列（宽度随容器/父级滚动，无分栏无落点）15：LabNav/ProfileTree/ExplainTree/
     MappingFieldTree/JsonArea/JsonTree/IntegrationGuide/RemoteSourceFields/FieldPicker/
     QueryHistoryPanel/IndexOptionRow/SettingsKeyInput/GuardedActionButton/AutoRefreshSelect/
     PickCurrentIdxBtn
   （TopBar 已有 1100/1000 双档，adaptive556 计数锁管辖，不入本册） */
const MEDIA_EXEMPT = [
  'CmdPalette', 'HotkeyPanel', 'SetupWizard', 'LoginOverlay', 'UserMenu', 'ClusterSwitcher',
  'CellContextMenu', 'DocDiffModal',
  'WorkbenchLayout', 'ResizablePane', 'SplitHandle', 'FocusableSurface',
  'SideNav',
  'LabNav', 'ProfileTree', 'ExplainTree', 'MappingFieldTree', 'JsonArea', 'JsonTree',
  'IntegrationGuide', 'RemoteSourceFields', 'FieldPicker', 'QueryHistoryPanel',
  'IndexOptionRow', 'SettingsKeyInput', 'GuardedActionButton', 'AutoRefreshSelect',
  'PickCurrentIdxBtn',
] as const;

describe('五百六十三批 ②：独占域零 @media 裁决（WelcomeWizard 补 900 档在场 + 豁免册 census 恒零）', () => {
  it('WelcomeWizard 900 窄档在场：双列卡格降单列 + 三列快捷键行竖排（纯 CSS 零结构动）', () => {
    const s = srcOf('components/WelcomeWizard.vue');
    const block = s.match(/@media \(max-width: 900px\) \{[\s\S]*?\n\}/);
    expect(block, '900 档块在场（档位与 theme.css 900 档/BP_NARROW 单源互锚）').toBeTruthy();
    expect(block![0]).toContain('.wz-idx-list, .wz-actions { grid-template-columns: minmax(0, 1fr); }');
    expect(block![0]).toContain('.wz-hk { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-0); }');
    /* 高度链红线自证：档内零 height/flex-basis/flex 尺寸声明（只动排布方向与列数） */
    expect(block![0]).not.toMatch(/height|flex-basis|flex: [^0]/);
  });

  it('WelcomeWizard 模板段零触（补档前后结构逐字一致：根壳 style 与三行 wz-hk 锚）', () => {
    const s = srcOf('components/WelcomeWizard.vue');
    expect(s).toContain('style="width:640px;max-width:94vw"');
    expect(s.match(/<div class="wz-hk">/g)?.length, '三行快捷键 DOM 结构不变').toBe(3);
    expect(s.match(/@media/g)?.length, 'WelcomeWizard 恰 1 处 @media（新增须先过裁决改本计数）').toBe(1);
  });

  it('豁免册 28 文件 census 恒零（新 @media 须先过裁决并迁册，防未裁决档潜入）', () => {
    for (const f of MEDIA_EXEMPT) {
      const s = srcOf(`components/${f}.vue`);
      expect([...s.matchAll(/@media/g)].length, `${f}.vue 在豁免册（裁决备案见 OBS-NOTES 附表），出现 @media 即未裁决新档`).toBe(0);
    }
  });
});
