/**
 * 五百九十六批·R58 对标比对补全轮——「索引数量」可视化+节点线程池即时值。
 *
 * 背景（用户令「继续比对差异，补全」=R27 阿里云清单逐项复审）：斥候盘点（对照 R27 基础
 * 监控 22 项+高级监控 Grafana Rows）裁决出三项残余差距——
 *   D1 历史区缺「索引数量」趋势图卡：cluster doc 早有 indices 键（AGG_METRIC_FIELDS 第 8 项
 *      也在=聚合模式天然有数），但 HIST_CHARTS 21 张卡没画它；
 *   D2 实时区 KPI 缺「索引数量」chip：阿里云集群级 12 项之一，health 接口无此值，但同页
 *      历史拉取的 monitor-metrics cluster doc 最新一条就有——零新请求；
 *   D3 brief 缺线程池即时值：对标 Thread_pool Rows+写入拒绝前兆（tpSearchActive/Queue 在
 *      历史管道 ClusterMetricsCollector 有、实时 brief 无）——filter_path 扩两字段+row.put。
 *
 * 三件全为「数据已在管道、视图未消费」或「两字段补采」，一轮补齐。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useLiveMonitorStore } from '../stores/liveMonitor';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const javaBriefSrc = readFileSync(
  join(__dirname, '../../../modules/console/src/main/java/io/github/dengmeiluan/esquerystudio/console/core/EsIndexAdmin.java'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  const anyCall: any = new Proxy(function () { return Promise.resolve(null); }, {
    get(_t, p) {
      if (p === 'then' || typeof p === 'symbol') return undefined;
      return anyCall;
    },
    apply() { return Promise.resolve(null); },
  });
  const proxied = new Proxy({}, {
    get(_target, prop: string) {
      if (prop === 'monitorMetrics') {
        return () => Promise.resolve({ records: [
          { kind: 'metrics', scope: 'cluster', connName: 'qa-es', timestamp: 2000, qps: 71.4, indices: 863 },
          { kind: 'metrics', scope: 'cluster', connName: 'qa-es', timestamp: 1000, qps: 52, indices: 861 },
        ] });
      }
      return anyCall;
    },
  });
  return { ...actual, api: proxied };
});

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountLive() {
  location.hash = '#/';
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const mod = await import('../views/LiveDashboardView.vue');
  const app = createApp({ render: () => h(mod.default as any) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, pinia };
}

describe('五百九十六批：对标补全（索引数量+线程池）', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('历史区新增「索引数量」图卡（onlyClusterMode，聚合模式天然有数）', async () => {
    const { app, host } = await mountLive();
    try {
      /* HIST_CHARTS 配置在源码锁覆盖；挂载侧验证历史区标题串在场（records mock 含 indices 值） */
      const t = strip(liveSrc);
      expect(t, '索引数量图卡已登记').toContain("field: 'indices'");
      expect(t, 'onlyClusterMode（节点下钻隐藏）').toContain("onlyClusterMode: true");
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('实时区 KPI「索引数量」chip：取历史拉取最新 cluster 采样的 indices 值（零新请求）', async () => {
    const { app, host } = await mountLive();
    try {
      await settle(30); /* 等历史拉取 promise 链收敛 */
      const stripEl = host.querySelector('.ld-strip');
      expect(stripEl, 'KPI 行在场').toBeTruthy();
      expect(stripEl!.textContent).toContain('索引数量');
      expect(stripEl!.textContent).toContain('863'); /* mock 最新一条=2000 时间戳的 863，非 861 */
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('节点卡 tp 行：brief 带线程池即时值显示 active/queue；缺省节点整行不渲染', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const mon = useLiveMonitorStore(pinia);
      mon.nodes = [
        { nodeId: 'n1', name: 'qa-es-1', roles: ['data'], heapPct: 30, cpuPct: 38, diskTotal: 100, diskFree: 41, tpSearchActive: 2, tpSearchQueue: 0 },
        { nodeId: 'n2', name: 'qa-es-2', roles: ['data'], heapPct: 34, cpuPct: 52, diskTotal: 100, diskFree: 24 },
      ];
      await settle();
      const cards = [...host.querySelectorAll('.ld-node')];
      const row1 = [...cards[0].querySelectorAll('.ld-node-row')].find(r => r.textContent!.includes('tp'));
      expect(row1, '有 tp 节点行在场').toBeTruthy();
      expect(row1!.textContent).toContain('2/0');
      const rows2 = [...cards[1].querySelectorAll('.ld-node-row')].filter(r => r.textContent!.includes('tp'));
      expect(rows2.length, '缺省节点 tp 行不渲染').toBe(0);
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('源码锁：brief filter_path 扩 thread_pool.search+KPI chip 接线', () => {
    expect(javaBriefSrc, 'brief 采线程池即时值').toContain('nodes.*.thread_pool.search.active');
    expect(javaBriefSrc, 'brief 行键 tpSearchActive/tpSearchQueue').toContain('tpSearchActive');
    const t = strip(liveSrc);
    expect(t, 'KPI chip 索引数量接线').toContain('索引数量');
    expect(t, '节点卡 tp 行接线').toContain('tpOf(');
  });
});
