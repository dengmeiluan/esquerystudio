/**
 * G2（UX 轮 II health 组）三态与省略契约——行为改动防回归：
 *
 *   B2 DiagView：观测区 opsErr——失败常驻 err-bar（全文+重试），
 *      「点击刷新」提示与「无 pending task」绿勾互斥，失败保留旧数据；
 *      G2 复审：拆 nodesErr/pendingErr 按源判定——单源失败不误报另一源区域；
 *   B3 HealthReportView：runErr——失败不再仅 toast 回落「尚未运行体检」伪装空态（R91b 同源）；
 *   B4 TopologyView：loadErr——失败不再清空 shards 回落「暂无分片数据」；
 *   B6 WatcherView：loading 初值 true + `loading && !raw` 骨架——首载不闪假 stats 与错误空态；
 *   C2 HealthReportView：health pill 用全局色款（.pill.r/.y/.g），局部 pill-red 等不回潮；
 *   C4 WatcherView：过滤致空「无匹配 watch」+ 清除过滤逃生口（G1 C4 同构）；
 *   C5 WatcherView：watch id 截断后 title 全名可达（§9.5）。
 *
 * 注意：useUrlState 初始值读 location.hash 的 query（urlState.ts readHashQuery），
 * 注入过滤词用 mountView(comp, '#/?kw=…')，不是 router.push 的 query。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* 只替换网络出口，视图/组件/工具全用真的 */
const healthFn = vi.fn();
const clusterHealthFn = vi.fn();
const nodesStatsFn = vi.fn();
const pendingTasksFn = vi.fn();
const healthReportFn = vi.fn();
const shardsFn = vi.fn();
const watcherFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      /* 惰性包装：vi.mock factory 被提升到文件顶执行，此时 vi.fn 尚未初始化（TDZ），
         直接写 health: healthFn 会在 factory 求值瞬间炸 ReferenceError */
      health: (...args: any[]) => healthFn(...args),
      clusterHealth: (...args: any[]) => clusterHealthFn(...args),
      nodesStats: (...args: any[]) => nodesStatsFn(...args),
      pendingTasks: (...args: any[]) => pendingTasksFn(...args),
      healthReport: (...args: any[]) => healthReportFn(...args),
      shards: (...args: any[]) => shardsFn(...args),
      watcherList: (...args: any[]) => watcherFn(...args),
    },
  };
});

import DiagView from '../views/DiagView.vue';
import HealthReportView from '../views/HealthReportView.vue';
import TopologyView from '../views/TopologyView.vue';
import WatcherView from '../views/WatcherView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(comp: any, hash = '#/') {
  location.hash = hash;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(comp) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

const HEALTH_OK = { locks: { self: 0, other: 0, expired: 0 } };
const CLUSTER_OK = { status: 'green', number_of_nodes: 1, active_primary_shards: 3, number_of_data_nodes: 1 };
const REPORT = {
  score: 72, generatedAt: '2026-08-09T00:00:00Z',
  summary: { status: 'yellow', unassigned: 2, pending: 0, unhealthyIndices: 1, nodes: 1, hotNodes: 0 },
  checks: [{ level: 'warn', name: 'unassigned', message: '存在未分配分片' }],
  unhealthyIndices: [{ index: 'order-2026.01', health: 'red', pri: 1, rep: 1, 'docs.count': 5, 'store.size': '1kb' }],
  nodes: [],
};
const WATCH = { _id: 'my-watch-001', _source: { trigger: { schedule: { interval: '1m' } }, actions: { log: {} }, metadata: { owner: 'sre' } } };
const WATCH_RAW = { available: true, stats: { stats: [{ watcher_state: 'started' }] }, watches: { hits: { hits: [WATCH], total: { value: 1 } } } };

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  healthFn.mockReset().mockResolvedValue(HEALTH_OK);
  clusterHealthFn.mockReset().mockResolvedValue(CLUSTER_OK);
  nodesStatsFn.mockReset().mockResolvedValue([]);
  pendingTasksFn.mockReset().mockResolvedValue({ tasks: [] });
  healthReportFn.mockReset().mockResolvedValue(REPORT);
  shardsFn.mockReset().mockResolvedValue([]);
  watcherFn.mockReset().mockResolvedValue({ available: true, stats: {}, watches: { hits: { hits: [], total: 0 } } });
});

describe('G2-B2 DiagView：观测区 opsErr 互斥', () => {
  it('nodesStats/pendingTasks 失败 → err-bar 在，「点击刷新」提示与「无 pending」绿勾不在', async () => {
    nodesStatsFn.mockRejectedValue(new Error('timeout'));
    pendingTasksFn.mockRejectedValue(new Error('timeout'));
    const { app, host } = await mountView(DiagView);
    expect(host.textContent).toContain('观测数据拉取失败');
    expect(host.textContent, '失败时不许伪装成「未加载」').not.toContain('点击刷新加载节点资源快照');
    expect(host.textContent).toContain('节点快照拉取失败');
    expect(host.textContent, '失败时不许伪装「master 队列空闲」健康态').not.toContain('无 pending task');
    expect(host.textContent).toContain('pending tasks 拉取失败');
    app.unmount();
  });

  it('观测正常 → 「点击刷新」提示与「无 pending task」绿勾在，无 err-bar', async () => {
    const { app, host } = await mountView(DiagView);
    expect(host.querySelector('.err-bar')).toBeNull();
    expect(host.textContent).toContain('点击刷新加载节点资源快照');
    expect(host.textContent).toContain('无 pending task');
    app.unmount();
  });

  it('G2 复审：nodesStats 失败 + pendingTasks 成功返回空 → pending 区真空绿勾不误报失败，节点区失败占位，err-bar 只记名 nodesStats', async () => {
    nodesStatsFn.mockRejectedValue(new Error('timeout'));
    pendingTasksFn.mockResolvedValue({ tasks: [] });
    const { app, host } = await mountView(DiagView);
    const opsBar = Array.from(host.querySelectorAll('.err-bar'))
      .find(el => el.textContent?.includes('观测数据拉取失败'));
    expect(opsBar, '观测区单源失败必须出 err-bar').toBeTruthy();
    expect(opsBar!.textContent).toContain('nodesStats');
    expect(opsBar!.textContent, 'pendingTasks 成功不许被记名').not.toContain('pendingTasks');
    expect(host.textContent).toContain('节点快照拉取失败');
    expect(host.textContent, 'pending 成功返回空是真空态（master 队列空闲），不许误报拉取失败').not.toContain('pending tasks 拉取失败');
    expect(host.textContent).toContain('无 pending task');
    app.unmount();
  });

  it('G2 复审：pendingTasks 失败 + nodesStats 成功返回空 → 节点区「点击刷新」提示在，pending 区失败占位，err-bar 只记名 pendingTasks', async () => {
    nodesStatsFn.mockResolvedValue([]);
    pendingTasksFn.mockRejectedValue(new Error('timeout'));
    const { app, host } = await mountView(DiagView);
    const opsBar = Array.from(host.querySelectorAll('.err-bar'))
      .find(el => el.textContent?.includes('观测数据拉取失败'));
    expect(opsBar, '观测区单源失败必须出 err-bar').toBeTruthy();
    expect(opsBar!.textContent).toContain('pendingTasks');
    expect(opsBar!.textContent, 'nodesStats 成功不许被记名').not.toContain('nodesStats');
    expect(host.textContent).toContain('pending tasks 拉取失败');
    expect(host.textContent, 'pending 失败不许伪装「master 队列空闲」健康态').not.toContain('无 pending task');
    expect(host.textContent, 'nodesStats 成功返回空，节点区保持「点击刷新」提示').toContain('点击刷新加载节点资源快照');
    expect(host.textContent, 'nodesStats 成功不许误报节点区失败').not.toContain('节点快照拉取失败');
    app.unmount();
  });
});

describe('G2-B3/C2 HealthReportView：runErr 互斥 + 全局 pill', () => {
  it('初始（无旧报告）→ 「尚未运行体检」EmptyState 在，err-bar 不在', async () => {
    const { app, host } = await mountView(HealthReportView);
    expect(host.querySelector('.err-bar')).toBeNull();
    expect(host.textContent).toContain('尚未运行体检');
    app.unmount();
  });

  it('体检失败 → err-bar（全文+重试）在，「尚未运行体检」不在（失败不伪装未运行）', async () => {
    healthReportFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(HealthReportView);
    const runBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('.hr-hd-r button'))
      .find(b => b.textContent?.includes('开始体检'));
    expect(runBtn, '开始体检按钮必须渲染').toBeTruthy();
    runBtn!.click();
    await settle();
    expect(host.querySelector('.err-bar'), '失败必须出现错误条').toBeTruthy();
    expect(host.textContent).toContain('体检失败');
    expect(host.textContent).toContain('重试');
    expect(host.textContent, '失败时不许伪装「尚未运行体检」').not.toContain('尚未运行体检');
    app.unmount();
  });

  it('体检成功 → 报告区在，err-bar 不在；health 值渲染于 QRT 表（全局 pill 色款随换壳退役，pill-red 不回潮）', async () => {
    const { app, host } = await mountView(HealthReportView);
    const runBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('.hr-hd-r button'))
      .find(b => b.textContent?.includes('开始体检'));
    runBtn!.click();
    await settle();
    expect(host.querySelector('.err-bar')).toBeNull();
    expect(host.querySelector('.hr-hero'), '报告评分卡必须渲染').toBeTruthy();
    /* 五百二十五批 W5：双表换 QRT rows 型（纯文本壳），.pill.r/.y/.g 色档随之退役——
       health 值照常渲染于 QRT 表（.qrt-tbl），局部 pill-red 双轨不回潮的守卫保留；
       五百三十三批：#cell-health 换 clusterHealthZh 中文主显（raw 在 title），锚随改用迁移 */
    expect(host.querySelector('table.qrt-tbl'), '不健康索引表必须是 QRT（.qrt-tbl）').toBeTruthy();
    const healthCell = [...host.querySelectorAll('table.qrt-tbl tbody td')]
      .find(td => { const t = td.textContent?.trim() || ''; return t === 'red' || t === '异常'; });
    expect(healthCell, 'health 值必须渲染').toBeTruthy();
    expect(host.querySelector('.pill-red'), '局部 pill-red 双轨已删，不许回潮').toBeNull();
    app.unmount();
  });
});

describe('G2-B4 TopologyView：loadErr 与空态互斥', () => {
  it('首载中（shards 未回）→ 骨架在，「暂无分片数据」不在', async () => {
    shardsFn.mockReturnValue(new Promise(() => { /* 永不 resolve */ }));
    const { app, host } = await mountView(TopologyView);
    expect(host.querySelector('.tp-loading'), '首载必须出骨架').toBeTruthy();
    expect(host.textContent, '加载中不许闪空态').not.toContain('暂无分片数据');
    app.unmount();
  });

  it('拉取失败 → err-bar（全文+重试）在，「暂无分片数据」不在', async () => {
    shardsFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(TopologyView);
    expect(host.querySelector('.err-bar'), '失败必须出现错误条').toBeTruthy();
    expect(host.textContent).toContain('拓扑数据拉取失败');
    expect(host.textContent).toContain('重试');
    expect(host.textContent, '失败时不许伪装「暂无分片数据」').not.toContain('暂无分片数据');
    app.unmount();
  });

  it('真空（无分片且无错误）→ 「暂无分片数据」EmptyState 在，err-bar 不在', async () => {
    const { app, host } = await mountView(TopologyView);
    expect(host.querySelector('.err-bar')).toBeNull();
    expect(host.textContent).toContain('暂无分片数据');
    app.unmount();
  });
});

describe('G2-B6/C4/C5 WatcherView：首载骨架 + 过滤致空 + id title', () => {
  it('首载中（raw 未回）→ 骨架在，stats 与「当前无 watch 定义」不在', async () => {
    watcherFn.mockReturnValue(new Promise(() => { /* 永不 resolve */ }));
    const { app, host } = await mountView(WatcherView);
    expect(host.querySelector('.wt-loading'), '首载必须出骨架').toBeTruthy();
    expect(host.querySelector('.wt-stats'), '加载中不许闪假 stats').toBeNull();
    expect(host.textContent, '加载中不许闪「当前无 watch 定义」').not.toContain('当前无 watch 定义');
    app.unmount();
  });

  it('拉取失败 → wt-alert（不可用+重试）在，骨架消隐', async () => {
    watcherFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(WatcherView);
    expect(host.querySelector('.wt-alert')).toBeTruthy();
    expect(host.textContent).toContain('Watcher 不可用');
    expect(host.textContent).toContain('重试');
    expect(host.querySelector('.wt-loading')).toBeNull();
    app.unmount();
  });

  it('真空（无 watch 且无错误）→ 「当前无 watch 定义」EmptyState 在，骨架不在', async () => {
    const { app, host } = await mountView(WatcherView);
    expect(host.querySelector('.wt-loading')).toBeNull();
    expect(host.textContent).toContain('当前无 watch 定义');
    app.unmount();
  });

  it('过滤致空 → 「无匹配 watch」+ 清除过滤按钮在，点击后列表恢复', async () => {
    watcherFn.mockResolvedValue(WATCH_RAW);
    sessionStorage.setItem('esquerystudio.draft2:watcher:host:-:-:kw', 'zzz_no_match');
    const { app, host } = await mountView(WatcherView);
    expect(host.textContent).toContain('无匹配 watch');
    const clearBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('.empty-state button'))
      .find(b => b.textContent?.includes('清除过滤'));
    expect(clearBtn, '过滤致空必须有清除过滤逃生口').toBeTruthy();
    clearBtn!.click();
    await settle();
    expect(host.querySelector('.wt-card'), '清除过滤后 watch 卡必须恢复').toBeTruthy();
    app.unmount();
  });

  it('watch id 截断后 title 全名可达（§9.5）', async () => {
    watcherFn.mockResolvedValue(WATCH_RAW);
    const { app, host } = await mountView(WatcherView);
    const id = host.querySelector('.wt-card-id');
    expect(id, 'watch id 必须渲染').toBeTruthy();
    expect(id!.getAttribute('title')).toBe('my-watch-001');
    app.unmount();
  });
});
