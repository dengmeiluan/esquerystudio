/**
 * 三百零四批：SqlConsole 补 NDJSON 导出（与 Lucene/PIT 通道对齐；列名作键还原行对象）。
 *
 * 1141 同步更新（架构收口，能力不降）：宿主手写 exportNdjson 退役——NDJSON 成为
 * 表格内核「导出 ▾」菜单的一档（exportNdjson prop，行对象键=可见列），SQL 只接线
 * 不实现，与 CSV/XLSX/MD/JSON/PNG 同出口。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('SqlConsole NDJSON 导出（304 批；1141 收口内核）', () => {
  it('SQL 接线 export-ndjson（宿主不再手写导出函数）', () => {
    expect(v).toContain('export-ndjson');
    expect(v, '宿主手写 NDJSON 导出退役').not.toMatch(/function exportNdjson\(\)/);
  });

  it('内核提供 NDJSON 档：行对象键=可见列 + ndjson MIME', () => {
    expect(qrt).toContain('导出当前视图 NDJSON');
    expect(qrt).toMatch(/function exportNdjsonFile\(\)/);
    expect(qrt).toMatch(/blk\.head\.forEach\(\(c, i\) => \{ o\[c\] = r\[i\] \?\? null; \}\);/);
    expect(qrt).toMatch(/application\/x-ndjson/);
  });
});
