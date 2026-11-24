/**
 * 七百九十七批：实时监控第三轮（用户三令+四令「全面整体交互布局对称协调美感质感大厂级别」；
 * 稿=docs/goal797-live-symmetry.html）。
 *
 * 件1 卡语言统一（大厂级协调主刀）：六卡（.ld-chart）+历史五图（.ld-hist-cell）从
 *    「border-top 分节式」（556 批扁平遗产）升「panel 壳式」（background:var(--panel)+
 *    border+radius r-m）——与节点卡/CollapsePanel/悬浮面板同语言=全站卡壳统一。
 *    556 逐字锁行同步更新备案（「797 用户令大厂级统一卡壳」；卡内零嵌套=556 卡中卡治理本意不破）。
 * 件2 历史五图孤儿收底：2 列 grid 下 2+2+1 末张半行孤儿→奇数张末张 grid-column: span 2 满行对称。
 * 件3 超宽屏内容锚：ld-page 常态 max-width 1760px+居中（挂墙态 fs-active 豁免=684 约定不破）。
 * 件4 交互美感（四令新增）：全页可点元素 hover 过渡档统一（0.12s ease-out）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const cardSrc = readFileSync(join(__dirname, '../components/LiveChartCard.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('件1：卡语言统一（panel 壳）', () => {
  it('Y1 六卡+历史图升壳：background panel+border+radius（源码锁）', () => {
    const c = strip(cardSrc);
    const l = strip(liveSrc);
    expect(c).toMatch(/\.ld-chart \{[^}]*background:\s*var\(--panel\)[^}]*border:\s*1px solid var\(--border\)[^}]*border-radius/);
    expect(l).toMatch(/\.ld-hist-cell \{[^}]*background:\s*var\(--panel\)[^}]*border:\s*1px solid var\(--border\)[^}]*border-radius/);
  });

  it('Y2 分节式 border-top 形态退役（源码锁：两选择器零 border-top 残留）', () => {
    const c = strip(cardSrc);
    const l = strip(liveSrc);
    expect(c).not.toMatch(/\.ld-chart \{[^}]*border-top/);
    expect(l).not.toMatch(/\.ld-hist-cell \{[^}]*border-top/);
  });
});

describe('件2：历史五图孤儿收底', () => {
  it('Y3 奇数张末张 span 2 满行对称（源码锁）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/ld-hist-cell:last-child:nth-child\(odd\)[^{]*\{[^}]*grid-column:\s*span 2/);
  });
});

describe('件3：超宽屏内容锚', () => {
  it('Y4 ld-page max-width 1760 居中+挂墙豁免（源码锁）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-page \{[^}]*max-width:\s*1760px/);
    expect(s).toMatch(/\.fs-active[^{]*\.ld-page[^{]*\{[^}]*max-width:\s*none/);
  });
});

describe('件4：交互美感', () => {
  it('Y5 hover 过渡档统一 0.12s ease-out（六卡/节点卡/告警条一致，源码锁）', () => {
    const c = strip(cardSrc);
    const l = strip(liveSrc);
    expect(c).toMatch(/\.12s ease-out/);
    expect((l.match(/\.12s ease-out/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
