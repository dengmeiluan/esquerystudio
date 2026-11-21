/**
 * G4（UX 轮 II protect 组）三态与契约——行为改动防回归：
 *
 *   SlmView：
 *     B1 首载骨架（loading 初值 true + 骨架守卫）——加载中不再闪「当前无 SLM 策略」；
 *     B2 双源各立错误位——策略 HTTP 失败出独立 err-bar（不翻 available 误报「SLM 不可用」、
 *        旧策略卡保留）；状态/统计源失败出降级提示条（不污染策略列表）；
 *   LifecycleView：
 *     A1 fmtPolicies 按后端数组契约取 row.name——甘特标签不再渲染数组下标 0/1/2…；
 *     B3 policies 失败 err-bar（不再 .catch(() => []) 伪装「无策略」空态，R91b 同源）；
 *     B4 status 失败页头记名「状态拉取失败」（不再 .catch(() => null) 静默显 '—'）；
 *     B5 ilmStart/ilmStop 失败 catch + notify（原 unhandled rejection 零反馈）；
 *     白名单：自动加载页移出 MANUAL_WORKBENCH，本 spec + threeStateContract 启发式正向锁。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useAppStore } from '../stores/app';

/* 只替换网络出口与全局确认服务，视图/组件/工具全用真的 */
const slmPoliciesFn = vi.fn();
const slmStatusFn = vi.fn();
const slmExecuteFn = vi.fn();
const ilmStatusFn = vi.fn();
const ilmPoliciesFn = vi.fn();
const ilmStartFn = vi.fn();
const ilmStopFn = vi.fn();
const rolloverFn = vi.fn();
const ilmMoveFn = vi.fn();
const askConfirmFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      /* 惰性包装：vi.mock factory 提升到文件顶执行，此时 vi.fn 尚未初始化（TDZ） */
      slmPolicies: (...args: any[]) => slmPoliciesFn(...args),
      slmStatus: (...args: any[]) => slmStatusFn(...args),
      slmExecute: (...args: any[]) => slmExecuteFn(...args),
      ilmStatus: (...args: any[]) => ilmStatusFn(...args),
      ilmPolicies: (...args: any[]) => ilmPoliciesFn(...args),
      ilmStart: (...args: any[]) => ilmStartFn(...args),
      ilmStop: (...args: any[]) => ilmStopFn(...args),
      rolloverAlias: (...args: any[]) => rolloverFn(...args),
      ilmMove: (...args: any[]) => ilmMoveFn(...args),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* M1：store.loadIndices 链路出口补齐（本组视图挂载不触发，防御性 stub 挡真实 fetch 噪音） */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({ body: { version: { number: '8.11.0' } } }),
    },
  };
});

vi.mock('../composables/confirm', () => ({
  askConfirm: (...args: any[]) => askConfirmFn(...args),
}));

/* ux2 Task 10：JsonArea 内核升级 Monaco——stub 挡编辑器实例（Lifecycle rolloverCond）；本组对 JsonArea 零驱动（grep 实锤） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import SlmView from '../views/SlmView.vue';
import LifecycleView from '../views/LifecycleView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(comp: any, hash = '#/') {
  location.hash = hash;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/ilm', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(comp) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, pinia };
}

function findBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes(text));
}

/* 后端契约（EsIndexAdmin）：slmPolicies 成功 = name→{policy,last_success,...} 映射；
   ilmPolicies 成功 = [{name, policy, ...}] 数组 */
const SLM_POL = {
  'daily-orders': {
    policy: { name: 'daily-orders', schedule: '0 30 1 * * ?', repository: 'fs-repo', config: { indices: ['orders-*'] }, retention: { expire_after: '30d' } },
    last_success: { time: 1760000000000 },
    next_execution_millis: 1760003600000,
  },
};
const SLM_STS = { status: { operation_mode: 'RUNNING' }, stats: { total_snapshots_taken: 12, total_snapshots_failed: 1, retention_runs: 3, retention_deletion_time_millis: 65000 } };
const ILM_POLS = [
  { name: 'orders-hot', version: 3, modified_date: '2026-08-01T00:00:00.000Z', policy: { phases: { hot: { min_age: '0s', actions: { rollover: { max_size: '50gb' } } }, delete: { min_age: '30d', actions: { delete: {} } } } } },
];

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  slmPoliciesFn.mockReset().mockResolvedValue({});
  slmStatusFn.mockReset().mockResolvedValue(SLM_STS);
  slmExecuteFn.mockReset().mockResolvedValue({ snapshot_name: 'snap-1' });
  ilmStatusFn.mockReset().mockResolvedValue({ operation_mode: 'RUNNING' });
  ilmPoliciesFn.mockReset().mockResolvedValue([]);
  ilmStartFn.mockReset().mockResolvedValue({});
  ilmStopFn.mockReset().mockResolvedValue({});
  rolloverFn.mockReset().mockResolvedValue({});
  ilmMoveFn.mockReset().mockResolvedValue({});
  askConfirmFn.mockReset().mockResolvedValue(true);
});

describe('G4 SlmView：首载骨架与双源分错', () => {
  it('首载中 → 骨架在，「当前无 SLM 策略」不在（不闪错误空态）', async () => {
    slmPoliciesFn.mockReturnValue(new Promise(() => { /* 永不 resolve，模拟拉取中 */ }));
    slmStatusFn.mockReturnValue(new Promise(() => { /* 同上 */ }));
    const { app, host } = await mountView(SlmView);
    expect(host.querySelector('.slm-sk'), '首载必须出骨架').toBeTruthy();
    expect(host.textContent, '加载中不许闪「当前无 SLM 策略」').not.toContain('当前无 SLM 策略');
    app.unmount();
  });

  it('策略 HTTP 失败 → err-bar（全文+重试）在，不误报「SLM 不可用」，不伪装空态', async () => {
    slmPoliciesFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(SlmView);
    expect(host.querySelector('.err-bar'), '失败必须出现错误条').toBeTruthy();
    expect(host.textContent).toContain('SLM 策略拉取失败');
    expect(host.textContent).toContain('重试');
    expect(host.textContent, 'HTTP 失败不许翻 available 误报不可用').not.toContain('SLM 不可用');
    expect(host.textContent, '失败不许伪装真空').not.toContain('当前无 SLM 策略');
    expect(host.querySelector('.slm-sk'), '失败后骨架必须消隐').toBeNull();
    /* 状态源成功：stats 区照常渲染，不被策略源失败拖累（双源分错） */
    expect(host.querySelector('.slm-meta'), '状态源成功必须出 stats 区').toBeTruthy();
    app.unmount();
  });

  it('ES 层 available=false → 降级 alert 在（reason 过 friendlyEsError）+ 重试，err-bar 不在，空态不在', async () => {
    slmPoliciesFn.mockResolvedValue({ available: false, reason: 'security_exception: no permission' });
    const { app, host } = await mountView(SlmView);
    expect(host.textContent).toContain('SLM 不可用');
    expect(host.textContent, '后端兜底的 ES 原始错误必须友好化').toContain('权限不足');
    expect(host.querySelector('.slm-alert .btn')?.textContent).toContain('重试');
    expect(host.querySelector('.err-bar'), 'available=false 不是 HTTP 失败，不出 err-bar').toBeNull();
    expect(host.textContent, '不可用与空态互斥').not.toContain('当前无 SLM 策略');
    app.unmount();
  });

  it('真空 → EmptyState 在，err-bar/alert 不在', async () => {
    const { app, host } = await mountView(SlmView);
    expect(host.querySelector('.err-bar')).toBeNull();
    expect(host.textContent).not.toContain('SLM 不可用');
    expect(host.querySelector('.empty-state'), '真空必须出 EmptyState 组件').toBeTruthy();
    expect(host.textContent).toContain('当前无 SLM 策略');
    app.unmount();
  });

  it('有旧数据时刷新 HTTP 失败 → err-bar 在且旧策略卡保留（G2 保留旧数据裁定）', async () => {
    slmPoliciesFn.mockResolvedValue(SLM_POL);
    const { app, host } = await mountView(SlmView);
    expect(host.querySelector('.slm-card'), '首载成功必须出策略卡').toBeTruthy();
    expect(host.textContent).toContain('daily-orders');
    slmPoliciesFn.mockRejectedValue(new Error('timeout'));
    findBtn(host.querySelector('.slm-hd-r') as HTMLElement, '刷新')!.click();
    await settle();
    expect(host.querySelector('.err-bar'), '刷新失败必须出现错误条（独立于数据分支）').toBeTruthy();
    expect(host.querySelector('.slm-card'), '失败时旧策略卡必须保留').toBeTruthy();
    expect(host.textContent).toContain('daily-orders');
    expect(host.textContent, '失败不许翻 available 隐藏旧卡').not.toContain('SLM 不可用');
    app.unmount();
  });

  it('状态/统计源失败（后端兜底 available=false）→ 策略卡仍在 + 降级提示条在（不污染列表）', async () => {
    slmPoliciesFn.mockResolvedValue(SLM_POL);
    slmStatusFn.mockResolvedValue({ available: false, reason: 'boom' });
    const { app, host } = await mountView(SlmView);
    expect(host.querySelector('.slm-card'), '策略源成功必须出策略卡').toBeTruthy();
    /* 五百六十一批同步更新：slm-stats-err 手写 warn 壳合并 EmptyState compact 统一件
       （IlmView explain 先例）——降级提示条锚同步更新 .empty-state（本场景唯一空态件） */
    expect(host.querySelector('.empty-state'), '统计源失败必须出降级提示条').toBeTruthy();
    expect(host.textContent).toContain('SLM 状态/统计拉取失败');
    expect(host.querySelector('.slm-meta'), '统计区失败时不渲染').toBeNull();
    expect(host.textContent, '统计源失败不许误报「SLM 不可用」').not.toContain('SLM 不可用');
    app.unmount();
  });

  it('状态/统计源 HTTP 失败 → 降级提示条在 + notify error 透传', async () => {
    slmPoliciesFn.mockResolvedValue(SLM_POL);
    slmStatusFn.mockRejectedValue(new Error('timeout'));
    const { app, host, pinia } = await mountView(SlmView);
    const store = useAppStore(pinia as Pinia);
    const spy = vi.spyOn(store, 'notify');
    findBtn(host.querySelector('.slm-hd-r') as HTMLElement, '刷新')!.click();
    await settle();
    expect(host.querySelector('.empty-state'), '统计 HTTP 失败必须出降级提示条（561 批 EmptyState 合并锚同步更新）').toBeTruthy();
    expect(host.querySelector('.slm-card'), '策略卡不被统计源失败拖累').toBeTruthy();
    expect(spy.mock.calls.some(c => c[0] === 'error' && String(c[1]).includes('slm/status')),
      '统计源失败必须 notify error 透传').toBe(true);
    app.unmount();
  });
});

describe('G4 LifecycleView：数组契约 / 分源错误 / 写操作反馈', () => {
  it('A1：后端数组契约——甘特标签显真实策略名（修复前渲染数组下标 0）', async () => {
    ilmPoliciesFn.mockResolvedValue(ILM_POLS);
    const { app, host } = await mountView(LifecycleView);
    const label = host.querySelector('.lc-gantt-label');
    expect(label, '甘特行必须渲染').toBeTruthy();
    expect(label!.textContent, '策略名必须取 row.name（修复前为数组下标 "0"）').toBe('orders-hot');
    expect(label!.getAttribute('title')).toBe('orders-hot');
    expect(host.textContent).toContain('1 个策略');
    app.unmount();
  });

  it('首载中 → 骨架在，「暂无 ILM 策略」不在', async () => {
    ilmStatusFn.mockReturnValue(new Promise(() => { /* 永不 resolve */ }));
    ilmPoliciesFn.mockReturnValue(new Promise(() => { /* 永不 resolve */ }));
    const { app, host } = await mountView(LifecycleView);
    expect(host.querySelector('.lc-sk'), '首载必须出骨架').toBeTruthy();
    expect(host.textContent, '加载中不许闪「暂无 ILM 策略」').not.toContain('暂无 ILM 策略');
    app.unmount();
  });

  it('policies 失败 → err-bar（全文+重试）在，不伪装「暂无 ILM 策略」（R91b 回归锁）', async () => {
    ilmPoliciesFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(LifecycleView);
    expect(host.querySelector('.err-bar'), '失败必须出现错误条').toBeTruthy();
    expect(host.textContent).toContain('ILM 策略拉取失败');
    expect(host.textContent).toContain('重试');
    expect(host.textContent, '失败不许伪装空态').not.toContain('暂无 ILM 策略');
    expect(host.querySelector('.lc-sk'), '失败后骨架必须消隐').toBeNull();
    app.unmount();
  });

  it('status 失败 + policies 成功 → 页头记名「状态拉取失败」，甘特照常，err-bar 不在', async () => {
    ilmStatusFn.mockRejectedValue(new Error('timeout'));
    ilmPoliciesFn.mockResolvedValue(ILM_POLS);
    const { app, host } = await mountView(LifecycleView);
    expect(host.textContent, '状态源失败必须页头记名（不再静默显 —）').toContain('状态拉取失败');
    expect(host.querySelector('.lc-gantt-label')?.textContent, '策略源成功甘特必须渲染').toBe('orders-hot');
    /* 第十批：自造 good/warn/bad 类收口全局 meta-* 语义档，b.bad → b.meta-err（:title 可达语义不变）。
       五百五十批同步更新：meta-err b 再改用 StatusPill 统一件（err→r 语义映射，flattenWave550①），
       :title 仍随统一件透传，可达语义不变 */
    expect(host.querySelector('.lc-hd-sub .pill.r')?.getAttribute('title'), '状态失败全文必须 :title 可达（§9.5，复审 M5；550 同步更新 .pill.r 锚）').toContain('timeout');
    expect(host.querySelector('.err-bar'), '策略源成功不出 err-bar').toBeNull();
    app.unmount();
  });

  it('真空 → EmptyState「暂无 ILM 策略」+ 下一步动作按钮在（S6 归位）', async () => {
    const { app, host } = await mountView(LifecycleView);
    expect(host.querySelector('.err-bar')).toBeNull();
    expect(host.querySelector('.empty-state'), '真空必须出 EmptyState 组件').toBeTruthy();
    expect(host.textContent).toContain('暂无 ILM 策略');
    expect(findBtn(host.querySelector('.empty-state') as HTMLElement, '去 ILM 控制中心确认'),
      '空态必须给下一步动作按钮').toBeTruthy();
    app.unmount();
  });

  it('有旧数据时刷新失败 → err-bar 在且甘特保留', async () => {
    ilmPoliciesFn.mockResolvedValue(ILM_POLS);
    const { app, host } = await mountView(LifecycleView);
    expect(host.querySelector('.lc-gantt-label')).toBeTruthy();
    ilmPoliciesFn.mockRejectedValue(new Error('boom'));
    findBtn(host.querySelector('.lc-hd-r') as HTMLElement, '刷新')!.click();
    await settle();
    expect(host.querySelector('.err-bar'), '刷新失败必须出现错误条').toBeTruthy();
    expect(host.querySelector('.lc-gantt-label'), '失败时甘特必须保留').toBeTruthy();
    expect(host.textContent).toContain('orders-hot');
    app.unmount();
  });

  it('ilmStart 失败 → notify error 透传（修复前 unhandled rejection 零反馈）', async () => {
    ilmStartFn.mockRejectedValue(new Error('cluster_block_exception: read-only'));
    const { app, host, pinia } = await mountView(LifecycleView);
    const store = useAppStore(pinia as Pinia);
    const spy = vi.spyOn(store, 'notify');
    findBtn(host.querySelector('.lc-hd-r') as HTMLElement, 'Start ILM')!.click();
    await settle();
    const errCall = spy.mock.calls.find(c => c[0] === 'error');
    expect(errCall, '启动失败必须 notify error（不再静默 unhandled rejection）').toBeTruthy();
    expect(String(errCall![1])).toContain('ILM 启动失败');
    app.unmount();
  });

  it('ilmStart 成功 → notify success 并重跑 load 刷新甘特', async () => {
    const { app, host, pinia } = await mountView(LifecycleView);
    const store = useAppStore(pinia as Pinia);
    const spy = vi.spyOn(store, 'notify');
    ilmPoliciesFn.mockClear();
    findBtn(host.querySelector('.lc-hd-r') as HTMLElement, 'Start ILM')!.click();
    await settle();
    expect(spy.mock.calls.some(c => c[0] === 'success' && String(c[1]).includes('ILM 引擎已启动'))).toBe(true);
    expect(ilmPoliciesFn, '成功后必须重跑 load').toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('ilmStop 失败 → notify error 透传（与 ilmStart 对称，复审 M5）', async () => {
    ilmStopFn.mockRejectedValue(new Error('cluster_block_exception: read-only'));
    const { app, host, pinia } = await mountView(LifecycleView);
    const store = useAppStore(pinia as Pinia);
    const spy = vi.spyOn(store, 'notify');
    findBtn(host.querySelector('.lc-hd-r') as HTMLElement, 'Stop ILM')!.click();
    await settle();
    const errCall = spy.mock.calls.find(c => c[0] === 'error');
    expect(errCall, '停止失败必须 notify error（askConfirm 默认放行）').toBeTruthy();
    expect(String(errCall![1])).toContain('ILM 停止失败');
    app.unmount();
  });

  it('ilmStart in-flight 防重入：按钮禁用且重复点击不双发（复审 M4）', async () => {
    ilmStartFn.mockReturnValue(new Promise(() => { /* 永不 resolve，模拟 in-flight */ }));
    const { app, host } = await mountView(LifecycleView);
    const startBtn = findBtn(host.querySelector('.lc-hd-r') as HTMLElement, 'Start ILM')!;
    startBtn.click();
    await settle(3);
    expect(ilmStartFn).toHaveBeenCalledTimes(1);
    expect(startBtn.disabled, 'in-flight 期间按钮必须禁用').toBe(true);
    startBtn.click();
    await settle(3);
    expect(ilmStartFn, 'in-flight 期间重复点击不许双发').toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('策略行缺 name → 甘特标签兜底（未命名#i），不产空 label/:key 碰撞（复审 M2）', async () => {
    ilmPoliciesFn.mockResolvedValue([{ version: 1, policy: { phases: { hot: { min_age: '0s', actions: {} } } } }]);
    const { app, host } = await mountView(LifecycleView);
    expect(host.querySelector('.lc-gantt-label')?.textContent, '缺 name 必须带下标兜底').toBe('(未命名#0)');
    app.unmount();
  });
});
