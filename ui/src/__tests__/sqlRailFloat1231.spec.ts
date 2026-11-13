/**
 * 1231：SQL 控制台「模板栏改浮层」——修「编辑器与结果表右缘不齐」。
 *
 * 现场（1440×900 真浏览器实测）：模板栏原是 grid 第二列（300px），展开时
 * 编辑器右缘 **1088**，而结果区 `.sq-sec.wide` 横跨两列到 **1400** —— 上下差 312px，
 * 用户实报「表格能力不对齐」。收起模板栏后两者都是 1400 完全对齐，
 * 说明错位只在模板栏展开时发生。
 * 另测：**并不存在真实遮挡**——模板栏纵向 207→440、表格工具行 551→592，垂直不相交。
 *
 * 改法（用户选定「模板栏改浮层，编辑器始终满宽」）：
 *  · `.sq-grid` 恒单列 → 编辑器与结果区右缘都到 1400，**展开/收起都对齐**；
 *  · `.sq-samples` 绝对定位浮在编辑器右上，不占栅格；
 *  · 浮层 `top:38px` 让开卡头——第一版贴 `top:0` 时**把 fetch_size/time_zone/page_timeout
 *    压住了**（截图里 page_timeout 被切成 "page_time"）。改后实测卡头 7 个控件零覆盖。
 *  · 浮层会盖住编辑器内容约 23%，所以必须能随手关：点外部 / Esc 收起（toggle 钮自身与
 *    浮层内点击不算外部）。浏览器三证：点内部仍开、点外部关、Esc 关。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

describe('1231 SQL 控制台模板栏浮层化', () => {
  it('grid 恒单列（编辑器与结果区同宽，不再被模板栏挤窄）', () => {
    expect(src).toMatch(/\.sq-grid \{ display: grid; grid-template-columns: minmax\(0, 1fr\); /);
    /* 不得再有「1fr + rail 两列」的写法 */
    expect(src).not.toMatch(/grid-template-columns: minmax\(0, 1fr\) var\(--sq-rail-w/);
  });

  it('模板栏是绝对定位浮层，且让开卡头（不压 fetch_size/time_zone/page_timeout）', () => {
    /* 规则块中间有注释，先剥注释再匹配，避免把"注释存在"当成"规则不存在" */
    const css = src.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/\.sq-samples \{[^}]*position: absolute;\s*top: 38px;\s*right: 0;\s*z-index: 5;/);
    /* 浮层限高内滚，避免长模板列表溢出编辑器 */
    expect(css).toMatch(/max-height: min\(420px, calc\(34vh - 50px\)\);\s*overflow-y: auto;/);
  });

  it('浮层可随手关：点外部 / Esc（toggle 钮与浮层内不算外部）', () => {
    expect(src).toContain("document.addEventListener('mousedown', onDocDownForRail, true);");
    expect(src).toContain("if (samplesEl.value?.contains(t)) return;");
    expect(src).toContain("if (toggleEl.value?.contains(t)) return;");
    expect(src).toContain("if (e.key === 'Escape') railOpen.value = false;");
    /* 收起即摘监听（不留常驻全局监听） */
    expect(src).toContain("document.removeEventListener('mousedown', onDocDownForRail, true);");
  });

  it('ref 真的绑在模板与 toggle 上（否则外部判定恒失效）', () => {
    expect(src).toContain('ref="samplesEl" class="sq-samples"');
    expect(src).toContain('ref="toggleEl" class="btn ghost xs" data-sq-rail-toggle');
  });
});
