/**
 * 三百一十八批：MappingFieldTree copyPath 失败分支补齐（282 诚实口径——此前失败静默）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../components/MappingFieldTree.vue'), 'utf-8');

describe('mapping 复制诚实口径（318 批）', () => {
  it('失败分支不再静默', () => {
    expect(v).toMatch(/const ok = await copyText\(path\);/);
    expect(v).toMatch(/ok \? '已复制字段路径：' \+ path : '复制失败'/);
  });
});
