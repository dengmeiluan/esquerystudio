/**
 * 托管重建后台通知接线（useJobNotify）：停门/终态在页面隐藏时的桌面通知与标题闪烁。
 *
 *  · 轮询拍检测（job 赋值通道统一走状态签名 watch）：进 AWAIT_CONFIRM → level gate
 *    （文案含 jobId 与「超时自动放弃」后果警示）；进终态 → done/failed/aborted；
 *  · document.hidden 时才发（页面可见时页内横幅/状态 pill 已承担示警）；
 *    同 jobId+level 幂等（tag=jobId::level），gate→failed 接续各自一次；
 *  · 偏好持久化：标题闪烁开关写 job-notify-v1，重挂读回；关闭后闪烁停；
 *  · 桌面通知授权钮：permission=denied 就地禁用；default 授权成功后落偏好。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const statusFn = vi.fn();
const jobsFn = vi.fn();
const eventsFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      adhoc: {
        ...actual.api.adhoc,
        status: (...a: any[]) => statusFn(...a),
        jobs: (...a: any[]) => jobsFn(...a),
        events: (...a: any[]) => eventsFn(...a),
      },
    },
  };
});
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { void props; void emit; return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

import AdhocRebuildView from '../views/AdhocRebuildView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/* Notification 替身：permission 可按场景设定，构造调用全量记录（title/options） */
const notifyCreated: { title: string; options: any }[] = [];
const requestPermissionFn = vi.fn(async () => 'granted');
class FakeNotification {
  static permission = 'default';
  static requestPermission = requestPermissionFn;
  onclick: (() => void) | null = null;
  constructor(public title: string, public options: any) { notifyCreated.push({ title, options }); }
  close() { /* no-op */ }
}

let hiddenVal = false;

const mkJob = (over: Record<string, any>) => ({
  jobId: 'gn-1', logicalName: 'bond_index', aliasMode: true, strategy: 'INCREMENTAL',
  timeField: 'ts', status: 'RUNNING', stage: 'CATCHUP', startedAt: 1700000000000,
  sourcePhysical: 'bond_v1', destPhysical: 'bond_v2', currentTaskId: null, error: null,
  ...over,
});
const GATE_JOB = mkJob({ stage: 'AWAIT_CONFIRM', awaitConfirmSince: 1700000060000, gateDeadlineMs: Date.now() + 30 * 60_000 });

async function mountAR(job: any) {
  jobsFn.mockResolvedValue([job]);
  statusFn.mockResolvedValue(job);
  eventsFn.mockResolvedValue({ jobId: job.jobId, events: [] });
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/search', component: { template: '<div/>' } },
      { path: '/indices', component: { template: '<div/>' } },
      { path: '/tasks', component: { template: '<div/>' } },
      { path: '/aliases', component: { template: '<div/>' } },
      { path: '/health-report', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(AdhocRebuildView as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  await settle(20);
  /* 最近作业表 Eye 钮进入监控步（watchJob 回包 → job 赋值 → 状态签名 watch 检测） */
  const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
  const row = rows.find(tr => (tr.textContent || '').includes(job.jobId));
  (row!.querySelector('button[aria-label="查看任务详情"]') as HTMLButtonElement).click();
  await settle(10);
  return host;
}

const setupOf = (host: HTMLElement) => (host.querySelector('.ahr') as any).__vueParentComponent.setupState;

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  document.title = '';
  notifyCreated.length = 0;
  requestPermissionFn.mockClear();
  FakeNotification.permission = 'default';
  vi.stubGlobal('Notification', FakeNotification);
  hiddenVal = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hiddenVal);
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('后台通知：停门/终态（useJobNotify 接线）', () => {
  it('页面隐藏时进 AWAIT_CONFIRM：gate 桌面通知一次（含 jobId 与超时自动放弃警示）+ 标题闪烁', { timeout: 20000 }, async () => {
    localStorage.setItem('job-notify-v1', JSON.stringify({ title: true, desktop: true }));
    FakeNotification.permission = 'granted';
    hiddenVal = true;
    const host = await mountAR(GATE_JOB);
    expect(notifyCreated, '桌面通知恰一次').toHaveLength(1);
    expect(notifyCreated[0].title).toContain('⏸');
    expect(notifyCreated[0].options.body).toContain('gn-1');
    expect(notifyCreated[0].options.body).toContain('超时自动放弃');
    expect(notifyCreated[0].options.tag).toBe('gn-1::gate');
    expect(document.title).toContain('⏸');
    /* 幂等：同 jobId 同 level 二次拍（再次 Eye）不重发 */
    const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
    const row = rows.find(tr => (tr.textContent || '').includes('gn-1'));
    (row!.querySelector('button[aria-label="查看任务详情"]') as HTMLButtonElement).click();
    await settle(10);
    expect(notifyCreated).toHaveLength(1);
  });

  it('回前台（visibilitychange）停闪并还原标题', { timeout: 20000 }, async () => {
    localStorage.setItem('job-notify-v1', JSON.stringify({ title: true, desktop: true }));
    FakeNotification.permission = 'granted';
    hiddenVal = true;
    await mountAR(GATE_JOB);
    expect(document.title).toContain('⏸');
    hiddenVal = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await settle(4);
    expect(document.title).not.toContain('⏸');
  });

  it.each([
    ['SUCCEEDED', 'DONE', '✅', '已完成'],
    ['FAILED', 'FULL_REINDEX', '✖', '失败'],
    ['ABORTED', 'ABORTED', '⛔', '已中止'],
  ] as const)('终态 %s：level 通知一次（图标 %s，文案含 jobId）', { timeout: 20000 }, async (status, stage, icon, word) => {
    localStorage.setItem('job-notify-v1', JSON.stringify({ title: true, desktop: true }));
    FakeNotification.permission = 'granted';
    hiddenVal = true;
    await mountAR(mkJob({ status, stage, error: status === 'FAILED' ? 'reindex 超时' : null, finishedAt: 1700000180000 }));
    expect(notifyCreated, '终态通知恰一次').toHaveLength(1);
    expect(notifyCreated[0].title).toContain(icon);
    expect(notifyCreated[0].options.body).toContain('gn-1');
    expect(notifyCreated[0].options.body).toContain(word);
    expect(document.title).toContain(icon);
  });

  it('gate → failed 接续：两个 level 各自通知一次（不互相吞）', { timeout: 20000 }, async () => {
    localStorage.setItem('job-notify-v1', JSON.stringify({ title: true, desktop: true }));
    FakeNotification.permission = 'granted';
    hiddenVal = true;
    const host = await mountAR(GATE_JOB);
    expect(notifyCreated).toHaveLength(1);
    /* 换拍：作业离开确认门后失败（模拟服务端状态推进） */
    statusFn.mockResolvedValue(mkJob({ status: 'FAILED', stage: 'FULL_REINDEX', error: 'reindex 超时', finishedAt: 1700000180000 }));
    const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
    const row = rows.find(tr => (tr.textContent || '').includes('gn-1'));
    (row!.querySelector('button[aria-label="查看任务详情"]') as HTMLButtonElement).click();
    await settle(10);
    expect(notifyCreated).toHaveLength(2);
    expect(notifyCreated[1].options.tag).toBe('gn-1::failed');
  });

  it('页面可见时不发桌面通知（页内横幅已承担示警，不打扰）', { timeout: 20000 }, async () => {
    localStorage.setItem('job-notify-v1', JSON.stringify({ title: true, desktop: true }));
    FakeNotification.permission = 'granted';
    hiddenVal = false;
    await mountAR(GATE_JOB);
    expect(notifyCreated).toHaveLength(0);
    expect(document.title).not.toContain('⏸');
  });
});

describe('后台通知：偏好控件与持久化', () => {
  it('标题闪烁开关关闭：写 job-notify-v1，重挂读回；停门拍不再闪标题、不发桌面通知', { timeout: 20000 }, async () => {
    hiddenVal = true;
    FakeNotification.permission = 'granted';
    const host = await mountAR(GATE_JOB);
    const setup = setupOf(host);
    expect(setup.notifyTitleOn, '默认开').toBe(true);
    setup.setNotifyTitle(false);
    await settle(4);
    expect(JSON.parse(localStorage.getItem('job-notify-v1') || '{}')).toEqual({ title: false, desktop: false });
    apps.pop()!.unmount();
    document.body.innerHTML = '';
    document.title = '';
    notifyCreated.length = 0;
    /* 重挂：偏好读回，同拍停门只闪不弹——闪烁已关即两通道全静 */
    const h2 = await mountAR(GATE_JOB);
    expect(setupOf(h2).notifyTitleOn, '重挂读回关闭档').toBe(false);
    expect(notifyCreated).toHaveLength(0);
    expect(document.title).not.toContain('⏸');
  });

  it('桌面通知授权钮：denied 就地禁用；default 授权成功后落偏好', { timeout: 20000 }, async () => {
    FakeNotification.permission = 'denied';
    const host = await mountAR(GATE_JOB);
    const deniedBtn = host.querySelector<HTMLButtonElement>('[data-test="ar-notify-desktop"]')!;
    expect(deniedBtn, '授权钮在场').toBeTruthy();
    expect(deniedBtn.disabled, 'denied 后禁用（重授权只能去站点设置）').toBe(true);
    apps.pop()!.unmount();
    document.body.innerHTML = '';

    FakeNotification.permission = 'default';
    const h2 = await mountAR(GATE_JOB);
    const btn = h2.querySelector<HTMLButtonElement>('[data-test="ar-notify-desktop"]')!;
    expect(btn.disabled, 'default 档可点').toBe(false);
    btn.click();
    await settle(6);
    expect(requestPermissionFn, '走 Notification.requestPermission').toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('job-notify-v1') || '{}').desktop, '授权成功落偏好').toBe(true);
  });

  it('监控卡头偏好控件在场：标题闪烁开关与授权钮同组（data-test 锚）', { timeout: 20000 }, async () => {
    const host = await mountAR(GATE_JOB);
    expect(host.querySelector('[data-test="ar-notify-title"]'), '标题闪烁开关').toBeTruthy();
    expect(host.querySelector('[data-test="ar-notify-desktop"]'), '桌面通知授权钮').toBeTruthy();
  });
});
