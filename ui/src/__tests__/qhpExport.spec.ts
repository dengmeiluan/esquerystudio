/**
 * R130 第九十四批：QueryHistoryPanel 导出当前过滤结果（与 92 批 RestView 历史导出
 * 同语义——历史上限 100 条，找得到也要带得走；双入口共用共享件，一处落地两处受益）。
 * 锁定（静态）：导出钮接线（shown 门控）+ exportShown 用 shown（过滤语义）+
 * 文件名含 route 维度（区分 QueryHub 抽屉/DslQueryView 弹窗）+ downloadText JSON。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../components/QueryHistoryPanel.vue'), 'utf-8');

describe('QueryHistoryPanel 导出（九十四批）', () => {
  it('导出按钮接线（shown 门控，与清空钮并列）', () => {
    expect(src).toMatch(/:disabled="!shown\.length"[^>]*@click="exportShown"/);
    expect(src).toMatch(/function exportShown\(\)/);
  });

  it('导出走 shown（过滤语义）、JSON 格式、文件名含 route 维度', () => {
    expect(src).toMatch(/if \(!shown\.value\.length\) return;/);
    expect(src).toMatch(/route\.path\.replace\(/);
    expect(src).toMatch(/query-history-\$\{seg\}-\$\{exportStamp\(\)\}\.json/); /* 255 批时间戳 */
    expect(src).toMatch(/'application\/json;charset=utf-8'/);
  });

  it('九十五批：title 诚实化（不承诺「可导入」——导出物暂无再导入消费方）', () => {
    expect(src).toMatch(/title="导出当前过滤结果为 JSON（备份\/带出，供检索或存档）"/);
  });
});
