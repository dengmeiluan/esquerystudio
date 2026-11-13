/**
 * 四百零二批：两工作台设计统一四收敛——用户实报「翻页行为、表格高度、耗时统计、
 * 按钮等没有保持一套设计」：
 * ① DevTools 主按钮中文化（英文 Run 是中文界面孤例）+执行中态句式统一「执行中 X.Xs」；
 * ② DslQuery 独立结果头只留 A/B 对比增量（总条数/耗时已并入 RT 工具行，
 *    双份统计且形态不同「条 ·」vs「/」曾让两台读数不一致）；
 * ③ 视图高度单位统一 vh（DslQuery JSON/树 560px/480px → 56vh/48vh，对齐 IndexHub
 *    52vh/50vh 一族——固定 px 小屏溢出视口）；
 * ④ 翻页已同构（262 批共享 Pagination+es_pager_size，守卫锚确认）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dt = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');
const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

describe('两工作台设计统一（402 批）', () => {
  it('DevTools 主按钮中文「执行」+kbd 提示+执行中句式统一', () => {
    expect(dt).toMatch(/'执行中 ' \+ \(qr\.elapsedMs\.value \/ 1000\)\.toFixed\(1\) \+ 's' : '执行'/);
    /* 五百二十七批同步更新：kbd 提示 margin 收 --sp（4px → --sp-1），文案与形态不变 */
    expect(dt).toContain('<span class="kbd" style="margin-left:var(--sp-1)">Ctrl⏎</span>');
    expect(dt, '英文 Run 退役').not.toContain('Run (Ctrl+Enter)');
  });

  it('DslQuery 结果头只留 A/B 增量（重复统计退役，runDelta 保留）', () => {
    expect(dq).toMatch(/<span v-if="resp && runDelta" class="dq-meta mono">/);
    expect(dq).not.toMatch(/条 · \{\{ resp\.took \}\}ms/);
    expect(dq).toMatch(/runDelta\.txt/);
  });

  it('视图高度 vh 统一：主 JSON/树/弹卡视图无 5xx 固定 px（对齐 IndexHub vh 族；模板画廊卡片列表 dq-cards 为弹窗内固定值不在列）', () => {
    expect(dq).not.toMatch(/style="max-height:\s*560px/);
    expect(dq).not.toMatch(/max-height:\s*480px/);
    /* v3.0.1:56vh 从内联 style 迁入 .dq-json-wrap/.dq-tree-view 类(聚焦态 fs-active 解除),vh 单位契约不变；
       五百一十九批:56vh 再收敛为局部变量 --dq-view-cap(JSON/Tree/卡片三视图一口径,切视图高度不跳变)；
       W1 批高度链同步更新:cap 降级为「容器富余时的兜底封顶」——视图分支补 flex 收缩
       (flex:1 1 auto + min-height:0),cap 守卫语义仍在(结果区视图高度上限不被内容撑破) */
    expect(dq).toMatch(/--dq-view-cap:\s*56vh/);
    expect(dq).toMatch(/\.dq-json-wrap \{ max-height: var\(--dq-view-cap\); flex: 1 1 auto; min-height: 0; \}/);
    expect(dq).toMatch(/\.dq-tree-view \{ max-height: var\(--dq-view-cap\);/);
    /* 五百六十批同步更新（击穿者：560 轨2 刀④——settings 区写死 max-height="52vh" 换绑
       useTierCycle('ih.settingsH', ['52vh','70vh','86vh'], '52vh')；基线档=原写死值零迁移，
       vh 档契约由绑定承接，断言随绑走） */
    expect(ih).toMatch(/:max-height="settingsH"/);
  });

  it('翻页同构守卫：两台同用共享 Pagination+共享页大小键', () => {
    /* 541 批同步更新：Pagination 寄居 RT #bar-prepend（表格头），允许视图档 v-if 前缀；
       五百五十四批同步更新：IndexHub 侧同款视图档 v-if（docsView，与 DQ view 同语言） */
    expect(dq).toMatch(/<Pagination v-if="view !== 'json' && view !== 'tree'"\s*\n\s+:page="page" :total-pages="totalPages" :page-size="pageSize"/);
    expect(ih).toMatch(/<Pagination v-if="docsView !== 'json' && docsView !== 'tree'"\s*\n\s+:page="docsPage" :total-pages="docsTotalPages" :page-size="docsSize"/);
    expect(ih).toContain('es_pager_size');
  });
});
