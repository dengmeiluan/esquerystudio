/**
 * 三百零六批：SearchTemplatesView 手写 accordion 结果退役换 QRT——
 * 查找/列拖拽/单元格详情/导出/增量渲染全量继承（storage-key=tpl:<id>）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/SearchTemplatesView.vue'), 'utf-8');

describe('模板结果换 QRT（306 批）', () => {
  it('QRT 接线+手写 accordion 清零', () => {
    expect(v).toMatch(/<FocusableSurface v-if="ran" pane-id="tpl\.result" title="结果表"/); /* 424 批：v-if 上移表面层；931 批随迁：门控 hits.length→ran（0 命中走 QRT 内建空态） */
    expect(v).toMatch(/<QueryResultTable :hits="hits as any" :total="totalHits" :total-gte="totalGte" :max-height=/);
    expect(v).not.toMatch(/class="st-hit"/);
    expect(v).not.toMatch(/function fmtScore/);
    expect(v).not.toMatch(/openIdx/);
  });
});
