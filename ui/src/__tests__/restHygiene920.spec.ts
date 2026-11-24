/**
 * 920 批（轨6 走查批 RestView）：样式卫生双锚——
 * ① .rt-hist-btn 三连钮（收藏/历史/我的权限）共挂 margin-left:auto——flexbox
 *   多 auto margin 均分剩余空间，三钮等距散列不成组（1600 档实测各
 *   175px/间距 181px）。锁「组头推右+邻成员收紧」形态：auto 只打组头，
 *   相邻成员 margin 归零，动作组成组贴右。
 * ② .j-mark-cur 的 color 走 var(--bg0)（页面底色 token）——语义错位：
 *   「彩底深字」家族口径是 --tx-on-strong（theme.css mark 基线注释与
 *   DslQueryView 同规则位同口径），bg0 是应用底 token 随主题漂移会带偏
 *   命中前景色。锁对齐 --tx-on-strong。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/RestView.vue'), 'utf-8');

describe('RestView 样式卫生（920 批）', () => {
  it('rt-hist-btn 动作组成组贴右：组头 auto 推右，邻成员不再吸收空白', () => {
    expect(src).toMatch(/\.rt-hist-btn \{ margin-left: auto; \}/);
    expect(src).toMatch(/\.rt-hist-btn \+ \.rt-hist-btn \{ margin-left: 0; \}/);
  });

  it('j-mark-cur 前景色走 tx-on-strong 语义档（禁 bg0 底色 token）', () => {
    expect(src).toMatch(/\.json-view :deep\(\.j-mark-cur\) \{[^}]*color: var\(--tx-on-strong\);/);
    expect(src).not.toMatch(/\.j-mark-cur[^\{]*\{[^}]*color: var\(--bg0\);/);
  });

  it('j-mark-cur 规则带 .json-view 前缀且置于 .j-mark 之后（压过 color:inherit 的源序前提）', () => {
    expect(src.match(/:deep\(\.j-mark-cur\)/g)?.length).toBe(1);
    const jMark = src.indexOf('.json-view :deep(.j-mark) {');
    const jCur = src.indexOf('.json-view :deep(.j-mark-cur) {');
    expect(jMark).toBeGreaterThan(-1);
    expect(jCur).toBeGreaterThan(jMark);
  });
});
