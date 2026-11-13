/**
 * 九百九十九批：写操作视图的页面级只读说明条（六视图 → 十四视图）。
 *
 * 背景：无写权限身份下写按钮按 v-if 隐藏，用户只看到功能凭空消失。
 * 对齐 RestView 既有说明条形态（role=status + Shield 图标 + 「当前身份只读：…」句式），
 * 在各写操作视图加一条横幅：身份已探测且无写权限时出现，解释哪些操作不可用。
 * 本批扩八视图：ReindexAdvanced/Aliases/ClusterSettings/Mapping/Ilm/Lifecycle/Slm/Snapshots。
 *
 * 驱动方式照 synonymsFirstCut719.spec（Monaco/JsonArea stub + monaco api mock + api mock
 * + pinia/router 真挂）；权限面走真 auth store：me=VIEWER + grantedPages 空数组
 * （空集=全拒）→ canEndpoint 全 false，等价 VIEWER 只读身份；身份未定（me=null）
 * 时 canEndpoint fail-open 放行，说明条不出现，作负锚断言。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* MonacoEditor stub：happy-dom 不可挂真件（synonymsFirstCut719 同款最小桩） */
vi.mock('../../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute'],
    template: '<div class="monaco-stub"></div>',
  },
}));
/* JsonArea stub：内部包 MonacoEditor，一并桩化（Templates/Mapping/Analysis 三页消费） */
vi.mock('../../components/JsonArea.vue', () => ({
  default: {
    name: 'JsonArea',
    props: ['modelValue', 'fill', 'dslAssist', 'rows', 'placeholder'],
    emits: ['update:modelValue', 'keydown'],
    template: '<div class="ja-stub"></div>',
  },
}));
/* PainlessLabView 直接 import monaco api（params 补全 provider 注册），happy-dom 下须 mock */
vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  editor: { defineTheme: () => {}, create: () => ({}), setTheme: () => {}, setModelMarkers: () => {} },
  languages: {
    registerCompletionItemProvider: () => ({ dispose() {} }),
    register: () => {},
    setMonarchTokensProvider: () => {},
    setLanguageConfiguration: () => {},
    registerCodeActionProvider: () => ({ dispose() {} }),
    json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
  },
  Range: class {},
  KeyMod: {},
  KeyCode: {},
  MarkerSeverity: {},
}));
/* api mock：显式覆盖挂载链关键读调用；其余方法 Proxy 兜底空对象（各页 load 自带 || [] 兜底），
 * 十四视图挂载面宽（aliases/ilm/slm/snapshots/cluster-settings…逐页枚举易漏，兜底优先）。 */
vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  const ok = () => Promise.resolve({});
  const explicit = {
    listStoredScripts: ok,
    templates: () => Promise.resolve({ index_templates: [], component_templates: [], legacy: false }),
    mappingDetail: ok,
    analysisSettings: ok,
    reloadAnalyzers: ok,
    synonymsUpsert: ok,
    setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    clusterIndices: () => Promise.resolve([]),
    snapshotRepos: () => Promise.resolve([]),
    overview: () => Promise.resolve({}),
    clusterHealth: () => Promise.resolve({}),
  };
  return {
    ...actual,
    api: new Proxy({ ...actual.api, ...explicit }, {
      get(target, key: string) {
        if (key in target) {
          const v = (target as Record<string, unknown>)[key];
          if (typeof v === 'function' || key === 'setup') return v;
        }
        return () => Promise.resolve({});
      },
    }),
  };
});

import { useAuthStore } from '../../stores/auth';
import PainlessLabView from '../../views/PainlessLabView.vue';
import SearchTemplatesView from '../../views/SearchTemplatesView.vue';
import TemplatesView from '../../views/TemplatesView.vue';
import MappingDesignerView from '../../views/MappingDesignerView.vue';
import AnalysisSettingsView from '../../views/AnalysisSettingsView.vue';
import SynonymsManagerView from '../../views/SynonymsManagerView.vue';
import ReindexAdvancedView from '../../views/ReindexAdvancedView.vue';
import AliasesView from '../../views/AliasesView.vue';
import ClusterSettingsView from '../../views/ClusterSettingsView.vue';
import MappingView from '../../views/MappingView.vue';
import IlmView from '../../views/IlmView.vue';
import LifecycleView from '../../views/LifecycleView.vue';
import SlmView from '../../views/SlmView.vue';
import SnapshotsView from '../../views/SnapshotsView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];
let pinia: Pinia | null = null;

async function mountView(comp: any): Promise<HTMLElement> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  pinia = createPinia();
  const app = createApp({ render: () => h(comp as any) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

/* 设为「已探测的只读身份」：VIEWER + grantedPages 空数组 = canEndpoint 全拒 */
function becomeReadonlyViewer() {
  const auth = useAuthStore(pinia!);
  auth.me = { username: 'u', role: 'VIEWER', fallback: false, grantedPages: [] };
  auth.probed = true;
}

beforeEach(() => { pinia = null; });
afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('999 六个写操作视图的页面级只读说明条', () => {
  it('PainlessLabView：只读身份出 .pl-perm-note（身份未定不出条）', async () => {
    const host = await mountView(PainlessLabView);
    expect(host.querySelector('.pl-perm-note'), '身份未定时 canEndpoint fail-open 放行，说明条不出现').toBeNull();
    becomeReadonlyViewer();
    await settle();
    const note = host.querySelector('.pl-perm-note[role="status"]');
    expect(note, '只读身份下说明条必须出现').toBeTruthy();
    expect(note!.textContent).toContain('当前身份只读');
    expect(note!.textContent).toContain('已存储脚本的保存/删除不可用');
  });

  it('SearchTemplatesView：只读身份出 .st-perm-note（身份未定不出条）', async () => {
    const host = await mountView(SearchTemplatesView);
    expect(host.querySelector('.st-perm-note'), '身份未定时说明条不出现').toBeNull();
    becomeReadonlyViewer();
    await settle();
    const note = host.querySelector('.st-perm-note[role="status"]');
    expect(note, '只读身份下说明条必须出现').toBeTruthy();
    expect(note!.textContent).toContain('当前身份只读');
    expect(note!.textContent).toContain('搜索模板的保存/删除不可用');
  });

  it('TemplatesView：只读身份出 .tv2-perm-note（身份未定不出条）', async () => {
    const host = await mountView(TemplatesView);
    expect(host.querySelector('.tv2-perm-note'), '身份未定时说明条不出现').toBeNull();
    becomeReadonlyViewer();
    await settle();
    const note = host.querySelector('.tv2-perm-note[role="status"]');
    expect(note, '只读身份下说明条必须出现').toBeTruthy();
    expect(note!.textContent).toContain('当前身份只读');
    expect(note!.textContent).toContain('模板的新建/保存/删除不可用');
  });

  it('MappingDesignerView：只读身份出 .md-perm-note（身份未定不出条）', async () => {
    const host = await mountView(MappingDesignerView);
    expect(host.querySelector('.md-perm-note'), '身份未定时说明条不出现').toBeNull();
    becomeReadonlyViewer();
    await settle();
    const note = host.querySelector('.md-perm-note[role="status"]');
    expect(note, '只读身份下说明条必须出现').toBeTruthy();
    expect(note!.textContent).toContain('当前身份只读');
    expect(note!.textContent).toContain('加字段不可用');
  });

  it('AnalysisSettingsView：只读身份出 .as-perm-note（双写门全关才出）', async () => {
    const host = await mountView(AnalysisSettingsView);
    expect(host.querySelector('.as-perm-note'), '身份未定时说明条不出现').toBeNull();
    becomeReadonlyViewer();
    await settle();
    const note = host.querySelector('.as-perm-note[role="status"]');
    expect(note, '保存与热重载两门全关时说明条必须出现').toBeTruthy();
    expect(note!.textContent).toContain('当前身份只读');
    expect(note!.textContent).toContain('Analysis 的保存/热重载不可用');
  });

  it('SynonymsManagerView：只读身份出 .sy-perm-note（双写门全关才出）', async () => {
    const host = await mountView(SynonymsManagerView);
    expect(host.querySelector('.sy-perm-note'), '身份未定时说明条不出现').toBeNull();
    becomeReadonlyViewer();
    await settle();
    const note = host.querySelector('.sy-perm-note[role="status"]');
    expect(note, '下发与热重载两门全关时说明条必须出现').toBeTruthy();
    expect(note!.textContent).toContain('当前身份只读');
    expect(note!.textContent).toContain('同义词的下发/热重载不可用');
  });

  it('ReindexAdvancedView：只读身份出 .ra-perm-note（此前全站唯一零提示的写视图）', async () => {
    const host = await mountView(ReindexAdvancedView);
    expect(host.querySelector('.ra-perm-note'), '身份未定时说明条不出现').toBeNull();
    becomeReadonlyViewer();
    await settle();
    const note = host.querySelector('.ra-perm-note[role="status"]');
    expect(note, '只读身份下说明条必须出现').toBeTruthy();
    expect(note!.textContent).toContain('高级重建的提交/重试不可用');
  });

  it('AliasesView：只读身份出 .alv-perm-note', async () => {
    const host = await mountView(AliasesView);
    expect(host.querySelector('.alv-perm-note'), '身份未定时说明条不出现').toBeNull();
    becomeReadonlyViewer();
    await settle();
    const note = host.querySelector('.alv-perm-note[role="status"]');
    expect(note).toBeTruthy();
    expect(note!.textContent).toContain('别名的新建/设写/解绑不可用');
  });

  it('ClusterSettingsView：只读身份出 .cs-perm-note', async () => {
    const host = await mountView(ClusterSettingsView);
    expect(host.querySelector('.cs-perm-note'), '身份未定时说明条不出现').toBeNull();
    becomeReadonlyViewer();
    await settle();
    const note = host.querySelector('.cs-perm-note[role="status"]');
    expect(note).toBeTruthy();
    expect(note!.textContent).toContain('集群设置的持久/动态下发不可用');
  });

  it('MappingView：只读身份出 .mp-perm-note', async () => {
    const host = await mountView(MappingView);
    expect(host.querySelector('.mp-perm-note'), '身份未定时说明条不出现').toBeNull();
    becomeReadonlyViewer();
    await settle();
    const note = host.querySelector('.mp-perm-note[role="status"]');
    expect(note).toBeTruthy();
    expect(note!.textContent).toContain('添加字段需 mapping 写权限');
  });

  it('IlmView：只读身份出 .ilm-perm-note（管理+迁移双写门全关才出）', async () => {
    const host = await mountView(IlmView);
    expect(host.querySelector('.ilm-perm-note'), '身份未定时说明条不出现').toBeNull();
    becomeReadonlyViewer();
    await settle();
    const note = host.querySelector('.ilm-perm-note[role="status"]');
    expect(note).toBeTruthy();
    expect(note!.textContent).toContain('策略的新建/编辑/删除与手动迁移不可用');
  });

  it('LifecycleView：只读身份出 .lc-perm-note（操作+迁移双写门全关才出）', async () => {
    const host = await mountView(LifecycleView);
    expect(host.querySelector('.lc-perm-note'), '身份未定时说明条不出现').toBeNull();
    becomeReadonlyViewer();
    await settle();
    const note = host.querySelector('.lc-perm-note[role="status"]');
    expect(note).toBeTruthy();
    expect(note!.textContent).toContain('生命周期的启动/停止/rollover/迁移不可用');
  });

  it('SlmView：只读身份出 .slm-perm-note', async () => {
    const host = await mountView(SlmView);
    expect(host.querySelector('.slm-perm-note'), '身份未定时说明条不出现').toBeNull();
    becomeReadonlyViewer();
    await settle();
    const note = host.querySelector('.slm-perm-note[role="status"]');
    expect(note).toBeTruthy();
    expect(note!.textContent).toContain('立即执行属集群级动作');
  });

  it('SnapshotsView：只读身份出 .sv-perm-note', async () => {
    const host = await mountView(SnapshotsView);
    expect(host.querySelector('.sv-perm-note'), '身份未定时说明条不出现').toBeNull();
    becomeReadonlyViewer();
    await settle();
    const note = host.querySelector('.sv-perm-note[role="status"]');
    expect(note).toBeTruthy();
    expect(note!.textContent).toContain('快照的创建/恢复/删除不可用');
  });
});
