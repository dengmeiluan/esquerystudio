import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/* 七百八十七批·死码域续程首刀：utils 域死导出清零看守（deadExport787）。
 * 扫描方法论=785/786 平移+787 三折修正：
 *   ①行锚定 import 解析（行尾注释含「import 」字样会诱发跨语句错位匹配）；
 *   ②import 别名记源符号（import { a as b } 判活查 a 非 b）；
 *   ③utils/__tests__ 相对路径 '../x' 与多行 import 拼接（跨行符号漏报双源）；
 *   ④readFileSync 源码文本锁形态（chartNarrowTier649 型）静态 import 扫描不可见——
 *     机器名单须人工全文 grep 终审（LD_H_NARROW 因此剔除：spec 文本锁活的）。
 * 终名单 3 符号/2 文件：epochToDisplay/looksLikeTimeField（format.ts）+regexFilter（minijq.ts）。
 * 备案域不动（另有裁决）：类型 export 冗余 38+spec 孤儿值 35+export 冗余值 29。 */

const fmt = readFileSync(resolve(__dirname, '../utils/format.ts'), 'utf8');
const mj = readFileSync(resolve(__dirname, '../utils/minijq.ts'), 'utf8');

describe('787 utils 域死导出清零（三域零消费+零自用=真死，整符号删）', () => {
  it('A1 format.ts epochToDisplay 退役（R130 epochMsText 演进替代的史志孤儿，任何形态复发即红）', () => {
    expect(fmt).not.toContain('epochToDisplay');
  });

  it('A2 format.ts looksLikeTimeField 退役（零调用单行正则函数）', () => {
    expect(fmt).not.toContain('looksLikeTimeField');
  });

  it('A3 minijq.ts regexFilter 退役（零调用，jq 主入口不受扰）', () => {
    expect(mj).not.toContain('regexFilter');
  });

  it('B1 活锚：epochMsText 在场（演进后继者，RT/QRT 消费）——防全删绿', () => {
    expect(fmt).toMatch(/export function epochMsText/);
  });

  it('B2 活锚：minijq 主入口 jq 在场', () => {
    expect(mj).toMatch(/export function jq\(/);
  });

  it('B3 活锚：format 高频活导出 fmtNum/fmtTime 在场（全站表格消费面）', () => {
    expect(fmt).toMatch(/export function fmtNum\b/);
    expect(fmt).toMatch(/export function fmtTime\b/);
  });
});
