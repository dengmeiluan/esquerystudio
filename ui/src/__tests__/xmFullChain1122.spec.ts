/**
 * 2026-11-22 批：单索引全链向导 + verify 落事件线 + 批量链补验证。
 *
 *   ① 步骤点亮——三步向导完成判定（已选源档案/源索引合法/目标索引合法）→ 编号挂 done；
 *   ② 全链 CTA——「继续迁移数据」自动触发 api.xb.preflight 并打开预检报告弹层；
 *   ③ 自动验证开关——「完成后自动等价验证」默认开（随表单草稿）；取消勾选后 DONE 不自动验证；
 *   ④ DONE 自动验证——启动时勾选的作业转 DONE 后自动调 verifyEquivalence 并开弹层；
 *     消费即清（后续刷新拍不重复发起，不与用户手动操作抢弹窗）；
 *   ⑤ verify 落事件线——服务端 /events 只读无写入口 → 降级 sessionStorage 会话稿：
 *     verify 完成后事件数组含 VERIFY 类事件（stage=VERIFY、verdict+计数摘要），
 *     时间线「门禁」档芯片可见、行带「本会话」来源标注；
 *   ⑥ 批量链补验证——finishBatch 后「全部等价验证」在场；点击对本批 DONE 作业逐个
 *     verify，汇总 verdict 矩阵（等价/有分歧计数）渲染。
 * 挂具范式同 xmigrateStructureSync（全真挂载 + api/confirm mock）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const xbDestIndices = vi.fn();
const xbSync = vi.fn();
const xbPreflight = vi.fn();
const xbStart = vi.fn();
const xbVerify = vi.fn();
const xbEvents = vi.fn();
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
        destIndices: (...a: any[]) => xbDestIndices(...a),
        syncStructure: (...a: any[]) => xbSync(...a),
        preflight: (...a: any[]) => xbPreflight(...a),
        start: (...a: any[]) => xbStart(...a),
        verifyEquivalence: (...a: any[]) => xbVerify(...a),
        events: (...a: any[]) => xbEvents(...a),
      },
    },
  };
});
vi.mock('../composables/confirm', () => ({
  askConfirm: (...a: any[]) => askConfirmFn(...a),
}));

const NOW = Date.now();
const BASE_JOB = {
  status: 'DONE', sourceIndex: 'prod-orders', destIndex: 'uat-orders',
  remoteEndpoint: 'http://old:9200', migrated: 100, total: 100, conflicts: 0, errors: 0,
  createTime: NOW - 60000, sliceStatus: {}, sliceMigrated: {}, sliceErrors: {},
};

/* 结构同步两段桩：dryRun 计划 → 执行报告（created） */
const FULL_PLAN = {
  created: false, dryRun: true, destIndex: 'uat-orders', rounds: 3,
  planned: {
    removedSettings: [{ key: 'index.apack.knn', reason: '目标集群无 apack 插件' }],
    removedAnalysis: [], downgradedFields: [],
  },
  reactive: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
  warnings: [],
};
const EXEC_REPORT = { ...FULL_PLAN, created: true, dryRun: false };

const VERIFY_OK = (index: string) => ({
  source: { index, count: 100 }, dest: { index: 'uat-' + index, count: 100 },
  countsMatch: true,
  sample: { requested: 100, checked: 100, matched: 100, missingInDest: [], mismatched: [] },
  verdict: 'EQUIVALENT', warnings: [],
});

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

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([]);
  xbDestIndices.mockReset().mockResolvedValue([]);
  xbSync.mockReset().mockResolvedValueOnce(FULL_PLAN).mockResolvedValue(EXEC_REPORT);
  xbPreflight.mockReset().mockResolvedValue({ sourceBytes: 123456, srcDocCount: 100, estSeconds: 30 });
  xbStart.mockReset().mockResolvedValue({ jobId: 'j-auto' });
  xbVerify.mockReset().mockResolvedValue(VERIFY_OK('prod-orders'));
  xbEvents.mockReset().mockResolvedValue({ events: [] });
  askConfirmFn.mockReset().mockResolvedValue(true);
  (Element.prototype as any).scrollIntoView = vi.fn();
});

/* ═══ ① 三步向导步骤点亮 ═══ */
describe('全链向导 ①：步骤点亮', () => {
  it('未完成无点亮；选档案+源/目标索引合法后三步全亮', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    const num = (n: number) => host.querySelector(`[data-test="xm-step${n}"]`)!;
    expect(num(1).className, '初始步骤 1 未完成').not.toContain('done');
    expect(num(2).className, '初始步骤 2 未完成').not.toContain('done');
    expect(num(3).className, '初始步骤 3 未完成').not.toContain('done');
    st.srcConnId = 'c1';
    st.form.sourceIndex = 'prod-orders';
    st.form.destIndex = 'uat-orders';
    await settle(2);
    expect(num(1).className, '选档案后步骤 1 点亮').toContain('done');
    expect(num(2).className, '源索引合法步骤 2 点亮').toContain('done');
    expect(num(3).className, '目标索引合法步骤 3 点亮').toContain('done');
    /* 非法目标名（大写）步骤 3 熄灭 */
    st.form.destIndex = 'UAT-Bad';
    await settle(2);
    expect(num(3).className, '非法目标名步骤 3 熄灭').not.toContain('done');
    app.unmount();
  }, 8000);
});

/* ═══ ② CTA 全链：sync 成功 → preflight 自动触发 ═══ */
describe('全链向导 ②：「继续迁移数据」自动预检', () => {
  it('sync 成功后点「继续迁移数据」→ 自动调 api.xb.preflight 并打开预检报告弹层', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    (host.querySelector('[data-test="xm-sync-btn"]') as HTMLButtonElement).click();
    await settle();
    (document.querySelector('[data-test="xm-sync-apply"]') as HTMLButtonElement).click();
    await settle();
    (host.querySelector('[data-test="xm-sync-continue"]') as HTMLButtonElement).click();
    await settle(4);
    expect(xbPreflight, 'preflight 自动触发').toHaveBeenCalledWith(
      { sourceIndex: 'prod-orders', destIndex: 'uat-orders' }, undefined);
    expect(st.form.destIndex, '目标回填').toBe('uat-orders');
    expect(document.querySelector('[data-test="xm-preflight"]'), '预检报告弹层在场').toBeTruthy();
    app.unmount();
  }, 8000);
});

/* ═══ ③ 自动验证开关（默认开/随草稿/关闭不自动） ═══ */
describe('全链向导 ③：「完成后自动等价验证」开关', () => {
  it('开关默认开（DOM 勾选态与表单态一致）；取消勾选后 DONE 不自动验证', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    const cb = host.querySelector('[data-test="xm-autoverify"]')!;
    expect(cb, '开关在场（启动钮旁）').toBeTruthy();
    expect(cb.className, '默认勾选').toContain('checked');
    expect(st.form.autoVerify).toBe(true);
    /* 取消勾选（表单态驱动，DOM 同步核验） */
    st.form.autoVerify = false;
    await settle(2);
    expect(cb.className, '取消后 DOM 勾选态退场').not.toContain('checked');
    /* 关闭态走完整链：启动 → 作业 DONE → 不自动 verify */
    st.form.sourceIndex = 'prod-orders';
    st.form.destIndex = 'uat-orders';
    await settle(2);
    await st.doStart();
    xbJobs.mockResolvedValue([{ ...BASE_JOB, jobId: 'j-auto' }]);
    await st.loadJobs();
    await settle(4);
    expect(xbVerify, '关闭时 DONE 不自动验证').not.toHaveBeenCalled();
    app.unmount();
  }, 10000);
});

/* ═══ ④ DONE 自动验证（消费即清，不抢用户操作） ═══ */
describe('全链向导 ④：DONE 后自动等价验证', () => {
  it('启动（开关开）→ RUNNING 拍不触发 → DONE 拍自动调 verify 并开弹层；后续拍不重复', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    st.form.destIndex = 'uat-orders';
    await settle(2);
    await st.doStart();
    expect(xbStart).toHaveBeenCalled();
    /* RUNNING 拍：不触发（作业未终态） */
    xbJobs.mockResolvedValue([{ ...BASE_JOB, jobId: 'j-auto', status: 'RUNNING' }]);
    await st.loadJobs();
    await settle(4);
    expect(xbVerify, 'RUNNING 拍不触发').not.toHaveBeenCalled();
    /* DONE 拍：自动验证 + 弹层展示结果 */
    xbJobs.mockResolvedValue([{ ...BASE_JOB, jobId: 'j-auto' }]);
    await st.loadJobs();
    await settle(6);
    expect(xbVerify, 'DONE 拍自动验证').toHaveBeenCalledWith({ jobId: 'j-auto', sampleSize: 100 }, undefined);
    expect(document.querySelector('[data-test="xm-verify"]'), '验证弹层自动打开').toBeTruthy();
    expect(document.querySelector('[data-test="xm-verify-verdict-EQUIVALENT"]'), 'verdict 徽标在场').toBeTruthy();
    /* 消费即清：后续刷新拍不重复发起 */
    await st.loadJobs();
    await settle(4);
    expect(xbVerify, '标记消费后不重复').toHaveBeenCalledTimes(1);
    app.unmount();
    void host;
  }, 12000);
});

/* ═══ ⑤ verify 结果落事件线（服务端无写入口 → sessionStorage 会话稿合并） ═══ */
describe('verify 落事件线 ⑤：VERIFY 事件写入与时间线呈现', () => {
  it('verify 完成后写会话稿（stage=VERIFY+verdict/计数摘要）；时间线门禁档可见+「本会话」标注', async () => {
    xbJobs.mockResolvedValue([{ ...BASE_JOB, jobId: 'j-vf' }]);
    const { app, host } = await mountXm();
    const st = stateOf(app);
    /* 行内等价验证：结论落定 */
    (host.querySelector('[data-test="xm-verify-btn"]') as HTMLButtonElement).click();
    await settle(6);
    const stored = JSON.parse(sessionStorage.getItem('xm-verify-events-v1') || '{}');
    const evs = stored['j-vf'] || [];
    expect(evs.length, '会话稿写入一条').toBe(1);
    expect(evs[0].stage, '事件类型 VERIFY').toBe('VERIFY');
    expect(evs[0].message, 'verdict+计数摘要').toContain('等价验证 等价（EQUIVALENT）');
    expect(evs[0].message).toContain('源 100 / 目标 100');
    /* 打开详情展开事件时间线：会话稿合并进事件数组（服务端 events 空） */
    (host.querySelector('[aria-label^="作业详情"]') as HTMLButtonElement).click();
    await settle();
    const sec = document.querySelector('[data-test="xm-detail-events"]') as HTMLElement;
    (sec.querySelector('.cp-toggle') as HTMLButtonElement).click();
    await settle(4);
    expect(st.detailEvents.length, '事件数组含 VERIFY 事件').toBeGreaterThanOrEqual(1);
    expect(st.detailEvents.some((e: any) => String(e.stage) === 'VERIFY'), 'VERIFY 类事件在数组').toBe(true);
    const line = sec.querySelector('[data-test="xm-events-line"]')!;
    expect(line.textContent).toContain('等价验证');
    expect(sec.querySelector('[data-test="xm-evt-filter-gate"]'), '门禁档芯片在场（VERIFY 归门禁）').toBeTruthy();
    expect(line.querySelector('[data-test="xm-evt-local"]'), '「本会话」来源标注在场').toBeTruthy();
    /* 点门禁档：VERIFY 行命中保留 */
    (sec.querySelector('[data-test="xm-evt-filter-gate"]') as HTMLButtonElement).click();
    await settle(2);
    expect(sec.querySelector('.xm-ev')!.textContent).toContain('等价验证');
    app.unmount();
  }, 12000);
});

/* ═══ ⑥ 批量链补验证：全部等价验证 ═══ */
describe('批量链 ⑥：全部等价验证', () => {
  it('finishBatch 后按钮在场；点击对本批 DONE 作业逐个 verify，汇总 verdict 矩阵渲染', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    /* 批量两对：prod-a/prod-b → uat_ 前缀映射 */
    st.batchMode = true;
    st.batchSel = ['prod-a', 'prod-b'];
    st.batchDstPrefix = 'uat_';
    await settle(2);
    await st.doBatchStart();
    await settle(4);
    expect(host.querySelector('[data-test="xm-batch-result"]'), '批量结果面板在场').toBeTruthy();
    const btn = host.querySelector<HTMLButtonElement>('[data-test="xm-batch-verify-btn"]')!;
    expect(btn, 'finishBatch 后「全部等价验证」在场').toBeTruthy();
    /* 作业表回填两个 DONE 作业（目标名命中映射集） */
    xbJobs.mockResolvedValue([
      { ...BASE_JOB, jobId: 'j-a', sourceIndex: 'prod-a', destIndex: 'uat_prod-a' },
      { ...BASE_JOB, jobId: 'j-b', sourceIndex: 'prod-b', destIndex: 'uat_prod-b' },
    ]);
    await st.loadJobs();
    await settle(2);
    /* 逐个 verify：j-a 等价 / j-b 分歧 */
    xbVerify.mockImplementation(async (req: any) => req.jobId === 'j-a'
      ? VERIFY_OK('prod-a')
      : { ...VERIFY_OK('prod-b'), verdict: 'DIVERGENT', countsMatch: false });
    btn.click();
    await settle(10);
    expect(xbVerify, '逐个调用两次').toHaveBeenCalledTimes(2);
    expect(xbVerify).toHaveBeenCalledWith({ jobId: 'j-a', sampleSize: 100 }, undefined);
    expect(xbVerify).toHaveBeenCalledWith({ jobId: 'j-b', sampleSize: 100 }, undefined);
    const panel = host.querySelector('[data-test="xm-batch-verify"]')!;
    expect(panel.textContent, '汇总计数渲染').toContain('已验证 2/2');
    expect(panel.textContent).toContain('等价 1');
    expect(panel.textContent).toContain('有分歧 1');
    expect(panel.textContent).toContain('uat_prod-a');
    expect(panel.textContent).toContain('uat_prod-b');
    /* 分歧行标红 + 查看入口在场（复用等价验证弹层） */
    const rows = [...panel.querySelectorAll('li')];
    expect(rows.find(r => r.textContent!.includes('uat_prod-b'))!.className).toContain('xm-batch-row-fail');
    expect(panel.querySelector('[data-test="xm-batch-verify-view"]'), '明细查看入口').toBeTruthy();
    app.unmount();
  }, 14000);
});
