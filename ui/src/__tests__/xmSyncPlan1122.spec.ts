/* 智能同步弹层的同步计划链路（XmigrateView）——smart_sync savePlan / plan_list / plan_apply 的页面接线：
 *   ① 「保存为同步计划」开关：未选源连接档案时禁用（计划只记录档案 id，手输连接不能保存）；
 *      勾选后预览请求带 savePlan:true，响应回显 planId → 芯片在场（点击复制）+ 成功 toast；
 *      未勾选时请求不带 savePlan；
 *   ② 「已存计划」下拉：获得焦点时才加载列表（plan_list）；选中后显示摘要
 *      （源 / 目标 / 模式 / 计划摘要 / 保存时间）与「按此计划创建」，预览结果清掉；
 *   ③ 按此计划创建：确认 facts 含计划摘要 → plan_apply {planId} → APPLIED 结果与成功 toast；
 *      取消确认不发请求；
 *   ④ PLAN_DRIFT：红态复用漂移告警条，未回填目标表单；PLAN_NOT_FOUND：明确提示且创建钮禁用；
 *   ⑤ 点「预览计划」回到预览路线；列表加载失败如实提示。
 * mock 打在 api.xb（smartSync / plans / applyPlan）层，桩序即调用序；挂具范式同 xmSmartSync1082。 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import XmigrateView from '../views/XmigrateView.vue';
import { useAppStore } from '../stores/app';
import { fmtTime } from '../utils/format';

const xbJobs = vi.fn();
const xbSmart = vi.fn();
const xbPlans = vi.fn();
const xbApplyPlan = vi.fn();
const clustersListFn = vi.fn();
const askConfirmFn = vi.fn();
const copyTextFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      keys: async () => [],
      clustersList: (...a: any[]) => clustersListFn(...a),
      clusterIndices: async () => [],
      overview: async () => ({}),
      clusterHealth: async () => ({}),
      xb: {
        ...actual.api.xb,
        jobs: (...a: any[]) => xbJobs(...a),
        destIndices: async () => [],
        smartSync: (...a: any[]) => xbSmart(...a),
        plans: (...a: any[]) => xbPlans(...a),
        applyPlan: (...a: any[]) => xbApplyPlan(...a),
      },
    },
  };
});
vi.mock('../composables/confirm', () => ({
  askConfirm: (...a: any[]) => askConfirmFn(...a),
}));
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return {
    ...actual,
    copyText: async (text: string) => { copyTextFn(text); return true; },
  };
});

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

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
  apps.push(app);
  return { app, host, notify: vi.spyOn(useAppStore(pinia), 'notify') };
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

/** 打开智能同步弹层（源索引先选好）。 */
async function openSmart(app: any, host: HTMLElement) {
  stateOf(app).form.sourceIndex = 'prod-orders';
  await settle(2);
  (host.querySelector('[data-test="xm-smart-btn"]') as HTMLButtonElement).click();
  await settle(2);
  expect(document.querySelector('[data-test="xm-smart"]'), '弹层打开').toBeTruthy();
}

/** 选中一条已存计划（列表已加载的前提下），回到「按计划创建」路线。 */
async function pickSavedPlan(app: any) {
  const st = stateOf(app);
  st.savedPlanId = SAVED_PLAN.planId;
  st.onPickSavedPlan(SAVED_PLAN.planId);
  await settle();
}

const PLAN_ID = 'prod-orders_1700000000000_0123456789abcdef';
const DIGEST = 'abc123def4567890';
/* 智能同步预览报告（契约出参节选）：verdict PLANNED + planDigest */
const SMART_PLAN = {
  verdict: 'PLANNED', applied: false,
  planDigest: DIGEST, destIndex: 'uat-orders', destConnId: 'host',
  source: { index: 'prod-orders', connection: 'prod-1' },
  target: { index: 'uat-orders', connection: 'host' },
  planned: { removedSettings: [], removedAnalysis: [], downgradedFields: [], advice: [] },
  autoTuned: [], warnings: [], reactive: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
};
/* plan_list 的一行（与服务端 toSummary 同键序） */
const SAVED_PLAN = {
  planId: 'uat-orders_1699999999999_fedcba9876543210', srcConnId: 'prod-1', sourceIndex: 'prod-orders',
  destConnId: 'host', destIndex: 'uat-orders', mode: 'create', autoTune: false, syncAliases: false,
  planDigest: DIGEST, savedAtMs: 1700000000000, appliedAtMs: null, appliedCount: 0,
};
const PLAN_APPLIED = { ...SMART_PLAN, verdict: 'APPLIED', applied: true, planId: SAVED_PLAN.planId };

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([]);
  xbSmart.mockReset().mockResolvedValue(SMART_PLAN);
  xbPlans.mockReset().mockResolvedValue({ plans: [SAVED_PLAN], cappedAt: 50 });
  xbApplyPlan.mockReset().mockResolvedValue(PLAN_APPLIED);
  clustersListFn.mockReset().mockResolvedValue([]);
  askConfirmFn.mockReset().mockResolvedValue(true);
  copyTextFn.mockReset().mockResolvedValue(true);
  (Element.prototype as any).scrollIntoView = vi.fn();
});

describe('智能同步弹层：保存为同步计划', () => {
  it('开关在场；未选源连接档案时禁用（取消档案选择时自动回落）', async () => {
    const { app, host } = await mountXm();
    await openSmart(app, host);
    const st = stateOf(app);
    const saveSwitch = document.querySelector('[data-test="xm-smart-saveplan"]')!;
    expect(saveSwitch, '保存开关在场').toBeTruthy();
    expect(st.canSavePlan).toBe(false);
    expect(st.smartSavePlan, '缺省不勾选').toBe(false);
    expect(saveSwitch.className, '手输连接不能保存为计划：开关禁用').toContain('n-checkbox--disabled');
    st.smartSavePlan = true;
    await settle(2);
    st.srcConnId = 'prod-1';
    await settle(2);
    expect(st.canSavePlan).toBe(true);
    expect(saveSwitch.className).not.toContain('n-checkbox--disabled');
    expect(saveSwitch.className, '选中档案后此前的勾选生效').toContain('n-checkbox--checked');
    st.srcConnId = '';
    await settle(2);
    expect(st.smartSavePlan, '档案被取消后开关回落').toBe(false);
    expect(saveSwitch.className, '回落后 DOM 禁用').toContain('n-checkbox--disabled');
    app.unmount();
  }, 8000);

  it('勾选后预览请求带 savePlan:true；回显 planId → 芯片在场可复制 + 成功 toast；未勾选时请求不带 savePlan', async () => {
    xbSmart.mockResolvedValueOnce({ ...SMART_PLAN, planId: PLAN_ID });
    const { app, host, notify } = await mountXm();
    await openSmart(app, host);
    const st = stateOf(app);
    st.srcConnId = 'prod-1';
    await settle(2);
    st.smartSavePlan = true;
    await settle(2);
    (document.querySelector('[data-test="xm-smart-preview"]') as HTMLButtonElement).click();
    await settle();
    expect(xbSmart.mock.calls[0][0]).toMatchObject({ apply: false, savePlan: true, srcConnId: 'prod-1' });
    const chip = document.querySelector<HTMLElement>('[data-test="xm-smart-planid"]')!;
    expect(chip, 'planId 芯片在场').toBeTruthy();
    expect(chip.textContent!.trim()).toBe(PLAN_ID);
    expect(notify.mock.calls.some((c: any[]) => c[0] === 'success' && String(c[1]).includes(PLAN_ID)), '保存成功 toast').toBe(true);
    chip.click();
    await settle(2);
    expect(copyTextFn).toHaveBeenCalledWith(PLAN_ID);
    expect(notify.mock.calls.some((c: any[]) => c[1] === '已复制 planId'), '复制成功 toast').toBe(true);

    /* 取消勾选再预览：请求不带 savePlan，上一次的 planId 芯片不残留 */
    xbSmart.mockResolvedValueOnce(SMART_PLAN);
    st.smartSavePlan = false;
    await settle(2);
    (document.querySelector('[data-test="xm-smart-preview"]') as HTMLButtonElement).click();
    await settle();
    expect(xbSmart.mock.calls[1][0]).not.toHaveProperty('savePlan');
    expect(document.querySelector('[data-test="xm-smart-planid"]'), '未保存时不显示 planId 芯片').toBeNull();
    app.unmount();
  }, 8000);
});

describe('智能同步弹层：已存计划下拉与按此计划创建', () => {
  it('下拉获得焦点时才加载列表（源文本锚）；选中后显示摘要与「按此计划创建」，预览结果清掉', async () => {
    const viewSrc = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf8');
    expect(viewSrc).toContain('@focus="loadSavedPlans"');
    const { app, host } = await mountXm();
    await openSmart(app, host);
    const st = stateOf(app);
    expect(xbPlans, '未展开下拉不加载列表').not.toHaveBeenCalled();
    expect(document.querySelector('[data-test="xm-smart-plans"]'), '已存计划下拉在场').toBeTruthy();

    /* 先出一次预览结果，再选已存计划：预览结果应被清掉 */
    (document.querySelector('[data-test="xm-smart-preview"]') as HTMLButtonElement).click();
    await settle();
    expect(document.querySelector('[data-test="xm-smart-cards"]')).toBeTruthy();
    expect(document.querySelector('[data-test="xm-smart-apply"]'), '预览路线的创建钮在场').toBeTruthy();

    await st.loadSavedPlans();
    await settle();
    expect(xbPlans).toHaveBeenCalledTimes(1);
    expect(st.savedPlanOpts[0]).toEqual({ value: SAVED_PLAN.planId, label: expect.stringContaining('prod-orders → uat-orders · 宿主(存档时连接) · 新建 · 保存于 ') });
    await pickSavedPlan(app);
    const saved = document.querySelector('[data-test="xm-smart-saved"]')!;
    expect(saved, '已存计划摘要在场').toBeTruthy();
    const text = saved.textContent!;
    for (const token of ['prod-orders', 'uat-orders', '新建', DIGEST, fmtTime(SAVED_PLAN.savedAtMs)]) {
      expect(text, `摘要含 ${token}`).toContain(token);
    }
    expect(document.querySelector('[data-test="xm-smart-plan-savedid"]')!.textContent!.trim()).toBe(SAVED_PLAN.planId);
    expect(document.querySelector('[data-test="xm-smart-cards"]'), '预览结果已清掉').toBeNull();
    expect(document.querySelector('[data-test="xm-smart-apply"]'), '预览路线的创建钮不并存').toBeNull();
    expect(document.querySelector('[data-test="xm-smart-plan-apply"]'), '按此计划创建在场').toBeTruthy();
    app.unmount();
  }, 8000);

  it('按此计划创建：确认 facts 含计划摘要 → plan_apply {planId} → APPLIED 结果、回填目标表单与成功 toast；取消确认不发请求', async () => {
    const { app, host, notify } = await mountXm();
    await openSmart(app, host);
    const st = stateOf(app);
    await st.loadSavedPlans();
    await pickSavedPlan(app);

    askConfirmFn.mockResolvedValueOnce(false);
    (document.querySelector('[data-test="xm-smart-plan-apply"]') as HTMLButtonElement).click();
    await settle();
    expect(xbApplyPlan, '取消确认不发执行请求').not.toHaveBeenCalled();

    (document.querySelector('[data-test="xm-smart-plan-apply"]') as HTMLButtonElement).click();
    await settle();
    expect(askConfirmFn).toHaveBeenCalledTimes(2);
    const facts = askConfirmFn.mock.calls[1][0].facts as any[];
    expect(facts).toEqual(expect.arrayContaining([
      { label: '源索引', value: 'prod-orders' },
      { label: '目标连接', value: '宿主(存档时连接)' },
      { label: '目标索引', value: 'uat-orders' },
      { label: '模式', value: '新建' },
      { label: '保存时间', value: fmtTime(SAVED_PLAN.savedAtMs) },
      { label: '计划摘要', value: DIGEST + '（源结构漂移将拒绝创建）' },
    ]));
    expect(xbApplyPlan.mock.calls[0][0]).toEqual({ planId: SAVED_PLAN.planId });
    expect(document.querySelector('[data-test="xm-smart"]')!.textContent).toContain('已按计划创建');
    expect(document.querySelector('[data-test="xm-smart-saved"]'), '执行后摘要卡不再显示').toBeNull();
    expect(st.form.destIndex, '目标表单为空则回填计划的目标索引').toBe('uat-orders');
    expect(notify.mock.calls.some((c: any[]) => c[0] === 'success' && String(c[1]).includes('已按同步计划创建'))).toBe(true);
    app.unmount();
  }, 8000);

  it('计划目标按档案 id 记录时显示真实档案名（host 存量计划按「宿主(存档时连接)」口径）', async () => {
    clustersListFn.mockResolvedValue([{ id: 'uat-1', name: 'UAT 集群', scheme: 'http', host: 'uat.local', port: 9200, hasPassword: true }]);
    const uatPlan = { ...SAVED_PLAN, planId: 'uat-orders_1699999999998_1111111111111111', destConnId: 'uat-1' };
    xbPlans.mockResolvedValueOnce({ plans: [uatPlan], cappedAt: 50 });
    const { app, host } = await mountXm();
    await openSmart(app, host);
    const st = stateOf(app);
    await st.loadSavedPlans();
    await settle();
    expect(st.savedPlanOpts[0].label).toContain('prod-orders → uat-orders · UAT 集群 · 新建 · 保存于 ');
    st.savedPlanId = uatPlan.planId;
    st.onPickSavedPlan(uatPlan.planId);
    await settle();
    const meta = (document.querySelector('[data-test="xm-smart-saved"]')!.textContent) as string;
    expect(meta).toContain('UAT 集群');
    (document.querySelector('[data-test="xm-smart-plan-apply"]') as HTMLButtonElement).click();
    await settle();
    const facts = askConfirmFn.mock.calls[0][0].facts as any[];
    expect(facts).toEqual(expect.arrayContaining([{ label: '目标连接', value: 'UAT 集群' }]));
    app.unmount();
  }, 8000);

  it('PLAN_DRIFT：红态复用漂移告警条（未回填目标表单）；PLAN_NOT_FOUND：明确提示且创建钮禁用', async () => {
    const drift = Object.assign(
      new Error(`计划摘要不匹配，拒绝执行：期望 ${DIGEST}，实际 ffff0000ffff0000（source structure drifted, re-run smart-sync preview）`),
      { code: 'PLAN_DRIFT' });
    xbApplyPlan.mockRejectedValueOnce(drift);
    const { app, host, notify } = await mountXm();
    await openSmart(app, host);
    const st = stateOf(app);
    await st.loadSavedPlans();
    await pickSavedPlan(app);
    (document.querySelector('[data-test="xm-smart-plan-apply"]') as HTMLButtonElement).click();
    await settle();
    const driftBar = document.querySelector('[data-test="xm-smart-drift"]')!;
    expect(driftBar, '漂移告警条在场（与预览路线同一形态）').toBeTruthy();
    expect(driftBar.getAttribute('role')).toBe('alert');
    expect(driftBar.textContent).toContain('计划摘要与保存时不一致');
    expect(document.querySelector('[data-test="xm-smart-saved"]')!.textContent).toContain('计划已漂移，未落盘');
    expect(st.form.destIndex, '未落盘不回填目标表单').toBe('');
    expect(notify.mock.calls.some((c: any[]) => c[0] === 'warning' && String(c[1]).includes('计划已漂移'))).toBe(true);

    xbApplyPlan.mockRejectedValueOnce(Object.assign(new Error('同步计划不存在: ' + SAVED_PLAN.planId), { code: 'PLAN_NOT_FOUND' }));
    (document.querySelector('[data-test="xm-smart-plan-apply"]') as HTMLButtonElement).click();
    await settle();
    expect(document.querySelector('[data-test="xm-smart-plan-missing"]'), '计划不存在明确提示').toBeTruthy();
    expect(document.querySelector('[data-test="xm-smart-plan-missing"]')!.textContent).toContain('该同步计划已不存在');
    expect(document.querySelector('[data-test="xm-smart-drift"]'), '漂移条不并存').toBeNull();
    expect((document.querySelector('[data-test="xm-smart-plan-apply"]') as HTMLButtonElement).disabled, '计划不存在后创建钮禁用').toBe(true);
    expect(notify.mock.calls.some((c: any[]) => c[0] === 'warning' && String(c[1]).includes('已不存在'))).toBe(true);
    app.unmount();
  }, 8000);

  it('点「预览计划」回到预览路线（清掉已存计划选择）；列表加载失败如实提示', async () => {
    xbPlans.mockRejectedValueOnce(new Error('network down'));
    const { app, host } = await mountXm();
    await openSmart(app, host);
    const st = stateOf(app);
    await st.loadSavedPlans();
    await settle();
    expect(document.querySelector('[data-test="xm-smart-plans-err"]')!.textContent).toContain('已存计划加载失败');

    await st.loadSavedPlans();
    await pickSavedPlan(app);
    expect(document.querySelector('[data-test="xm-smart-saved"]')).toBeTruthy();
    (document.querySelector('[data-test="xm-smart-preview"]') as HTMLButtonElement).click();
    await settle();
    expect(st.savedPlanId, '回到预览路线时清掉已存计划选择').toBeNull();
    expect(document.querySelector('[data-test="xm-smart-saved"]'), '摘要卡不再显示').toBeNull();
    expect(document.querySelector('[data-test="xm-smart-plan-apply"]'), '按计划创建钮不再显示').toBeNull();
    expect(document.querySelector('[data-test="xm-smart-cards"]'), '预览结果在场').toBeTruthy();
    app.unmount();
  }, 8000);
});
