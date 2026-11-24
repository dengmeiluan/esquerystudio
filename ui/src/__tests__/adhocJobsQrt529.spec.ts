/**
 * 五百二十九批 W-B：AdhocRebuild 最近作业表换 QRT rows 型（525 W5 HealthReport/SqlBridge
 * 裸表换壳同判据）。524 批自有漏斗（kw 过滤/状态 pill 漏斗/TSV·MD 导出）与行为断言全数
 * 保留在 adhocJobsTable524（零删用例，结构锁同步更新映射），本文件锁换壳侧：
 * ① 源码锁：QRT 接线形态（storage-key/sortable/:rows=jobsMatrix + #cell-<col> 槽 +
 *    #row-actions），旧裸表不残留（换壳勿留双份）；
 * ② 五百二十八批形态同步更新不回退：状态 cell jobStatusZh 中文+英文小字（.ar-st-en）+
 *    锁安全徽标（switchedWithoutLock 红 / lockActive 黄 / gateOutcome 徽，后端 toMap
 *    对 jobs 列表行同样透出三字段，与监控步同语义）；
 * ③ 换壳白得能力在位：表头排序（aria-sort）/导出四格式工具行（CSV/MD/XLSX/PNG）/列选；
 * ④ 过滤空集 → QRT EmptyState 分档文案（旧 nomatch 行退役，真无作业整卡消隐不变）。
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

const monacoCaps: { props: any; emit: (e: string, v?: any) => void }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { monacoCaps.push({ props, emit }); return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const settle = async (n = 12) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountView(View: any) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(View) });
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

/* jobs 行带锁字段（后端 AdhocRebuildJob.toMap 行级透出 gateOutcome/lockActive/switchedWithoutLock） */
const JOBS = [
  { jobId: 'j-lost-1', logicalName: 'lost_idx', strategy: 'WRITE_BLOCK', status: 'SUCCEEDED', stage: 'DONE', startedAt: 1700000000000, switchedWithoutLock: true },
  { jobId: 'j-nolock-2', logicalName: 'nolock_idx', strategy: 'INCREMENTAL', status: 'RUNNING', stage: 'REINDEX', startedAt: 1700000001000, lockActive: false },
  { jobId: 'j-gate-3', logicalName: 'gate_idx', strategy: 'MANUAL', status: 'ABORTED', stage: 'AWAIT_CONFIRM', startedAt: 1700000002000, gateOutcome: 'TIMED_OUT' },
];
const jobsCard = (host: HTMLElement) =>
  /* 554 同步更新：.card 壳退役改 .ar-sec border-top 分节（定位语义=含作业表工具行的分节，不变） */
  [...host.querySelectorAll('.ar-sec')].find(c => c.querySelector('.ar-jobs-tools'))!;

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  monacoCaps.length = 0;
  mocks.adhocJobs.mockResolvedValue([]);
  mocks.adhocStatus.mockResolvedValue({});
});

/* ═══ ① 源码锁：QRT 接线形态（改模板/函数名必须在此同步更新） ═══ */
describe('529 W-B 源码锁：最近作业表 QRT rows 壳', () => {
  it('QRT 接线（rows 型+记忆维度+槽位）与旧裸表零残留', () => {
    const v = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');
    expect(v).toMatch(/<QueryResultTable :cols="JOB_COLS" :rows="jobsMatrix" sortable/);
    expect(v).toMatch(/storage-key="adhoc:jobs"/);
    expect(v).toMatch(/<template #cell-jobId="\{ row \}">/);
    expect(v).toMatch(/<template #cell-status="\{ row \}">/);
    expect(v).toMatch(/<template #cell-startedAt="\{ row \}">/);
    expect(v).toMatch(/<template #row-actions="\{ row \}">/);
    /* 换壳勿留双份：旧裸作业表/空态行不残留（.tbl 仍归轮次表与 cfgDiff 表所有；
       退役说明注释可提及字样，锁类定义/引用精确形态——w10 .val-sev 同口径） */
    expect(v).not.toMatch(/v-for="j in visibleJobs"/);
    expect(v).not.toContain('.ar-jobs-nomatch {');
    expect(v).not.toMatch(/class="[^"]*ar-jobs-nomatch/);
  });
});

/* ═══ ② 528 形态同步更新：状态 cell 中文+英文小字 + 锁安全徽标（挂载行为） ═══ */
describe('529 W-B 状态 cell：jobStatusZh 中文 + 锁安全徽标同步更新', () => {
  it('中文主体+英文小字（.ar-st-en）随 pill 漏斗同格渲染；三态锁徽标逐行对号', async () => {
    mocks.adhocJobs.mockResolvedValue(JOBS);
    const View = (await import('../views/AdhocRebuildView.vue')).default;
    const { app, host } = await mountView(View);
    const card = jobsCard(host);
    const rows = card.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
    /* 中文+英文小字（RUNNING → 运行中）。五百三十一批同步更新：手滚 pill 改用 StatusPill，
       .ar-st-en 锚类外挂于 pill 根（en 小字由组件 .sp-en 渲染），锚勿丢、断言同步更新为包含 */
    expect(rows[1].textContent).toContain('运行中');
    expect(rows[1].querySelector('.ar-st-en')!.textContent).toContain('RUNNING');
    /* 锁徽标三态：无锁切换（红）/锁保护未生效（黄，与前者互斥）/门结局徽标 */
    expect(rows[0].textContent).toContain('无锁切换');
    expect(rows[0].textContent).not.toContain('锁保护未生效');
    expect(rows[1].textContent).toContain('锁保护未生效');
    expect(rows[2].textContent).toContain('确认超时');
    app.unmount();
  });

  it('gateOutcome=ABORTED → 「门已中止」；无锁字段行零徽标（数据驱动，不误挂）', async () => {
    mocks.adhocJobs.mockResolvedValue([
      { jobId: 'j-a', logicalName: 'a', strategy: 'MANUAL', status: 'ABORTED', stage: 'ABORT', startedAt: 1700000000000, gateOutcome: 'ABORTED' },
      { jobId: 'j-b', logicalName: 'b', strategy: 'MANUAL', status: 'DONE', stage: 'DONE', startedAt: 1700000001000 },
    ]);
    const View = (await import('../views/AdhocRebuildView.vue')).default;
    const { app, host } = await mountView(View);
    const rows = jobsCard(host).querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('门已中止');
    expect(rows[1].textContent).not.toContain('无锁切换');
    expect(rows[1].textContent).not.toContain('锁保护未生效');
    expect(rows[1].textContent).not.toContain('确认超时');
    app.unmount();
  });
});

/* ═══ ③ 换壳白得能力在位：排序/导出四格式工具行/列选 ═══ */
describe('529 W-B QRT 内核能力：排序+导出四格式+列选', () => {
  it('jobId 列头点击排序（aria-sort 出现，行序按 jobId 升序）；工具行 CSV/MD/XLSX/PNG/列选在场', async () => {
    mocks.adhocJobs.mockResolvedValue([
      { jobId: 'j-c', logicalName: 'c', strategy: 'MANUAL', status: 'DONE', stage: 'DONE', startedAt: 1700000002000 },
      { jobId: 'j-a', logicalName: 'a', strategy: 'MANUAL', status: 'DONE', stage: 'DONE', startedAt: 1700000000000 },
      { jobId: 'j-b', logicalName: 'b', strategy: 'MANUAL', status: 'DONE', stage: 'DONE', startedAt: 1700000001000 },
    ]);
    const View = (await import('../views/AdhocRebuildView.vue')).default;
    const { app, host } = await mountView(View);
    const card = jobsCard(host);
    const tbl = card.querySelector('table.qrt-tbl')!;
    expect(tbl, '作业表已换 QRT 内核表').toBeTruthy();
    /* 排序白得：点 jobId 列头 → 升序起步（227 批 M2 同向），aria-sort 可达 */
    (tbl.querySelector('th[data-col="jobId"]') as HTMLElement).click();
    await settle(4);
    const firstCell = tbl.querySelector('tbody tr td:nth-child(2)')!;
    expect(firstCell.textContent).toBe('j-a');
    expect(tbl.querySelector('th[data-col="jobId"]')!.getAttribute('aria-sort')).toBe('ascending');
    /* 导出四格式 + 列选（525 批五钮 → 835 批「导出 ▾」聚合菜单：开菜单验四格式项在场）
       1345：导出钮 aria 升级为「导出当前视图（N 行，格式…）」，按前缀找钮。 */
    ([...card.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').startsWith('导出')) as HTMLElement).click();
    await settle(2);
    for (const label of ['CSV', 'MD', 'XLSX', 'PNG']) {
      expect([...card.querySelectorAll('button')].some(bb => bb.textContent?.includes(label)), `导出 ${label} 项在场`).toBe(true);
    }
    expect(card.querySelector('.qrt-bar .col-picker, .qrt-bar [class*="picker"], .qrt-bar button[aria-label*="列"]') ?? null, '列选入口在场').not.toBeNull();
    app.unmount();
  });
});

/* ═══ ④ 过滤空集 → EmptyState 分档（旧 nomatch 行退役） ═══ */
describe('529 W-B 过滤空集分档', () => {
  it('kw 过滤无命中 → QRT EmptyState「无匹配作业（过滤生效中）」；清除后行集恢复', async () => {
    mocks.adhocJobs.mockResolvedValue([
      { jobId: 'j-a', logicalName: 'a_idx', strategy: 'MANUAL', status: 'DONE', stage: 'DONE', startedAt: 1700000000000 },
    ]);
    const View = (await import('../views/AdhocRebuildView.vue')).default;
    const { app, host } = await mountView(View);
    const card = jobsCard(host);
    const kw = card.querySelector<HTMLInputElement>('.ar-jobs-kw')!;
    kw.value = '不存在的作业';
    kw.dispatchEvent(new Event('input'));
    await settle(4);
    expect(card.textContent).toContain('无匹配作业（过滤生效中）');
    expect(card.textContent).toContain('清除过滤');
    /* 清除过滤 → 行集恢复（EmptyState 让位数据行） */
    (card.querySelector<HTMLButtonElement>('.ar-jobs-tools button')!).click();
    await settle(4);
    expect(card.querySelectorAll('tbody tr').length).toBe(1);
    app.unmount();
  });
});
