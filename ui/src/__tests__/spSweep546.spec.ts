/* 五百四十六批 W5(轨5):三处残量收口防回潮反锁——
 * ① TaskTreeView:30 模板内联骨架 gap:10px → var(--sp-2h)(全站最后一处精确等值 --sp 残量;
 *    档表 theme.css:103 --sp-2h=10px,纯等值;ilmEmpty307 锚同步更新为双形态);
 * ② AliasesView .alv-groups minmax(400px,1fr) → minmax(min(400px,100%),1fr)
 *    (375px 手机实锤横向溢出唯一修复;照 AnalysisSettingsView 531 批 min() 同款先例;
 *    auto-fill 网格嵌套 min() 合法,900 档不动——min() 本身即响应式钳制);
 * ③ theme.css 全局兜底 b { font-weight: 650; }(themeDiscipline525 约定 650 上限,
 *    全站 105 处裸 <b> 默认 bold≈700 越线,一行兜底全站收口,与 545 批 CSS 700→650 同语言;
 *    组件局部显式规则特异性更高不受影响,themeDiscipline525 五个典型位 650 断言不回退)。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcOf = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');

describe('五百四十六批 W5:--sp 残量收口 + 窄屏溢出钳制 + 裸 b 字重兜底', () => {
  it('TaskTreeView 骨架内联 gap 无裸 10px,var(--sp-2h) 在场', () => {
    const tt = srcOf('views/TaskTreeView.vue');
    expect(tt, '裸 10px gap 应收 var(--sp-2h)(档表等值,--sp 残量清零)').not.toMatch(/gap:10px/);
    expect(tt, '骨架容器 gap 应挂 --sp-2h 档').toMatch(/gap:var\(--sp-2h\)"/);
  });

  it('AliasesView .alv-groups 网格轨道挂 min(400px,100%) 钳制,裸 minmax(400px,1fr) 不回流', () => {
    const alv = srcOf('views/AliasesView.vue');
    expect(alv, '窄屏(375px)溢出钳制:min() 嵌套必须在场').toMatch(
      /\.alv-groups\s*\{[^}]*repeat\(auto-fill,\s*minmax\(min\(400px,\s*100%\),\s*1fr\)\)/,
    );
    expect(alv, '裸 minmax(400px, 1fr) 不许回流').not.toMatch(/minmax\(400px,\s*1fr\)/);
  });

  it('theme.css 全局兜底 b { font-weight: 650 }(裸 <b> 默认 bold≈700 越过 650 上限的收口)', () => {
    const theme = srcOf('theme.css');
    expect(theme, '裸 b 元素必须有全局 650 兜底规则').toMatch(/^\s*b\s*\{[^}]*font-weight:\s*650/m);
  });
});
