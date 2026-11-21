/* 手写 minimal XLSX（破窗点立项——供应链零依赖方案，不引 sheetjs/npm xlsx）。
 范围刻意收窄：STORE 不压缩（免 deflate）、单元格 inlineStr（免 sharedStrings 索引）、
 仅字符串/数字/空三种形态、多 sheet。够「数据交付」用，不做样式/公式/合并格。
 ⚠ 测试必须字节级解析（CRC32 已知向量 + central directory + local header 校验），
 字符串包含断言防不住 Excel「文件已损坏」类翻车。 */

/* ── CRC32（IEEE 802.3，查表法）── */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ── UTF-8 ── */
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/* ── ZIP（STORE）：local headers + 数据 + central directory + EOCD ── */
interface ZipEntry { name: string; data: Uint8Array }

export function zipStore(files: ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const w16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
  const w32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  const cat = (arrs: ReadonlyArray<ArrayLike<number>>) => { const out = new Uint8Array(arrs.reduce((a, b) => a + b.length, 0)); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };

  for (const f of files) {
    const name = enc(f.name);
    const crc = crc32(f.data);
    const local = cat([[0x50, 0x4b, 0x03, 0x04], w16(20), w16(0), w16(0), w16(0), w16(0), w32(crc), w32(f.data.length), w32(f.data.length), w16(name.length), w16(0), [...name]]);
    chunks.push(local, f.data);
    const central = cat([[0x50, 0x4b, 0x01, 0x02], w16(20), w16(20), w16(0), w16(0), w16(0), w16(0), w32(crc), w32(f.data.length), w32(f.data.length), w16(name.length), w16(0), w16(0), w16(0), w16(0), w32(0), w32(offset), [...name]]);
    centrals.push(central);
    offset += local.length + f.data.length;
  }
  const cdSize = centrals.reduce((a, b) => a + b.length, 0);
  const eocd = cat([[0x50, 0x4b, 0x05, 0x06], w16(0), w16(0), w16(files.length), w16(files.length), w32(cdSize), w32(offset), w16(0)]);
  const all = [...chunks, ...centrals, eocd];
  return cat(all);
}

/* ── XML ── */
function xmlEsc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/** 0→A、25→Z、26→AA（ECMA-376 列引用） */
export function colLetter(i: number): string {
  let s = '', n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

function sheetXml(head: string[], rows: any[][]): string {
  const cell = (r: number, c: number, v: any): string => {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${colLetter(c)}${r}"><v>${v}</v></c>`;
    return `<c r="${colLetter(c)}${r}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(v))}</t></is></c>`;
  };
  const rowXml = (r: number, cells: string[]) => `<row r="${r}">${cells.join('')}</row>`;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
    rowXml(1, head.map((h, c) => cell(1, c, h))),
    ...rows.map((row, ri) => rowXml(ri + 2, row.map((v, c) => cell(ri + 2, c, v)))),
    '</sheetData></worksheet>',
  ];
  return lines.join('');
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

interface XlsxSheet { name: string; head: string[]; rows: any[][] }

/** sheets → xlsx 字节（sheet 名按 ECMA-376 限制清洗：≤31 字符、去 []:*?/\） */
export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  const safe = (n: string) => (n.replace(/[\[\]:*?/\\]/g, '_').slice(0, 31) || 'Sheet1');
  const names = sheets.map(s => safe(s.name));
  const files: ZipEntry[] = [
    { name: '[Content_Types].xml', data: enc(XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>') },
    { name: '_rels/.rels', data: enc(XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: 'xl/workbook.xml', data: enc(XML_HEAD + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>') },
    { name: 'xl/_rels/workbook.xml.rels', data: enc(XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + '</Relationships>') },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc(sheetXml(s.head, s.rows)) })),
  ];
  return zipStore(files);
}
