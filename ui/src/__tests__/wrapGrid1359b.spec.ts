/**
 * 一千三百五十九批 b：「怎么变成双重表格视觉问题？」
 *
 * 用户截图里，结果区是「表格 + 一大块空白 + 底部状态条」，像两个表格叠着。
 *
 * 真机量（1354/1355 之后，1440×900，1 行结果）：
 *   页面   容器高   表格本体   下方空白
 *   DSL    240px    61px      179px
 *   SQL    276px    51px      225px
 *
 * 成因：1354/1355 只把**容器**撑高（`min-height` / 填满档），`<table>` 仍只占内容高；
 * 容器底色露在表格下方、与表体之间没有行线延续，就被读成「第二块表」。
 *
 * **走过的弯路（本批最重要的记录）**：第一版加了 `<tr class="rt-fill-row">` 吃掉余量，
 * 真机上确实把表体从 61 撑到 229px，但**撞了两组既有锁**：
 *   - `rtLocateFilter230`：按 `tbody tr` 数行 → 多出 1 行（3 ≠ 2）
 *   - `rtQrtSearchMerge621`：筛选后「不匹配行移除」→ 填充行没被移除（2 ≠ 1）
 * 而且它还会打乱斑马纹的 `nth-child(even)` 奇偶。
 * 结论：**填充行污染了「行」这个数据语义**，代价远大于收益。
 *
 * 最终修法：不碰 DOM，把行线用**表体底纹**延伸到容器底部
 * （`.rt-wrap` / `.qrt-wrap` 加 1px 重复线性渐变，行距 32px）。视觉上空白区
 * 与表体同一张网格，行计数/斑马纹/行导航零影响。
 *
 * 本 spec 锁：
 *  ① 两内核容器都有行线底纹（`background-image` + `background-size` 行距）；
 *  ② **不许**再引入填充行元素（`fill-row` 在模板里必须不存在）；
 *  ③ 底纹用起止色都是 `--line` 的硬边渐变（软渐变会糊成灰块，不是行线）；
 *  ④ 负控：去掉 `background-size` → ① 必须红（否则底纹会按整块拉伸成一条粗线）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const RT = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');

function cssRule(src: string, sel: string): string {
  const i = src.indexOf(sel + ' {');
  expect(i, `必须有 ${sel} 规则`).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('}', i));
}

describe('1359b 表体底纹延伸（消除「两块表」观感）', () => {
  it('① 两内核容器都有行线底纹且行距由行高变量驱动（1365）', () => {
    for (const [name, src, sel, varName] of [
      ['RT', RT, '.rt-wrap', '--rt-row-h'],
      ['QRT', QRT, '.qrt-wrap', '--qrt-row-h'],
    ] as const) {
      const rules = src.split(sel + ' {').slice(1).map((_, i, arr) => arr);
      /* 该选择器可能出现多次，只要有一处带底纹即算（背景规则独立成行） */
      const hasGrid = /background-image:\s*linear-gradient\(var\(--line\) 1px, transparent 1px\)/
        .test(src.split(sel + ' {').map(x => x.slice(0, x.indexOf('}'))).join('\n'));
      expect(hasGrid, `${name} 必须有 1px 行线底纹`).toBe(true);
      const gridBlock = src.slice(src.indexOf('linear-gradient(var(--line) 1px, transparent 1px)'));
      /* 1365：行距不再是写死 px——实测三档行高 21.5/25.5/41.5px，写死 32px 会逐行错位。
         现在必须引用行高变量，且该变量在默认态与三档都给了值。 */
      expect(gridBlock.slice(0, 240), `${name} 行距必须引用行高变量`)
        .toMatch(new RegExp(`background-size:\\s*100% var\\(${varName}\\)`));
      expect(gridBlock.slice(0, 240), `${name} 默认档必须给定行高变量值`)
        .toMatch(new RegExp(`${varName}:\\s*\\d+(\\.\\d+)?px`));
      expect(src, `${name} 紧凑档必须覆盖行高变量`).toMatch(new RegExp(`\\.dense[^{]*\\{[^}]*${varName}`));
      expect(src, `${name} 宽松档必须覆盖行高变量`).toMatch(new RegExp(`\\.cozy[^{]*\\{[^}]*${varName}`));
      expect(rules.length, `${name} 的 ${sel} 规则应存在`).toBeGreaterThan(0);
    }
  });

  it('② 不许再引入填充行（它污染「行」的数据语义）', () => {
    expect(RT, 'RT 不许有 fill-row').not.toContain('rt-fill-row');
    expect(QRT, 'QRT 不许有 fill-row').not.toContain('qrt-fill-row');
  });

  it('③ 底纹必须是硬边（起止同色 --line），软渐变会糊成灰块', () => {
    expect(RT).toMatch(/linear-gradient\(var\(--line\) 1px, transparent 1px\)/);
    expect(QRT).toMatch(/linear-gradient\(var\(--line\) 1px, transparent 1px\)/);
  });

  it('④ 负控：去掉 background-size → ① 的行距判据必须红', () => {
    const broken = RT.replace(/background-size: 100% var\(--rt-row-h\);/, '');
    expect(broken, '负控必须真的改掉').not.toBe(RT);
    const gridBlock = broken.slice(broken.indexOf('linear-gradient(var(--line) 1px, transparent 1px)'));
    expect(gridBlock.slice(0, 240), '没有行距必须判不合格').not.toMatch(/background-size:\s*100% var\(--rt-row-h\)/);
  });

  it('④ 负控：行距写回固定 32px（与现实行高脱钩）→ ① 必须红', () => {
    const broken = RT.replace('background-size: 100% var(--rt-row-h);', 'background-size: 100% 32px;');
    expect(broken, '负控必须真的改掉').not.toBe(RT);
    const gridBlock = broken.slice(broken.indexOf('linear-gradient(var(--line) 1px, transparent 1px)'));
    expect(gridBlock.slice(0, 240), '固定 32px 必须判不合格')
      .not.toMatch(/background-size:\s*100% var\(--rt-row-h\)/);
  });
});
