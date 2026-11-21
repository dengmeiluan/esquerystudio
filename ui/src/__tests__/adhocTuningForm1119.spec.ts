/**
 * 托管重建向导：执行参数（限流/slices）表单 + 失败样本展示 + 宿主重启孤儿提示。
 *
 * 行为锁（真挂载 + memory router + api 手控回包，adhocHonestFeedback1119 同款基建）：
 *  · 步 2 执行参数小区渲染：限流数字框（placeholder「-1 不限」）/slices 下拉（auto 缺省，
 *    自定义档条件出数字框）。
 *  · 校验红字：限流 0 与非 -1 负数 →「限流需为正数，-1 或留空表示不限」；
 *    slices 自定义 0/负数/小数 →「slices 需 >=1，或选 auto」；非法时「下一步」禁用。
 *  · 请求体组装「缺省不发键」：空/-1/auto 键整体缺席；正数发 requestsPerSecond；
 *    自定义整数发 slices 数字；非法值点「启动托管重建」不发出（start 未被调）。
 *  · 步 3 预览回显：「未限流 · slices auto」/「限流 X docs/s · slices N」。
 *  · 失败样本：job.failures 缺席不渲染；3 条默认全展；>=6 条默认折叠显前 5+
 *    「展开全部 N 条」，点击展开。
 *  · 孤儿作业提示：FAILED 且 error 含「重启」→ 提示+「返回向导」钮（reset 回步 0）。
 *  · reset 清场：限流/slices 草稿归缺省（键清除、档位回 auto）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { draftStorageKey } from '../composables/useScopedDraft';

const askConfirmFn = vi.fn();
const prepareFn = vi.fn();
const statusFn = vi.fn();
const jobsFn = vi.fn();
const abortFn = vi.fn();
const confirmSwitchFn = vi.fn();
const reindexPreviewFn = vi.fn();
const startFn = vi.fn();

vi.mock('../composables/confirm', () => ({
  askConfirm: (...a: any[]) => askConfirmFn(...a),
}));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      reindexPreview: (...a: any[]) => reindexPreviewFn(...a),
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

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const PREP_MOCK = {
  index: 'bond_index', isAlias: true, physicals: ['bond_v1'],
  sourcePhysical: 'bond_v1', docCount: 12345,
  settingsJson: '{"index":{"number_of_replicas":1}}',
  mappingJson: JSON.stringify({ properties: { a: { type: 'keyword' } } }),
  suggestedDest: 'bond_v2', timeFieldCandidates: [{ field: 'ts', type: 'date' }],
};
const START_RET = {
  jobId: 'j-tuning-1',
  job: {
    jobId: 'j-tuning-1', logicalName: 'bond_index', strategy: 'INCREMENTAL',
    status: 'RUNNING', stage: 'REINDEX', startedAt: 1700000000000,
    sourcePhysical: 'bond_v1', destPhysical: 'bond_v2',
  },
};

/** FAILED 作业回包（进监控步的载体；failures/error 可覆写） */
const failedJob = (over: Partial<any> = {}) => ({
  jobId: 'j-fail-1', logicalName: 'bond_index', strategy: 'INCREMENTAL',
  status: 'FAILED', stage: 'DONE', error: '重建失败：reindex 部分文档异常',
  startedAt: 1700000000000, finishedAt: 1700000009000,
  sourcePhysical: 'bond_v1', destPhysical: 'bond_v2',
  ...over,
});

interface MountOpts {
  jobs?: any[];
  status?: any;
  prepare?: any;
  step?: string;
  indexName?: string;
  strategy?: string;
  rps?: string;
  slices?: string;
}

async function mountAR(opts: MountOpts = {}): Promise<{ host: HTMLElement; store: ReturnType<typeof useAppStore> }> {
  jobsFn.mockResolvedValue(opts.jobs ?? []);
  statusFn.mockImplementation(async () => (opts.status ?? failedJob()));
  prepareFn.mockImplementation(async () => (opts.prepare ?? PREP_MOCK));
  reindexPreviewFn.mockResolvedValue({ estimatedTargetBytes: 123456789, docs: 12345, avgDocBytes: 100000 });
  startFn.mockResolvedValue(START_RET);
  const K = (f: string) => draftStorageKey({ route: 'adhoc' }, f);
  if (opts.step) sessionStorage.setItem(K('step'), opts.step);
  if (opts.indexName) sessionStorage.setItem(K('index-name'), opts.indexName);
  if (opts.strategy) sessionStorage.setItem(K('strategy'), opts.strategy);
  if (opts.rps != null) sessionStorage.setItem(K('tuningRps'), opts.rps);
  if (opts.slices != null) sessionStorage.setItem(K('tuningSlices'), opts.slices);
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

const setInput = (el: HTMLInputElement, v: string) => {
  el.value = v;
  el.dispatchEvent(new Event('input'));
};
/* NInputNumber 迁移随迁：data-test 锚在组件根（attrs 透传），输入框是根内 <input>——
 placeholder/value 读写与 input 事件都落在内部 input 上 */
const numInputOf = (host: ParentNode, sel: string): HTMLInputElement => {
  const root = host.querySelector(sel);
  if (!root) throw new Error('number root not found: ' + sel);
  const inp = root.querySelector<HTMLInputElement>('input');
  if (!inp) throw new Error('inner <input> not found under ' + sel);
  return inp;
};
/* slices 档位下拉改 NSelect（data-test 锚保留在组件根）——naive 菜单 happy-dom 下不可点开，
 档位切换走程序化通道（本 spec doStart 直调同先例）：computed 可写，写值与用户点选同 setter */
const setupOf = (host: HTMLElement) => (host.querySelector('.ahr') as any).__vueParentComponent.setupState;
async function setSlicesMode(host: HTMLElement, mode: 'auto' | 'custom') {
  setupOf(host).tuningSlicesMode = mode;
  await settle(4);
}

/** 从最近作业表 Eye 钮进入指定作业的执行监控步（真实用户路径） */
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
  askConfirmFn.mockReset().mockImplementation(() => Promise.resolve(true));
  prepareFn.mockReset();
  statusFn.mockReset();
  jobsFn.mockReset();
  abortFn.mockReset();
  confirmSwitchFn.mockReset();
  reindexPreviewFn.mockReset();
  startFn.mockReset();
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('执行参数表单：渲染与校验', () => {
  it('步 2 在场：限流数字框（placeholder「-1 不限」）+ slices 下拉缺省 auto，自定义数字框条件出现', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ step: '2', indexName: 'bond_index', strategy: 'INCREMENTAL' });
    const rps = host.querySelector('[data-test="ar-tuning-rps"]');
    expect(rps, '限流输入框在场（NInputNumber 根，data-test 锚保留）').toBeTruthy();
    expect(numInputOf(host, '[data-test="ar-tuning-rps"]').placeholder, 'placeholder 落内部 input').toBe('-1 不限');
    expect(rps!.getAttribute('title'), 'title 落组件根（attrs 透传）').toContain('requests_per_second');
    const mode = host.querySelector('[data-test="ar-tuning-slices-mode"]');
    expect(mode, 'slices 下拉在场（NSelect 根，data-test 锚保留）').toBeTruthy();
    expect(mode!.textContent, '缺省档回显 auto（自动）').toContain('auto（自动）');
    expect(host.querySelector('[data-test="ar-tuning-slices-num"]'), 'auto 档不出数字框').toBeNull();
    await setSlicesMode(host, 'custom');
    expect(host.querySelector('[data-test="ar-tuning-slices-num"]'), '切自定义档出数字框').toBeTruthy();
    expect(host.textContent).toContain('执行参数');
  });

  it('限流输 0 与非 -1 负数给红字；-1 与留空不报；红字在场时「下一步」禁用', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ step: '2', indexName: 'bond_index', strategy: 'INCREMENTAL' });
    const rps = () => numInputOf(host, '[data-test="ar-tuning-rps"]');
    setInput(rps(), '0');
    await settle(4);
    const err = host.querySelector('[data-test="ar-tuning-rps-err"]');
    expect(err, '0 即时红字').toBeTruthy();
    expect(err!.textContent).toContain('限流需为正数，-1 或留空表示不限');
    expect(btnByText(host, '下一步：确认预览').disabled, '非法时下一步不放行').toBe(true);
    setInput(rps(), '-2');
    await settle(4);
    expect(host.querySelector('[data-test="ar-tuning-rps-err"]')!.textContent).toContain('限流需为正数');
    setInput(rps(), '-1');
    await settle(4);
    expect(host.querySelector('[data-test="ar-tuning-rps-err"]'), '-1 不限不报错').toBeNull();
    expect(btnByText(host, '下一步：确认预览').disabled, '合法后放行').toBe(false);
    setInput(rps(), '');
    await settle(4);
    expect(host.querySelector('[data-test="ar-tuning-rps-err"]'), '留空不报错').toBeNull();
  });

  it('slices 自定义输 0/负数/小数给红字「slices 需 >=1，或选 auto」；整数 1 合法；auto 档不校验', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ step: '2', indexName: 'bond_index', strategy: 'INCREMENTAL' });
    await setSlicesMode(host, 'custom');
    const num = () => numInputOf(host, '[data-test="ar-tuning-slices-num"]');
    setInput(num(), '0');
    await settle(4);
    expect(host.querySelector('[data-test="ar-tuning-slices-err"]')!.textContent).toContain('slices 需 >=1，或选 auto');
    setInput(num(), '-3');
    await settle(4);
    expect(host.querySelector('[data-test="ar-tuning-slices-err"]'), '负数同报').toBeTruthy();
    setInput(num(), '1.5');
    await settle(4);
    expect(host.querySelector('[data-test="ar-tuning-slices-err"]'), '小数同报（须整数）').toBeTruthy();
    setInput(num(), '4');
    await settle(4);
    expect(host.querySelector('[data-test="ar-tuning-slices-err"]'), '整数 4 合法').toBeNull();
    await setSlicesMode(host, 'auto');
    expect(host.querySelector('[data-test="ar-tuning-slices-err"]'), '回 auto 档不再校验').toBeNull();
  });
});

describe('执行参数：start 请求体组装（缺省不发键）', () => {
  /** 走真实路径：step2 填参 → 下一步 → 启动托管重建，返回 start 收到的请求体 */
  async function startWith(host: HTMLElement, fill?: (h: HTMLElement) => Promise<void>) {
    startFn.mockClear(); /* 同用例两段挂载的合法/非法路径分段计数 */
    if (fill) await fill(host);
    btnByText(host, '下一步：确认预览').click();
    await settle(8);
    btnByText(host, '启动托管重建').click();
    await settle(10);
    expect(startFn, '合法路径必须发出 start').toHaveBeenCalledTimes(1);
    return startFn.mock.calls[0]![0] as Record<string, any>;
  }

  it('缺省（空/-1 均未填、slices auto）：requestsPerSecond/slices 键整体缺席', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ step: '2', indexName: 'bond_index', strategy: 'INCREMENTAL' });
    const body = await startWith(host);
    expect('requestsPerSecond' in body, '缺省不发限流键').toBe(false);
    expect('slices' in body, 'auto 不发 slices 键').toBe(false);
    expect(body.index).toBe('bond_index');
  });

  it('限流 -1 同样不发键；正数 500 发 requestsPerSecond: 500', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ step: '2', indexName: 'bond_index', strategy: 'INCREMENTAL' });
    const body = await startWith(host, async h => {
      setInput(numInputOf(h, '[data-test="ar-tuning-rps"]'), '-1');
      await settle(4);
    });
    expect('requestsPerSecond' in body, '-1=不限，不发键').toBe(false);
    apps.pop()!.unmount();
    document.body.innerHTML = '';
    const h2 = (await mountAR({ step: '2', indexName: 'bond_index', strategy: 'INCREMENTAL' })).host;
    const body2 = await startWith(h2, async h => {
      setInput(numInputOf(h, '[data-test="ar-tuning-rps"]'), '500');
      await settle(4);
    });
    expect(body2.requestsPerSecond).toBe(500);
    expect('slices' in body2).toBe(false);
  });

  it('slices 自定义整数 4 发数字；小数非法点启动不发出（start 零调用+报错 toast）', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ step: '2', indexName: 'bond_index', strategy: 'INCREMENTAL' });
    const body = await startWith(host, async h => {
      await setSlicesMode(h, 'custom');
      setInput(numInputOf(h, '[data-test="ar-tuning-slices-num"]'), '4');
      await settle(4);
    });
    expect(body.slices).toBe(4);
    expect('requestsPerSecond' in body).toBe(false);
    apps.pop()!.unmount();
    document.body.innerHTML = '';
    const { host: h2, store: store2 } = await mountAR({ step: '2', indexName: 'bond_index', strategy: 'INCREMENTAL' });
    startFn.mockClear(); /* 前段合法调用不计入本段「零调用」断言 */
    await setSlicesMode(h2, 'custom');
    setInput(numInputOf(h2, '[data-test="ar-tuning-slices-num"]'), '0');
    await settle(4);
    expect(btnByText(h2, '下一步：确认预览').disabled, '非法 slices 时下一步禁用').toBe(true);
    const spy = vi.spyOn(store2, 'notify');
    /* 程序化通道兜底：直接调 doStart 也必须被守卫拦下（Enter/程序化同门） */
    await setupOf(h2).doStart();
    await settle(8);
    expect(startFn, '非法值不得发出 start').not.toHaveBeenCalled();
    expect(spy.mock.calls.some(c => c[0] === 'error'), '守卫需报错提示').toBe(true);
    spy.mockRestore();
  });
});

describe('执行参数：步 3 预览回显', () => {
  it('缺省回显「未限流 · slices auto」；设值回显「限流 500 docs/s · slices 4」', { timeout: 20000 }, async () => {
    const { host } = await mountAR({ step: '2', indexName: 'bond_index', strategy: 'INCREMENTAL' });
    btnByText(host, '下一步：确认预览').click();
    await settle(8);
    const row = host.querySelector('[data-test="pv-tuning"]');
    expect(row, '预览行在场').toBeTruthy();
    expect(row!.textContent).toContain('未限流 · slices auto');
    apps.pop()!.unmount();
    document.body.innerHTML = '';
    const h2 = (await mountAR({ step: '2', indexName: 'bond_index', strategy: 'INCREMENTAL', rps: '500', slices: '4' })).host;
    expect(h2.querySelector('[data-test="ar-tuning-slices-mode"]')!.textContent, '草稿恢复自定义档（NSelect 回显）').toContain('自定义数字');
    expect(numInputOf(h2, '[data-test="ar-tuning-slices-num"]').value, '草稿恢复 4（NInputNumber 回显）').toBe('4');
    btnByText(h2, '下一步：确认预览').click();
    await settle(8);
    expect(h2.querySelector('[data-test="pv-tuning"]')!.textContent).toContain('限流 500 docs/s · slices 4');
  });
});

describe('失败文档样本（步 4 监控）', () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({
    type: 'map_document_exception', reason: `字段类型冲突 #${i + 1}`,
    ...(i % 2 === 0 ? { index: 'bond_v2', id: `doc-${i + 1}` } : {}),
  }));

  it('failures 缺席不渲染；3 条默认全展（无折叠钮），每行 [type] reason（index/id 在场时附）', { timeout: 20000 }, async () => {
    const job = failedJob();
    const { host } = await mountAR({ jobs: [job], status: job });
    await openMonitorStep(host, job);
    expect(host.querySelector('[data-test="ar-failure-samples"]'), '数组缺席不渲染').toBeNull();
    apps.pop()!.unmount();
    document.body.innerHTML = '';
    const j3 = failedJob({ failures: mk(3) });
    const h2 = (await mountAR({ jobs: [j3], status: j3 })).host;
    await openMonitorStep(h2, j3);
    const box = h2.querySelector('[data-test="ar-failure-samples"]');
    expect(box, '3 条样本在场').toBeTruthy();
    expect(box!.textContent).toContain('失败文档样本（前 3 条）');
    for (let i = 0; i < 3; i++) {
      expect(h2.querySelector(`[data-test="ar-failure-item-${i}"]`), `第 ${i + 1} 条渲染`).toBeTruthy();
    }
    const first = h2.querySelector('[data-test="ar-failure-item-0"]')!;
    expect(first.textContent).toContain('[map_document_exception]');
    expect(first.textContent).toContain('字段类型冲突 #1');
    expect(first.textContent).toContain('（bond_v2/doc-1）');
    expect(h2.querySelector('[data-test="ar-failure-item-1"]')!.textContent, '无 index/id 的条目不附括号').not.toContain('（');
    expect(h2.querySelector('[data-test="ar-failure-expand"]'), '少于 6 条无展开钮').toBeNull();
  });

  it('6 条默认折叠：只显前 5 +「展开全部 6 条」，点击展开补齐第 6 条', { timeout: 20000 }, async () => {
    const job = failedJob({ failures: mk(6) });
    const { host } = await mountAR({ jobs: [job], status: job });
    await openMonitorStep(host, job);
    for (let i = 0; i < 5; i++) {
      expect(host.querySelector(`[data-test="ar-failure-item-${i}"]`), `前 5 条在场（${i}）`).toBeTruthy();
    }
    expect(host.querySelector('[data-test="ar-failure-item-5"]'), '第 6 条默认折叠').toBeNull();
    const expand = host.querySelector<HTMLButtonElement>('[data-test="ar-failure-expand"]');
    expect(expand, '展开钮在场').toBeTruthy();
    expect(expand!.textContent).toContain('展开全部 6 条');
    expand!.click();
    await settle(6);
    expect(host.querySelector('[data-test="ar-failure-item-5"]')!, '展开后第 6 条补齐').toBeTruthy();
  });
});

describe('宿主重启孤儿作业提示', () => {
  it('FAILED 且 error 含「重启」：提示在场 +「返回向导」钮点击 reset 回步 0', { timeout: 20000 }, async () => {
    const job = failedJob({ error: '作业中断：宿主重启，作业内存态丢失（目标索引已保留）' });
    const { host } = await mountAR({ jobs: [job], status: job });
    await openMonitorStep(host, job);
    const hint = host.querySelector('[data-test="ar-orphan-hint"]');
    expect(hint, '孤儿提示在场').toBeTruthy();
    expect(hint!.textContent).toContain('宿主重启导致中断：目标索引已保留，可返回向导重新发起');
    (host.querySelector('[data-test="ar-orphan-back"]') as HTMLButtonElement).click();
    await settle(8);
    expect(host.textContent, '返回后回选索引步').toContain('选择要重建的逻辑索引名');
    expect(host.querySelector('[data-test="ar-orphan-hint"]'), '清场后提示消退').toBeNull();
  });

  it('error 不含「重启」或状态非 FAILED：提示不出', { timeout: 20000 }, async () => {
    const job = failedJob({ error: 'reindex 失败：cluster read_only block' });
    const { host } = await mountAR({ jobs: [job], status: job });
    await openMonitorStep(host, job);
    expect(host.querySelector('[data-test="ar-orphan-hint"]'), '非重启错误不出孤儿提示').toBeNull();
    apps.pop()!.unmount();
    document.body.innerHTML = '';
    const running = {
      jobId: 'j-run-1', logicalName: 'bond_index', strategy: 'INCREMENTAL',
      status: 'RUNNING', stage: 'REINDEX', error: '宿主重启残留文案',
      startedAt: Date.now(), sourcePhysical: 'bond_v1', destPhysical: 'bond_v2',
    };
    const h2 = (await mountAR({ jobs: [running], status: running })).host;
    await openMonitorStep(h2, running);
    expect(h2.querySelector('[data-test="ar-orphan-hint"]'), '非 FAILED 不出孤儿提示').toBeNull();
  });
});

describe('reset 清场：执行参数归缺省', () => {
  it('监控步「再来一次」后：tuningRps/tuningSlices 草稿键清除、slices 档回 auto、红字熄灭', { timeout: 20000 }, async () => {
    const K = (f: string) => draftStorageKey({ route: 'adhoc' }, f);
    const job = failedJob({ error: '作业中断：宿主重启' });
    const { host } = await mountAR({
      jobs: [job], status: job, indexName: 'bond_index',
      strategy: 'INCREMENTAL', rps: '0', slices: '4',
    });
    await openMonitorStep(host, job);
    expect(host.querySelector('[data-test="ar-orphan-hint"]'), '前置：孤儿提示在场').toBeTruthy();
    btnByText(host, '再来一次').click();
    await settle(8);
    expect(sessionStorage.getItem(K('tuningRps')), '限流草稿归默认=清除').toBeNull();
    expect(sessionStorage.getItem(K('tuningSlices')), 'slices 草稿归默认=清除').toBeNull();
    /* 走回步 2 验证表单缺省（清场后回步 0，经步骤条/草稿推进到 2 不可行，改挂新实例读同域草稿） */
    apps.pop()!.unmount();
    document.body.innerHTML = '';
    sessionStorage.setItem(K('step'), '2');
    sessionStorage.setItem(K('index-name'), 'bond_index');
    sessionStorage.setItem(K('strategy'), 'INCREMENTAL');
    const h2 = (await mountAR({})).host;
    await settle(6);
    const rps = numInputOf(h2, '[data-test="ar-tuning-rps"]');
    expect(rps.value, '清场后限流回空').toBe('');
    expect(h2.querySelector('[data-test="ar-tuning-rps-err"]'), '上一轮红字不残留').toBeNull();
    expect(h2.querySelector('[data-test="ar-tuning-slices-mode"]')!.textContent, '档位回 auto（NSelect 回显）').toContain('auto（自动）');
  });
});
