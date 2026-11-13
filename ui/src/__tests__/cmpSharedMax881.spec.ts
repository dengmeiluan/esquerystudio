/**
 * 对比卡 abs 档共享 max 域（880 多序列共享域立法在监控板块的收尾刀）：
 * 节点对比卡 QPS/写入两档（abs）此前 sparkPts 逐序列按自身 max 归一化——值 1 的节点
 * 与值 100 的节点视觉等高，tooltip 读真实值与视觉峰谷高度不成比例（880-C1 真矿指纹），
 * 且 Y 顶刻度（cmpYTop）已按全体共享 max 标注——刻度语义与曲线域不一致，按刻度读
 * 峰高全错。修法=sparkPts 增设可选 scaleMax（abs 档直接采用），对比卡传全体可见
 * 节点的共享 max，刻度与曲线单源同读；pct 档（0-100 固定刻度）天然共享零改动。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sparkPts } from '../utils/sparkChart';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('sparkPts 共享 scaleMax 实参（abs 档多序列同图）', () => {
  it('C1 abs 档传 scaleMax 时坐标按共享 max（而非本序列自身 max）', () => {
    /* 自身 max=2：y=[50-25, 50-50]=[25,0]；共享 max=10：y=[50-5, 50-10]=[45,40] */
    expect(sparkPts([1, 2], 100, 50, 'abs', 10).map(p => p.y)).toEqual([45, 40]);
  });

  it('C2 abs 档缺省自身 max 逐位不变（单序列消费方向后兼容）', () => {
    expect(sparkPts([1, 2], 100, 50, 'abs').map(p => p.y)).toEqual([25, 0]);
  });

  it('C3 pct 档忽略 scaleMax（0-100 固定刻度天然共享）', () => {
    expect(sparkPts([50, 100], 100, 50, 'pct', 10).map(p => p.y)).toEqual([25, 0]);
  });

  it('C4 对比卡绘制传共享 max+刻度单源（cmpYTop 与曲线同读一个 computed）', () => {
    const s = strip(liveSrc);
    /* 绘制调用带第 5 实参（pct 档传 undefined，sparkPts 内 pct 分支不用它） */
    expect(s).toMatch(/sparkPts\(s\.data,\s*CMP_W,\s*CMP_H,[^)]*cmpScaleMax\)/);
    /* cmpScaleMax computed：abs 档遍历全体 cmpSeries 数据点取 max */
    expect(s).toMatch(/const cmpScaleMax = computed\(\(\) => \{[\s\S]{0,220}for \(const s of cmpSeries\.value\)[\s\S]{0,120}return mx;[\s\S]{0,20}\}\);/);
    /* cmpYTop abs 档单源读 cmpScaleMax（刻度与曲线同域） */
    expect(s).toMatch(/let mx = cmpScaleMax\.value;\s*\n\s*return mx >= 100/);
  });
});
