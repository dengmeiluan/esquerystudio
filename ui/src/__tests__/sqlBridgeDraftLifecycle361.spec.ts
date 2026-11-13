/**
 * 三百六十一批：SqlBridge 输出草稿生命周期守卫——
 * dsl-out/lucene-out 键随 sqlResult 清空路径同步清理（转换失败/不可用时不留陈稿）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/SqlBridgeView.vue'), 'utf-8');

describe('SqlBridge 输出草稿生命周期（361 批）', () => {
  it('不可用/失败路径同步清空 dsl/lucene（草稿 watch 自动落盘清理）', () => {
    expect(v).toMatch(/dsl\.value = ''; lucene\.value = '';/);
    expect((v.match(/dsl\.value = ''; lucene\.value = '';/g) || []).length).toBeGreaterThanOrEqual(2);
  });
  it('持久化通道：useScopedDraft 双键接线（mode 槽承载 SQL 指纹）', () => {
    expect(v).toContain("'dsl-out'");
    expect(v).toContain("'lucene-out'");
    expect(v).toMatch(/mode: \(\) => sqlFingerprint\.value/);
  });
});
