/**
 * ·轨2 W2 件④：高度档补齐三面（useTierCycle 统一件，缺省档=旧固定值零漂移）。
 *
 *  ① IndexHubView 文档编辑弹窗 JsonArea 定高 min(60vh,420px)（原无档）→ ih.docH 三档
 *     （dq.docH 同款档序列：min(60vh,420px)/min(70vh,560px)/min(80vh,700px)；档钮在弹窗
 *     编辑工具行「高」。docModalHeightsAssist 黑名单静态 style 字面保形：运行时档经
 *     :style 覆盖 static style 的 height 位（Vue 合并规则动态优先），首档=同值零漂移）。
 *  ② DslQueryView Profile 耗时树限高 max(240px,42vh)（531 口径固定值）→ dq.profH 三档；
 *     queryFlat534 冻结 CSS 规则字面零触（仍在册=缺省档同值），运行时档经内联 max-height
 *     覆盖；档钮在树域头（.dq-sec-hd 行内、关闭钮旁）。
 *  ③ DevToolsView 历史列表限高 max(240px,42vh)（indexHubDevtools531 黑名单冻结 CSS 字面
 *     零触）→ dt.histH 三档；档值经 .dt-hist 容器注入 --dt-hist-h 变量，后置同选择器规则
 *     消费（缺省档同值）；档钮并入历史面板工具行（.dt-hist-scope 行尾，恒高块
 *     flex-shrink:0 纪律不变，max 变档只改列表自身滚动上限，dt-body 定高链零触）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const dt = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

/* ═══════════ ① ih.docH（文档编辑弹窗三档） ═══════════ */

describe('565 件④①：IndexHub 文档编辑弹窗 ih.docH 三档', () => {
  it('useTierCycle 三件套：档序列 dq.docH 同款 + usePref 键 ih.docH + 首档=旧固定值（零漂移）', () => {
    expect(ih).toContain("const DOC_H_TIERS: string[] = ['min(60vh,420px)', 'min(70vh,560px)', 'min(80vh,700px)'];");
    expect(ih).toContain("useTierCycle('ih.docH', DOC_H_TIERS)");
  });
  it('弹窗编辑工具行档位钮（title 实时回显当前档，点击循环）', () => {
    expect(ih).toMatch(/<button class="btn sm ghost" :title="'编辑器高度档：' \+ docH \+ '（点击循环）'" @click="cycleDocH">高<\/button>/);
  });
  it('黑名单静态 style 字面保形 + 运行时档 :style 覆盖 height 位', () => {
    expect(ih).toContain('style="height:min(60vh,420px);display:flex" :style="{ height: docH }"');
  });
});

/* ═══════════ ② dq.profH（Profile 树三档） ═══════════ */

describe('565 件④②：DslQueryView Profile 树 dq.profH 三档', () => {
  it('useTierCycle 三件套：首档=531 冻结值 max(240px, 42vh)（零漂移）+ 内联覆盖', () => {
    expect(dq).toContain("const PROF_H_TIERS: string[] = ['max(240px, 42vh)', 'max(360px, 56vh)', 'max(480px, 70vh)'];");
    expect(dq).toContain("useTierCycle('dq.profH', PROF_H_TIERS)");
    expect(dq).toMatch(/<div v-if="profileTree" class="dq-profile" :style="profStyle">/);
  });
  it('树域头档位钮（关闭钮旁，「高」小钮 + title 回显）', () => {
    expect(dq).toMatch(/:title="'耗时树限高档：' \+ profH \+ '（点击循环）'" @click="cycleProfH">高<\/button>/);
  });
  it('531 冻结 CSS 规则字面零触（仍在册=缺省档同值；queryFlat534 锁面保形）', () => {
    expect(dq).toMatch(/\.dq-profile \{ margin-top: var\(--sp-2h\); max-height: max\(240px, 42vh\); overflow-y: auto; border-top: 1px solid var\(--line\); padding-top: var\(--sp-2\); \}/);
  });
});

/* ═══════════ ③ dt.histH（历史列表三档） ═══════════ */

describe('565 件④③：DevToolsView 历史列表 dt.histH 三档', () => {
  it('useTierCycle 三件套：首档=冻结值 max(240px, 42vh)（零漂移）+ 变量注入消费', () => {
    expect(dt).toContain("const HIST_H_TIERS: string[] = ['max(240px, 42vh)', 'max(360px, 56vh)', 'max(480px, 70vh)'];");
    expect(dt).toContain("useTierCycle('dt.histH', HIST_H_TIERS)");
    expect(dt).toMatch(/<div class="dt-hist" v-if="cur\.history\?\.length \|\| histAll\.length" :style="\{ '--dt-hist-h': histH \}">/);
    expect(dt).toMatch(/\.dt-hist-list :deep\(\.qhp-list\) \{ max-height: var\(--dt-hist-h, max\(240px, 42vh\)\); \}/);
  });
  it('历史面板工具行档位钮（并入 .dt-hist-scope 行尾，title 回显）', () => {
    expect(dt).toMatch(/:title="'历史列表限高：' \+ histH \+ '（点击循环）'" @click="cycleHistH">高<\/button>/);
  });
  it('531 冻结 CSS 字面零触（黑名单锁面保形）+ 恒高块纪律不变', () => {
    expect(dt).toContain('.dt-hist-list :deep(.qhp-list) { max-height: max(240px, 42vh); }');
    expect(dt).toMatch(/\.dt-hist \{ border-top: 1px solid var\(--line\); margin-top: var\(--sp-2\); padding-top: var\(--sp-1h\); flex-shrink: 0; \}/);
  });
});
