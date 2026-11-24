/**
 * 二百六十三至二百六十七批：两工作台（同 RT 组件）+RT/QRT 双轨差异收敛系列。
 * 用户实报「索引工作区和查询工作区的查询效果以及列表不完全一致」——系统性收敛：
 * 263 RT 筛选后空集提示行（QRT 同款文案同款逃生口，此前 tbody 直接空白）
 * 264 RT 斑马纹统一（.zebra opt-in 启用+紧凑档关闭=QRT 同惯例）
 * 265 单元格截断口径统一（60→160 字符/260→320px，QRT MAX_CELL 同口径）
 * 266 字号/空态文案/截断尾行文案统一
 * 267 QRT 补列拖拽重排（useColDrag 共用件合并+拖后误触排序抑制）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const rt = read('../components/ResultTable.vue');
const qrt = read('../components/QueryResultTable.vue');

describe('两工作台双轨收敛（263-267 批）', () => {
  it('263 RT 筛选空集提示行：有筛选且无命中时出现，QRT 同款文案', () => {
    expect(rt).toMatch(/activeFilterCount && !filteredHits\.length && !renderTruncated/);
    expect(rt).toContain('筛选条件无匹配行——点列头筛选图标可清除'); /* RT 保持文字指引（RT 空集多因服务端状态） */
    expect(qrt).toContain('筛选条件无匹配行'); /* QRT 463 批升级就地清除钮，文案精简 */
  });

  it('264 RT 斑马纹：zebra 类启用+紧凑档关闭（QRT 同惯例）', () => {
    expect(rt).toContain('class="tbl rt-tbl zebra"');
    expect(rt).toMatch(/\.rt\.dense \.rt-tbl tbody tr:nth-child\(even\) \{ background: transparent; \}/);
    expect(qrt).toContain('.qrt-tbl.dense tbody tr:nth-child(even) { background: transparent; }');
  });

  it('265 截断口径统一：RT 160 字符/320px（QRT MAX_CELL=160）', () => {
    expect(rt).toMatch(/trunc\(JSON\.stringify\(v\), 160\)/);
    expect(rt).toMatch(/trunc\(v, 160\)/);
    expect(rt).toMatch(/max-width: 320px/);
    expect(qrt).toContain('const MAX_CELL = 160;');
  });

  it('266 字号/空态/尾行文案统一', () => {
    expect(qrt).toMatch(/\.qrt-coln \{ font-size: var\(--fs-sm\);/);
    expect(qrt).toMatch(/emptyText: '无数据'/);
    expect(rt).toContain('text="无数据"');
    expect(qrt).toContain('行命中排序与筛选');
    expect(rt).toContain('行命中排序与筛选');
  });

  it('267 QRT 列拖拽：useColDrag 接线+th 绑 dragover/drop+onSort 抑制+三态 CSS', () => {
    expect(qrt).toMatch(/useColDrag\(\{/);
    expect(qrt).toMatch(/@dragover="qOnDragOver\(\$event, c\)" @drop="qOnDrop\(\$event, c\)"/);
    expect(qrt).toMatch(/qDragClickSuppressed\(\)/);
    expect(qrt).toContain('qrt-drop-before');
    expect(qrt).toContain('.qrt-th-name.qrt-drag-src');
    expect(qrt).toContain('拖列名可重排');
  });
});
