/**
 * 托管重建监控：速率趋势 SparkLine 接线 + 环形窗（2026-11-22 能力栈批）。
 *
 *  · 差分速率（reindexRate 既有件）成功的拍推速率环形窗（cap 60，XmigrateView
 *    XM_RATE_CAP 同口径：平段拍不推点，jobId 换即清窗）；
 *  · 速率观测行旁 SparkLine 消费该序列（≥2 个有效采样才绘，XmigrateView :520-525
 *    同形态 w=96/h=16），Tip「速率趋势 docs/s」承载悬浮说明；
 *  · 源码锁：SparkLine 接线在场 + 手搓 linear-gradient 进度条不回潮（ProgressTrack 统一件承接）。
 * 行为走真挂载（arRetryOverride1121 同款基建）：多次点 Eye 重拉 status 制造
 * created 递增的多拍采样驱动差分 watch。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const runningJob = (over: Record<string, any> = {}) => ({
  jobId: 'rs-1', logicalName: 'bond_index', aliasMode: true, strategy: 'INCREMENTAL',
  timeField: 'ts', status: 'RUNNING', stage: 'FULL_REINDEX', startedAt: 1700000000000,
  finishedAt: null, sourcePhysical: 'bond_v1', destPhysical: 'bond_v2', error: null,
  currentTaskId: null, currentProgress: { total: 1000, created: 0 },
  ...over,
});

async function mountAR(jobs: any[]) {
  jobsFn.mockResolvedValue(jobs);
  statusFn.mockResolvedValue(jobs[0] ?? null);
  eventsFn.mockResolvedValue({ events: [] });
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
  return host;
}

/** 从最近作业表行点 Eye 进监控（每次点击都重拉 status——制造差分采样拍） */
async function eyeJob(host: HTMLElement, jobId: string) {
  const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
  const row = rows.find(tr => (tr.textContent || '').includes(jobId));
  expect(row, `作业行必须渲染：${jobId}`).toBeTruthy();
  (row!.querySelector('button[title="查看任务详情"]') as HTMLButtonElement).click();
  await settle(10);
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('源码锁：SparkLine 接线 + 环形窗口径', () => {
  const src = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');

  it('SparkLine 消费差分速率环形窗（cap 60 对齐 XM_RATE_CAP 口径）', () => {
    expect(src).toContain("import SparkLine from '../components/SparkLine.vue'");
    expect(src).toContain('const RATE_SPARK_CAP = 60;');
    /* 环形窗：差分成功的拍 push（slice 保窗），平段拍不推点 */
    expect(src).toContain('rateSpark.value = [...rateSpark.value.slice(-(RATE_SPARK_CAP - 1)), reindexRate.value];');
    /* jobId 换即清窗（换作业不串差） */
    expect(src).toMatch(/jid !== rateJid[\s\S]{0,200}rateSpark\.value = \[\]/);
  });

  it('速率趋势挂 Tip「速率趋势 docs/s」（悬浮说明统一件承载，不超 60 字符原生 title）', () => {
    expect(src).toContain('速率趋势 docs/s');
    expect(src).toMatch(/<Tip v-if="rateSpark\.length >= 2"[^>]*class="ar-rate-spark">/);
    expect(src).toMatch(/<SparkLine :data="rateSpark" :w="96" :h="16" \/>/);
  });

  it('手搓 linear-gradient 进度条退役——ProgressTrack 统一件承接（旧形态不回潮）', () => {
    expect(src).toContain("import ProgressTrack from '../components/ProgressTrack.vue'");
    expect(src, '旧手搓渐变条不得回潮').not.toContain("linear-gradient(90deg, var(--ok), var(--warn))");
    expect(src).toMatch(/<ProgressTrack class="ar-reindex-track"/);
  });

  it('fmtHms/fmtMs 本地实现退役——utils/format 单源 import', () => {
    expect(src).toContain("fmtHms, fmtMs, dayLabel } from '../utils/format'");
    expect(src, '本地 fmtHms 不得回潮').not.toMatch(/function fmtHms/);
    expect(src, '本地 fmtMs 不得回潮').not.toMatch(/function fmtMs/);
  });
});

describe('行为：差分多拍 → SparkLine 绘制；换作业 → 清窗', () => {
  it('三拍 created 递增 → 趋势线在场（polyline ≥2 点）；单拍/平段不绘', { timeout: 20000 }, async () => {
    const host = await mountAR([runningJob()]);
    /* 第一拍（挂载后 Eye 进监控，status 默认回包 created=0）：仅建档 */
    await eyeJob(host, 'rs-1');
    const rateRow = () => host.querySelector('[data-test="adhoc-rate"]')!;
    expect(rateRow(), '速率观测行在场（currentProgress 在）').toBeTruthy();
    expect(rateRow().querySelector('svg.spark'), '首拍仅建档，趋势线不绘').toBeNull();

    /* 第二拍：created 0→500（差分成功，窗 1 点——仍不绘） */
    statusFn.mockResolvedValueOnce(runningJob({ currentProgress: { total: 1000, created: 500 } }));
    await eyeJob(host, 'rs-1');
    expect(rateRow().querySelector('svg.spark'), '单点不成趋势').toBeNull();

    /* 第三拍：created 500→900（窗 2 点——绘制） */
    statusFn.mockResolvedValueOnce(runningJob({ currentProgress: { total: 1000, created: 900 } }));
    await eyeJob(host, 'rs-1');
    const svg = rateRow().querySelector('svg.spark');
    expect(svg, '≥2 个有效采样绘制趋势线').toBeTruthy();
    const pts = svg!.querySelector('polyline')!.getAttribute('points')!;
    expect(pts.trim().split(/\s+/).length, 'polyline 两点起步').toBeGreaterThanOrEqual(2);
  });

  it('平段拍（created 未推进）不推点；换 jobId 清窗', { timeout: 20000 }, async () => {
    const j1 = runningJob();
    const j2 = runningJob({ jobId: 'rs-2', currentProgress: { total: 2000, created: 700 } });
    const host = await mountAR([j1, j2]);
    /* j1 三拍成线：首拍建档（默认回包 created=0）→ 500 → 900 */
    await eyeJob(host, 'rs-1');
    statusFn.mockResolvedValueOnce(runningJob({ currentProgress: { total: 1000, created: 500 } }));
    await eyeJob(host, 'rs-1');
    statusFn.mockResolvedValueOnce(runningJob({ currentProgress: { total: 1000, created: 900 } }));
    await eyeJob(host, 'rs-1');
    expect(host.querySelector('[data-test="adhoc-rate"] svg.spark')).toBeTruthy();

    /* 平段拍：created 不变（900→900），差分 ≤0 不推点、速率置空——线保留（终态曲线语义同 Xmigrate） */
    statusFn.mockResolvedValueOnce(runningJob({ currentProgress: { total: 1000, created: 900 } }));
    await eyeJob(host, 'rs-1');
    expect(host.querySelector('[data-test="adhoc-rate"] svg.spark'), '平段拍不清既有曲线').toBeTruthy();

    /* 换监控目标 j2：窗即清，趋势线消失（不串上一作业曲线） */
    statusFn.mockResolvedValueOnce(j2);
    await eyeJob(host, 'rs-2');
    expect(host.querySelector('[data-test="adhoc-rate"] svg.spark'), '换作业清窗后不绘').toBeNull();
  });
});
