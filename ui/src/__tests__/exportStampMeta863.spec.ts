/**
 * 八百六十三批：XLSX meta「导出时间」本地时归一刀（buildExportSheets 单源）。
 * 背景：meta sheet「导出时间」此前用 new Date().toISOString()——UTC ISO 串写进
 * Excel 后比用户本地钟慢 8 小时（东八区实感）；同项目 Xmigrate TSV 导出与
 * IndexOptimizer 导出元数据均已立法本地时（注释明示「UTC 会让 Excel 里的时间
 * 差 8 小时」「exportStamp 本地时，与文件名同源」），全站表格双内核（RT/QRT）
 * 的 XLSX 导出单源是同域漏网件。刀面=改走 utils/format.exportStamp()——
 * 与导出文件名时间戳同源（meta 时间与文件名时间可互核），形态 yyyyMMdd-HHmmss。
 * 锁定：
 * 1) fake clock 下 meta「导出时间」值与 exportStamp() 逐字等值（同钟无抖动）；
 * 2) 值形态=本地时命名档 /^\d{8}-\d{6}$/，UTC ISO 特征（T 分隔/Z 后缀）禁入；
 * 3) 源码锁：exportSheets.ts 单源内 toISOString 禁入（防回潮）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildExportSheets } from '../utils/exportSheets';
import { exportStamp } from '../utils/format';

const src = readFileSync(join(__dirname, '../utils/exportSheets.ts'), 'utf-8');

afterEach(() => { vi.useRealTimers(); });

describe('exportStampMeta863：XLSX meta 导出时间本地时档', () => {
  it('fake clock 下 meta「导出时间」与 exportStamp() 逐字等值（与文件名时戳同源）', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T11:45:30'));
    const [, meta] = buildExportSheets([], { head: ['c'], rows: [[1]] });
    const stampRow = meta.rows.find(r => r[0] === '导出时间');
    expect(stampRow).toBeDefined();
    expect(String(stampRow?.[1])).toBe(exportStamp());
  });

  it('值形态=本地时命名档 yyyyMMdd-HHmmss；UTC ISO 特征（T 分隔/Z 后缀）禁入', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T11:45:30'));
    const [, meta] = buildExportSheets([['索引', 'idx-1']], { head: ['c'], rows: [[1]] });
    const stampRow = meta.rows.find(r => r[0] === '导出时间');
    expect(String(stampRow?.[1])).toMatch(/^\d{8}-\d{6}$/);
    expect(String(stampRow?.[1])).not.toMatch(/T|\dZ$/);
    /* 其余 meta 行不受扰 */
    expect(meta.rows[0]).toEqual(['索引', 'idx-1']);
    expect(meta.rows[meta.rows.length - 1]).toEqual(['行数', 1]);
  });

  it('源码锁：exportSheets 单源内 toISOString 禁入（防 UTC 形态回潮）', () => {
    expect(src).not.toContain('toISOString');
  });
});
