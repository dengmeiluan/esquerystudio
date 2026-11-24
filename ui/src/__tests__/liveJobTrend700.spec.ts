/**
 * 七百批②·任务卡走势（R56 遗留「任务卡走势缓做」收口；用户令「观察出来的都优化」）。
 *
 * 现状：运行中任务卡只有当前计数+清单，无走势。=store 增 jobCountSeries（会话窗
 * MAX_POINTS 截尾+快照持久化续采）；视图 watch runningJobs.length 推送；卡头右侧
 * compact spark（abs 档 sparklinePoints，<2 点不画=宁缺毋假）。
 * ⚠任务数是全局口径（jobTracker 不分集群）——切目标集群**不清位**（与 qps/heap 等
 * 按集群隔离的序列相反），防误清。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { useLiveMonitorStore } from '../stores/liveMonitor';

const storeSrc = readFileSync(join(__dirname, '../stores/liveMonitor.ts'), 'utf-8');
const viewSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const st = strip(storeSrc).replace(/\s+/g, ' ');
const vt = strip(viewSrc).replace(/\s+/g, ' ');
const SNAP_KEY = 'esquerystudio.live.snapshot:host';

describe('七百批② 任务卡走势（jobCountSeries 会话窗+快照续采）', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('pushJobCount：逐点入列+MAX_POINTS 截尾', () => {
    const mon = useLiveMonitorStore();
    for (let i = 1; i <= 245; i++) mon.pushJobCount(i % 7);
    expect(mon.jobCountSeries).toHaveLength(240);
    expect(mon.jobCountSeries[0]).toBe(6); // 245-240=5 → i%7：5%7=5? 见下——首点=第 6 次推送值
    expect(mon.jobCountSeries[239]).toBe(245 % 7);
  });

  it('快照持久化+restore 续采（坏快照静默从零）', () => {
    localStorage.setItem(SNAP_KEY, JSON.stringify({ at: Date.now(), jobCount: [0, 1, 2, 3] }));
    const mon = useLiveMonitorStore();
    expect(mon.jobCountSeries).toEqual([0, 1, 2, 3]);
    mon.pushJobCount(4);
    expect(mon.jobCountSeries).toEqual([0, 1, 2, 3, 4]);
  });

  it('源码锁：store 序列入快照载荷+restore；视图 watch 推送+卡头 spark', () => {
    expect(st, '快照载荷').toContain('jobCount: jobCountSeries.value');
    expect(st, 'restore 读取').toContain('s.jobCount');
    expect(vt, '视图推送').toContain('mon.pushJobCount');
    expect(vt, '卡头 spark').toContain('ld-job-spark');
    expect(vt, 'spark 数据源').toContain('sparklinePoints(mon.jobCountSeries');
  });
});
