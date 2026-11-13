/**
 * 五百四十一批：IndexHubView 两处外挂 Pagination 迁入对应 ResultTable 的 #bar-prepend 槽
 *（与查询工作台 DslQueryView 同语言——「翻页统一在表格头」）。
 * 位置一：docs tab 文档浏览表（docsPage/docsTotalPages/docsSize）→ <ResultTable ref="docsTbl">；
 * 位置二：query tab 查询表（qryPage/qryTotalPages/qrySize）→ <ResultTable ref="qryTbl">。
 * 锁定：两处槽在场且 Pagination 寄居槽内（props 值恒等同步更新）+ 旧外挂行退役；
 *   五百五十四批同步更新（击穿者：视图形式切换 seg 接线）——RT 接 :hide-body=非表格档
 *   （表格体隐藏、工具行常驻），分页器随 DQ 同款 v-if 仅表格/卡片档在场（JSON/Tree 无翻页语义）。
 * 注：docsPager262/workbenchParity402 的存在性正则按值恒等同步更新后应继续命中（本文件末尾并锁）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('IndexHubView 分页器寄居 RT 工具行（541 批 #bar-prepend）', () => {
  const src = read('../views/IndexHubView.vue');

  it('两处 <template #bar-prepend> 在场且各自内含 Pagination', () => {
    const prependCount = src.split('<template #bar-prepend>').length - 1;
    expect(prependCount, 'IndexHubView 恰有两处 #bar-prepend 槽').toBe(2);
  });

  it('docs tab：Pagination 寄居 <ResultTable ref="docsTbl"> 槽内（props 值恒等）', () => {
    const dStart = src.indexOf('<ResultTable ref="docsTbl"');
    expect(dStart, 'docs RT 消费标签存在（防空跑）').toBeGreaterThan(-1);
    const dTag = src.slice(dStart, src.indexOf('</ResultTable>', dStart));
    expect(dTag).toContain('<template #bar-prepend>');
    /* 554 批同步更新：JSON/Tree 档无翻页语义，Pagination 带视图档 v-if 前缀（DQ 同款），props 值恒等 */
    expect(dTag).toContain('<Pagination v-if="docsView !== \'json\' && docsView !== \'tree\'"');
    expect(dTag).toContain(':page="docsPage" :total-pages="docsTotalPages" :page-size="docsSize"');
    expect(dTag).toContain(':disabled="docsLoading" @update:page="goDocsPage" @update:page-size="setDocsSize"');
  });

  it('query tab：Pagination 寄居 <ResultTable ref="qryTbl"> 槽内（props 值恒等）', () => {
    const qStart = src.indexOf('<ResultTable ref="qryTbl"');
    expect(qStart, 'qry RT 消费标签存在（防空跑）').toBeGreaterThan(-1);
    const qTag = src.slice(qStart, src.indexOf('</ResultTable>', qStart));
    expect(qTag).toContain('<template #bar-prepend>');
    expect(qTag).toContain('<Pagination v-if="qryView !== \'json\' && qryView !== \'tree\'"');
    expect(qTag).toContain(':page="qryPage" :total-pages="qryTotalPages" :page-size="qrySize"');
    expect(qTag).toContain(':disabled="qryLoading" @update:page="goQryPage" @update:page-size="setQrySize"');
  });

  it('旧外挂 Pagination 行退役：两处 ih-docs-bar 工具行不再直接挂 Pagination', () => {
    /* docs 检索工具行：第一个 ih-docs-bar 到 docs RT 开标签之间 */
    const dStart = src.indexOf('<ResultTable ref="docsTbl"');
    const docsBar = src.slice(src.indexOf('class="ih-docs-bar"'), dStart);
    expect(docsBar, 'docs 工具行（LuceneInput/执行/取消/带词跳转保留）不再挂 Pagination').not.toContain('<Pagination');
    /* query 执行工具行：带 margin-top 的 ih-docs-bar 到 qry RT 开标签之间 */
    const qStart = src.indexOf('<ResultTable ref="qryTbl"');
    const qryBar = src.slice(src.indexOf('class="ih-docs-bar" style="margin-top:var(--sp-2)"'), qStart);
    expect(qryBar, 'query 工具行（执行/取消/DevTools/历史/高度档保留）不再挂 Pagination').not.toContain('<Pagination');
  });

  it('既有存在性正则继续命中（docsPager262/workbenchParity402 值恒等同步更新）', () => {
    expect(src).toMatch(/<Pagination v-if="docsView !== 'json' && docsView !== 'tree'"\s*\n\s+:page="docsPage" :total-pages="docsTotalPages" :page-size="docsSize"/);
    expect(src).toContain('es_pager_size');
  });

  it('五百五十四批同步更新：两 RT 接视图 seg + hide-body=非表格档（表格体隐藏、工具行常驻）', () => {
    expect(src, 'docs RT hideBody 消费').toContain(':hide-body="docsView !== \'table\'"');
    expect(src, 'query RT hideBody 消费').toContain(':hide-body="qryView !== \'table\'"');
    expect(src.match(/<div class="seg ih-view-seg">/g)?.length, '两处视图 seg 在场').toBe(2);
  });
});
