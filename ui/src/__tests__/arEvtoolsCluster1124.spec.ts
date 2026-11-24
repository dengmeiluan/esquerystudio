/**
 * 托管重建监控增强（对齐 Xmigrate 事件三件 + 失败聚类）：
 *
 *  · 事件时间线：关键字搜索（TextInput，与档位芯片 AND 叠加，命中面=detail+stage）、
 *    JSONL 导出（当前筛选后事件集，文件名含 jobId，每行 {ts,stage,status,detail}；
 *    空命中导出报真不落文件）、单事件行点击钻取（完整时间戳/枚举/detail 全文+复制）；
 *  · 失败样本聚类：type+reason 首行归一为聚类键，「N 类 · top3」胶囊摘要 +
 *    点开分组明细（每组计数+占比+首条完整样本）；单一类不出聚类（逐条即全貌）；
 *    既有逐条样本列表保留在下方。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const statusFn = vi.fn();
const jobsFn = vi.fn();
const eventsFn = vi.fn();
const dlCalls: { name: string; body: string; mime: string }[] = [];
const copyCalls: string[] = [];

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
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return {
    ...actual,
    downloadText: (name: string, body: string, mime?: string) => { dlCalls.push({ name, body, mime: mime || '' }); },
    copyText: async (t: string) => { copyCalls.push(t); return true; },
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

const DONE_JOB = {
  jobId: 'ev-1', logicalName: 'bond_index', aliasMode: true, strategy: 'INCREMENTAL',
  timeField: 'ts', status: 'SUCCEEDED', stage: 'DONE', startedAt: 1700000000000,
  finishedAt: 1700000180000, sourcePhysical: 'bond_v1', destPhysical: 'bond_v2',
  currentTaskId: null, error: null,
};

/* 混合事件集（ts 升序，共 8 条）：过程 2 + 门禁 3 + 错误 2 + 终态 1 */
const EVENTS_EV1 = { events: [
  { ts: 1700000000000, stage: 'CREATE_DEST', status: 'STARTED', detail: '作业创建' },
  { ts: 1700000020000, stage: 'AWAIT_CONFIRM', status: 'GATE_OPEN', detail: '切换前确认门开启' },
  { ts: 1700000040000, stage: 'AWAIT_CONFIRM', status: 'GATE_CONFIRMED', detail: '确认门结果：confirmed' },
  { ts: 1700000060000, stage: 'FULL_REINDEX', status: 'FAILED', detail: '轮内 task 失败' },
  { ts: 1700000080000, stage: 'CATCHUP', status: 'ABORTED', detail: '人工中止' },
  { ts: 1700000100000, stage: 'AWAIT_CONFIRM', status: 'LOCK_LOST', detail: '失去重建锁' },
  { ts: 1700000140000, stage: 'DONE', status: 'SUCCEEDED', detail: '重建完成' },
  { ts: 1700000180000, stage: 'DONE', status: 'DONE', detail: '收尾完成' },
] };

async function mountAR(jobOrJobs: any, eventsByJob: Record<string, any> = {}) {
  const jobs = Array.isArray(jobOrJobs) ? jobOrJobs : [jobOrJobs];
  jobsFn.mockResolvedValue(jobs);
  statusFn.mockImplementation(async (id: string) => jobs.find(j => j.jobId === id) ?? jobs[0]);
  eventsFn.mockImplementation(async (id: string) => eventsByJob[id] ?? { events: [] });
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
  const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
  const row = rows.find(tr => (tr.textContent || '').includes(jobs[0].jobId));
  (row!.querySelector('button[aria-label="查看任务详情"]') as HTMLButtonElement).click();
  await settle(10);
  return host;
}

const evRows = (host: HTMLElement) =>
  [...host.querySelectorAll('[data-test^="ar-ev-"]')].filter(el => el.classList.contains('ar-ev'));

/** 关键字输入（TextInput $attrs 透传——data-test 落在内层原生 input 上，v-model 走 input 事件） */
async function typeKw(host: HTMLElement, kw: string) {
  const inp = host.querySelector<HTMLInputElement>('[data-test="ar-evt-kw"]')!;
  inp.value = kw;
  inp.dispatchEvent(new Event('input'));
  await settle(6);
}

const setupOf = (host: HTMLElement) => (host.querySelector('.ahr') as any).__vueParentComponent.setupState;

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  dlCalls.length = 0;
  copyCalls.length = 0;
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('事件时间线：关键字搜索（与档位芯片 AND 叠加）', () => {
  it('搜索框在场；按 detail 关键字收窄行集；清空恢复', { timeout: 20000 }, async () => {
    const host = await mountAR(DONE_JOB, { 'ev-1': EVENTS_EV1 });
    expect(host.querySelector('[data-test="ar-evt-kw"]'), '搜索输入在场').toBeTruthy();
    expect(evRows(host).length, '全部档 8 条').toBe(8);
    await typeKw(host, '确认门');
    let rows = evRows(host);
    expect(rows.length, '「确认门」命中 2 条').toBe(2);
    expect(rows.map(r => r.textContent).join('\n')).toContain('切换前确认门开启');
    await typeKw(host, '');
    expect(evRows(host).length, '清空恢复 8 条').toBe(8);
  });

  it('按 stage 枚举也可命中（命中面=detail+stage）', { timeout: 20000 }, async () => {
    const host = await mountAR(DONE_JOB, { 'ev-1': EVENTS_EV1 });
    await typeKw(host, 'catchup');
    const rows = evRows(host);
    expect(rows.length, 'stage=CATCHUP 命中 1 条（大小写不敏感）').toBe(1);
    expect(rows[0].textContent).toContain('人工中止');
  });

  it('与档位芯片 AND 叠加：门禁档 3 条再叠「confirmed」只剩 1 条', { timeout: 20000 }, async () => {
    const host = await mountAR(DONE_JOB, { 'ev-1': EVENTS_EV1 });
    (host.querySelector<HTMLButtonElement>('[data-test="ar-evt-filter-gate"]'))!.click();
    await settle(4);
    expect(evRows(host).length, '门禁档 3 条').toBe(3);
    await typeKw(host, 'confirmed');
    expect(evRows(host).length, 'AND 叠加后 1 条').toBe(1);
  });

  it('搜索空命中：「当前筛选无命中事件」空态', { timeout: 20000 }, async () => {
    const host = await mountAR(DONE_JOB, { 'ev-1': EVENTS_EV1 });
    await typeKw(host, '不存在的关键字');
    expect(evRows(host).length).toBe(0);
    const empty = host.querySelector('[data-test="ar-events-empty"]');
    expect(empty?.textContent).toContain('当前筛选无命中事件');
  });
});

describe('事件时间线：JSONL 导出', () => {
  it('导出当前筛选后事件集：文件名含 jobId，每行 {ts,stage,status,detail}', { timeout: 20000 }, async () => {
    const host = await mountAR(DONE_JOB, { 'ev-1': EVENTS_EV1 });
    (host.querySelector<HTMLButtonElement>('[data-test="ar-evt-export"]'))!.click();
    await settle(4);
    expect(dlCalls).toHaveLength(1);
    expect(dlCalls[0].name).toBe('ar-events-ev-1.jsonl');
    expect(dlCalls[0].mime).toBe('application/x-ndjson');
    const lines = dlCalls[0].body.split('\n');
    expect(lines.length, '全部档导出 8 行').toBe(8);
    const first = JSON.parse(lines[0]);
    expect(first).toEqual({ ts: 1700000000000, stage: 'CREATE_DEST', status: 'STARTED', detail: '作业创建' });
  });

  it('导出随筛选走：错误档只导 3 行', { timeout: 20000 }, async () => {
    const host = await mountAR(DONE_JOB, { 'ev-1': EVENTS_EV1 });
    (host.querySelector<HTMLButtonElement>('[data-test="ar-evt-filter-error"]'))!.click();
    await settle(4);
    (host.querySelector<HTMLButtonElement>('[data-test="ar-evt-export"]'))!.click();
    await settle(4);
    expect(dlCalls[0].body.split('\n').length, '错误档 3 行').toBe(3);
  });

  it('空命中导出报真：不落文件', { timeout: 20000 }, async () => {
    const host = await mountAR(DONE_JOB, { 'ev-1': EVENTS_EV1 });
    await typeKw(host, '不存在的关键字');
    (host.querySelector<HTMLButtonElement>('[data-test="ar-evt-export"]'))!.click();
    await settle(4);
    expect(dlCalls, '空集不导出').toHaveLength(0);
  });
});

describe('事件时间线：单事件钻取', () => {
  it('行点击展开：完整时间戳 + stage/status 枚举 + detail 全文 + 复制钮；再点收起', { timeout: 20000 }, async () => {
    const host = await mountAR(DONE_JOB, { 'ev-1': EVENTS_EV1 });
    const row = host.querySelector<HTMLElement>('[data-test="ar-ev-0"]')!;
    expect(row.getAttribute('aria-expanded')).toBe('false');
    row.click();
    await settle(4);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    const detail = host.querySelector('[data-test="ar-evt-detail"]')!;
    expect(detail, '钻取展开区在场').toBeTruthy();
    expect(detail.textContent).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/); /* fmtTime 完整时间戳 */
    expect(detail.textContent).toContain('stage=CREATE_DEST');
    expect(detail.textContent).toContain('status=STARTED');
    expect(detail.textContent).toContain('作业创建');
    expect(detail.querySelector('[data-test="ar-evt-copy"]'), '复制钮在场').toBeTruthy();
    row.click();
    await settle(4);
    expect(host.querySelector('[data-test="ar-evt-detail"]'), '再点收起').toBeNull();
  });

  it('同时只开一行：点第二行时第一行收起', { timeout: 20000 }, async () => {
    const host = await mountAR(DONE_JOB, { 'ev-1': EVENTS_EV1 });
    (host.querySelector<HTMLElement>('[data-test="ar-ev-0"]'))!.click();
    await settle(4);
    (host.querySelector<HTMLElement>('[data-test="ar-ev-1"]'))!.click();
    await settle(4);
    expect(host.querySelector<HTMLElement>('[data-test="ar-ev-0"]')!.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector<HTMLElement>('[data-test="ar-ev-1"]')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('复制钮：copyText 收到该事件 detail 全文', { timeout: 20000 }, async () => {
    const host = await mountAR(DONE_JOB, { 'ev-1': EVENTS_EV1 });
    (host.querySelector<HTMLElement>('[data-test="ar-ev-0"]'))!.click();
    await settle(4);
    (host.querySelector<HTMLButtonElement>('[data-test="ar-evt-copy"]'))!.click();
    await settle(4);
    expect(copyCalls).toContain('作业创建');
  });

  it('换监控目标：关键字与展开态复位（旧词不带入新事件集）', { timeout: 20000 }, async () => {
    const other = { ...DONE_JOB, jobId: 'ev-2' };
    const host = await mountAR([DONE_JOB, other], { 'ev-1': EVENTS_EV1, 'ev-2': EVENTS_EV1 });
    await typeKw(host, '确认门');
    expect(evRows(host).length).toBe(2);
    const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
    const row2 = rows.find(tr => (tr.textContent || '').includes('ev-2'))!;
    (row2.querySelector('button[aria-label="查看任务详情"]') as HTMLButtonElement).click();
    await settle(10);
    expect(setupOf(host).evKw, '换作业关键字复位').toBe('');
    expect(evRows(host).length, '复位后全量渲染').toBe(8);
  });
});

describe('失败样本：聚类 top-N', () => {
  /* 10 条样本三类：mapper 6（首行相同、第二行各异的归一验证）/ 冲突 3 / 超时 1 */
  const mkFailures = () => [
    { type: 'mapper_parsing_exception', reason: '字段解析失败\n  at reindex worker #1' },
    { type: 'mapper_parsing_exception', reason: '字段解析失败', index: 'bond_v2', id: 'doc-2' },
    { type: 'mapper_parsing_exception', reason: '字段解析失败\n  at reindex worker #3' },
    { type: 'mapper_parsing_exception', reason: '字段解析失败' },
    { type: 'mapper_parsing_exception', reason: '字段解析失败' },
    { type: 'mapper_parsing_exception', reason: '字段解析失败' },
    { type: 'version_conflict_engine_exception', reason: '版本冲突' },
    { type: 'version_conflict_engine_exception', reason: '版本冲突' },
    { type: 'version_conflict_engine_exception', reason: '版本冲突' },
    { type: 'es_timeout', reason: '请求超时' },
  ];
  const FAILED_JOB = {
    ...DONE_JOB, jobId: 'fc-1', status: 'FAILED', stage: 'DONE', error: 'reindex 失败',
    failures: mkFailures(),
  };

  it('摘要行：3 类 · top3 计数与占比（多行 reason 首行归一，第二行不拆类）', { timeout: 20000 }, async () => {
    const host = await mountAR(FAILED_JOB, { 'fc-1': { events: [] } });
    const sum = host.querySelector('[data-test="ar-fcluster-summary"]')!;
    expect(sum, '聚类摘要行在场').toBeTruthy();
    const text = sum.textContent || '';
    expect(text).toContain('3 类');
    expect(text).toContain('top3');
    expect(text).toContain('mapper_parsing_exception x6（60%）');
    expect(text).toContain('version_conflict_engine_exception x3（30%）');
    expect(text).toContain('es_timeout x1（10%）');
  });

  it('点开分组明细：每组计数+占比+首条完整样本（含多行 reason 第二行）', { timeout: 20000 }, async () => {
    const host = await mountAR(FAILED_JOB, { 'fc-1': { events: [] } });
    expect(host.querySelector('[data-test="ar-fcluster-detail"]'), '默认收起').toBeNull();
    (host.querySelector<HTMLButtonElement>('[data-test="ar-fcluster-summary"]'))!.click();
    await settle(4);
    const items = [...host.querySelectorAll('[data-test^="ar-fcluster-item-"]')];
    expect(items.length, '三类各一行').toBe(3);
    expect(items[0].textContent).toContain('[mapper_parsing_exception]');
    expect(items[0].textContent).toContain('x6（60%）');
    expect(items[0].textContent).toContain('at reindex worker #1'); /* 首条完整样本的第二行 */
    expect(items[1].textContent).toContain('x3（30%）');
    expect(items[2].textContent).toContain('x1（10%）');
    /* 既有逐条样本列表保留在下方（10 条，>=6 默认折叠只显前 5） */
    const samples = host.querySelector('[data-test="ar-failure-samples"]')!;
    expect(samples.textContent).toContain('失败文档样本（前 10 条）');
    expect(host.querySelector('[data-test="ar-failure-item-0"]')).toBeTruthy();
  });

  it('单一类不出聚类区（逐条即全貌）；样本缺席整块不渲染', { timeout: 20000 }, async () => {
    const single = { ...FAILED_JOB, failures: Array.from({ length: 3 }, () => ({ type: 'mapper_parsing_exception', reason: '字段解析失败' })) };
    const host = await mountAR(single, { 'fc-1': { events: [] } });
    expect(host.querySelector('[data-test="ar-fcluster"]'), '单类不出聚类').toBeNull();
    expect(host.querySelector('[data-test="ar-failure-item-0"]'), '逐条列表仍在').toBeTruthy();
    apps.pop()!.unmount();
    document.body.innerHTML = '';
    const none = { ...FAILED_JOB, failures: undefined };
    const h2 = await mountAR(none, { 'fc-1': { events: [] } });
    expect(h2.querySelector('[data-test="ar-failure-samples"]'), '无样本整块不渲染').toBeNull();
  });
});
