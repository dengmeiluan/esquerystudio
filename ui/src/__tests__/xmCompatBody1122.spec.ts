/**
 * 2026-11-22 批：兼容计划弹层 v3——适配后目标结构预览 + planDigest 防漂移。
 *
 *   ① body 预览渲染——dryRun 报告带 body{settings,mappings} 时弹层出
 *     「适配后目标结构预览」区：planDigest 短码芯片（Tip 悬浮）+ 两折叠面板
 *     （body.settings / body.mappings，JsonArea readonly+语法高亮，默认收起）；
 *   ② 复制——JsonArea 自带复制钮（readonly 态保留）：copyText 实参=prettyJson 后
 *     的 body 段全文；
 *   ③ expectPlanDigest 自动携带——「按此计划创建」执行请求带 expectPlanDigest=
 *     最近 dryRun 的 planDigest；确认弹层 facts 含计划摘要行；
 *   ④ v2 兼容——body/planDigest 缺席（旧后端）整区不渲染（不冒充）。
 * mock 打在 api.xb.syncStructure 层 + MonacoEditor stub（JsonArea 内层，jsonAreaReadonly540 同款）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const xbSync = vi.fn();
const askConfirmFn = vi.fn();
const copyTextFn = vi.fn();
/* Monaco stub 捕获窗（JsonArea 内层 props 断言用） */
const monacoCaps: { props: any; emit: (e: string, v?: any) => void }[] = [];

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
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return {
    ...actual,
    copyText: (...a: any[]) => copyTextFn(...a),
  };
});
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    setup(props: any, { emit }: any) { monacoCaps.push({ props, emit }); return {}; },
    template: '<div class="monaco-stub"></div>',
  },
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

const DIGEST = 'a1b2c3d4e5f60718';
/* v3 计划：v2 基础上带 planDigest + body（适配后 create body） */
const PLAN_V3 = {
  created: false, dryRun: true, destIndex: 'uat-orders', rounds: 2,
  destConnId: 'conn-host',
  planDigest: DIGEST,
  body: {
    settings: { 'index.number_of_shards': 3, 'index.number_of_replicas': 1 },
    mappings: { properties: { title: { type: 'text', analyzer: 'standard' } } },
    aliases: ['uat-orders-read'],
  },
  source: { index: 'prod-orders', version: '7.10.2-aliyun', vendor: { id: 'aliyun', label: '阿里云 ES' } },
  target: { index: 'uat-orders', version: '7.14.2', vendor: { id: 'tencent', label: '腾讯云 ES' } },
  planned: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
  reactive: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
  aliases: { skipped: [], synced: [] },
  advice: [], warnings: [],
};
const EXEC_V3 = { ...PLAN_V3, created: true, dryRun: false };

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([]);
  xbSync.mockReset().mockResolvedValueOnce(PLAN_V3).mockResolvedValue(EXEC_V3);
  askConfirmFn.mockReset().mockResolvedValue(true);
  copyTextFn.mockReset().mockResolvedValue(true);
  monacoCaps.length = 0;
  (Element.prototype as any).scrollIntoView = vi.fn();
});

async function openPlan(host: HTMLElement) {
  (host.querySelector('[data-test="xm-sync-btn"]') as HTMLButtonElement).click();
  await settle();
  return document.querySelector('[data-test="xm-sync-plan"]') as HTMLElement;
}

/* ═══ ① body 预览渲染 ═══ */
describe('1122 v3 ①：适配后目标结构预览', () => {
  it('digest 短码芯片在场；两折叠面板默认收起，展开后 JsonArea 渲染对应段', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    const plan = await openPlan(host);
    const bodySec = plan.querySelector('[data-test="xm-plan-body"]')!;
    expect(bodySec, 'body 预览区在场').toBeTruthy();
    expect(plan.querySelector('[data-test="xm-plan-digest"]')!.textContent).toContain(DIGEST);
    /* 默认收起：折叠头在场、内容（JsonArea）不渲染 */
    const setCp = plan.querySelector('[data-test="xm-plan-body-settings"]')!;
    expect(setCp.querySelector('.cp-toggle')!.textContent).toContain('body.settings');
    expect(setCp.querySelector('.ja'), '默认收起不渲染 JsonArea').toBeNull();
    /* 展开 settings → JsonArea（Monaco stub）挂载并带适配后内容 */
    (setCp.querySelector('.cp-toggle') as HTMLButtonElement).click();
    await settle(2);
    expect(setCp.querySelector('.ja'), '展开渲染 JsonArea').toBeTruthy();
    const caps = monacoCaps.filter(c => String(c.props.modelValue).includes('index.number_of_shards'));
    expect(caps.length, 'settings 段进 Monaco（readonly+定高）').toBeGreaterThan(0);
    expect(caps[0].props.readonly).toBe(true);
    expect(String(caps[0].props.modelValue)).toContain('3');
    /* mappings 面板同款 */
    const mapCp = plan.querySelector('[data-test="xm-plan-body-mappings"]')!;
    (mapCp.querySelector('.cp-toggle') as HTMLButtonElement).click();
    await settle(2);
    const mapCaps = monacoCaps.filter(c => String(c.props.modelValue).includes('"title"'));
    expect(mapCaps.length, 'mappings 段进 Monaco').toBeGreaterThan(0);
    app.unmount();
  }, 10000);

  it('复制钮（JsonArea 自带）：copyText 实参=该段 prettyJson 全文', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    const plan = await openPlan(host);
    (plan.querySelector('[data-test="xm-plan-body-settings"] .cp-toggle') as HTMLButtonElement).click();
    await settle(2);
    /* JsonArea 工具钮提示已随全站 v-tip 迁移（无原生 title 属性）——按钮定位改按文本「复制」 */
    const copyBtn = [...plan.querySelectorAll('[data-test="xm-plan-body-settings"] .ja-btn')]
      .find(b => b.textContent!.trim().startsWith('复制')) as HTMLButtonElement;
    copyBtn.click();
    await settle(4);
    expect(copyTextFn).toHaveBeenCalled();
    const arg = copyTextFn.mock.calls[0][0] as string;
    expect(arg).toContain('index.number_of_shards');
    expect(arg).toContain('3');
    app.unmount();
  }, 10000);
});

/* ═══ ③ expectPlanDigest 自动携带 ═══ */
describe('1122 v3 ③：expectPlanDigest 自动携带', () => {
  it('预览请求不带 digest；执行请求带 expectPlanDigest=最近 dryRun 的 planDigest；facts 含计划摘要', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    await openPlan(host);
    expect(xbSync.mock.calls[0][0].expectPlanDigest, '预览（dryRun）不带').toBeUndefined();
    (document.querySelector('[data-test="xm-sync-apply"]') as HTMLButtonElement).click();
    await settle();
    const arg = askConfirmFn.mock.calls[0][0] as any;
    const facts = Object.fromEntries((arg.facts || []).map((f: any) => [f.label, f.value]));
    expect(facts['计划摘要']).toContain(DIGEST);
    expect(facts['计划摘要']).toContain('漂移');
    await settle();
    expect(xbSync).toHaveBeenCalledTimes(2);
    expect(xbSync.mock.calls[1][0].expectPlanDigest, '执行自动携带 expectPlanDigest').toBe(DIGEST);
    expect(xbSync.mock.calls[1][0].dryRun).toBe(false);
    app.unmount();
  }, 12000);
});

/* ═══ ④ v2 兼容（旧后端无 body/planDigest） ═══ */
describe('1122 v3 ④：v2 兼容', () => {
  it('body/planDigest 缺席 → body 预览区整区不渲染（不冒充）；执行不带 digest', async () => {
    const PLAN_V2 = {
      created: false, dryRun: true, destIndex: 'uat-orders', rounds: 1,
      source: { index: 'prod-orders', version: '7.10.2', vendor: { id: 'oss', label: '开源 ES' } },
      target: { index: 'uat-orders', version: '7.10.2', vendor: { id: 'oss', label: '开源 ES' } },
      planned: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
      reactive: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
      aliases: { skipped: [], synced: [] }, advice: [], warnings: [],
    };
    xbSync.mockReset().mockResolvedValueOnce(PLAN_V2).mockResolvedValue({ ...PLAN_V2, created: true, dryRun: false });
    const { app, host } = await mountXm();
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    const plan = await openPlan(host);
    expect(plan.querySelector('[data-test="xm-plan-body"]'), 'v2 报告不出 body 预览区').toBeNull();
    (document.querySelector('[data-test="xm-sync-apply"]') as HTMLButtonElement).click();
    await settle(6);
    expect(xbSync.mock.calls[1][0].expectPlanDigest, '无 digest 不带该参').toBeUndefined();
    app.unmount();
  }, 12000);
});
