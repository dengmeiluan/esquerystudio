/**
 * 943 批：AdhocRebuildView 走查五刀（三确认链执行闸 + prepare 竞态丢弃 + 导出钮恒在场）。
 *
 * 刀① 中止确认链执行闸置位缺失（doAbort）：闸读收本体首行而置位（aborting）落在
 *   askConfirm await 之后——确认窗挂起期中止钮可点，二击穿透双开确认窗（confirm.ts
 *   全局单例覆写 resolver?.(false) 把第一开按取消静默收掉）。修法=置位前移到第一个
 *   await 之前+try/finally 全包裹（xmigrateGateExport941/securityRebindGate940 同族口径）。
 * 刀② 确认切换链闸读+置位双缺失（doConfirmSwitch）：critical 确认窗（手输索引名守卫、
 *   挂起窗口长）整个 await 都在闸读之前——闸读形同虚设。修法=闸读收本体首行+置位前移
 *   +try/finally（templateSaveGate937：本体首行只保证读侧收敛，置侧必须早于并发窗）。
 * 刀③ 拉取源配置链无闸（pullSourceToManual）：确认窗+clusterInspect 在途全程钮可重入
 *   且无 disabled。修法=pullingSrc 闸同刀① 形态+钮面 disabled 双保险。
 * 刀④ prepare 无竞态丢弃：探测钮 disabled 是单通道闸（933-C1 通道覆盖律），IndexPicker
 *   @picked 通道绕闸——探测在途换索引再探，双在途无世代守卫：旧包后到覆写新 prep
 *   （源物理名/文档数整体回跳旧索引），旧失败 catch 把新成功 prep 清成 null。
 *   修法=prepSeq 世代守卫（本文件 watchJob watchSeq 同语言；成功/catch/finally 三支
 *   同口径=raceGuard858），reset 侧显式 prepSeq+=1+preparing=false（守卫式 finally 跳过期
 *   复位，防闸死=raceGuard858 reset 清 riskBusy 同款）。
 * 刀⑤ 最近作业导出钮 v-if="visibleJobs.length" 条件消失+exportJobsMatrix 空集静默
 *   return：过滤筛零行时 Markdown/TSV 钮整个消失（铁律 D 违例：无数据 disabled 而非
 *   v-if 消失）。修法=恒在场 disabled（exportEmptyGuard936 口径）+空集 warning
 *   「无表格结果可导出」（exportEmptyGuard936 同款话术）+刷新钮条件 :style 推右退役（位置恒定）。
 *
 * 锁定形态：行为锚（视图全真挂载+memory router+askConfirm 手控回包）+源码锁双通道；
 * raceGuard858 的 loadDateRisks 身份守卫行为锚与 reset 清 riskBusy 源码锁、adhocStateMachine
 * 进入矩阵、524/529 作业表结构锁、permGating 按钮字面锁、w10ReduceSteps525 的
 * dismissable/critical 零触碰锁共处零扰动。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { draftStorageKey } from '../composables/useScopedDraft';

const askConfirmFn = vi.fn();
const prepareFn = vi.fn();
const statusFn = vi.fn();
const jobsFn = vi.fn();
const abortFn = vi.fn();
const confirmSwitchFn = vi.fn();
const startFn = vi.fn();
const inspectFn = vi.fn();
const aliasesFn = vi.fn();

vi.mock('../composables/confirm', () => ({
  askConfirm: (...a: any[]) => askConfirmFn(...a),
}));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      aliases: (...a: any[]) => aliasesFn(...a),
      clusterInspect: (...a: any[]) => inspectFn(...a),
      adhoc: {
        ...actual.api.adhoc,
        prepare: (...a: any[]) => prepareFn(...a),
        status: (...a: any[]) => statusFn(...a),
        jobs: (...a: any[]) => jobsFn(...a),
        abort: (...a: any[]) => abortFn(...a),
        confirmSwitch: (...a: any[]) => confirmSwitchFn(...a),
        start: (...a: any[]) => startFn(...a),
      },
    },
  };
});
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { void emit; return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: async () => true };
});

import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];
let pendingConfirms: { res: (v: boolean) => void }[] = [];
let pendingPrepares: { id: string; res: (v: any) => void; rej: (e: any) => void }[] = [];
let pendingAborts: { res: (v: any) => void }[] = [];
let pendingSwitches: { res: (v: any) => void }[] = [];
let pendingInspects: { res: (v: any) => void }[] = [];

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const AWAIT_JOB = {
  jobId: 'await-1', logicalName: 'bond_index', strategy: 'WRITE_BLOCK', status: 'RUNNING',
  stage: 'AWAIT_CONFIRM', awaitConfirmSince: Date.now(), startedAt: 1700000000000,
};
const DONE_JOB = {
  jobId: 'done-1', logicalName: 'other_idx', strategy: 'MANUAL', status: 'DONE',
  stage: 'DONE', startedAt: 1700000001000, tookMs: 5000,
};
const STALE_A = {
  index: 'probe', isAlias: true, physicals: ['stale-aaa-v1'], sourcePhysical: 'stale-aaa-src',
  docCount: 11, settingsJson: '{"index":{"stale":true}}',
  mappingJson: '{"properties":{"a":{"type":"keyword"}}}', suggestedDest: 'stale-aaa-v2',
  timeFieldCandidates: [],
};
const FRESH_B = {
  index: 'probe-bb', isAlias: true, physicals: ['fresh-bbb-v1'], sourcePhysical: 'fresh-bbb-src',
  docCount: 22, settingsJson: '{"index":{"fresh":true}}',
  mappingJson: '{"properties":{"b":{"type":"keyword"}}}', suggestedDest: 'fresh-bbb-v2',
  timeFieldCandidates: [{ field: 'ts', type: 'date' }],
};

async function mountAR(opts: { jobs?: any[]; status?: any; deleteOld?: boolean } = {}): Promise<{ host: HTMLElement; store: ReturnType<typeof useAppStore> }> {
  jobsFn.mockResolvedValue(opts.jobs ?? []);
  statusFn.mockImplementation(async (id: string) => (opts.status ?? AWAIT_JOB));
  if (opts.deleteOld) sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'delete-old-index'), '1');
  const View = (await import('../views/AdhocRebuildView.vue')).default;
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

function releaseConfirm(v: boolean) {
  const p = pendingConfirms.shift();
  if (!p) throw new Error('no pending confirm');
  p.res(v);
}

/** 打开 RUNNING/AWAIT_CONFIRM 作业的执行监控步（真实用户路径：最近作业表 Eye 钮） */
async function openMonitorStep(host: HTMLElement, jobRow: any) {
  const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
  const row = rows.find(tr => (tr.textContent || '').includes(jobRow.jobId));
  expect(row, '最近作业表必须渲染出该作业行').toBeTruthy();
  (row!.querySelector('button[title="查看任务详情"]') as HTMLButtonElement).click();
  await settle(10);
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  pendingConfirms = []; pendingPrepares = []; pendingAborts = []; pendingSwitches = []; pendingInspects = [];
  askConfirmFn.mockReset().mockImplementation(() => new Promise<boolean>((res) => { pendingConfirms.push({ res }); }));
  prepareFn.mockReset().mockImplementation((idx: string) =>
    new Promise((res, rej) => { pendingPrepares.push({ id: String(idx), res, rej }); }));
  statusFn.mockReset();
  jobsFn.mockReset();
  abortFn.mockReset().mockImplementation(() =>
    new Promise((res) => { pendingAborts.push({ res }); }));
  confirmSwitchFn.mockReset().mockImplementation(() =>
    new Promise((res) => { pendingSwitches.push({ res }); }));
  startFn.mockReset().mockResolvedValue({ jobId: 'j-new' });
  inspectFn.mockReset().mockImplementation(() =>
    new Promise((res) => { pendingInspects.push({ res }); }));
  aliasesFn.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('943 刀① 中止确认链执行闸（doAbort）', () => {
  it('确认窗挂起期中止钮即禁用+二击零穿透：确认恒 1、API 单发', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ jobs: [AWAIT_JOB], status: AWAIT_JOB });
    await openMonitorStep(host, AWAIT_JOB);
    const btn = btnByText(host, '中止并解除阻断');
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    expect(pendingConfirms.length).toBe(1);
    /* 闸置位前移后中止钮在确认窗期间即禁用（穿透窗消除） */
    expect(btn.disabled).toBe(true);
    btn.click();                                    /* 二击：闸读+钮面禁用双保险 */
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    releaseConfirm(true);
    await settle(8);
    expect(abortFn).toHaveBeenCalledTimes(1);       /* 单发铁证 */
  });

  it('取消路径复位防闸死：确认窗取消后可再次发起', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ jobs: [AWAIT_JOB], status: AWAIT_JOB });
    await openMonitorStep(host, AWAIT_JOB);
    const btn = btnByText(host, '中止并解除阻断');
    btn.click();
    await settle(6);
    releaseConfirm(false);
    await settle(6);
    expect(btn.disabled).toBe(false);
    expect(abortFn).not.toHaveBeenCalled();
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(2);  /* 可再进确认 */
    releaseConfirm(true);
    await settle(8);
    expect(abortFn).toHaveBeenCalledTimes(1);
  });

  it('提交路径 API 在途钉住至落定复位（现状守卫）', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ jobs: [AWAIT_JOB], status: AWAIT_JOB });
    await openMonitorStep(host, AWAIT_JOB);
    const btn = btnByText(host, '中止并解除阻断');
    btn.click();
    await settle(6);
    releaseConfirm(true);
    await settle(8);
    expect(pendingAborts.length).toBe(1);
    expect(btn.disabled).toBe(true);                /* API 在途钉住 */
    /* 回包保持 RUNNING+AWAIT_CONFIRM：横幅常驻，复位读数才有效（终态回包会卸载横幅，
     按钮引用变脱管节点读数冻结=940-C1 脱管读数同族，不作复位判据） */
    pendingAborts[0]!.res({ ...AWAIT_JOB });
    await settle(8);
    expect(btnByText(host, '中止并解除阻断').disabled).toBe(false); /* 落定复位 */
  });
});

describe('943 刀② 确认切换链执行闸（doConfirmSwitch）', () => {
  it('critical 确认窗挂起期钮即禁用+二击零穿透：确认恒 1、切换单发', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ jobs: [AWAIT_JOB], status: AWAIT_JOB, deleteOld: true });
    await openMonitorStep(host, AWAIT_JOB);
    const btn = btnByText(host, '确认切换');
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    expect(askConfirmFn.mock.calls[0]![0].level).toBe('critical'); /* critical 门零触碰（w10 锁同守） */
    expect(btn.disabled).toBe(true);
    btn.click();                                    /* 二击：闸读+钮面禁用双保险 */
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    releaseConfirm(true);
    await settle(8);
    expect(confirmSwitchFn).toHaveBeenCalledTimes(1);
  });

  it('取消路径复位防闸死：critical 取消后可再次发起', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ jobs: [AWAIT_JOB], status: AWAIT_JOB, deleteOld: true });
    await openMonitorStep(host, AWAIT_JOB);
    const btn = btnByText(host, '确认切换');
    btn.click();
    await settle(6);
    releaseConfirm(false);
    await settle(6);
    expect(btn.disabled).toBe(false);
    expect(confirmSwitchFn).not.toHaveBeenCalled();
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(2);
    releaseConfirm(true);
    await settle(8);
    expect(confirmSwitchFn).toHaveBeenCalledTimes(1);
  });
});

describe('943 刀③ 拉取源配置链执行闸（pullSourceToManual）', () => {
  async function gotoManualAndPull(host: HTMLElement) {
    const inp = host.querySelector<HTMLInputElement>('.ixp-inp')!;
    inp.value = 'src-idx';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(4);
    const tabs = host.querySelectorAll<HTMLButtonElement>('.ar-input-tabs button');
    tabs[1]!.click();                               /* 切手动模式 */
    await settle(4);
    btnByText(host, '拉取源配置').click();
    await settle(6);
  }

  it('确认窗挂起期拉取钮即禁用+二击零穿透：确认恒 1、补拉单发', { timeout: 20000 }, async () => {
    const { host } = await mountAR();
    await gotoManualAndPull(host);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    const btn = btnByText(host, '拉取源配置');
    expect(btn.disabled).toBe(true);
    btn.click();                                    /* 二击：闸读+钮面禁用双保险 */
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    releaseConfirm(true);
    await settle(8);
    expect(inspectFn).toHaveBeenCalledTimes(1);     /* prep 空 → clusterInspect 补拉，单发 */
  });

  it('取消路径复位防闸死：取消后可再进确认', { timeout: 20000 }, async () => {
    const { host } = await mountAR();
    await gotoManualAndPull(host);
    const btn = btnByText(host, '拉取源配置');
    releaseConfirm(false);
    await settle(6);
    expect(btn.disabled).toBe(false);
    expect(inspectFn).not.toHaveBeenCalled();
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(2);
    releaseConfirm(true);
    await settle(8);
    expect(inspectFn).toHaveBeenCalledTimes(1);
  });
});

describe('943 刀④ prepare 竞态丢弃（IndexPicker 通道绕钮面闸）', () => {
  async function mountWithIndices() {
    const { host, store } = await mountAR();
    store.indices = [
      { index: 'probe-aa', health: 'green' },
      { index: 'probe-bb', health: 'green' },
    ] as any;
    await settle(4);
    const inp = host.querySelector<HTMLInputElement>('.ixp-inp')!;
    inp.value = 'probe';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(4);
    btnByText(host, '探测').click();                /* 通道一：探测钮（慢包） */
    await settle(6);
    inp.focus();                                    /* 重开候选弹层（探测钮点击关层） */
    await settle(6);
    const items = [...document.querySelectorAll<HTMLElement>('.ixp-item')];
    const target = items.find(i => (i.textContent || '').includes('probe-bb'));
    expect(target, '候选弹层必须列出 probe-bb').toBeTruthy();
    target!.click();                                /* 通道二：IndexPicker picked（快包） */
    await settle(6);
    expect(pendingPrepares.map(p => p.id)).toEqual(['probe', 'probe-bb']);
    return { host };
  }

  it('探测在途换索引再探：新包成功存活，旧包后到不得覆写 prep', { timeout: 20000 }, async () => {
    const { host } = await mountWithIndices();
    pendingPrepares.find(p => p.id === 'probe-bb')!.res(FRESH_B);   /* 快包先落 */
    await settle(8);
    expect(host.textContent).toContain('fresh-bbb-src');
    pendingPrepares.find(p => p.id === 'probe')!.res(STALE_A);      /* 旧包后到 */
    await settle(8);
    expect(host.textContent).toContain('fresh-bbb-src');            /* 新包存活 */
    expect(host.textContent).not.toContain('stale-aaa-src');        /* 旧包不得覆写 */
  });

  it('旧包失败后到不得把新包成功清成失败样貌', { timeout: 20000 }, async () => {
    const { host } = await mountWithIndices();
    pendingPrepares.find(p => p.id === 'probe-bb')!.res(FRESH_B);
    await settle(8);
    pendingPrepares.find(p => p.id === 'probe')!.rej(new Error('STALE-AAA-FAIL')); /* 旧失败后到 */
    await settle(8);
    expect(host.querySelector('.ar-probe-err')).toBeNull();         /* 零失败样貌 */
    expect(host.textContent).toContain('fresh-bbb-src');            /* 新包成功不被清 */
  });
});

describe('943 刀⑤ 导出空集报真+工具行钮恒在场', () => {
  it('过滤筛零行时 Markdown/TSV 钮恒在场且 disabled（v-if 消失退役）', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ jobs: [DONE_JOB], status: DONE_JOB });
    const inp = host.querySelector<HTMLInputElement>('.ar-jobs-kw')!;
    inp.value = 'zzz-no-match';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(8);
    expect(host.textContent).toContain('0/1 条命中');
    const md = btnByText(host, 'Markdown');
    const tsv = btnByText(host, '导出 TSV');
    expect(md.disabled).toBe(true);
    expect(tsv.disabled).toBe(true);
  });

  it('有行集时两导出钮 enabled 且导出成功（防过修守卫）', { timeout: 20000 }, async () => {
    const { host, store } = await mountAR({ jobs: [DONE_JOB], status: DONE_JOB });
    const spy = vi.spyOn(store, 'notify');
    expect(btnByText(host, 'Markdown').disabled).toBe(false);
    expect(btnByText(host, '导出 TSV').disabled).toBe(false);
    btnByText(host, 'Markdown').click();
    await settle(8);
    expect(spy).toHaveBeenCalledWith('success', expect.stringContaining('已复制'));
  });
});

describe('943 源码锁（刀①②③④⑤）', () => {
  const src = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');
  const cut = (from: string, to: string) => src.slice(src.indexOf(from), src.indexOf(to));

  it('三确认链闸读收本体首行+置位先于第一个 await', () => {
    const abortGate = cut('async function doAbort', 'const blockNow');
    expect(abortGate, '闸读收本体首行').toContain('if (!job.value || aborting.value) return;');
    expect(abortGate.indexOf('aborting.value = true;'), '置位必须先于确认窗')
      .toBeGreaterThan(-1);
    expect(abortGate.indexOf('aborting.value = true;')).toBeLessThan(abortGate.indexOf('askConfirm'));
    expect(abortGate, 'try/finally 全包裹（取消路径复位防闸死）').toContain('finally');

    const confirmGate = cut('async function doConfirmSwitch', 'const jobsLoading');
    expect(confirmGate, '闸读收本体首行（现状在 critical 确认窗之后=形同虚设）')
      .toContain('if (!job.value || confirming.value) return;');
    expect(confirmGate.indexOf('confirming.value = true;'), '置位必须先于 critical 确认窗')
      .toBeGreaterThan(-1);
    expect(confirmGate.indexOf('confirming.value = true;')).toBeLessThan(confirmGate.indexOf('askConfirm'));
    expect(confirmGate).toContain('finally');

    const pullGate = cut('async function pullSourceToManual', 'function applyManual');
    expect(pullGate, '闸读收本体首行').toContain('if (pullingSrc.value) return;');
    expect(pullGate.indexOf('pullingSrc.value = true;'), '置位必须先于确认窗')
      .toBeGreaterThan(-1);
    expect(pullGate.indexOf('pullingSrc.value = true;')).toBeLessThan(pullGate.indexOf('askConfirm'));
    expect(pullGate).toContain('finally');
    expect(pullGate, '空索引名 warning 保真（不因收闸丢提示）')
      .toContain('先在上方选择要重建的索引名，才能拉取源配置');
    /* 999 随迁：拉取钮 disabled 追加权限闸位（canPullSrc），在途闸位保留 */
    expect(src, '拉取钮 disabled 双保险（在途闸+权限闸）').toMatch(/data-ar-pull-src[^>]*:disabled="pullingSrc \|\| !canPullSrc"/);
    expect(src, '旧形态反锁：仅在途闸、缺权限不禁用的形态不得回潮').not.toMatch(/data-ar-pull-src[^>]*:disabled="pullingSrc"/);
  });

  it('prepare 世代守卫：prepSeq 三支同口径+reset 侧显式清场', () => {
    const doPrepare = cut('async function doPrepare', '/* ═══ W10');
    expect(doPrepare, '世代锚随闸起').toContain('const seq = ++prepSeq;');
    expect(doPrepare, '成功支竞态丢弃').toContain('if (seq !== prepSeq) return;');
    expect(doPrepare, 'catch 支竞态丢弃（旧失败不清新成功）').toContain('if (seq !== prepSeq) return;');
    expect(doPrepare, 'finally 支守卫复位（过期支跳过，防闸死）').toContain('if (seq === prepSeq) preparing.value = false;');
    const resetBlock = src.slice(src.indexOf('function reset()'), src.indexOf('/* 热Setting页'));
    expect(resetBlock, 'reset 显式失效在途 prepare 世代').toContain('prepSeq += 1;');
    expect(resetBlock, 'reset 显式清 preparing（守卫式 finally 跳过期复位防闸死）').toContain('preparing.value = false;');
  });

  it('导出空集报真+工具行三钮 v-if 退役（exportEmptyGuard936 同款话术）', () => {
    const tsv = cut("async function exportJobsMatrix(fmt: 'tsv'", '/* 轮次表 Σ');
    expect(tsv, '空集 warning（936 同款话术）').toContain("notify('warning', '无表格结果可导出')");
    /* 导出两钮恒在场：v-if 条件消失退役+disabled 联动过滤行集（936 口径） */
    expect(src, 'Markdown 钮新形态').toContain(':disabled="!visibleJobs.length" @click="exportJobsMatrix(\'md\')"');
    expect(src, 'TSV 钮新形态').toContain(':disabled="!visibleJobs.length" @click="exportJobsMatrix(\'tsv\')"');
    expect(src, '旧形态反锁').not.toContain('<button v-if="visibleJobs.length"');
    expect(src, '刷新钮 :style 条件推右退役').not.toContain(':style="visibleJobs.length');
  });
});
