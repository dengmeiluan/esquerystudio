/**
 * 六百六十八批：DevTools edFont 字号档真机缺角修复 + DQ/IH 铺开（⑥667 候选②落地）。
 *
 * 还原备案（667-C1 纪律）：「565 砍件」转述代号在 565 提交信息与旧任务书 565 时点
 * 版本中零命中=无备案本体（603-C1/651 件D 先例）——可考源头=560 批「DevTools 字号档
 * dt.font 三 seg」约定。开工侦察实锤真缺陷：MonacoEditor 响应链只有
 * modelValue/readonly/language/theme 四 watch，无 fontSize watch（560 探针 F 段只断言
 * seg UI 在场+钮文案，从未验证渲染字号）→ 档位点击后 Monaco 渲染字号不变，仅挂载
 * 初值（偏好还原）生效。=响应缺角修复（watch fontSize→updateOptions，readOnly
 * watch 同款范式）+字号档铺 DQ（dq.font）/IH（ih.font）双主编辑面。
 *
 * 锁面：视图源锚（usePref 键/seg 标记/:font-size 接线）+JsonArea 薄透传契约
 * （533 analyzers/660 terms 同款可选 prop 先例，缺席=内层缺省档零增量）+
 * editorTiers 单源合并（DevTools 本地 ED_FONT_TIERS 常量退役，轨4 同场景同单源）。
 * 同步更新双锁（随实现同批翻转）：track2Wave560-exec ED_FONT_TIERS 字面→单源消费形态、
 * indexHubQueryTab IH editorTiers import 行扩 EDITOR_FONT_TIERS。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

const monacoSrc = read('components/MonacoEditor.vue');
const tiersSrc = read('utils/editorTiers.ts');
const dt = read('views/DevToolsView.vue');
const dq = read('views/DslQueryView.vue');
const ih = read('views/IndexHubView.vue');
const ja = read('components/JsonArea.vue');

describe('668 A：MonacoEditor 字号响应缺角修复（560 真缺陷本体）', () => {
  it('A1 fontSize watch→updateOptions（readOnly watch 同款范式）', () => {
    expect(monacoSrc)
      .toContain('watch(() => props.fontSize, (v) => editor?.updateOptions({ fontSize: v }));');
  });
  it('A2 既有四 watch 响应链零触（readOnly 同款锚防过收）', () => {
    expect(monacoSrc).toContain('watch(() => props.readonly, (v) => editor?.updateOptions({ readOnly: v }));');
    expect(monacoSrc).toContain('fontSize: props.fontSize,');
  });
});

describe('668 B：editorTiers 字号档单源合并（轨4 同场景同单源）', () => {
  it('B1 EDITOR_FONT_TIERS 三档常量出 utils/editorTiers 单源', () => {
    expect(tiersSrc).toContain('export const EDITOR_FONT_TIERS: number[] = [12.5, 14, 16];');
  });
  it('B2 DevTools 消费共享常量（import+模板 v-for 双锚）', () => {
    expect(dt).toContain("import { EDITOR_FONT_TIERS } from '../utils/editorTiers';");
    expect(dt).toContain('v-for="f in EDITOR_FONT_TIERS"');
  });
  it('B3 DevTools 本地常量退役负锚（字面退役不残留）', () => {
    expect(dt).not.toMatch(/ED_FONT_TIERS(\s*:\s*number\[\])?\s*=\s*\[12\.5, 14, 16\]/);
    expect(dt).not.toContain('const ED_FONT_TIERS');
  });
});

describe('668 C：DevTools 既有字号档面同步更新复核（560 约定面零触）', () => {
  it("C1 usePref('dt.font', 12.5) 与 :font-size 双面接线原样", () => {
    expect(dt).toContain("usePref<number>('dt.font', 12.5)");
    expect((dt.match(/:font-size="edFont"/g) ?? []).length).toBe(2);
  });
  it('C2 seg 消费形态保留（on 态+title 文案）', () => {
    expect(dt).toContain('edFont === f');
    expect(dt).toContain(":title=\"'编辑器字号 ' + f + 'px'\"");
  });
});

describe('668 D：DQ 主编辑器铺开（dq.font）', () => {
  it("D1 usePref('dq.font', 12.5) 在场", () => {
    expect(dq).toContain("usePref<number>('dq.font', 12.5)");
  });
  it('D2 主 DSL 编辑器接线（dslAssist 邻位 :font-size）', () => {
    expect(dq).toMatch(/:dsl-assist="dslAssist"[\s\S]{0,120}?:font-size="dqFont"/);
  });
  it('D3 执行行字号 seg（.dq-font-seg+aria+on 态+共享常量 v-for）', () => {
    expect(dq).toContain('class="seg dq-font-seg"');
    expect(dq).toContain('aria-label="编辑器字号档"');
    expect(dq).toContain('dqFont === f');
    expect(dq).toContain('v-for="f in EDITOR_FONT_TIERS"');
  });
  it('D4 DQ import 合并共享常量（editorTiers 单源）', () => {
    expect(dq).toContain("import { EDITOR_H_TIERS, EDITOR_FONT_TIERS, type EditorHKey } from '../utils/editorTiers';");
  });
  it('D5 seg 尺寸锚（scoped CSS dt-font-seg 同形）', () => {
    expect(dq).toContain('.dq-font-seg { flex-shrink: 0; }');
    expect(dq).toMatch(/\.dq-font-seg button \{ padding: 0 var\(--sp-1h\); font-size: var\(--fs-xs\); line-height: 1\.8; \}/);
  });
});

describe('668 E：IH 查询 tab 编辑器铺开（ih.font）', () => {
  it("E1 usePref('ih.font', 12.5) 在场", () => {
    expect(ih).toContain("usePref<number>('ih.font', 12.5)");
  });
  it('E2 JsonArea dslJaRef 接线（前缀锁保形+尾追加实证）', () => {
    expect(ih).toContain('<JsonArea ref="dslJaRef" v-model="dsl" fill :dsl-assist="ihDslAssist"');
    expect(ih).toMatch(/<JsonArea ref="dslJaRef"[^>]*:font-size="ihFont"/);
  });
  it('E3 工具行字号 seg（.ih-font-seg+aria+on 态+共享常量 v-for）', () => {
    expect(ih).toContain('class="seg ih-font-seg"');
    expect(ih).toContain('aria-label="编辑器字号档"');
    expect(ih).toContain('ihFont === f');
    expect(ih).toContain('v-for="f in EDITOR_FONT_TIERS"');
  });
  it('E4 IH import 行扩员（同步更新 indexHubQueryTab ⑤ 锁同字面）', () => {
    expect(ih).toContain("import { EDITOR_HEIGHTS, EDITOR_H_TIERS, EDITOR_FONT_TIERS, type EditorHKey } from '../utils/editorTiers';");
  });
  it('E5 seg 尺寸锚（scoped CSS dt-font-seg 同形）', () => {
    expect(ih).toContain('.ih-font-seg { flex-shrink: 0; }');
    expect(ih).toMatch(/\.ih-font-seg button \{ padding: 0 var\(--sp-1h\); font-size: var\(--fs-xs\); line-height: 1\.8; \}/);
  });
});

describe('668 F：JsonArea 字号薄透传契约（533 analyzers/660 terms 同款可选 prop）', () => {
  it('F1 可选 prop+内层 Monaco 透传双锚', () => {
    expect(ja).toContain('fontSize?: number;');
    expect(ja).toContain(':font-size="fontSize"');
  });
  it('F2 缺席零增量：无缺省值注入（内层 withDefaults 12.5 承接）+透传仅两处字面', () => {
    expect((ja.match(/fontSize/g) ?? []).length).toBe(2);
    expect(ja).not.toMatch(/fontSize\s*[:=]\s*12\.5/);
  });
});
