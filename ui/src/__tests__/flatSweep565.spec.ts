/**
 * 五百六十五批·W4【轨4 扁平化扫荡】件①：MappingView .mp-raw 代码面 border 摘除。
 *
 * 背景：563 批已对 DiagView dg-alloc-pre/dg-hot-pre、PluginsView pl-code、
 * SnapshotsView sv-form-preview 同款摘 border 留 bg+radius（全站代码面语言
 * 「bg+radius 无 border」，df-code/hr-code 先例），MappingView 原始 JSON 弹窗的
 * .mp-raw（pre 代码面，R84 兜底视图）漏网。本件补齐：border:1px solid var(--line)
 * 摘除，bg2 代码面底色 + 圆角保留（原 8px；六百五十四批同步更新：单值 8px 同值合并
 * var(--r-m)，theme.css:97 阶梯等值渲染零变化）；role=button 的可点 affordance
 * 由 cursor:pointer 承担不动（模板零触，纯 CSS 一刀）。
 *
 * 范式照 flatSweep563（静态源码断言，happy-dom 不挂载）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('五百六十五批①：mp-raw 代码面 border 摘除（563 批 dg-alloc-pre/pl-code 同语言收尾）', () => {
  const mp = read('../views/MappingView.vue');

  it('mp-raw：border:1px 不回流；bg2 代码面 + radius 仍在场', () => {
    expect(mp, 'mp-raw border 摘除（border-radius 代码面豁免）').not.toMatch(/\.mp-raw \{[^}]*border: 1px/);
    expect(mp, 'mp-raw bg2 代码面底色保留').toMatch(/\.mp-raw \{[^}]*background: var\(--bg2\);/);
    expect(mp, 'mp-raw 圆角保留（654 批同步更新：8px→var(--r-m) 阶梯等值合并）').toMatch(/\.mp-raw \{[^}]*border-radius: var\(--r-m\);/);
  });
});
