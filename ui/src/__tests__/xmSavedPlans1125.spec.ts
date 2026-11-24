/**
 * 已存同步计划页面出口（MCP plan_list / plan_apply 的页面同源）。
 *
 * 之前 api.xb.plans / applyPlan 只有 MCP 与浏览器桥在用，页面没有任何入口——
 * 用户在页面保存计划后无法在页面里看见或重跑。本测试守三件事：
 *  ① 台账行渲染（源→目标、保存时间、重跑/复制 ID）；
 *  ② 重跑走 askConfirm 且带 planId 调 applyPlan，结果回填同步报告区；
 *  ③ 没有计划时给空态而不是空表。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const xbDestIndices = vi.fn();
const xbPlans = vi.fn();
const xbApplyPlan = vi.fn();
const xbVerify = vi.fn();
const askConfirmFn = vi.fn();
const copyTextFn = vi.fn();

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
        plans: (...a: any[]) => xbPlans(...a),
        applyPlan: (...a: any[]) => xbApplyPlan(...a),
        verifyEquivalence: (...a: any[]) => xbVerify(...a),
      },
    },
  };
});
vi.mock('../composables/confirm', () => ({ askConfirm: (...a: any[]) => askConfirmFn(...a) }));
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: (...a: any[]) => copyTextFn(...a) };
});
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    setup() { return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const NOW = Date.now();
const PLAN = {
  planId: 'p-1125-a', srcConnId: 'conn-src', sourceIndex: 'prod-orders', destConnId: 'host',
  destIndex: 'uat-orders', mode: 'structure', autoTune: true, syncAliases: false,
  planDigest: 'deadbeefdeadbeef', savedAtMs: NOW - 3_600_000, appliedAtMs: null, appliedCount: 0,
};
const APPLIED = {
  created: true, dryRun: false, destIndex: 'uat-orders', planDigest: PLAN.planDigest,
  source: { index: 'prod-orders', version: '7.10.2' }, target: { index: 'uat-orders', version: '7.14.2' },
  planned: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
  reactive: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
  aliases: { skipped: [], synced: [] }, advice: [], warnings: [],
};

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
async function openPlans(app: ReturnType<typeof createApp>) {
  stateOf(app).plansOpen = true;
  await settle(10);
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([]);
  xbDestIndices.mockReset().mockResolvedValue([]);
  xbPlans.mockReset().mockResolvedValue({ plans: [PLAN], cappedAt: 50 });
  xbApplyPlan.mockReset().mockResolvedValue(APPLIED);
  xbVerify.mockReset();
  askConfirmFn.mockReset().mockResolvedValue(true);
  copyTextFn.mockReset().mockResolvedValue(true);
  (Element.prototype as any).scrollIntoView = vi.fn();
});

describe('已存同步计划（页面）', () => {
  it('渲染台账行：源→目标、结构/增量、保存时间与动作', async () => {
    const { app, host } = await mountXm();
    await openPlans(app);
    expect(xbPlans).toHaveBeenCalled();
    const row = host.querySelector('[data-test="xm-plan-row"]') as HTMLElement;
    expect(row, '必须渲染计划行').toBeTruthy();
    expect(row.textContent).toContain('prod-orders');
    expect(row.textContent).toContain('uat-orders');
    expect(row.textContent).toContain('结构');
    expect(row.querySelector('[data-test="xm-plan-rerun-p-1125-a"]'), '重跑按钮在场').toBeTruthy();
    expect(row.querySelector('[data-test="xm-plan-copy-p-1125-a"]'), '复制 ID 在场').toBeTruthy();
  });

  it('重跑：先确认，再以 planId 调 applyPlan，结果回填同步报告', async () => {
    const { app, host } = await mountXm();
    await openPlans(app);
    (host.querySelector('[data-test="xm-plan-rerun-p-1125-a"]') as HTMLButtonElement).click();
    await settle(16);
    expect(askConfirmFn, '重跑是写操作，必须先确认').toHaveBeenCalled();
    expect(xbApplyPlan, '确认后必须真的执行').toHaveBeenCalledTimes(1);
    expect(xbApplyPlan.mock.calls[0][0]).toEqual({ planId: 'p-1125-a' });
    expect(host.querySelector('[data-test="xm-sync-report"]'), '执行结果回填报告区').toBeTruthy();
  });

  it('取消确认时不执行', async () => {
    askConfirmFn.mockResolvedValue(false);
    const { app, host } = await mountXm();
    await openPlans(app);
    (host.querySelector('[data-test="xm-plan-rerun-p-1125-a"]') as HTMLButtonElement).click();
    await settle(10);
    expect(xbApplyPlan).not.toHaveBeenCalled();
  });

  it('重跑可「停止等待」：中止本次等待并如实提示，不假装服务端已停', async () => {
    xbApplyPlan.mockImplementation((_req: any, _t: any, signal: AbortSignal) => new Promise((_res, rej) => {
      signal?.addEventListener('abort', () => {
        const err: any = new Error('aborted'); err.name = 'AbortError'; rej(err);
      }, { once: true });
    }));
    const { app, host } = await mountXm();
    await openPlans(app);
    (host.querySelector('[data-test="xm-plan-rerun-p-1125-a"]') as HTMLButtonElement).click();
    await settle(12);
    const stop = host.querySelector('[data-test="xm-long-stop"]') as HTMLButtonElement;
    expect(stop, '长操作等待中必须有停止入口').toBeTruthy();
    stop.click();
    await settle(12);
    const err = host.querySelector('[data-test="xm-plans-err"]') as HTMLElement;
    expect(err?.textContent || '').toContain('已停止等待');
    expect(err?.textContent || '').not.toContain('重跑失败');
  });

  it('没有计划时给空态而不是空表', async () => {
    xbPlans.mockResolvedValue({ plans: [], cappedAt: 50 });
    const { app, host } = await mountXm();
    await openPlans(app);
    expect(host.querySelector('[data-test="xm-plan-row"]')).toBeNull();
    expect((host.querySelector('[data-test="xm-plans"]') as HTMLElement).textContent).toContain('还没有保存过同步计划');
  });
});

describe('迁移页 · 长操作等待可停止', () => {
  it('等价验证等待中出现停止按钮；点击后如实提示', async () => {
    xbVerify.mockImplementation((_req: any, _t: any, signal: AbortSignal) => new Promise((_res, rej) => {
      signal?.addEventListener('abort', () => {
        const err: any = new Error('aborted'); err.name = 'AbortError'; rej(err);
      }, { once: true });
    }));
    const { app } = await mountXm();
    const st = stateOf(app);
    void st.openVerify({ jobId: 'j-1', destIndex: 'd-1', srcConnId: 's-1' });
    await settle(8);
    const stop = document.querySelector('[data-test="xm-verify-stop"]') as HTMLButtonElement;
    expect(stop, '等价验证等待中必须有停止入口').toBeTruthy();
    stop.click();
    await settle(10);
    expect(document.body.textContent || '', '中止后如实提示').toContain('已停止等待');
  });
});
