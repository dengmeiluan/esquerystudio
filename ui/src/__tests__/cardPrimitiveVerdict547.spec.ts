/**
 * 五百四十七批·轨4（工蚁）：任务 5 .card 原语约定正锁（纯 spec，零源码改动）。
 *
 * 裁决：theme.css .card 单源**保留**（不删原语）——.card 是全站卡面原语（bg1+line 边+
 * r-l 圆角+14px/--sp-4 内衬，14px 垂直留白为视觉刻意值豁免保字面），功能卡/仪表卡/
 * 语义卡（544 sq-panel 系、546 al-lane 先例）仍在场消费。547 扫荡退役的是**消费端**
 * 误用形态（空态空框/表格包裹壳/master-detail pane 壳），不是原语本身。
 *
 * 已退役消费清单（扫掉的三类误用，防回流）：
 *   ① 空态/加载态空框：IndexSettingsView card is-empty、IndexSettings/Mapping 骨架空框、
 *      IndexHubView ih-guide、BrowserView 裸 .empty（emptyFrameZero547 ）；
 *   ② 表格包裹壳：XmigrateView padding:0;overflow:hidden 卡（cardShellWave547 ）；
 *   ③ master-detail pane 壳：IlmView ilm-list/ilm-detail、TemplatesView tv2-list/tv2-editor、
 *      SnapshotsView sv-list、TasksView tv-tree-card、MappingView mp-fields
 *      （paneShellWave547 ）。
 * 豁免名单（在场不动正锁，与 paneShellWave547 同源）：AdhocRebuild 六步卡/Overview 仪表卡/
 * Security 功能卡/Diag 观测卡/Watcher wt-card/Topology tp-canvas+tp-palette/
 * IndexHub ih-card-flush/Aliases alv-panel（语义边框功能卡全豁免裁决）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const theme = read('../theme.css');

describe('五百四十七批：.card 原语约定正锁（单源保留裁决）', () => {
  it('theme.css .card 原语定义在场（三件套+14px 刻意内衬逐字，不删原语）', () => {
    expect(theme, '.card 原语单源在场').toMatch(/\.card \{\n {2}background: var\(--bg1\);\n {2}border: 1px solid var\(--line\);\n {2}border-radius: var\(--r-l\);\n {2}padding: 14px var\(--sp-4\);/);
    expect(theme, '14px 垂直留白刻意值备案在场（themeTokenGuard 同口径）')
      .toMatch(/14px 垂直留白为视觉刻意值豁免保字面/);
    expect(theme, '.card-t 卡头档同源在场').toMatch(/\.card-t \{/);
  });

  it('豁免名单文件各含其卡（防误退正锁）', () => {
    /* 五百五十四批同步更新（击穿者：554 工蚁B2——AdhocRebuild 六步卡退壳 → .ar-sec border-top
       分节承接，与同批 Overview/Security/Diag 退役同语言）：547 豁免备案保留，字面改退役形+分节锚 */
    expect(read('../views/AdhocRebuildView.vue'), 'AdhocRebuild 六步卡壳退役（554 击穿同步更新）').not.toMatch(/class="card"/);
    expect(read('../views/AdhocRebuildView.vue'), 'ar-sec 分节锚承接（554）').toMatch(/class="ar-sec"/);
    /* 五百五十四批同步更新（击穿者：554 工蚁D——Overview 仪表卡/Security 功能卡/Diag 观测卡/
       Topology tp-canvas+tp-palette 顶层 .card 壳退役 → border-top 分节承接）：
       547 豁免裁决备案保留，字面改退役形 + 新分节锚在场（锁意图=壳形态回归防线，ih-card-flush 551 同款） */
    expect(read('../views/OverviewView.vue'), 'Overview 仪表卡壳退役（554 击穿同步更新）').not.toMatch(/class="card ov-topo"/);
    expect(read('../views/OverviewView.vue'), 'ov-topo 分节锚承接（554）').toMatch(/<div class="ov-topo"/);
    expect(read('../views/SecurityView.vue'), 'Security 功能卡壳退役（554 击穿同步更新）').not.toMatch(/<div class="card">/);
    expect(read('../views/SecurityView.vue'), 'me/us 分节锚承接（554）').toMatch(/<div class="me-card">/);
    expect(read('../views/DiagView.vue'), 'Diag 观测卡壳退役（554 击穿同步更新）').not.toMatch(/<div class="card">/);
    expect(read('../views/DiagView.vue'), 'dg-ops 分节锚承接（554）').toMatch(/<div class="dg-ops">/);
    expect(read('../views/WatcherView.vue'), 'Watcher wt-card').toMatch(/class="wt-card"/);
    expect(read('../views/TopologyView.vue'), 'Topology 画布卡壳退役（554 击穿同步更新）').not.toMatch(/class="card tp-canvas"/);
    expect(read('../views/TopologyView.vue'), 'tp-canvas 分节锚承接（554）').toMatch(/class="tp-canvas"/);
    expect(read('../views/TopologyView.vue'), 'tp-palette 卡壳退役（554 击穿同步更新）').not.toMatch(/class="card tp-palette"/);
    expect(read('../views/TopologyView.vue'), 'tp-palette 分节锚承接（554）').toMatch(/class="tp-palette"/);
    /* 五百五十一批同步更新（击穿者：551 轨2 刀⑥a——ih-card-flush 大卡壳退役）：
       547 豁免裁决备案保留，字面改退役形，.ih-ws 分节容器承接（锁意图=壳形态回归防线） */
    expect(read('../views/IndexHubView.vue'), 'IndexHub ih-card-flush 壳退役（551 击穿同步更新）').not.toMatch(/class="card ih-card-flush"/);
    expect(read('../views/IndexHubView.vue'), 'ih-ws 分节容器承接（551）').toMatch(/<div class="ih-ws"(?:\s+:class="|>)/);
    /* 五百五十八批同步更新（击穿者：558 工蚁G——alv-panel 全站最后一个全局 .card 壳退役 →
       border-top 分节承接，554 ar-sec 同刀）：547 全豁免裁决字面改退役形 + 分节锚在场 */
    expect(read('../views/AliasesView.vue'), 'Aliases alv-panel 壳退役（558 击穿同步更新）').not.toMatch(/class="card alv-panel"/);
    expect(read('../views/AliasesView.vue'), 'alv-panel 分节锚承接（558）').toMatch(/class="alv-panel"/);
  });

  it('已退役消费清单抽查：三类误用形态不回流（ spec 之外的冗余防线）', () => {
    /* ① 空态空框 */
    expect(read('../views/IndexSettingsView.vue'), 'is-empty 空框不回流').not.toMatch(/class="card is-empty"/);
    expect(read('../views/IndexHubView.vue'), 'ih-guide 空框不回流').not.toMatch(/class="card ih-guide"/);
    /* ② 表格包裹壳 */
    expect(read('../views/XmigrateView.vue'), 'padding:0 包裹壳不回流').not.toMatch(/<div class="card" style="padding:0;overflow:hidden">/);
    /* ③ pane 壳 */
    expect(read('../views/IlmView.vue'), 'ilm pane 壳不回流').not.toMatch(/class="card ilm-/);
    expect(read('../views/TemplatesView.vue'), 'tv2 pane 壳不回流').not.toMatch(/class="card tv2-/);
    expect(read('../views/SnapshotsView.vue'), 'sv pane 壳不回流').not.toMatch(/class="card sv-list"/);
    expect(read('../views/TasksView.vue'), 'tv pane 壳不回流').not.toMatch(/class="card tv-tree-card"/);
    expect(read('../views/MappingView.vue'), 'mp pane 壳不回流').not.toMatch(/class="card mp-fields"/);
  });
});
