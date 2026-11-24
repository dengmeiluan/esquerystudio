/**
 * XmigrateView 审查修复项的行为锁（挂载级 + 少量源码锚）。挂具范式同 xmUx1085
 * （全真挂载 + api mock + setupState 直调）。
 *
 *  · 授权态回显：桌面通知授权钮绑定 useJobNotify 的响应式 perm——授权回执、回到页面都会
 *    刷新（此前 computed 直读 Notification.permission，零响应依赖，点了授权回显不变）；
 *    点击后按授权结果弹 toast；
 *  · 幂等键重置：作业状态回到 RUNNING（续跑沿用同一 jobId）时清该作业已发过的通知键，
 *    再次停门/终态可再提醒；
 *  · 上一拍记录（jobPrevStatus）按当前作业清单剪枝，删除/清理后摘键；
 *  · 增量重迁：确认弹窗如实列出 scrollKeepAliveSec=0 / forceMerge=false；按钮 tip 对
 *    删旧重建（REBUILD）作业改说「删旧重建」；
 *  · 批量 ETA：预计完成时刻不在当日时前置日期（MM-DD HH:mm）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const xbDestIndices = vi.fn();
const xbStart = vi.fn();
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
        preflight: (...a: any[]) => xbPreflight(...a),
        events: async () => ({ events: [] }),
      },
    },
  };
});
vi.mock('../composables/confirm', () => ({
  askConfirm: (...a: any[]) => askConfirmFn(...a),
}));

/* Notification 替身：permission 可按场景设定；授权请求回执可按场景设定 */
let requestResult: 'granted' | 'denied' | 'default' = 'granted';
const requestPermissionFn = vi.fn(async () => requestResult);
class FakeNotification {
  static permission = 'default';
  static requestPermission = requestPermissionFn;
  onclick: (() => void) | null = null;
  constructor(public title: string, public options: any) { /* 不关心桌面通知本体 */ }
  close() { /* no-op */ }
}

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

function setHidden(v: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => v });
}

function refreshJobs(host: HTMLElement) {
  (host.querySelector('button[aria-label="刷新任务列表"]') as HTMLButtonElement).click();
}

const NOW = Date.now();
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
  setHidden(false);
  xbJobs.mockReset().mockResolvedValue([]);
  xbDestIndices.mockReset().mockResolvedValue([]);
  xbStart.mockReset().mockResolvedValue({ jobId: 'j-new' });
  xbPreflight.mockReset().mockResolvedValue({ destExists: true });
  askConfirmFn.mockReset().mockResolvedValue(true);
  requestPermissionFn.mockClear();
  requestResult = 'granted';
  FakeNotification.permission = 'default';
  vi.stubGlobal('Notification', FakeNotification);
  (Element.prototype as any).scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.title = '';
});

describe('XmigrateView · 桌面通知授权钮（perm 回显 + toast）', () => {
  it('default 档可点；授权回执 granted → 成功 toast + 回显「桌面通知已开启」', async () => {
    FakeNotification.permission = 'default';
    requestResult = 'granted';
    const { app, host, store } = await mountXm();
    const btn = host.querySelector<HTMLButtonElement>('[data-test="xm-notify-desktop"]')!;
    expect(btn.disabled, 'default 档可点').toBe(false);
    expect(btn.textContent).toContain('开启桌面通知');
    btn.click();
    await settle(8);
    expect(requestPermissionFn).toHaveBeenCalledTimes(1);
    expect(store.notifyLog.some(n => n.kind === 'success' && n.msg.includes('已开启桌面通知')), '成功 toast').toBe(true);
    expect(btn.textContent, '授权后回显刷新（此前 computed 读不到响应式依赖，回显不变）').toContain('桌面通知已开启');
    expect(btn.disabled).toBe(false);
    app.unmount();
  }, 12000);

  it('授权回执 denied → 提示 toast + 回显「已拒绝」并禁用', async () => {
    FakeNotification.permission = 'default';
    requestResult = 'denied';
    const { app, host, store } = await mountXm();
    const btn = host.querySelector<HTMLButtonElement>('[data-test="xm-notify-desktop"]')!;
    btn.click();
    await settle(8);
    expect(store.notifyLog.some(n => n.kind === 'warning' && n.msg.includes('未获得桌面通知授权')), '未获授权提示 toast').toBe(true);
    expect(btn.textContent).toContain('桌面通知（已拒绝）');
    expect(btn.disabled, 'denied 后禁用（重授权只能去站点设置）').toBe(true);
    app.unmount();
  }, 12000);

  it('已是 denied 即禁用；回到页面（visibilitychange 转可见）重读授权态', async () => {
    FakeNotification.permission = 'denied';
    const { app, host } = await mountXm();
    const btn = host.querySelector<HTMLButtonElement>('[data-test="xm-notify-desktop"]')!;
    expect(btn.disabled, 'denied 初值即禁用').toBe(true);
    /* 隐藏期间去站点设置里放行，浏览器在切回标签页时才同步权限值 */
    FakeNotification.permission = 'granted';
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await settle(4);
    expect(btn.disabled, '隐藏拍不刷新').toBe(true);
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await settle(4);
    expect(btn.disabled, '回前台后刷新').toBe(false);
    expect(btn.textContent).toContain('桌面通知已开启');
    app.unmount();
  }, 12000);
});

describe('XmigrateView · 后台通知幂等键重置与记录剪枝', () => {
  it('作业状态回到 RUNNING 清该作业已发通知键：续跑后再次失败可再提醒', async () => {
    const j = (status: string) => runJob({ jobId: 'j-rr', status, finishedAtMs: status === 'RUNNING' ? null : NOW });
    xbJobs.mockResolvedValueOnce([j('RUNNING')]);
    const { app, host } = await mountXm();
    const st = stateOf(app);
    setHidden(true);
    document.title = 'ESQueryStudio';
    const beat = async (rows: any[]) => { xbJobs.mockResolvedValueOnce(rows); refreshJobs(host); await settle(8); };

    await beat([j('FAILED')]);
    expect(document.title.startsWith('✖'), '首轮失败：提醒一次').toBe(true);
    st.jobNotify.settle(); /* 等价回前台：停闪并还原标题 */
    expect(document.title).toBe('ESQueryStudio');

    await beat([j('RUNNING')]);
    expect(document.title, '续跑（回到 RUNNING）本身不提醒').toBe('ESQueryStudio');

    await beat([j('FAILED')]);
    expect(document.title.startsWith('✖'), '新一轮失败再次提醒——不被上一轮的幂等键吞掉').toBe(true);
    app.unmount();
  }, 16000);

  it('jobPrevStatus 按当前作业清单剪枝：出清单的作业摘键；重新入列按首拍处理不通知', async () => {
    xbJobs.mockResolvedValueOnce([runJob({ jobId: 'j-a' }), runJob({ jobId: 'j-b' })]);
    const { app, host } = await mountXm();
    const st = stateOf(app);
    expect([...st.jobPrevStatus.keys()].sort()).toEqual(['j-a', 'j-b']);

    /* j-b 被删除/清理出清单：记录随之摘除（Map 不随历史作业累积） */
    xbJobs.mockResolvedValueOnce([runJob({ jobId: 'j-a' })]);
    refreshJobs(host);
    await settle(8);
    expect(st.jobPrevStatus.has('j-b'), '出清单即摘键').toBe(false);
    expect(st.jobPrevStatus.size).toBe(1);

    /* j-b 重新入列且已是终态：没有上一拍记录 → 按首拍处理，页面隐藏也不提醒 */
    setHidden(true);
    document.title = 'ESQueryStudio';
    xbJobs.mockResolvedValueOnce([runJob({ jobId: 'j-a' }), runJob({ jobId: 'j-b', status: 'DONE', finishedAtMs: NOW })]);
    refreshJobs(host);
    await settle(8);
    expect(document.title, '重新入列的首拍不通知').toBe('ESQueryStudio');
    expect(st.jobPrevStatus.get('j-b'), '新记录已建立').toBe('DONE');
    app.unmount();
  }, 16000);
});

describe('XmigrateView · 增量重迁（如实披露 + tip 分档）', () => {
  it('确认弹窗 facts 列出 scrollKeepAliveSec=0 / forceMerge=false（作业记录未留存，按服务端默认提交）', async () => {
    xbJobs.mockResolvedValue([doneJob()]);
    const { app, host } = await mountXm();
    (host.querySelector('[data-test="xm-remigrate-btn"]') as HTMLButtonElement).click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    const facts = askConfirmFn.mock.calls[0][0].facts as { label: string; value: string }[];
    expect(facts.find(f => f.label === 'scrollKeepAliveSec')?.value, 'scroll 保活如实披露').toMatch(/^0（/);
    expect(facts.find(f => f.label === 'forceMerge')?.value, '收尾合并段如实披露').toMatch(/^false（/);
    expect(facts.find(f => f.label === '建索引方式')?.value).toBe('NONE');
    app.unmount();
  }, 12000);

  it('按钮 tip 按原作业建索引方式分档：REBUILD 说「删旧重建」，其余说「增量合并」；弹窗档位随之为 critical', async () => {
    const { app } = await mountXm();
    const st = stateOf(app);
    expect(st.remigrateTip(doneJob())).toContain('增量合并');
    expect(st.remigrateTip(doneJob())).not.toContain('删旧重建');
    expect(st.remigrateTip(doneJob({ destCreateMode: 'REBUILD' })), 'REBUILD 作业走删旧重建分支').toContain('删旧重建');
    expect(st.remigrateTip(doneJob({ destCreateMode: 'REBUILD' }))).not.toContain('增量合并');
    app.unmount();

    xbJobs.mockResolvedValue([doneJob({ destCreateMode: 'REBUILD' })]);
    const m2 = await mountXm();
    (m2.host.querySelector('[data-test="xm-remigrate-btn"]') as HTMLButtonElement).click();
    await settle(6);
    const opt = askConfirmFn.mock.calls[0][0];
    expect(opt.level, '删旧重建是 critical 档').toBe('critical');
    expect(opt.message).toContain('删旧重建模式');
    m2.app.unmount();
  }, 16000);

  it('源码锚：行内与详情两处重迁钮的 tip 都走 remigrateTip()', () => {
    const src = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');
    expect(src).toMatch(/data-test="xm-remigrate-btn"[^>]*v-tip="remigrateTip\(rowJob\(row\)\)"/);
    expect(src).toMatch(/data-test="xm-remigrate-detail-btn"[^>]*v-tip="remigrateTip\(detailJobLive\)"/);
  });
});

describe('XmigrateView · 批量 ETA 跨日带日期', () => {
  /* 时钟钉在指定本地时刻；作业 10s 搬 100 条 → 10 条/秒，余 9900 条 → 预计 990s 后完成 */
  function primeAt(hh: number, mm: number, ss: number) {
    const base = new Date();
    base.setHours(hh, mm, ss, 0);
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(base);
    return base;
  }
  const slowJob = (base: Date) => runJob({
    jobId: 'j-slow', migrated: 100, total: 10000,
    startedAtMs: base.getTime() - 10000, sliceMigrated: { '0': 100 },
  });
  const pad = (n: number) => String(n).padStart(2, '0');

  it('预计完成时刻在当日：仍是 HH:mm', async () => {
    const base = primeAt(12, 0, 0);
    const { app } = await mountXm();
    const st = stateOf(app);
    st.batchRows = [{ src: 'a', dst: 'a2', state: 'ok', reason: '' }];
    st.batchFlowPhase = 'done';
    st.jobs = [slowJob(base)];
    await settle(4);
    expect(st.batchEtaText, '当日不带日期').toMatch(/^\d{2}:\d{2}$/);
    expect(st.batchEtaText).toBe('12:16');
    app.unmount();
  }, 12000);

  it('预计完成时刻跨到次日：前置日期「MM-DD HH:mm」', async () => {
    const base = primeAt(23, 59, 30);
    const { app } = await mountXm();
    const st = stateOf(app);
    st.batchRows = [{ src: 'a', dst: 'a2', state: 'ok', reason: '' }];
    st.batchFlowPhase = 'done';
    st.jobs = [slowJob(base)];
    await settle(4);
    const eta = new Date(base.getTime() + 990000);
    expect(eta.getDate(), '用例前提：确实跨日').not.toBe(base.getDate());
    expect(st.batchEtaText).toBe(`${pad(eta.getMonth() + 1)}-${pad(eta.getDate())} 00:16`);
    expect(st.batchEtaText, '跨日不再只是一个看不出是哪天的时间').not.toMatch(/^\d{2}:\d{2}$/);
    app.unmount();
  }, 12000);
});
