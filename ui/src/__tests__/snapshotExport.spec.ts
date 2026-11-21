/**
 * R130 第一百零一批：SnapshotsView 快照列表 CSV 导出（运维对账刚需；
 * SecurityView 审计导出同格式 csvCell+BOM）。跟随当前过滤。
 * 锁定（静态）：按钮接线（filtered 门控）+ 列结构（名/状态/起止/耗时/索引数/清单）
 * + 文件名含仓库维度 + BOM。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SnapshotsView.vue'), 'utf-8');

describe('SnapshotsView CSV 导出（一百零一批）', () => {
  it('导出按钮接线（filtered 门控）+ exportCsv 函数', () => {
    expect(src).toMatch(/:disabled="!filtered\.length"[^>]*@click="exportCsv"/);
    expect(src).toMatch(/function exportCsv\(\)/);
  });

  it('列结构与文件名（仓库维度）+ BOM', () => {
    expect(src).toContain("const head = ['snapshot', 'state', 'start_time', 'duration_ms', 'indices_count', 'indices']");
    expect(src).toMatch(/snapshots-\$\{currentRepo\.value \|\| 'repo'\}-\$\{exportStamp\(\)\}\.csv/); /* 255 批时间戳 */
    expect(src).toMatch(/csvText\(head,/); /* 434 批：组装合并 csvText */
  });
});
