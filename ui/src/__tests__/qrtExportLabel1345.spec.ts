/**
 * 一千三百四十五批：SQL 结果表的「导出」钮是无信息标签。
 *
 * 来源：按渲染表面比对两个内核**真实渲染后**的工具行控件（1440 视口，各自跑出结果）：
 *
 *   RT(索引)  13 个：… 导出为 CSV（当前页） / 查看原始 IO（文档检索） / 表格操作提示 / …
 *   QRT(SQL)  10 个：… 导出 / 查看原始 IO（SQL 执行） / 结果表高度档：500px / …
 *
 * 逐条核过差集，其余都有正当语义（Table/卡片 视图不适用 SQL 结果、每页条数走 cursor 分页、
 * 操作提示是索引页专属）。**只有「导出」这一条是信息缺失**：同一个内核的 ResultTable
 * 一直是「导出为 X（当前页 / 选中 N 行）」，QRT 只有两个字——
 * 读屏用户，以及窄档下标签被 `.qrt-tool-t` 隐藏只剩图标时，都无从判断导的是什么、多少行。
 *
 * 修法：aria-label 说清「导出什么 + 什么范围 + 哪些格式」，范围口径取实现真相
 * （导出的是**当前视图**：筛选+排序后所见，不是原始结果集）。
 *
 * 真机验收：SQL 页执行后
 *   aria  = 导出当前视图（1 行，CSV/XLSX/JSON/PNG/Markdown）
 *   title = 导出当前视图（筛选/排序所见即所得，共 1 行）—— CSV / XLSX / JSON / PNG / Markdown
 *   与页面实际渲染行数一致（renderedRows=1）
 *
 * 本 spec 锁：
 *  ① aria-label 不得是裸「导出」；
 *  ② aria-label 必须带**动态行数**（sortedRows.length，不是写死）；
 *  ③ 必须点明格式枚举；
 *  ④ 范围口径必须写「当前视图」（与实现一致），不能写成「全部结果」。
 * 负控：把 aria-label 改回 "导出" → 第 1、2 条必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const tag = (() => {
  const i = src.indexOf('class="btn sm ghost qrt-tool-btn"');
  expect(i, '导出钮必须存在').toBeGreaterThan(-1);
  const start = src.lastIndexOf('<button', i);
  return src.slice(start, src.indexOf('>', i));
})();

describe('1345 SQL 结果表导出钮要有信息量', () => {
  it('aria-label 不得是裸「导出」', () => {
    expect(tag).not.toMatch(/aria-label="导出"/);
    const m = tag.match(/:?aria-label="([^"]+)"/);
    expect(m, '必须有 aria-label').toBeTruthy();
    expect(m![1].length, 'aria-label 要说得清').toBeGreaterThan(6);
  });

  it('aria-label 带动态行数（不是写死）', () => {
    const m = tag.match(/:?aria-label="([^"]+)"/);
    expect(m![1], '必须是动态绑定且含 sortedRows.length').toContain('${sortedRows.length}');
    /* 冒号前缀=动态绑定；静态字符串里出现 ${} 不会求值 */
    expect(tag, 'aria-label 必须是动态绑定').toMatch(/:aria-label="/);
  });

  it('点明格式枚举', () => {
    const m = tag.match(/:?aria-label="([^"]+)"/);
    for (const f of ['CSV', 'XLSX', 'JSON', 'PNG', 'Markdown']) {
      expect(m![1], `格式 ${f} 必须在 label 里`).toContain(f);
    }
  });

  it('范围口径 = 当前视图（与实现一致）', () => {
    const m = tag.match(/:?aria-label="([^"]+)"/);
    expect(m![1], '必须写「当前视图」').toContain('当前视图');
    expect(m![1], '不能谎称导出全部结果').not.toContain('全部结果');
  });
});
