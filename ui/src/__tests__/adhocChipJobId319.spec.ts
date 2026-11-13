/**
 * 三百一十九批：AdhocRebuild 索引芯片（物理/源索引直达工作区）+ jobId 点击复制（监控步+最近作业表）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');

describe('Adhoc 芯片+jobId（319 批）', () => {
  it('芯片两处+复制两处+函数', () => {
    expect((v.match(/class="ad-idx-go"/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((v.match(/copyJobId\(/g) || []).length).toBeGreaterThanOrEqual(3); // 两模板+一定义
    expect(v).toMatch(/function gotoIdx\(idx\?: string\)/);
    expect(v).toMatch(/copyText\(id\)\.then\(ok => store\.notify/);
  });
});
