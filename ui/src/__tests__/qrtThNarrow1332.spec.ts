/**
 * 一千三百三十二批：QRT 列名盒子越出单元格，压住排序/筛选图标。
 *
 * 用户反复报「表头字段跟排序和筛选图标存在遮挡」。RT 侧 1325 批已守住，但**QRT 侧一直没守**：
 * 它的列名是 `inline-block` + `max-width:220px` —— 按内容宽排版，不受 th 约束。
 * 真机（SQL 控制台拿 `WIDE_TABLE` 8 列、真实鼠标把列拖到最小 60px）实测：
 *
 *   score(60px)  列名盒子右缘越过 th 内容盒 12px，可见文字越过 ⇅ 左缘 15px、越过漏斗 2px
 *   region(60px) 同上
 *   amount(82px) 越界 20px
 *
 * 也就是「列被拖窄之后，名字一半压在两个图标底下」。`overflow:hidden` 救不了：它只裁自己的盒子，
 * 越出 th 的那一段照样画在图标区域上。
 *
 * 修法把三条不变量写进 CSS：① 盒子宽度上限取 th 内容盒（block + 100%），越界从根上不可能；
 * ② 右内衬按可用宽度收敛但有下限，保漏斗槽；③ 宽列仍是 32px（⇅ 25px + 图标 11px 的沟槽）。
 *
 * 负控：把 `max-width: 100%` 改回 `220px` → 第 1 条必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const rule = (() => {
  const i = src.indexOf('.qrt-th-name {');
  expect(i, '.qrt-th-name 规则必须存在').toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('}', i));
})();

describe('1332 QRT 列名不得越出单元格压住图标', () => {
  it('列名盒子宽度上限必须是 100%（不是固定 220px）', () => {
    const m = rule.match(/max-width:\s*([^;]+);/);
    expect(m, '必须声明 max-width').toBeTruthy();
    /* 固定像素上限不跟列宽联动：列一旦窄于上限，盒子就比单元格宽，越界压图标 */
    expect(m![1].trim()).toBe('100%');
  });

  it('必须是 block，才吃得到 th 内容盒的 100%', () => {
    /* inline-block 的百分比 max-width 在 table-cell 内不可靠，1325 的 RT 侧同口径 */
    expect(rule).toMatch(/display:\s*block/);
  });

  it('右内衬必须盖住**最靠左的图标**（1373：⇅ 占右 35px，不是漏斗的 22px）', () => {
    /* 1332 原判据按漏斗算 22px。1373 真机实测发现排序 ⇅ 锚在 right:25px 宽 10px，
       占右 35px —— 按 22px 留槽时 score/region/status 文字压图标 13px、region 整词溢出。
       比例制 min(32px,max(12px,30%)) 在窄列只给 18.6px，同样压字。
       现在改为固定 35px，并由「表头最小列宽」保证窄列仍有字可显（见 1373 spec）。 */
    const m = rule.match(/padding-right:\s*([^;]+);/);
    expect(m, '必须声明 padding-right').toBeTruthy();
    const v = m![1].trim();
    expect(v, '必须盖住 ⇅ 的实际占位 35px').toBe('35px');
    expect(v, '不许再收敛到比例制').not.toContain('min(');
  });

  it('悬停/聚焦档与静息同口径（不同档位才会跳变压字）', () => {
    const hover = src.slice(src.indexOf('.qrt-tbl th:hover .qrt-th-name'));
    const seg = hover.slice(0, hover.indexOf('}'));
    expect(seg.trim(), '悬停档必须与静息同为 35px').toContain('padding-right: 35px');
  });
});
