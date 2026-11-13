import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/* 七百八十八批·死码域收官刀A：spec 孤儿真死 4 符号清零（deadExport788）。
 * 分型甄别（788-C1）：35 个「仅 spec 消费」孤儿二分——
 *   内部活 30（自用>0=产品主链路内部函数，export 留供单测=测试资产保全豁免）
 *   +真死 4（零自用+零产品+仅 spec）：midEllipsis 整文件（v3.0.1 两页去截断后全站零 import）
 *   /format cellKind/configDiff ES_GENERATED_KEYS（ES_GENERATED 数组经 IGNORE_REASON 活）
 *   /tableRegistry locateInTable（230 批跳列改 t.entry.locate 直连后的过渡孤儿；
 *   visibleTables=CmdPalette:175 活、clearTablesForTest=测试基建豁免）。
 * 刀B=export 冗余 67 去关键字（零外部消费+同文件自用；typecheck+全量把关）。 */

const U = (f: string) => readFileSync(resolve(__dirname, '../utils/' + f), 'utf8');

describe('788 死码域收官刀A：spec 孤儿真死 4 符号任何形态复发即红', () => {
  it('A1 format.ts cellKind 退役（零产品消费，epochMsText/fmtNum 族不受扰）', () => {
    expect(U('format.ts')).not.toContain('cellKind');
  });

  it('A2 configDiff.ts ES_GENERATED_KEYS 退役（ES_GENERATED 数组本体经 IGNORE_REASON 活）', () => {
    expect(U('configDiff.ts')).not.toContain('ES_GENERATED_KEYS');
    expect(U('configDiff.ts'), '派生源数组活锚').toContain('const ES_GENERATED:');
  });

  it('A3 tableRegistry.ts locateInTable 退役（跳列现役=t.entry.locate 直连）', () => {
    expect(U('tableRegistry.ts')).not.toContain('locateInTable');
  });

  it('A4 midEllipsis.ts 整文件退役（v3.0.1 双页去截断后全站零消费）', () => {
    expect(existsSync(resolve(__dirname, '../utils/midEllipsis.ts'))).toBe(false);
  });

  it('B1 活锚：tableRegistry 三活导出在场（registerTable/visibleTables/clearTablesForTest）', () => {
    const s = U('tableRegistry.ts');
    expect(s).toMatch(/export function registerTable/);
    expect(s).toMatch(/export function visibleTables/);
    expect(s).toMatch(/export function clearTablesForTest/);
  });

  it('B2 活锚：format 高频活导出 fmtNum/fmtTime 在场（防全删绿）', () => {
    expect(U('format.ts')).toMatch(/export function fmtNum\b/);
    expect(U('format.ts')).toMatch(/export function fmtTime\b/);
  });

  it('B3 活锚：命令面板跳列链路源码锁（visibleTables 消费面=CmdPalette 在场）', () => {
    const cmd = readFileSync(resolve(__dirname, '../components/CmdPalette.vue'), 'utf8');
    expect(cmd).toContain("import { visibleTables } from '../utils/tableRegistry'");
  });
});
