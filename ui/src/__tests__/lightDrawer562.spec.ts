/**
 * 五百六十二批：亮色主题索引列表抽屉不可读根治（用户真机实报「亮色主体看不清了」）。
 *
 * 根因链：557 批摘 .card 壳时注释声称「bg0 直贴」，但 .ih-drawer 实际从未落 background 声明——
 * 面板底色一直透的是 .ih-drawer-mask 的 --mask 半透明（亮色 rgba(15,23,42,.35)）+ blur。
 * 暗色下透出深 mask 侥幸形似「深色面板」；亮色下面板整体被 35% 灰黑罩住，
 * meta 行 --tx2(#76808f) 在灰底上对比度崩 → 用户截图的「灰蒙蒙看不清」。
 *
 * 修复 = .ih-drawer 补 background: var(--bg0)（亮 #ffffff / 暗 #0c1213），兑现 557 批注释语义；
 * 遮罩回归本职（点击关闭 + 层级分隔），不再兼任面板底色。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('562 亮色抽屉不可读根治（.ih-drawer 底色直贴）', () => {
  it('① .ih-drawer 声明含 background: var(--bg0)（面板不再透 mask）', () => {
    const s = read('../views/IndexHubView.vue');
    const m = s.match(/\.ih-drawer \{[^}]*\}/);
    expect(m, '.ih-drawer 规则块在场').toBeTruthy();
    expect(m![0], '面板底色直贴 bg0').toContain('background: var(--bg0)');
  });

  it('② 亮色段 --bg0 为纯白系（不透 mask 的前提是 bg0 亮色=白）', () => {
    const t = read('../theme.css');
    const light = t.match(/:root\[data-theme="light"\] \{[\s\S]*?\n\}/);
    expect(light, '亮色变量段在场').toBeTruthy();
    expect(light![0]).toMatch(/--bg0:\s*#(f|e)/);
  });

  it('③ 遮罩保留点击关闭语义（v-if listOpen + @click.self）——底色修复不改变开合行为', () => {
    const s = read('../views/IndexHubView.vue');
    expect(s).toMatch(/v-if="listOpen" class="ih-drawer-mask" @click\.self="listOpen = false"/);
    expect(s).toContain('.ih-drawer-mask { position: fixed');
  });
});
