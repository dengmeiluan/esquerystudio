/**
 * 八百二十八批·监控第十六轮「折线平滑统一」（用户令「继续全部优化到极致」；R207——
 * 826-续 斥候 Agent-C 留下批大刀：四族曲线折线形态三分——六卡 Catmull-Rom 平滑 vs
 * 历史/对比/Top 直线 polyline=同屏割裂最大项）。
 * 刀面：历史图折线段内平滑（断档分段逻辑保留——段内 Catmull-Rom、段间仍断开）+
 * 对比卡/Top 卡折线平滑（sparkPts+catmullRomPath 单源组合替换 sparklinePoints）。
 * 全部走 sparkChart.ts 单源算法（六卡同款 t=0.5+控制点钳位），零新算法。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { movingAverage } from '../utils/sparkChart';

const hcSrc = readFileSync(join(__dirname, '../components/HistoryChart.vue'), 'utf-8');
const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('件1：历史图折线平滑（段内平滑段间断开）', () => {
  it('A1 HistoryChart 折线 polyline→path+catmullRomPath（导入单源）', () => {
    const s = strip(hcSrc);
    expect(s).toContain('catmullRomPath');
    expect(s).toMatch(/<path[^>]*class="hc-line"/s);
    expect(s).not.toMatch(/<polyline[^>]*class="hc-line"/);
  });
  it('A2 断档分段保留（polylineSegments 分段逻辑仍承担 gapMs 语义）', () => {
    const s = strip(hcSrc);
    expect(s).toContain('polylineSegments');
    expect(s).toContain('gapMs');
  });
});

describe('件2：对比卡/Top 卡折线平滑', () => {
  it('B1 LiveDashboard 对比/Top 折线 catmullRom 化（对比卡 sparkPts+Top 卡 topPlotPts Pt[] 单源组合）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/catmullRomPath\(sparkPts\(/);
    expect(s).toContain('catmullRomPath(topPlotPts(s.data), CMP_W, CMP_H)');
  });
  it('B2 pct 档同步平滑（sparkPts mode 参数保留）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/catmullRomPath\(sparkPts\([^)]*'pct'[^)]*\)/s);
  });
});

describe('899 续：对比序列滑动平均（GC 锯齿降噪，观感对齐分钟级历史卡）', () => {
  it('C1 窗口 5 滑动平均：毛刺磨平、首段取可得样本', () => {
    /* [0,0,0,30,0] 突刺 30 → 平滑后 0,0,0,7.5,6（突刺摊到 5 点窗） */
    expect(movingAverage([0, 0, 0, 30, 0], 5)).toEqual([0, 0, 0, 7.5, 6]);
    expect(movingAverage([10, 20, 30], 5)).toEqual([10, 15, 20]);
  });
  it('C2 恒值序列不变；长度不缩', () => {
    expect(movingAverage([50, 50, 50, 50, 50, 50], 5)).toEqual([50, 50, 50, 50, 50, 50]);
    expect(movingAverage([1, 2, 3], 5)).toHaveLength(3);
  });
  it('C3 视图接线：cmpSeries data 走 winSlice(movingAverage(...))', () => {
    const s = strip(liveSrc);
    expect(s).toContain('winSlice(movingAverage(nodeSeriesFor(n.name, cmpMetric.value)))');
  });
});
