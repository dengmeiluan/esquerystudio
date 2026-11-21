/* 五百四十七批 W5（轨5 自适应）：小屏 485/375 兜底补档——裸 px 下限/定宽在极窄视口撑破
 * 容器的实锤收口（范式先例：AliasesView 546 批 minmax(min(400px,100%),1fr) /
 * AnalysisSettingsView 531 批 900 档 minmax(min(320px,100%),1fr)）。
 * 收口 6 处：
 *  ① ClusterSettingsView .cs-filter   min-width:210px → min-width: min(210px,100%)
 *  ② TaskTreeView      .tt-filter     min-width:220px → min-width: min(220px,100%)
 *  ③ ConfigValidatorView .cv-import .inp width:260px → width: min(260px,100%)
 *     （900 档已有 width:100% 覆盖，补 485/375 兜底；.sm-inp 200px 同批同款）
 *  ④ AnalysisSettingsView .as-ii      min-width:200px → min-width: min(200px,100%)
 *  ⑤ MatchMatrixView   .mm-stat-nm    900 档宽度降档 200→140（ellipsis 基线兜底不动）
 *  ⑥ DevToolsView      补 900 档（全站最后一个零 @media 主工作页；538 批豁免三文件
 *     至此只剩 Forbidden/NotFound 静态页）：只加 wrap 换行容许 + min() 钳制。
 *     ⚠高度事故位红线（2.9.115/119）：dt-hist 落位字面 / dt-lint max 88px 冻结，
 *     900 档禁入任何 height/flex 基础值——本 spec 以负向锚自证。
 * 本 spec 全为源码锚（与 responsive900Sweep529 同口径），锁「在场 + 退役」双向防回潮。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcOf = (name: string) => readFileSync(join(__dirname, '..', 'views', `${name}.vue`), 'utf-8');
/* 900 档块提取：规则全为单行，非贪婪到首个行首 `}` 即块尾（块内无行首大括号） */
const block900Of = (src: string) => src.match(/@media \(max-width: 900px\) \{[\s\S]*?\n\}/);

describe('五百四十七批：小屏 485/375 兜底——min(Npx,100%) 钳制在场、裸 px 下限退役', () => {
  it('① ClusterSettingsView .cs-filter：min-width 挂 min(210px,100%)，裸 210px 退役', () => {
    const src = srcOf('ClusterSettingsView');
    expect(src).toMatch(/\.cs-filter \{[^}]*min-width: min\(210px, 100%\); \}/);
    expect(src, '裸 min-width:210px 应已换 min() 钳制').not.toContain('min-width: 210px');
  });

  it('② TaskTreeView .tt-filter：min-width 挂 min(220px,100%)，裸 220px 退役', () => {
    const src = srcOf('TaskTreeView');
    expect(src).toMatch(/\.tt-filter \{[^}]*min-width: min\(220px, 100%\); \}/);
    expect(src, '裸 min-width:220px 应已换 min() 钳制').not.toContain('min-width: 220px');
  });

  it('③ ConfigValidatorView：.cv-import .inp min(260px,100%)、.sm-inp min(200px,100%)，裸定宽退役', () => {
    const src = srcOf('ConfigValidatorView');
    expect(src).toMatch(/\.cv-import \.inp \{ width: min\(260px, 100%\); \}/);
    expect(src).toMatch(/\.sm-inp \{ width: min\(200px, 100%\); \}/);
    expect(src, '裸 width:260px 应已换 min() 钳制').not.toContain('width: 260px');
    expect(src, '裸 width:200px 应已换 min() 钳制').not.toContain('width: 200px');
    /* 既有 900 档 width:100% 覆盖仍在（是 485/375 前置兜底，不替代 900 档） */
    const b900 = block900Of(src);
    expect(b900, 'cv 既有 900 档不得回删').toBeTruthy();
    expect(b900![0]).toContain('.cv-import .inp { width: 100%; }');
  });

  it('④ AnalysisSettingsView .as-ii：随 IndexPicker 退役整删（764 G227 锁同步更新），死类不回潮', () => {
    const src = srcOf('AnalysisSettingsView');
    /* 547 批原锁 .as-ii min(200px,100%) 钳制——IndexPicker 五百二十五批退役后该输入框
       类为伴漏删死规则，七百六十四批 G227 整删（六死规则族）；锁同步更新为负向锚防回潮，
       「裸 min-width:200px 退役」防回潮语义保留 */
    expect(src, '.as-ii 死规则不回潮（模板零引用）').not.toMatch(/\.as-ii\b/);
    expect(src, '裸 min-width:200px 应已换 min() 钳制').not.toContain('min-width: 200px');
  });

  it('⑤ MatchMatrixView .mm-stat-nm：900 档宽度降档 140px（基线 200px + ellipsis 不动）', () => {
    const src = srcOf('MatchMatrixView');
    expect(src).toMatch(/\.mm-stat-nm \{ flex: none; width: 200px;[^}]*text-overflow: ellipsis; white-space: nowrap; \}/);
    const b900 = block900Of(src);
    expect(b900, '900 档在场').toBeTruthy();
    expect(b900![0]).toContain('.mm-stat-nm { width: 140px; }');
  });
});

describe('五百四十七批：DevToolsView 补 900 档（零 @media 主工作页合并，wrap/min 钳制限定）', () => {
  const src = srcOf('DevToolsView');
  const b900 = block900Of(src);

  it('900 档在场且非空；562 单轨约定后 .dt-actions 不得再覆写 wrap + .dt-resp-search min() 钳制锚', () => {
    expect(b900, 'DevToolsView 缺 900 紧凑微调档').toBeTruthy();
    expect(b900![0], '900 档为空壳').toMatch(/\{[^{}]+\}/);
    /* 五百六十二批同步更新（用户实报窄容器堆竖排根治）：wrap 覆写行退役——900 档窄视口下
       单轨横滚依旧优于堆竖排（不挤编辑器高度），flex-shrink 守卫与 min() 钳制保留 */
    expect(b900![0]).not.toContain('.dt-actions { flex-wrap: wrap; }');
    expect(b900![0]).toContain('.dt-actions > * { flex-shrink: 0; }');
    expect(b900![0]).toContain('.dt-resp-search input { width: min(150px, 100%); }');
    /* 557 批锁同步更新：桌面档基线宽同步 min() 钳制（529 扫荡口径合并，900 档覆写与之合流；
       原定宽 150px 字面退役），桌面档 flex-wrap 已有 dt-actions 换行容许，双层钳不引入高度反例 */
    expect(src).toContain('.dt-resp-search input { width: min(150px, 100%);');
  });

  it('负向锚（高度事故红线自证）：900 档内零 height 覆写、dt-hist/dt-lint 冻结面禁入', () => {
    expect(b900![0].split('\n').some(l => /\bheight:/.test(l)),
      '900 档不得覆写任何 height（2.9.115/119 高度链冻结）').toBe(false);
    expect(b900![0]).not.toContain('dt-hist');
    expect(b900![0]).not.toContain('dt-lint');
    expect(b900![0]).not.toContain('dt-out');
  });

  it('focusSurface401 锁定的基线行（562 实报升级：单轨 nowrap+横滚与聚焦钮同行，锁同步更新见 dtInsFieldFix562）', () => {
    /* 五百六十二批同步更新（用户实报窄容器堆竖排）：基线行 wrap 升级单轨（543 lrBarSingleTrack 同刀） */
    expect(src).toMatch(/\.dt-actions \{ display: flex; gap: var\(--sp-1h\); align-items: center; flex-wrap: nowrap; overflow-x: auto; min-width: 0; flex: 1 1 0; \}/);
    expect(src).toMatch(/\.dt-actions > \* \{ white-space: nowrap; flex-shrink: 0; \}/);
  });
});
