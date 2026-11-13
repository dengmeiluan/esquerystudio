/**
 * 五百四十七批·轨4（工蚁）：任务 3 master-detail pane 壳治理 · 契约备案。
 *
 * 535 SqlBridge 三 pane「pane 即容器内容直贴」约定续扫：六 pane 三件套（border+bg+radius）退役，
 * 布局语义（flex/overflow）与 .card padding 载体原样迁入无壳类（内容边距零变动，高度链零触）：
 *   IlmView ilm-list/ilm-detail、TemplatesView tv2-list/tv2-editor、SnapshotsView sv-list、
 *   TasksView tv-tree-card、MappingView mp-fields。
 * 顺带 TemplatesView .tv2-input min-width:200px → min(200px,100%)（529 带兜底范式）。
 *
 * ⚠ 豁免裁决（写进本 spec 防回流）：
 *  - AliasesView .alv-panel **全豁免不动**：写操作面板是功能卡非 master-detail 分节壳，
 *    且带 ac-line 语义边框（「线框纪律」注释自证语义属性）——544 sq-alert/sq-warn 语义卡
 *    「完整壳视觉零变化」豁免与 546 al-lane「工作台功能卡非分节壳」先例同域。
 *    备选案（只去 bg/radius 保语义边框）否决：摘 .card 类后 border-color 覆盖失去基线，
 *    需整圈 border 重写，动壳面积大于收益，且写面板仅按需出现（非常驻分节）。
 *  - 在场不动正锁（防误退/防回流）：AdhocRebuildView 六步卡、OverviewView 仪表卡、
 *    SecurityView 功能卡、DiagView 观测卡、WatcherView wt-card、TopologyView tp-canvas/tp-palette、
 *    IndexHubView ih-card-flush。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* 卡壳三件套不回流断言（局部类规则内不得再挂 bg/通栏 border/圆角） */
const noShell = (src: string, cls: string, label: string) => {
  const m = src.match(new RegExp(String.raw`\.${cls} \{([^}]*)\}`));
  expect(m, `${label} 规则在场`).toBeTruthy();
  const body = m![1];
  expect(body, `${label} 底色壳不回流`).not.toMatch(/background/);
  expect(body, `${label} 通栏 border 不回流`).not.toMatch(/(^|[^-])border:/);
  expect(body, `${label} 圆角壳不回流`).not.toMatch(/border-radius/);
};

describe('五百四十七批：六 pane 三件套退役（535 SqlBridge pane 直贴约定续扫）', () => {
  it('IlmView ilm-list/ilm-detail 摘卡：模板类退役 + 布局/padding 载体原样迁入', () => {
    const ilm = read('../views/IlmView.vue');
    expect(ilm, 'ilm-list 摘卡').not.toMatch(/class="card ilm-list"/);
    expect(ilm, 'ilm-detail 摘卡').not.toMatch(/class="card ilm-detail"/);
    expect(ilm, '布局语义原样（flex/overflow 载体迁入无壳类）')
      .toMatch(/\.ilm-list \{ display: flex; flex-direction: column; overflow: hidden; padding: 14px var\(--sp-4\); \}/);
    expect(ilm, 'ilm-detail 布局语义原样').toMatch(/\.ilm-detail \{ overflow: auto; padding: 14px var\(--sp-4\); \}/);
    noShell(ilm, 'ilm-list', 'ilm-list');
    noShell(ilm, 'ilm-detail', 'ilm-detail');
  });

  it('TemplatesView tv2-list/tv2-editor 摘卡；tv2-input min(200px,100%) 钳制', () => {
    const tpl = read('../views/TemplatesView.vue');
    expect(tpl, 'tv2-list 摘卡').not.toMatch(/class="card tv2-list"/);
    expect(tpl, 'tv2-editor 摘卡').not.toMatch(/class="card tv2-editor"/);
    expect(tpl, 'tv2-list 布局语义原样')
      .toMatch(/\.tv2-list \{ display: flex; flex-direction: column; overflow: hidden; padding: 14px var\(--sp-4\); \}/);
    expect(tpl, 'tv2-editor 布局语义原样')
      .toMatch(/\.tv2-editor \{ display: flex; flex-direction: column; overflow: hidden; padding: 14px var\(--sp-4\); \}/);
    noShell(tpl, 'tv2-list', 'tv2-list');
    noShell(tpl, 'tv2-editor', 'tv2-editor');
    /* responsive524SplitAndEmpty 的 900 档 height 面不受影响（零触正锁） */
    expect(tpl, 'tv2-editor 900 档 vh 弹性档零触').toMatch(/\.tv2-editor \{ height: max\(480px, 42vh\); \}/);
    expect(tpl, '裸 min-width:200px 不回流').not.toMatch(/min-width: 200px/);
    expect(tpl, 'min() 钳制在场').toMatch(/min-width: min\(200px, 100%\)/);
  });

  it('SnapshotsView sv-list 摘卡（522 卡片流排序锁域零触：只摘壳不碰排序面）', () => {
    const sv = read('../views/SnapshotsView.vue');
    expect(sv, 'sv-list 摘卡').not.toMatch(/class="card sv-list"/);
    expect(sv, 'sv-list 布局语义原样').toMatch(/\.sv-list \{ display: flex; flex-direction: column; padding: 14px var\(--sp-4\); \}/);
    noShell(sv, 'sv-list', 'sv-list');
    expect(sv, '排序偏好 usePref 零触').toMatch(/usePref\('sv\.sortBy'/);
    expect(sv, '排序方向钮零触').toMatch(/@click="sortRev = !sortRev"/);
  });

  it('TasksView tv-tree-card 摘卡（min-height 布局语义原样）', () => {
    const tv = read('../views/TasksView.vue');
    expect(tv, 'tv-tree-card 摘卡').not.toMatch(/class="card tv-tree-card"/);
    expect(tv, '布局语义原样（min-height 载体 + padding 迁入）')
      .toMatch(/\.tv-tree-card \{ min-height: 200px; padding: 14px var\(--sp-4\); \}/);
    noShell(tv, 'tv-tree-card', 'tv-tree-card');
  });

  it('MappingView mp-fields 摘卡（自带 padding 零触）', () => {
    const mp = read('../views/MappingView.vue');
    expect(mp, 'mp-fields 摘卡').not.toMatch(/class="card mp-fields"/);
    expect(mp, '自带 padding 零触').toMatch(/\.mp-fields \{ padding: var\(--sp-3\) var\(--sp-4\); overflow: hidden; \}/);
    noShell(mp, 'mp-fields', 'mp-fields');
  });

  it('AliasesView .alv-panel 壳退役正锁（558 击穿同步更新：border-top 分节承接 + ac-line 语义线保形）', () => {
    const alv = read('../views/AliasesView.vue');
    /* 五百五十八批同步更新（击穿者：558 工蚁G——全站最后一个全局 .card 壳退役 → border-top
       分节承接，554 ar-sec 同刀）：547「全豁免」字面改退役形 + ac-line 语义线转 border-top
       承接（语义边框豁免约定③保形；锁意图=壳形态回归防线） */
    expect(alv, 'alv-panel 全局 .card 壳退役（558 击穿同步更新）').not.toMatch(/class="card alv-panel"/);
    expect(alv, 'ac-line 语义线 border-top 承接（558）')
      .toMatch(/\.alv-panel \{ border-top: 1px solid var\(--ac-line\); padding: var\(--sp-3\) 14px; \}/);
  });
});

/* ═══════════ 在场不动正锁（防误退/防回流） ═══════════ */

describe('五百四十七批：功能卡/仪表卡豁免域正锁（546 al-lane 先例同域，防回流）', () => {
  it('AdhocRebuildView 六步卡 / OverviewView 仪表卡 / SecurityView 功能卡 / DiagView 观测卡', () => {
    const ar = read('../views/AdhocRebuildView.vue');
    /* 五百五十四批同步更新（击穿者：554 工蚁B2——Adhoc 六卡全局 .card 壳退役 → border-top 分节
       承接，Xmigrate 551 同刀）：547「在场不动」字面改退役形 + 新分节锚在场 */
    expect(ar, 'Adhoc .card 壳退役（554 击穿同步更新）').not.toMatch(/class="card"/);
    expect((ar.match(/class="ar-sec"/g) || []).length, '六卡 ar-sec 分节承接 ≥4').toBeGreaterThanOrEqual(4);
    /* 五百五十四批同步更新（击穿者：554 工蚁D——仪表卡/功能卡/观测卡顶层 .card 壳退役 →
       border-top 分节承接）：547「在场不动」字面改退役形 + 新分节锚在场（ih-card-flush 551 同款） */
    const ov = read('../views/OverviewView.vue');
    expect(ov, '仪表卡 ov-topo 壳退役（554 击穿同步更新）').not.toMatch(/class="card ov-topo"/);
    expect(ov, 'ov-topo 分节锚承接（554）').toMatch(/<div class="ov-topo"/);
    const sec = read('../views/SecurityView.vue');
    expect(sec, '功能卡壳退役（554 击穿同步更新）').not.toMatch(/<div class="card">/);
    expect(sec, 'me/us 分节锚承接（554）').toMatch(/<div class="me-card">/);
    const dg = read('../views/DiagView.vue');
    expect(dg, 'DiagView 观测卡壳退役（554 击穿同步更新）').not.toMatch(/<div class="card">/);
    expect(dg, 'dg-ops 分节锚承接（554）').toMatch(/<div class="dg-ops">/);
  });

  it('WatcherView wt-card / TopologyView tp-canvas+tp-palette / IndexHubView ih-card-flush', () => {
    const wt = read('../views/WatcherView.vue');
    /* 五百五十四批同步更新（击穿者：554 工蚁D⑨——wt-card 列表项卡带框降层为 border-top 行，
       slm-card 551 先例）：壳三件套字面改降层形（类名保留 DOM 锚，锁意图=布局骨架回归防线） */
    expect(wt, 'wt-card 降层 border-top 行（554 击穿同步更新；布局骨架零触）')
      .toMatch(/\.wt-card \{ display: flex; justify-content: space-between; align-items: flex-start; gap: var\(--sp-3\); padding: var\(--sp-3\) 0; border-top: 1px solid var\(--border-subtle\); \}/);
    const tp = read('../views/TopologyView.vue');
    /* 五百五十四批同步更新：tp-canvas/tp-palette .card 壳退役 → border-top 分节（类名保留） */
    expect(tp, 'tp-canvas 卡壳退役（554 击穿同步更新）').not.toMatch(/class="card tp-canvas"/);
    expect(tp, 'tp-canvas 分节锚承接（554）').toMatch(/class="tp-canvas"/);
    expect(tp, 'tp-palette 卡壳退役（554 击穿同步更新）').not.toMatch(/class="card tp-palette"/);
    expect(tp, 'tp-palette 分节锚承接（554）').toMatch(/class="tp-palette"/);
    const ih = read('../views/IndexHubView.vue');
    /* 五百五十一批同步更新（击穿者：551 轨2 刀⑥a——ih-card-flush 大卡壳退役）：
       547「主卡在场不动」字面改退役形，.ih-ws 分节容器承接（锁意图=pane 壳回归防线） */
    expect(ih, 'ih-card-flush 主卡退役（551 击穿同步更新）').not.toMatch(/class="card ih-card-flush"/);
    expect(ih, 'ih-ws 分节容器承接（551）').toMatch(/<div class="ih-ws"(?:\s+:class="|>)/);
  });
});
