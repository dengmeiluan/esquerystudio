/**
 * 1169 批：RT（索引工作区 / 查询工作台结果表）补齐 QRT 已有的 NDJSON 导出档。
 *
 * 实查两个内核的导出面：QRT 有 `exportNdjson` → CSV/XLSX/JSON/PNG/MD/NDJSON 六档，
 * RT 只有 CSV/XLSX/JSON/MD 四档。用户在索引工作区想「每行一个文档」流式导出
 * （jq / _bulk / 逐行 ingest）时没有入口，而同样的数据在 SQL 结果表里有——
 * 这就是「表格能力没有完全共享」的一处具体差异。
 *
 * 语义与 JSON 档对齐：整文档（_id + _source）、不经 exportCell 矩阵加工，
 * 只是行间换行、无外层数组。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('1169 RT/QRT 导出档位对齐', () => {
  it('RT 的 exportRows 与默认格式偏好都接受 ndjson', () => {
    expect(rt).toMatch(/function exportRows\(fmt: 'json' \| 'csv' \| 'md' \| 'xlsx' \| 'ndjson'\)/);
    /* 2.1.4：偏好由「类型断言」升级为「读取侧归一」——ndjson 仍是合法档，
       存量非法值回落 csv（enumHardening214 锁归一实现）。 */
    expect(rt).toMatch(/usePref<string>\('rt\.export\.fmt', 'csv'\)/);
    expect(rt).toMatch(/EXPORT_FMT_KEYS = \['json', 'csv', 'md', 'xlsx', 'ndjson'\] as const/);
    expect(rt).toMatch(/function setExpFmt\(fmt: [^)]*'ndjson'\)/);
  });

  it('RT 有 ndjson 分支：一行一文档、mime 为 application/x-ndjson', () => {
    expect(rt).toContain("} else if (fmt === 'ndjson') {");
    expect(rt).toMatch(/application\/x-ndjson/);
    /* 语义必须是整文档（_id + _source），与 JSON 档一致；不能走矩阵 exportCell */
    const branch = rt.slice(rt.indexOf("fmt === 'ndjson'"), rt.indexOf("fmt === 'md'"));
    expect(branch).toContain('_id: r._id');
    expect(branch).toContain('_source');
    expect(branch).not.toContain('xExpCell');
  });

  it('默认格式菜单可切到 NDJSON（用户能找到入口）', () => {
    expect(rt).toContain("key: 'fmt-ndjson'");
  });

  it('两侧内核的对外格式集合一致（防再次分叉）', () => {
    const rtFmts = [...rt.matchAll(/key: 'fmt-(\w+)'/g)].map(m => m[1]).sort();
    expect(rtFmts).toEqual(['csv', 'json', 'md', 'ndjson', 'xlsx']);
    /* QRT 自 697 起就具备 NDJSON，作为对照确认这不是单侧发明 */
    expect(qrt).toContain('exportNdjson');
  });
});

/* 1169②：反向缺口——QRT 单元格右键此前只能导 CSV，RT 能就地从单元格导四/五档。
 * 同一次右键，在索引工作台能直达格式，在 SQL 结果表得另开工具行菜单。 */
describe('1169 QRT 单元格右键补导出档', () => {
  it('QRT 导出组里出现五档导出（ndjson 随 exportNdjson 开关）', () => {
    /* 1385：导出从「列与导出…」拆成独立的 exportChildren 组 */
    const at = qrt.indexOf('const exportChildren = [');
    expect(at, '找不到 exportChildren').toBeGreaterThan(-1);
    const seg = qrt.slice(at, at + 1400);
    for (const k of ['export-csv', 'export-xlsx', 'export-json', 'export-md']) {
      expect(seg, `QRT 缺 ${k}`).toContain(`key: '${k}'`);
    }
    expect(seg).toContain("key: 'export-ndjson'");
    expect(seg).toMatch(/props\.exportNdjson \?/);
    /* 五档都必须是「下载」，不能写成 RT 那种「改默认格式」——QRT 没有该偏好 */
    expect(seg).not.toContain('导出格式：');
    for (const fn of ['exportCsv()', 'exportXlsx()', 'exportJson()', 'exportMd()', 'exportNdjsonFile()']) {
      expect(seg, `五档必须复用工具行同一函数：${fn}`).toContain(fn);
    }
  });

  it('无记忆维度时列操作组整组不出（只有「导出…」在场）', () => {
    /* 1385：拆分后「导出…」恒在，「列操作…」随 barOn 门控 */
    expect(qrt, '导出组恒在').toMatch(/label: '导出…'/);
    expect(qrt, '列操作组在场').toMatch(/label: '列操作…'/);
    expect(qrt, '列操作组必须受 colOpsChildren 长度门控').toMatch(/\.\.\.\(colOpsChildren\.length \? \[colGroup\]/);
    /* 反向：列管理项必须仍在 barOn 门内（不能因为补导出把门拆了） */
    const at = qrt.indexOf('const colOpsChildren = [');
    expect(at, '找不到 colOpsChildren').toBeGreaterThan(-1);
    const seg = qrt.slice(at, at + 900);
    expect(seg).toMatch(/\.\.\.\(barOn\.value \? \[/);
    expect(seg).toContain("key: 'hide-col'");
  });

  it('两侧导出能力面对齐：RT 五格式 ⇄ QRT 五格式', () => {
    const rtFmts = [...rt.matchAll(/key: 'fmt-(\w+)'/g)].map(m => m[1]).sort();
    const qrtAt = qrt.indexOf('const exportChildren = [');
    const qrtFmts = [...qrt.slice(qrtAt, qrtAt + 1400).matchAll(/key: 'export-(\w+)'/g)].map(m => m[1]).sort();
    expect(qrtFmts).toEqual(['csv', 'json', 'md', 'ndjson', 'xlsx']);
    expect(rtFmts).toEqual(qrtFmts);
  });
});
