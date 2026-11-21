/**
 * 五百二十七批 W-C：XmigrateView ?jobId= 深链读侧挂载锁（TasksView ?taskId= 524 同手法——
 * route.query 消费是运行时行为，静态源码锁照不住）：
 *   ① ?jobId= 命中作业行带 .xm-hit 定位强调，其余行不高亮；
 *   ② 消费后 query.jobId 摘除（历史 replace，刷新/回退不再重定位）；
 *   ③ 无 query 挂载零副作用（不误挂高亮位，列表照常渲染）。
 * 五百二十九批：作业表换壳 QRT rows 型——data-job 属性契约随裸表退役，定位链改
 * rowClass 契约挂 .xm-hit 类（locateJobRow 语义保全），行身份断言以行内容锚定。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
/* 八百零五批根治同步更新：视图改静态 import=动态 import 首挂载墙内冷启动根因拔除
   （xmProgress529 同型同批，vi.mock 提升保证 api mock 先行） */
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      keys: async () => [],
      clustersList: async () => [],
      clusterIndices: async () => [],
      overview: async () => ({}),
      clusterHealth: async () => ({}),
      xb: { ...actual.api.xb, jobs: (...a: any[]) => xbJobs(...a), destIndices: async () => [] },
    },
  };
});

const XM_JOB = {
  jobId: 'job-abc-1', status: 'RUNNING', destIndex: 'dest-1', sourceIndex: 'src-a',
  remoteEndpoint: '', migrated: 3, total: 0, conflicts: 0, errors: 0,
  createTime: 1700000000000, sliceStatus: {},
};

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountXm(query: Record<string, string> = {}) {
  location.hash = '#/';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/xmigrate', component: { template: '<div/>' } },
    ],
  });
  await router.push({ path: '/', query });
  await router.isReady();
  const app = createApp({ render: () => h(XmigrateView as any) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, router };
}

describe('XmigrateView ?jobId= 深链读侧（527 批，挂载）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    location.hash = '#/';
    localStorage.clear();
    sessionStorage.clear();
    xbJobs.mockReset();
    xbJobs.mockResolvedValue([]);
    /* locateJobRow 的平滑滚动在 happy-dom 缺省实现兜底（行定位断言只认 .xm-hit 类与 data-job） */
    (Element.prototype as any).scrollIntoView = vi.fn();
  });

  it('?jobId= 命中行带 .xm-hit 强调（行内容锚定命中作业），其余行不高亮', async () => {
    xbJobs.mockResolvedValue([XM_JOB, { ...XM_JOB, jobId: 'job-abc-2', destIndex: 'dest-2' }]);
    const { app, host } = await mountXm({ jobId: 'job-abc-1' });
    const hit = host.querySelector('.qrt-tbl tr.xm-hit');
    expect(hit, '深链命中行必须带定位强调类').toBeTruthy();
    expect(hit!.textContent).toContain('dest-1');
    expect(hit!.textContent).not.toContain('dest-2');
    expect(host.querySelectorAll('.qrt-tbl tr.xm-hit').length).toBe(1);
    app.unmount();
    /* 550 同步更新墙 8000 保留；805 根治见顶部静态 import 注（动态 import 墙内冷启动已拔除） */
  }, 8000);

  it('消费后 query.jobId 摘除（历史 replace，刷新/回退不重定位）', async () => {
    xbJobs.mockResolvedValue([XM_JOB]);
    const { app, router } = await mountXm({ jobId: 'job-abc-1' });
    await settle(4);
    expect(router.currentRoute.value.query.jobId, '一次性上下文用后即清').toBeUndefined();
    app.unmount();
  });

  it('无 query 挂载：无高亮位、列表照常渲染', async () => {
    xbJobs.mockResolvedValue([XM_JOB]);
    const { app, host } = await mountXm();
    expect(host.querySelector('.qrt-tbl tr.xm-hit')).toBeNull();
    expect(host.querySelectorAll('.qrt-tbl tbody tr').length).toBe(1);
    app.unmount();
  });
});
