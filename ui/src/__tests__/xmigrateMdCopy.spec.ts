/**
 * R130 一百四十二批：Xmigrate 迁移任务 Markdown 复制（跟催场景贴群聊，与 TSV 并存）。
 * 源码级锁：
 * 1) exportMd 产出七列表（jobId/状态/目标/迁移量/进度/冲突/错误）；
 * 2) 「Markdown」按钮接线且 TSV 按钮并存不互斥；
 * 3) 行序=QRT 排序后可见行集（五百二十九批换壳后经 exportRows()→getSortedRows，所见即所复）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');

describe('Xmigrate Markdown 复制（142 批）', () => {
  it('exportMd 七列表结构+复制通知', () => {
    expect(src).toMatch(/async function exportMd\(\)/);
    expect(src).toContain('| jobId | 状态 | 目标索引 | 迁移/总量 | 进度 | 冲突 | 错误 |');
    expect(src).toContain('行（Markdown）');
  });

  it('双按钮接线（Markdown + TSV 并存）且行序跟随 QRT 排序后行集', () => {
    expect(src).toMatch(/@click="exportMd"/);
    expect(src).toMatch(/@click="exportTsv"/);
    expect(src.match(/const rows = exportRows\(\);/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
