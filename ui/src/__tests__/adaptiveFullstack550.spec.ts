import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 五百五十批 轨5（自适应与全栈）：残量收口四件套源码锁——
 *  ① TopBar 游离窄档并档：max-width:1280px 独档并入全站 1100 档（BP_STACK 单源对齐，
 *     workbenchStackBp527 同语言互锚）；1280 内容（idx-meta 隐藏 + idx-select 收缩）原样同步更新，
 *     1000 档保留（已=BP_COMPACT 同值）。验收口径=全文件 1280 零命中（Lead 真机哨兵同判据）。
 *  ② TasksView err-bar 改用 errPreHtml 双参（SqlConsoleView 535 / DiagView 547 同范式）：
 *     loadErrRaw 旁路原始对象读 code/endpoint，成功路径复位；裸插值 {{ loadErr }} 退役。
 *  ③ QueryHubView .qh-mode「padding: 4px 10px」精确等值合并 var(--sp-1) var(--sp-2h)
 *     （等值前提：theme.css 档表 --sp-1:4px / --sp-2h:10px）。
 *  ④ MatchMatrixView .mm-busy 混合刻值行：spSweep540/544/545 逐字锁钉死保字面
 *     （豁免备案在册「违者即事故」）——锁大于任务，不合并，本用例反向锁其字面在场。
 *     （五百五十二批同步更新：.mm-err 混合刻值行随「err 条数值档统一」约定合并落 var(--sp-*) 档，
 *     550「不合并」裁决对 .mm-err 由 552 推翻，改锁新形态；.mm-busy 保字面不变） */

const srcOf = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');

describe('五百五十批 轨5：自适应与全栈残量收口', () => {
  it('TopBar：游离窄档并档零残留，内容并入 1100 档（BP_STACK 互锚约定在场），1000 档保留', () => {
    const s = srcOf('components/TopBar.vue');
    /* 验收口径同 Lead 真机哨兵：grep 1280 全文件零命中（含注释——并档备案以「游离窄档」措辞） */
    expect(s, '游离窄档必须零残留（全站 BP_STACK=1100 单源对齐）').not.toContain('1280');
    /* 原 1280 块内容原样同步更新 1100 档：idx-meta 隐藏 + idx-select 底线收缩 */
    expect(s).toMatch(
      /@media \(max-width: 1100px\) \{\s*\.tbar-left \.idx-meta \{ display: none; \}\s*\.idx-select \{ min-width: 200px; \}\s*\}/,
    );
    /* 约定注释：与 utils/layout BP_STACK 互锚（workbenchStackBp527 同语言） */
    expect(s).toMatch(/1100 档与 utils\/layout BP_STACK 互锚/);
    /* 1000 档保留（已=BP_COMPACT 同值档，窄容器微调继续生效） */
    expect(s).toMatch(/@media \(max-width: 1000px\) \{/);
  });

  it('TasksView：err-bar 改用 errPreHtml 双参，loadErrRaw 旁路原始对象（成功路径复位）', () => {
    const s = srcOf('views/TasksView.vue');
    expect(s).toMatch(/import \{ errPreHtml, errMeta \} from '\.\.\/utils\/errPre';/);
    expect(s, 'err-bar 必须双参改用（原始对象旁路读 code/endpoint）')
      .toMatch(/v-html="errPreHtml\(loadErr, errMeta\(loadErrRaw\)\)"/);
    expect(s, '失败臂必须旁路保存原始错误对象').toMatch(/loadErrRaw\.value = e;/);
    expect(s, '成功臂必须复位旁路对象（防旧 meta 串味）').toMatch(/loadErrRaw\.value = null;/);
    expect(s, '裸插值 {{ loadErr }} 必须退役（errPreHtml 全文回看接管）').not.toMatch(/\{\{\s*loadErr\s*\}\}/);
  });

  it('QueryHubView：.qh-mode padding 4px 10px 精确等值合并 --sp 档（档值等值前提锚定）', () => {
    const theme = srcOf('theme.css');
    expect(theme, '合并等值前提：--sp-1=4px').toMatch(/--sp-1: 4px;/);
    expect(theme, '合并等值前提：--sp-2h=10px').toMatch(/--sp-2h: 10px;/);
    const s = srcOf('views/QueryHubView.vue');
    expect(s).toMatch(/padding: var\(--sp-1\) var\(--sp-2h\);/);
    expect(s, '4px 10px 裸刻值应已合并（--sp 档精确等值）').not.toContain('4px 10px');
  });

  it('MatchMatrixView：.mm-busy 混合刻值行保字面（552 同步更新：.mm-err 合并落 token 档改锁新形态；554 同步更新：.mm-busy 6px/16px 合并改锁新形态；558 同步更新：.mm-err 红壳合并全局 err-bar，token 行退役改锁合并形态）', () => {
    const s = srcOf('views/MatchMatrixView.vue');
    /* 五百五十八批同步更新：.mm-err 挂全局 err-bar（私造红壳三件套退役，557 IH .ih-qerr 先例；
       合并形态详见 errBarWave558b） */
    expect(s).toMatch(/\.mm-err \{ align-items: flex-start; margin-bottom: 0; \}/);
    expect(s).toMatch(/gap: var\(--sp-1h\); padding: 14px var\(--sp-4\)/);
  });
});
