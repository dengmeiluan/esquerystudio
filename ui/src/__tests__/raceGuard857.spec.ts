/**
 * 八百五十七批：横切续轮接力——async 竞态回包卫生四页 + toFixed 草稿类型防御
 * （854 预扫十族「八闭矿一豁免两记档」记档下批两项落地；814-C1 已扫域清单之外族域）。
 *
 * 族A（四页同构）：load 链「选择源快照→回包比对丢弃」守卫补齐。IndexHubView.loadDetail
 *   自带 `idx !== cur.value` 过期响应丢弃范式（857 预扫实锚）；Mapping/ConfigDrift/Ilm/
 *   IndexSettings 四页 load 在「选择源快速切换」时旧回包后到会覆盖新选择的数据——
 *   界面显示旧索引内容而选中已是新索引的数据错乱态。本批四页补齐同款快照守卫。
 * 族B：BoostTuner 权重草稿经 useScopedDraftState 持久化（JSON.parse 断言不受 TS 约束），
 *   string/缺失 boost 进模板 .toFixed(1) 抛 TypeError 炸整页渲染——「合法 JSON 非预期
 *   类型」形态（726 G85 restoreCols Array.isArray 回落同构），视图消费处归一兜底。
 *
 * 竞态用例三拍驱动：双 pending 手控回包次序（快包先落、慢包后到），断言新选择的数据
 * 存活、旧回包被丢弃（mappingFirstCut760/configDriftFirstCut757/lifecycleFirstCut735/
 * boostTunerFirstCut772 挂载范式同源：视图全真，只 mock ../api 出口）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';

/* ---- 网络出口 mock：五页挂载路径全量接管 ---- */
const inspectFn = vi.fn();
const driftKeysFn = vi.fn();
const driftFn = vi.fn();
const ilmPoliciesFn = vi.fn();
const ilmExplainFn = vi.fn();
const indexSettingsFn = vi.fn();
const searchRawFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterIndices: vi.fn(async () => []),
      clusterInspect: (...a: any[]) => inspectFn(...a),
      indexSettings: (...a: any[]) => indexSettingsFn(...a),
      indexSettingsDefaults: () => Promise.resolve({ body: '{}' }),
      analysisSettings: () => Promise.resolve({ analysis: {} }),
      putMapping: vi.fn(async () => ({ acknowledged: true })),
      updateSettings: vi.fn(async () => ({ acknowledged: true })),
      updateIndexSettings: vi.fn(async () => ({ acknowledged: true })),
      configLab: {
        ...actual.api.configLab,
        driftKeys: () => driftKeysFn(),
        drift: (...a: any[]) => driftFn(...a),
      },
      ilmPolicies: (...a: any[]) => ilmPoliciesFn(...a),
      ilmExplain: (...a: any[]) => ilmExplainFn(...a),
      ilmMove: vi.fn(async () => ({ acknowledged: true })),
      ilmPolicyPut: vi.fn(async () => ({ acknowledged: true })),
      ilmPolicyDelete: vi.fn(async () => ({ acknowledged: true })),
      searchRaw: (...a: any[]) => searchRawFn(...a),
      insight: { ...actual.api.insight, settingsImpact: vi.fn(async () => ({ rows: [] })) },
    },
  };
});

/* Monaco 内核 happy-dom canvas 崩统一 stub（743/745/747/755/757/760 spec 同款） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import MappingView from '../views/MappingView.vue';
import ConfigDriftView from '../views/ConfigDriftView.vue';
import IlmView from '../views/IlmView.vue';
import IndexSettingsView from '../views/IndexSettingsView.vue';
import BoostTunerView from '../views/BoostTunerView.vue';
import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const ROUTES = [
  '/mapping', '/config-drift', '/ilm', '/index-settings', '/boost-tuner',
].map(p => ({ path: p, component: { template: '<div/>' } }));

async function mountView(view: any, path: string, query = '') {
  history.replaceState(null, '', `#${path}${query}`);
  const router = createRouter({ history: createWebHashHistory(), routes: [...ROUTES, { path: '/:p(.*)*', component: { template: '<div/>' } }] });
  const app = createApp({ render: () => h(view as any) });
  apps.push(app);
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  await router.isReady();
  setActivePinia(pinia);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

/** 按 idx 精确放行 pending 回包（比按序弹出稳：两请求乱序释放即竞态三拍本体） */
function release(bag: Array<{ id: string; res: (v: any) => void }>, id: string, v: any) {
  const i = bag.findIndex(p => p.id === id);
  if (i < 0) throw new Error(`pending ${id} 不在场（挂载链未按预期发起请求）`);
  bag.splice(i, 1)[0].res(v);
}

/* ---- 数据球：同构两态，docCount/physicalIndex/policy/refresh_interval 值区分新旧 ---- */
const INSPECT_A = { docCount: 777, mappings: {}, settings: {} };
const INSPECT_B = { docCount: 222, mappings: {}, settings: {} };
const KEYS_857 = [
  { indexKey: 'probe-orders-v2', alias: 'orders' },
  { indexKey: 'probe-clean-v1', alias: 'clean-idx' },
];
const DRIFT_A = { liveExists: true, alias: 'orders', physicalIndex: 'drift-old-aaa',
  codeSettings: '{"index":{"refresh_interval":"30s"}}', liveSettings: '{"index":{"refresh_interval":"1s"}}',
  settingsDiff: { clean: false, different: [{ key: 'index.refresh_interval', code: '30s', live: '1s' }], onlyInCode: [], onlyInLive: [] },
  mappingDiff: { clean: true, different: [], onlyInCode: [], onlyInLive: [] } };
const DRIFT_B = { liveExists: true, alias: 'clean-idx', physicalIndex: 'drift-new-bbb',
  codeSettings: '{"index":{"number_of_shards":"3"}}', liveSettings: '{"index":{"number_of_shards":"3"}}',
  settingsDiff: { clean: true, different: [], onlyInCode: [], onlyInLive: [] },
  mappingDiff: { clean: true, different: [], onlyInCode: [], onlyInLive: [] } };
const POLICIES_857 = [
  { name: 'orders-hot', policy: { phases: { hot: { min_age: '0s' } } } },
];
const EXPLAIN_A = { indices: { 'idx-a': { managed: true, policy: 'policy-old-aaa' } } };
const EXPLAIN_B = { indices: { 'idx-b': { managed: true, policy: 'policy-new-bbb' } } };
const SETTING_A = { 'idx-a': { settings: { index: { refresh_interval: '1s', number_of_replicas: '1' } } } };
const SETTING_B = { 'idx-b': { settings: { index: { refresh_interval: '5s', number_of_replicas: '0' } } } };

let pendingInspect: Array<{ id: string; res: (v: any) => void }> = [];
let pendingDrift: Array<{ id: string; res: (v: any) => void }> = [];
let pendingExplain: Array<{ id: string; res: (v: any) => void }> = [];
let pendingSettings: Array<{ id: string; res: (v: any) => void }> = [];

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  pendingInspect = []; pendingDrift = []; pendingExplain = []; pendingSettings = [];
  inspectFn.mockReset().mockImplementation((idx: string) => new Promise(res => pendingInspect.push({ id: idx, res })));
  driftKeysFn.mockReset().mockResolvedValue(KEYS_857);
  driftFn.mockReset().mockImplementation((key: string) => new Promise(res => pendingDrift.push({ id: key, res })));
  ilmPoliciesFn.mockReset().mockResolvedValue(POLICIES_857);
  ilmExplainFn.mockReset().mockImplementation((idx: string) => new Promise(res => pendingExplain.push({ id: idx, res })));
  indexSettingsFn.mockReset().mockImplementation((idx: string) => new Promise(res => pendingSettings.push({ id: idx, res })));
  searchRawFn.mockReset().mockResolvedValue({ hits: { hits: [] }, took: 1 });
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('857 族A：async 竞态回包卫生——旧回包后到不得覆盖新选择（IndexHub 范式补齐）', () => {
  it('Mapping：切索引 idx-a→idx-b 后慢包 A 后到，详情仍显示 B（777 不得覆盖 222）', async () => {
    const host = await mountView(MappingView, '/mapping', '?idx=idx-a');
    await settle(6);
    expect(host.textContent).toContain('idx-a');
    const store = useAppStore();
    store.pick('idx-b');
    await settle(8);
    release(pendingInspect, 'idx-b', INSPECT_B);   // 快包先落
    await settle(8);
    expect(host.textContent).toContain('222 条文档');
    release(pendingInspect, 'idx-a', INSPECT_A);   // 慢包后到（先红：当前实现覆盖为 777）
    await settle(8);
    expect(host.textContent).toContain('222 条文档');
    expect(host.textContent).not.toContain('777 条文档');
  });

  it('ConfigDrift：连点两枚漂移 chip，慢报告后到不得顶掉新选中 key 的报告', async () => {
    const host = await mountView(ConfigDriftView, '/config-drift');
    await settle(8);
    const chips = host.querySelectorAll<HTMLElement>('.cd-item');
    expect(chips.length).toBe(2);
    chips[0]!.click();                              // probe-orders-v2 → drift p1
    await settle(4);
    chips[1]!.click();                              // probe-clean-v1 → drift p2（无 busy 拦截）
    await settle(4);
    expect(pendingDrift.length).toBe(2);
    release(pendingDrift, 'probe-clean-v1', DRIFT_B); // 快包先落
    await settle(8);
    expect(host.textContent).toContain('drift-new-bbb');
    release(pendingDrift, 'probe-orders-v2', DRIFT_A); // 慢包后到（先红：覆盖为 drift-old-aaa）
    await settle(8);
    expect(host.textContent).toContain('drift-new-bbb');
    expect(host.textContent).not.toContain('drift-old-aaa');
  });

  it('Ilm：follow 链连切两索引，慢 explain 后到不得顶掉新索引的 explain', async () => {
    const host = await mountView(IlmView, '/ilm');
    await settle(8);
    const store = useAppStore();
    store.pick('idx-a');
    await settle(8);
    store.pick('idx-b');
    await settle(8);
    expect(pendingExplain.map(p => p.id)).toEqual(['idx-a', 'idx-b']);
    release(pendingExplain, 'idx-b', EXPLAIN_B);    // 快包先落
    await settle(8);
    expect(host.textContent).toContain('policy-new-bbb');
    release(pendingExplain, 'idx-a', EXPLAIN_A);    // 慢包后到（先红：覆盖为 policy-old-aaa）
    await settle(8);
    expect(host.textContent).toContain('policy-new-bbb');
    expect(host.textContent).not.toContain('policy-old-aaa');
  });

  it('IndexSettings：切索引 idx-a→idx-b 后慢 settings 后到，表单保持 B 的 refresh_interval', async () => {
    const host = await mountView(IndexSettingsView, '/index-settings', '?idx=idx-a');
    await settle(6);
    const store = useAppStore();
    store.pick('idx-b');
    await settle(8);
    expect(pendingSettings.map(p => p.id)).toEqual(['idx-a', 'idx-b']);
    release(pendingSettings, 'idx-b', SETTING_B);   // 快包先落
    await settle(8);
    const inputOf = () => {
      const label = Array.from(host.querySelectorAll('label')).find(l => (l.textContent || '').includes('refresh_interval'));
      return label!.closest('div')?.querySelector('input') as HTMLInputElement;
    };
    expect(inputOf().value).toBe('5s');
    release(pendingSettings, 'idx-a', SETTING_A);   // 慢包后到（先红：表单回跳 1s）
    await settle(8);
    expect(inputOf().value).toBe('5s');
  });
});

describe('857 族B：BoostTuner 权重草稿类型防御——合法 JSON 非预期类型不得炸渲染', () => {
  it('草稿里 string boost（旧数据/手改存储）挂载不抛 TypeError，×2.5 归一显示', async () => {
    sessionStorage.setItem('esquerystudio.draft2:boost-tuner:host:-:-:fields',
      JSON.stringify([{ name: 'title', boost: '2.5' }]));
    const host = await mountView(BoostTunerView, '/boost-tuner');
    expect(host.textContent).toContain('×2.5');
    const slider = host.querySelector<HTMLInputElement>('.bt-slider');
    expect(slider).toBeTruthy();
    expect(slider!.value).toBe('2.5');
  });
});
