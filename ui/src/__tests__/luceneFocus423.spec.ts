/**
 * 四百二十三批：Lucene 结果表接聚焦放大——401 FocusableSurface 能力推广到高频查询页。
 * 五百六十一批同步更新（表格头收口）：QRT 移出外层 FS 常驻（表格/JSON 双档同渲染），
 * 聚焦放大换 QRT 内建聚焦面（FS headless，pane-id=qrt.table；:hide-body 分档 + 
 * hideBody→true 自动退聚焦=RT 552 rtFix552 对称件）；seg+JSONL 寄居 QRT #bar-prepend；
 * JSON 树聚焦面（lucene.json）保留、JSON 聚焦态工具行保留（460 批锚）。锁意图不变：
 * 大结果集全屏浏览可用（能力由内建聚焦承接）+ 展示形式切换双向可达。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');

describe('Lucene 结果表聚焦放大（423 批→561 表格头收口同步更新）', () => {
  it('QRT 常驻 + hide-body 视图分档 + 内建聚焦接管（外层表格 FS 退役）', () => {
    expect(v, '表格档外层 FS 已退役（QRT 内建聚焦承接）').not.toMatch(/<FocusableSurface v-if="viewMode === 'table'"/);
    expect(v, 'QRT 常驻：:hide-body 分档在场').toMatch(/:hide-body="viewMode !== 'table'"/);
    expect(v, '内建聚焦启用（:focusable=false 退役）').not.toContain(':focusable="false"');
    expect(v).toMatch(/const focusPaneId = ref<string \| null>\(null\);/);
    expect(v).toContain("import FocusableSurface from '../components/FocusableSurface.vue';");
  });

  it('seg+JSONL 寄居 QRT bar-prepend（541 同款范式）；JSON 顶部分页器保留', () => {
    /* 811 批锁同步更新：seg 升格容器属性（role=group+aria-label），寄居范式不变 */
    expect(v).toMatch(/<template #bar-prepend>[\s\S]*?<div class="seg" role="group" aria-label="展示形态">/);
    expect(v).toMatch(/<button :class="\{ on: viewMode === 'json' \}" :aria-pressed="viewMode === 'json'" @click="viewMode = 'json'">文档 JSON<\/button>/);
    expect(v).toMatch(/<Pagination v-if="viewMode === 'json'" :page="page"/);
    /* 聚焦 JSON 工具行保留（460 批锚：分页+导出在放大态可用） */
    expect(v).toMatch(/<Pagination :page="page" :total-pages="totalPages" :page-size="size" :disabled="busy"/);
  });

  it('452 批：JSON 树聚焦面保留（显式 v-if 随表格档 FS 退役改写）+ 聚焦态充满', () => {
    expect(v).toMatch(/<FocusableSurface v-if="viewMode === 'json'" pane-id="lucene\.json" title="JSON 结果"/);
    expect(v).toContain('.fs-active .lc-tbl-wrap { max-height: none; height: 100%; }');
    expect(v).toMatch(/<div v-if="focusPaneId === 'lucene\.json'" class="lc-hd-r focus-tools">/);
  });
});
