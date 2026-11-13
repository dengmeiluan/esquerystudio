import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const ALT = readFileSync(join(__dirname, '../components/AltHitsViews.vue'), 'utf-8');

/* 产线实报：100 行 × 百列，SQL 结果表任意点击/切换格式阻塞数秒。
   两条护栏：① rows 派生档 JSON/Tree 只渲染当前文档（受控游标）；
   ② 主表单元格展示值走 cellMeta 缓存，模板不再逐格调 Intl/JSON 函数。 */
describe('大结果集结果表性能护栏', () => {
  it('rows 派生档 JSON/Tree 单文档渲染且游标受控', () => {
    expect(QRT).toContain(':per-doc="altDocsDerived"');
    expect(QRT).toContain(':doc-html="altDocJsonHtml"');
    expect(QRT).toContain(':doc-data="altDocTreeData"');
    expect(QRT).toContain(':doc-index="altDocsDerived ? altDocIdx : undefined"');
    expect(ALT).toContain("v-html=\"perDoc ? (docHtml || '') : jsonHtml\"");
    expect(ALT).toContain(':data="perDoc ? (docData ?? []) : treeData"');
    expect(ALT).toContain("(e: 'update:doc-index', idx: number): void;");
  });

  it('SQL 结果高度只扣真实占位，不用页面 scrollHeight 形成反馈环', () => {
    const sql = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
    expect(sql).toContain('el.getBoundingClientRect().bottom - (rect.top + rect.height)');
    expect(sql).toContain('el.nextElementSibling');
    expect(sql).not.toContain('pager.scrollHeight - (topInPage + rect.height)');
    expect(sql).toContain('.qrt-wrap, .qrt-alt-body');
  });

  it('主表单元格展示值走 cellMeta 缓存，不在模板逐格重算', () => {
    expect(QRT).toContain('const cellMeta = computed');
    expect(QRT).toContain('cellMeta[ri]?.[ci]?.text');
    const cellIdx = QRT.indexOf('class="qrt-cell"');
    expect(cellIdx).toBeGreaterThan(-1);
    const block = QRT.slice(cellIdx, cellIdx + 4000);
    expect(block).not.toContain('semToneCls(cell, ci)');
    expect(block).not.toContain('fullText(cell)');
    expect(block).not.toContain('displayText(cell, ri, ci)');
  });
});