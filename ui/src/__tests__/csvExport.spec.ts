/**
 * R130 第七十六批：Lucene/PIT 结果 CSV 导出对齐——导出能力矩阵补全。
 * 背景：导出口径此前不统一——ResultTable 消费方（IndexHub docs/qry、DslQuery）JSON+CSV、
 * SQL 通道 CSV（二十八批，QRT getSortedRows expose）、Lucene/PIT 仅 JSONL；
 * Excel 用户在 Lucene/PIT 通道无 CSV 可用。修：
 *  - QRT 新增 getCsvBlock expose（列头=可见列、行=排序后矩阵按可见列对齐——所见即所得，
 *    列选隐藏的列不导出；列对齐逻辑留在列推导处，消费方零列知识）；
 *  - LuceneQueryView：CSV 钮（表格视图启用），经 getCsvBlock 导 lucene-<ts>.csv；
 *  - PitScrollView：CSV 钮，与 JSONL 同数据源（全量 buffer），列=_id+_source 键并集。
 * 锁定（静态）：QRT expose 在场；两视图接线 + csvCell/BOM 格式与 SQL 同口径。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const qrtSrc = readFileSync(join(SRC, 'components/QueryResultTable.vue'), 'utf-8');
const luceneSrc = readFileSync(join(SRC, 'views/LuceneQueryView.vue'), 'utf-8');
const pitSrc = readFileSync(join(SRC, 'views/PitScrollView.vue'), 'utf-8');

describe('Lucene/PIT CSV 导出对齐（七十六批）', () => {
  it('QRT 暴露 getCsvBlock（列头+行矩阵按可见列对齐；174 批起抽 csvBlock 内部函数共用）', () => {
    expect(qrtSrc).toMatch(/getCsvBlock:\s*csvBlock/);
    expect(qrtSrc).toMatch(/head: shownCols\.value\.slice\(\)/);
    /* 五百三十批 W-B 同步更新：csvBlock 行源改 srcRows（exportRowFilter 行级过滤收口，
       缺省 undefined=sortedRows 全量恒等），矩阵成型字面不变 */
    expect(qrtSrc).toMatch(/srcRows\.map\(r => idxs\.map\(i =>/);
  });

  it('Lucene 接线：getCsvBlock 消费 + SQL 同格式（561 同步更新：非聚焦宿主 CSV 钮退役走 QRT 内建，聚焦 JSON 工具行 CSV 保留）', () => {
    /* 561 同步更新：卡头表格视图门控 CSV 钮退役（QRT 内建导出钮 bar-right 常驻承接）；
       聚焦 JSON 工具行（460 批锚不动）的 CSV 钮保留宿主 exportCsv 通道 */
    expect(luceneSrc).toMatch(/@click="exportCsv" :disabled="!hits\.length"/);
    expect(luceneSrc).not.toMatch(/@click="exportCsv" :disabled="viewMode !== 'table'/);
    expect(luceneSrc).toMatch(/ref="resultTbl"/);
    expect(luceneSrc).toMatch(/resultTbl\.value\?\.getCsvBlock\?\.\(\)/);
    expect(luceneSrc).toMatch(/text\/csv;charset=utf-8', \{ bom: true \}/);
    expect(luceneSrc).toMatch(/import \{[^}]*csvCell[^}]*\} from '\.\.\/utils\/format'/);
  });

  it('PIT 接线：CSV 钮（buffer 门控）+ 全量导出 + 键并集', () => {
    expect(pitSrc).toMatch(/@click="exportCsv" :disabled="!buffer\.length"/);
    expect(pitSrc).toMatch(/for \(const k of Object\.keys\(h\._source \?\? \{\}\)\) colsSet\.add\(k\)/);
    expect(pitSrc).toMatch(/pit-\$\{index\.value\}-\$\{exportStamp\(\)\}\.csv/); /* 255 批时间戳 */
    expect(pitSrc).toMatch(/csvText\(cols, rows\)/); /* csvText 单源收编：表头/BOM/换行统一，行为锁细节见 pitCsvChannel921 */
  });

  it('八十九批：Lucene 导出文件名带索引上下文（JSONL/CSV，对齐 RT/PIT 命名）', () => {
    expect(luceneSrc).toContain("lucene-${index.value || 'no-index'}-${exportStamp()}.jsonl"); /* 255 批时间戳 */
    expect(luceneSrc).toContain("lucene-${index.value || 'no-index'}-${exportStamp()}.csv"); /* 255 批时间戳 */
  });
});

/* 七十八批：DslQueryView「导出本页」对齐 RT 导出语义（排序序+勾选过滤）——
   此前用 resp.hits 原始序且无视勾选，与 RT 内导出入口割裂（77 批同款）。
   RT 抽 getExportRows expose 统一出口；行为语义由 resultTableMemory 77 批用例覆盖。 */
describe('DslQueryView 导出本页对齐（七十八批）', () => {
  const dslSrc = readFileSync(join(SRC, 'views/DslQueryView.vue'), 'utf-8');

  it('RT 暴露 getExportRows 且内部 exportRows 与之共用 currentExportRows', () => {
    const rtSrc = readFileSync(join(SRC, 'components/ResultTable.vue'), 'utf-8');
    expect(rtSrc).toMatch(/function currentExportRows\(\)/);
    expect(rtSrc).toMatch(/getExportRows: currentExportRows/);
    expect(rtSrc.match(/currentExportRows\(\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('DslQueryView exportJson 经 getExportRows（禁回潮直用 resp.hits）', () => {
    expect(dslSrc).toMatch(/resultTbl\.value\?\.getExportRows\?\.\(\) \?\? resp\.value\.hits/);
    expect(dslSrc).not.toMatch(/JSON\.stringify\(resp\.value\.hits\.map/);
  });
});
