/**
 * 一千一百三十九批：SQL 结果行高档位——无偏好工具行的通道也能切行高。
 *
 * 1141 同步更新（架构收口）：SQL 结果工具行并入表格内核（tableBar），行高从
 * 「宿主图标钮调内核 cycleRowH」改为「内核『视图 ⋯』菜单三档直选」——同一
 * useTablePrefs 全局键 es_tbl_rowh，宿主手写钮退役，能力不减反增（显式三选）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const sql = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

describe('1139/1141 SQL 结果行高档位（内核共享件）', () => {
  it('QRT 内核保留 cycleRowH 透出 + 视图菜单三档直选', () => {
    expect(qrt).toContain('  cycleRowH,\n');
    expect(qrt).toContain("setRowH('compact')");
    expect(qrt).toContain("setRowH('cozy')");
    const prefs = readFileSync(join(__dirname, '../composables/useTablePrefs.ts'), 'utf-8');
    expect(prefs).toContain('es_tbl_rowh');
  });

  it('SQL 走内核 tableBar（不再挂宿主手写行高/导出钮）', () => {
    expect(sql).toContain('table-bar');
    expect(sql).not.toContain('data-test="sql-rowh"');
    expect(sql).not.toMatch(/function exportCsv\(\)/);
  });
});
