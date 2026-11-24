/**
 * 二百九十二批：行高/密度全局键守卫——es_tbl_rowh/es_tbl_dense 只写全局键，
 * 任何按维度写入（es_tbl_rowh:<dim>）都是行高一致性回潮（用户实报 242 批）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');

function walk(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (p.includes('__tests__')) continue;
    const st = require('node:fs').statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (p.endsWith('.vue') || p.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

describe('行高/密度全局键守卫（292 批）', () => {
  it('禁写维度化行高/密度键（读侧兼容迁移除外——setItem 层面禁）', () => {
    const bad: string[] = [];
    for (const f of walk(join(SRC, 'views')).concat(walk(join(SRC, 'components'))).concat(walk(join(SRC, 'composables')))) {
      const s = readFileSync(f, 'utf-8');
      /* 852 批同步更新：写侧走 writeStoredRaw 单源后，扫描器两形态同捕（裸 setItem 与单源调用） */
      for (const m of s.matchAll(/(?:setItem\(\s*|writeStoredRaw\(\s*[^,]+,\s*)'(es_tbl_rowh:|es_tbl_dense:)/g)) {
        bad.push(`${f} → ${m[1]}`);
      }
    }
    expect(bad, '维度化行高/密度写入（回潮）:\n' + bad.join('\n')).toEqual([]);
  });
  it('写入只落全局键（useTablePrefs 内核）', () => {
    const s = readFileSync(join(__dirname, '../composables/useTablePrefs.ts'), 'utf-8');
    expect(s).toContain("writeStoredRaw(localStorage, 'es_tbl_rowh', v)");
    expect(s).toContain("writeStoredRaw(localStorage, 'es_tbl_dense', dense.value ? '1' : '0')");
  });
});
