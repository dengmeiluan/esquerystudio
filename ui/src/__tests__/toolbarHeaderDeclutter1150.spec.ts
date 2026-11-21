/**
 * 1150 批：表头/工具行「元素平铺互相遮挡」的两处根因回归锁。
 *
 * 实报（截图）：结果表 A 行（列头）与 B 行（工具行）元素太多平铺，经常互相压住。
 * ① 列头静息态只留列名（类型徽标/未排序提示 hover 才出）——1147 已在 ResultTable
 *    与 QueryResultTable 落地，这里锁「静息 opacity:0 + 悬停才显」不被回退成常显。
 * ② 工具行窄档只留图标：ColPicker / TablePresetMenu 的标签在**子组件模板**里，
 *    scoped 编译出的 `.rt-bar .cp-label` 永远打不中（子组件元素不带父组件 scopeId）
 *    ——1150 实测 1148 窗口下「列选/布局」仍是整词、右簇 392px 把整行顶出行宽。
 *    修法=:deep() 把属性前移到 .rt-bar/.qrt-bar；本锁钉死两份内核都必须走 :deep。
 * ③ 快滤框（TableQSearch）收缩时输入框必须跟随容器一起缩，否则溢出段压住「刷新」。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const qs = readFileSync(join(__dirname, '../components/TableQSearch.vue'), 'utf-8');

describe('1150：工具行窄档只留图标（:deep 必须，子组件标签 scoped 打不中）', () => {
  it('RT 窄档用 :deep 命中 ColPicker/TablePresetMenu 标签', () => {
    /* 1174：RT 掉标签断点 1280→1380（标签态实测 1370 就溢出 5px、1290 溢出 85px） */
    expect(rt).toMatch(/@media \(max-width: 1380px\)/);
    expect(rt).toContain('.rt-bar :deep(.cp-label), .rt-bar :deep(.tpm-label) { display: none; }');
  });

  it('QRT 同款 :deep 规则在场', () => {
    expect(qrt).toMatch(/@media \(max-width: 1280px\)/);
    expect(qrt).toContain('.qrt-bar :deep(.cp-label), .qrt-bar :deep(.tpm-label) { display: none; }');
  });

  it('两份内核都不得回退成裸选择器（裸 .rt-bar .cp-label 恒不命中=假修复）', () => {
    expect(rt).not.toMatch(/\.rt-bar \.cp-label/);
    expect(qrt).not.toMatch(/\.qrt-bar \.cp-label/);
  });

  it('窄档换行兜底（先掉文字，再换行，绝不裁切）', () => {
    /* 1164：RT 阈值 1100→1180。1174：1180→1250——只留图标之后实测溢出起点是 1240
       （1240 溢出 6px、1200 溢出 46px），1180 仍留一段图标态裁切死区。 */
    expect(rt).toMatch(/@media \(max-width: 1250px\) \{[^}]*\.rt-bar \{ flex-wrap: wrap;/s);
    expect(qrt).toMatch(/@media \(max-width: 1100px\) \{[^}]*\.qrt-bar \{ flex-wrap: wrap;/s);
    /* 换行后右簇靠右（space-between 会把单 item 顶到最左）——规则必须住 TableShell
       全局 style：.rt-bar-r 是壳模板元素，写在内核 scoped 里 100% 不生效（1164 实测） */
    expect(rt, '内核 scoped 不得持有 .rt-bar-r 贴右规则（假修复：scopeId 打不中壳元素）')
      .not.toMatch(/\.rt-bar-r \{ flex-wrap: wrap; margin-left: auto; \}/);
  });

  it('壳级换行档右簇贴右，且阈值与内核换行档一致（1174）', () => {
    const shell = readFileSync(join(__dirname, '../components/TableShell.vue'), 'utf-8');
    const sh = shell.match(/@media \(max-width: (\d+)px\) \{\s*\.rt-bar-r \{ flex-wrap: wrap; margin-left: auto; \}/);
    expect(sh, '壳级 .rt-bar-r 贴右规则在场').toBeTruthy();
    /* 两处各写各的会在中间出现「内核已换行、右簇没贴右」的半截态 —— 必须同阈值 */
    const bar = rt.match(/@media \(max-width: (\d+)px\) \{\s*\.rt-bar \{ flex-wrap: wrap;/);
    expect(Number(sh![1]), '壳级贴右阈值必须等于内核换行阈值').toBe(Number(bar![1]));
  });

  it('RT 换行阈值必须 ≥ 实测溢出起点（假修复防线：阈值低于溢出点=可视区仍裁切）', () => {
    const bar = rt.match(/@media \(max-width: (\d+)px\) \{\s*\.rt-bar \{ flex-wrap: wrap;/);
    expect(bar, 'RT 换行断点存在').toBeTruthy();
    expect(Number(bar![1]), '1174 实测图标态溢出起点 1240（1200 溢出 46px），断点不得低于它').toBeGreaterThanOrEqual(1240);
    /* 掉标签断点同理：标签态溢出起点 1370，断点必须 ≥ 它，否则 1281–1370 是裁切死区 */
    const lbl = rt.match(/@media \(max-width: (\d+)px\) \{\s*\.rt-exp-btn-t/);
    expect(lbl, 'RT 掉标签断点存在').toBeTruthy();
    expect(Number(lbl![1]), '1174 实测标签态溢出起点 1370（1370 溢出 5px/1290 溢出 85px）').toBeGreaterThanOrEqual(1360);
    /* 两档必须分治：换行阈值严格小于掉标签阈值（否则图标态窗口比标签态还窄仍单行） */
    expect(Number(bar![1])).toBeLessThan(Number(lbl![1]));
  });
});

describe('1150/1151：列头静息态只显示列名，且任何态都不压住列名文字', () => {
  it('RT 类型徽标不再占据布局宽度，也不浮出盖住列名（类型走 tooltip）', () => {
    /* 1151：opacity:0 仍占 flex 宽（110px 列里吃掉 42px）→ 改为 display:none；
       浮出档带底色会把 status 盖成 sta → 类型改由 thTitle 首行「类型 · 列名」承载 */
    expect(rt).toMatch(/\.rt-th-type \{ display: none; \}/);
    expect(rt).not.toMatch(/\.rt-th-type \{[^}]*position: absolute/);
    expect(rt).toContain("const head = t ? `${t} · ${c}` : c;");
    expect(rt).toContain(':title="thTitle(c)"');
  });

  it('RT 未排序 ⇅ 悬停浮出，并给列名让出沟槽（不压文字）', () => {
    expect(rt).toMatch(/\.rt-th-sort-hint \{[^}]*display: none;/);
    expect(rt).toContain('.rt-th:hover .rt-th-sort-hint');
    expect(rt).toMatch(/\.rt-th:hover \.rt-th-label[^{]*\{ padding-right: 34px; \}/);
    /* 列名常驻右内衬让出筛选漏斗（right:8px，宽约 12px → 需要 ≥20px）；
       14px 只剩 4px 间隙，长列名会与漏斗视觉粘连（实测 gapToFilter=4） */
    const rtPad = rt.match(/\.rt-th-label \{ min-width: 0;[^}]*padding-right: (\d+)px;/);
    expect(rtPad, 'RT 列名必须有常驻右内衬').toBeTruthy();
    expect(Number(rtPad![1]), '内衬须容得下漏斗槽（8 + 12）').toBeGreaterThanOrEqual(20);
  });

  it('QRT 类型徽标同口径（不占宽、不浮出）', () => {
    expect(qrt).toMatch(/\.qrt-th-type \{ display: none; \}/);
    expect(qrt).not.toMatch(/\.qrt-th-type \{[^}]*opacity: 0;/);
    expect(qrt).toContain("const head = type ? type + ' · ' + c : c;");
  });

  it('1168：窄列悬停不让 34px 沟槽（否则列名比静息态更残缺）', () => {
    /* 实测 70px 的 title 列内容盒 50px，让完 34 只剩 16 → `t…`；
       窄档（≤96px）回落到常驻 14px 漏斗内衬 */
    expect(rt).toMatch(/@container \(max-width: 96px\) \{[\s\S]{0,220}padding-right: 14px/);
    /* 容器锚必须在内层 flex 上：挂 <th>（table-cell）实测阈值放到 5000px 都不命中 */
    expect(rt).toMatch(/\.rt-th-in \{[^}]*container-type: inline-size/);
    expect(rt, 'th 上挂容器无效，不得回退到该写法')
      .not.toMatch(/\.rt-th \{[^}]*container-type/);
  });
});

describe('1154：SQL 结果表窄档同样只留图标', () => {
  it('导出 ▾ / 视图 ⋯ 文案包进 .qrt-tool-t，窄档隐藏（字面量保留给读屏与旧锚）', () => {
    expect(qrt).toContain('<span class="qrt-tool-t">导出 ▾</span>');
    expect(qrt).toContain('<span class="qrt-tool-t">视图 ⋯</span>');
    expect(qrt).toMatch(/@media \(max-width: 1280px\) \{[\s\S]{0,400}\.qrt-bar \.qrt-tool-t \{ display: none; \}/);
    /* 此前只有列选/布局掉文字，这两颗整词把右簇顶宽——锁住不再回退成裸文本 */
    expect(qrt).not.toMatch(/:size="13" \/> 导出 ▾/);
  });
});

describe('1150/1166：快滤框收缩跟随（不压住相邻按钮，也不吃掉命中数）', () => {
  it('地板宽落在容器上，输入框 width:100%/min-width:0 跟随收缩', () => {
    expect(qs).toMatch(/\.qrt-qsearch, \.rt-qsearch \{[^}]*min-width: 90px;/);
    expect(qs).toMatch(/\.qrt-qsearch-inp, \.rt-qsearch-inp \{[^}]*width: 100%; min-width: 0;/);
  });

  it('地板 90px 常驻（1166：1440 档只超 15px，唯一可缩的是命中数 → 命中也吃省略号）', () => {
    expect(qs).not.toContain('min-width: 160px');
    /* 且不得退回「分档才降地板」——那会让宽档重新把 rt-info 挤没 */
    expect(qs).not.toMatch(/@media \(max-width: 1280px\) \{\s*\.qrt-qsearch, \.rt-qsearch \{ min-width: 90px; \}/);
  });
});
