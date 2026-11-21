/**
 * 托管重建收尾报告：终态文档数对账条（2026-11-21 对账批）。
 *
 * 后端在 FINALIZE 后把源/目标 _count 对账写进 report.reconcile（Controller 快照透出），
 * 收尾报告区按四态渲染：
 *  · MATCH → 绿 pill「对账一致」+ message；
 *  · GAP → 黄 pill「存在缺口」+ message 点名「目标文档数 X / 源 Y，缺口 Z」；
 *  · SOURCE_GONE → 灰 pill「源已不存在」+「无法对账」说明（不冒充成功也不误报）；
 *  · 字段缺席（旧后端）→ 对账行整行不渲染（向后兼容）。
 * 挂具范式同 adhocTuningForm1119（真挂载 + memory router + api 手控回包）。
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

/** SUCCEEDED 作业（report.reconcile 可覆写） */
const okJob = (reconcile: Record<string, any> | undefined, over: Record<string, any> = {}) => ({
  jobId: 'rec-1', logicalName: 'bond_index', aliasMode: true, strategy: 'INCREMENTAL',
  timeField: 'ts', status: 'SUCCEEDED', stage: 'DONE', startedAt: 1700000000000,
  finishedAt: 1700000180000, sourcePhysical: 'bond_v1', destPhysical: 'bond_v2',
  sourceDocCount: 1000, destDocCount: 940, currentTaskId: null, error: null,
  report: { ...(reconcile == null ? {} : { reconcile }), hint: '增量策略已自动追平' },
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
  /* 从最近作业表 Eye 钮进入执行监控步（真实用户路径） */
  const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
  const row = rows.find(tr => (tr.textContent || '').includes(job.jobId));
  expect(row, '最近作业表必须渲染出该作业行').toBeTruthy();
  (row!.querySelector('button[title="查看任务详情"]') as HTMLButtonElement).click();
  await settle(10);
  return host;
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

describe('收尾报告：终态文档数对账条', () => {
  it('MATCH：绿 pill「对账一致」+ 双侧计数说明', { timeout: 20000 }, async () => {
    const host = await mountAR(okJob({
      status: 'MATCH', sourceCount: 1000, destCount: 1000, gap: 0,
      message: '对账一致：目标与源均为 1000 条',
    }));
    const bar = host.querySelector('[data-test="ar-reconcile"]');
    expect(bar, '对账条在场（收尾报告区内）').toBeTruthy();
    const pill = bar!.querySelector('[data-test="ar-reconcile-MATCH"]');
    expect(pill, 'MATCH 档绿 pill').toBeTruthy();
    expect(pill!.textContent).toContain('对账一致');
    expect(pill!.className).toContain('g');
    expect(bar!.textContent).toContain('对账一致：目标与源均为 1000 条');
  });

  it('GAP：黄 pill「存在缺口」，message 点名「目标文档数 X / 源 Y，缺口 Z」', { timeout: 20000 }, async () => {
    const host = await mountAR(okJob({
      status: 'GAP', sourceCount: 1000, destCount: 940, gap: 60,
      message: '目标文档数 940 / 源 1000，缺口 60：重跑本作业可按 op_type 幂等补齐（已存在文档自动跳过/覆盖）',
    }));
    const bar = host.querySelector('[data-test="ar-reconcile"]')!;
    expect(bar, '对账条在场').toBeTruthy();
    const pill = bar.querySelector('[data-test="ar-reconcile-GAP"]');
    expect(pill, 'GAP 档黄 pill').toBeTruthy();
    expect(pill!.textContent).toContain('存在缺口');
    expect(pill!.className).toContain('y');
    expect(bar.textContent).toContain('目标文档数 940 / 源 1000，缺口 60');
    expect(bar.textContent).toContain('幂等补齐');
  });

  it('SOURCE_GONE：灰 pill「源已不存在」+ 无法对账说明（不冒充成功也不误报）', { timeout: 20000 }, async () => {
    const host = await mountAR(okJob({
      status: 'SOURCE_GONE',
      message: '源索引已不存在（已删除或直连切换清源），无法对账；目标侧计数见 destDocCount，请按业务查询入口验收',
    }));
    const bar = host.querySelector('[data-test="ar-reconcile"]')!;
    const pill = bar.querySelector('[data-test="ar-reconcile-SOURCE_GONE"]');
    expect(pill, 'SOURCE_GONE 档灰 pill').toBeTruthy();
    expect(pill!.textContent).toContain('源已不存在');
    expect(pill!.className).toContain('n');
    expect(bar.textContent).toContain('无法对账');
    expect(bar.textContent).not.toContain('缺口');
  });

  it('UNAVAILABLE：灰 pill「无法对账」+ 不作验收依据说明', { timeout: 20000 }, async () => {
    const host = await mountAR(okJob({
      status: 'UNAVAILABLE', sourceCount: 1000, destCount: null,
      message: '对账取数失败（源/目标 _count 不可得），本结论不作为验收依据；作业终态不受影响，可稍后在「完成校验」重试活取比对',
    }));
    const bar = host.querySelector('[data-test="ar-reconcile"]')!;
    const pill = bar.querySelector('[data-test="ar-reconcile-UNAVAILABLE"]');
    expect(pill, 'UNAVAILABLE 档灰 pill').toBeTruthy();
    expect(pill!.textContent).toContain('无法对账');
    expect(bar.textContent).toContain('不作为验收依据');
  });

  it('字段缺席（旧后端）：对账行整行不渲染（向后兼容）', { timeout: 20000 }, async () => {
    const host = await mountAR(okJob(undefined));
    expect(host.querySelector('[data-test="ar-reconcile"]'), '无 reconcile 键不渲染对账行').toBeNull();
    /* 收尾报告本体（hint）不受影响 */
    const report = host.querySelector('.report');
    expect(report).toBeTruthy();
    expect(report!.textContent).toContain('增量策略已自动追平');
  });
});
