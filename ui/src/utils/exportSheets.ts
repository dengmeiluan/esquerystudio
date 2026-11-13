/**
 * XLSX 双 sheet 装配单源（RT 1189-1205 / QRT 1822-1834 逐字同构合并，
 * 唯一实差=meta 差异字段——RT 有「索引/范围」、QRT 无，以 meta0 前置行参数化注入）。
 * data sheet 原样直通；meta sheet 表头恒 ['key','value']，行集=[...meta0,
 * ['导出时间', exportStamp], ['行数', data.rows.length]]。buildXlsx 装配仍归 utils/xlsxMini。
 */
import { exportStamp } from './format';

interface ExportSheet { name: string; head: string[]; rows: unknown[][] }

export function buildExportSheets(
  /** 差异字段前置行（RT：索引/范围；QRT：空档） */
  meta0: ReadonlyArray<readonly [string, unknown]>,
  /** data sheet 装配体（head+rows；单元格加工由调用方管道完成） */
  data: { head: readonly string[]; rows: readonly unknown[][] },
): [ExportSheet, ExportSheet] {
  const sheet: ExportSheet = { name: 'data', head: [...data.head], rows: data.rows.map(r => [...r]) };
  const meta: ExportSheet = {
    name: 'meta',
    head: ['key', 'value'],
    rows: [
      ...meta0.map(([k, v]) => [k, v] as unknown[]),
      /* 本地时命名档（exportStamp 单源）：UTC 形态的 ISO 串写进 Excel 后，
 东八区用户看到的「导出时间」比自己的钟慢 8 小时；与导出文件名时戳同源，
 两处可互核（Xmigrate TSV / IndexOptimizer 导出元数据同款处理） */
      ['导出时间', exportStamp()],
      ['行数', data.rows.length],
    ],
  };
  return [sheet, meta];
}
