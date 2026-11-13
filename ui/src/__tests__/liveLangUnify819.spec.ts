/**
 * 八百一十九批·监控第十二轮「图例/X 轴跨族语言统一」（用户续令「继续统一设计语言」；R199）。
 * Phase 0 静态比对：同页三族图例两种语言——Top 曲线图例（802 建）=旧代裸列表〔无 border/方色点
 * radius 3px/min-width 178px〕vs cmp-lg（816）/hc-chip（802 前身）=胶囊 chip 族〔border 1px+r-s+
 * 圆点 50%+padding〕；X 轴两套——ld-xaxis 有 tabular-nums vs hc-xaxis 无（数字宽不等抖动）。
 * 刀面（纯 CSS 零模板+1 行）：件1 Top 图例升胶囊 chip 族（与 816 对比 chips/历史 chips 同语言；
 * 802 A4 容器锁+802 S-g1b 结构锁兼容=dot/name/cur 三件保留）；件2 hc-xaxis 补 tabular-nums。
 * 批内勘正（820 批）：件1 收尾两刀——旧代 .ld-top-lg em 残留规则退役（与新规则并存级联后胜=
 * mono/tx2 盖死 tx0/600 同语言意图）+cursor:pointer 假示能清除（top-lg 为非点击 span 仅 title
 * 提示，pointer 示能复制自可点击的 cmp-lg 参照=违「点哪儿是哪儿」）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const hcSrc = readFileSync(join(__dirname, '../components/HistoryChart.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('件1：Top 图例升胶囊 chip 族（三族图例同语言）', () => {
  it('A1 源码锁：.ld-top-lg 与 .ld-cmp-lg 同构（border+r-s 圆角+圆点 50%+padding+hover 提亮）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-top-lg \{[^}]*border:\s*1px solid var\(--border\)/);
    expect(s).toMatch(/\.ld-top-lg \{[^}]*border-radius:\s*var\(--r-s\)/);
    expect(s).toMatch(/\.ld-top-lg \{[^}]*border-radius:\s*var\(--r-s\)[^}]*padding:\s*var\(--sp-0\)\s*var\(--sp-2\)/);
    expect(s).toMatch(/\.ld-top-lg i \{[^}]*border-radius:\s*50%/);
    expect(s).toMatch(/\.ld-top-lg:hover \{[^}]*border-color:\s*var\(--muted\)/);
  });

  it('A2 源码锁：802 A4 容器锁兼容（ld-top-legend+topCurves v-for 结构零迁移；dot/name/cur 三件保留）', () => {
    const s = strip(liveSrc);
    expect(s).toContain('ld-top-legend');
    expect(s).toMatch(/v-for="s in topCurves"[^>]*class="ld-top-lg"/);
    expect(s).toMatch(/class="ld-top-lg"[^>]*>\s*<i :style="\{ background: s\.color \}" \/><b>\{\{ s\.name \}\}<\/b><em>\{\{ fmtNum\(s\.cur\) \}\}<\/em>/s);
  });
});

describe('件2：X 轴数字对齐统一', () => {
  it('B1 源码锁：hc-xaxis 补 font-variant-numeric tabular-nums（与 ld-xaxis 同语言）', () => {
    const s = strip(hcSrc);
    expect(s).toMatch(/\.hc-xaxis \{[^}]*font-variant-numeric:\s*tabular-nums/);
  });
});

describe('批内勘正（820）：件1 收尾——旧代 em 残留退役+假示能清除', () => {
  it('C1 源码锁：.ld-top-lg em 单规则且与 ld-cmp-lg em 同字面（tx0/600/tabular；无 mono/无 margin-left:auto）', () => {
    const s = strip(liveSrc);
    expect((s.match(/\.ld-top-lg em \{/g) || []).length).toBe(1);
    expect(s).toMatch(/\.ld-top-lg em \{ font-style: normal; color: var\(--tx0\); font-weight: 600; font-variant-numeric: tabular-nums; \}/);
  });

  it('C2 源码锁：.ld-top-lg 非点击 span 无 cursor:pointer 假示能（hover 仅读出强调， cmp-lg 为真按钮才配 pointer）', () => {
    const s = strip(liveSrc);
    const rule = s.match(/\.ld-top-lg \{[^}]*\}/)?.[0] ?? '';
    expect(rule).not.toMatch(/cursor:\s*pointer/);
  });
});
