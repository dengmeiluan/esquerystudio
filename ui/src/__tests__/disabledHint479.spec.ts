/**
 * 四百七十九批：禁用原因可发现性补齐（478 seg 提示的推广）——不自明的禁用钮
 * 补 title：Lucene 架构分析（请先选索引）/执行（选索引+输语句）/
 * SqlConsole 执行（输 SQL）/到 DSL 页（先执行转换）。
 * 自明禁用（busy 文字已变、名字没填）不重复提示。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');

describe('禁用原因可发现性（479 批）', () => {
  it('Lucene：架构分析/执行钮禁用原因 title', () => {
    const v = readFileSync(join(SRC, 'views/LuceneQueryView.vue'), 'utf-8');
    /* 561 同步更新：两钮 title 改随态三元（SqlConsole 执行钮 525 W10 同语言）——479 契约
       保留在 else 支逐字不动（「请先选择索引」/「请先选择索引并输入查询语句」仍是
       禁用原因唯一文案），条件齐备时出功能描述 */
    expect(v).toContain('<button class="btn ghost sm" :title="index ? \'探测当前索引字段，提前提醒 SQL 失能字段（在 Lucene 里不受影响）\' : \'请先选择索引\'" @click="doSchema"');
    expect(v).toContain('<button class="btn primary sm" :title="index && qs.trim() ? \'执行 Lucene 查询\' : \'请先选择索引并输入查询语句\'" @click="doRun"');
  });

  it('SqlConsole：执行/到 DSL 页禁用原因 title', () => {
    const v = readFileSync(join(SRC, 'views/SqlConsoleView.vue'), 'utf-8');
    /* 五百二十五批 W10 同步更新：执行钮 title 改随态（:title 三元）——空 SQL 档仍是
       「请输入 SQL 语句」禁用原因文案（479 原契约保留在三元 else 支），有 SQL 时提示快捷键 */
    expect(v).toContain('<button class="btn primary sm" :title="sql.trim() ? (selScope ? \'仅执行选中的 \' + selScope.lines + \' 行（\' + execHint + \'）；清除选区后执行整篇\' : (multiStmt ? \'仅执行光标所在语句（第 \' + cursorStmtNo + \' 条 / 共 \' + stmtScopes.length + \' 条；\' + execHint + \'）；选中一段可只跑选段\' : \'执行（\' + execHint + \'）\')) : \'请输入 SQL 语句\'" @click="doRun"');
    /* 1125：到 DSL 页新增「预览过期」禁用原因；无预览原因原契约保留在 else 支 */
    expect(v).toContain(':disabled="!dslPreview || dslPreviewStale"');
    expect(v).toContain("dslPreviewStale ? '预览来自上一版 SQL——请先点顶部「到 DSL」重新生成' : '先执行 SQL 转换生成 DSL'");
  });
});
