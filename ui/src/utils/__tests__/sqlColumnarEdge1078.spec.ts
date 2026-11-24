/* 1078：SQL 大结果/列式边界——取消后旧行诚实标过期；导出注脚说明 cursor 未取完/结果过期。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportCaveat, hasSqlRowsShape } from '../sqlResult';

describe('1078 exportCaveat', () => {
  it('正常新鲜结果无注脚；cursor 未取完/结果过期分别与组合', () => {
    expect(exportCaveat(false, false)).toBe('');
    expect(exportCaveat(true, false)).toBe('；cursor 未取完，仅导出已加载行');
    expect(exportCaveat(false, true)).toBe('；结果已过期，请重新执行');
    expect(exportCaveat(true, true)).toBe('；cursor 未取完，仅导出已加载行；结果已过期，请重新执行');
  });
});

describe('1079 响应形态守卫', () => {
  it('只有 rows 或 values 才算成功；两者都缺不按 0 行成功', () => {
    expect(hasSqlRowsShape({ rows: [] })).toBe(true);
    expect(hasSqlRowsShape({ values: [[], []] })).toBe(true);
    expect(hasSqlRowsShape({ columns: [{ name: 'a' }] })).toBe(false);
    expect(hasSqlRowsShape(null)).toBe(false);
    expect(hasSqlRowsShape({ rows: 'bad' })).toBe(false);
  });
});

describe('1078 SqlConsole 边界接线', () => {
  const src = readFileSync(join(__dirname, '../../views/SqlConsoleView.vue'), 'utf-8');

  it('取消查询：已有旧行标过期并在提示中说明', () => {
    expect(src).toMatch(/if \(e\?\.name === 'AbortError'\) \{\r?\n\s*if \(rows\.value\.length\) \{\r?\n\s*resultStale\.value = true;\r?\n\s*staleLabel\.value = '查询已取消';/);
    expect(src).toContain('旧结果已标记过期');
  });

  it('首查/续页形态异常不当 0 行成功；续页失败保留 cursor 并提示重试', () => {
    expect(src).toContain("if (!hasSqlRowsShape(r)) throw new Error('SQL 响应形态异常");
    expect(src).toContain('分页响应形态异常（缺少 rows/values）；cursor 已保留，可重试');
    expect(src).toContain("'（cursor 已保留，可重试）'");
  });

  it('CSV/NDJSON 导出都带 cursor/过期注脚与真实行数', () => {
    /* 1141：导出实现收口表格内核（导出门 five formats + NDJSON），注脚经 :export-note
       单源传入；两档共用同一注脚函数，口径不变 */
    expect(src).toContain(':export-note="exportCaveat(!!cursor, resultStale)"');
    expect(src).toContain('export-ndjson');
    const qrt = readFileSync(join(__dirname, '../../components/QueryResultTable.vue'), 'utf-8');
    expect(qrt).toContain('已导出 ${blk.rows.length} 行（CSV）${props.exportNote}');
    expect(qrt).toContain('已导出 ${lines.length} 行（NDJSON）${props.exportNote}');
  });
});
