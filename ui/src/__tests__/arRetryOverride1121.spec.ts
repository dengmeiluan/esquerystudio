/**
 * 托管重建重跑：参数覆盖弹层（2026-11-21 对账批）。
 *
 * 行为锁（真挂载 + memory router + api 手控回包）：
 *  · 重跑钮先开弹层（NInputNumber×3：限流/slices/批大小），预填作业原值，
 *    清空后占位「沿用原值」；弹层在场时 retry 端点未被调；
 *  · 修改后提交：仅填写的字段进 overrides（「未填不发键」），空覆盖保持单参请求形态；
 *  · rps 输 0 给红字且提交钮禁用（start 同口径，防误填）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const statusFn = vi.fn();
const jobsFn = vi.fn();
const eventsFn = vi.fn();
const retryFn = vi.fn();

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
        retry: (...a: any[]) => retryFn(...a),
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

/** FAILED 作业（带可覆盖的执行参数原值） */
const failedJob = (over: Record<string, any> = {}) => ({
  jobId: 'rov-1', logicalName: 'bond_index', aliasMode: true, strategy: 'WRITE_BLOCK',
  timeField: null, status: 'FAILED', stage: 'FULL_REINDEX', startedAt: 1700000000000,
  finishedAt: 1700000009000, sourcePhysical: 'bond_v1', destPhysical: 'bond_v2',
  error: '全量中途失败', currentTaskId: null,
  requestsPerSecond: 100, slices: 2, batchSize: 500,
  ...over,
});

async function mountAR(job: any) {
  jobsFn.mockResolvedValue([job]);
  statusFn.mockResolvedValue(job);
  eventsFn.mockResolvedValue({ jobId: job.jobId, events: [] });
  const View = AdhocRebuildView;
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
  const app = createApp({ render: () => h(View as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  await settle(20);
  /* 从最近作业表 Eye 钮进入执行监控步（重跑钮在监控步） */
  const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
  const row = rows.find(tr => (tr.textContent || '').includes(job.jobId));
  expect(row, '最近作业表必须渲染出该作业行').toBeTruthy();
  (row!.querySelector('button[aria-label="查看任务详情"]') as HTMLButtonElement).click();
  await settle(10);
  return host;
}

/** NInputNumber 内部 input（data-test 锚在组件根） */
const numInputOf = (sel: string): HTMLInputElement => {
  const root = document.querySelector(sel);
  if (!root) throw new Error('number root not found: ' + sel);
  const inp = root.querySelector<HTMLInputElement>('input');
  if (!inp) throw new Error('inner <input> not found under ' + sel);
  return inp;
};
const setInput = (el: HTMLInputElement, v: string) => {
  el.value = v;
  el.dispatchEvent(new Event('input'));
};

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  retryFn.mockReset().mockResolvedValue({ ...failedJob(), status: 'RUNNING', stage: 'FULL_REINDEX', error: null });
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('重跑参数覆盖弹层', () => {
  it('点重跑先开弹层：三输入预填原值，弹层在场时 retry 未被调', { timeout: 20000 }, async () => {
    const host = await mountAR(failedJob());
    const retry = host.querySelector<HTMLButtonElement>('[data-test="adhoc-retry"]');
    expect(retry, '监控步重跑钮在场（FAILED）').toBeTruthy();
    retry!.click();
    await settle(6);
    /* 弹层 NModal teleport 到 body，锚走 document */
    expect(document.querySelector('[data-test="ar-retry-rps"]'), '限流输入在场').toBeTruthy();
    expect(document.querySelector('[data-test="ar-retry-slices"]'), 'slices 输入在场').toBeTruthy();
    expect(document.querySelector('[data-test="ar-retry-batch"]'), '批大小输入在场').toBeTruthy();
    expect(numInputOf('[data-test="ar-retry-rps"]').value, '预填原值 rps=100').toBe('100');
    expect(numInputOf('[data-test="ar-retry-slices"]').value, '预填原值 slices=2').toBe('2');
    expect(numInputOf('[data-test="ar-retry-batch"]').value, '预填原值 batchSize=500').toBe('500');
    expect(retryFn, '弹层只是确认层，未提交不发请求').not.toHaveBeenCalled();
    expect(document.querySelector('[data-test="ar-retry-go"]'), '提交钮在场').toBeTruthy();
  });

  it('缺省原值占位「沿用原值」；改值提交仅带填写字段（未填不发键）', { timeout: 20000 }, async () => {
    const host = await mountAR(failedJob({ requestsPerSecond: null, slices: null, batchSize: null }));
    (host.querySelector<HTMLButtonElement>('[data-test="adhoc-retry"]'))!.click();
    await settle(6);
    expect(numInputOf('[data-test="ar-retry-rps"]').placeholder, '缺省原值给「沿用原值」占位').toBe('沿用原值');
    expect(numInputOf('[data-test="ar-retry-slices"]').placeholder).toBe('沿用原值');
    /* 只填限流 500：overrides 只带 requestsPerSecond */
    setInput(numInputOf('[data-test="ar-retry-rps"]'), '500');
    await settle(4);
    (document.querySelector<HTMLButtonElement>('[data-test="ar-retry-go"]'))!.click();
    await settle(10);
    expect(retryFn).toHaveBeenCalledWith('rov-1', { requestsPerSecond: 500 });
  });

  it('三键覆盖提交：overrides 携带 rps/slices/batchSize', { timeout: 20000 }, async () => {
    const host = await mountAR(failedJob());
    (host.querySelector<HTMLButtonElement>('[data-test="adhoc-retry"]'))!.click();
    await settle(6);
    setInput(numInputOf('[data-test="ar-retry-rps"]'), '500');
    await settle(4);
    setInput(numInputOf('[data-test="ar-retry-slices"]'), '4');
    await settle(4);
    setInput(numInputOf('[data-test="ar-retry-batch"]'), '2000');
    await settle(4);
    (document.querySelector<HTMLButtonElement>('[data-test="ar-retry-go"]'))!.click();
    await settle(10);
    expect(retryFn).toHaveBeenCalledWith('rov-1', { requestsPerSecond: 500, slices: 4, batchSize: 2000 });
  });

  it('清空预填值后提交：全字段沿用原值 → 单参请求（与既有无覆盖链同一形态）', { timeout: 20000 }, async () => {
    const host = await mountAR(failedJob());
    (host.querySelector<HTMLButtonElement>('[data-test="adhoc-retry"]'))!.click();
    await settle(6);
    /* 清空三输入 =「沿用原值」占位回归：无任何覆盖字段时不带 overrides */
    for (const sel of ['[data-test="ar-retry-rps"]', '[data-test="ar-retry-slices"]', '[data-test="ar-retry-batch"]']) {
      setInput(numInputOf(sel), '');
      await settle(3);
    }
    expect(numInputOf('[data-test="ar-retry-rps"]').value).toBe('');
    (document.querySelector<HTMLButtonElement>('[data-test="ar-retry-go"]'))!.click();
    await settle(10);
    expect(retryFn).toHaveBeenCalledWith('rov-1');
  });

  it('rps 输 0 给红字且提交钮禁用；-1 合法（显式覆盖为不限速）', { timeout: 20000 }, async () => {
    const host = await mountAR(failedJob());
    (host.querySelector<HTMLButtonElement>('[data-test="adhoc-retry"]'))!.click();
    await settle(6);
    setInput(numInputOf('[data-test="ar-retry-rps"]'), '0');
    await settle(4);
    const err = document.querySelector('[data-test="ar-retry-err"]');
    expect(err, '0 即时红字（与向导执行参数同口径）').toBeTruthy();
    expect(err!.textContent).toContain('限流需为正数，-1 或留空表示不限');
    expect((document.querySelector('[data-test="ar-retry-go"]') as HTMLButtonElement).disabled,
      '非法时提交不放行').toBe(true);
    setInput(numInputOf('[data-test="ar-retry-rps"]'), '-1');
    await settle(4);
    expect(document.querySelector('[data-test="ar-retry-err"]'), '-1 不限不报错').toBeNull();
    (document.querySelector<HTMLButtonElement>('[data-test="ar-retry-go"]'))!.click();
    await settle(10);
    expect(retryFn).toHaveBeenCalledWith('rov-1', { requestsPerSecond: -1, slices: 2, batchSize: 500 });
  });

  it('行级重跑钮同一弹层链路（最近作业表 FAILED 行）', { timeout: 20000 }, async () => {
    const host = await mountAR(failedJob());
    const rowBtn = host.querySelector<HTMLButtonElement>('[data-test="adhoc-retry-row"]');
    expect(rowBtn, '行级重跑钮在场').toBeTruthy();
    rowBtn!.click();
    await settle(6);
    expect(document.querySelector('[data-test="ar-retry-rps"]'), '行级入口同样开弹层').toBeTruthy();
    expect(retryFn).not.toHaveBeenCalled();
  });
});
