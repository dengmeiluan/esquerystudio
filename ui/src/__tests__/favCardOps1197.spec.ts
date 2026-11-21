/**
 * 1197：收藏卡片行内「复制 / 删除」静息隐藏。
 *
 * 与 1196（ILM 卡头）同一个病：这两个动作**早已**在卡片右键的二级菜单里
 * （「复制…」/「删除…」），却又在每张卡的按钮组里常驻一份——
 * 同一动作两处常驻就是平铺，还和「打开」（主行动）抢注意力。
 *
 * 锁：① 主行动「打开」仍常驻（不能被一起藏掉）；
 *     ② 次级动作包在 .fv-card-ops 里，静息 opacity:0；
 *     ③ 悬停 / 键盘聚焦 / 已勾选 三档显现；触屏 (hover:none) 恒显；
 *     ④ 负控：去掉 .fv-card-ops 包裹类或 opacity 规则 → 对应用例转红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/FavoritesView.vue'), 'utf-8');

describe('1197 收藏卡片次级动作静息隐藏', () => {
  it('「打开」仍在包裹层外常驻（主行动不藏）', () => {
    const row = src.slice(src.indexOf('class="fv-card-r"'), src.indexOf('class="fv-card-ops"'));
    expect(row).toContain('打开');
  });

  it('次级动作包在 .fv-card-ops 里', () => {
    expect(src).toContain('class="fv-card-ops"');
    expect(src).toMatch(/\.fv-card-ops \{ display: inline-flex; gap: var\(--sp-2\); opacity: 0;/);
  });

  it('悬停 / focus-within / 已勾选 三档显现', () => {
    expect(src).toMatch(/\.fv-card:hover \.fv-card-ops, \.fv-card:focus-within \.fv-card-ops, \.fv-card\.fv-sel \.fv-card-ops \{ opacity: 1; \}/);
  });

  it('触屏恒显（触屏没有 hover，靠勾选和右键也说得通，但不能藏死）', () => {
    expect(src).toMatch(/@media \(hover: none\) \{ \.fv-card-ops \{ opacity: 1; \} \}/);
  });

  it('右键菜单仍提供同一组动作（隐藏不等于失去入口）', () => {
    const start = src.indexOf('const favMenuItems');
    expect(start).toBeGreaterThan(0);
    const menu = src.slice(start, src.indexOf('/* 空态导航与重放同门', start));
    expect(menu).toContain("label: '复制…'");
    expect(menu).toContain("label: '删除…'");
    expect(menu).toContain("key: 'copy-payload'");
    expect(menu).toContain("key: 'del-one'");
  });

  it('负控：卡片行内不得再出现裸的两颗次级钮（旧形态）', () => {
    expect(src).not.toContain('<button class="btn ghost sm" @click="copyPayload(it)"><Copy :size="12" /> 复制</button>\n          <button aria-label="删除这条收藏（仅本地数据）"');
  });
});
