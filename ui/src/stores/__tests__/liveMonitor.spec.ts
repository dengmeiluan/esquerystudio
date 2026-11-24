import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { nextTick } from 'vue';
import { useLiveMonitorStore } from '../liveMonitor';
import { useAppStore } from '../app';

/* A：实时大盘数据节点口径——avgHeap/avgCpu 只算 data 节点，master-only 不拉偏；无 data 节点回退全节点 */

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('liveMonitor 数据节点口径（A）', () => {
  it('dataNodes 排除 master-only 节点', () => {
    const store = useLiveMonitorStore();
    store.nodes = [
      { name: 'master1', roles: ['master'], heapPct: 30, cpuPct: 10 },
      { name: 'data1', roles: ['master', 'data'], heapPct: 70, cpuPct: 50 },
      { name: 'data2', roles: ['data'], heapPct: 90, cpuPct: 80 },
    ];
    expect(store.dataNodes.map(n => n.name)).toEqual(['data1', 'data2']);
  });

  it('avgHeap/avgCpu 只平均 data 节点（master-only 不拉偏）', () => {
    const store = useLiveMonitorStore();
    store.nodes = [
      { name: 'master1', roles: ['master'], heapPct: 10, cpuPct: 5 },
      { name: 'data1', roles: ['data'], heapPct: 70, cpuPct: 50 },
      { name: 'data2', roles: ['data'], heapPct: 90, cpuPct: 70 },
    ];
    expect(store.avgHeap).toBeCloseTo(80); // (70+90)/2，非 (10+70+90)/3=56.7
    expect(store.avgCpu).toBeCloseTo(60);  // (50+70)/2
  });

  it('无 data 节点时回退全节点平均（单节点/纯 master 集群）', () => {
    const store = useLiveMonitorStore();
    store.nodes = [
      { name: 'm1', roles: ['master'], heapPct: 30, cpuPct: 10 },
      { name: 'm2', roles: ['master'], heapPct: 50, cpuPct: 30 },
    ];
    expect(store.dataNodes).toHaveLength(0);
    expect(store.avgHeap).toBeCloseTo(40);
    expect(store.avgCpu).toBeCloseTo(20);
  });

  it('无节点时 avg 为 0 不炸', () => {
    const store = useLiveMonitorStore();
    store.nodes = [];
    expect(store.avgHeap).toBe(0);
    expect(store.avgCpu).toBe(0);
  });
});

describe('R54 切目标集群序列清理（跨集群串数据防线）', () => {
  it('切 target 后 CPU/磁盘均值序列与 QPS/Heap 同批清位', async () => {
    const store = useLiveMonitorStore();
    const app = useAppStore();
    store.qpsSeries = [1, 2, 3];
    store.heapSeries = [10, 20];
    store.cpuSeries = [30, 40];
    store.diskSeries = [50, 60];
    app.target = 'other-conn';
    await nextTick();
    expect(store.qpsSeries).toEqual([]);
    expect(store.heapSeries).toEqual([]);
    expect(store.cpuSeries).toEqual([]);
    expect(store.diskSeries).toEqual([]);
  });

  it('avgDisk 与 diskUsedPct 同式（total/free → 占比；数据节点口径）', () => {
    const store = useLiveMonitorStore();
    store.nodes = [
      { name: 'data1', roles: ['data'], diskTotal: 100, diskFree: 40 },
      { name: 'data2', roles: ['data'], diskTotal: 200, diskFree: 100 },
    ];
    // (60% + 50%) / 2 = 55
    expect(store.avgDisk).toBeCloseTo(55);
  });
});
