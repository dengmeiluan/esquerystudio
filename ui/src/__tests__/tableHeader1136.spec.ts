import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const sql = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1136：表格首行去拥挤（dbx/DBeaver 式数据网格语言）——
 * 单行列头；排序/筛选图标悬停或生效时才出现且不再占列宽；类型收进 title/列详情；
 * 无 cursor 时不挂禁用翻页钮。 */
describe('1136 表格首行减法', () => {
  it('列头单行：类型块不再占首行/第二行宽度，完整类型进 title', () => {
    expect(qrt).toContain('.qrt-th-sub { display: none; }');
    expect(qrt).toContain('const type = effType(c);');
    expect(qrt).toContain("const head = type ? type + ' · ' + c : c;");
    expect(qrt).toContain('return [tip, head, base].filter(Boolean).join(\'\\n\');');
  });

  it('排序/筛选图标脱离文档流，悬停/聚焦/生效才可见——不挤列宽、不常驻噪音', () => {
    expect(qrt).toContain('.qrt-sort-i { position: absolute; right: 25px;');
    expect(qrt).toContain('.qrt-funnel {\n  position: absolute; right: 6px;');
    expect(qrt).toContain('.qrt-tbl th:hover .qrt-funnel, .qrt-tbl th:focus-within .qrt-funnel, .qrt-funnel:focus-visible { opacity: .8; }');
    expect(qrt).toContain('.qrt-tbl th.on .qrt-sort-i { opacity: 1; }');
    /* 1332：列名盒子上限从固定 220px 改为 100%（= th 内容盒）。
       原锁守的是「列名是 inline-block 且限宽 220」，但真机证明这条恰恰是缺陷来源：
       列被拖窄后盒子仍按内容宽排版、越出 th 压住 ⇅/漏斗。现在守的是更强的意图——
       **列名盒子不得超出单元格**。限宽仍需要（长字段名别把列撑爆），但上限必须跟列宽联动。 */
    expect(qrt).toMatch(/\.qrt-th-name \{\s*display: block; max-width: 100%;/);
    /* 内衬宽度从 14 提到 32：排序 ⇅ 锚在 right:25px（宽约 11px），14px 内衬下
       列名右界会压进 ⇅ 11px（实测 issuer_name 列 gapS=-11）。断言改为「内衬 ≥ 图标槽」，
       不锁死具体像素值——只要还让得出 ⇅ + 漏斗两个槽就成立。
       1332：值变成 min(32px, max(12px,30%)) 复合式，宽档口径取上限项（32px）。 */
    /* 1373：判据从「出现 --sp-6」改为「解析出的内衬值 ≥ ⇅ 实际占位」。
       真机实测 ⇅ 锚 right:25px 宽 10px = 占右 35px，32px 会压字 3px，所以值是 35px。 */
    const qrtPad = qrt.match(/\.qrt-th-name \{[^}]*padding-right: (\d+)px[^;]*;/);
    expect(qrtPad, 'QRT 列名必须有右内衬（像素值）').toBeTruthy();
    const gutter = Number(qrtPad![1]);
    const sortRight = Number((qrt.match(/\.qrt-sort-i \{[^}]*right: (\d+)px/) ?? [])[1] ?? 0);
    expect(gutter, `内衬 ${gutter}px 必须 ≥ ⇅ 锚点 ${sortRight}px`).toBeGreaterThanOrEqual(sortRight);
  });

  it('列宽可拖：无 storageKey 走内存态；首拖固化宽度并按内容宽展开', () => {
    expect(qrt).toContain('@mousedown="beginColResize($event, c)"');
    expect(qrt).toContain('function beginColResize(e: MouseEvent, col: string) {');
    expect(qrt).toContain("width: 'max-content'");
    /* 1141：门控放宽到 barOn（内存态工具行通道同样走冻结/列宽口径） */
    expect(qrt).toContain(':style="barOn ? frozenStyle(c) : colStyle(c)"');
  });

  it('结果优先布局：编辑器让高给网格；单栏时模板侧栏排到结果之后', () => {
    expect(sql).toContain('.sq-grid { grid-template-rows: minmax(150px, 34vh); }');
    expect(sql).toContain('.sq-grid > .sq-samples { order: 3; }');
    expect(sql).toContain('sq-icon-btn');
  });

  it('无 cursor 不渲染两个禁用翻页钮（少两个占位元素）', () => {
    expect(sql).toContain('<template v-if="cursor">');
    expect(sql).toContain(':disabled="busy"');
    expect(sql).not.toContain(':disabled="!cursor || busy"');
  });
});
