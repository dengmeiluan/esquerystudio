/**
 * 集群监控历史趋势前端契约（多集群叠加折线，对标阿里云监控）——
 * ①纯函数真测：utils/monitorSeries 的 buildSeries（分组/排序/缺字段剔点/乱序升序）
 *   与 polylinePoints（多序列共享坐标系/单点与空组不画线），
 *   以及图卡层新 helper：yMaxOf（y 域上界）/timeTicks（X 轴标注）/nearestAt（悬停取点）/
 *   fmtUnit（值按单位格式化）各边界（空、单点、范围塌缩、非法值），以及降采样批新增：
 *   intervalFor/intervalMsFor（范围档→ES date_histogram 降采样 interval 映射与毫秒值）/
 *   polylineSegments（断档感知折线分段：超阈间隔断开、缺省永不断、空/单点容错）；
 * ②HistoryChart 挂载真测（createApp+happy-dom）：图例 chips 数=序列数、点 chip 切换可见性、
 *   统计条（当前/最大/均值）、阈值虚线（stroke-dasharray）、时间轴 3 只标注、空态；
 * ③source-lock：api.ts 的 monitorMetrics 读侧方法（/monitor-metrics? 显式 ? 分隔符——
 *   q() 不带前导 ?，缺失曾致 404 monitor-historyfromMs=...）；
 *   LiveDashboardView.vue 的「历史趋势」分区（标题/时间范围常量/取数调用/序列构建使用/
 *   HistoryChart 统一件接线/「按节点查看」下钻），且旧 mini-svg 历史写法不在场（变异锚）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildSeries, polylinePoints, polylineSegments, yMaxOf, timeTicks, nearestAt, fmtUnit,
  diskForecast, intervalFor, intervalMsFor, redBands, latestByNode, probeDigest, activeAlerts,
} from '../utils/monitorSeries';
import type { MonitorMetricsRecord, MonitorAlertDoc } from '../api';

const apiSrc = readFileSync(join(__dirname, '../api.ts'), 'utf-8');
const view = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const chartSrc = readFileSync(join(__dirname, '../components/HistoryChart.vue'), 'utf-8');
const seriesSrc = readFileSync(join(__dirname, '../utils/monitorSeries.ts'), 'utf-8');
const sparkSrc = readFileSync(join(__dirname, '../utils/sparkChart.ts'), 'utf-8'); /* 六百三十八批 P1a-1：LD_H 单源下沉 */
const cardSrc = readFileSync(join(__dirname, '../components/LiveChartCard.vue'), 'utf-8'); /* 六百三十八批 P1a-2 */

const rec = (over: Partial<MonitorMetricsRecord> & { timestamp: number }): MonitorMetricsRecord => over;

describe('buildSeries 分组与排序', () => {
  it('按 connName 分组；缺 connName 回落 connId；双缺归「未知集群」', () => {
    const series = buildSeries([
      rec({ timestamp: 1, connName: 'prod-a', connId: 'c1', qps: 10 }),
      rec({ timestamp: 2, connId: 'c2', qps: 20 }),
      rec({ timestamp: 3, qps: 30 }),
    ], 'qps');
    expect(series.map(s => s.name)).toEqual(['c2', 'prod-a', '未知集群']);
    expect(series.find(s => s.name === 'prod-a')!.points).toEqual([{ t: 1, v: 10 }]);
  });
  it('组间按 name 升序、组内按 t 升序——乱序输入输出确定', () => {
    const series = buildSeries([
      rec({ timestamp: 30, connName: 'b', qps: 3 }),
      rec({ timestamp: 10, connName: 'b', qps: 1 }),
      rec({ timestamp: 20, connName: 'b', qps: 2 }),
      rec({ timestamp: 5, connName: 'a', qps: 9 }),
    ], 'qps');
    expect(series.map(s => s.name)).toEqual(['a', 'b']);
    expect(series[1]!.points.map(p => p.t)).toEqual([10, 20, 30]);
    expect(series[1]!.points.map(p => p.v)).toEqual([1, 2, 3]);
  });
  it('该 field 非 number（缺省/字符串/NaN/Infinity）的点整条剔除', () => {
    const series = buildSeries([
      rec({ timestamp: 1, connName: 'a', qps: 1 }),
      rec({ timestamp: 2, connName: 'a' }),                      // 首轮未算出，缺省
      rec({ timestamp: 3, connName: 'a', qps: 'x' as any }),     // 脏数据
      rec({ timestamp: 4, connName: 'a', qps: NaN }),
      rec({ timestamp: 5, connName: 'a', qps: Infinity }),
      rec({ timestamp: 6, connName: 'a', qps: 4 }),
    ], 'qps');
    expect(series).toHaveLength(1);
    expect(series[0]!.points).toEqual([{ t: 1, v: 1 }, { t: 6, v: 4 }]);
  });
  it('空输入/全被剔除 → 空数组', () => {
    expect(buildSeries([], 'heapUsedPct')).toEqual([]);
    expect(buildSeries([rec({ timestamp: 1, connName: 'a' })], 'cpuPct')).toEqual([]);
  });
});

describe('polylinePoints 多序列叠加', () => {
  const a = { name: 'a', points: [{ t: 1000, v: 100 }, { t: 2000, v: 200 }] };
  const b = { name: 'b', points: [{ t: 1500, v: 50 }, { t: 2500, v: 100 }] };

  it('每组一条、与输入同序；全体点共享 x/y 域（叠加可横向比对）', () => {
    const out = polylinePoints([a, b], 300, 64);
    expect(out.map(o => o.name)).toEqual(['a', 'b']);
    const pa = out[0]!.attr.split(' ').map(p => p.split(',').map(Number));
    const pb = out[1]!.attr.split(' ').map(p => p.split(',').map(Number));
    // x 域=全体点 [1000,2500] 归一到 [0,300]
    expect(pa[0]![0]).toBeCloseTo(0, 1);
    expect(pa[1]![0]).toBeCloseTo(200, 1);
    expect(pb[0]![0]).toBeCloseTo(100, 1);
    expect(pb[1]![0]).toBeCloseTo(300, 1);
    // y 域=全体最大 200*1.1=220：a 的峰值点 y = 64-(200/220)*64
    expect(pa[1]![1]).toBeCloseTo(64 - (200 / 220) * 64, 1);
    expect(pb[1]![1]).toBeCloseTo(64 - (100 / 220) * 64, 1);
  });
  it('单点组/空组画不出线，attr 空串；空输入返回空数组', () => {
    const single = { name: 's', points: [{ t: 1, v: 5 }] };
    const out = polylinePoints([a, single, { name: 'e', points: [] }], 300, 64);
    expect(out).toHaveLength(3);
    expect(out[0]!.attr).not.toBe('');
    expect(out[1]!.attr).toBe('');
    expect(out[2]!.attr).toBe('');
    expect(polylinePoints([], 300, 64)).toEqual([]);
  });
  it('全体为零时 yMax 回 1 防除零，线落在底边', () => {
    const z = { name: 'z', points: [{ t: 1, v: 0 }, { t: 2, v: 0 }] };
    const out = polylinePoints([z], 300, 64);
    const pts = out[0]!.attr.split(' ').map(p => p.split(',').map(Number));
    expect(pts.every(p => p[1] === 64)).toBe(true);
  });
});

describe('yMaxOf 全体 y 域上界', () => {
  it('全体最大 ×1.1；空/全零/负值回 1 防除零', () => {
    expect(yMaxOf([])).toBe(1);
    expect(yMaxOf([{ name: 'z', points: [{ t: 1, v: 0 }, { t: 2, v: 0 }] }])).toBe(1);
    expect(yMaxOf([{ name: 'n', points: [{ t: 1, v: -5 }] }])).toBe(1);
    expect(yMaxOf([{ name: 'a', points: [{ t: 1, v: 100 }, { t: 2, v: 200 }] }])).toBeCloseTo(220, 10);
  });
  it('跨序列取全体最大；单点同样 ×1.1', () => {
    expect(yMaxOf([
      { name: 'a', points: [{ t: 1, v: 30 }] },
      { name: 'b', points: [{ t: 2, v: 80 }, { t: 3, v: 40 }] },
    ])).toBeCloseTo(88, 10);
    expect(yMaxOf([{ name: 's', points: [{ t: 1, v: 5 }] }])).toBeCloseTo(5.5, 10);
  });
});

describe('timeTicks X 轴时间标注', () => {
  it('默认 3 只：tMin/中点/tMax（末位取本值防浮点漂移）', () => {
    expect(timeTicks(1000, 2500)).toEqual([1000, 1750, 2500]);
    expect(timeTicks(0, 10)).toEqual([0, 5, 10]);
  });
  it('范围塌缩（同刻）退化为单只；count=2 只给两端', () => {
    expect(timeTicks(500, 500)).toEqual([500]);
    expect(timeTicks(1000, 2500, 2)).toEqual([1000, 2500]);
  });
  it('tMin>tMax 交换兜底；非有限数/count<1 返回空数组', () => {
    expect(timeTicks(2500, 1000)).toEqual([1000, 1750, 2500]);
    expect(timeTicks(NaN, 10)).toEqual([]);
    expect(timeTicks(0, Infinity)).toEqual([]);
    expect(timeTicks(0, 10, 0)).toEqual([]);
  });
});

describe('nearestAt 悬停时刻取点', () => {
  const a = { name: 'a', points: [{ t: 1000, v: 10 }, { t: 2000, v: 20 }, { t: 3000, v: 30 }] };
  it('每序列取 |t-ti| 最小的点值；平局取时间较早一侧', () => {
    expect(nearestAt([a], 1800)).toEqual([{ name: 'a', v: 20 }]);
    expect(nearestAt([a], 0)).toEqual([{ name: 'a', v: 10 }]);
    expect(nearestAt([a], 9999)).toEqual([{ name: 'a', v: 30 }]);
    expect(nearestAt([a], 1500)).toEqual([{ name: 'a', v: 10 }]); // 500:500 平局取先者
  });
  it('跨序列独立取点；空点序列跳过；空输入返回空数组', () => {
    const b = { name: 'b', points: [{ t: 2600, v: 99 }] };
    expect(nearestAt([a, b], 2000)).toEqual([{ name: 'a', v: 20 }, { name: 'b', v: 99 }]);
    expect(nearestAt([{ name: 'e', points: [] }], 1000)).toEqual([]);
    expect(nearestAt([], 1000)).toEqual([]);
  });
});

describe('fmtUnit 值按单位格式化', () => {
  it("'doc/s' 与 '/s'：<10 两位小数，否则整数", () => {
    expect(fmtUnit(5.239, 'doc/s')).toBe('5.24');
    expect(fmtUnit(15.7, 'doc/s')).toBe('16');
    expect(fmtUnit(3.14159, '/s')).toBe('3.14');
    expect(fmtUnit(12.4, '/s')).toBe('12');
  });
  it("'%' 保留 1 位小数；无单位整数；其它单位串按无单位处理", () => {
    expect(fmtUnit(50, '%')).toBe('50.0%');
    expect(fmtUnit(7.6, '%')).toBe('7.6%');
    expect(fmtUnit(7.6)).toBe('8');
    expect(fmtUnit(123.4, '次')).toBe('123');
  });
  it('非法值（NaN/Infinity）一律 \'-\'', () => {
    expect(fmtUnit(NaN, '%')).toBe('-');
    expect(fmtUnit(Infinity)).toBe('-');
    expect(fmtUnit(-Infinity, 'doc/s')).toBe('-');
  });
});

describe('intervalFor/intervalMsFor 范围档→降采样 interval 映射', () => {
  it('全档映射：1h→1m / 6h→2m / 24h→5m / 3d→15m / 7d→30m / 14d→60m（R32 G5）', () => {
    expect(intervalFor('1h')).toBe('1m');
    expect(intervalFor('6h')).toBe('2m');
    expect(intervalFor('24h')).toBe('5m');
    expect(intervalFor('3d')).toBe('15m');
    expect(intervalFor('7d')).toBe('30m');
    expect(intervalFor('14d')).toBe('60m');
  });
  it('未知档回落 5m（新增范围档未入表时安全兜底）', () => {
    expect(intervalFor('90d')).toBe('5m');
    expect(intervalFor('')).toBe('5m');
  });
  it('intervalMsFor 同映射毫秒值（与 intervalFor 单源；未知同走 5m=300000）', () => {
    expect(intervalMsFor('1h')).toBe(60_000);
    expect(intervalMsFor('6h')).toBe(120_000);
    expect(intervalMsFor('24h')).toBe(300_000);
    expect(intervalMsFor('3d')).toBe(900_000);
    expect(intervalMsFor('7d')).toBe(1_800_000);
    expect(intervalMsFor('14d')).toBe(3_600_000);
    expect(intervalMsFor('90d')).toBe(300_000);
  });
});

describe('polylineSegments 断档感知折线分段', () => {
  it('连续点=1 段；坐标口径与 polylinePoints 同（x 域全体点范围、y 域全体 max×1.1）', () => {
    const pts = [{ t: 1000, v: 100 }, { t: 2000, v: 200 }, { t: 3000, v: 150 }];
    const segs = polylineSegments(pts, 300, 64, 60_000);
    expect(segs).toHaveLength(1);
    const pairs = segs[0]!.split(' ').map(p => p.split(',').map(Number));
    // x 域=[1000,3000]→[0,300]
    expect(pairs[0]![0]).toBeCloseTo(0, 1);
    expect(pairs[1]![0]).toBeCloseTo(150, 1);
    expect(pairs[2]![0]).toBeCloseTo(300, 1);
    // y 域=全体最大 200*1.1=220：峰值点 y=64-(200/220)*64
    expect(pairs[1]![1]).toBeCloseTo(64 - (200 / 220) * 64, 1);
  });
  it('中间插一个 >gapMs 间隔断开=2 段且段内点序正确；x 域仍=全体点范围', () => {
    const pts = [{ t: 0, v: 1 }, { t: 10, v: 2 }, { t: 20, v: 3 }, { t: 100, v: 4 }, { t: 110, v: 2 }];
    const segs = polylineSegments(pts, 300, 60, 50);
    expect(segs).toHaveLength(2);
    // 段一=断点前 3 点（时间升序原样保留）
    expect(segs[0]!.split(' ')).toHaveLength(3);
    const head = segs[0]!.split(' ')[0]!.split(',').map(Number);
    expect(head[0]).toBeCloseTo(0, 1);
    expect(head[1]).toBeCloseTo(60 - (1 / 4.4) * 60, 1); // yMax=4*1.1=4.4
    // 段二=断点后 2 点；x 按全体点域 [0,110] 归一（t=100→272.7），不按段内重定域
    expect(segs[1]!.split(' ')).toHaveLength(2);
    const tail = segs[1]!.split(' ')[0]!.split(',').map(Number);
    expect(tail[0]).toBeCloseTo((100 / 110) * 300, 1);
    expect(tail[1]).toBeCloseTo(60 - (4 / 4.4) * 60, 1);
  });
  it('断开后尾段不足 2 点丢弃（单点画不出线，圆点形态由调用方兜底）', () => {
    const pts = [{ t: 0, v: 1 }, { t: 10, v: 2 }, { t: 100, v: 3 }];
    expect(polylineSegments(pts, 300, 60, 50)).toHaveLength(1);
  });
  it('Δt==gapMs 不断（严格大于才断）：桶距恰等阈值时恒连线', () => {
    const pts = [{ t: 0, v: 1 }, { t: 50, v: 2 }];
    expect(polylineSegments(pts, 300, 60, 50)).toHaveLength(1);
  });
  it('gapMs 缺省（undefined）永不断：超大间隔也 1 段（与分段改造前单段形态一致）', () => {
    const pts = [{ t: 0, v: 1 }, { t: 1e12, v: 2 }];
    expect(polylineSegments(pts, 300, 60)).toHaveLength(1);
    expect(polylineSegments(pts, 300, 60, undefined)).toHaveLength(1);
  });
  it('空/单点画不出线返回 []；全零 yMax 回 1 防除零不炸', () => {
    expect(polylineSegments([], 300, 60)).toEqual([]);
    expect(polylineSegments([{ t: 1, v: 5 }], 300, 60, 1000)).toEqual([]);
    const z = [{ t: 0, v: 0 }, { t: 10, v: 0 }];
    expect(polylineSegments(z, 300, 60, 100)).toHaveLength(1);
    expect(Number(polylineSegments(z, 300, 60, 100)[0]!.split(' ')[0]!.split(',')[1])).toBe(60);
  });
});

/* ═══════════ HistoryChart 统一件挂载真测（createApp + happy-dom） ═══════════ */

const sA = { name: 'node-a', points: [{ t: 1000, v: 100 }, { t: 2000, v: 200 }, { t: 3000, v: 150 }] };
const sB = { name: 'node-b', points: [{ t: 1500, v: 50 }, { t: 2500, v: 80 }] };

async function mountChart(props: Record<string, unknown>) {
  const { createApp, h, nextTick } = await import('vue');
  const HistoryChart = (await import('../components/HistoryChart.vue')).default;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(HistoryChart, props as any) });
  app.config.warnHandler = () => {};
  app.mount(host);
  await nextTick();
  await nextTick();
  return { host, cleanup: () => app.unmount() };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('HistoryChart 图卡组件', () => {
  const base = { title: 'QPS（次/秒）', unit: '/s', series: [sA, sB], threshold: 180 };

  it('图例 chips 数=序列数（色点+名称在场）', async () => {
    const { host, cleanup } = await mountChart(base);
    const chips = host.querySelectorAll('.hc-chip');
    expect(chips).toHaveLength(2);
    expect(chips[0]!.textContent).toContain('node-a');
    expect(chips[1]!.textContent).toContain('node-b');
    cleanup();
  });

  it('点 chip 切换可见性：off 档 + 折线/面积随之消失再恢复；色号（色点底色）锚定不变', async () => {
    const { host, cleanup } = await mountChart(base);
    const chipA = host.querySelectorAll('.hc-chip')[0] as HTMLElement;
    const dotColor = (chipA.querySelector('i') as HTMLElement).style.background;
    expect(host.querySelectorAll('.hc-line')).toHaveLength(2);
    chipA.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));
    expect((host.querySelectorAll('.hc-chip')[0] as HTMLElement).classList.contains('off')).toBe(true);
    expect(host.querySelectorAll('.hc-line')).toHaveLength(1);
    expect(host.querySelectorAll('.hc-area')).toHaveLength(1);
    // 隐藏序列不进 tooltip 基础面（图例仍在，可点回）
    expect((host.querySelectorAll('.hc-chip')[0] as HTMLElement).getAttribute('aria-pressed')).toBe('false');
    (host.querySelectorAll('.hc-chip')[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));
    expect(host.querySelectorAll('.hc-line')).toHaveLength(2);
    expect((host.querySelectorAll('.hc-chip')[0] as HTMLElement).classList.contains('off')).toBe(false);
    expect(((host.querySelectorAll('.hc-chip')[0] as HTMLElement).querySelector('i') as HTMLElement).style.background).toBe(dotColor);
    cleanup();
  });

  it('统计区文本含「当前/最大/均值」；数值走 unit 格式化单源（799 同步更新：「当前」升行② hc-cur 28px 大数，统计条保最大/均值）', async () => {
    const { host, cleanup } = await mountChart(base);
    const t = host.querySelector('.hc-stats')!.textContent!;
    const cur = host.querySelector('.hc-cur')!.textContent!;
    expect(cur, '当前值=行② KPI 大数（799 件2 卡头对齐）').toBeTruthy();
    expect(t).toContain('最大');
    expect(t).toContain('均值');
    // 最大=全体点 max 200（'/s' ≥10 取整）
    expect(t).toContain('200');
    cleanup();
  });

  it('threshold 传入且在 y 域内：svg 存在 dashed 线 + 右侧阈值小字；超域不画', async () => {
    const { host, cleanup } = await mountChart(base);
    const dashed = host.querySelector('svg line[stroke-dasharray]');
    expect(dashed).toBeTruthy();
    expect(dashed!.getAttribute('stroke')).toBe('var(--err)');
    expect(host.querySelector('.hc-thlabel')!.textContent).toContain('180');
    cleanup();
    const { host: h2, cleanup: c2 } = await mountChart({ ...base, threshold: 999 });
    expect(h2.querySelector('svg line[stroke-dasharray]')).toBeNull();
    c2();
  });

  it('时间轴 3 只标注在场（tmin/中点/tmax）', async () => {
    const { host, cleanup } = await mountChart(base);
    expect(host.querySelectorAll('.hc-xaxis span')).toHaveLength(3);
    cleanup();
  });

  it('gapMs 传入启用断档感知（超阈间隔拆多段 .hc-line）；不传=单段旧形态', async () => {
    const gapped = { name: 'g', points: [{ t: 0, v: 10 }, { t: 1000, v: 20 }, { t: 60000, v: 30 }, { t: 61000, v: 25 }] };
    const { host, cleanup } = await mountChart({ title: '断档', series: [gapped], gapMs: 5000 });
    expect(host.querySelectorAll('.hc-line')).toHaveLength(2);
    cleanup();
    const { host: h2, cleanup: c2 } = await mountChart({ title: '连续', series: [gapped] });
    expect(h2.querySelectorAll('.hc-line')).toHaveLength(1);
    c2();
  });

  it('序列空 → EmptyState「暂无采样」；全隐藏同样落空态（图例仍在可点回）', async () => {
    const { host, cleanup } = await mountChart({ ...base, series: [] });
    expect(host.textContent).toContain('暂无采样');
    expect(host.querySelector('.hc-svg')).toBeNull();
    cleanup();
    const { host: h2, cleanup: c2 } = await mountChart(base);
    for (const chip of Array.from(h2.querySelectorAll('.hc-chip'))) {
      (chip as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 0));
    expect(h2.textContent).toContain('暂无采样');
    // 图例 chips 保留（可恢复显示），统计条随空态移除
    expect(h2.querySelectorAll('.hc-chip')).toHaveLength(2);
    expect(h2.querySelector('.hc-stats')).toBeNull();
    c2();
  });
});

describe('source-lock：api.ts 监控指标读侧契约面', () => {
  it('MonitorMetricsRecord 行类型在案（键与后端 /monitor-metrics 落档一一对应）', () => {
    expect(apiSrc).toContain('export interface MonitorMetricsRecord {');
    expect(apiSrc).toContain('status?: string; qps?: number; indexRate?: number; heapUsedPct?: number; cpuPct?: number; diskUsedPct?: number;');
  });
  it('monitorMetrics 指向 /monitor-metrics 且 GET 只读（? 分隔符显式）', () => {
    expect(apiSrc).toMatch(/monitorMetrics: \(p: \{ connId\?: string; connName\?: string; scope\?: string; fromMs\?: number; toMs\?: number;/);
    expect(apiSrc).toContain('get<{ records: MonitorMetricsRecord[] }>(`/monitor-metrics?${q(p)}`)');
  });
  it('降采样 interval 可选参数在案（缺省=原始逐点现状；带上=date_histogram 降采样桶）；R31 agg 聚合方式同步更新', () => {
    expect(apiSrc).toMatch(/size\?: number; from\?: number; interval\?: string; agg\?: string \}\)/);
  });
});

describe('source-lock：LiveDashboardView 历史趋势分区', () => {
  it('分区标题与时间范围常量在案', () => {
    expect(view).toContain('历史趋势');
    expect(view).toContain('MH_RANGE_MS');
  });
  it('取数与序列构建接线：monitorMetrics( 调用 + buildSeries( 使用 + scope 双态（集群/节点下钻）', () => {
    expect(view).toContain('monitorMetrics(');
    expect(view).toContain('buildSeries(');
    // 升级同步更新：scope 由固定 'cluster' 变 nodeMode 单源双态（原字面量断言随之改形）
    expect(view).toMatch(/scope: nodeMode\.value \? 'node' : 'cluster'/);
  });
  it('HistoryChart 统一件接线 + 「按节点查看」下钻开关（nodeMode 单源；palette 单源传入）', () => {
    expect(view).toContain('<HistoryChart');
    expect(view).toContain('按节点查看');
    expect(view).toMatch(/const nodeMode = computed\(/);
    expect(view).toContain(':palette="HIST_COLORS"');
  });
  it('降采样接线：intervalFor( 算 interval 随取数下推 + :gap-ms= 断档阈值（3 倍生效桶距）直传图卡', () => {
    expect(view).toContain('intervalFor(');
    expect(view).toContain('interval: mh2Interval.value');
    expect(view).toContain(':gap-ms=');
    /* 六百四十三批 637-C2：gap 跟生效 interval（mh2GapMs）而非范围 */
    expect(view).toMatch(/:gap-ms="mh2GapMs"/);
  });
  it('旧 mini-svg 历史写法退役（变异锚）：histPolylines/hasLine/histLegend/ld-hist-chart 不在场', () => {
    expect(view).not.toContain('histPolylines');
    expect(view).not.toContain('hasLine');
    expect(view).not.toContain('histLegend');
    expect(view).not.toContain('ld-hist-chart');
  });
});

/* ═══ 20260923 R2：断链 RED 色带（「集群红了」与「没采到」视觉分家） ═══ */
describe('redBands RED 时段合成', () => {
  const red = (t: number): MonitorMetricsRecord => ({ timestamp: t, status: 'red', connName: '腾讯云QA' });
  const ok = (t: number): MonitorMetricsRecord => ({ timestamp: t, status: 'green', connName: '腾讯云QA' });

  it('连续 red 采样（间隔≤gapMs）合并为单一时段带', () => {
    const bands = redBands([red(0), red(60_000), red(120_000)], 3 * 60_000);
    expect(bands).toEqual([{ from: 0, to: 120_000 }]);
  });
  it('间隔超 gapMs 拆为多段；非 red 采样重置窗口', () => {
    const bands = redBands([red(0), red(10 * 60_000), ok(11 * 60_000), red(20 * 60_000)], 3 * 60_000);
    expect(bands).toEqual([
      { from: 0, to: 0 },
      { from: 10 * 60_000, to: 10 * 60_000 },
      { from: 20 * 60_000, to: 20 * 60_000 },
    ]);
  });
  it('空输入与无 red 采样回空数组；乱序输入按时间排序后合成', () => {
    expect(redBands([], 60_000)).toEqual([]);
    expect(redBands([ok(0)], 60_000)).toEqual([]);
    const bands = redBands([red(120_000), red(0)], 3 * 60_000);
    expect(bands).toEqual([{ from: 0, to: 120_000 }]);
  });
});

describe('HistoryChart 状态色带渲染', () => {
  it('组件支持 statusBands prop 并渲染 hc-band 矩形(带原生 title 提示)', () => {
    expect(chartSrc).toContain('statusBands?: { from: number; to: number; label?: string }[];');
    expect(chartSrc).toContain('class="hc-band"');
    expect(chartSrc).toContain('<title>{{ b.label }}</title>');
  });
  it('色带画在数据之下(声明序:band 先于 area/line)', () => {
    const bandIdx = chartSrc.indexOf('class="hc-band"');
    const areaIdx = chartSrc.indexOf('class="hc-area"');
    expect(bandIdx).toBeGreaterThan(-1);
    expect(areaIdx).toBeGreaterThan(bandIdx);
  });
  it('单采样带保底可见宽(x1≤x0 丢弃在域外的带)', () => {
    expect(chartSrc).toContain('Math.max(x1 - x0, 3)');
    expect(chartSrc).toContain('if (x1 <= 0 || x0 >= PLOT_W) continue;');
  });
});

describe('视图 RED 色带接线', () => {
  it('statusBands 由 redBands(hist) 合成且 error 进 label', () => {
    expect(view).toContain('redBands(hist.value)');
    expect(view).toContain("return { ...b, label: cause?.error ? '集群失联：' + cause.error : '集群失联时段' };");
  });
  it('五张图卡均传 :status-bands', () => {
    expect(view).toContain(':status-bands="statusBands"');
  });
});

/* ═══ R4 节点一览：latestByNode 每节点最新一条+节点名排序 ═══ */
describe('latestByNode 节点最新水位', () => {
  it('同节点多条取最新，节点名升序输出', () => {
    const rows = latestByNode([
      { timestamp: 100, nodeName: 'node-b', connId: 'c1', heapUsedPct: 30 },
      { timestamp: 300, nodeName: 'node-a', connId: 'c1', heapUsedPct: 41 },
      { timestamp: 200, nodeName: 'node-b', connId: 'c1', heapUsedPct: 35 },
    ]);
    expect(rows.map(r => r.nodeName)).toEqual(['node-a', 'node-b']);
    expect(rows[1]!.heapUsedPct).toBe(35);
  });
  it('缺 timestamp 的行剔除；空输入回空', () => {
    expect(latestByNode([])).toEqual([]);
    const rows = latestByNode([{ nodeName: 'x' } as MonitorMetricsRecord]);
    expect(rows).toEqual([]);
  });
});

/* ═══ R5 磁盘水位线性外推（最小二乘，时间轴归一天） ═══ */
describe('diskForecast 最小二乘外推', () => {
  const DAY = 86_400_000;
  const mk = (name: string, daysAgo: number, v: number): MonitorMetricsRecord =>
    ({ timestamp: Date.now() - daysAgo * DAY, connName: name, diskUsedPct: v });

  it('稳定上涨序列拟合出正斜率与预测天数', () => {
    /* 完美线性：5 天前 50% → 今天 60%，+2%/天 → 达 85% 还需 12.5 天 */
    const series = [{ name: '腾讯云QA', points: [5, 4, 3, 2, 1, 0].map(d => ({ t: Date.now() - d * DAY, v: 50 + 2 * (5 - d) })) }];
    const out = diskForecast(series, 85, 30 * DAY);
    expect(out[0]!.days).toBeCloseTo(12.5, 5);
    expect(out[0]!.points!.length).toBe(2);
  });
  it('斜率≤0（平稳/回落）不预测', () => {
    const series = [{ name: 'a', points: [2, 1, 0].map(d => ({ t: Date.now() - d * DAY, v: 30 })) }];
    expect(diskForecast(series, 85, 30 * DAY)[0]!.days).toBeNull();
    expect(diskForecast(series, 85, 30 * DAY)[0]!.points).toEqual([]);
  });
  it('已达阈值 days=0；单点序列不预测', () => {
    const hit = [{ name: 'a', points: [1, 0].map(d => ({ t: Date.now() - d * DAY, v: 90 })) }];
    expect(diskForecast(hit, 85, 30 * DAY)[0]!.days).toBe(0);
    const one = [{ name: 'a', points: [{ t: Date.now(), v: 30 }] }];
    expect(diskForecast(one, 85, 30 * DAY)[0]!.days).toBeNull();
  });
  it('视图接线:磁盘图卡专属外推+note 文案+节点态不外推', () => {
    expect(view).toContain("m.field === 'diskUsedPct' && !nodeMode.value");
    expect(view).toContain('天后磁盘达 85%');
    expect(view).toContain('磁盘已达 85%');
    expect(view).toContain(':forecast="c.forecast" :note="c.note"');
  });
});

/* ═══ R6 环形治理用量条：api 契约+视图接线（30GB 口径看得见） ═══ */
describe('环形治理用量', () => {
  it('api.ringUsage 指向 /ring-usage 且返回分族字节', () => {
    expect(apiSrc).toContain("ringUsage: () => get<{ auditPrefix: string; monitorPrefix: string; auditBytes: number;");
    expect(apiSrc).toContain("'/ring-usage'");
  });
  it('视图治理条接线:ld-hist-ring+ringPct+fmtGB 在场', () => {
    expect(view).toContain('ld-hist-ring');
    expect(view).toContain('ringPct');
    expect(view).toContain('function fmtGB(');
  });
});

/* ═══ R7 服务端告警条：activeAlerts 活跃集推导（真测） ═══ */
const al = (over: Partial<MonitorAlertDoc> & { timestamp: number; metric: string }): MonitorAlertDoc =>
  over as MonitorAlertDoc;

describe('activeAlerts 服务端告警活跃集', () => {
  it('同 connId|metric 键取 timestamp 最新一条；不同键各自保留', () => {
    const out = activeAlerts([
      al({ timestamp: 100, connId: 'c1', metric: 'heap', level: 'WARN', value: 70 }),
      al({ timestamp: 300, connId: 'c1', metric: 'heap', level: 'CRIT', value: 85 }),
      al({ timestamp: 200, connId: 'c1', metric: 'disk', level: 'WARN', value: 88 }),
      al({ timestamp: 250, connId: 'c2', metric: 'heap', level: 'WARN', value: 66 }),
    ]);
    expect(out).toHaveLength(3);
    const heap = out.find(a => a.connId === 'c1' && a.metric === 'heap')!;
    expect(heap.timestamp).toBe(300);
    expect(heap.value).toBe(85);
    expect(heap.level).toBe('CRIT');
  });
  it('level 三档原样透传（CRIT/WARN/INFO 不改写不合并）；输出按 timestamp 降序', () => {
    const out = activeAlerts([
      al({ timestamp: 1, connId: 'c1', metric: 'heap', level: 'CRIT' }),
      al({ timestamp: 2, connId: 'c1', metric: 'disk', level: 'WARN' }),
      al({ timestamp: 3, connId: 'c1', metric: 'health', level: 'INFO' }),
    ]);
    expect(out.map(a => a.level)).toEqual(['INFO', 'WARN', 'CRIT']);
  });
  it('最新一条 recovered:true 的键剔除（恢复事件留痕不留条）；恢复后新告警重新激活', () => {
    const out = activeAlerts([
      al({ timestamp: 100, connId: 'c1', metric: 'heap', level: 'CRIT' }),
      al({ timestamp: 200, connId: 'c1', metric: 'heap', level: 'INFO', recovered: true }),
      al({ timestamp: 150, connId: 'c2', metric: 'disk', level: 'WARN' }),
    ]);
    expect(out.map(a => a.connId)).toEqual(['c2']);
    const react = activeAlerts([
      al({ timestamp: 100, connId: 'c1', metric: 'heap', level: 'INFO', recovered: true }),
      al({ timestamp: 300, connId: 'c1', metric: 'heap', level: 'WARN' }),
    ]);
    expect(react).toHaveLength(1);
    expect(react[0]!.level).toBe('WARN');
  });
  it('空/全非法输入回空数组；缺 timestamp 的行剔除', () => {
    expect(activeAlerts([])).toEqual([]);
    expect(activeAlerts([{ metric: 'heap', level: 'WARN' } as MonitorAlertDoc])).toEqual([]);
    expect(activeAlerts([al({ timestamp: NaN, connId: 'x', metric: 'heap', level: 'WARN' })])).toEqual([]);
  });
});

/* ═══ R7 服务端告警条 + R8 GC 曲线：source-lock ═══ */
describe('source-lock：服务端告警条与 GC 差分接线', () => {
  it('api.ts：MonitorAlertDoc 接口在案 + monitorAlerts 指向 /monitor-alerts（size 下推）', () => {
    expect(apiSrc).toContain('export interface MonitorAlertDoc {');
    expect(apiSrc).toMatch(/level: 'WARN' \| 'CRIT' \| 'INFO'; metric: string;/);
    expect(apiSrc).toMatch(/recovered\?: boolean;/);
    expect(apiSrc).toContain("monitorAlerts: (size = 50, fromMs?: number, toMs?: number) => get<{ records: MonitorAlertDoc[] }>(`/monitor-alerts?${q({ size, fromMs, toMs })}`)");
  });
  it('MonitorMetricsRecord 含 R8 GC 差分字段（gcYoungPerMin/gcOldPerMin，error 字段旁）', () => {
    expect(apiSrc).toContain('gcYoungPerMin?: number; gcOldPerMin?: number;');
  });
  it('activeAlerts 纯函数单源在 utils/monitorSeries（视图不私造推导）', () => {
    expect(seriesSrc).toContain('export function activeAlerts(');
  });
  it('视图：服务端告警条渲染锚（srvAlerts 接线 + activeAlerts 推导 + 无活动告警 文本）', () => {
    expect(view).toContain('const srvAlerts = ref<MonitorAlertDoc[]>([]);');
    /* activeAlerts 与 storeToRefs 解构的实时告警 activeAlerts 同名，视图侧别名 deriveActiveAlerts 消费 */
    expect(view).toContain('activeAlerts as deriveActiveAlerts');
    expect(view).toContain('deriveActiveAlerts(srvAlerts.value)');
    expect(view).toContain('api.monitorAlerts(100, histFromMs, rangeMs.value.to)'); /* R66 custom 档终点下推 */
    expect(view).toContain('无活动告警');
    expect(view).toContain('ld-hist-alerts');
  });
  it('视图：GC 图卡仅节点下钻（onlyNodeMode 声明 + gcYoungPerMin 卡 + 集群态过滤）', () => {
    expect(view).toContain('onlyNodeMode?: boolean');
    expect(view).toContain("field: 'gcYoungPerMin', label: 'Young GC（次/分）', unit: '', onlyNodeMode: true");
    expect(view).toMatch(/\.filter\(m => \(!m\.onlyNodeMode \|\| nodeMode\.value\) && \(!m\.onlyClusterMode \|\| !nodeMode\.value\)\)/);
  });
});

/* ═══ R11 告警事件标记：HistoryChart events prop+视图窗口对齐接线 ═══ */
describe('HistoryChart 告警事件标记（R14 收敛进色带体系）', () => {
  it('组件支持 events prop 并渲染 hc-evband 窄竖条(与色带同层同语言,title=事件文案,level 染色)', () => {
    expect(chartSrc).toContain('events?: { t: number; label: string; level?: string }[];');
    expect(chartSrc).toContain('class="hc-evband"');
    expect(chartSrc).toContain('<title>{{ e.title }}</title>');
    expect(chartSrc).toContain("e.level === 'CRIT' ? 'var(--err)' : e.level === 'WARN' ? 'var(--wn)' : 'var(--tx2)'");
  });
  it('旧顶部菱形散标记退役(变异锚:hc-event 菱形不在场)', () => {
    expect(chartSrc).not.toContain('hc-event');
  });
  it('视图接线:告警窗口与曲线取数同域+chartEvents 过滤未恢复 CRIT/WARN', () => {
    expect(view).toContain('api.monitorAlerts(100, histFromMs, rangeMs.value.to)'); /* R66 custom 档终点下推 */
    expect(view).toContain(".filter(a => !a.recovered && (a.level === 'CRIT' || a.level === 'WARN'))");
    expect(view).toContain(':events="chartEvents"');
  });
});

/* ═══ R15 GC 图卡阈值参考线（HIST_CHARTS gcYoungPerMin threshold=10 经验参考线） ═══ */
describe('R15 GC 图卡阈值线', () => {
  it('HIST_CHARTS gcYoungPerMin 带阈值 10', () => {
    expect(view).toContain("{ field: 'gcYoungPerMin', label: 'Young GC（次/分）', unit: '', onlyNodeMode: true, threshold: 10 },");
  });
  it('视图阈值透传单源化(threshold: m.threshold)', () => {
    expect(view).toContain('threshold: m.threshold,');
  });
});

/* ═══ R16 tooltip 富化：悬停窗口内告警事件并入 tooltip（level 色+完整文案） ═══ */
describe('R16 tooltip 富化', () => {
  it('hoverAlerts computed 在案(±2% 域宽窗口,level 染色)', () => {
    expect(chartSrc).toContain('const hoverAlerts = computed(');
    expect(chartSrc).toContain("e.level === 'CRIT' ? 'var(--err)' : e.level === 'WARN' ? 'var(--wn)' : 'var(--tx2)'");
  });
  it('tooltip 模板含告警事件行(hc-tip-al)', () => {
    expect(chartSrc).toContain('class="hc-tip-row hc-tip-al"');
  });
  it('视图告警窗口与曲线取数同域(串味防护)', () => {
    expect(view).toContain('api.monitorAlerts(100, histFromMs, rangeMs.value.to)'); /* R66 custom 档终点下推 */
  });
});

/* ═══ R18 探活历史健康摘要：probeDigest 按集群聚合 ═══ */
describe('probeDigest 健康摘要条', () => {
  it('按集群聚合采样数/RED 计数/最慢时延,RED 多的排前', () => {
    const rows: MonitorMetricsRecord[] = [
      { timestamp: 1, connName: 'a', status: 'GREEN', latencyMs: 10 },
      { timestamp: 2, connName: 'a', status: 'RED', latencyMs: undefined as unknown as number },
      { timestamp: 3, connName: 'b', status: 'GREEN', latencyMs: 30 },
    ];
    const out = probeDigest(rows as any);
    expect(out.length).toBe(2);
    expect(out[0]!.name).toBe('a');
    expect(out[0]!.reds).toBe(1);
    expect(out[0]!.total).toBe(2);
    expect(out[0]!.worstMs).toBe(10);
    expect(out[1]!.worstMs).toBe(30);
  });
  it('空输入回空', () => {
    expect(probeDigest([])).toEqual([]);
  });
});

/* ═══ R29/R30 节点深耕：新指标图卡（对标阿里云基础监控节点级，采样周期 60s 已在副标题标注） ═══ */
describe('R29/R30 节点深耕图卡', () => {
  it('MonitorSeriesField 联合类型扩员七字段', () => {
    expect(seriesSrc).toContain("'load1m' | 'diskReadKbS' | 'diskWriteKbS' | 'diskReadIops' | 'diskWriteIops'");
    expect(seriesSrc).toContain("'tpSearchActive' | 'tpSearchQueue'");
  });
  it('HIST_CHARTS 七张 onlyNodeMode 卡（线程池活跃/排队+磁盘带宽读写+IOPS 读写+Load_1m）', () => {
    expect(view).toContain("{ field: 'tpSearchActive', label: '查询线程池活跃（个）', unit: '', onlyNodeMode: true }");
    expect(view).toContain("{ field: 'tpSearchQueue', label: '查询线程池排队（个）', unit: '', onlyNodeMode: true }");
    expect(view).toContain("{ field: 'diskReadKbS', label: '磁盘带宽·读', unit: 'KiB/s', onlyNodeMode: true }");
    expect(view).toContain("{ field: 'diskWriteKbS', label: '磁盘带宽·写', unit: 'KiB/s', onlyNodeMode: true }");
    expect(view).toContain("{ field: 'diskReadIops', label: '磁盘 IOPS·读（次/秒）', unit: '', onlyNodeMode: true }");
    expect(view).toContain("{ field: 'diskWriteIops', label: '磁盘 IOPS·写（次/秒）', unit: '', onlyNodeMode: true }");
    expect(view).toContain("{ field: 'load1m', label: 'Load_1m', unit: '', onlyNodeMode: true }");
  });
  it('api.ts MonitorMetricsRecord 契约扩员（node doc 专属字段可选）', () => {
    expect(apiSrc).toContain('load1m?: number; diskReadKbS?: number; diskWriteKbS?: number; diskReadIops?: number; diskWriteIops?: number;');
    expect(apiSrc).toContain('tpSearchActive?: number; tpSearchQueue?: number;');
  });
  it('buildSeries 真测：load1m 按 connName 分组剔非 number 点（节点模式由视图先映射 connName=nodeName）', () => {
    const rows = [
      { timestamp: 1, connName: 'n1', load1m: 1.98 },
      { timestamp: 2, connName: 'n1' } as MonitorMetricsRecord,
      { timestamp: 3, connName: 'n2', load1m: 0.5 },
    ];
    const out = buildSeries(rows, 'load1m');
    expect(out.length).toBe(2);
    expect(out[0]!.name).toBe('n1');
    expect(out[0]!.points.length).toBe(1);
    expect(out[1]!.name).toBe('n2');
    expect(out[1]!.points[0]!.v).toBe(0.5);
  });
});

/* ═══ R31 聚合修真+G3/G4：全指标聚合根治恒空卡、分组叠加、avg/max 切换、分片两卡 ═══ */
describe('R31 聚合修真与分片卡', () => {
  it('聚合方式偏好键+切换下拉+取数下推（G4 对标阿里云每卡聚合切换的收敛形态）', () => {
    expect(view).toContain("usePref<string>('live.histAgg', 'avg')");
    expect(view).toContain('<option value="max">峰值</option>');
    expect(view).toContain('agg: mhAgg.value');
    expect(view).toMatch(/watch\(\[mh2Range, clusterFilter, nodeMode, mhAgg, customFrom, customTo\]/); /* R66 custom 档输入入 watch */
  });
  it('分片总数/主分片数两卡在案（G3）+ MonitorSeriesField 扩员', () => {
    expect(view).toContain("{ field: 'shards', label: '分片总数', unit: '', onlyClusterMode: true }");
    expect(view).toContain("{ field: 'primaryShards', label: '主分片数', unit: '', onlyClusterMode: true }");
    expect(seriesSrc).toContain("| 'shards' | 'primaryShards'");
  });
  it('api.ts monitorMetrics 契约扩 agg 参+record 双新字段', () => {
    expect(apiSrc).toContain('interval?: string; agg?: string');
    expect(apiSrc).toContain('primaryShards?: number; nodesMissing?: number;');
  });
  it('失联节点告警消费链在案：srvActive chips 消费 metric 即事件轴同源（无前端特判=新 metric 自动可见）', () => {
    expect(view).toContain('a.metric');
  });
  it('R32 G7 内部传输吞吐两卡+字段扩员（节点下钻专属）', () => {
    expect(view).toContain("{ field: 'netRxKbS', label: '内部传输·收（KiB/s）', unit: 'KiB/s', onlyNodeMode: true }");
    expect(view).toContain("{ field: 'netTxKbS', label: '内部传输·发（KiB/s）', unit: 'KiB/s', onlyNodeMode: true }");
    expect(seriesSrc).toContain("| 'netRxKbS' | 'netTxKbS'");
    expect(apiSrc).toContain('netRxKbS?: number; netTxKbS?: number;');
  });
  it('R32 G5 14d 时间档：两页 MH_RANGE_MS+下拉选项齐备（共享偏好键 live.histRange）', () => {
    expect(view).toContain("'14d': 1.2096e9");
    expect(view).toContain('<option value="14d">最近 14 天</option>');
  });
  it('R33 G6 快照状态：record 契约三字段在案（slm 失败经告警事件轴自动可见，无前端特判）', () => {
    expect(apiSrc).toContain('snapshotFailed?: number; snapshotsTotal?: number; snapshotFailedDelta?: number;');
  });
  it('R34 筛选集群传 connName（原误传 connId 致选集群恒空的真缺陷修复锚）', () => {
    expect(apiSrc).toContain('connId?: string; connName?: string; scope?: string;');
    expect(view).toContain('connName: clusterFilter.value || nodeFallback || undefined');
  });
  it('R42 Top 索引卡：监控明细单容器视图+集群模式渲染+api 通道（对标阿里云 Index 索引行）', () => {
    /* 800 同步更新：三面板合并「监控明细」单容器——Top 索引=detailTab 首视图（字面锚迁语义等价形态）；
       896 批同步更新：api 通道加 limit 参数（Top N 宽度参数化，服务端钳 1..20） */
    expect(view).toContain("detailTab === 'top' && !nodeMode");
    expect(view).toContain('暂无索引速率快照（首轮采集基线建立后出数）');
    /* 977：后端 top-indexes 参数是集群实名 connName，不是连接 ID */
    expect(apiSrc).toContain("monitorTopIndexes: (connName?: string, limit?: number) => get<{ records: any[] }>(`/monitor-metrics/top-indexes?${q({ connName, limit })}`)");
  });
  it('R39 onlyClusterMode：集群专属卡节点下钻时隐藏（真机走查发现 QPS/耗时等挂假空态）', () => {
    expect(view).toContain('onlyClusterMode?: boolean');
    expect(view).toContain("{ field: 'qps', label: 'QPS', unit: '/s', onlyClusterMode: true }");
    expect(view).toContain("(!m.onlyClusterMode || !nodeMode.value)");
  });
  it('R48 导出对称补全（802 同步更新：平铺双钮收 ⋯ 菜单=copyDetail 分发；三导出函数仍在视图侧）', () => {
    expect(view).toContain("copyDetail('tsv')");
    expect(view).toMatch(/copyAlertHist\(fmt\)/);
    expect(view).toMatch(/detailTab\.value === 'slow'[^}]{0,60}copySlow\(fmt\)/);
    expect(view).toContain('async function copyAlertHist(');
    expect(view).toContain('async function copySlow(');
  });
  it('R49 高频交互闭环：Top 索引名可点=setTarget+深链数据浏览器', () => {
    expect(view).toContain('function gotoBrowser(t: any) {');
    /* 963：下钻换集群走 store.setTarget（同步 SideNav/页面门/router key），不再裸改数据面 target */
    expect(view).toContain('if (t.connId && t.connId !== store.target) store.setTarget(');
    expect(view).toContain("router.push({ path: '/browser', query: { idx: t.index } })");
  });
  it('R52 实时走势扩展：CPU/磁盘走势卡+网格 3 列+tabular-nums 丝滑（实报「很多东西没有实时走势图/不够丝滑」）', () => {
    expect(view).toContain('CPU 使用趋势');
    expect(view).toContain('磁盘使用趋势');
    /* R64 窗长切换：折线消费统一经 winSlice 截尾单源（留视图）。
       六百三十八批同步更新：五线卡折线合并 LiveChartCard——winSlice 留视图、折线公式进组件 */
    expect(view, 'winSlice 截尾留视图').toMatch(/winSlice\((cpuSeries|diskSeries)\)/);
    /* 六百八十一批同步更新：折线公式 sparklinePointsPct→sparkPts 单源（622 §9-D4 平滑同投影） */
    expect(cardSrc, '折线公式进组件').toContain('sparkPts(props.series, 300, LD_H, props.mode)');
    expect(sparkSrc, '几何常量值锁（同步更新至 utils/sparkChart.ts 单源）').toContain('export const LD_H = 88;');
    expect(view).toContain('.ld-charts { grid-template-columns: repeat(3, 1fr); }');
    expect(view).toContain('font-variant-numeric: tabular-nums');
  });
  it('R51 质感：节点一览表节标题+长节点 ID 截短（title 悬停全量）', () => {
    expect(view).toContain('ld-hist-ntab-t sec-t">节点最新水位<');
    expect(view).toContain('function shortNode(name: string): string {');
    expect(view).toContain(':title="n.nodeName || n.connId || \'\'"');
  });
  it('R47 Top 索引导出通道（802 同步更新：⋯ 菜单 copyDetail 分发；matrixText 单源保持）', () => {
    expect(view).toMatch(/detailTab\.value === 'top'[^}]{0,60}copyTop\(fmt\)/);
    expect(view).toContain("matrixText({ rows, cols, getVal: (row: any[], c: string) => String(row[cols.indexOf(c)] ?? '') }, fmt)");
  });
  it('R46 合并视图按索引名去重（同名系统索引跨集群重复降噪；单集群视图不受影响）', () => {
    expect(view).toContain('const seen = new Set<string>();');
    expect(view).toContain('topRows.value = topRows.value.filter(t => (seen.has(t.index) ? false : (seen.add(t.index), true)));');
  });
  it('R45 走查修复：合并视图每集群 Top 3 压缩同源重复+阈值 0 不被 falsy 吞掉', () => {
    /* 896 批同步更新：单集群档宽度参数化 topLimit（默认 8），合并档压缩语义保留 */
    expect(view).toContain('const perCluster = clusterFilter.value ? topLimit.value : 3;');
    expect(view).toContain('Number.isFinite(Number(slowThresholdMs.value)) ? Number(slowThresholdMs.value) : 1000');
  });
  it('R44 布局质感：头部下拉约束内容宽（全局 .inp width:100% 竖排缺陷修复锚）', () => {
    expect(view).toContain('.ld-hist-head select.inp { width: auto; flex: 0 0 auto; min-width: 110px; }');
  });
  it('R38 历史自动刷新：档位偏好+全生命周期组合件复用（对标阿里云自动刷新开关）', () => {
    expect(view).toContain("usePref<number>('live.histAuto', 0)");
    expect(view).toContain(':value="300000">5 分钟</option>');
    /* 1125：定时器回调先过身份门（换号窗口不得带旧 target 拉监控曲线），
       门后保留原「拉历史 + 慢请求」动作——两条同时锁，缺一即失败 */
    expect(view).toContain('if (!liveReady()) return;');
    expect(view).toContain("void loadHist(); if (detailShows('slow')) void loadSlow();");
    expect(view).toContain('const liveReady = () => auth.authDisabled || !auth.probeStarted');
    expect(view).toContain('guard: () => !histLoading.value');
  });
  it('R37 等级分布计数 chips（对标阿里云报警概览等级分布）', () => {
    /* 800 同步更新：等级分布计数迁「监控明细」头部 meta 位（语义保留） */
    expect(view).toContain('ld-detail-meta');
    expect(view).toContain('const alertCounts = computed(');
    expect(view).toContain("if (a.level === 'CRIT') crit++; else if (a.level === 'WARN') warn++; else info++;");
  });
  it('R36 慢请求面板：rank3 门+阈值偏好+审计下推（对标阿里云慢查询日志 tab）', () => {
    /* 六百三十四批同步更新（633-C2 同律）+800 同步更新（单容器视图内三段式语义保留）：
       权限门「视图恒可选 + 内部 v-if」，无权限渲染 .ld-stale 说明条（禁止静默消失）。 */
    expect(view).toContain("detailTab === 'slow'");
    expect(view).toContain('v-if="auth.canAuditAll(store.target)"');
    expect(view).toContain('<div v-else class="ld-stale" role="status">');
    expect(view).toContain("usePref<number>('live.slowMs', 1000)");
    expect(view).toContain('minCostMs');
    expect(view).toContain('时间窗内无 ≥ 阈值的慢请求');
  });
  it('R35 告警历史面板：视图切换+三态筛选+指标中文化映射（对标阿里云报警概览）', () => {
    /* 782 Z1 同步更新+800 同步更新（单容器 detailTab='alert' 视图；计数源=alertHistRows 治漂移语义保留）；
       Z2 级别列 StatusPill 单源 */
    expect(view).toContain("detailTab === 'alert'");
    expect(view).toContain('alertHistRows');
    expect(view).toContain('<option value="recovered">仅恢复</option>');
    expect(view).toContain("gcYoung: 'Young GC', nodesMissing: '失联节点', slm: '快照失败',");
    expect(view).toContain("a.recovered ? '已恢复' : '告警'");
    expect(view).toMatch(/monitorAlerts\(100, histFromMs, rangeMs\.value\.to\)/); /* R66 */
  });
});
