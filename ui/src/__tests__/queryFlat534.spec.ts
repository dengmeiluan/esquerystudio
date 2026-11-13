/**
 * 五百三十四批·轨2（工蚁 W2）：DslQueryView 扁平收尾 · 契约备案。
 *
 * ① .dq-profile 卡壳退役（卡中卡根治）——card 档移除，sec-t 行首+上边框分隔；
 *    限高 max(240px, 42vh) 字面冻结（531 口径）。
 * ② .dq-jq 壳框（bg2+border+radius）退役→行内裸排（flex 骨架与输入聚焦描边保留）。
 * ③ .dq-err 去 card 壳——err 红框语义保留（自持 err-line 描边，防误删语义锚）。
 * ④ P1：历史条目补 took（HistItem 扩可选字段 + histRows 直通 QueryHistoryPanel 既有
 *    took 徽标；pushHistory 先记后补口径；旧条目缺省零降级不渲染）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('五百三十四批：dq-profile 卡壳退役（卡中卡根治）', () => {
  it('card 档移除，sec-t 行首+上边框分隔', () => {
    /* 五百六十五批同步更新（击穿者：565 件④② Profile 树限高接 dq.profH 三档）——开标签补
       :style="profStyle"（内联 max-height 覆盖，缺省档=CSS 冻结值同值零漂移） */
    expect(dq).toContain('<div v-if="profileTree" class="dq-profile" :style="profStyle">');
    expect(dq, 'card 档不回流').not.toContain('class="dq-profile card"');
    expect(dq).toContain('<div class="sec-t dq-sec-hd">');
    expect(dq).toMatch(/\.dq-profile \{ margin-top: var\(--sp-2h\); max-height: max\(240px, 42vh\); overflow-y: auto; border-top: 1px solid var\(--line\); padding-top: var\(--sp-2\); \}/);
  });

  it('限高字面冻结（531 口径 42vh 档）+ 关闭钮/retry 语义保留', () => {
    expect(dq).toContain('max-height: max(240px, 42vh)');
    expect(dq).toContain('@click="profileTree = null"');
  });
});

describe('五百三十四批：dq-jq 壳框退役→行内裸排', () => {
  it('bg2/border/radius/padding 移除，flex 骨架与聚焦描边保留', () => {
    expect(dq).toMatch(/\.dq-jq \{\s*\n {2}display: flex; align-items: center; gap: var\(--sp-2\); margin-top: var\(--sp-2\);\s*\n\}/);
    const rule = dq.slice(dq.indexOf('.dq-jq {'), dq.indexOf('}', dq.indexOf('.dq-jq {')));
    expect(rule, '壳底色不回流').not.toContain('background');
    expect(rule, '壳描边不回流').not.toContain('border');
    expect(rule, '壳圆角不回流').not.toContain('border-radius');
    expect(dq, '输入聚焦品牌描边保留').toContain('.dq-jq .inp:focus { outline: none; border-color: var(--ac); box-shadow: 0 0 0 3px var(--ac-soft); }');
    /* filterEscClear379 同源锚：JQ 行占位语义不漂移 */
    expect(dq).toContain('JQ 过滤响应');
  });
});

describe('五百三十四批：dq-err 去 card 壳（err 红框语义保留锚）', () => {
  it('card 档移除，err 红框语义在场（554 同步更新：合并全局 .err-bar 范式）', () => {
    /* 五百五十四批同步更新（击穿者：554 B1 刀②——.dq-err 私造壳+独立标题行退役，合并全局
       .err-bar 范式（theme.css :553）+ errPreHtml/errMeta 双参（XmigrateView :60 先例））：
       锚随字面迁 err-bar 形——err-soft 底+err-line 红框语义由全局 .err-bar 单源承担，
       重试钮与 pre max(240px,42vh) 钳制保留（531 口径冻结面），本例锁「err-bar 合并形在场」 */
    expect(dq).toContain('<div v-if="queryErr" role="alert" class="err-bar dq-err">');
    expect(dq, 'card 档不回流').not.toContain('class="card dq-err"');
    expect(dq, '私造壳描边不回流（err-line 归全局单源）').not.toMatch(/\.dq-err \{[^}]*border/);
    expect(dq, '本页落位差异锚（margin-bottom 归零 + 长文顶对齐 uq-err 先例）').toMatch(/\.dq-err \{ margin-top: var\(--sp-3\); margin-bottom: 0; align-items: flex-start; \}/);
    /* 详情 pre 限高同步更新零改（531 口径冻结面） */
    expect(dq).toMatch(/\.dq-err pre \{[^}]*max-height: max\(240px, 42vh\);/);
    /* 独立标题行同步更新退役（554 刀②）：「查询失败」语义由 role=alert + err-bar 红条承担，
       重试钮为存活语义锚 */
    expect(dq).toMatch(/:disabled="running" @click="runQuery">重试</);
  });
});

describe('五百三十四批 P1：历史条目补 took', () => {
  it('HistItem 扩可选 took + 成功态回填 + histRows 直通（旧条目缺省零降级）', () => {
    expect(dq).toMatch(/interface HistItem \{ dsl: string; ts: number; idx: string; name\?: string; layout\?: Record<string, unknown> \| null; ok\?: boolean; took\?: number \}/);
    expect(dq).toContain('if (h0 && took != null) h0.took = took;');
    /* took 前置字段序：274 批锁字面 `ts: h.ts, ok: h.ok }` 不破 */
    expect(dq).toContain('const histRows = computed(() => history.value.map(h => ({ query: h.dsl, index: h.idx, took: h.took, ts: h.ts, ok: h.ok })));');
    expect(dq).toMatch(/ts: h\.ts, ok: h\.ok \}/);
    /* 274 批红点翻转同步更新零改 */
    expect(dq).toContain("if (h0?.ok === false) { h0.ok = true; writeStoredRaw(localStorage, HIST_KEY, JSON.stringify(history.value)); }");
  });
});
