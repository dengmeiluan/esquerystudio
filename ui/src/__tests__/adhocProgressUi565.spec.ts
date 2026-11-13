/* 五百六十五批轨5件②【Adhoc 进度三字段前端消费】看守。
 *
 * 配套 Java 件⑤：AdhocRebuildJob /status（与 /jobs 同一 toMap）追加顶层 total/created/updated
 * 三字段（ReindexProgress 单源，awaitTask 轮询刷新；旧后端无此三键）。前端消费落在监控步
 * 进度区行内小字「已写 x/y」：
 *  · status 带 total/created → 渲染进度文案（data-test="adhoc-docs-progress"）；
 *  · 字段缺省（旧后端 / 未进入 reindex 阶段）→ 整行不渲染 = 零增量向后兼容（不冒充）。
 * 行为走真挂载（adhocReattach548 同款基建：api.adhoc.jobs/status mock + Eye 钮进监控步）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  adhocJobs: vi.fn(),
  adhocStatus: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      keys: async () => [],
      clustersList: async () => [],
      clusterIndices: async () => [],
      overview: async () => ({}),
      clusterHealth: async () => ({}),
      adhoc: { ...orig.api.adhoc, jobs: mocks.adhocJobs, status: mocks.adhocStatus },
    },
  };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useAppStore } from '../stores/app';
import { ioRecorder } from '../api';
import AdhocRebuildView from '../views/AdhocRebuildView.vue';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const settle = async (n = 12) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp({ render: () => h(AdhocRebuildView) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, store: useAppStore(pinia) };
}

const RUNNING_JOB = { jobId: 'j-docs-prog', logicalName: 'idx_a', strategy: 'MANUAL', status: 'RUNNING', stage: 'FULL_REINDEX', startedAt: Date.now() - 5000 };

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  ioRecorder.clear();
  mocks.adhocJobs.mockReset();
  mocks.adhocStatus.mockReset();
  mocks.adhocJobs.mockResolvedValue([]);
  mocks.adhocStatus.mockResolvedValue({});
});

describe('五百六十五批件②：/status 顶层进度三字段行内消费', () => {
  it('行为：status 带 total/created → 监控步渲染「已写 x/y」进度文案（data-test=adhoc-docs-progress）', async () => {
    mocks.adhocJobs.mockResolvedValue([RUNNING_JOB]);
    mocks.adhocStatus.mockResolvedValue({ ...RUNNING_JOB, total: 1000, created: 400, updated: 12 });
    const { app, host } = await mountView();
    (host.querySelector('button[aria-label="查看任务详情"]') as HTMLButtonElement).click();
    await settle();
    const row = host.querySelector('[data-test="adhoc-docs-progress"]');
    expect(row, '顶层进度行必须渲染').toBeTruthy();
    expect(row!.textContent).toContain('已写');
    expect(row!.textContent).toContain('400');
    expect(row!.textContent).toContain('1,000');
    app.unmount();
  });

  it('行为：字段缺省（旧后端）→ 整行不渲染（零增量向后兼容，不冒充 0）', async () => {
    mocks.adhocJobs.mockResolvedValue([RUNNING_JOB]);
    mocks.adhocStatus.mockResolvedValue({ ...RUNNING_JOB });
    const { app, host } = await mountView();
    (host.querySelector('button[aria-label="查看任务详情"]') as HTMLButtonElement).click();
    await settle();
    expect(host.textContent).not.toContain('已写');
    expect(host.querySelector('[data-test="adhoc-docs-progress"]'), '缺字段不得渲染进度行').toBeNull();
    app.unmount();
  });

  it('源码锚：进度行读顶层 job.total/job.created（不依赖 currentProgress 兼容路径）', () => {
    const v = read('../views/AdhocRebuildView.vue');
    expect(v).toContain('data-test="adhoc-docs-progress"');
    expect(v).toMatch(/v-if="job\.total != null && job\.created != null"/);
  });
});
