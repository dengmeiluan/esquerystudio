/**
 * 1384：索引工作台「文档 · 表格」档撑满剩余高度。
 *
 * 实测缺口（1440×900，真实浏览器）：
 *   .ih-tab-body 高 497，而 .rt-wrap 只有 240 —— 下方留 248px 空白。
 *   链路：.ih-ws / .ih-tab-body 是 block 流（不吃 flex），
 *         FocusableSurface 的 `.fs-body > *` 又是 flex:0 0 auto，
 *   于是表格停在自己的 max-height 上，永远不向上撑。
 *   这正是用户反复说的「默认可视表格特别窄，下面还有那么多空间」。
 *
 * 修法约束（同样重要）：
 *   · 只对「文档 tab + 表格视图」生效——settings/mapping/shards/ops/query 各 tab
 *     与 JSON/Tree 视图的高度语义（各自档位、内容自适应）一律不动；
 *   · 必须同时给 .ih-ws 与 .ih-tab-body 开 flex，否则中间一层仍是 block，撑不满。
 *
 * 负控：
 *  ① 去掉 ih-fill 绑定 → 修饰类断言必红；
 *  ② 若只给 ih-tab-body 开 flex 而不给 .ih-ws → 链断，③ 的链完整性断言必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

describe('1384 文档表格档撑满', () => {
  it('① 修饰类只绑在「文档 tab + 表格视图」', () => {
    /* 两处绑定（.ih-ws 与 .ih-tab-body）都必须是同一条件 */
    const binds = [...src.matchAll(/'ih(?:-ws)?-fill':\s*([^}]+)\}/g)].map(m => m[1].trim());
    expect(binds.length, `应有两处 ih-fill 绑定，实际 ${binds.length}`).toBe(2);
    for (const b of binds) {
      expect(b, `绑定条件不对：${b}`).toMatch(/tab === 'docs'/);
      expect(b, `绑定条件不对：${b}`).toMatch(/docsView === 'table'/);
    }
  });

  it('② 链上每一层都被打开（只开 tab-body 会断在 .ih-ws）', () => {
    expect(src, '.ih-ws 必须也能吃 flex').toMatch(/\.ih-ws\.ih-ws-fill[^{]*\{[^}]*display:\s*flex/);
    expect(src, '.ih-tab-body 必须也能吃 flex').toMatch(/\.ih-tab-body\.ih-fill[^{]*\{[^}]*display:\s*flex/);
    /* FocusableSurface 的 .fs-body > * 是 flex:0 0 auto，必须显式覆盖到 .rt */
    expect(src, '必须覆盖 .fs 的 flex 分配').toMatch(/\.ih-tab-body\.ih-fill > \.fs\s*\{[^}]*flex:\s*1 1 auto/);
    expect(src, '必须覆盖 .rt 的 flex 分配').toMatch(/\.ih-tab-body\.ih-fill > \.fs > \.fs-body > \.rt\s*\{[^}]*flex:\s*1 1 auto/);
  });

  it('③ 负控：其他 tab 不得被同一规则波及（选择器必须带 .ih-fill 限定）', () => {
    /* 找所有给 .ih-tab-body 设 display:flex 的规则：必须都带 .ih-fill */
    const rules = [...src.matchAll(/\.ih-tab-body([^{]*)\{([^}]*display:\s*flex[^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r[1], `未限定的 .ih-tab-body 规则会波及 settings/mapping 等 tab：${r[0].slice(0, 60)}`)
        .toMatch(/\.ih-fill/);
    }
  });
});
