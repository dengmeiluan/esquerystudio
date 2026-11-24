/**
 * 一千四百零三批：表头静息态只剩列名——漏斗不再常驻（QRT 早就是悬停档，RT 补平）。
 *
 * 用户反复说「表头第一行太多元素平铺」。1147/1151 已把 RT 的类型徽标与未排序 ⇅
 * 改成悬停才出现（display:none 让位给列名），只剩筛选漏斗还是 opacity:.45 的常驻灰。
 * 实测（1440×1000，索引工作区）每列表头静息可见控件从 3（漏斗+↑↓+把手）降到 2，
 * 漏斗与 QRT 同口径：th 悬停/键盘聚焦才浮现，筛选生效(.on) 常亮（状态不能被藏）。
 *
 * 本 spec 锁：
 *  ① RT 漏斗静息 opacity:0（不是低透明度常驻）；
 *  ② th:hover / focus-within 时浮现；
 *  ③ .on（该列有筛选）保持 opacity:1——状态可见性不回退；
 *  ④ QRT 已是同口径（.qrt-funnel opacity:0 + th:hover/focus-within 浮现 + .on 常亮）；
 *  ⑤ 负控：把 opacity:0 改回 .45 → ① 必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RT = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('1403 表头漏斗静息不占视觉', () => {
  it('① RT 漏斗静息 opacity:0', () => {
    expect(RT).toMatch(/\.rt-funnel \{[^}]*opacity: 0;/);
    /* 负控：改回常驻半透明 → 本断言红 */
    expect(RT.replace(/\.rt-funnel \{([^}]*?)opacity: 0;/, '.rt-funnel {$1opacity: .45;')).not.toMatch(/\.rt-funnel \{[^}]*opacity: 0;/);
  });

  it('② RT 悬停/聚焦时浮现', () => {
    expect(RT).toMatch(/th:hover > \.rt-funnel, th:focus-within > \.rt-funnel \{ opacity: \.85; \}/);
  });

  it('③ 筛选生效常亮', () => {
    expect(RT).toMatch(/\.rt-funnel\.on \{ opacity: 1; color: var\(--info\); \}/);
  });

  it('④ QRT 同口径（悬停浮现 + 生效常亮 + 触屏常驻弱提示）', () => {
    /* 块内匹配：规则跨多行（position/尺寸/颜色…），不能用固定长度窗口 */
    expect(QRT).toMatch(/\.qrt-funnel \{[^}]*opacity: 0;/);
    expect(QRT).toMatch(/\.qrt-tbl th:hover \.qrt-funnel, \.qrt-tbl th:focus-within \.qrt-funnel/);
    expect(QRT).toMatch(/\.qrt-funnel\.on \{ opacity: 1;/);
    expect(QRT, '触屏没有 hover，必须常驻弱提示').toMatch(/@media \(hover: none\) \{[\s\S]{0,120}?\.qrt-funnel/);
  });

  it('⑤ RT 触屏档：没有 hover 时漏斗与未排序 ⇅ 必须可达（否则筛选入口在平板上不存在）', () => {
    expect(RT, '触屏常驻弱提示').toMatch(/@media \(hover: none\) \{\s*\.rt-funnel \{ opacity: \.55; \}/);
    expect(RT, '⇅ 悬停档在触屏要显式显示').toMatch(/\.rt-th-sort-hint \{ display: block; opacity: \.5; \}/);
    /* 负控：删掉触屏档 → 本断言红 */
    const noTouch = RT.replace(/@media \(hover: none\) \{\s*\.rt-funnel \{ opacity: \.55; \}/, '');
    expect(noTouch).not.toMatch(/@media \(hover: none\) \{\s*\.rt-funnel \{ opacity: \.55; \}/);
  });
});
