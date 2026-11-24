/**
 * 智能同步（smart_sync 一步式）——XmigrateView 弹层交互。
 * 2026-11-22 智能同步批：同步行主按钮「智能同步」→ 弹层（目标连接必选 n-select/目标索引/
 * 别名随迁复用/分片自动收敛开关）→「预览计划」（apply=false 只读：双侧集群卡 +
 * planned 三清单与 autoTuned 用 MiniTable 渲染、rule 列悬浮溯源 reason + planDigest 芯片）
 * →「按此计划创建」（apply=true 自动携带 expectPlanDigest=预览摘要，askConfirm 二次确认）
 * → verdict PLANNED → APPLIED 全流程；PLAN_DRIFT 如实呈现不冒充。
 * mock 打在 api.xb.smartSync 层（不依赖 browserApi），桩序=预览在前、执行在后。
 * 挂具范式同 xmigrateStructureSync（全真挂载 + api/confirm mock）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const xbSmart = vi.fn();
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
        smartSync: (...a: any[]) => xbSmart(...a),
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
  return { app, host, pinia };
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

const apps: ReturnType<typeof createApp>[] = [];

/* 智能同步预览计划（契约出参全量样本）：verdict PLANNED + 双侧能力块 + planned 三清单
   （每刀带 rule/reason 溯源）+ autoTuned 分片收敛 + planDigest 16 hex */
const SMART_PLAN = {
  verdict: 'PLANNED', applied: false,
  planDigest: 'abc123def4567890', destIndex: 'uat-orders', destConnId: 'host',
  body: { settings: { index: { number_of_shards: '2' } }, mappings: { properties: {} }, aliases: [] },
  source: {
    index: 'prod-orders', connection: 'prod-1', version: '7.10.2', distribution: 'default',
    clusterName: 'prod', vendor: { id: 'aliyun', label: '阿里云 ES' }, plugins: ['analysis-ik'],
    pluginsReliable: true, nodeCount: 5, dataNodeCount: 5,
  },
  target: {
    index: 'uat-orders', connection: 'host', version: '7.6.0', distribution: 'default',
    clusterName: 'uat', vendor: { id: 'oss', label: '开源自建' }, plugins: [],
    pluginsReliable: false, nodeCount: 3, dataNodeCount: 2,
  },
  planned: {
    removedSettings: [
      { key: 'index.hidden', reason: '目标 7.6.0 低于该设置最低版本 7.7.0', rule: 'version-floor' },
      { key: 'index.store.type', reason: 'hybridfs 为阿里云特有 store 类型，目标为 oss', rule: 'store-type-vendor' },
    ],
    removedAnalysis: [
      { kind: 'tokenizer', name: 'ik_max_word', reason: '目标集群缺少插件 analysis-ik，组件 ik_max_word 不可用', rule: 'plugin-analysis' },
    ],
    downgradedFields: [
      { field: 'title', from: 'ik_max_word', to: 'standard', reason: '目标集群缺少插件 analysis-ik，组件 ik_max_word 不可用', rule: 'plugin-analysis' },
    ],
    advice: [],
  },
  autoTuned: [{ key: 'index.number_of_shards', from: 5, to: 2, reason: '源分片 5 超过目标数据节点 2，收敛为 min(5, 2) = 2' }],
  warnings: ['目标插件清单读取失败，plugin-analysis 预剔除按未知跳过（PUT 报错仍会兜底剔除）'],
  reactive: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
};
const SMART_APPLIED = { ...SMART_PLAN, verdict: 'APPLIED', applied: true };

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([]);
  xbSmart.mockReset().mockResolvedValueOnce(SMART_PLAN).mockResolvedValue(SMART_APPLIED);
  askConfirmFn.mockReset().mockResolvedValue(true);
  (Element.prototype as any).scrollIntoView = vi.fn();
});

/* ═══ ① 弹层打开：入口按钮 + 参数区 + 必填校验 ═══ */
describe('智能同步：弹层与必填校验', () => {
  it('同步行「智能同步」主按钮：源索引未选禁用；打开弹层见参数区（目标连接缺省 host/目标索引/别名/分片收敛）与「预览计划」按钮', async () => {
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    const btn = host.querySelector<HTMLButtonElement>('[data-test="xm-smart-btn"]')!;
    expect(btn, '智能同步入口在场（同步行）').toBeTruthy();
    expect(btn.disabled, '源索引未选时禁用').toBe(true);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    expect(btn.disabled, '选源后启用').toBe(false);
    btn.click();
    await settle(2);
    const layer = document.querySelector('[data-test="xm-smart"]')!;
    expect(layer, '弹层打开（teleport 到 body）').toBeTruthy();
    expect(document.querySelector('[data-test="xm-smart-args"]'), '参数区在场').toBeTruthy();
    const destConn = document.querySelector('[data-test="xm-smart-destconn"]')!;
    expect(destConn, '目标连接选择器在场（必填）').toBeTruthy();
    expect(st.smartDestConnId, '目标连接缺省 host').toBe('host');
    expect(document.querySelector('[data-test="xm-smart-dest"]'), '目标索引输入在场（默认与源同名语义）').toBeTruthy();
    expect(document.querySelector('[data-test="xm-smart-aliases"]'), '别名随迁复选框在场（复用同一开关）').toBeTruthy();
    expect(document.querySelector('[data-test="xm-smart-autotune"]'), '分片自动收敛开关在场').toBeTruthy();
    const preview = document.querySelector<HTMLButtonElement>('[data-test="xm-smart-preview"]')!;
    expect(preview.textContent, '初始按钮文案「预览计划」').toContain('预览计划');
    expect(document.querySelector('[data-test="xm-smart-apply"]'), '无计划时不出现创建按钮').toBeNull();
    app.unmount();
  }, 8000);

  it('目标连接被清空时必填校验：行内提示在场且点「预览计划」不发请求', async () => {
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    (host.querySelector('[data-test="xm-smart-btn"]') as HTMLButtonElement).click();
    await settle(2);
    st.smartDestConnId = '';
    await settle(2);
    expect(document.querySelector('[data-test="xm-smart-needdest"]'), '必填行内提示在场').toBeTruthy();
    (document.querySelector('[data-test="xm-smart-preview"]') as HTMLButtonElement).click();
    await settle(3);
    expect(xbSmart, '校验未过不发预览请求').not.toHaveBeenCalled();
    app.unmount();
  }, 8000);
});

/* ═══ ② 预览渲染：请求体 + 双侧集群卡 + planned 三清单 rule 溯源 + autoTuned + digest 芯片 ═══ */
describe('智能同步：预览计划渲染', () => {
  it('apply=false 只读预览：请求体带 destConnId/autoTune/syncAliases；计划表与 rule 溯源、集群卡、digest 芯片、CTA 全在场', async () => {
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    st.smartAutoTune = true;
    await settle(2);
    (host.querySelector('[data-test="xm-smart-btn"]') as HTMLButtonElement).click();
    await settle(2);
    (document.querySelector('[data-test="xm-smart-preview"]') as HTMLButtonElement).click();
    await settle();
    expect(xbSmart).toHaveBeenCalledTimes(1);
    expect(xbSmart.mock.calls[0][0]).toMatchObject({
      sourceIndex: 'prod-orders', destIndex: 'prod-orders', destConnId: 'host',
      apply: false, autoTune: true, syncAliases: false,
    });
    /* 双侧集群卡：vendor 芯片 + 版本 + distribution + 节点数 + pluginsReliable 徽标 */
    const cards = document.querySelector('[data-test="xm-smart-cards"]')!;
    const srcCard = cards.querySelector('[data-test="xm-smart-card-src"]')!;
    expect(srcCard.textContent).toContain('阿里云 ES');
    expect(srcCard.textContent).toContain('7.10.2');
    expect(srcCard.textContent).toContain('default');
    expect(srcCard.textContent).toContain('5 节点');
    expect(srcCard.textContent).toContain('插件清单可靠');
    const dstCard = cards.querySelector('[data-test="xm-smart-card-dst"]')!;
    expect(dstCard.textContent).toContain('开源自建');
    expect(dstCard.textContent).toContain('7.6.0');
    expect(dstCard.textContent).toContain('插件清单不可靠');
    /* planned 三清单（MiniTable）：设置两刀 + 组件一刀 + 降级一刀，rule 列渲染规则 id */
    const planned = document.querySelector('[data-test="xm-smart-planned"]')!;
    expect(planned.textContent).toContain('index.hidden');
    expect(planned.textContent).toContain('index.store.type');
    expect(planned.textContent).toContain('version-floor');
    expect(planned.textContent).toContain('store-type-vendor');
    expect(planned.textContent).toContain('ik_max_word');
    expect(planned.textContent).toContain('plugin-analysis');
    expect(planned.textContent, '字段降级 from→to').toContain('standard');
    expect(planned.querySelectorAll('.xm-smart-tbl tbody tr').length, '三张计划表行数=2+1+1').toBe(4);
    /* autoTuned 分片收敛表 */
    const tuned = document.querySelector('[data-test="xm-smart-autotuned"]')!;
    expect(tuned.textContent).toContain('index.number_of_shards');
    expect(tuned.textContent).toContain('min(5, 2) = 2');
    /* digest 芯片（Tip 解释防漂移语义） */
    const digest = document.querySelector('[data-test="xm-smart-digest"]')!;
    expect(digest.textContent!.trim()).toBe('abc123def4567890');
    /* CTA 升级：预览后出现「按此计划创建」，预览钮转「重新预览计划」 */
    expect(document.querySelector('[data-test="xm-smart-apply"]'), '按此计划创建在场').toBeTruthy();
    expect(document.querySelector('[data-test="xm-smart-preview"]')!.textContent).toContain('重新预览计划');
    app.unmount();
  }, 8000);
});

/* ═══ ③ PLANNED → APPLIED：确认 facts + apply=true 携带 expectPlanDigest + 成功态 ═══ */
describe('智能同步：按此计划创建', () => {
  it('确认 facts 含计划摘要；执行请求 apply=true 且携带 expectPlanDigest=预览 digest；APPLIED 后回填目标表单', async () => {
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    (host.querySelector('[data-test="xm-smart-btn"]') as HTMLButtonElement).click();
    await settle(2);
    (document.querySelector('[data-test="xm-smart-preview"]') as HTMLButtonElement).click();
    await settle();
    (document.querySelector('[data-test="xm-smart-apply"]') as HTMLButtonElement).click();
    await settle();
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    const facts = askConfirmFn.mock.calls[0][0].facts as any[];
    expect(facts.some((f: any) => f.label === '计划摘要' && String(f.value).includes('abc123def4567890')), 'facts 含计划摘要与漂移语义').toBe(true);
    expect(xbSmart).toHaveBeenCalledTimes(2);
    expect(xbSmart.mock.calls[1][0]).toMatchObject({
      apply: true, expectPlanDigest: 'abc123def4567890', destConnId: 'host',
    });
    /* APPLIED 成功态：verdict 徽标 + 目标表单回填 */
    const layer = document.querySelector('[data-test="xm-smart"]')!;
    expect(layer.textContent).toContain('已按计划创建');
    expect(st.form.destIndex, '目标索引表单为空则回填').toBe('uat-orders');
    expect(document.querySelector('[data-test="xm-smart-apply"]'), 'APPLIED 后创建钮退场').toBeNull();
    app.unmount();
  }, 8000);

  it('确认被取消时不发执行请求（预览请求保留一次）', async () => {
    askConfirmFn.mockResolvedValue(false);
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    (host.querySelector('[data-test="xm-smart-btn"]') as HTMLButtonElement).click();
    await settle(2);
    (document.querySelector('[data-test="xm-smart-preview"]') as HTMLButtonElement).click();
    await settle();
    (document.querySelector('[data-test="xm-smart-apply"]') as HTMLButtonElement).click();
    await settle();
    expect(xbSmart, '取消只发过预览').toHaveBeenCalledTimes(1);
    app.unmount();
  }, 8000);

  it('PLAN_DRIFT（409 错误通道，两部署模式同形）：警示在场、未落盘不回填目标表单，提示重新预览', async () => {
    /* 三端统一漂移通道：apply 拒绝非 200+verdict 体，而是 409/错误形态 PLAN_DRIFT——
     * 视图 catch 识别 code 后汇入同一漂移呈示 */
    xbSmart.mockReset().mockResolvedValueOnce(SMART_PLAN)
      .mockRejectedValueOnce(Object.assign(new Error('计划摘要不匹配，拒绝执行：期望 abc123def4567890，实际 ffff0000ffff0000（source structure drifted, re-run smart-sync preview）'), { code: 'PLAN_DRIFT' }));
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    (host.querySelector('[data-test="xm-smart-btn"]') as HTMLButtonElement).click();
    await settle(2);
    (document.querySelector('[data-test="xm-smart-preview"]') as HTMLButtonElement).click();
    await settle();
    (document.querySelector('[data-test="xm-smart-apply"]') as HTMLButtonElement).click();
    await settle();
    const layer = document.querySelector('[data-test="xm-smart"]')!;
    expect(document.querySelector('[data-test="xm-smart-drift"]'), '漂移警示在场').toBeTruthy();
    expect(layer.textContent).toContain('计划已漂移');
    expect(st.form.destIndex, '未落盘不回填目标表单').toBe('');
    /* 漂移后旧计划失效：按钮回初始「预览计划」态（smartHasPlan 仅认 PLANNED），创建钮退场引导重取计划 */
    expect(document.querySelector('[data-test="xm-smart-preview"]')!.textContent, '引导重新预览').toContain('预览计划');
    expect(document.querySelector('[data-test="xm-smart-apply"]'), '漂移后旧计划不可再创建').toBeNull();
    app.unmount();
  }, 8000);
});
