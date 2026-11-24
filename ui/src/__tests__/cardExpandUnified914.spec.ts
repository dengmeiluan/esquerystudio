/**
 * 九百一十六批续：图卡展开能力全站统一（用户令「为什么所有的卡片不提供放大功能，
 * 能力不统一」）——此前仅顶部 KPI 卡（LiveChartCard）可全屏展开。
 *
 * 判据：
 *   1) HistoryChart 源码锁：expanded prop + expand emit + 头部 hc-expand 钮 +
 *      hc-full 全屏态（ld-chart-full 同语言 fixed 覆盖）；
 *   2) LiveDashboardView 源码锁：expandedCard 键放宽为字符串（'hist:<field>' /
 *      'cmp' / 'top' 三族接线）；对比面板 ld-ncmp-full + ld-ncmp-expand 钮；
 *      Top 曲线区 ld-top-wrap.ld-top-full 包层 + 工具行展开钮；
 *   3) 同一状态机/遮罩/Esc 链路（expandedCard watch 的 body.ld-chart-mask 复用）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hcSrc = readFileSync(join(__dirname, '../components/HistoryChart.vue'), 'utf-8');
const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('源码锁：展开能力全站统一', () => {
  it('A1 HistoryChart：expanded prop + expand emit + 头部展开钮 + hc-full 全屏态', () => {
    const s = strip(hcSrc);
    expect(s).toMatch(/expanded\?: boolean;/);
    expect(s).toContain("defineEmits<{ expand: [] }>()");
    expect(s).toMatch(/class="hc-expand"/);
    expect(s).toMatch(/:class="\{ 'hc-full': expanded \}"/);
    expect(s).toMatch(/\.hc\.hc-full \{ position: fixed;/);
  });

  it('A2 LiveDashboard：expandedCard 键字符串化，三族新键接线', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/const expandedCard = ref<string \| null>\(null\);/);
    expect(s).toMatch(/toggleExpand\('hist:' \+ c\.field\)/);
    expect(s).toMatch(/toggleExpand\('cmp'\)/);
    expect(s).toMatch(/toggleExpand\('top'\)/);
    expect(s).toMatch(/:expanded="expandedCard === 'hist:' \+ c\.field"/);
  });

  it('A3 对比面板与 Top 曲线区的全屏形态+展开钮', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/'ld-ncmp-full': expandedCard === 'cmp'/);
    expect(s).toMatch(/class="ld-ncmp-expand"/);
    expect(s).toMatch(/'ld-top-full': expandedCard === 'top'/);
    expect(s).toMatch(/\.ld-ncmp-panel\.ld-ncmp-full \{ position: fixed;/);
    expect(s).toMatch(/\.ld-top-wrap\.ld-top-full \{ position: fixed;/);
  });
});
