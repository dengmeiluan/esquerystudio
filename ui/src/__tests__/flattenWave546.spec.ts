/**
 * 五百四十六批·轨4（工蚁 W4）：全站扁平化扫荡第六波 · 契约备案。
 *
 * 仿 flattenWave545/544 静态源码断言范式（happy-dom 不挂载）：
 * ① PluginsView pl-card ×2 壳三件套退役 → border-top 分节（545 lc-panel/pl-panel 同语言；
 *    内分界由 pl-card-hd 既有 border-bottom 承接——545 as/cv/md 三视图先例）；pl-matrix
 *    矩阵裸表与 raw QRT 零触（545 ⑥豁免在册，随行复核防误伤）。
 * ② AnalyzerLabView al-card ×3 壳三件套退役 → border-top 分节（al-card-hd 既有
 *    border-bottom 承接）；al-fld-err（:41）err 语义变体豁免保留——err 行内错误条非卡面，
 *    摘 al-card 类保原形（hr-hero 545 同判：语义边框/语义色是保留面）；**:49 空态卡整块
 *    空框纠正**——538 约定「空态不留整块空框」，EmptyState 直贴不再包 al-card 容器；
 *    al-lane 对比列卡豁免正锁（lane 是工作台功能卡非分节壳，545 ra-card 先例同域）。
 * ③ BrowserView 表外 .card 壳（style="padding:0;overflow:hidden" 包 QRT）退役 → 538
 *    SystemView .sy-res 同语言 border-top 分节（bw 承接类 bw-res；QRT 本就全出血）；
 *    弹窗/悬浮卡（pl-mo-b/bw-linked-doc）等对话框语义壳豁免不在扫荡域。
 *
 * 范围铁律：纯 CSS chrome 退役 + 空态容器纠正——模板结构/高度链（max-height/height 定行）
 * 零变动；分节形逐字锁（与 545 lc-panel 形态同源）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* ═══════════ ① PluginsView pl-card ×2 壳退役 → border-top 分节 ═══════════ */

describe('五百四十六批①：pl-card 壳三件套退役（545 lc-panel 同语言 border-top 分节）', () => {
  it('pl-card：bg/通栏 border/圆角不回流；border-top 分节形逐字在场', () => {
    const pl = read('../views/PluginsView.vue');
    expect(pl, 'pl-card 底色壳不回流').not.toMatch(/\.pl-card \{[^}]*background/);
    expect(pl, 'pl-card 通栏 border 不回流（仅 border-top 分界）').not.toMatch(/\.pl-card \{[^}]*border[^-]/);
    expect(pl, 'pl-card 圆角壳不回流').not.toMatch(/\.pl-card \{[^}]*border-radius/);
    expect(pl, 'lc-panel 545 同款分节形逐字在场（margin 间距载体保留）')
      .toMatch(/\.pl-card \{ border-top: 1px solid var\(--line\); padding-top: var\(--sp-2\); margin-bottom: var\(--sp-3\); \}/);
    expect((pl.match(/class="pl-card"/g) || []).length, '两处分节消费（矩阵卡/原始记录卡）').toBe(2);
  });

  it('pl-card-hd 既有 border-bottom 承接内分界（545 as/cv/md 先例：不消义）；溢出裁剪壳随圆角退役', () => {
    const pl = read('../views/PluginsView.vue');
    expect(pl, '卡头分界线在场（hd 自带，无需补）')
      .toMatch(/\.pl-card-hd \{[^}]*border-bottom: 1px solid var\(--border\);/);
    expect(pl, 'pl-card overflow:hidden 裁剪壳退役（圆角没了无裁剪对象）')
      .not.toMatch(/\.pl-card \{[^}]*overflow/);
  });

  it('五百六十一批同步更新：pl-matrix 豁免修订——矩阵表亦换 QRT rows 型（双表双 storageKey）；指南弹窗壳豁免', () => {
    const pl = read('../views/PluginsView.vue');
    expect(pl, '矩阵表换 QRT rows 型（545 豁免修订：cols=nodeNames 直映射可表达）').toContain('storage-key="plugins:matrix"');
    expect(pl, 'raw 记录表仍寄居 QRT 内核（ref 随宿主导出退役，负锁翻正锁）').toContain('storage-key="plugins:raw"');
    expect(pl, 'pl-matrix-wrap 滚动容器退役（60vh 高度链经 max-height prop 传内核）')
      .not.toContain('.pl-matrix-wrap');
    expect(pl, '指南弹窗 .pl-mo-b 壳豁免（模态对话框非页面分节）')
      .toMatch(/\.pl-mo-b \{[^}]*background: var\(--card-bg\);/);
  });
});

/* ═══════════ ② AnalyzerLabView al-card ×3 壳退役 + 空态空框纠正 ═══════════ */

describe('五百四十六批②：al-card 壳三件套退役；al-fld-err 豁免；空态无空框', () => {
  it('al-card：bg/通栏 border/圆角不回流；border-top 分节形逐字在场（×2 消费）', () => {
    const al = read('../views/AnalyzerLabView.vue');
    expect(al, 'al-card 底色壳不回流').not.toMatch(/\.al-card \{[^}]*background/);
    expect(al, 'al-card 通栏 border 不回流（仅 border-top 分界）').not.toMatch(/\.al-card \{[^}]*border[^-]/);
    expect(al, 'al-card 圆角壳不回流（原 8px 裸值随壳退役）').not.toMatch(/\.al-card \{[^}]*border-radius/);
    expect(al, '545 lc-panel 同款分节形逐字在场（margin 间距载体保留）')
      .toMatch(/\.al-card \{ border-top: 1px solid var\(--line\); padding-top: var\(--sp-2\); margin-bottom: var\(--sp-3\); \}/);
    expect((al.match(/class="al-card"/g) || []).length, '两处分节消费（字段清单卡/待分词文本卡）').toBe(2);
    expect(al, 'al-card-hd 既有 border-bottom 承接内分界')
      .toMatch(/\.al-card-hd \{[^}]*border-bottom: 1px solid var\(--border\);/);
  });

  it('al-fld-err err 语义变体豁免保留：摘 al-card 类保原形（err 行内错误条非卡面）', () => {
    const al = read('../views/AnalyzerLabView.vue');
    expect(al, 'err 变体摘卡类（不再吃分节形/不吃壳）').toMatch(/class="al-fld-err"/);
    expect(al, 'al-card al-fld-err 双类组合退役').not.toMatch(/class="al-card al-fld-err"/);
    expect(al, 'err 行内错误条原规则逐字保留（豁免=保留面）')
      .toMatch(/\.al-fld-err \{ padding: var\(--sp-2h\) var\(--sp-3\); display: flex; align-items: center; gap: var\(--sp-2h\); font-size: var\(--fs-xs\); color: var\(--err\); \}/);
  });

  it('空态卡整块空框纠正（538 约定「空态不留整块空框」）：EmptyState 直贴，无 al-card 包壳', () => {
    const al = read('../views/AnalyzerLabView.vue');
    expect(al, '字段清单空态 EmptyState 直贴').toMatch(/<EmptyState v-else compact/);
    expect(al, '空态不再包 al-card 容器（整块空框纠正）').not.toMatch(/<div v-else class="al-card">/);
    expect(al, '空态文案与指引保留').toContain('暂无字段清单');
    expect(al).toContain('填写索引后点「加载 text 字段」');
  });

  it('al-lane 容器壳退役正锁（558 击穿同步更新：546 豁免先例合并，border-top 分节承接）', () => {
    const al = read('../views/AnalyzerLabView.vue');
    /* 五百五十八批同步更新（击穿者：558 工蚁G——al-lane 容器壳（border+card-bg+radius）退役
       → border-top 分节承接，约定④）：546 豁免正锁字面改退役形 + 分节锚在场
       （锁意图=壳形态回归防线；消费面 token 胶囊区零语义变动） */
    expect(al, 'lane 壳三件套不回流（558 退役）')
      .not.toMatch(/\.al-lane \{[^}]*background: var\(--card-bg\)/);
    expect(al, 'al-lane border-top 分节承接（558）')
      .toMatch(/\.al-lane \{ border-top: 1px solid var\(--border\); overflow: hidden; display: flex; flex-direction: column; \}/);
  });
});

/* ═══════════ ③ BrowserView 表外 .card 壳退役 → .sy-res 同语言 ═══════════ */

describe('五百四十六批③：BrowserView 表外 .card 壳退役（538 SystemView .sy-res 同语言）', () => {
  it('全局 .card 壳退役；bw-res border-top 分节逐字在场；QRT 与空态仍在分节内', () => {
    const bw = read('../views/BrowserView.vue');
    expect(bw, '表外 .card 壳退役（含 padding:0/overflow:hidden 内联）').not.toMatch(/<div class="card"/);
    expect(bw, '.sy-res 538 同款分节形逐字在场').toMatch(/\.bw-res \{ border-top: 1px solid var\(--border\); \}/);
    const secAt = bw.indexOf('<div class="bw-res">');
    expect(secAt, 'bw-res 分节容器在场').toBeGreaterThan(-1);
    const qrtAt = bw.indexOf('<QueryResultTable');
    expect(qrtAt, 'QRT 在分节内').toBeGreaterThan(secAt);
    expect(bw.indexOf('未获取到索引'), '末位空态仍在分节内（QRT 之后）').toBeGreaterThan(qrtAt);
    expect(bw.indexOf('class="bw-foot'), '分节在计数行之前闭合').toBeGreaterThan(bw.indexOf('未获取到索引'));
  });

  it('悬浮文档详情卡豁免（悬浮卡对话框语义非页面分节壳）；bw 高度链零触', () => {
    const bw = read('../views/BrowserView.vue');
    expect(bw, 'bw-linked-doc 悬浮卡壳豁免').toMatch(/\.bw-linked-doc \{[^}]*border: 1px solid var\(--line-strong\);/);
    expect(bw, 'QRT max-height 定行字面零触（高度链铁律）')
      .toMatch(/max-height="calc\(100vh - var\(--vh-offset\) \+ 38px\)"/);
  });
});
