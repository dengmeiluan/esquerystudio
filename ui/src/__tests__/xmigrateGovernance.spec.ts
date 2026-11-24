/**
 * 跨集群迁移：作业历史治理（行级删除/批量清理）+ 详情弹窗目标对账（行为面）。
 *
 *   ① 行级删除——终态行（DONE/FAILED/ABORTED/INTERRUPTED）删除钮在场，askConfirm 带
 *     facts（jobId/状态/目标索引），确认后调 api.xb.deleteJob 并从本地列表移除该行；
 *     RUNNING 行不渲染删除入口（仅终态可删，与后端仅受理终态同口径）；
 *   ② 表头「清理 7 天前」——确认后调 api.xb.cleanupJobs(7)（对齐 adhoc 治理形态）；
 *   ③ 详情弹窗目标对账——diff≠0 红警示徽标+差值文案 / diff=0 绿「一致」徽标 /
 *     浏览器模式 501（BROWSER_MODE_UNMAPPED）如实呈现「浏览器模式暂不支持对账读取」，
 *     不静默降级不冒充空态；
 *   ④ 冲突 _id 样本折叠区——展开时调 api.xb.conflictsJob，截断展示 50 条 +「共 N 条」，
 *     空清单呈现「无版本冲突」。
 * 挂具范式同 xmigrateReplay1120（全真挂载 + api/confirm mock；详情 n-modal teleport 查 document）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const xbDeleteJob = vi.fn();
const xbCleanupJobs = vi.fn();
const xbReconcile = vi.fn();
const xbConflicts = vi.fn();
const askConfirmFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      keys: async () => [],
      clustersList: async () => [],
      clusterIndices: async () => [],
      overview: async () => ({}),
      clusterHealth: async () => ({}),
      xb: {
        ...actual.api.xb,
        jobs: (...a: any[]) => xbJobs(...a),
        destIndices: async () => [],
        deleteJob: (...a: any[]) => xbDeleteJob(...a),
        cleanupJobs: (...a: any[]) => xbCleanupJobs(...a),
        reconcileJob: (...a: any[]) => xbReconcile(...a),
        conflictsJob: (...a: any[]) => xbConflicts(...a),
      },
    },
  };
});
vi.mock('../composables/confirm', () => ({
  askConfirm: (...a: any[]) => askConfirmFn(...a),
}));

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountXm() {
  location.hash = '#/';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/xmigrate', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(XmigrateView as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

const apps: ReturnType<typeof createApp>[] = [];

const DONE_JOB = {
  jobId: 'j-done-1', status: 'DONE', destIndex: 'dest-a', sourceIndex: 'src-a',
  remoteEndpoint: 'http://old:9200', migrated: 100, total: 100, conflicts: 0, errors: 0,
  createTime: 1700000000000, srcConnId: 'conn-old',
};
const RUNNING_JOB = {
  jobId: 'j-run-1', status: 'RUNNING', destIndex: 'dest-b', sourceIndex: 'src-b',
  remoteEndpoint: 'http://old:9200', migrated: 10, total: 100, conflicts: 0, errors: 0,
  createTime: 1700000001000, srcConnId: 'conn-old',
};

function rowOf(host: HTMLElement, jobId: string): HTMLTableRowElement | undefined {
  return [...host.querySelectorAll('table.qrt-tbl tbody tr')]
    .find(tr => (tr.textContent || '').includes(jobId)) as HTMLTableRowElement | undefined;
}

async function openDetail(host: HTMLElement, jobId: string) {
  const row = rowOf(host, jobId)!;
  (row.querySelector('[aria-label^="作业详情"]') as HTMLButtonElement).click();
  await settle();
  return document.querySelector('[data-test="xm-detail"]') as HTMLElement;
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([DONE_JOB, RUNNING_JOB]);
  xbDeleteJob.mockReset().mockResolvedValue(undefined);
  xbCleanupJobs.mockReset().mockResolvedValue({ deleted: 3 });
  xbReconcile.mockReset().mockResolvedValue({ sourceCount: 100, destCount: 100, diff: 0 });
  xbConflicts.mockReset().mockResolvedValue([]);
  askConfirmFn.mockReset().mockResolvedValue(true);
  (Element.prototype as any).scrollIntoView = vi.fn();
});

/* ═══ ① 行级删除 ═══ */
describe('迁移作业治理：行级删除', () => {
  it('终态行删除钮在场：确认事实含 jobId/状态/目标索引，确认后调 deleteJob 并本地移除该行', async () => {
    const { app, host } = await mountXm();
    apps.push(app);
    expect(rowOf(host, 'j-done-1'), '终态行渲染').toBeTruthy();
    const del = rowOf(host, 'j-done-1')!.querySelector<HTMLButtonElement>('button[aria-label="删除记录"]')!;
    expect(del, '终态行删除钮在场').toBeTruthy();
    del.click();
    await settle();
    expect(xbDeleteJob).toHaveBeenCalledTimes(1);
    expect(xbDeleteJob).toHaveBeenCalledWith('j-done-1', 'conn-old');
    expect(rowOf(host, 'j-done-1'), '删除后本地列表移除该行').toBeUndefined();
    expect(rowOf(host, 'j-run-1'), '其余行不受影响').toBeTruthy();
    /* askConfirm 调用事实：facts 三项（jobId/状态/目标索引）齐备 */
    const arg = askConfirmFn.mock.calls[0][0] as any;
    const facts = Object.fromEntries((arg.facts || []).map((f: any) => [f.label, f.value]));
    expect(facts['jobId']).toBe('j-done-1');
    expect(facts['状态']).toContain('完成');
    expect(facts['目标索引']).toBe('dest-a');
  });

  it('RUNNING 行不渲染删除入口（仅终态可删）；确认取消不发删除请求', async () => {
    const { app, host } = await mountXm();
    apps.push(app);
    expect(rowOf(host, 'j-run-1')!.querySelector('button[aria-label="删除记录"]'), '进行中行无删除钮').toBeNull();
    askConfirmFn.mockResolvedValue(false);
    (rowOf(host, 'j-done-1')!.querySelector('button[aria-label="删除记录"]') as HTMLButtonElement).click();
    await settle();
    expect(xbDeleteJob, '确认取消不得发删除请求').not.toHaveBeenCalled();
    expect(rowOf(host, 'j-done-1'), '取消后行保留').toBeTruthy();
  });
});

/* ═══ ② 表头批量清理 ═══ */
describe('迁移作业治理：批量清理 7 天前', () => {
  it('表头清理钮：确认后调 cleanupJobs(7)（对齐 adhoc 治理档位形态）', async () => {
    const { app, host } = await mountXm();
    apps.push(app);
    const btn = host.querySelector<HTMLButtonElement>('[data-test="xm-cleanup"]')!;
    expect(btn, '表头清理钮在场').toBeTruthy();
    expect(btn.textContent).toContain('清理 7 天前');
    btn.click();
    await settle();
    expect(xbCleanupJobs).toHaveBeenCalledWith(7, undefined);
  });
});

/* ═══ ③ 详情弹窗目标对账 ═══ */
describe('详情弹窗：目标对账', () => {
  it('diff≠0：红警示徽标（差 N）+ 差值说明文案', async () => {
    xbReconcile.mockResolvedValue({ sourceCount: 1000, destCount: 997, diff: -3 });
    const { app, host } = await mountXm();
    apps.push(app);
    const dlg = await openDetail(host, 'j-done-1');
    (dlg.querySelector('[data-test="xm-reconcile-run"]') as HTMLButtonElement).click();
    await settle();
    expect(xbReconcile).toHaveBeenCalledWith('j-done-1', 'conn-old');
    const res = dlg.querySelector('[data-test="xm-reconcile-result"]')!;
    expect(res.querySelector('.pill.r')!.textContent).toContain('差 3');
    expect(res.textContent).toContain('目标与源文档数差');
  });

  it('diff=0：绿「一致」对齐徽标', async () => {
    xbReconcile.mockResolvedValue({ sourceCount: 500, destCount: 500, diff: 0 });
    const { app, host } = await mountXm();
    apps.push(app);
    const dlg = await openDetail(host, 'j-done-1');
    (dlg.querySelector('[data-test="xm-reconcile-run"]') as HTMLButtonElement).click();
    await settle();
    const res = dlg.querySelector('[data-test="xm-reconcile-result"]')!;
    expect(res.querySelector('.pill.g')!.textContent).toContain('一致');
  });

  it('diff=null（任一侧取数失败）：差值未知中性说明，不走红警示不冒充一致', async () => {
    xbReconcile.mockResolvedValue({ sourceCount: null, destCount: 990, diff: null });
    const { app, host } = await mountXm();
    apps.push(app);
    const dlg = await openDetail(host, 'j-done-1');
    (dlg.querySelector('[data-test="xm-reconcile-run"]') as HTMLButtonElement).click();
    await settle();
    const res = dlg.querySelector('[data-test="xm-reconcile-result"]')!;
    expect(res.textContent).toContain('差值未知');
    expect(res.querySelector('.pill.r'), '取数失败不得走红差警示').toBeNull();
    expect(res.querySelector('.pill.g'), '取数失败不得冒充一致').toBeNull();
  });

  it('对账取数失败：错误条如实透传原始信息（role=alert），不静默不冒充空态', async () => {
    xbReconcile.mockRejectedValue(Object.assign(new Error('浏览器模式暂未映射迁移端点：/jobs/j-done-1/reconcile'), { code: 'BROWSER_MODE_UNMAPPED' }));
    const { app, host } = await mountXm();
    apps.push(app);
    const dlg = await openDetail(host, 'j-done-1');
    (dlg.querySelector('[data-test="xm-reconcile-run"]') as HTMLButtonElement).click();
    await settle();
    const err = dlg.querySelector('[data-test="xm-reconcile-err"]')!;
    expect(err.getAttribute('role')).toBe('alert');
    expect(err.textContent).toContain('对账失败');
    expect(err.textContent).toContain('浏览器模式暂未映射迁移端点');
    expect(dlg.querySelector('[data-test="xm-reconcile-result"]'), '错误态不冒充结果').toBeNull();
  });
});

/* ═══ ④ 冲突 _id 样本折叠区（后端契约 {samples,total,truncated}） ═══ */
describe('详情弹窗：冲突 _id 样本折叠区', () => {
  it('展开时读取 conflictsJob：_id 逐条 + 截断 50 条 +「共 N 条」以全量计数为准', async () => {
    const samples = Array.from({ length: 62 }, (_, i) => 'doc-409-' + i);
    xbConflicts.mockResolvedValue({ jobId: 'j-done-1', samples, total: 80, truncated: true });
    const { app, host } = await mountXm();
    apps.push(app);
    const dlg = await openDetail(host, 'j-done-1');
    expect(xbConflicts, '未展开不读').not.toHaveBeenCalled();
    (dlg.querySelector('[data-test="xm-detail-reconcile"] .cp-toggle') as HTMLButtonElement).click();
    await settle();
    expect(xbConflicts).toHaveBeenCalledWith('j-done-1', 'conn-old');
    const sec = dlg.querySelector('[data-test="xm-detail-reconcile"]')!;
    const items = [...sec.querySelectorAll('.xm-detail-list li')];
    expect(items.length, '截断展示 50 条').toBe(50);
    expect(items[0].textContent).toContain('doc-409-0');
    expect(sec.textContent, '共 N 条以 total 全量计数为准').toContain('共 80 条');
    expect(sec.textContent, '环形截断说明在场').toContain('样本环形截断');
  });

  it('空清单且零冲突：「无版本冲突」空态', async () => {
    xbConflicts.mockResolvedValue({ jobId: 'j-done-1', samples: [], total: 0, truncated: false });
    const { app, host } = await mountXm();
    apps.push(app);
    const dlg = await openDetail(host, 'j-done-1');
    (dlg.querySelector('[data-test="xm-detail-reconcile"] .cp-toggle') as HTMLButtonElement).click();
    await settle();
    const sec = dlg.querySelector('[data-test="xm-detail-reconcile"]')!;
    expect(sec.textContent).toContain('无版本冲突');
  });
});
