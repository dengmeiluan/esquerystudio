/**
 * 四百三十五批：DslQuery 结果区接聚焦放大。
 * 五百一十六批用户裁决「放大直接集成在表格上」：视图层 FocusableSurface 包装
 * （pane-id=dq.workspace）退役——放大/还原由 ResultTable 内建（rt-bar 工具簇末尾 ⤢，
 * FS 包表格根），查询工作台与索引工作区/SQL/数据浏览器等全站表格一致。
 * 本 spec 改为看守「视图层包装已拆干净 + 内建接管」：
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');

describe('DslQuery 结果区聚焦（435 批，516 批合并表格内建）', () => {
  it('视图层包装退役，放大由 RT 内建承担', () => {
    /* 旧视图层接线必须拆干净 */
    expect(v).not.toContain('dq.workspace');
    expect(v).not.toContain('<FocusableSurface');
    expect(v).not.toContain('focusPaneId');
    /* DSL_PANES 的 workspace pane focusable 语义保留（435 批原契约） */
    /* 539 批同步更新：pane 行追加互覆盖 maximizable/maxName（focusable 语义保留） */
    expect(v).toMatch(/\{ id: 'query-builder\.workspace', role: 'workspace', minSize: 360, defaultSize: 'flex', focusable: true, maximizable: true, maxName: '编辑器' \},/);
    /* RT 内建：FS 包根 + rt-bar 内建放大钮 */
    expect(rt).toMatch(/<FocusableSurface pane-id="rt\.table" title="结果表" headless :enabled="focused"/);
    expect(rt).toContain('放大结果表');
  });

  it('聚焦态样式与容器闭合平衡', () => {
    expect(v).toMatch(/\.fs-active \.dq-res-body \{ height: 100%; overflow: auto; \}/);
    /* RT 内建 FS 开=闭 */
    const open = (rt.match(/<FocusableSurface\b/g) ?? []).length;
    const close = (rt.match(/<\/FocusableSurface>/g) ?? []).length;
    expect(open).toBe(close);
  });
});
