/**
 * 矩阵复制内核（RT/QRT 共用）——rows/cols/getVal 三参生成 TSV/Markdown/JSON
 * 剪贴板文本。RT copySelRows 的 TSV/MD 格式化与 copyRegionTsv 的 TSV 分支同源合并；
 * JSON 分支经 jsonRow 钩子保留两表既有语义（RT 行复制=_id+全 _source 文档、
 * QRT 行复制=可见列对象、RT 选区=_id+选区列），格式化细节不在此分叉。
 *
 * 口径铁律（与 RT copySelRows 行为锁一致）：
 * — TSV/MD 的值文本：null/undefined→空串，对象/数组 JSON.stringify；
 * — TSV 单元格内 \t \r \n 折为空格（Excel/飞书直贴不破行）；MD 另转义 |；
 * — 表头行必含（TSV 首行列名、MD 表头+分隔行）。
 */

type MatrixFmt = 'tsv' | 'md' | 'json';

interface MatrixCols<R> {
  rows: readonly R[];
  cols: readonly string[];
  /** (row, col) → 单元格原始值 */
  getVal: (row: R, col: string) => unknown;
  /** json 分支每行输出对象（缺省=按 cols 逐列构造、缺值补 null） */
  jsonRow?: (row: R) => Record<string, unknown>;
}

/** 单元格纯文本化（TSV/MD 共用）：空值空串、对象 JSON、标量 String */
function plain(v: unknown): string {
  return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
}

export function matrixTsv<R>(o: MatrixCols<R>): string {
  return [
    o.cols.join('\t'),
    ...o.rows.map(r => o.cols.map(c => plain(o.getVal(r, c)).replace(/[\t\r\n]/g, ' ')).join('\t')),
  ].join('\n');
}

export function matrixMd<R>(o: MatrixCols<R>): string {
  const esc = (v: unknown) => plain(v).replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
  return [
    '| ' + o.cols.join(' | ') + ' |',
    '| ' + o.cols.map(() => '---').join(' | ') + ' |',
    ...o.rows.map(r => '| ' + o.cols.map(c => esc(o.getVal(r, c))).join(' | ') + ' |'),
  ].join('\n');
}

export function matrixJson<R>(o: MatrixCols<R>): string {
  const arr = o.rows.map(r =>
    o.jsonRow
      ? o.jsonRow(r)
      : Object.fromEntries(o.cols.map(c => [c, o.getVal(r, c) ?? null])),
  );
  return JSON.stringify(arr, null, 2);
}

export function matrixText<R>(o: MatrixCols<R>, fmt: MatrixFmt): string {
  return fmt === 'tsv' ? matrixTsv(o) : fmt === 'md' ? matrixMd(o) : matrixJson(o);
}
