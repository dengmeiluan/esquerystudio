/**
 * 2026-11-21 兼容计划批：结构同步「预览兼容计划」弹层（dryRun v2 报告）专项。
 *
 * 与 xmigrateStructureSync（流程主干：两段式/确认 facts/错误态/联动）互补，本件聚焦
 * v2 计划报告的新数据面：
 *   ① vendor 芯片对——source/target vendor.label+version 拼装；vendor/version 缺席
 *     （unknown）如实显示「未知厂商/版本未知」，回退旧顶层 sourceVersion/targetVersion；
 *   ② 三段清单 planned「矩阵预剔除」/reactive「报错兜底剔除」各带 reason（每刀都有理由）；
 *     advice kind 徽标中文化（分片/副本/存储/ILM，未命中回显原文）；
 *   ③ 别名段 skipped/synced 分行 chips；
 *   ④ dryRun 报告底部 CTA「按此计划创建」——走确认弹层，执行请求 dryRun=false 且
 *     syncAliases 跟随勾选；
 *   ⑤ 零剔除正面态「计划零剔除」。
 * mock 打在 api.xb.syncStructure 层（不依赖 browserApi/后端）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import XmigrateView from '../views/XmigrateView.vue';
import { useAppStore } from '../stores/app';

const xbJobs = vi.fn();
const xbSync = vi.fn();
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
        syncStructure: (...a: any[]) => xbSync(...a),
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

/* vendor 齐备 + 两段清单 + advice 四类 kind + 别名两行的 v2 计划 */
const PLAN = {
  created: false, dryRun: true, destIndex: 'uat-orders', rounds: 2,
  source: { index: 'prod-orders', version: '7.10.2-aliyun', vendor: { id: 'aliyun', label: '阿里云 ES' }, plugins: ['apack'] },
  target: { index: 'uat-orders', version: '7.14.2', vendor: { id: 'tencent', label: '腾讯云 ES' }, plugins: [] },
  planned: {
    removedSettings: [{ key: 'index.apack.knn', reason: '目标集群无 apack 插件' }],
    removedAnalysis: [{ kind: 'analyzer', name: 'my_aliws', reason: '阿里云自定义分词器在目标不可用' }],
    downgradedFields: [{ field: 'title', attr: 'analyzer', from: 'my_aliws', to: 'standard', reason: '分词器缺失，降级为 standard' }],
  },
  reactive: {
    removedSettings: [{ key: 'index.lifecycle.name', reason: '试建报错 unknown lifecycle，兜底剔除' }],
    removedAnalysis: [],
    downgradedFields: [],
  },
  aliases: { skipped: ['prod-orders-read'], synced: ['prod-orders-write'] },
  advice: [
    { kind: 'shard', key: 'number_of_shards', message: '单分片超过 50GB 建议拆分' },
    { kind: 'replica', key: 'number_of_replicas', message: '目标节点数少，副本数建议降为 1' },
    { kind: 'storage', key: 'codec', message: 'best_compression 目标不可用建议回退' },
    { kind: 'ilm', key: 'policy', message: '源带 ILM 策略，目标未装 ILM' },
  ],
  warnings: ['推演轮次 2'],
};

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([]);
  xbSync.mockReset().mockResolvedValue(PLAN);
  askConfirmFn.mockReset().mockResolvedValue(true);
  (Element.prototype as any).scrollIntoView = vi.fn();
});

async function openPlan(host: HTMLElement) {
  const btn = host.querySelector<HTMLButtonElement>('[data-test="xm-sync-btn"]')!;
  btn.click();
  await settle();
  return document.querySelector('[data-test="xm-sync-plan"]')!;
}

/* ═══ ① vendor 芯片对 ═══ */
describe('1121 兼容计划 ①：vendor 芯片对', () => {
  it('source/target vendor.label+version 拼装：阿里云 ES 7.10.2-aliyun → 腾讯云 ES 7.14.2', async () => {
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    const plan = await openPlan(host);
    const v = plan.querySelector('[data-test="xm-plan-vendor"]')!;
    expect(v.textContent).toContain('阿里云 ES');
    expect(v.textContent).toContain('7.10.2-aliyun');
    expect(v.textContent).toContain('腾讯云 ES');
    expect(v.textContent).toContain('7.14.2');
    app.unmount();
  }, 8000);

  it('vendor/version 缺席（unknown）如实显示；回退旧顶层 sourceVersion/targetVersion', async () => {
    xbSync.mockResolvedValue({
      ...PLAN,
      source: undefined, target: undefined,
      sourceVersion: '6.8.9', targetVersion: undefined,
    });
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    const plan = await openPlan(host);
    const v = plan.querySelector('[data-test="xm-plan-vendor"]')!;
    expect(v.textContent, 'vendor 缺席=未知厂商 + 旧字段回退版本').toContain('未知厂商');
    expect(v.textContent).toContain('6.8.9');
    expect(v.textContent, 'target 双缺=版本未知').toContain('版本未知');
    app.unmount();
  }, 8000);

  it('vendor evidence 判定依据随芯片悬浮可查（Tip 包裹）；缺席（旧后端）不渲染 Tip', async () => {
    xbSync.mockResolvedValue({
      ...PLAN,
      source: { ...PLAN.source, vendor: { ...PLAN.source.vendor, evidence: 'plugin:analysis-ik' } },
      target: { ...PLAN.target, vendor: { ...PLAN.target.vendor, evidence: 'distribution:default' } },
    });
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    const plan = await openPlan(host);
    const v = plan.querySelector('[data-test="xm-plan-vendor"]')!;
    /* Tip=NTooltip hover 触发（浮层惰性渲染），锁结构形态：两侧芯片均被 .tip-trigger 包裹 */
    expect(v.querySelectorAll('.tip-trigger').length, '源/目标两侧芯片均带 evidence 悬浮').toBe(2);
    expect(v.textContent, '芯片正文不受 Tip 包裹影响').toContain('阿里云 ES');
    expect(v.textContent).toContain('腾讯云 ES');
    app.unmount();
    /* evidence 缺席（PLAN 无 evidence 字段）降级裸芯片 */
    xbSync.mockResolvedValue(PLAN);
    const second = await mountXm();
    apps.push(second.app);
    const st2 = stateOf(second.app);
    st2.form.sourceIndex = 'prod-orders';
    await settle(2);
    const plan2 = await openPlan(second.host);
    const v2 = plan2.querySelector('[data-test="xm-plan-vendor"]')!;
    expect(v2.querySelectorAll('.tip-trigger').length, '旧后端降级：无 Tip 不渲染触发层').toBe(0);
    expect(v2.textContent).toContain('阿里云 ES');
    second.app.unmount();
  }, 12000);
});

/* ═══ ② 三段清单 + reason + advice kind 徽标 ═══ */
describe('1121 兼容计划 ②：三段清单与 advice 徽标', () => {
  it('planned 矩阵预剔除 / reactive 报错兜底剔除各带 reason；advice kind 徽标中文化', async () => {
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    const plan = await openPlan(host);
    const planned = plan.querySelector('[data-test="xm-plan-planned"]')!;
    expect(planned.textContent).toContain('矩阵预剔除');
    expect(planned.textContent).toContain('index.apack.knn');
    expect(planned.textContent, '每刀带理由').toContain('目标集群无 apack 插件');
    expect(planned.textContent).toContain('title');
    expect(planned.textContent).toContain('standard');
    const reactiveSec = plan.querySelector('[data-test="xm-plan-reactive"]')!;
    expect(reactiveSec.textContent).toContain('报错兜底剔除');
    expect(reactiveSec.textContent).toContain('index.lifecycle.name');
    expect(reactiveSec.textContent).toContain('兜底剔除');
    const advice = plan.querySelector('[data-test="xm-plan-advice"]')!;
    const pills = [...advice.querySelectorAll('.pill')].map(p => p.textContent);
    expect(pills, 'advice 四类 kind 徽标中文化').toEqual(expect.arrayContaining(['分片', '副本', '存储', 'ILM']));
    expect(advice.textContent).toContain('单分片超过 50GB 建议拆分');
    app.unmount();
  }, 8000);

  it('advice kind 未命中枚举回显原文（不吞信息）', async () => {
    xbSync.mockResolvedValue({ ...PLAN, advice: [{ kind: 'custom_kind', key: 'k', message: '自定义建议' }] });
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    const plan = await openPlan(host);
    expect(plan.querySelector('[data-test="xm-plan-advice"]')!.textContent).toContain('custom_kind');
    app.unmount();
  }, 8000);
});

/* ═══ ③ 别名段 ═══ */
describe('1121 兼容计划 ③：别名段', () => {
  it('skipped/synced 分行 chips', async () => {
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    const plan = await openPlan(host);
    const al = plan.querySelector('[data-test="xm-plan-aliases"]')!;
    expect(al.textContent).toContain('将同步');
    expect(al.textContent).toContain('prod-orders-write');
    expect(al.textContent).toContain('将跳过');
    expect(al.textContent).toContain('prod-orders-read');
    app.unmount();
  }, 8000);

  it('dryRun+勾选别名：synced=源别名全集、skipped=[] —— 将同步清单如实显示（非空）', async () => {
    /* 勾选「同时迁移别名」后 dry-run：计划将同步全部源别名（skipped 空），
       预览弹层必须显示将同步清单，不得因空 skipped 整段消失 */
    xbSync.mockResolvedValue({ ...PLAN, aliases: { synced: ['ro_a', 'ro_b'], skipped: [] } });
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    const aliasBox = (host.querySelector('[data-test="xm-sync-aliases"] [role="checkbox"]')
      || host.querySelector('[data-test="xm-sync-aliases"]')) as HTMLElement;
    aliasBox.click();
    await settle(2);
    const plan = await openPlan(host);
    expect(xbSync.mock.calls[0][0]).toMatchObject({ dryRun: true, syncAliases: true });
    const al = plan.querySelector('[data-test="xm-plan-aliases"]')!;
    expect(al, 'synced 非空时别名段在场').toBeTruthy();
    expect(al.textContent).toContain('将同步');
    expect(al.textContent).toContain('ro_a');
    expect(al.textContent).toContain('ro_b');
    expect(al.textContent, '空 skipped 不渲染「将跳过」行').not.toContain('将跳过');
    app.unmount();
  }, 8000);
});

/* ═══ ④ CTA：确认链 + dryRun=false + syncAliases 跟随 ═══ */
describe('1121 兼容计划 ④：CTA 按此计划创建', () => {
  it('CTA 走确认弹层；执行请求 dryRun=false 且 syncAliases 跟随勾选', async () => {
    xbSync.mockReset()
      .mockResolvedValueOnce(PLAN)
      .mockResolvedValue({ ...PLAN, created: true, dryRun: false });
    const { app, host, pinia } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    /* 勾选「同时迁移别名」——预览与执行请求体都带 syncAliases=true */
    const aliasBox = (host.querySelector('[data-test="xm-sync-aliases"] [role="checkbox"]')
      || host.querySelector('[data-test="xm-sync-aliases"]')) as HTMLElement;
    aliasBox.click();
    await settle(2);
    const plan = await openPlan(host);
    expect(xbSync.mock.calls[0][0]).toMatchObject({ dryRun: true, syncAliases: true });
    (document.querySelector('[data-test="xm-sync-apply"]') as HTMLButtonElement).click();
    await settle();
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    const arg = askConfirmFn.mock.calls[0][0] as any;
    const facts = Object.fromEntries((arg.facts || []).map((f: any) => [f.label, f.value]));
    expect(facts['别名随迁']).toContain('勾选');
    await settle();
    expect(xbSync).toHaveBeenCalledTimes(2);
    expect(xbSync.mock.calls[1][0]).toMatchObject({ dryRun: false, syncAliases: true });
    const store = useAppStore(pinia);
    expect(store.notifyLog.some(n => n.msg.includes('已创建')), '执行成功 toast').toBe(true);
    expect(host.querySelector('[data-test="xm-sync-report"]'), '执行报告 inline 在场').toBeTruthy();
    app.unmount();
  }, 12000);

  it('取消确认不发执行；预览报告不冒充创建结果', async () => {
    askConfirmFn.mockResolvedValue(false);
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    await openPlan(host);
    (document.querySelector('[data-test="xm-sync-apply"]') as HTMLButtonElement).click();
    await settle();
    expect(xbSync, '取消后只有预览那一次').toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-test="xm-sync-report"]'), '无执行报告').toBeNull();
    app.unmount();
  }, 8000);
});

/* ═══ ⑤ 零剔除正面态 ═══ */
describe('1121 兼容计划 ⑤：零剔除正面态', () => {
  it('两段清单全空 → 「全部属性兼容，计划零剔除」', async () => {
    xbSync.mockResolvedValue({
      ...PLAN, planned: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
      reactive: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
      advice: [], aliases: { skipped: [], synced: [] }, warnings: [],
    });
    const { app, host } = await mountXm();
    apps.push(app);
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    const plan = await openPlan(host);
    expect(plan.querySelector('[data-test="xm-plan-allpass"]')!.textContent)
      .toContain('全部属性兼容，计划零剔除');
    for (const key of ['xm-plan-planned', 'xm-plan-reactive', 'xm-plan-advice', 'xm-plan-aliases', 'xm-plan-warnings']) {
      expect(plan.querySelector(`[data-test="${key}"]`), `${key} 空清单不渲染`).toBeNull();
    }
    app.unmount();
  }, 8000);
});
