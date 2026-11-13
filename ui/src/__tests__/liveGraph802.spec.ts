/**
 * 八百零二批：实时监控第六轮「图表底座大厂级」（用户七令 20261008 14:31 续令
 * 「继续完整重构监控屏整个页面的布局以及整体组件的升级，质感交互大气等等都一并升级，
 * 我要求全面整体交互布局对称协调美感质感大厂级别.请继续深度改造」+截图实报「不符合」；
 * 稿=docs/goal802-live-graph.html）。
 *
 * 截图四问题实锚：①Top 曲线=白板图（无网格/无 X 时间刻度/Y 仅上下两值/无常显图例——
 * 曲线颜色↔索引映射仅 hover 可见）；②工具行「复制 TSV/复制 MD」平铺（铁律 C 低频动作
 * 该收 ⋯）；③历史图卡头单位双显（「QPS（次/秒）」label 括号+799 件2 hc-unit「/s」叠显）；
 * ④服务端告警「无活动告警」灰字层级弱（大屏状态位该是胶囊）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const hcSrc = readFileSync(join(__dirname, '../components/HistoryChart.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('件1：Top 曲线图表底座（网格+Y 四档+X 时间锚+常显图例）', () => {
  it('A1 网格线渲染在场（svg 内横向 grid lines ≥3 条，源码锁）', () => {
    const s = strip(liveSrc);
    expect(s).toContain('ld-grid');
    expect(s).toMatch(/gridYs|GRID_YS/);
  });

  it('A2 Y 轴中间刻度（topYTicks 档位计算+四档以上渲染，源码锁）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/topYTicks/);
    expect((s.match(/ld-yt/g) || []).length >= 5, 'ld-yt 渲染锚 ≥5（top/mid×3/bot）').toBe(true);
  });

  it('A3 X 轴时间三锚（首/中/尾时间刻度渲染，源码锁）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/topXTs|topXTicks/);
    expect(s).toContain('ld-xt');
  });

  it('A4 常显图例（.ld-top-legend 色点+索引名+当前值，非 hover 依赖，源码锁）', () => {
    const s = strip(liveSrc);
    expect(s).toContain('ld-top-legend');
    expect(s).toMatch(/v-for="[^"]*topCurves[^"]*"[^>]*ld-top-legend|ld-top-legend[^>]*>\s*<[^>]*v-for="[^"]*topCurves/);
  });
});

describe('件2：工具行导出收纳（铁律 C：低频动作收 ⋯）', () => {
  it('B1 ⋯ 收纳容器在场（三视图共用一个 details+copyDetail 按 detailTab 分发，源码锁）', () => {
    const s = strip(liveSrc);
    expect(s).toContain('ld-detail-more');
    expect(s).toContain('function copyDetail');
    expect(s).toMatch(/detailTab\.value === 'top'[^}]{0,60}copyTop\(fmt\)/);
    expect(s).toMatch(/detailTab\.value === 'slow'[^}]{0,60}copySlow\(fmt\)/);
    expect(s).toMatch(/copyAlertHist\(fmt\)/);
    expect(s).toContain("copyDetail('tsv')");
  });

  it('B2 平铺复制钮退役（工具行内「复制 TSV」直接平铺形态零，源码锁）', () => {
    const s = strip(liveSrc);
    expect(s.includes('ld-detail-tools') && s.match(/class="btn ghost sm"[^>]*>\s*复制 TSV/g), '平铺「复制 TSV」钮退役').toBeFalsy();
  });
});

describe('件3：历史图卡头单位单源（修「QPS（次/秒）/s」双显）', () => {
  it('C1 HIST_CHARTS label 括号单位退役（unit 小灰单源，源码锁）', () => {
    const s = strip(liveSrc);
    expect(s.includes("label: 'QPS（次/秒）'"), 'label 括号单位退役').toBe(false);
    expect(s.includes("label: '写入速率（doc/秒）'"), 'label 括号单位退役').toBe(false);
    expect(s).toMatch(/\{ field: 'qps', label: 'QPS', unit: '\/s'/);
    expect(s).toMatch(/\{ field: 'indexRate', label: '写入速率', unit: 'doc\/s'/);
  });

  it('C2 hc-unit 渲染保持（799 两行制 KPI 语言不变，组件锁）', () => {
    const s = strip(hcSrc);
    expect(s).toContain('hc-unit');
    expect(s).toContain('hc-cur');
  });
});

describe('件4：服务端告警状态胶囊升格', () => {
  it('D1 「无活动告警」胶囊形态（绿点+容器，源码锁）', () => {
    const s = strip(liveSrc);
    expect(s).toContain('ld-ok-chip');
  });
});
