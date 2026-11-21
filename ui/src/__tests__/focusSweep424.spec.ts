/**
 * 四百二十四批：聚焦放大推广至 PIT 预览表与搜索模板结果表（423 Lucene 同款）——
 * 表格浏览型高频场景全部具备全屏聚焦能力（同钮双态+Esc+聚焦态高度随视口）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pit = readFileSync(join(__dirname, '../views/PitScrollView.vue'), 'utf-8');
const tpl = readFileSync(join(__dirname, '../views/SearchTemplatesView.vue'), 'utf-8');

describe('聚焦面推广（424 批）', () => {
  it('PIT 预览表：FocusableSurface 接线+聚焦态高度拉伸', () => {
    expect(pit).toMatch(/<FocusableSurface pane-id="pit\.preview" title="预览表"/);
    /* 524 批同步更新：聚焦态高度对齐 423 收敛口径（--vh-offset 为准回加 80px，与旧裸 130px 等价） */
    expect(pit).toMatch(/:max-height="focusPaneId === 'pit\.preview' \? 'calc\(100vh - var\(--vh-offset\) \+ 80px\)' : '40vh'"/);
    expect(pit).toContain("import FocusableSurface from '../components/FocusableSurface.vue';");
  });

  it('搜索模板结果表：v-if 上移表面层（防 v-else 断链）+聚焦态拉伸', () => {
    expect(tpl, '931 批随迁：门控 hits.length→ran（0 命中走 QRT 内建空态）').toMatch(/<FocusableSurface v-if="ran" pane-id="tpl\.result" title="结果表"/);
    expect(tpl).toMatch(/:max-height="focusPaneId === 'tpl\.result' \? 'calc\(100vh - var\(--vh-offset\) \+ 60px\)' : '60vh'"/);
    expect(tpl).toContain("import FocusableSurface from '../components/FocusableSurface.vue';");
  });
});
