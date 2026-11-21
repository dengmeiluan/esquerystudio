/**
 * 2026-11-22 批：运行中动态调速（RUNNING 行行钮 + 行菜单项 + 弹层）。
 *
 *   ① 入口——RUNNING 行出调速钮（data-test=xm-throttle-btn），终态行不出；
 *     行菜单 RUNNING 档含「调速」项（只增项，既有项不触）；
 *   ② 弹层与调用——开弹层回显当前速率（无 requestsPerSecond 默认 -1 不限速）；
 *     rps>0 → api.xb.throttle(jobId, rps, 按作业源连接 target)，成功 toast +
 *     作业表刷新 + 弹层关闭；-1 → 恢复不限速 toast；
 *   ③ 边界——0 前端拒绝（warning 不发请求）；空值拒绝；失败（非运行态/网络）
 *     弹层内 role=alert 如实展示原文，弹层不关不冒充。
 * 挂具范式同 xmHealthSummary1121（全真挂载 + api mock；n-modal teleport 查 document）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import XmigrateView from '../views/XmigrateView.vue';
import { useAppStore } from '../stores/app';

const xbJobs = vi.fn();
const xbThrottle = vi.fn();

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
        throttle: (...a: any[]) => xbThrottle(...a),
      },
    },
  };
});

const NOW = Date.now();
const RUNNING_JOB = {
  jobId: 'j-run', status: 'RUNNING', destIndex: 'dest-r', sourceIndex: 'src-r',
  remoteEndpoint: '', migrated: 100, total: 1000, conflicts: 0, errors: 0,
  createTime: NOW - 30000, startedAtMs: NOW - 30000,
  sliceStatus: { '0': 'RUNNING' }, sliceMigrated: { '0': 100 }, sliceErrors: {},
};
const DONE_JOB = {
  jobId: 'j-done', status: 'DONE', destIndex: 'dest-d', sourceIndex: 'src-d',
  remoteEndpoint: '', migrated: 7, total: 7, conflicts: 0, errors: 0,
  createTime: NOW - 90000, sliceStatus: {},
};

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountXm() {
  location.hash = '#/';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/xmigrate', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(XmigrateView as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, pinia };
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([RUNNING_JOB]);
  xbThrottle.mockReset().mockResolvedValue({ ok: true, jobId: 'j-run', rps: 500, appliedAt: NOW });
  (Element.prototype as any).scrollIntoView = vi.fn();
});

/* 打开调速弹层（行钮入口）——footer 应用钮在场即弹层已开 */
async function openThrottleModal(host: HTMLElement) {
  (host.querySelector('[data-test="xm-throttle-btn"]') as HTMLButtonElement).click();
  await settle(2);
  expect(document.querySelector('[data-test="xm-throttle-apply"]'), '调速弹层已开（应用钮在场）').toBeTruthy();
}

/* ═══ ① 入口（行钮在场性 + 行菜单项） ═══ */
describe('1122 调速 ①：入口', () => {
  it('RUNNING 行出调速钮；DONE 行不出（仅运行中可调）', async () => {
    const { app, host } = await mountXm();
    expect(host.querySelector('[data-test="xm-throttle-btn"]'), 'RUNNING 行调速钮在场').toBeTruthy();
    app.unmount();
    xbJobs.mockResolvedValue([DONE_JOB]);
    const m2 = await mountXm();
    expect(m2.host.querySelector('[data-test="xm-throttle-btn"]'), '终态行不出调速钮').toBeNull();
    m2.app.unmount();
  }, 10000);

  it('行菜单 RUNNING 档含「调速」项（只增项，既有项保留）', async () => {
    const { app, host } = await mountXm();
    (host.querySelector('[aria-label="作业行菜单"]') as HTMLButtonElement).click();
    await settle(2);
    const labels = [...document.querySelectorAll('.ccm .ccm-it')].map(b => b.textContent!.trim());
    expect(labels).toContain('调速');
    expect(labels).toContain('中止迁移');
    expect(labels, '既有复制项保留').toContain('复制 jobId');
    app.unmount();
  }, 8000);
});

/* ═══ ② 弹层与调用（回显/限速/不限速/成功联动） ═══ */
describe('1122 调速 ②：弹层与调用', () => {
  it('开弹层默认 -1（不限速回显）；rps=500 应用 → throttle 调用 + 成功 toast + 刷新 + 关弹层', async () => {
    const { app, host, pinia } = await mountXm();
    const st = stateOf(app);
    await openThrottleModal(host);
    expect(st.throttleRps, 'job 无 requestsPerSecond 回显 -1（不限速）').toBe(-1);
    st.throttleRps = 500;
    await settle(2);
    (document.querySelector('[data-test="xm-throttle-apply"]') as HTMLButtonElement).click();
    await settle(4);
    expect(xbThrottle).toHaveBeenCalledTimes(1);
    expect(xbThrottle.mock.calls[0]).toEqual(['j-run', 500, undefined]);
    const store = useAppStore(pinia);
    expect(store.notifyLog.some(n => n.msg.includes('已调速为 500 docs/s')), '限速成功 toast').toBe(true);
    expect(st.throttleOpen, '成功后弹层关闭').toBe(false);
    expect(xbJobs.mock.calls.length, '作业表已刷新').toBeGreaterThanOrEqual(2);
    app.unmount();
  }, 10000);

  it('作业带 requestsPerSecond 回显当前速率；-1 → 「已恢复不限速」toast', async () => {
    xbJobs.mockResolvedValue([{ ...RUNNING_JOB, requestsPerSecond: 200 }]);
    const { app, host, pinia } = await mountXm();
    const st = stateOf(app);
    await openThrottleModal(host);
    expect(st.throttleRps, '回显当前生效速率').toBe(200);
    st.throttleRps = -1;
    await settle(2);
    (document.querySelector('[data-test="xm-throttle-apply"]') as HTMLButtonElement).click();
    await settle(4);
    expect(xbThrottle).toHaveBeenCalledWith('j-run', -1, undefined);
    const store = useAppStore(pinia);
    expect(store.notifyLog.some(n => n.msg.includes('已恢复不限速')), '不限速成功 toast').toBe(true);
    app.unmount();
  }, 10000);

  it('带源连接的作业：throttle target=作业 srcConnId（abort 同款口径）', async () => {
    xbJobs.mockResolvedValue([{ ...RUNNING_JOB, srcConnId: 'conn-a' }]);
    const { app, host } = await mountXm();
    const st = stateOf(app);
    await openThrottleModal(host);
    st.throttleRps = 300;
    await settle(2);
    (document.querySelector('[data-test="xm-throttle-apply"]') as HTMLButtonElement).click();
    await settle(4);
    expect(xbThrottle).toHaveBeenCalledWith('j-run', 300, 'conn-a');
    app.unmount();
  }, 10000);
});

/* ═══ ③ 边界（0/空值拒绝；失败如实展示） ═══ */
describe('1122 调速 ③：边界与错误态', () => {
  it('rps=0 → 前端拒绝（warning 引导中止），不发请求', async () => {
    const { app, host, pinia } = await mountXm();
    const st = stateOf(app);
    await openThrottleModal(host);
    st.throttleRps = 0;
    await settle(2);
    (document.querySelector('[data-test="xm-throttle-apply"]') as HTMLButtonElement).click();
    await settle(4);
    expect(xbThrottle, '0 不发请求').not.toHaveBeenCalled();
    const store = useAppStore(pinia);
    expect(store.notifyLog.some(n => n.msg.includes('0 不允许')), '0 拒绝提示').toBe(true);
    app.unmount();
  }, 10000);

  it('rps=null（未填）→ 前端拒绝不发请求', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    await openThrottleModal(host);
    st.throttleRps = null;
    await settle(2);
    (document.querySelector('[data-test="xm-throttle-apply"]') as HTMLButtonElement).click();
    await settle(4);
    expect(xbThrottle, '空值不发请求').not.toHaveBeenCalled();
    app.unmount();
  }, 10000);

  it('失败（作业已转终态/网络）：弹层内 role=alert 展示原文，弹层不关不冒充', async () => {
    xbThrottle.mockRejectedValue(Object.assign(
      new Error('作业已结束，非运行态不可调速'), { status: 409 }));
    const { app, host } = await mountXm();
    const st = stateOf(app);
    await openThrottleModal(host);
    st.throttleRps = 500;
    await settle(2);
    (document.querySelector('[data-test="xm-throttle-apply"]') as HTMLButtonElement).click();
    await settle(4);
    const err = document.querySelector('[data-test="xm-throttle-err"]')!;
    expect(err.getAttribute('role')).toBe('alert');
    expect(err.textContent).toContain('调速失败');
    expect(err.textContent).toContain('非运行态不可调速');
    expect(st.throttleOpen, '失败不关弹层（现场保留）').toBe(true);
    app.unmount();
  }, 10000);
});
