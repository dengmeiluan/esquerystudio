/**
 * 二百九十七批：可访问性/可调节性扫尾守卫——新增交互件的语义承载锁定
 * （262-277 批新增的芯片/回顶/分页器等，aria/role/title 不可裸奔）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('可访问性/可调节性扫尾（297 批）', () => {
  it('芯片/回顶/分页 aria 与 title 承载', () => {
    const qrt = read('../components/QueryResultTable.vue');
    const rt = read('../components/ResultTable.vue');
    const panel = read('../components/QueryHistoryPanel.vue');
    const pager = read('../components/Pagination.vue');
    expect(qrt).toMatch(/aria-label="'打开索引工作区：' \+ cell"/);
    expect(rt).toMatch(/aria-label="回到顶部"/);
    expect(qrt).toMatch(/aria-label="回到顶部"/);
    expect(panel).toMatch(/role="img" aria-label="上次执行失败"/);
    expect(pager).toMatch(/aria-label="上一页"/);
    expect(pager).toMatch(/:aria-label="'跳转到页（1-' \+ totalPages/);
  });
  it('调节能力登记：行高三档/列宽重置/分页页大小 全部 title 可见', () => {
    const qrt = read('../components/QueryResultTable.vue');
    const pager = read('../components/Pagination.vue');
    /* 835 批同步更新：行高三档+列宽重置合并「视图 ⋯」聚合菜单（显式三选+底项重置） */
    expect(qrt).toMatch(/title="视图：行高、列宽"/);
    expect(qrt).toMatch(/setRowH..compact./);
    expect(qrt).toMatch(/setRowH..cozy./);
    expect(qrt).toMatch(/重置全部列宽/);
    /* 五百六十三批同步更新（用户实报原生 select 设计割裂）：换 n-popover 自定义 listbox，
       选项字面随形态迁移，aria（haspopup/expanded/option/selected）在 dqParamsDedupe563 锁 */
    expect(pager).toContain('{{ s }}/页</span>'); /* 页大小选项在 Pagination 组件内 */
  });
});
