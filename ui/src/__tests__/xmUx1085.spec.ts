/**
 * 一千零八十五批：XmigrateView 五项使用者体验升级（行为锚 + 少量源码锚）。
 *
 *   ① 后台通知（useJobNotify 接线）——页面隐藏时轮询拍检测 RUNNING→终态/停门态
 *     迁移才提醒（首拍可见页不提醒）；jobId+level 幂等（同迁移不重复闪）；偏好持久化
 *     （标题闪烁开关落 job-notify-v1，重挂载回读关闭态）；
 *   ② 运行中 ETA——etaMeta=(total−已迁移)/速率，观测行（耗时/速率同排）+详情弹层
 *     同补；rateOf=0/total 未知/余量非正一律不出；批量结果区全部 RUNNING 汇总
 *     「预计全部完成 HH:mm」（任一不可估则不出）；
 *   ③ 目标已存在即时提示——选中/输入命中宿主清单即行内中性灰提示（合并语义），
 *     不再等到启动确认弹窗；diff 入口点亮逻辑不变；
 *   ④ DONE 作业「增量重迁」——同参数直接走 start 链（确认弹窗带增量合并说明），
 *     参数透传（源/目标/策略/连接档案）；手动连接作业挡下并指路；FAILED 不抢续跑；
 *   ⑤ 作业表批量操作——行首勾选（jobId 列）+工具行批量中止/续跑；一次确认列全部
 *     jobId；循环端点逐个汇总 toast（成功 N/失败 M+首个失败原因）；作业表再无可操作行
 *     （RUNNING/FAILED/ABORTED/INTERRUPTED）时自动清选——FAILED 是续跑目标，不按终态清选；
 *     轮询拍刷新勾选不丢（自绘勾选不受 QRT 行集重建清空影响）。
 * 挂具范式同 xmigrateUx1120（全真挂载 + api mock + setupState 直调）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const xbDestIndices = vi.fn();
const xbStart = vi.fn();
const xbAbort = vi.fn();
const xbResume = vi.fn();
const xbPreflight = vi.fn();
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
        start: (...a: any[]) => xbStart(...a),
        abort: (...a: any[]) => xbAbort(...a),
        resume: (...a: any[]) => xbResume(...a),
        preflight: (...a: any[]) => xbPreflight(...a),
        events: async () => ({ events: [] }),
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
  const { useAppStore } = await import('../stores/app');
  return { app, host, store: useAppStore(pinia) };
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

/* 页面隐藏态可注入（useJobNotify/检测链都读 document.hidden） */
function setHidden(v: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => v });
}

const NOW = Date.now();
/* RUNNING 可估：5000/10000，耗时 50s → 100 docs/s，余 5000 → 预计剩余 50s */
const runJob = (over: Record<string, any> = {}) => ({
  jobId: 'j-run', status: 'RUNNING', destIndex: 'd-run', sourceIndex: 's-run',
  remoteEndpoint: 'http://old:9200', srcConnId: 'c1', migrated: 5000, total: 10000,
  conflicts: 0, errors: 0, createTime: NOW - 60000, startedAtMs: NOW - 50000, finishedAtMs: null,
  sliceStatus: { '0': 'RUNNING' }, sliceMigrated: { '0': 5000 }, sliceErrors: {}, ...over,
});
const doneJob = (over: Record<string, any> = {}) => ({
  jobId: 'j-done', status: 'DONE', destIndex: 'd-done', sourceIndex: 's-done',
  remoteEndpoint: 'http://old:9200', srcConnId: 'c1', migrated: 100, total: 100,
  conflicts: 0, errors: 0, createTime: NOW - 90000, startedAtMs: NOW - 80000, finishedAtMs: NOW - 70000,
  sliceStatus: {}, sliceMigrated: {}, sliceErrors: {},
  destCreateMode: 'NONE', tuneMode: 'GENTLE', slices: 3, batchSize: 200, ...over,
});

beforeEach(() => {
  document.body.innerHTML = '';
  document.title = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  /* 恢复 hidden 默认态（个别用例覆写后还原，防跨用例泄漏） */
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  xbJobs.mockReset().mockResolvedValue([]);
  xbDestIndices.mockReset().mockResolvedValue([]);
  xbStart.mockReset().mockResolvedValue({ jobId: 'j-new' });
  xbAbort.mockReset().mockResolvedValue({ jobId: 'j-run' });
  xbResume.mockReset().mockResolvedValue({ jobId: 'j-f1' });
  xbPreflight.mockReset().mockResolvedValue({ destExists: true });
  askConfirmFn.mockReset().mockResolvedValue(true);
  (Element.prototype as any).scrollIntoView = vi.fn();
});

/* ═══ ① 后台通知（触发/幂等/偏好持久化） ═══ */
describe('1085 ①：后台通知（useJobNotify 接线）', () => {
  it('页面隐藏时 RUNNING→DONE 触发标题闪烁；终态保持的后续拍不重复（幂等）', async () => {
    xbJobs.mockResolvedValueOnce([runJob()]);
    const { app, host } = await mountXm();
    setHidden(true);
    document.title = 'ESQueryStudio';
    xbJobs.mockResolvedValue([runJob({ status: 'DONE', finishedAtMs: NOW })]);
    (host.querySelector('button[aria-label="刷新任务列表"]') as HTMLButtonElement).click();
    await settle(8);
    expect(document.title, 'DONE 迁移→标题加 ✅ 前缀闪烁').toMatch(/^✅/);
    expect(document.title).toContain('ESQueryStudio');
    /* 幂等：同 jobId 同 level 第二拍不再叠 icon */
    const afterFirst = document.title;
    (host.querySelector('button[aria-label="刷新任务列表"]') as HTMLButtonElement).click();
    await settle(8);
    expect(document.title.startsWith('✅✅'), '同迁移不重复通知（icon 不叠加）').toBe(false);
    expect(document.title).toBe(afterFirst);
    app.unmount();
  }, 12000);

  it('RUNNING→FAILED 与 RUNNING→ABORTED 各按档位 icon；未知停门态走 gate 档', async () => {
    xbJobs.mockResolvedValueOnce([runJob({ jobId: 'j-f' })]);
    const { app, host } = await mountXm();
    setHidden(true);
    document.title = 'ESQueryStudio';
    xbJobs.mockResolvedValue([runJob({ jobId: 'j-f', status: 'FAILED' })]);
    (host.querySelector('button[aria-label="刷新任务列表"]') as HTMLButtonElement).click();
    await settle(8);
    expect(document.title.startsWith('✖'), 'FAILED → ✖').toBe(true);
    app.unmount();

    xbJobs.mockReset().mockResolvedValueOnce([runJob({ jobId: 'j-a' })]);
    const m2 = await mountXm();
    setHidden(true);
    document.title = 'ESQueryStudio';
    xbJobs.mockResolvedValue([runJob({ jobId: 'j-a', status: 'ABORTED' })]);
    (m2.host.querySelector('button[aria-label="刷新任务列表"]') as HTMLButtonElement).click();
    await settle(8);
    expect(document.title.startsWith('⛔'), 'ABORTED → ⛔').toBe(true);
    m2.app.unmount();

    /* 未知停门态（AWAIT_CONFIRM 类）：RUNNING 迁出且非终态 → gate ⏸ 档 */
    xbJobs.mockReset().mockResolvedValueOnce([runJob({ jobId: 'j-g' })]);
    const m3 = await mountXm();
    setHidden(true);
    document.title = 'ESQueryStudio';
    xbJobs.mockResolvedValue([runJob({ jobId: 'j-g', status: 'AWAIT_CONFIRM' })]);
    (m3.host.querySelector('button[aria-label="刷新任务列表"]') as HTMLButtonElement).click();
    await settle(8);
    expect(document.title.startsWith('⏸'), '停门态 → ⏸（gate 档兜底）').toBe(true);
    m3.app.unmount();
  }, 20000);

  it('页面可见时的状态迁移不通知（在场看得见）；首拍终态也不通知', async () => {
    /* 可见态迁移：不发（也不消耗幂等名额——再隐藏后同拍不补发旧迁移） */
    xbJobs.mockResolvedValueOnce([runJob()]);
    const { app, host } = await mountXm();
    document.title = 'ESQueryStudio';
    xbJobs.mockResolvedValue([runJob({ status: 'DONE', finishedAtMs: NOW })]);
    (host.querySelector('button[aria-label="刷新任务列表"]') as HTMLButtonElement).click();
    await settle(8);
    expect(document.title, '可见时不闪标题').toBe('ESQueryStudio');
    app.unmount();

    /* 首拍即终态（打开页面时作业已结束）：无上一拍记录，不通知 */
    xbJobs.mockReset().mockResolvedValue([doneJob()]);
    const m2 = await mountXm();
    document.title = 'ESQueryStudio';
    const st = stateOf(m2.app);
    st.checkJobNotify();
    await settle(4);
    expect(document.title, '首拍终态不通知').toBe('ESQueryStudio');
    m2.app.unmount();
  }, 12000);

  it('偏好持久化：关标题闪烁落 job-notify-v1；重挂载回读关闭态（迁移不再闪）', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    expect(localStorage.getItem('job-notify-v1'), '默认态不落盘（首写才持久化）').toBeNull();
    (host.querySelector('[data-test="xm-notify-title"]') as HTMLElement).click();
    await settle(4);
    expect(JSON.parse(localStorage.getItem('job-notify-v1')!), '开关落盘').toMatchObject({ title: false });
    app.unmount();

    /* 重挂载：回读关闭态——同迁移不闪标题 */
    xbJobs.mockReset().mockResolvedValueOnce([runJob()]);
    const m2 = await mountXm();
    const st2 = stateOf(m2.app);
    expect(st2.notifyTitleOn, '回读关闭态').toBe(false);
    setHidden(true);
    document.title = 'ESQueryStudio';
    xbJobs.mockResolvedValue([runJob({ status: 'DONE', finishedAtMs: NOW })]);
    (m2.host.querySelector('button[aria-label="刷新任务列表"]') as HTMLButtonElement).click();
    await settle(8);
    expect(document.title, '关闭态不发标题闪烁').toBe('ESQueryStudio');
    m2.app.unmount();
  }, 16000);

  it('观测区偏好控件在场：标题闪烁开关 + 桌面通知授权钮（denied 禁用走 tip）', async () => {
    const { app, host } = await mountXm();
    expect(host.querySelector('[data-test="xm-notify-title"]'), '标题闪烁开关在场').toBeTruthy();
    const btn = host.querySelector<HTMLButtonElement>('[data-test="xm-notify-desktop"]')!;
    expect(btn, '桌面通知授权钮在场').toBeTruthy();
    expect(btn.disabled, '无 Notification 环境=不可用档禁用').toBe(true);
    expect(btn.textContent).toContain('不可用');
    app.unmount();
  });
});

/* ═══ ② 运行中 ETA（计算/观测行/详情/批量汇总） ═══ */
describe('1085 ②：运行中 ETA', () => {
  it('etaMeta=(total−已迁移)/速率：可算出人话化时长；rateOf=0/total 未知/余量非正一律 null', async () => {
    const { app } = await mountXm();
    const st = stateOf(app);
    /* 5000 余量 / ≈100 docs/s（耗时随真实时钟 50s+ε） → 50~52s 档 */
    expect(['50s', '51s', '52s'], 'ETA=余量/速率（人话化秒档）').toContain(st.etaMeta(runJob())?.value);
    expect(st.etaMeta(runJob())?.label).toBe('预计剩余');
    /* rateOf=0（ΣsliceMigrated=0，防除零与抖动）不出 */
    expect(st.etaMeta(runJob({ migrated: 0, sliceMigrated: { '0': 0 } })), 'rateOf=0 不出').toBeNull();
    /* 耗时不足 1s（rateOf 口径）不出 */
    expect(st.etaMeta(runJob({ startedAtMs: Date.now() - 50 })), '耗时<1s 不出').toBeNull();
    /* total 未知不出 */
    expect(st.etaMeta(runJob({ total: 0 })), 'total 未知不出').toBeNull();
    /* 余量非正（已到量）不出 */
    expect(st.etaMeta(runJob({ migrated: 10000, sliceMigrated: { '0': 10000 } })), '余量≤0 不出').toBeNull();
    app.unmount();
  });

  it('观测行渲染：可估 RUNNING 行「预计剩余」与耗时/速率同排；rateOf=0 行不出', async () => {
    xbJobs.mockResolvedValue([runJob({ jobId: 'j-eta' }), runJob({ jobId: 'j-zero', migrated: 0, sliceMigrated: { '0': 0 } })]);
    const { app, host } = await mountXm();
    const rows = [...host.querySelectorAll('.qrt-tbl tbody tr')];
    expect(rows.length).toBe(2);
    const withEta = rows.find(r => r.textContent!.includes('j-eta'))!;
    const zero = rows.find(r => r.textContent!.includes('j-zero'))!;
    expect(withEta.querySelector('.xm-p-obs')!.textContent).toContain('预计剩余');
    expect(withEta.querySelector('.xm-p-obs')!.textContent).toMatch(/docs\/s/);
    expect(zero.querySelector('.xm-p-obs')!.textContent, 'rateOf=0 观测行不出 ETA').not.toContain('预计剩余');
    app.unmount();
  });

  it('详情弹层同补：打开详情观测行含耗时/速率/预计剩余（运行中作业）', async () => {
    xbJobs.mockResolvedValue([runJob()]);
    const { app, host } = await mountXm();
    (host.querySelector('button[aria-label^="作业详情"]') as HTMLButtonElement).click();
    await settle(6);
    const obs = document.querySelector('[data-test="xm-detail-obs"]')!;
    expect(obs, '详情观测行在场').toBeTruthy();
    expect(obs.textContent).toContain('docs/s');
    expect(obs.textContent).toContain('预计剩余');
    app.unmount();
  });

  it('批量汇总：全部 RUNNING 可估出「预计全部完成 HH:mm」；任一不可估则不出', async () => {
    const { app } = await mountXm();
    const st = stateOf(app);
    st.batchRows = [{ src: 'a', dst: 'a2', state: 'ok', reason: '' }];
    st.batchFlowPhase = 'done';
    st.jobs = [runJob({ jobId: 'j-r1', migrated: 9000, total: 10000, startedAtMs: NOW - 10000, sliceMigrated: { '0': 9000 } })];
    await settle(4);
    expect(st.batchEtaText, '最慢者线性外推为 HH:mm').toMatch(/^\d{2}:\d{2}$/);
    /* 混入一个不可估（无速率）的 RUNNING：整体不出 */
    st.jobs = [...st.jobs, runJob({ jobId: 'j-r2', migrated: 0, sliceMigrated: { '0': 0 } })];
    await settle(4);
    expect(st.batchEtaText, '任一不可估不出（不冒充）').toBe('');
    app.unmount();
  });
});

/* ═══ ③ 目标已存在即时提示 ═══ */
describe('1085 ③：目标已存在即时提示', () => {
  it('输入目标命中宿主清单即行内提示合并语义；未命中/清空不出', async () => {
    xbDestIndices.mockResolvedValue([{ index: 'dest-have' }]);
    const { app, host } = await mountXm();
    const st = stateOf(app);
    st.formOpen = true;
    st.form.destIndex = 'dest-have';
    await settle(4);
    const hint = host.querySelector('[data-test="xm-dest-exists"]')!;
    expect(hint, '命中清单提示在场').toBeTruthy();
    expect(hint.textContent).toContain('目标已存在');
    expect(hint.textContent).toContain('合并');
    expect(hint.textContent).toContain('先删目标');
    st.form.destIndex = 'dest-new';
    await settle(4);
    expect(host.querySelector('[data-test="xm-dest-exists"]'), '未命中不出').toBeNull();
    app.unmount();
  });
});

/* ═══ ④ DONE 作业增量重迁 ═══ */
describe('1085 ④：DONE 增量重迁', () => {
  it('DONE 行/详情按钮在场；FAILED 行不出（既有续跑语义不抢）', async () => {
    xbJobs.mockResolvedValue([doneJob(), runJob({ jobId: 'j-fail', status: 'FAILED', finishedAtMs: NOW })]);
    const { app, host } = await mountXm();
    const rows = [...host.querySelectorAll('.qrt-tbl tbody tr')];
    const doneRow = rows.find(r => r.textContent!.includes('j-done'))!;
    const failRow = rows.find(r => r.textContent!.includes('j-fail'))!;
    expect(doneRow.querySelector('[data-test="xm-remigrate-btn"]'), 'DONE 行增量重迁钮在场').toBeTruthy();
    expect(failRow.querySelector('[data-test="xm-remigrate-btn"]'), 'FAILED 行不出增量重迁').toBeNull();
    expect(failRow.querySelector('button[aria-label="断点续跑"]'), 'FAILED 行续跑钮仍在').toBeTruthy();
    app.unmount();
  });

  it('一键重迁：确认文案说明增量合并；确认后原参数透传 start（含连接档案）', async () => {
    xbJobs.mockResolvedValue([doneJob()]);
    const { app, host } = await mountXm();
    (host.querySelector('[data-test="xm-remigrate-btn"]') as HTMLButtonElement).click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    const opt = askConfirmFn.mock.calls[0][0];
    expect(opt.title).toBe('增量重迁');
    expect(opt.message, '确认文案说明增量合并').toContain('增量合并');
    expect(opt.facts.some((f: any) => f.value === 'j-done')).toBe(true);
    expect(xbStart).toHaveBeenCalledTimes(1);
    /* 参数透传：源/目标/策略/连接档案；不自持项归服务端默认 */
    expect(xbStart.mock.calls[0][0]).toMatchObject({
      sourceIndex: 's-done', destIndex: 'd-done', destCreateMode: 'NONE', tuneMode: 'GENTLE',
      slices: 3, batchSize: 200, scrollKeepAliveSec: 0, forceMerge: false, srcConnId: 'c1',
    });
    expect(xbStart.mock.calls[0][1], 'start 按作业源连接档案定向').toBe('c1');
    app.unmount();
  });

  it('手动连接作业（无 srcConnId）挡下并指路「以此参数新建」；不发起 start', async () => {
    xbJobs.mockResolvedValue([doneJob({ jobId: 'j-manual', srcConnId: undefined })]);
    xbStart.mockClear();
    const { app, host } = await mountXm();
    (host.querySelector('[data-test="xm-remigrate-btn"]') as HTMLButtonElement).click();
    await settle(6);
    expect(xbStart, '不冒充可重迁').not.toHaveBeenCalled();
    expect(askConfirmFn).not.toHaveBeenCalled();
    app.unmount();
  });
});

/* ═══ ⑤ 作业表批量操作 ═══ */
describe('1085 ⑤：作业表批量操作（勾选/批量中止/批量续跑/自动清选）', () => {
  const THREE_JOBS = () => [
    runJob({ jobId: 'j-r1' }),
    runJob({ jobId: 'j-r2' }),
    doneJob(),
    { ...runJob({ jobId: 'j-f1' }), status: 'FAILED', finishedAtMs: NOW, srcConnId: 'c1' },
    { ...runJob({ jobId: 'j-f2' }), status: 'FAILED', finishedAtMs: NOW, srcConnId: undefined },
  ];

  function selBox(host: ParentNode, jobId: string): HTMLElement {
    const row = [...host.querySelectorAll('.qrt-tbl tbody tr')].find(r => r.textContent!.includes(jobId))!;
    return row.querySelector('.xm-sel-cell [role="checkbox"]') as HTMLElement;
  }

  it('勾选 RUNNING 行 → 工具行浮出「批量中止」；确认文案列全部 jobId', async () => {
    xbJobs.mockResolvedValue(THREE_JOBS());
    const { app, host } = await mountXm();
    expect(host.querySelector('[data-test="xm-bulk-abort"]'), '未勾选不浮出').toBeNull();
    selBox(host, 'j-r1').click();
    selBox(host, 'j-r2').click();
    await settle(4);
    const abortBtn = host.querySelector<HTMLButtonElement>('[data-test="xm-bulk-abort"]')!;
    expect(abortBtn, '勾选 RUNNING 后浮出批量中止').toBeTruthy();
    expect(abortBtn.textContent).toContain('2');
    abortBtn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    const opt = askConfirmFn.mock.calls[0][0];
    expect(opt.title).toBe('批量中止迁移');
    expect(opt.message, '确认文案列全部 jobId').toContain('j-r1');
    expect(opt.message).toContain('j-r2');
    app.unmount();
  }, 12000);

  it('批量中止执行链：循环 abort（一成一败）→ 汇总 toast 含成功数与首个失败原因', async () => {
    xbJobs.mockResolvedValue(THREE_JOBS());
    const { app, host, store } = await mountXm();
    selBox(host, 'j-r1').click();
    selBox(host, 'j-r2').click();
    await settle(4);
    xbAbort.mockReset().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('目标只读'));
    (host.querySelector('[data-test="xm-bulk-abort"]') as HTMLButtonElement).click();
    await settle(10);
    expect(xbAbort).toHaveBeenNthCalledWith(1, 'j-r1', 'c1');
    expect(xbAbort).toHaveBeenNthCalledWith(2, 'j-r2', 'c1');
    const toasts = store.notifyLog.map(n => n.msg);
    expect(toasts.some(m => m.includes('批量中止完成：成功 1/2') && m.includes('目标只读')), '汇总 toast 成功数+首个失败原因').toBe(true);
    app.unmount();
  }, 12000);

  it('批量续跑：仅档案连接作业发起；手动连接跳过并在确认文案说明；续跑后勾选保持，作业表无可操作行才自动清选', async () => {
    xbJobs.mockResolvedValue(THREE_JOBS());
    const { app, host } = await mountXm();
    selBox(host, 'j-f1').click();
    selBox(host, 'j-f2').click();
    await settle(4);
    const resumeBtn = host.querySelector<HTMLButtonElement>('[data-test="xm-bulk-resume"]')!;
    expect(resumeBtn, '勾中可续跑行后浮出批量续跑（仅档案连接 1 个）').toBeTruthy();
    expect(resumeBtn.textContent).toContain('1');
    resumeBtn.click();
    await settle(6);
    const opt = askConfirmFn.mock.calls[0][0];
    expect(opt.message, '确认文案含发起的 jobId').toContain('j-f1');
    expect(opt.message, '手动连接跳过如实计数说明').toContain('另有 1 个手动连接作业');
    await settle(8);
    expect(xbResume).toHaveBeenCalledTimes(1);
    expect(xbResume).toHaveBeenCalledWith('j-f1', {}, 'c1');
    /* 续跑后 j-f1 转 DONE、j-f2 仍 FAILED：FAILED 本身就是续跑目标，不能按「选中全终态」清选——
       作业表里还有可操作行（j-f2 FAILED、j-r1/j-r2 RUNNING），勾选保持；批量续跑钮因选中集里
       已无可续跑的档案连接作业（j-f2 是手动连接）而消隐 */
    xbJobs.mockResolvedValue(THREE_JOBS().map(j => j.jobId === 'j-f1' ? { ...j, status: 'DONE', finishedAtMs: NOW } : j));
    (host.querySelector('button[aria-label="刷新任务列表"]') as HTMLButtonElement).click();
    await settle(8);
    expect(host.querySelector('[data-test="xm-bulk-resume"]'), '选中集已无可续跑的档案连接作业：钮消隐').toBeNull();
    expect(host.querySelector('[data-test="xm-bulk-clear"]')!.textContent, '勾选保持（作业表仍有可操作行）').toContain('已选 2');
    /* 作业表再无任何可操作行（全部 DONE）：勾选失去意义，随拍自动清选、按钮消隐 */
    xbJobs.mockResolvedValue(THREE_JOBS().map(j => ({ ...j, status: 'DONE', finishedAtMs: NOW })));
    (host.querySelector('button[aria-label="刷新任务列表"]') as HTMLButtonElement).click();
    await settle(8);
    expect(host.querySelector('[data-test="xm-bulk-resume"]'), '无可操作行后自动清选（按钮消隐）').toBeNull();
    expect(host.querySelector('[data-test="xm-bulk-clear"]'), '勾选集已清').toBeNull();
    app.unmount();
  }, 16000);

  it('勾选 FAILED 行后轮询拍刷新（状态不变）：勾选保持，批量续跑不被自动清掉', async () => {
    xbJobs.mockResolvedValue(THREE_JOBS());
    const { app, host } = await mountXm();
    selBox(host, 'j-f1').click();
    await settle(4);
    expect(host.querySelector('[data-test="xm-bulk-resume"]'), '勾选 FAILED 行后浮出批量续跑').toBeTruthy();
    expect(selBox(host, 'j-f1').getAttribute('aria-checked'), '勾选态回显').toBe('true');
    /* 轮询拍：同 jobId 新对象新数组，状态不变——此前按「选中全终态」判，这一拍就把勾选清空 */
    for (let i = 0; i < 2; i++) {
      xbJobs.mockResolvedValueOnce(THREE_JOBS());
      (host.querySelector('button[aria-label="刷新任务列表"]') as HTMLButtonElement).click();
      await settle(8);
      expect(host.querySelector('[data-test="xm-bulk-resume"]'), `第 ${i + 1} 拍后批量续跑仍在场`).toBeTruthy();
      expect(host.querySelector('[data-test="xm-bulk-clear"]')!.textContent).toContain('已选 1');
      expect(selBox(host, 'j-f1').getAttribute('aria-checked'), `第 ${i + 1} 拍后勾选态保持`).toBe('true');
    }
    app.unmount();
  }, 12000);

  it('轮询拍刷新（jobs 换新数组、状态未变）勾选不丢——批量操作在轮询活跃期可用', async () => {
    xbJobs.mockResolvedValueOnce(THREE_JOBS());
    const { app, host } = await mountXm();
    selBox(host, 'j-r1').click();
    await settle(4);
    /* 同 jobId 新对象新数组（模拟轮询回包） */
    xbJobs.mockResolvedValueOnce(THREE_JOBS());
    (host.querySelector('button[aria-label="刷新任务列表"]') as HTMLButtonElement).click();
    await settle(8);
    expect(host.querySelector('[data-test="xm-bulk-abort"]'), '轮询拍后勾选保持（批量中止仍在场）').toBeTruthy();
    expect(host.querySelector('[data-test="xm-bulk-clear"]')!.textContent).toContain('已选 1');
    app.unmount();
  }, 12000);
});

/* ═══ 源码锚（五项接线 + 自绘勾选理由） ═══ */
describe('1085 源码锚：五项接线', () => {
  const src = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');
  it('① 通知接线：useJobNotify 实例 + 轮询拍检测挂 loadJobs 成功路径', () => {
    expect(src).toContain("import { useJobNotify } from '../composables/useJobNotify';");
    expect(src).toContain('const jobNotify = useJobNotify();');
    expect(src).toContain('function checkJobNotify()');
    expect(src).toContain('checkJobNotify(); /* 1085 后台通知');
  });
  it('② ETA：观测行/详情同排渲染 + 批量汇总线性外推口径', () => {
    expect(src).toContain('· 预计剩余 {{ etaTextOf(rowJob(row))! }}');
    expect(src).toContain('· 预计剩余 {{ etaTextOf(detailJobLive)! }}');
    expect(src).toContain("const XM_ETA_TIP = '预计剩余 =（total − 已迁移）/ 速率（ΣsliceMigrated ÷ 耗时）——按当前速率线性外推的估算值，随速率波动刷新；速率缺失或总量未知时不显示';");
    expect(src).toContain('预计全部完成 {{ batchEtaText }}');
  });
  it('③ 目标已存在提示复用既有清单判定（destExists），diff 入口点亮逻辑不动', () => {
    expect(src).toContain('<div v-if="form.destIndex && destExists" class="xm-hint-line" data-test="xm-dest-exists"');
    expect(src).toContain('!!diffDestName.value && hostIndices.value.some(h => String(h.index) === diffDestName.value)');
  });
  it('④ 增量重迁：askRemigrate 独立链（不走向导回填）+ 行/详情双入口', () => {
    expect(src).toMatch(/async function askRemigrate\(j: any\)/);
    expect(src).toContain("本次为增量合并——同名文档将被跳过(不重建)");
    expect(src).toContain('data-test="xm-remigrate-btn"');
    expect(src).toContain('data-test="xm-remigrate-detail-btn"');
  });
  it('⑤ 批量操作：勾选按 jobId 持久 + 一次确认列全部 jobId + 逐个汇总', () => {
    expect(src).toContain('const selJobIds = ref(new Set<string>());');
    expect(src).toContain('data-test="xm-bulk-abort"');
    expect(src).toContain('data-test="xm-bulk-resume"');
    expect(src).toContain('${ids.join(\'、\')}');
    expect(src).toContain('data-test="xm-sel-job"');
  });
});
