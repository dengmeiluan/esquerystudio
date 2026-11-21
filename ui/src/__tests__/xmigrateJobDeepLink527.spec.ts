/**
 * 五百二十七批 W-C：XmigrateView ?jobId= 深链读侧挂载锁（TasksView ?taskId= 524 同手法——
 * route.query 消费是运行时行为，静态源码锁照不住）：
 *   ① ?jobId= 命中作业行带 .xm-hit 定位强调，其余行不高亮；
 *   ② 消费后 query.jobId 摘除（历史 replace，刷新/回退不再重定位）；
 *   ③ 无 query 挂载零副作用（不误挂高亮位，列表照常渲染）。
 * 五百二十九批：作业表换壳 QRT rows 型——data-job 属性契约随裸表退役，定位链改
 * rowClass 契约挂 .xm-hit 类（locateJobRow 语义保全），行身份断言以行内容锚定。
 * 深链增强批：?jobId=X&detail=1 详情深链——
 *   ④ 作业在载入列表中 → jobs 载入后自动打开详情弹窗（openDetail 既有链），行高亮照常；
 *   ⑤ 作业不存在（已删除/被档位截断）→ toast warning 如实告知，不开弹窗，行定位行为不变；
 *   ⑥ 不带 detail=1 时行为与现状完全一致（只定位不开弹窗），detail 随 jobId 一起摘链。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useAppStore } from '../stores/app';
/* 八百零五批根治同步更新：视图改静态 import=动态 import 首挂载墙内冷启动根因拔除
   （xmProgress529 同型同批，vi.mock 提升保证 api mock 先行） */
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const xbEvents = vi.fn();

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
      xb: {
        ...actual.api.xb,
        jobs: (...a: any[]) => xbJobs(...a),
        destIndices: async () => [],
        events: (...a: any[]) => xbEvents(...a),
      },
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

async function mountXm(query: Record<string, string> = {}, onPinia?: (p: any) => void) {
  location.hash = '#/';
  const pinia = createPinia();
  if (onPinia) onPinia(pinia);
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
  return { app, host, router, pinia };
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

/* ═══ 深链增强：?jobId=X&detail=1 详情深链（挂载） ═══ */
describe('XmigrateView ?jobId=X&detail=1 详情深链（527 增强，挂载）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    location.hash = '#/';
    localStorage.clear();
    sessionStorage.clear();
    xbJobs.mockReset().mockResolvedValue([XM_JOB]);
    xbEvents.mockReset().mockResolvedValue({ events: [] });
    (Element.prototype as any).scrollIntoView = vi.fn();
  });

  it('detail=1 且作业在列表：自动打开详情弹窗 + 行高亮照常 + jobId/detail 一并摘链', async () => {
    const { app, host, router } = await mountXm({ jobId: 'job-abc-1', detail: '1' });
    /* 详情弹窗自动打开（n-modal teleport 查 document；弹窗体=message 全文区等七区） */
    const detail = document.querySelector('[data-test="xm-detail"]');
    expect(detail, '深链 detail=1 自动打开详情弹窗').toBeTruthy();
    expect(detail!.querySelector('[data-test="xm-detail-msg"]'), '详情七区照常渲染（message 全文区在场）').toBeTruthy();
    /* 行高亮定位行为不变 */
    expect(host.querySelector('.qrt-tbl tr.xm-hit'), '行高亮照常').toBeTruthy();
    /* 摘链：jobId 与 detail 都不再挂 query */
    await settle(4);
    expect(router.currentRoute.value.query.jobId).toBeUndefined();
    expect(router.currentRoute.value.query.detail).toBeUndefined();
    app.unmount();
  }, 8000);

  it('detail=1 但作业不在载入列表：toast warning 如实告知，不开弹窗，行定位行为不变', async () => {
    /* notify spy 前置（挂载消费拍即发 warning，挂载后再建 spy 会错过） */
    const spyRef: { spy?: ReturnType<typeof vi.spyOn> } = {};
    const { app, host, router } = await mountXm({ jobId: 'job-gone', detail: '1' }, p => {
      spyRef.spy = vi.spyOn(useAppStore(p), 'notify');
    });
    await settle(4);
    expect(spyRef.spy).toHaveBeenCalledWith('warning', expect.stringContaining('job-gone'));
    expect(document.querySelector('[data-test="xm-detail"]'), '作业不存在不开详情弹窗').toBeNull();
    /* 行未命中=静默跳过（无 xm-hit），与既有 locateJobRow 语义一致 */
    expect(host.querySelector('.qrt-tbl tr.xm-hit')).toBeNull();
    expect(router.currentRoute.value.query.jobId, '摘链照常（用后即清）').toBeUndefined();
    expect(router.currentRoute.value.query.detail).toBeUndefined();
    app.unmount();
  }, 8000);

  it('不带 detail=1：只定位不开弹窗（行为与现状完全一致）', async () => {
    const { app, host } = await mountXm({ jobId: 'job-abc-1' });
    expect(host.querySelector('.qrt-tbl tr.xm-hit'), '定位高亮照常').toBeTruthy();
    expect(document.querySelector('[data-test="xm-detail"]'), '不自动打开详情弹窗').toBeNull();
    app.unmount();
  }, 8000);
});
