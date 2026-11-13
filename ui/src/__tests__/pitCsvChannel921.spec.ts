/**
 * PIT 导出 CSV 收编 csvText 单源——表头列名此前手写引号拼接（`"${c}"`），列名含
 * 双引号时产物破格；csvText 单源（format.ts，Browser/MatchMatrix/Security/Snapshots
 * 同源）内部 csvCell 转义表头与单元格、统一前置 BOM，本页手写拼装退役。
 * 锁定（静态）：downloadText 走 csvText(cols, rows)；手写引号形态与裸 bom 选项不回潮
 * （双 BOM 禁）；单元格语义保真=fmtCell 先行（空值 ∅/对象 JSON 序列化）再由 csvText 转义。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const pitSrc = readFileSync(join(SRC, 'views/PitScrollView.vue'), 'utf-8');

describe('PIT CSV 导出收编 csvText 单源', () => {
  it('exportCsv 走 csvText 单源（表头引号/BOM/换行统一），手写拼装不回潮', () => {
    expect(pitSrc).toMatch(
      /downloadText\(`pit-\$\{index\.value\}-\$\{exportStamp\(\)\}\.csv`, csvText\(cols, rows\), 'text\/csv;charset=utf-8'\)/,
    );
    expect(pitSrc, '列名手写引号拼接退役（转义收编 csvCell）').not.toMatch(/`\$\{c\}"`/);
    expect(pitSrc, 'BOM 由 csvText 统一前置，裸 bom 选项禁回潮（双 BOM）').not.toMatch(/\{ bom: true \}/);
  });

  it('单元格语义保真：fmtCell 先行格式化（空值 ∅/对象 JSON），csvText 只做引号转义', () => {
    expect(pitSrc).toMatch(/cols\.map\(c => fmtCell\(c === '_id' \? h\._id \?\? null : \(h\._source \?\? \{\}\)\[c\] \?\? null\)\)/);
  });
});
