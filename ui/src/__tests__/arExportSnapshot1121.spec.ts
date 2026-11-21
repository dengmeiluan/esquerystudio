/**
 * 托管重建作业快照导出（2026-11-21 对账批）：JSON 下载 + Markdown 工单贴片。
 *
 *  · 终态作业监控步出「导出 JSON / 复制 Markdown」两钮；
 *  · JSON 走 downloadText 统一件：文件名带 jobId，内容为完整快照 JSON；
 *  · Markdown 复用 matrixText 导出风格：基本信息表 + 轮次明细表 + 文档数对账结论段，
 *    经 copyText 复制（工单直贴）；
 *  · RUNNING 作业两钮不渲染（快照未定型，不导出半程状态冒充结论）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const statusFn = vi.fn();
const jobsFn = vi.fn();
const eventsFn = vi.fn();
const prepareFn = vi.fn();
const copyTextFn = vi.fn();
const downloadTextFn = vi.fn();

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
        prepare: (...a: any[]) => prepareFn(...a),
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
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: (...a: any[]) => copyTextFn(...a), downloadText: (...a: any[]) => downloadTextFn(...a) };
});

import AdhocRebuildView from '../views/AdhocRebuildView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const OK_JOB = {
  jobId: 'exp-1', logicalName: 'bond_index', aliasMode: true, strategy: 'INCREMENTAL',
  timeField: 'ts', status: 'SUCCEEDED', stage: 'DONE', startedAt: 1700000000000,
  finishedAt: 1700000180000, sourcePhysical: 'bond_v1', destPhysical: 'bond_v2',
  sourceDocCount: 1000, destDocCount: 1000, currentTaskId: null, error: null,
  tookMs: 180000,
  rounds: [
    { round: 0, phase: 'FULL', total: 1000, created: 1000, updated: 0, versionConflicts: 0, roundTookMs: 120000 },
    { round: 1, phase: 'CATCHUP', total: 5, created: 3, updated: 2, versionConflicts: 0, roundTookMs: 30000 },
  ],
  report: {
    reconcile: { status: 'MATCH', sourceCount: 1000, destCount: 1000, gap: 0, message: '对账一致：目标与源均为 1000 条' },
    hint: '增量策略已自动追平',
  },
};

async function mountAR(job: any) {
  jobsFn.mockResolvedValue([job]);
  statusFn.mockResolvedValue(job);
  eventsFn.mockResolvedValue({ jobId: job.jobId, events: [] });
  prepareFn.mockResolvedValue({
    index: 'bond_index', isAlias: true, physicals: ['bond_v1'], sourcePhysical: 'bond_v1',
    docCount: 1000, settingsJson: '{"index":{}}', mappingJson: '{"properties":{}}',
    suggestedDest: 'bond_v2', timeFieldCandidates: [{ field: 'ts', type: 'date' }],
  });
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
  const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
  const row = rows.find(tr => (tr.textContent || '').includes(job.jobId));
  expect(row, '作业行必须先渲染').toBeTruthy();
  (row!.querySelector('button[title="查看任务详情"]') as HTMLButtonElement).click();
  await settle(10);
  return host;
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  copyTextFn.mockReset().mockResolvedValue(true);
  downloadTextFn.mockReset();
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('导出快照：JSON 下载 + Markdown 工单贴片', () => {
  it('终态作业两钮在场', { timeout: 20000 }, async () => {
    const host = await mountAR(OK_JOB);
    expect(host.querySelector('[data-test="ar-export-json"]'), '导出 JSON 钮').toBeTruthy();
    expect(host.querySelector('[data-test="ar-export-md"]'), '复制 Markdown 钮').toBeTruthy();
  });

  it('RUNNING 作业：导出/以此参数新建不渲染（不导出半程状态冒充结论）', { timeout: 20000 }, async () => {
    const host = await mountAR({ ...OK_JOB, jobId: 'run-1', status: 'RUNNING', stage: 'FULL_REINDEX', finishedAt: null });
    expect(host.querySelector('[data-test="ar-export-json"]'), 'RUNNING 不出导出').toBeNull();
    expect(host.querySelector('[data-test="ar-export-md"]'), 'RUNNING 不出复制').toBeNull();
    expect(host.querySelector('[data-test="ar-reuse-params"]'), 'RUNNING 不出以此参数新建').toBeNull();
  });

  it('导出 JSON：downloadText 收 jobId 命名 + 完整快照 JSON', { timeout: 20000 }, async () => {
    const host = await mountAR(OK_JOB);
    (host.querySelector<HTMLButtonElement>('[data-test="ar-export-json"]'))!.click();
    await settle(6);
    expect(downloadTextFn).toHaveBeenCalledTimes(1);
    const [name, content, mime] = downloadTextFn.mock.calls[0];
    expect(name).toBe('adhoc-exp-1-snapshot.json');
    expect(mime).toBe('application/json');
    const parsed = JSON.parse(content);
    expect(parsed.jobId).toBe('exp-1');
    expect(parsed.report.reconcile.status).toBe('MATCH');
  });

  it('复制 Markdown：matrixText 表风格（表头竖线分隔）+ 轮次明细 + 对账结论段', { timeout: 20000 }, async () => {
    const host = await mountAR(OK_JOB);
    (host.querySelector<HTMLButtonElement>('[data-test="ar-export-md"]'))!.click();
    await settle(6);
    expect(copyTextFn).toHaveBeenCalledTimes(1);
    const md = String(copyTextFn.mock.calls[0][0]);
    expect(md).toContain('## 托管重建作业快照 exp-1');
    /* matrixText MD 形态：| 分隔的表头行含关键字段 */
    expect(md).toContain('| jobId |');
    expect(md).toContain('| exp-1 |');
    expect(md).toContain('bond_index');
    expect(md).toContain('### 轮次明细');
    expect(md).toContain('| round |');
    expect(md).toContain('| FULL |');
    expect(md).toContain('### 文档数对账');
    expect(md).toContain('对账一致：目标与源均为 1000 条');
  });

  it('以此参数新建：回填向导（源/策略/参数）并回到向导首步，重新探测预填', { timeout: 20000 }, async () => {
    const host = await mountAR(OK_JOB);
    (host.querySelector<HTMLButtonElement>('[data-test="ar-reuse-params"]'))!.click();
    await settle(10);
    /* 回到向导首步：选索引步在场、监控步退场（重跑钮/收尾报告是监控步特征） */
    expect(host.textContent).toContain('选择要重建的逻辑索引名');
    expect(host.querySelector('[data-test="adhoc-retry"]'), '监控步重跑钮退场').toBeNull();
    expect(host.textContent).not.toContain('收尾报告');
    /* 源索引回填 + 自动重探（settings/mapping 不随作业持久化，由探测预填）；
       探测成功的 probe 结果卡在向导首步在场（预期形态，非监控卡） */
    expect(prepareFn).toHaveBeenCalledWith('bond_index');
    expect(host.querySelector('.probe')).toBeTruthy();
  });
});
