/**
 * 三百五十二批：SqlBridge dsl/lucene 转换输出持久化——此前刷新即丢且无转换历史。
 * useScopedDraft（route+mode 槽承载 SQL 指纹）——同 SQL 恒同转换，换 SQL 即隔离。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/SqlBridgeView.vue'), 'utf-8');

describe('SqlBridge 输出持久化（352 批）', () => {
  it('dsl/lucene 迁 useScopedDraft（mode 槽承载 SQL 指纹）', () => {
    expect(v).toMatch(/const dsl = useScopedDraft\('dsl-out', \{ route: 'sqlbridge', mode: \(\) => sqlFingerprint\.value \}, ''\)\.text;/);
    expect(v).toMatch(/const lucene = useScopedDraft\('lucene-out', \{ route: 'sqlbridge', mode: \(\) => sqlFingerprint\.value \}, ''\)\.text;/);
    expect(v).toMatch(/const sqlFingerprint = computed\(/);
  });
});
