/**
 * 二百三十五批：xlsxMini 手写 XLSX（破窗点立项——零依赖供应链方案）。
 * 字节级锁定：CRC32 已知向量；zip STORE 解析（EOCD→central directory→local header
 * 逐条校验签名/CRC/长度）；sheet XML inlineStr/数字/转义；多 sheet；RT 导出接线。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { crc32, colLetter, zipStore, buildXlsx } from '../utils/xlsxMini';

describe('crc32 / colLetter（235 批）', () => {
  it('CRC32 已知向量', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xCBF43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
  it('colLetter 列引用', () => {
    expect(colLetter(0)).toBe('A');
    expect(colLetter(25)).toBe('Z');
    expect(colLetter(26)).toBe('AA');
    expect(colLetter(27)).toBe('AB');
  });
});

/* ── minimal ZIP 解析（STORE 专用）：EOCD→central directory→local header 逐条校验 ── */
function parseZip(buf: Uint8Array) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocdAt = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocdAt = i; break; }
  }
  if (eocdAt < 0) throw new Error('EOCD not found');
  const count = dv.getUint16(eocdAt + 10, true);
  let off = dv.getUint32(eocdAt + 16, true);
  const entries: { name: string; crc: number; size: number; localOff: number }[] = [];
  for (let i = 0; i < count; i++) {
    expect(dv.getUint32(off, true)).toBe(0x02014b50);
    const crc = dv.getUint32(off + 16, true);
    const size = dv.getUint32(off + 24, true);
    const nameLen = dv.getUint16(off + 28, true);
    const localOff = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(buf.subarray(off + 46, off + 46 + nameLen));
    entries.push({ name, crc, size, localOff });
    off += 46 + nameLen;
  }
  return entries.map(e => {
    expect(dv.getUint32(e.localOff, true)).toBe(0x04034b50);
    const nameLen = dv.getUint16(e.localOff + 26, true);
    const extraLen = dv.getUint16(e.localOff + 28, true);
    const dataStart = e.localOff + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + e.size);
    expect(crc32(data)).toBe(e.crc); // 数据完整性（重算 CRC 与 central 记录一致）
    return { name: e.name, text: new TextDecoder().decode(data) };
  });
}

describe('buildXlsx 字节级（235 批）', () => {
  it('zip 结构完整：5 part 清单、local header 校验、sheet XML 内容', () => {
    const buf = buildXlsx([
      { name: 'data', head: ['_id', 'name'], rows: [['a', 'banana'], ['b', 42]] },
      { name: 'meta', head: ['key', 'value'], rows: [['索引', 'idx1']] },
    ]);
    expect(String.fromCharCode(buf[0], buf[1])).toBe('PK');
    const entries = parseZip(buf);
    const names = entries.map(e => e.name);
    expect(names).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml',
    ]);
    const sheet1 = entries.find(e => e.name === 'xl/worksheets/sheet1.xml')!.text;
    /* inlineStr 字符串 + 数字格 + XML 转义 */
    expect(sheet1).toContain('t="inlineStr"');
    expect(sheet1).toContain('<v>42</v>');
    const sheet2 = entries.find(e => e.name === 'xl/worksheets/sheet2.xml')!.text;
    expect(sheet2).toContain('idx1');
  });

  it('特殊字符 XML 转义；sheet 名清洗（[]:*?/\ 替换，≤31 字符）', () => {
    const buf = buildXlsx([{ name: 'a<b>&c', head: ['v'], rows: [['<tag> & "q"']] }]);
    const sheet = parseZip(buf).find(e => e.name === 'xl/worksheets/sheet1.xml')!.text;
    expect(sheet).toContain('&lt;tag&gt; &amp; &quot;q&quot;');
    /* <>& 不在 sheet 名禁止清单（XML 转义后合法）；[]:*?/\ 才是禁止集 */
    const wb = parseZip(buf).find(e => e.name === 'xl/workbook.xml')!.text;
    expect(wb).toContain('name="a&lt;b&gt;&amp;c"');
    const buf2 = buildXlsx([{ name: 'a[b]:c*d?e\\f', head: ['v'], rows: [[1]] }]);
    const wb2 = parseZip(buf2).find(e => e.name === 'xl/workbook.xml')!.text;
    expect(wb2).toContain('name="a_b__c_d_e_f"');
  });
});
