/**
 * 托管重建执行监控：事件时间线（api.adhoc.events 只读回放，服务端/浏览器同构）。
 *
 *   ① 打开监控（最近作业表 Eye 钮）→ 按 jobId 拉取 api.adhoc.events，竖向时间线渲染
 *     ts（HH:mm:ss）/ stage 徽标 / detail 文本；
 *   ② GATE_* 事件（确认门轨迹）琥珀行高亮 + y 档徽标；终态事件按状态色
 *     （SUCCEEDED→g / FAILED→r，statusTone 复用）；
 *   ③ events 空清单 → 「暂无事件记录」空态；
 *   ④ events 拉取失败 → 「事件读取失败：」诚实错误态（不冒充空态、不静默）。
 * 挂具范式同 adhocUpgrade 视图段（真挂载 + memory router + api 手控回包）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const TERMINAL_JOB = {
  jobId: 'ev-1', logicalName: 'bond_index', aliasMode: true, strategy: 'INCREMENTAL',
  timeField: 'ts', status: 'SUCCEEDED', stage: 'DONE', startedAt: 1700000000000,
  finishedAt: 1700000180000, sourcePhysical: 'bond_v1', destPhysical: 'bond_v2',
  currentTaskId: null, error: null,
};

const EVENTS = { jobId: 'ev-1', events: [
  { ts: 1700000000000, stage: 'CREATE_DEST', status: 'STARTED', detail: '作业创建（策略 INCREMENTAL）' },
  { ts: 1700000060000, stage: 'AWAIT_CONFIRM', status: 'GATE_OPEN', detail: '切换前确认门开启（30 分钟截止）' },
  { ts: 1700000120000, stage: 'AWAIT_CONFIRM', status: 'GATE_CONFIRMED', detail: '确认门结果：confirmed' },
  { ts: 1700000180000, stage: 'DONE', status: 'SUCCEEDED', detail: '作业收尾（SUCCEEDED）' },
] };

async function mountAR() {
  jobsFn.mockResolvedValue([TERMINAL_JOB]);
  statusFn.mockResolvedValue(TERMINAL_JOB);
  const View = AdhocRebuildView;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/adhoc-rebuild', component: { template: '<div/>' } },
      { path: '/search', component: { template: '<div/>' } },
      { path: '/indices', component: { template: '<div/>' } },
      { path: '/tasks', component: { template: '<div/>' } },
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

/** 最近作业表 Eye 钮进入执行监控步（真实用户路径，watchJob 链路） */
async function openMonitorStep(host: HTMLElement) {
  const row = [...host.querySelectorAll('table.qrt-tbl tbody tr')]
    .find(tr => (tr.textContent || '').includes('ev-1'))!;
  expect(row, '最近作业表必须渲染出该作业行').toBeTruthy();
  (row.querySelector('button[aria-label="查看任务详情"]') as HTMLButtonElement).click();
  await settle(10);
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  eventsFn.mockReset().mockResolvedValue(EVENTS);
});

describe('执行监控：事件时间线', () => {
  it('打开监控即按 jobId 拉取 events：时间线渲染 ts/stage 徽标/detail', async () => {
    const host = await mountAR();
    await openMonitorStep(host);
    expect(eventsFn).toHaveBeenCalledWith('ev-1');
    const area = host.querySelector('[data-test="ar-events"]')!;
    expect(area, '事件时间线区在场（轮次表旁）').toBeTruthy();
    const evs = [...area.querySelectorAll('[data-test^="ar-ev-"]')];
    expect(evs.length).toBe(4);
    /* ts HH:mm:ss 格式 + detail 全文 */
    expect(evs[0].textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(evs[0].textContent).toContain('作业创建（策略 INCREMENTAL）');
    expect(evs[1].textContent).toContain('切换前确认门开启');
    /* stage 徽标 pill 在场 */
    expect(evs[0].querySelector('.pill')!.textContent).toContain('CREATE_DEST');
  });

  it('GATE_* 事件琥珀行高亮 + y 档徽标；终态事件按状态色（SUCCEEDED→g）', async () => {
    const host = await mountAR();
    await openMonitorStep(host);
    const area = host.querySelector('[data-test="ar-events"]')!;
    const evs = [...area.querySelectorAll('[data-test^="ar-ev-"]')];
    expect(evs[1].classList, 'GATE_OPEN 行琥珀高亮').toContain('gate');
    expect(evs[2].classList, 'GATE_CONFIRMED 行琥珀高亮').toContain('gate');
    expect(evs[1].querySelector('.pill')!.classList).toContain('y');
    expect(evs[0].classList, '过程事件不高亮').not.toContain('gate');
    expect(evs[3].classList, '非 GATE 终态行不高亮（着色归徽标）').not.toContain('gate');
    expect(evs[3].querySelector('.pill')!.classList, 'SUCCEEDED 徽标绿色').toContain('g');
  });

  it('events 空清单：「暂无事件记录」空态', async () => {
    eventsFn.mockResolvedValue({ jobId: 'ev-1', events: [] });
    const host = await mountAR();
    await openMonitorStep(host);
    const area = host.querySelector('[data-test="ar-events"]')!;
    expect(area.textContent).toContain('暂无事件记录');
  });

  it('events 拉取失败：「事件读取失败」诚实错误态（不冒充空态）', async () => {
    eventsFn.mockRejectedValue(new Error('网络中断'));
    const host = await mountAR();
    await openMonitorStep(host);
    const area = host.querySelector('[data-test="ar-events"]')!;
    const err = area.querySelector('[data-test="ar-events-err"]')!;
    expect(err.getAttribute('role')).toBe('alert');
    expect(err.textContent).toContain('事件读取失败');
    expect(area.textContent, '错误态不得冒充空态文案').not.toContain('暂无事件记录');
  });
});
