/**
 * 表头列名不得压在排序/筛选图标槽上（用户实报：索引表格表头字段跟排序和筛选图标遮挡）。
 *
 * 结构事实（两个内核相同语言）：两个图标都**脱离文档流**绝对定位在 th 右缘——
 *   RT : 排序提示 right:24px / 筛选漏斗 right:8px（宽约 12px）
 *   QRT: 排序 ⇅   right:25px / 筛选漏斗 right:6px（宽 16px）
 * 所以列名自己的右内衬必须先把这两个槽让出来，否则长列名一贴边就压上去。
 *
 * 本 spec 用源码算「内衬是否够让出图标槽」——不锁像素值本身，锁**够不够**：
 * 内衬 < 最靠左的图标锚点，就是必然遮挡。
 * 负控：把内衬调回 14px，rt / qrt 两条都得红（历史上正是 14px）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

/* 档位 token 解析——源码里内衬可能写成裸 px，也可能写成 var(--sp-N)（538 批收口要求）。
   两种都接受并折算成数值，否则「用了 token 反而判失败」。 */
const SP_TOKEN: Record<string, number> = {
  '--sp-0': 2, '--sp-1': 4, '--sp-1h': 6, '--sp-2': 8, '--sp-2h': 10,
  '--sp-3': 12, '--sp-4': 16, '--sp-5': 24, '--sp-6': 32,
};
/** 取某条 CSS 规则里的 padding-right 数值（裸 px 或 var(--sp-N) token 都接受）。
 *  1332：QRT 的列名内衬改成 min(32px, max(12px,30%)) 这类复合值——宽档可达上限取其中最大项
 *  （宽列解析出 32px）；窄列下限由 qrtThNarrow1332 单独守。解析不出单值就判失败，
 *  不能因为「读不懂」而放行，那样这条锁就不再守任何东西。 */
function padOf(src: string, re: RegExp): number {
  const m = src.match(re);
  expect(m, '规则不存在（防空转）：' + re).toBeTruthy();
  const raw = m![1];
  const parts = [...raw.matchAll(/(\d+)px|--sp-([0-9a-z]+)/g)].map(mm => {
    if (mm[1]) return Number(mm[1]);
    const v = SP_TOKEN['--sp-' + mm[2]];
    expect(v, '未知间距 token：--sp-' + mm[2]).toBeTruthy();
    return v!;
  });
  expect(parts.length, '内衬必须可解析：' + raw).toBeGreaterThan(0);
  return Math.max(...parts);
}
/** 取 absolute 图标的 right 锚点 */
function rightOf(src: string, re: RegExp): number {
  const m = src.match(re);
  expect(m, '图标锚点不存在（防空转）：' + re).toBeTruthy();
  return Number(m![1]);
}

describe('表头列名让出图标槽', () => {
  it('RT 静息：内衬 ≥ 漏斗槽（8 + 12）——⇅ 静息是 display:none，不必让', () => {
    /* RT 的 ⇅ 静息 `display:none`（悬停才 block），静息只有常驻漏斗在右缘：
       right:8px + 宽约 12px → 内衬 ≥ 20px 即可；悬停档另由下一条按 34px 让 ⇅。 */
    const pad = padOf(rt, /\.rt-th-label \{[^}]*padding-right: (\d+px|var\(--sp-[0-9a-z]+\));/);
    const funRight = rightOf(rt, /\.rt-funnel \{[^}]*right: (\d+)px;/);
    const slot = funRight + 12;
    expect(pad, `RT 内衬 ${pad}px 必须容得下漏斗槽 ${slot}px，否则长列名与漏斗粘连`)
      .toBeGreaterThanOrEqual(slot);
  });

  it('RT 悬停：内衬 ≥ ⇅ 锚点 24px（⇅ 此刻出现）', () => {
    const hover = padOf(rt, /\.rt-th:hover \.rt-th-label[^{]*\{ padding-right: (\d+px|var\(--sp-[0-9a-z]+\)); \}/);
    const hintRight = rightOf(rt, /\.rt-th-sort-hint \{[^}]*right: (\d+)px;/);
    expect(hover, `RT 悬停内衬 ${hover}px 必须让出 ⇅ 锚点 ${hintRight}px`)
      .toBeGreaterThanOrEqual(hintRight);
  });

  it('QRT：列名静息内衬 ≥ 最靠左的图标锚点（sort-i right:25px）', () => {
    const pad = padOf(qrt, /\.qrt-th-name \{[^}]*padding-right: ([^;]+);/);
    const leftmostIcon = rightOf(qrt, /\.qrt-sort-i \{[^}]*right: (\d+)px;/);
    expect(pad, `QRT 内衬 ${pad}px 必须 ≥ 排序图标锚点 ${leftmostIcon}px，否则长列名压图标`)
      .toBeGreaterThanOrEqual(leftmostIcon);
  });

  it('两个内核的悬停档内衬都更大（⇅ 出现时不会反而更挤）', () => {
    const rtHover = padOf(rt, /\.rt-th:hover \.rt-th-label[^{]*\{ padding-right: (\d+px|var\(--sp-[0-9a-z]+\)); \}/);
    const rtRest = padOf(rt, /\.rt-th-label \{[^}]*padding-right: (\d+px|var\(--sp-[0-9a-z]+\));/);
    expect(rtHover, '悬停档 must ≥ 静息档').toBeGreaterThanOrEqual(rtRest);

    /* QRT 悬停档与静息同口径（1373：固定 35px = 盖住 ⇅ 的实际占位）——不跳变即不更挤 */
    const qrtHover = qrt.match(/\.qrt-tbl th:hover \.qrt-th-name[^{]*\{ padding-right: (\d+)px/);
    expect(qrtHover, 'QRT 悬停档必须有像素内衬').toBeTruthy();
    const qrtRest = Number((qrt.match(/\.qrt-th-name \{[^}]*padding-right: (\d+)px/) ?? [])[1] ?? 0);
    expect(Number(qrtHover![1]), '悬停档 must ≥ 静息档').toBeGreaterThanOrEqual(qrtRest);
    expect(qrtRest, 'QRT 内衬必须 ≥ ⇅ 锚点')
      .toBeGreaterThanOrEqual(rightOf(qrt, /\.qrt-sort-i \{[^}]*right: (\d+)px;/));
  });

  it('负控：两处 14px 都会判不合格（证明上面的判据不是恒真）', () => {
    /* 反向对照——直接喂历史值，判据必须拒绝。
       若哪天判据被改成「>= 1」之类恒真式，这条会红。 */
    const rtIcon = rightOf(rt, /\.rt-th-sort-hint \{[^}]*right: (\d+)px;/);
    const qrtIcon = rightOf(qrt, /\.qrt-sort-i \{[^}]*right: (\d+)px;/);
    expect(14, 'RT：14px 必须不够让出 24px 锚点').toBeLessThan(rtIcon);
    expect(14, 'QRT：14px 必须不够让出 25px 锚点').toBeLessThan(qrtIcon);
  });
});
