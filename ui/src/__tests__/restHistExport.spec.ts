/**
 * R130 第九十二批：RestView 请求历史导出（管理闭环补齐）。
 * 背景：65 批清空确认已提示「不可撤销」，92 批文案进一步指引用「导出」备份——
 * 但此前弹窗内没有任何导出能力，备份指引是空头支票。
 * 修：历史过滤条加「导出」钮，导出当前过滤结果（shownHist）为 JSON，
 * 格式 [{method,path,body,ts}] 与本地存储/DevTools 回放形态互认。
 * 锁定（静态）：按钮接线 + exportHist 用 shownHist（过滤语义）+ 文件名含 rest-history。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 第十批（lane）：历史弹窗体改用 QueryHistoryPanel 统一件——本地过滤/导出/空态实现退役，
   导出能力由共享件 exportShown 承接（过滤语义 shown + exportStamp 时间戳 + 诚实化 title 原样保留） */
const src = readFileSync(join(__dirname, '../views/RestView.vue'), 'utf-8');
const qhp = readFileSync(join(__dirname, '../components/QueryHistoryPanel.vue'), 'utf-8');

describe('RestView 历史导出（九十二批，第十批合并 QueryHistoryPanel）', () => {
  it('导出按钮接线（shown 门控，共享件 exportShown）', () => {
    expect(qhp).toMatch(/:disabled="!shown\.length"[^>]*@click="exportShown"/);
    expect(qhp).toMatch(/function exportShown\(\)/);
  });

  it('导出走 shown（过滤语义）且格式完整', () => {
    expect(qhp).toMatch(/if \(!shown\.value\.length\) return;/);
    expect(qhp).toMatch(/downloadText\(/);
    expect(qhp).toMatch(/exportStamp\(\)/); /* 255 批时间戳 */
  });

  it('清空确认文案引导备份（闭环自洽）', () => {
    expect(src).toContain('需要保留可先用「导出」备份');
  });

  it('九十五批：title 诚实化（不承诺「可导入 Dev Tools」——DevTools 只认 curl）', () => {
    expect(qhp).toMatch(/导出当前过滤结果为 JSON（备份\/带出，供检索或存档）|导出当前过滤结果为 JSON/);
    expect(src).not.toContain('可再导入 Dev Tools');
    expect(qhp).not.toContain('可再导入 Dev Tools');
  });
});
