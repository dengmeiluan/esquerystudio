/**
 * 五百九十九批·R60 历史趋势观察口径跟随集群维度（用户实报：「多个集群的数据混在一起
 * 看是不是不合适啊，我们权限和观察的口径不是按照集群维度来的吗」）。
 *
 * 现状：历史趋势 clusterFilter 默认 ''（全部集群叠加）——多集群线混一图，与「权限和
 * 观察口径=集群维度」相悖。实时区本就跟随 app.target（快照按 target 隔离），历史区
 * 却默认混显=口径断裂。
 *
 * 件 A：clusterFilter 跟随顶部集群切换器——connNameOfTarget(target→conns 实名) 变化时
 *   clusterFilter 同步（切换器换集群=观察口径联动，含进页首随）；用户仍可手动切
 *   「全部集群」做跨集群对比，仅同 target 内不回弹，target 再变重新跟随。
 * 件 B：历史区副标题如实反映口径——单集群态显示集群实名（替代笼统「多集群叠加」）。
 *
 * R34/R43 纪律：筛选键=connName 实名（前端持实名处禁用 connId）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useLiveMonitorStore } from '../stores/liveMonitor';
import { useAppStore } from '../stores/app';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const javaCollectorSrc = readFileSync(
  join(__dirname, '../../../modules/console/src/main/java/io/github/dengmeiluan/esquerystudio/console/multicluster/ClusterMetricsCollector.java'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* monitorMetrics 捕获请求参数（断言 connName 下推） */
const metricsCalls: any[] = [];
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
        return (p: any) => { metricsCalls.push(p); return Promise.resolve({ records: [
          { kind: 'metrics', scope: 'cluster', connName: 'qa-es', timestamp: 2000, qps: 71, indices: 10 },
          { kind: 'metrics', scope: 'cluster', connName: 'tx-es', timestamp: 2000, qps: 20, indices: 5 },
        ] }); };
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

describe('五百九十九批：历史趋势口径跟随集群维度', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    metricsCalls.length = 0;
  });

  it('件 A：进页 clusterFilter 跟随 target 实名；切换器换集群→筛选联动+重拉带 connName', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const appStore = useAppStore(pinia);
      appStore.conns = [
        { id: 'c1', name: 'qa-es' },
        { id: 'c2', name: 'tx-es' },
      ] as any;
      appStore.target = 'c1';
      await settle(20);
      const sel = host.querySelector('.ld-hist select[aria-label="筛选集群"]') as HTMLSelectElement;
      expect(sel, '集群筛选下拉在场').toBeTruthy();
      expect(sel.value, '跟随 target 实名 qa-es').toBe('qa-es');
      /* 拉取请求下推 connName=qa-es（R34 纪律：实名下推） */
      expect(metricsCalls.some(c => c && (c as any).connName === 'qa-es'), '取数下推 connName=qa-es').toBe(true);

      /* 切换器换 c2 → 筛选跟随 tx-es + 重拉带 tx-es */
      metricsCalls.length = 0;
      appStore.target = 'c2';
      await settle(20);
      expect(sel.value, '切换器换集群→筛选联动').toBe('tx-es');
      expect(metricsCalls.some(c => c && (c as any).connName === 'tx-es'), '重拉下推 connName=tx-es').toBe(true);
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('件 A：手动切「全部集群」跨集群对比——同 target 下不回弹', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const appStore = useAppStore(pinia);
      appStore.conns = [{ id: 'c1', name: 'qa-es' }] as any;
      appStore.target = 'c1';
      await settle(20);
      const sel = host.querySelector('.ld-hist select[aria-label="筛选集群"]') as HTMLSelectElement;
      sel.value = '';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await settle(20);
      expect(sel.value, '手动全集群态维持').toBe('');
      expect(metricsCalls.some(c => c && !(c as any).connName), '全集群取数不下推 connName').toBe(true);
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('件 B：单集群态副标题显示集群实名（替代笼统「多集群叠加」；八百一十六批件4 同步更新：byNode 默认 true 后集群视图语义以关 byNode 前置保全+补节点叠加态断言）', async () => {
    const { app, host, pinia } = await mountLive();
    try {
      const appStore = useAppStore(pinia);
      appStore.conns = [{ id: 'c1', name: 'qa-es' }] as any;
      appStore.target = 'c1';
      /* 816 件4：byNode 默认 true=nodeMode 立真副标题走「节点叠加」——本用例测集群视图实名语义。
         byNode=视图内 usePref('live.byNode', true)（键 esquerystudio.pref.live.byNode，setup 初读）——
         裸 ref/store 通道都到不了，直接写 pref 键（挂载后 watch 不回写未动过的键=值稳） */
      const byNodeCb = host.querySelector('.ld-hist-node input') as HTMLInputElement | null;
      if (byNodeCb && byNodeCb.checked) {
        byNodeCb.checked = false;
        byNodeCb.dispatchEvent(new Event('change', { bubbles: true })); /* v-model=change 通道；happy-dom click 不派发 */
      }
      await settle(20);
      const sub = host.querySelector('.ld-hist-sub');
      expect(sub?.textContent).toContain('qa-es');
      expect(sub?.textContent).not.toContain('多集群叠加');
      /* 816 件4：byNode 复位开=节点叠加态副标题 */
      const cb2 = host.querySelector('.ld-hist-node input') as HTMLInputElement;
      cb2.checked = true;
      cb2.dispatchEvent(new Event('change', { bubbles: true }));
      await settle(20);
      expect(host.querySelector('.ld-hist-sub')?.textContent).toContain('节点叠加');
    } finally {
      app.unmount();
      host.remove();
    }
  });

  it('源码锁：跟随 watch+实名映射（禁 connId）', () => {
    const t = strip(liveSrc);
    expect(t, '跟随切换器 watch').toContain('connNameOfTarget');
    expect(t, 'target→conns 实名映射').toContain("c.id === store.target");
    expect(t, '副标题口径如实（单集群实名/全集群兜底）').toContain("clusterFilter || '多集群叠加'");
  });

  it('R62 对标补全：线程池写入侧+被标记删除文档三卡（仅节点下钻）', () => {
    const vt = strip(liveSrc);
    expect(vt, '写入线程池活跃卡').toContain("field: 'tpWriteActive'");
    expect(vt, '写入线程池排队卡').toContain("field: 'tpWriteQueue'");
    expect(vt, '被标记删除文档卡（force_merge 判定信号）').toContain("field: 'docsDeleted'");
    expect(javaCollectorSrc, 'collector 采 docs.deleted').toContain('indices.docs.deleted');
    expect(javaCollectorSrc, 'collector 采写入线程池').toContain('thread_pool.write.active');
  });

  it('R62b 对标补全：IOUtil%+GC 耗时三卡（差分测点，collector 采 io_time/collection_time）', () => {
    const vt = strip(liveSrc);
    expect(vt, 'IOUtil 卡').toContain("field: 'ioUtilPct'");
    expect(vt, 'Young GC 耗时卡').toContain("field: 'gcYoungTimeMs'");
    expect(vt, 'Old GC 耗时卡').toContain("field: 'gcOldTimeMs'");
    expect(javaCollectorSrc, 'collector 采 io_time_in_millis').toContain('fs.io_stats.total.io_time_in_millis');
    expect(javaCollectorSrc, 'collector 采 GC collection_time').toContain('collection_time_in_millis');
  });

  it('R65 对标补全：Heap 使用(MB) 锯齿卡（collector 采 heap_used_in_bytes→MB）', () => {
    const vt = strip(liveSrc);
    expect(vt, 'Heap 使用 MB 卡').toContain("field: 'heapUsedMb'");
    expect(javaCollectorSrc, 'collector 采 heap_used_in_bytes').toContain('jvm.mem.heap_used_in_bytes');
  });

  it('R72 对标补全：fielddata 内存卡（collector 采 fielddata.memory_size_in_bytes→MB）', () => {
    const vt = strip(liveSrc);
    expect(vt, 'fielddata 内存卡').toContain("field: 'fielddataMb'");
    expect(javaCollectorSrc, 'collector 采 fielddata').toContain('indices.fielddata.memory_size_in_bytes');
  });
});
