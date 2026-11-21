/**
 * 1196：ILM 策略卡头的编辑/删除静息隐藏。
 *
 * 实报的「表格/卡片头元素平铺」在 ILM 页的同构形态：每个策略卡头上恒挂着「编辑」「删除」
 * 两颗写操作钮——它们既占位、又与卡片主信息（策略名 / 相位色块）抢注意力，
 * 而这两个动作**早已**在行右键的「策略写操作…」二级菜单里。同一动作两处常驻 = 平铺。
 *
 * 与 1147（列头排序/类型徽标静息隐藏）/ 1189（窄列 ⇅ 不出）同一条纪律：
 * 静息只留信息，操作在悬停/聚焦/选中时显现；触屏无 hover，故 (hover: none) 恒显。
 *
 * 锁：① 包裹层带 .ilm-p-ops 类（CSS 选择器锚）；
 *     ② 静息 opacity:0，hover / focus-within / 选中行三档恢复；
 *     ③ canOps 权限门不动（只读身份根本不渲染这两颗钮）；
 *     ④ 负控：删掉 .ilm-p-ops 类 → ① 转红（样式会打不中）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/IlmView.vue'), 'utf-8');

describe('1196 ILM 卡片头写操作静息隐藏', () => {
  it('按钮包裹层带 .ilm-p-ops 类（样式选择器锚）', () => {
    expect(src).toContain('class="ilm-p-ops"');
  });

  it('静息 opacity:0，hover / focus-within / 选中行 三档恢复', () => {
    expect(src).toMatch(/\.ilm-p-ops \{ opacity: 0;/);
    expect(src).toMatch(/\.ilm-p:hover \.ilm-p-ops, \.ilm-p:focus-within \.ilm-p-ops, \.ilm-p\.on \.ilm-p-ops \{ opacity: 1; \}/);
  });

  it('触屏无 hover → 恒显（不能把写操作在触屏上藏死）', () => {
    expect(src).toMatch(/@media \(hover: none\) \{ \.ilm-p-ops \{ opacity: 1; \} \}/);
  });

  it('canOps 权限门不动（只读身份仍不渲染这两颗钮）', () => {
    expect(src).toContain('<button v-if="canOps" aria-label="编辑策略"');
    expect(src).toContain('<button v-if="canOps" aria-label="删除策略"');
  });

  it('右键菜单仍提供同一组动作（隐藏不等于失去入口）', () => {
    const start = src.indexOf('const ilmMenuItems');
    expect(start).toBeGreaterThan(0);
    /* 终点用函数结束后的下一处顶层声明锚，不用 'const '（回调里也有 const，会提前截断） */
    const end = src.indexOf('function ', start);
    const menu = src.slice(start, end > start ? end : start + 2000);
    expect(menu).toContain("label: '策略写操作…'");
    expect(menu).toContain("label: '编辑策略'");
    expect(menu).toContain("label: '删除策略'");
  });

  it('负控：包裹层不得回退成无类名（样式打不中=假修复）', () => {
    /* 旧形态是 <span style="margin-left:auto;display:flex..."> 裸包裹 */
    expect(src).not.toContain('<span style="margin-left:auto;display:flex;gap:var(--sp-1)" @click.stop>');
  });
});
