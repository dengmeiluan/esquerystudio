/**
 * AdhocRebuildView 审查修复项的行为锁（挂载级）。挂具范式同 arBgNotify1124 / arEvtoolsCluster1124。
 *
 *  · 授权钮 unsupported 档：环境无 Notification 时禁用并给 tip 说明（此前只认 denied，
 *    不支持的环境里按钮可点、点了没反应）；授权态绑定 useJobNotify 的响应式 perm；
 *  · 幂等键重置：同一作业状态回到 RUNNING（重跑/续接沿用 jobId）时清该作业已发过的通知键，
 *    再次停门/终态可再提醒；
 *  · 失败聚类：type 空串/缺失时标签兜底「未分类」（不出空方括号）；聚类键对样本首行的
 *    引号段归一（文档 id / 出错取值换成占位），防同一种错误按 id 逐条成类。
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

const KEY = 'job-notify-v1';
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
const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const mkJob = (over: Record<string, any> = {}) => ({
  jobId: 'gn-1', logicalName: 'bond_index', aliasMode: true, strategy: 'INCREMENTAL',
  timeField: 'ts', status: 'RUNNING', stage: 'CATCHUP', startedAt: 1700000000000,
  sourcePhysical: 'bond_v1', destPhysical: 'bond_v2', currentTaskId: null, error: null,
  ...over,
});
const RUNNING_JOB = mkJob();
const FAILED_JOB = mkJob({ status: 'FAILED', stage: 'FULL_REINDEX', error: 'reindex 超时', finishedAt: 1700000180000 });

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
  /* 最近作业表 Eye 钮进入监控步（watchJob 回包 → job 赋值） */
  clickEye(host, job.jobId);
  await settle(10);
  return host;
}

function clickEye(host: HTMLElement, jobId: string) {
  const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
  const row = rows.find(tr => (tr.textContent || '').includes(jobId));
  (row!.querySelector('button[aria-label="查看任务详情"]') as HTMLButtonElement).click();
}

const setupOf = (host: HTMLElement) => (host.querySelector('.ahr') as any).__vueParentComponent.setupState;

beforeEach(() => {
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
  document.title = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AdhocRebuildView · 桌面通知授权钮（unsupported 档 + perm 回显）', () => {
  it('环境无 Notification：按钮禁用并给 tip 说明；标题闪烁开关不受影响', { timeout: 20000 }, async () => {
    vi.unstubAllGlobals();
    const host = await mountAR(RUNNING_JOB);
    const btn = host.querySelector<HTMLButtonElement>('[data-test="ar-notify-desktop"]')!;
    expect(btn.disabled, '不支持的环境里不让人空点').toBe(true);
    expect(setupOf(host).notifyDesktopTip).toBe('当前环境不支持桌面通知（标题闪烁提醒不受影响）');
    expect(setupOf(host).notifyDesktopUnsupported).toBe(true);
    expect(host.querySelector<HTMLInputElement>('[data-test="ar-notify-title"]'), '标题闪烁开关照常在场').toBeTruthy();
    expect(setupOf(host).notifyTitleOn).toBe(true);
  });

  it('default 档可点 + 申请授权 tip；granted / denied 的 tip 与禁用态按授权态走', { timeout: 20000 }, async () => {
    const host = await mountAR(RUNNING_JOB);
    const btn = host.querySelector<HTMLButtonElement>('[data-test="ar-notify-desktop"]')!;
    expect(btn.disabled).toBe(false);
    expect(setupOf(host).notifyDesktopTip).toBe('申请桌面通知授权：页面在后台时停门/终态弹系统通知');
    /* 授权回执 granted：按钮保持可用（已授权再点只是确认），偏好落盘 */
    btn.click();
    await settle(6);
    expect(requestPermissionFn).toHaveBeenCalledTimes(1);
    expect(setupOf(host).notifyDesktopDenied).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY) || '{}').desktop).toBe(true);
    apps.pop()!.unmount();
    document.body.innerHTML = '';

    FakeNotification.permission = 'denied';
    const h2 = await mountAR(RUNNING_JOB);
    const deniedBtn = h2.querySelector<HTMLButtonElement>('[data-test="ar-notify-desktop"]')!;
    expect(deniedBtn.disabled).toBe(true);
    expect(setupOf(h2).notifyDesktopTip).toBe('浏览器已拒绝本站桌面通知——需在浏览器站点设置中重新允许（标题闪烁不受影响）');
  });

  it('回到页面（visibilitychange 转可见）重读授权态：隐藏期间去站点设置放行后解禁', { timeout: 20000 }, async () => {
    FakeNotification.permission = 'denied';
    const host = await mountAR(RUNNING_JOB);
    const btn = host.querySelector<HTMLButtonElement>('[data-test="ar-notify-desktop"]')!;
    expect(btn.disabled).toBe(true);
    FakeNotification.permission = 'granted';
    hiddenVal = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await settle(4);
    expect(btn.disabled, '隐藏拍不刷新').toBe(true);
    hiddenVal = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await settle(4);
    expect(btn.disabled, '回前台后刷新').toBe(false);
  });
});

describe('AdhocRebuildView · 幂等键重置（状态回到 RUNNING）', () => {
  it('同一作业 FAILED → RUNNING → FAILED：第二次终态仍提醒一次（不被上一轮的键吞掉）', { timeout: 20000 }, async () => {
    localStorage.setItem(KEY, JSON.stringify({ title: true, desktop: true }));
    FakeNotification.permission = 'granted';
    /* 页面可见时首次观察到 FAILED：不弹桌面通知，但幂等键已记账 */
    const host = await mountAR(FAILED_JOB);
    expect(notifyCreated, '可见时不弹').toHaveLength(0);
    hiddenVal = true;
    statusFn.mockResolvedValue(FAILED_JOB);
    clickEye(host, 'gn-1');
    await settle(10);
    expect(notifyCreated, '同一轮内幂等：再拍不重发').toHaveLength(0);
    /* 重跑：状态回到 RUNNING → 清该作业已发通知键 */
    statusFn.mockResolvedValue(RUNNING_JOB);
    clickEye(host, 'gn-1');
    await settle(10);
    expect(setupOf(host).job.status, '作业回到 RUNNING').toBe('RUNNING');
    /* 再次失败：新一轮终态要能再提醒 */
    statusFn.mockResolvedValue(FAILED_JOB);
    clickEye(host, 'gn-1');
    await settle(10);
    expect(notifyCreated, '新一轮终态通知恰一次').toHaveLength(1);
    expect(notifyCreated[0].options.tag).toBe('gn-1::failed');
    expect(document.title).toContain('✖');
  });
});

describe('AdhocRebuildView · 失败聚类（标签兜底 + 首行引号段归一）', () => {
  const DONE_BASE = {
    jobId: 'fc-1', logicalName: 'bond_index', aliasMode: true, strategy: 'INCREMENTAL',
    timeField: 'ts', status: 'SUCCEEDED', stage: 'DONE', startedAt: 1700000000000,
    finishedAt: 1700000180000, sourcePhysical: 'bond_v1', destPhysical: 'bond_v2',
    currentTaskId: null, error: null,
  };
  const failedJob = (failures: any[], jobId = 'fc-1') => ({ ...DONE_BASE, jobId, status: 'FAILED', stage: 'DONE', error: 'reindex 失败', failures });
  const openDetail = async (host: HTMLElement) => {
    (host.querySelector<HTMLButtonElement>('[data-test="ar-fcluster-summary"]')!).click();
    await settle(4);
  };

  it('type 空串/缺失：标签兜底「未分类」，摘要、分组明细、逐条列表都不出空方括号', { timeout: 20000 }, async () => {
    const host = await mountAR(failedJob([
      { type: '', reason: '原因甲' },
      { type: undefined, reason: '原因甲' },
      { reason: '原因甲' },
      { type: 'es_timeout', reason: '请求超时' },
    ]));
    const failures = host.querySelector('[data-test="ar-failure-samples"]')!;
    expect((failures.textContent || ''), '任何位置都不出现空方括号 []').not.toContain('[]');
    const sum = host.querySelector('[data-test="ar-fcluster-summary"]')!.textContent || '';
    expect(sum).toContain('2 类');
    expect(sum).toContain('未分类 x3（75%）');
    expect(sum).toContain('es_timeout x1（25%）');
    await openDetail(host);
    const items = [...host.querySelectorAll('[data-test^="ar-fcluster-item-"]')];
    expect(items[0].textContent).toContain('[未分类]');
    expect(host.querySelector('[data-test="ar-failure-item-0"]')!.textContent, '逐条列表同样兜底').toContain('[未分类]');
  });

  it('首行引号段归一：只差文档 id / 出错取值的同类错误聚成一类（单双引号都归一）', { timeout: 20000 }, async () => {
    const host = await mountAR(failedJob([
      { type: 'number_format_exception', reason: 'For input string: "abc"' },
      { type: 'number_format_exception', reason: 'For input string: "def"' },
      { type: 'number_format_exception', reason: "For input string: 'ghi'" },
      { type: 'mapper_parsing_exception', reason: "failed to parse field [ts] of type [date] in document with id 'a1'. Preview of field's value: 'x'" },
      { type: 'mapper_parsing_exception', reason: "failed to parse field [ts] of type [date] in document with id 'b2'. Preview of field's value: 'y'" },
      { type: 'es_timeout', reason: '请求超时' },
    ]));
    const sum = host.querySelector('[data-test="ar-fcluster-summary"]')!.textContent || '';
    expect(sum, '引号内内容不同不再逐条成类').toContain('3 类');
    expect(sum).toContain('number_format_exception x3（50%）');
    expect(sum).toContain('mapper_parsing_exception x2（33%）');
    expect(sum).toContain('es_timeout x1（17%）');
    /* 明细行展示的首条完整样本保持原文（归一只作用于聚类键，不改展示） */
    await openDetail(host);
    const items = [...host.querySelectorAll('[data-test^="ar-fcluster-item-"]')];
    expect(items[0].textContent).toContain('For input string: "abc"');
    /* 所有格撇号（field's）不当引号起点：其后的引号段照常归一，原文不被错配 */
    expect(items[1].textContent).toContain("in document with id 'a1'. Preview of field's value: 'x'");
  });

  it('引号外的文字不同仍是不同类；多行 reason 仍只取首行', { timeout: 20000 }, async () => {
    const st = setupOf(await mountAR(failedJob([
      { type: 'illegal_argument_exception', reason: 'For input string: "abc"' },
      { type: 'illegal_argument_exception', reason: 'For output string: "abc"' },
      { type: 'es_timeout', reason: '请求超时' },
    ])));
    expect(st.clusterHeadKey({ reason: 'For input string: "abc"' })).not.toBe(st.clusterHeadKey({ reason: 'For output string: "abc"' }));
    expect(st.clusterHeadKey({ reason: 'a "x" b\n  at worker #1' })).toBe(st.clusterHeadKey({ reason: 'a "y" b\n  at worker #2' }));
    expect(st.clusterHeadKey({ reason: `id 'a1' said "hello world", 'x'` }), '引号段（含空格）整体换占位，单双引号同占位').toBe('id … said …, …');
    expect(st.clusterHeadKey({ reason: "For input string: 'ghi'" }), '单引号取值与双引号取值归到同一个键')
      .toBe(st.clusterHeadKey({ reason: 'For input string: "abc"' }));
    /* 成对引号才算引号段：落单的撇号/引号原样保留（can't 一类缩写不被误并） */
    expect(st.clusterHeadKey({ reason: "Can't lock index" })).toBe("Can't lock index");
    expect(st.failTypeLabel({ type: '   ' }), '纯空白 type 同样兜底').toBe('未分类');
    expect(st.failTypeLabel({ type: ' es_timeout ' }), '正常 type 保留').toBe('es_timeout');
  });
});
