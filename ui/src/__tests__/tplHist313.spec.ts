/**
 * 三百一十三批：模板执行成功写入跨模式查询历史（mode=template，渲染后 DSL）——
 * 查询工作台可回放，模板执行不再黑盒一次性。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/SearchTemplatesView.vue'), 'utf-8');

describe('模板执行写历史（313 批）', () => {
  it('成功路径 push(mode=template)', () => {
    expect(v).toMatch(/useQueryHistoryStore\(\)\.push\('template', rendered\.value \|\| source\.value, index\.value/);
    expect(v).toContain("import { useQueryHistoryStore } from '../stores/queryHistory';");
  });
});
