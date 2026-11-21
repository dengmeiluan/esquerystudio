/**
 * R130 第一百零八批：IndexOptimizer 优化建议导出 JSON（存档/带出走变更评审）——
 * 含索引/导出时间/每条建议的 当前值→建议值/严重级，可直接贴工单。
 * 锁定（静态）：按钮接线（recs 门控）+ exportRecs 组装结构 + 文件名含索引维度。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/IndexOptimizerView.vue'), 'utf-8');

describe('IndexOptimizer 建议导出（一百零八批）', () => {
  it('导出按钮接线（recs 门控）+ exportRecs 函数', () => {
    expect(src).toMatch(/:disabled="!recs\.length"[^>]*@click="exportRecs"/);
    expect(src).toMatch(/function exportRecs\(\)/);
  });

  it('导出结构完整（index/exportedAt/suggestions 含当前值与建议值）', () => {
    expect(src).toContain('index: target.value');
    /* v3.0.1:exportedAt 修 UTC 陷阱——toISOString 换 exportStamp()(本地时,与文件名时间戳同源) */
    expect(src).toContain('exportedAt: exportStamp()');
    expect(src).toMatch(/suggest: r\.suggest, severity: r\.severity/);
    expect(src).toMatch(/index-optimizer-\$\{target\.value \|\| 'index'\}-\$\{exportStamp\(\)\}\.json/); /* 255 批时间戳 */
  });
});
