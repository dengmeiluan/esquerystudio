/**
 * G1（UX 轮 II cluster 组）三态与省略契约——行为改动防回归：
 *
 *   B1/B2 Tasks/TaskTree：失败与空态互斥（R91b 同源「失败≠空」，
 *         Snapshots/Security 先例的组内落地）；
 *   B3    RemoteClusters：首载骨架分支——加载中（raw 未回）不得闪「未配置」空态；
 *   C1    Tasks action pill 用全局色款（.p-* 全仓无 CSS 定义，防「无色 pill」回潮）；
 *   C4/C5 TaskTree 过滤致空提示 + 行 title 全名可达（§9.5）；
 *   C7/C8 ClusterSettings 过滤致空提示 + 全局 pill 色款；
 *   C9    Plugins raw 卡过滤致空行。
 *
 * 注意：useUrlState 初始值读 location.hash 的 query（urlState.ts readHashQuery），
 * 注入过滤词用 mountView(comp, '#/?filter=…')，不是 router.push 的 query。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* 只替换网络出口，视图/组件/工具全用真的 */
const tasksFn = vi.fn();
const taskDetailFn = vi.fn();
const remoteFn = vi.fn();
const settingsFn = vi.fn();
const pluginsFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      /* 惰性包装：vi.mock factory 被提升到文件顶执行，此时 vi.fn 尚未初始化（TDZ），
         直接写 clusterTasks: tasksFn 会在 factory 求值瞬间炸 ReferenceError */
      clusterTasks: (...args: any[]) => tasksFn(...args),
      taskDetail: (...args: any[]) => taskDetailFn(...args),
      remoteClusters: (...args: any[]) => remoteFn(...args),
      clusterSettings: (...args: any[]) => settingsFn(...args),
      pluginsMatrix: (...args: any[]) => pluginsFn(...args),
    },
  };
});

import TasksView from '../views/TasksView.vue';
import TaskTreeView from '../views/TaskTreeView.vue';
import RemoteClustersView from '../views/RemoteClustersView.vue';
import ClusterSettingsView from '../views/ClusterSettingsView.vue';
import PluginsView from '../views/PluginsView.vue';

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

/* TasksView 任务字段；TaskTreeView 与后端 listTasks 同为 camelCase（taskId/runningTimeNanos/parentTaskId） */
const TV_TASK = {
  taskId: 'node-es-01:123', node: 'node-es-01', action: 'indices:data/write/reindex',
  description: 'reindex from [a] to [b]', parentTaskId: 'unset',
  startTimeMillis: 0, runningTimeNanos: 2_000_000_000, cancellable: true, status: {},
};
const TT_TASK = {
  taskId: 'node-es-01:123', action: 'indices:data/write/reindex', node: 'node-es-01',
  description: 'reindex from [a] to [b]', runningTimeNanos: 2_000_000_000,
  cancellable: true, parentTaskId: 'unset',
};

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  tasksFn.mockReset();
  taskDetailFn.mockReset();
  remoteFn.mockReset();
  settingsFn.mockReset();
  pluginsFn.mockReset();
});

describe('G1-B1 TasksView：err-bar 与空态互斥', () => {
  it('拉取失败 → err-bar 在，「当前无运行中任务」不在，失败占位在', async () => {
    tasksFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(TasksView);
    expect(host.querySelector('.err-bar'), '失败必须出现错误条').toBeTruthy();
    expect(host.textContent, '失败时不许伪装成「当前无运行中任务」').not.toContain('当前无运行中任务');
    expect(host.textContent).toContain('任务列表拉取失败');
    expect(host.querySelector('.tv-loading'), '加载已结束，骨架必须消隐').toBeNull();
    app.unmount();
  });

  it('真空（无任务且无错误）→ 「当前无运行中任务」在，err-bar 不在', async () => {
    tasksFn.mockResolvedValue([]);
    const { app, host } = await mountView(TasksView);
    expect(host.querySelector('.err-bar')).toBeNull();
    expect(host.textContent).toContain('当前无运行中任务');
    app.unmount();
  });
});

describe('G1-C1 TasksView：action pill 用全局色款', () => {
  it('reindex 任务渲染 .pill.y（全局色款），不再拼无定义的 p-* 类', async () => {
    tasksFn.mockResolvedValue([TV_TASK]);
    const { app, host } = await mountView(TasksView);
    const pill = host.querySelector('.tv-node .pill');
    expect(pill, 'action pill 必须渲染').toBeTruthy();
    expect(pill!.classList.contains('y'), 'reindex 应命中全局 .pill.y 色款').toBe(true);
    expect(pill!.classList.contains('p-y'), 'p-* 全仓无定义，不许回潮').toBe(false);
    app.unmount();
  });
});

describe('G1-B2/C4/C5 TaskTreeView：互斥链 + 过滤致空 + 行 title', () => {
  it('拉取失败 → err-bar 在，「无任务」不在，失败占位在', async () => {
    tasksFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(TaskTreeView);
    const left = host.querySelector('.tt-left')!;
    expect(host.querySelector('.err-bar'), '失败必须出现错误条').toBeTruthy();
    expect(left.textContent, '失败时不许伪装成「无任务」').not.toContain('无任务');
    expect(left.textContent).toContain('任务列表拉取失败');
    app.unmount();
  });

  it('真空 → 「无任务」在，err-bar 不在', async () => {
    tasksFn.mockResolvedValue([]);
    const { app, host } = await mountView(TaskTreeView);
    expect(host.querySelector('.err-bar')).toBeNull();
    expect(host.querySelector('.tt-left')!.textContent).toContain('无任务');
    app.unmount();
  });

  it('过滤致空 → 「无匹配任务」提示 + 清除过滤按钮在（照 AliasesView 范式）', async () => {
    tasksFn.mockResolvedValue([TT_TASK]);
    /* R121: 过滤词改走会话草稿（不再进 URL）——预填草稿即旧深链等价物 */
    sessionStorage.setItem('esquerystudio.draft2:task-tree:host:-:-:filter', 'zzz_no_match');
    const { app, host } = await mountView(TaskTreeView);
    const left = host.querySelector('.tt-left')!;
    expect(left.textContent).toContain('无匹配任务');
    expect(left.textContent).toContain('清除过滤');
    app.unmount();
  });

  it('行内 action/node 截断后 title 全名可达（§9.5）', async () => {
    tasksFn.mockResolvedValue([TT_TASK]);
    const { app, host } = await mountView(TaskTreeView);
    expect(host.querySelector('.tr-act')?.getAttribute('title')).toBe('indices:data/write/reindex');
    expect(host.querySelector('.tr-node')?.getAttribute('title')).toBe('node-es-01');
    app.unmount();
  });
});

describe('G1-B3 RemoteClustersView：首载骨架与三态互斥', () => {
  it('拉取中（raw 未回）→ 骨架在，「未配置」空态不在', async () => {
    remoteFn.mockReturnValue(new Promise(() => { /* 永不 resolve，模拟拉取中 */ }));
    const { app, host } = await mountView(RemoteClustersView);
    expect(host.querySelector('.rc-loading'), '首载必须出骨架').toBeTruthy();
    expect(host.querySelector('.empty-state'), '加载中不许闪「未配置」空态').toBeNull();
    app.unmount();
  });

  it('拉取失败 → rc-alert 在，「未配置」空态不在', async () => {
    remoteFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(RemoteClustersView);
    expect(host.querySelector('.rc-alert')).toBeTruthy();
    expect(host.querySelector('.empty-state')).toBeNull();
    app.unmount();
  });

  it('真空（无远程且无错误）→ 「未配置」EmptyState 在，rc-alert 不在', async () => {
    remoteFn.mockResolvedValue({ remotes: {}, count: 0, localClusterName: 'es-prod', localVersion: { number: '7.10.1' } });
    const { app, host } = await mountView(RemoteClustersView);
    expect(host.querySelector('.rc-alert')).toBeNull();
    expect(host.textContent).toContain('未配置任何远程集群');
    app.unmount();
  });
});

describe('G1-C7/C8 ClusterSettingsView：过滤致空 + 全局 pill', () => {
  it('过滤无匹配 → 「无匹配设置项」提示 + 清除过滤按钮在', async () => {
    settingsFn.mockResolvedValue({ persistent: {}, transient: {}, defaults: {} });
    sessionStorage.setItem('esquerystudio.draft2:cluster-settings:host:-:-:q', 'zzz_no_match');
    const { app, host } = await mountView(ClusterSettingsView);
    expect(host.textContent).toContain('无匹配设置项');
    expect(host.textContent).toContain('清除过滤');
    app.unmount();
  });

  it('无待下发改动 → 计数 pill 用全局 .pill.g 色款', async () => {
    settingsFn.mockResolvedValue({ persistent: {}, transient: {}, defaults: {} });
    const { app, host } = await mountView(ClusterSettingsView);
    expect(host.querySelector('.cs-bar .pill.g'), '0 项待下发应命中全局 .pill.g').toBeTruthy();
    app.unmount();
  });
});

describe('G1-C9 PluginsView：raw 卡过滤致空行', () => {
  const MATRIX = {
    available: true, reason: '',
    nodes: [{ name: 'node-es-01', component: 'analysis-ik', version: '7.10.0', description: 'IK 分词器' }],
    summary: [{ plugin: 'analysis-ik', count: 1, complete: true, installedOn: ['node-es-01'] }],
    mismatches: [], nodeCount: 1, pluginCount: 1,
  };

  it('过滤无匹配 → 「筛选条件无匹配行」行 + 清除筛选逃生口在（五百二十五批 W5 同步更新）', async () => {
    /* raw 卡自造 kw 快滤框随换 QRT 壳退役（.pl-flt），过滤职责归 QRT 列漏斗——
       G1-C9「过滤致空须有逃生口」契约由内核 .qrt-nomatch 行 + 「清除全部筛选」钮承接，
       此处用双列漏斗 AND 造空集做行为级等价验证。 */
    pluginsFn.mockResolvedValue({
      ...MATRIX,
      nodes: [
        { name: 'node-es-01', component: 'analysis-ik', version: '7.10.0', description: 'IK 分词器' },
        { name: 'node-es-02', component: 'analysis-pinyin', version: '7.9.0', description: '拼音分词' },
      ],
    });
    const { app, host } = await mountView(PluginsView);
    expect(host.textContent).not.toContain('筛选条件无匹配行');
    expect(host.querySelector('.pl-flt'), '自造过滤框必须已退役').toBeNull();
    const funnelOf = (label: string) =>
      [...host.querySelectorAll<HTMLButtonElement>('table.qrt-tbl thead .qrt-funnel')]
        .find(b => b.getAttribute('aria-label') === label);
    /* component=analysis-ik（首现值）→ 1 行；再 version=7.9.0（首现值）→ AND 交集为空 */
    funnelOf('筛选 component 列')!.click();
    await settle(6);
    (document.querySelector('.cfp input[type="checkbox"]') as HTMLInputElement).click();
    await settle(6);
    funnelOf('筛选 version 列')!.click();
    await settle(6);
    /* version 值清单首现序=[7.10.0, 7.9.0]，勾第二个（7.9.0）→ AND 交集为空 */
    const vBoxes = [...document.querySelectorAll('.cfp input[type="checkbox"]')] as HTMLInputElement[];
    vBoxes[vBoxes.length - 1]!.click();
    await settle(6);
    expect(host.textContent).toContain('筛选条件无匹配行');
    expect(host.textContent).toContain('清除全部筛选');
    /* 逃生口可用：一键清除全部筛选 → 行集恢复 2 行
       （五百六十一批同步更新：矩阵表亦换 QRT rows 型——raw 表按列头 data-col=node 判定取表） */
    [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find(b => b.textContent?.includes('清除全部筛选'))!.click();
    await settle(6);
    const rawTbl = [...host.querySelectorAll('table.qrt-tbl')]
      .find(t => t.querySelector('thead th[data-col="node"]'))!;
    const rows = [...rawTbl.querySelectorAll('tbody tr')]
      .filter(tr => !tr.classList.contains('qrt-nomatch') && !tr.classList.contains('qrt-trunc-row'));
    expect(rows.length, '清除筛选后行集恢复').toBe(2);
    app.unmount();
  });

  it('真无插件记录 → 「无插件记录」行在', async () => {
    pluginsFn.mockResolvedValue({ ...MATRIX, nodes: [], summary: [], pluginCount: 0 });
    const { app, host } = await mountView(PluginsView);
    expect(host.textContent).toContain('无插件记录');
    app.unmount();
  });
});
