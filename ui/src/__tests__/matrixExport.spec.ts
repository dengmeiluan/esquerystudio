/**
 * R130 第一百零九批：MatchMatrixView 子句命中统计 CSV 导出（分析产物带出；
 * csvCell+BOM 与 SecurityView/快照列表同口径）。跟随当前矩阵结果。
 * 五百三十二批反转：矩阵表换壳 QRT rows 型——手写子句统计 CSV 导出（exportCsv/csvText）
 * 随裸表退役，导出归 QRT 内核五格式（export-name="match-matrix"，矩阵行集所见即所得；
 * 子句命中占比仍在页上 mm-stats 统计条可视）。本文件锚同步迁新形态（换壳不回潮锁）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/MatchMatrixView.vue'), 'utf-8');

describe('MatchMatrix 矩阵表导出（532 换壳：手写 CSV 退役归内核）', () => {
  it('手写 exportCsv/csvText 全退役不回潮', () => {
    expect(src).not.toMatch(/function exportCsv\(\)/);
    /* 只禁回退到 CSV/导出手写助手；copyText（行菜单复制）与被退役的导出链无关 */
    expect(src).not.toMatch(/import\s*\{[^}]*\b(csvText|csvCell|exportStamp|downloadText)\b[^}]*\}\s*from\s*'\.\.\/utils\/format'/);
    expect(src).not.toMatch(/:disabled="!clauseStats\.length"[^>]*@click="exportCsv"/);
  });

  it('导出归 QRT 内核：export-name="match-matrix"（时间戳后缀由内核统一拼 exportStamp）', () => {
    expect(src).toContain('export-name="match-matrix"');
    expect(src).toMatch(/<QueryResultTable v-if="hits\.length" :cols="mmCols" :rows="mmRows" sortable[^>]*storage-key="mm"/);
  });
});
