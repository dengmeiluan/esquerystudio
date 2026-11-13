/**
 * v3.0.0 场景语义分档批：高亮色系语义矩阵 + 数值列右对齐补链。
 *
 * N7 实锤：RT 163 批「数值列自动右对齐」三链断在最后一环——numericCols computed
 * 与模板挂类俱在，.num-col 样式从未定义，数字列一直左对齐。
 * N8 同病：QRT 有 fieldTypes 类型映射却无任何右对齐能力（类型判定比采样法准）。
 *
 * 高亮色系语义矩阵（盘点定档，回归锁防止混色漂移）：
 *   搜索命中mark(实底warn) / 当前命中(环or橙底) / JSON语法四色(key蓝/值绿/数黄/布粉)
 *   / 语义徽标pill四色(green黄红蓝) / diff增删(成功绿/危险红) / ES highlight(em.hl弱底)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('数值列右对齐语义分档（v3.0.0 N7/N8 纠错）', () => {
  it('N7: RT .num-col 样式已定义（右对齐+tabular-nums）', () => {
    expect(rt).toContain('.rt-cell.num-col { text-align: right; font-variant-numeric: tabular-nums; }');
    expect(rt).toContain("'num-col': numericCols.has(c)");
  });

  it('N8: QRT 接入类型判定 isNumericCol + 样式', () => {
    expect(qrt).toContain("'num-col': cellMeta[ri]?.[ci]?.numeric");
    expect(qrt).toContain('function isNumericCol(col: string): boolean');
    expect(qrt).toContain('props.fieldTypes?.[col]');
    expect(qrt).toContain('.qrt-cell.num-col { text-align: right; font-variant-numeric: tabular-nums; }');
  });

  it('类型判定口径与语义色同族（numeric 类型正则一致）', () => {
    expect(qrt).toContain('const NUMERIC_TYPES_RE = /^(long|integer|short|byte|double|float|half_float|scaled_float|unsigned_long)$/');
  });
});

describe('高亮色系语义矩阵（防混色漂移锁）', () => {
  it('搜索命中 mark 全家族统一 warn 实底（六处：rt/qrt/jt/mft/mt/dotkey）', () => {
    const markStyle = 'background: var(--warn); color: var(--tx-on-strong); border-radius: 2px; padding: 0 1px;';
    expect(rt).toContain(`.rt-val mark.rt-mark { ${markStyle} }`);
    expect(qrt).toContain(`mark.qrt-mark { ${markStyle} }`);
    expect(readFileSync(join(__dirname, '../components/JsonTree.vue'), 'utf-8')).toContain(`:deep(.jt-mark) { ${markStyle} }`);
    expect(readFileSync(join(__dirname, '../components/MappingFieldTree.vue'), 'utf-8')).toContain(`.mft-mark { ${markStyle} }`);
    expect(readFileSync(join(__dirname, '../components/MarkText.vue'), 'utf-8')).toContain(`.mt-mark { ${markStyle} }`);
    expect(readFileSync(join(__dirname, '../components/DotKey.vue'), 'utf-8')).toContain(`.dotkey-mark { ${markStyle} }`);
  });

  it('当前命中与普通命中必须可区分（JSON 视图弱底 vs 橙底+焦点环）', () => {
    expect(rt).toContain('.rt-cell.rt-hit { background: var(--warn-soft); }');
    expect(rt).toContain('.rt-cell.rt-hit-cur { box-shadow: inset 0 0 0 2px var(--warn); }');
    expect(qrt).toContain('.qrt-cell.qrt-hit { background: var(--warn-soft); }');
    expect(qrt).toContain('.qrt-cell.rt-hit-cur { box-shadow: inset 0 0 0 2px var(--warn); }');
    const dsl = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
    expect(dsl).toContain(':deep(.j-mark) { background: var(--warn-soft);');
    expect(dsl).toContain(':deep(.j-mark-cur) { background: var(--dv-orange);');
  });

  it('JSON 语法四色语义分档在档（key/str/num/bool 各司其色）', () => {
    const theme = readFileSync(join(__dirname, '..', 'theme.css'), 'utf-8');
    expect(theme).toContain('.j-key { color: #93c5fd; }');
    expect(theme).toContain('.j-str { color: #86efac; }');
    expect(theme).toContain('.j-num { color: #fbbf24; }');
    expect(theme).toContain('.j-bool { color: #f472b6; }');
  });
});
