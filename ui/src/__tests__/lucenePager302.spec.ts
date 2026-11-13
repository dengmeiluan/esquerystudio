/**
 * 三百零二批：Lucene 通道翻页与全站统一——自制「上页/下页」按钮退役换共享 Pagination
 * （页码跳页+页大小下拉），页大小迁移共享键 es_pager_size（回落旧 lucene.size）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');

describe('Lucene 共享分页（302 批）', () => {
  it('Pagination 接线+旧按钮退役', () => {
    expect(v).toMatch(/<Pagination :page="page" :total-pages="totalPages" :page-size="size"/);
    expect(v).not.toMatch(/> 上页</);
    expect(v).not.toMatch(/> 下页</);
    expect(v).not.toMatch(/function prev\(\)/);
    expect(v).not.toMatch(/function next\(\)/);
  });
  it('页大小共享键迁移+goPage 真分页', () => {
    expect(v).toMatch(/es_pager_size/);
    expect(v).toMatch(/from\.value = \(p - 1\) \* size\.value/);
    expect(v).toMatch(/const totalPages = computed\(\(\) => Math\.max\(1, Math\.ceil\(total\.value \/ Math\.max\(1, size\.value\)\)\)\)/);
  });
});
