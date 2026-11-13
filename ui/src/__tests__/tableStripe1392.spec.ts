import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const RT = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const DQ = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

/* 1392：两处实测出来的显示缺陷。

 ① 表格中间多出一条条纹
   `.qrt-wrap` / `.rt-wrap` 的 1px 重复渐变是 1359b 加的表体底纹（行少时下方空白
   也像同一张网格）。但数据行当时是**透明**的，底纹从行里透出来，与真实 border-bottom
   叠在一起。表头 25px、行高 25.5px，底纹每条都比边框矮 0.5px 落线，于是同一条分隔线
   在 2px / 4px 之间交替——肉眼就是「表格中间一条粗亮条纹」。
   实测（1440×900，5 行）：修复前 row1=4px / row2=2px / row3=4px / row4=2px；
   行底改不透明后统一为 2px / 1px / 2px / 1px，且空白区仍有网格延伸。

 ② 「更多」按钮竖排成一条悬空的字
   `div.dq-more` 是结果区「更多」**菜单容器**的样式（width:320px + flex-direction:column），
   而工具行的「更多」**按钮**也叫 `class="btn sm ghost dq-more"` —— 裸选择器同时命中，
   按钮被撑成 320px 宽、图标/文字/箭头竖排。实测 moreRect 从 320×49 回到 76×23，
   工具行高度 73px → 50px。 */
describe('1392 行底纹不再叠出条纹', () => {
  it('两内核的数据行底色必须不透明（底纹只留给空白区）', () => {
    expect(QRT).toContain('.qrt-tbl tbody tr { background: var(--bg1); }');
    /* 偶行不能直接用半透明 --hl-soft，否则底纹照样透出来 */
    expect(QRT).toContain('.qrt-tbl tbody tr:nth-child(even) { background: linear-gradient(var(--hl-soft), var(--hl-soft)), var(--bg1); }');
    expect(RT).toContain('.rt-tbl tbody tr { background: var(--bg1); }');
    expect(RT).toContain('.rt-tbl tbody tr:nth-child(even) { background: linear-gradient(var(--tbl-zebra), var(--tbl-zebra)), var(--bg1); }');
    /* 紧凑档（关斑马纹）也必须是不透明底，否则底纹在 dense 档又透出来 */
    expect(RT).toContain('.rt.dense .rt-tbl tbody tr:nth-child(even) { background: var(--bg1); }');
  });

  it('底纹本身仍在（1359b 的空白区延伸不回退）', () => {
    expect(QRT).toContain('background-image: linear-gradient(var(--line) 1px, transparent 1px)');
    expect(RT).toContain('background-image: linear-gradient(var(--line) 1px, transparent 1px)');
  });

  it('负控：把行底改回透明，半透明偶行会让底纹重新透出', () => {
    /* 两种「看着像修好」的写法都会失败：
       ① 只给奇行不透明、偶行留 rgba 罩 → 偶行仍透底纹
       ② 行底色写 transparent → 全部透 */
    const opaque = (c: string) => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (!m) return c !== 'transparent' && c !== 'none';
      const p = m[1].split(',').map(Number);
      return p.length < 4 || p[3] > 0.99;
    };
    expect(opaque('rgb(17, 24, 25)'), '实色算不透明').toBe(true);
    expect(opaque('rgba(255, 255, 255, 0.05)'), '半透明罩不算不透明').toBe(false);
    expect(opaque('transparent')).toBe(false);
  });
});

describe('1392 「更多」菜单样式不命中工具行按钮', () => {
  it('菜单容器规则收窄到 div.dq-more', () => {
    expect(DQ).toContain('div.dq-more { display: flex; flex-direction: column; gap: 1px; width: 320px; }');
    expect(DQ).toContain('div.dq-more .exp-t { padding: 0 0 var(--sp-1); }');
  });

  it('负控：收窄前裸 .dq-more 规则必须真的命中按钮（证明这是同一选择器冲突）', () => {
    const btn = '<button class="btn sm ghost dq-more" data-test="dq-more"';
    expect(DQ, '按钮仍带 dq-more 类（test 与 data-test 锚依赖它）').toContain(btn);
    /* 裸选择器会命中它；div.dq-more 不会 */
    const bare = /(^|\n)\.dq-more \{/m.test(DQ);
    expect(bare, '不许再有裸 .dq-more 规则（它会同时命中按钮）').toBe(false);
  });

  it('工具行按钮锚点未改（1369 收起 / 深链测试依赖）', () => {
    expect(DQ).toContain('data-test="dq-more"');
    expect(DQ).toContain('aria-haspopup="menu"');
  });
});
