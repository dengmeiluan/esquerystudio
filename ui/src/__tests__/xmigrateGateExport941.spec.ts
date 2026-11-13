/**
 * 941 批：XmigrateView 走查三刀（start/abort 确认链执行闸 + 导出空集报真 + 空态钮恒在场）。
 *
 * 刀① 启动确认链执行闸缺失（openStartConfirm）：执行体含 preflight+确认窗两个 await，
 *   互斥置位（starting）发生在确认窗之后的 doStart 里——preflight/确认窗挂起期间
 *   starting=false、启动钮可点，二击穿透闸双开确认窗（confirm.ts 全局单例覆写非队列，
 *   resolver?.(false) 把第一开按取消静默收掉）。修法口径=闸读收本体首行+置位前移到
 *   第一个 await 之前+try/finally 包裹（templateSaveGate937/securityRebindGate940
 *   同族口径）；doStart 内层 starting 闸读/置位/复位三处随闸前移退役（唯一调用点
 *   openStartConfirm 已闸，内层闸读会短路死），qr.running 查保留；startErr 重试钮
 *   通道由闸收本体覆盖（systemRunReentry933 通道覆盖律）。
 * 刀② 中止确认链同构（askAbort→doAbort）：置位（aborting）在确认窗 await 之后的
 *   doAbort 里，确认窗挂起期中止钮可点，二击穿透双开中止确认窗。修法=闸读收首行+
 *   置位前移+try/finally（取消路径 finally 复位防闸死）；提交路径 aborting 生命周期
 *   跨 3s 撤销窗+API 在途（「从确认起钉住到 API 落定」既有契约）——submitted 标记
 *   守护外层 finally 只对取消路径复位，提交路径复位权留在既有 setTimeout 回调；
 *   doAbort 内层闸读/置位退役（唯一调用点 askAbort 已闸）。
 * 刀③ 导出空集静默假死（exportTsv/exportMd）：作业表 kw 过滤筛至零行时两钮在场可点，
 *   exportRows 空集走 `if (!rows.length) return;` 静默退场零反馈=假死。修法=空集
 *   分支补齐 warning「无表格结果可导出」（exportEmptyGuard936 同款话术，不造第二措辞）。
 * 刀④ 作业工具行两导出钮 v-if="jobs.length" 条件消失：空态时 Markdown/TSV 钮整个
 *   消失、刷新钮 :style 条件推右——作业数 0↔N 翻转时头部三钮位置跳变（铁律 B/D
 *   违例：无数据 disabled 而非 v-if 消失）。修法=两钮恒在场 disabled
 *   （exportEmptyGuard936 刀② 同款），margin-left:auto 收敛到 Markdown 钮恒定承担。
 *
 * 锁定形态：行为锚（视图全真挂载+memory router+askConfirm 手控回包）+源码锁双通道；
 * formAuditSweep 的 useModalEnter 接线锁、autoRefreshAudit551 的 hasRunningJob/
 * restart 接线锁与全站 setOn 总数锚、xmigrateRowMenu 行菜单源码锁共处零扰动。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const askConfirmFn = vi.fn();
const jobsFn = vi.fn();
const destIndicesFn = vi.fn();
const keysFn = vi.fn();
const clustersListFn = vi.fn();
const preflightFn = vi.fn();
const startFn = vi.fn();
const abortFn = vi.fn();

vi.mock('../composables/confirm', () => ({
  askConfirm: (...a: any[]) => askConfirmFn(...a),
}));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      keys: (...a: any[]) => keysFn(...a),
      clustersList: (...a: any[]) => clustersListFn(...a),
      xb: {
        ...actual.api.xb,
        jobs: (...a: any[]) => jobsFn(...a),
        destIndices: (...a: any[]) => destIndicesFn(...a),
        preflight: (...a: any[]) => preflightFn(...a),
        start: (...a: any[]) => startFn(...a),
        abort: (...a: any[]) => abortFn(...a),
      },
    },
  };
});
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: async () => true };
});

import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];
let pendingConfirms: { res: (v: boolean) => void }[] = [];

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const RUNNING_JOB = { jobId: 'run-1', status: 'RUNNING', destIndex: 'dest-1', sourceIndex: 'src-1', remoteEndpoint: 'http://old:9200', migrated: 3, total: 0, conflicts: 0, errors: 0, createTime: 1750000000000, sliceStatus: {} };
const DONE_JOB = { jobId: 'done-1', status: 'DONE', destIndex: 'dest-2', sourceIndex: 'src-2', remoteEndpoint: 'http://old:9200', migrated: 10, total: 10, conflicts: 0, errors: 0, createTime: 1750000000000, sliceStatus: {} };

async function mountXm(jobs: any[]): Promise<{ host: HTMLElement; store: ReturnType<typeof useAppStore> }> {
  jobsFn.mockReset().mockResolvedValue(jobs);
  const View = (await import('../views/XmigrateView.vue')).default;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/search', component: { template: '<div/>' } },
      { path: '/indices', component: { template: '<div/>' } },
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
  return { host, store: useAppStore(pinia) };
}

function btnByText(host: ParentNode, label: string): HTMLButtonElement {
  const btn = [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find(b => (b.textContent || '').trim() === label);
  if (!btn) throw new Error('button not found: ' + label);
  return btn;
}

function fillInput(host: ParentNode, placeholderPrefix: string, value: string) {
  const el = [...host.querySelectorAll<HTMLInputElement>('input')]
    .find(i => i.placeholder.startsWith(placeholderPrefix));
  if (!el) throw new Error('input not found: ' + placeholderPrefix);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function releaseConfirm(v: boolean) {
  const p = pendingConfirms.shift();
  if (!p) throw new Error('no pending confirm');
  p.res(v);
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  pendingConfirms = [];
  askConfirmFn.mockReset().mockImplementation(() => new Promise<boolean>((res) => { pendingConfirms.push({ res }); }));
  destIndicesFn.mockReset().mockResolvedValue([]);
  keysFn.mockReset().mockResolvedValue([]);
  clustersListFn.mockReset().mockResolvedValue([]);
  preflightFn.mockReset().mockResolvedValue({ destExists: false });
  startFn.mockReset().mockResolvedValue({ jobId: 'j-new' });
  abortFn.mockReset().mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('941 Xmigrate 启动确认链执行闸（刀①）', () => {
  it('确认窗挂起期间二击不穿透：确认计数恒 1、启动钮即禁用、单发', { timeout: 20000 }, async () => {
    const { host } = await mountXm([]);
    fillInput(host, 'host', 'old-cluster:9200');
    fillInput(host, '输入索引名', 'src-1');
    fillInput(host, '搜索宿主已有索引', 'dest-1');
    await settle(4);
    const btn = host.querySelector<HTMLButtonElement>('.xm-actions button.btn.pri');
    expect(btn, '启动钮必须在场（canOps 开）').toBeTruthy();
    btn!.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    expect(pendingConfirms.length).toBe(1);
    /* 闸置位前移后启动钮在确认窗期间即禁用（穿透窗消除） */
    expect(btn!.disabled).toBe(true);
    btn!.click();                                   /* 二击：闸读+钮面禁用双保险 */
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    releaseConfirm(true);
    await settle(8);
    expect(startFn).toHaveBeenCalledTimes(1);       /* 单发铁证 */
  });

  it('取消路径复位防闸死：确认窗取消后可再次发起', { timeout: 20000 }, async () => {
    const { host } = await mountXm([]);
    fillInput(host, 'host', 'old-cluster:9200');
    fillInput(host, '输入索引名', 'src-1');
    fillInput(host, '搜索宿主已有索引', 'dest-1');
    await settle(4);
    const btn = host.querySelector<HTMLButtonElement>('.xm-actions button.btn.pri')!;
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    releaseConfirm(false);
    await settle(6);
    expect(btn.disabled).toBe(false);
    expect(startFn).not.toHaveBeenCalled();
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(2);  /* 可再进确认 */
    releaseConfirm(true);
    await settle(8);
    expect(startFn).toHaveBeenCalledTimes(1);
  });
});

describe('941 Xmigrate 中止确认链执行闸（刀②）', () => {
  it('中止确认窗挂起期间二击不穿透：确认恒 1、中止钮即禁用、3s 窗钉到 API 落定', { timeout: 20000 }, async () => {
    const { host } = await mountXm([RUNNING_JOB]);
    await settle(6);
    const btn = host.querySelector<HTMLButtonElement>('button[aria-label^="中止迁移"]');
    expect(btn, 'RUNNING 行必须渲染行内中止钮').toBeTruthy();
    btn!.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    expect(pendingConfirms.length).toBe(1);
    /* 闸置位前移后中止钮在确认窗期间即禁用（穿透窗消除） */
    expect(btn!.disabled).toBe(true);
    btn!.click();                                   /* 二击：闸读+钮面禁用双保险 */
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    releaseConfirm(true);
    await settle(6);
    /* 提交路径 aborting 钉住不早复位（3s 撤销窗语义保全，现状守卫） */
    expect(btn!.disabled).toBe(true);
    expect(abortFn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    await settle(8);
    expect(abortFn).toHaveBeenCalledTimes(1);       /* 3s 后下发 */
    expect(btn!.disabled).toBe(false);              /* API 落定复位 */
  });

  it('取消路径复位防闸死：确认窗取消后可再次发起', { timeout: 20000 }, async () => {
    const { host } = await mountXm([RUNNING_JOB]);
    await settle(6);
    const btn = host.querySelector<HTMLButtonElement>('button[aria-label^="中止迁移"]')!;
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    releaseConfirm(false);
    await settle(6);
    expect(btn.disabled).toBe(false);
    expect(abortFn).not.toHaveBeenCalled();
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(2);  /* 可再进确认 */
    vi.useFakeTimers();
    releaseConfirm(true);
    await settle(6);
    vi.advanceTimersByTime(3000);
    await settle(8);
    expect(abortFn).toHaveBeenCalledTimes(1);
  });
});

describe('941 Xmigrate 导出空集报真（刀③）', () => {
  it('kw 过滤筛至零行时 Markdown 导出报 warning 不再静默', { timeout: 20000 }, async () => {
    const { host, store } = await mountXm([DONE_JOB]);
    const spy = vi.spyOn(store, 'notify');
    fillInput(host, '过滤：', 'zzz-no-match');
    await settle(6);
    btnByText(host, 'Markdown').click();
    await settle(6);
    expect(spy).toHaveBeenCalledWith('warning', '无表格结果可导出');
  });

  it('kw 过滤筛至零行时 TSV 导出报 warning 不再静默', { timeout: 20000 }, async () => {
    const { host, store } = await mountXm([DONE_JOB]);
    const spy = vi.spyOn(store, 'notify');
    fillInput(host, '过滤：', 'zzz-no-match');
    await settle(6);
    btnByText(host, '导出 TSV').click();
    await settle(6);
    expect(spy).toHaveBeenCalledWith('warning', '无表格结果可导出');
  });

  it('非空行集导出仍走复制成功（防过修守卫）', { timeout: 20000 }, async () => {
    const { host, store } = await mountXm([DONE_JOB]);
    const spy = vi.spyOn(store, 'notify');
    btnByText(host, 'Markdown').click();
    await settle(6);
    expect(spy).toHaveBeenCalledWith('success', expect.stringContaining('已复制'));
  });
});

describe('941 Xmigrate 空态工具行钮恒在场（刀④）', () => {
  it('无作业时 Markdown/TSV 钮恒在场且 disabled（v-if 消失退役）', { timeout: 20000 }, async () => {
    const { host } = await mountXm([]);
    const md = btnByText(host, 'Markdown');
    const tsv = btnByText(host, '导出 TSV');
    expect(md.disabled).toBe(true);
    expect(tsv.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="刷新任务列表"]')).toBeTruthy();
  });

  it('有作业时两导出钮 enabled（disabled 联动数据在场）', { timeout: 20000 }, async () => {
    const { host } = await mountXm([DONE_JOB]);
    expect(btnByText(host, 'Markdown').disabled).toBe(false);
    expect(btnByText(host, '导出 TSV').disabled).toBe(false);
  });
});

describe('941 Xmigrate 源码锁（刀①②③④）', () => {
  const src = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');

  it('两确认链闸读收本体首行+置位先于第一个 await；内层闸随前移退役', () => {
    const cut = (from: string, to: string) => src.slice(src.indexOf(from), src.indexOf(to));
    const startGate = cut('async function openStartConfirm', 'async function doStart');
    expect(startGate, '闸读收本体首行').toContain('if (starting.value) return;');
    expect(startGate.indexOf('starting.value = true;'), '置位必须先于第一个 await（preflight）')
      .toBeGreaterThan(-1);
    expect(startGate.indexOf('starting.value = true;'))
      .toBeLessThan(startGate.indexOf('api.xb.preflight'));
    const doStart = cut('async function doStart', '/* 作业列表');
    expect(doStart, '内层 starting 闸读随前移退役（唯一入口已闸，保留会短路死）')
      .not.toContain('if (starting.value || qr.running.value) return;');
    expect(doStart).toContain('if (qr.running.value) return;');
    const abortGate = cut('async function askAbort', 'function askResume');
    expect(abortGate, '闸读收本体首行').toContain('if (aborting.value) return;');
    expect(abortGate.indexOf('aborting.value = true;'), '置位必须先于确认窗')
      .toBeLessThan(abortGate.indexOf('askConfirm'));
    const doAbort = cut('async function doAbort', 'async function copyJobId');
    expect(doAbort, '内层 aborting 闸读/置位随前移退役').not.toContain('if (aborting.value) return;');
    expect(doAbort).not.toContain('aborting.value = true;');
  });

  it('导出空集报真+工具行头部三钮 v-if 退役（源码锁）', () => {
    const cut = (from: string, to: string) => src.slice(src.indexOf(from), src.indexOf(to));
    const tsv = cut('async function exportTsv', 'async function exportMd');
    const md = cut('async function exportMd', '/* total 未知');
    expect(tsv, 'TSV 空集 warning（936 同款话术）').toContain("notify('warning', '无表格结果可导出')");
    expect(md, 'Markdown 空集 warning（936 同款话术）').toContain("notify('warning', '无表格结果可导出')");
    /* 头部三钮恒在场：v-if 条件消失退役+margin-left:auto 收敛 Markdown 钮恒定承担
    （head 段截断法会误咬 xm-jobs-tools 的合法 v-if，改精确字面锁） */
    expect(src, 'Markdown 钮新形态（v-if 退役+推右恒定+disabled 联动）')
      .toContain('<button class="btn sm ghost" style="margin-left:auto" :disabled="!jobs.length" @click="exportMd"');
    expect(src, '旧形态反锁').not.toContain('<button v-if="jobs.length" class="btn sm ghost" style="margin-left:auto"');
    expect(src, 'TSV 钮新形态').toContain('<button class="btn sm ghost" :disabled="!jobs.length" @click="exportTsv"');
    expect(src, '刷新钮 :style 条件推右退役').not.toContain(':style="jobs.length');
  });
});
