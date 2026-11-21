/**
 * 2026-11-22 批：结构对比（diff-structure）UI 化——api.xb.diffStructure 有端点无视图的补齐。
 *
 *   ① 入口条件——目标索引已存在（宿主清单命中同步目标名）时「结构对比」次级动作在场；
 *     目标不存在不出；手输连接（无 srcConnId）时按钮禁用（服务端 diff 契约同能力对比口径）；
 *   ② 请求契约——点击调 api.xb.diffStructure({srcConnId, sourceIndex, destIndex}, target)，
 *     弹层先出加载态再出结果；
 *   ③ 三清单渲染——settings 差异 / 分析组件差异 / 字段增删改，每项带变化说明与豁免徽标：
 *     命中兼容计划剔除集（expectedRemovals）的项标「豁免」+剔除原因，计划外差异行红色；
 *     嵌套 index.analysis 整键按组件差集豁免（browserXmigrate 同口径）；
 *     字段降级豁免仅 type 未变成立；
 *   ④ 空差异正面态——三清单全空显示「结构已一致」，不渲染空清单区块；
 *   ⑤ 错误态——内联展示 + 重试可再发。
 * 挂具范式同 xmVerifyEquivalence1122（全真挂载 + api mock；n-modal teleport 查 document）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const xbDestIndices = vi.fn();
const xbDiff = vi.fn();

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
        diffStructure: (...a: any[]) => xbDiff(...a),
      },
    },
  };
});

const NOW = Date.now();
const BASE_JOB = {
  jobId: 'j-df', status: 'DONE', destIndex: 'prod-orders', sourceIndex: 'prod-orders',
  remoteEndpoint: 'http://old:9200', migrated: 10, total: 10, conflicts: 0, errors: 0,
  createTime: NOW - 60000, sliceStatus: {}, sliceMigrated: {}, sliceErrors: {},
};

/* 全量差异样本：豁免三路（settings 整键 / 嵌套 analysis 组件差集 / 字段降级 type 未变）
   + 计划外三路（settings 单侧 / analysis 目标新增 / 字段 type 变化） */
const DIFF_FULL = {
  sourceIndex: 'prod-orders', destIndex: 'prod-orders', destConnId: null,
  settingsDiff: {
    onlyInSource: [
      { key: 'index.apack.knn', sourceValue: 'true' },          /* 豁免：命中 settings 剔除键 */
      { key: 'index.refresh_interval', sourceValue: '10s' },    /* 计划外：仅源有 */
    ],
    onlyInTarget: [
      { key: 'index.number_of_replicas', targetValue: '1' },    /* 计划外：仅目标有 */
    ],
    valueChanged: [
      { key: 'index.analysis', sourceValue: { analyzer: { my_aliws: { type: 'custom' }, kept: { type: 'standard' } } },
        targetValue: { analyzer: { kept: { type: 'standard' } } } },  /* 豁免：组件差集 ⊆ 剔除集 */
      { key: 'index.max_result_window', sourceValue: 10000, targetValue: 65536 }, /* 计划外：值不一致 */
    ],
  },
  mappingsDiff: {
    fieldAdded: [{ field: 'extra', type: 'keyword' }],
    fieldRemoved: [{ field: 'legacy', type: 'text' }],
    fieldChanged: [
      { field: 'title', sourceType: 'text', targetType: 'text', detail: 'analyzer: my_aliws -> standard' }, /* 豁免：降级 type 未变 */
      { field: 'body', sourceType: 'text', targetType: 'keyword', detail: 'type: text -> keyword' },        /* 计划外：type 变了 */
    ],
  },
  expectedRemovals: [
    { area: 'settings', key: 'index.apack.knn', reason: '目标集群无 apack 插件' },
    { area: 'analysis', key: 'analyzer.my_aliws', reason: '阿里云自定义分词器在目标不可用' },
    { area: 'mappings', key: 'title', reason: '分词器缺失，降级为 standard' },
  ],
  unexpected: [
    { area: 'settings', key: 'index.refresh_interval', message: '源设置未出现在目标且不在预期剔除清单内' },
  ],
  compatible: false,
};

/* 空差异：三清单全空 + 零豁免 → 「结构已一致」正面态 */
const DIFF_CLEAN = {
  sourceIndex: 'prod-orders', destIndex: 'prod-orders', destConnId: null,
  settingsDiff: { onlyInSource: [], onlyInTarget: [], valueChanged: [] },
  mappingsDiff: { fieldAdded: [], fieldRemoved: [], fieldChanged: [] },
  expectedRemovals: [], unexpected: [], compatible: true,
};

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
  return { app, host };
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

/* 挂载后选好源档案与源索引（同步目标名跟随源索引 → 默认同名对比） */
async function mountPicked() {
  const ctx = await mountXm();
  const st = stateOf(ctx.app);
  st.srcConnId = 'c1';
  st.form.sourceIndex = 'prod-orders';
  await settle(2);
  return { ...ctx, st };
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([BASE_JOB]);
  xbDestIndices.mockReset().mockResolvedValue([{ index: 'prod-orders' }, { index: 'other' }]);
  xbDiff.mockReset().mockResolvedValue(DIFF_FULL);
  (Element.prototype as any).scrollIntoView = vi.fn();
});

/* ═══ ① 入口条件 ═══ */
describe('结构对比 ①：入口条件', () => {
  it('目标索引已存在（宿主清单命中同步目标名）→「结构对比」在场；目标不存在不出', async () => {
    const { app, host, st } = await mountPicked();
    expect(host.querySelector('[data-test="xm-diff-btn"]'), '目标在场→按钮在场').toBeTruthy();
    /* 换目标名（宿主清单无此索引）→ 按钮退场 */
    st.syncDest = 'not-created-yet';
    await settle(2);
    expect(host.querySelector('[data-test="xm-diff-btn"]'), '目标不存在→按钮退场').toBeNull();
    app.unmount();
  }, 8000);

  it('手输连接（无 srcConnId）按钮禁用；选档案后启用', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    const btn = host.querySelector<HTMLButtonElement>('[data-test="xm-diff-btn"]')!;
    expect(btn, '按钮在场（目标存在）').toBeTruthy();
    expect(btn.disabled, '手输连接禁用（diff 契约需源档案）').toBe(true);
    st.srcConnId = 'c1';
    await settle(2);
    expect(btn.disabled, '选档案后启用').toBe(false);
    app.unmount();
  }, 8000);
});

/* ═══ ② 请求契约 ═══ */
describe('结构对比 ②：请求契约与加载态', () => {
  it('点击调 api.xb.diffStructure({srcConnId, sourceIndex, destIndex}, target)，先加载态后结果', async () => {
    let resolveDiff: (v: any) => void = () => {};
    xbDiff.mockReturnValue(new Promise(r => { resolveDiff = r; }));
    const { app, host } = await mountPicked();
    (host.querySelector('[data-test="xm-diff-btn"]') as HTMLButtonElement).click();
    await settle(2);
    expect(xbDiff).toHaveBeenCalledWith(
      { srcConnId: 'c1', sourceIndex: 'prod-orders', destIndex: 'prod-orders' }, 'c1');
    expect(document.querySelector('[data-test="xm-diff"]'), '弹层在场').toBeTruthy();
    expect(document.querySelector('[data-test="xm-diff-loading"]'), '在途加载态').toBeTruthy();
    resolveDiff(DIFF_FULL);
    await settle(2);
    expect(document.querySelector('[data-test="xm-diff-loading"]'), '落定后退场').toBeNull();
    app.unmount();
  }, 8000);
});

/* ═══ ③ 三清单 + 豁免徽标 ═══ */
describe('结构对比 ③：三清单与豁免徽标', () => {
  it('settings/分析组件/字段三清单渲染：豁免徽标+剔除原因在场，计划外行红色', async () => {
    const { app, host } = await mountPicked();
    (host.querySelector('[data-test="xm-diff-btn"]') as HTMLButtonElement).click();
    await settle(4);
    /* 索引对 + 判定徽标（unexpected=1 → 存在计划外差异） */
    const pair = document.querySelector('[data-test="xm-diff-pair"]')!;
    expect(pair.textContent).toContain('prod-orders');
    expect(pair.textContent).toContain('存在计划外差异 1 项');
    /* settings 清单：豁免项（剔除原因可见）+ 计划外项（红行） */
    const settingsSec = document.querySelector('[data-test="xm-diff-settings"]')!;
    expect(settingsSec.textContent).toContain('index.apack.knn');
    expect(settingsSec.textContent).toContain('目标集群无 apack 插件');
    expect(settingsSec.textContent).toContain('index.refresh_interval');
    expect(settingsSec.querySelectorAll('.xm-diff-exempt').length, 'settings 区 1 项豁免').toBe(1);
    expect(settingsSec.querySelectorAll('li.xm-diff-bad').length, 'settings 区 3 行计划外红（单侧存在×2+值变化）').toBe(3);
    /* 分析组件清单：嵌套 index.analysis 组件差集行豁免 */
    const analysisSec = document.querySelector('[data-test="xm-diff-analysis"]')!;
    expect(analysisSec.textContent).toContain('analyzer.my_aliws');
    expect(analysisSec.textContent).toContain('阿里云自定义分词器在目标不可用');
    expect(analysisSec.querySelectorAll('.xm-diff-exempt').length, '组件差集命中豁免').toBe(1);
    /* 字段清单：降级豁免（type 未变）+ type 变化计划外 */
    const fieldsSec = document.querySelector('[data-test="xm-diff-fields"]')!;
    expect(fieldsSec.textContent).toContain('title');
    expect(fieldsSec.textContent).toContain('分词器缺失，降级为 standard');
    expect(fieldsSec.textContent).toContain('body');
    expect(fieldsSec.textContent).toContain('text → keyword');
    const titleRow = [...fieldsSec.querySelectorAll('li')].find(li => li.textContent!.includes('title'))!;
    expect(titleRow.className, 'title 命中降级豁免不标红').not.toContain('xm-diff-bad');
    expect(titleRow.querySelector('.xm-diff-exempt'), 'title 豁免徽标在场').toBeTruthy();
    const bodyRow = [...fieldsSec.querySelectorAll('li')].find(li => li.textContent!.includes('body'))!;
    expect(bodyRow.className, 'body type 变化按计划外标红').toContain('xm-diff-bad');
    app.unmount();
  }, 8000);
});

/* ═══ ④ 空差异正面态 ═══ */
describe('结构对比 ④：空差异正面态', () => {
  it('三清单全空 →「结构已一致」，不渲染空清单区块', async () => {
    xbDiff.mockResolvedValue(DIFF_CLEAN);
    const { app, host } = await mountPicked();
    (host.querySelector('[data-test="xm-diff-btn"]') as HTMLButtonElement).click();
    await settle(4);
    expect(document.querySelector('[data-test="xm-diff-clean"]')!.textContent).toContain('结构已一致');
    expect(document.querySelector('[data-test="xm-diff-settings"]'), '空清单区块不渲染').toBeNull();
    expect(document.querySelector('[data-test="xm-diff-analysis"]'), '空清单区块不渲染').toBeNull();
    expect(document.querySelector('[data-test="xm-diff-fields"]'), '空清单区块不渲染').toBeNull();
    app.unmount();
  }, 8000);
});

/* ═══ ⑤ 错误态 + 重试 ═══ */
describe('结构对比 ⑤：错误态', () => {
  it('请求失败内联展示（不冒充结论），重试可再发', async () => {
    xbDiff.mockRejectedValueOnce(new Error('目标索引不存在或不可读'))
      .mockResolvedValue(DIFF_CLEAN);
    const { app, host } = await mountPicked();
    (host.querySelector('[data-test="xm-diff-btn"]') as HTMLButtonElement).click();
    await settle(4);
    const err = document.querySelector('[data-test="xm-diff-err"]')!;
    expect(err.textContent).toContain('结构对比失败');
    expect(document.querySelector('[data-test="xm-diff-clean"]'), '失败不出正面态').toBeNull();
    (err.querySelector('button') as HTMLButtonElement).click();
    await settle(4);
    expect(xbDiff).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-test="xm-diff-clean"]'), '重试成功出正面态').toBeTruthy();
    app.unmount();
  }, 8000);
});
