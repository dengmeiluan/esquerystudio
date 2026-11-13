/**
 * 五百二十八批：全局工作索引（store.pickedIdx）与 6 视图接入收口。
 *
 * ① AdhocRebuildView：索引名草稿与全局选中是两份状态（写类向导不开 useIdxState follow，
 *    R61 口径）——pickedIdx 真实变化且草稿为空 → 回填（只补空，不覆写用户稿）；
 *    「用当前索引」小钮显式覆盖（有稿时仍在）；轮询合并 useAutoRefresh（源码锁，
 *    间隔沿用 2000ms，document.hidden 裸守卫与裸 setInterval 退役）；4 处裸拼
 *    '失败：'+(e?.message||e) → friendlyEsError（源码锁）。
 * ② IlmView：explain 索引 useUrlState('idx') → useIdxState({follow:true})——同键 ?idx=
 *    深链天然兼容（useIdxState 内部即 useUrlState('idx', pickedIdx)），深链上行顶栏；
 *    顶栏切索引跟随且 explain 重拉（watch 驱动——n-select @update:value 只覆盖用户交互，
 *    程序化跟随不经过它）。
 * ③ ConfigValidatorView：「从现有索引导入」起点初值回填 pickedIdx（一次性，用户仍可改）；
 *    3 处裸拼错误 → friendlyEsError（源码锁）。
 * ④ ReindexPreviewView：source 并轨 useIdxState({follow:true})（只读预估页属跟随白名单，
 *    519 批口径；?src= 键归并全站统一 ?idx=）。
 * ⑤ ReindexAdvancedView：srcIndex 并轨 useIdxState 且带条件 guard——destIndex 已有
 *    手填/草稿值时冻结跟随；手编 body 编辑器接 dsl-assist（透传 src fields）。
 * ⑥ XmigrateView：第 2 步宿主目标索引仅空时回填 pickedIdx（不改用户输入/草稿）；
 *    页头统一 PageHeader（展开/收起表单入口上移至页头 actions，功能不丢）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { draftStorageKey } from '../composables/useScopedDraft';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* ── 共享 mock 面：覆盖 6 视图挂载会触到的全部网络出口（rebuildThreeState/adhocStateMachine 并集） ── */
const prepareFn = vi.fn(async () => ({
  index: 'stub', isAlias: true, physicals: ['stub_v1'],
  sourcePhysical: 'stub_v1', docCount: 3,
  settingsJson: '{"index":{"number_of_replicas":1}}',
  mappingJson: JSON.stringify({ properties: { f: { type: 'keyword' } } }),
  suggestedDest: 'stub_v2', timeFieldCandidates: [],
}));
const adhocJobsFn = vi.fn(async () => []);
const dateFormsFn = vi.fn(async () => ({ sampled: 50, sampling: 'random_score', forms: {} }));
const validateFn = vi.fn(async () => ({ valid: true, dryRunPassed: true }));
/* rest 参数签名：api 包装层 (...a: any[]) => fn(...a) 展开进定参会 TS2556 */
const clusterInspectFn = vi.fn(async (..._a: any[]) => ({ settings: {}, mappings: {} }));
const createIndexFn = vi.fn(async (..._a: any[]) => ({}));
const ilmPoliciesFn = vi.fn(async (..._a: any[]) => []);
const ilmExplainFn = vi.fn(async (...a: any[]) => ({ indices: { [String(a[0])]: { managed: true, phase: 'hot', action: 'rollover', step: 'check' } } }));
const reindexPreviewFn = vi.fn(async (..._a: any[]) => ({ docs: 0, sourceTotalDocs: 0, sourcePrimaryBytes: 0, avgDocBytes: 0, estimatedTargetBytes: 0 }));
const reindexAdvancedFn = vi.fn(async (..._a: any[]) => ({ taskId: 't' }));
const xbJobsFn = vi.fn(async (..._a: any[]) => []);

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      adhoc: { ...orig.api.adhoc, prepare: prepareFn, jobs: adhocJobsFn },
      dateForms: dateFormsFn,
      configLab: { ...orig.api.configLab, validate: validateFn },
      clusterInspect: (...a: any[]) => clusterInspectFn(...a),
      createIndex: (...a: any[]) => createIndexFn(...a),
      ilmPolicies: (...a: any[]) => ilmPoliciesFn(...a),
      ilmExplain: (...a: any[]) => ilmExplainFn(...a),
      reindexPreview: (...a: any[]) => reindexPreviewFn(...a),
      reindexAdvanced: (...a: any[]) => reindexAdvancedFn(...a),
      /* useIndexFields（dsl-assist 字段源）与 store.loadIndices 链路挡真实 fetch（不断言） */
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      keys: () => Promise.resolve([]),
      clustersList: () => Promise.resolve([]),
      clusterIndices: () => Promise.resolve([]),
      aliases: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({ body: { version: { number: '8.11.0' } } }),
      setup: { ...orig.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      xb: {
        ...orig.api.xb,
        jobs: (...a: any[]) => xbJobsFn(...a),
        connectCheck: () => Promise.resolve([]),
        start: () => Promise.resolve({ jobId: 'j' }),
        destIndices: () => Promise.resolve([]),
      },
    },
  };
});

/* Monaco stub（MonacoEditor 直挂/JsonArea 内核共用；caps 供 ReindexAdvanced body 编辑器断言） */
const monacoCaps: { props: any }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute'],
    setup(props: any) { monacoCaps.push({ props }); return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

async function settle(n = 8) {
  const { nextTick } = await import('vue');
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function mountView(comp: any, opts: { hash?: string } = {}) {
  location.hash = opts.hash || '#/';
  const { createApp, h } = await import('vue');
  const { createPinia, setActivePinia } = await import('pinia');
  const { useAppStore } = await import('../stores/app');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAppStore();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(comp) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  await settle();
  await wait(30);
  await settle();
  return { host, store, unmount: () => app.unmount() };
}

function setInput(el: HTMLInputElement, v: string) {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
function findBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(b => (b.textContent || '').includes(text));
}

beforeEach(() => {
  document.body.innerHTML = '';
  monacoCaps.length = 0;
  location.hash = '#/';
  sessionStorage.clear();
  localStorage.clear();
  prepareFn.mockClear();
  adhocJobsFn.mockClear();
  dateFormsFn.mockClear();
  ilmExplainFn.mockClear();
  ilmPoliciesFn.mockClear();
});

/* ═══════════ ① AdhocRebuildView ═══════════ */
describe('AdhocRebuildView：索引名草稿与全局选中（528 批）', () => {
  it('空稿进页后顶栏选中真实流转 → 草稿回填 pickedIdx，且不自动探测（prepare 不调）', async () => {
    const View = (await import('../views/AdhocRebuildView.vue')).default;
    const w = await mountView(View); // P1 态：无稿无 picked，空向导
    expect(w.store.pickedIdx).toBe('');
    w.store.pick('alpha_idx'); // 真实流转：'' → 'alpha_idx'（同值赋值 watch 不触发，这里必须真变）
    await settle();
    await wait(20);
    expect(sessionStorage.getItem(draftStorageKey({ route: 'adhoc' }, 'index-name'))).toBe('alpha_idx');
    const inp = w.host.querySelector<HTMLInputElement>('.ixp-inp');
    expect(inp?.value).toBe('alpha_idx');
    expect(prepareFn, '回填只落草稿，不许自动探测').not.toHaveBeenCalled();
    w.unmount();
  });

  it('已有草稿 → pickedIdx 变化不覆写用户稿（只补空）', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'index-name'), 'typed_idx');
    const View = (await import('../views/AdhocRebuildView.vue')).default;
    const w = await mountView(View);
    w.store.pick('other_idx');
    await settle();
    await wait(20);
    expect(sessionStorage.getItem(draftStorageKey({ route: 'adhoc' }, 'index-name'))).toBe('typed_idx');
    w.unmount();
  });

  it('「用当前索引」小钮：有稿时仍在，点击显式覆盖；pickedIdx 为空则不渲染', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'index-name'), 'typed_idx');
    const View = (await import('../views/AdhocRebuildView.vue')).default;
    const w = await mountView(View);
    expect(w.host.querySelector('[data-test="use-current-idx"]'), 'pickedIdx 为空时钮不渲染').toBeNull();
    w.store.pick('gamma_idx');
    await settle();
    const btn = w.host.querySelector<HTMLButtonElement>('[data-test="use-current-idx"]');
    expect(btn, 'pickedIdx 在场钮必须在（有稿也在）').toBeTruthy();
    expect(btn!.getAttribute('aria-label')).toBeTruthy(); // icon-only 可达性
    btn!.click();
    await settle();
    await wait(20);
    expect(sessionStorage.getItem(draftStorageKey({ route: 'adhoc' }, 'index-name'))).toBe('gamma_idx');
    expect(w.host.querySelector<HTMLInputElement>('.ixp-inp')?.value).toBe('gamma_idx');
    w.unmount();
  });
});

describe('AdhocRebuildView：轮询合并 useAutoRefresh + friendlyEsError（528 批，源码锁）', () => {
  const s = read('../views/AdhocRebuildView.vue');
  it('轮询接线 useAutoRefresh（2000ms 沿用），document.hidden 裸守卫与裸 setInterval 清零', () => {
    expect(s).toMatch(/const jobPoller = useAutoRefresh\(/);
    expect(s).toMatch(/ms: \(\) => \(pollJobId\.value \? 2000 : 0\)/);
    expect(s).toMatch(/guard: \(\) => !!pollJobId\.value/);
    /* 五百六十批同步更新：document.hidden 禁令收窄到作业轮询段（useAutoRefresh 全链停续语义不变）——
       blockTimer 补 visibilitychange 守卫（jobTracker onVisChange 范式，hidden 不空转）是合法新用，
       blockTicker 1s 心跳本就与本契约无关（下行同口径） */
    const pollSec = s.slice(s.indexOf('const jobPoller = useAutoRefresh('), s.indexOf('jobPoller.setOn(true);'));
    expect(pollSec, '页面隐藏守卫交由 useAutoRefresh 全链停续（轮询段禁裸 document.hidden）').not.toMatch(/document\.hidden/);
    expect(s, '轮询不再手搓 setInterval（blockTicker 1s 心跳与本契约无关）').not.toMatch(/timer = setInterval/);
    expect(s).toMatch(/import \{ useAutoRefresh \} from '\.\.\/composables\/useAutoRefresh';/);
  });
  it('4 处裸拼 (e?.message || e) 清零（friendlyEsError 统一出口）', () => {
    expect(s, '裸拼错误文案会绕过 friendlyEsError 的 reason 提取/场景翻译').not.toMatch(/\(e\?\.message \|\| e\)/);
  });
});

/* ═══════════ ② IlmView ═══════════ */
describe('IlmView：explain 索引并轨 useIdxState({follow:true})（528 批）', () => {
  it('深链 ?idx= 兼容：挂载即 explain 该索引，且深链值上行 store.pickedIdx（同键语义）', async () => {
    const View = (await import('../views/IlmView.vue')).default;
    const w = await mountView(View, { hash: '#/?idx=deep_idx' });
    await wait(20);
    expect(w.store.pickedIdx, 'useIdxState 同键 ?idx=：深链上行顶栏，旧分享链接原样可用').toBe('deep_idx');
    expect(ilmExplainFn).toHaveBeenCalledWith('deep_idx');
    w.unmount();
  });

  it('顶栏切索引 → explainIndex 跟随并重拉 explain（watch 驱动，非仅 @update:value）', async () => {
    const View = (await import('../views/IlmView.vue')).default;
    const w = await mountView(View);
    ilmExplainFn.mockClear();
    w.store.pick('follow_idx');
    await settle();
    await wait(20);
    expect(ilmExplainFn, 'follow 改值不经过 n-select @update:value，必须由 watch 补拉').toHaveBeenCalledWith('follow_idx');
    w.unmount();
  });
});

/* ═══════════ ③ ConfigValidatorView ═══════════ */
describe('ConfigValidatorView：导入起点回填 pickedIdx（528 批）', () => {
  it('532 改用同步更新：页内选择器退役换 chip+回填统一件；picked 空拉取禁用；picked 就位点钮显式固定→拉取解禁', async () => {
    const View = (await import('../views/ConfigValidatorView.vue')).default;
    // 无 picked：chip/回填钮双不渲染，导入起点空（拉取恒禁用）
    const w0 = await mountView(View);
    findBtn(w0.host, '从现有索引导入')!.click(); // showImport 默认收起，先展开
    await settle();
    expect(w0.host.querySelector('.cv-import .cic'), 'pickedIdx 为空时只读 chip 不渲染').toBeNull();
    expect(w0.host.querySelector('[data-test="use-current-idx"]'), 'pickedIdx 为空时回填钮不渲染').toBeNull();
    const fetch0 = findBtn(w0.host, '拉取 settings + mapping') as HTMLButtonElement | undefined;
    expect(fetch0?.disabled, '无导入起点拉取禁用').toBe(true);
    w0.unmount();

    // picked 就位：起点=顶栏选中（useIdxState defVal 链，defVal 不占 URL）；写类页无 follow
    //（R61 口径）→ 挂载后切顶栏起点不随变；点「用当前索引」显式跟随新顶栏（state 真实流转
    // pre_idx→other_idx 才触发 writeBack，hash 落 idx= 即流转铁证）。深链 ?idx= 会上行顶栏
    // （useIdxState 同键语义），不构成本页偏离场景。
    // 「用户改写」手填链路（.ixp-inp）已随 532 批页内 IndexPicker 退役——选索引入口收敛顶栏，
    // 本页只保留显式回填口（R61 口径）。
    localStorage.setItem('es_picked', 'pre_idx');
    const w = await mountView(View);
    findBtn(w.host, '从现有索引导入')!.click();
    await settle();
    expect(location.hash, 'defVal 起点不占 URL').not.toContain('idx=');
    expect((findBtn(w.host, '拉取 settings + mapping') as HTMLButtonElement).disabled, '起点就绪拉取解禁').toBe(false);
    w.store.pick('other_idx');
    await settle();
    await wait(20);
    expect(w.host.querySelector('.cv-import .cic-nm')?.textContent, 'chip 恒回显顶栏选中（只读件）').toBe('other_idx');
    expect(location.hash, '起点未被静默跟随（无 follow，R61 口径）').not.toContain('idx=other_idx');
    w.host.querySelector<HTMLButtonElement>('[data-test="use-current-idx"]')!.click();
    await settle();
    expect(location.hash, '点钮显式跟随顶栏（state 流转→writeBack 铁证）').toContain('idx=other_idx');
    w.unmount();
  });

  it('3 处裸拼 (e?.message || e) 清零（源码锁）', () => {
    const s = read('../views/ConfigValidatorView.vue');
    expect(s).not.toMatch(/\(e\?\.message \|\| e\)/);
  });
});

/* ═══════════ ④ ReindexPreviewView ═══════════ */
describe('ReindexPreviewView：源索引 useIdxState({follow:true})（528 批；525 批 chip 同步更新）', () => {
  it('顶栏切索引 → 源 chip 跟随（页内 IndexPicker 已退役换只读 CurrentIdxChip）', async () => {
    const View = (await import('../views/ReindexPreviewView.vue')).default;
    const w = await mountView(View);
    w.store.indices.push({ index: 'rp_idx', health: 'green' } as any);
    w.store.pick('rp_idx');
    await settle();
    await wait(20);
    /* 525 同步更新：不再断言 .ixp-inp 输入值——只读 chip 回显 pickedIdx（.cic-nm 文本） */
    expect(w.host.querySelector('.rp-bar .cic-nm')?.textContent).toBe('rp_idx');
    w.unmount();
  });
});

/* ═══════════ ⑤ ReindexAdvancedView ═══════════ */
describe('ReindexAdvancedView：srcIndex 跟随 guard + body dsl-assist（528 批）', () => {
  it('dest 为空 → 顶栏切索引跟随到源；dest 已有手填值 → 跟随冻结（防「为 A 配的 dest 搬 B 的数据」）', async () => {
    const View = (await import('../views/ReindexAdvancedView.vue')).default;
    const w = await mountView(View);
    const pickers = () => w.host.querySelectorAll<HTMLInputElement>('.ixp-inp');
    w.store.pick('ra_src'); // dest 空：跟随
    await settle();
    await wait(20);
    expect(pickers()[0]?.value).toBe('ra_src');
    setInput(pickers()[1]!, 'my_dest'); // 用户手填目标
    await settle();
    w.store.pick('ra_src2'); // dest 已有值：冻结
    await settle();
    await wait(20);
    expect(pickers()[0]?.value, 'dest 手填后源不许被顶栏悄悄换掉').toBe('ra_src');
    w.unmount();
  });

  it('手编 body 编辑器接 dsl-assist（rawBody W4c 起 fill 弹性 → height 100% Monaco cap 带 fields 字段源）', async () => {
    const View = (await import('../views/ReindexAdvancedView.vue')).default;
    const w = await mountView(View);
    findBtn(w.host, '展开原始 body')!.click();
    await settle();
    const bodyCap = monacoCaps.find(c => c.props.height === '100%');
    expect(bodyCap, 'rawBody 编辑器 cap 必须在位').toBeTruthy();
    expect(bodyCap!.props.dslAssist, 'body 编辑器必须挂 dsl-assist').toBeTruthy();
    expect(typeof bodyCap!.props.dslAssist.fields).toBe('function');
    w.unmount();
  });
});

/* ═══════════ ⑥ XmigrateView ═══════════ */
describe('XmigrateView：目标索引回填 + PageHeader 统一（528 批）', () => {
  it('pickedIdx 在场且目标为空 → 第 2 步宿主目标索引初值回填；草稿/已输值优先', async () => {
    const View = (await import('../views/XmigrateView.vue')).default;
    localStorage.setItem('es_picked', 'pre_dest');
    const w2 = await mountView(View);
    expect(w2.host.querySelectorAll<HTMLInputElement>('.xm-idx-inp')[1]?.value, '仅空时回填 pickedIdx').toBe('pre_dest');
    w2.unmount();

    sessionStorage.setItem(draftStorageKey({ route: 'xmigrate' }, 'form'), JSON.stringify({
      sourceIndex: '', destIndex: 'drafted_dest', indexKey: null,
      destCreateMode: 'NONE', tuneMode: 'AGGRESSIVE',
      slices: null, batchSize: null, scrollKeepAliveSec: null, forceMerge: false,
    }));
    localStorage.setItem('es_picked', 'pre_dest');
    const w3 = await mountView(View);
    expect(w3.host.querySelectorAll<HTMLInputElement>('.xm-idx-inp')[1]?.value, '用户草稿/已输值优先，不覆盖').toBe('drafted_dest');
    w3.unmount();
  });

  it('页头统一 PageHeader：展开/收起表单入口上移至页头 actions 且功能不丢', async () => {
    const View = (await import('../views/XmigrateView.vue')).default;
    const w = await mountView(View);
    const ph = w.host.querySelector('.ph');
    expect(ph, '页头必须走 PageHeader 统一件').toBeTruthy();
    expect(ph!.textContent).toContain('跨集群迁移');
    const toggle = ph!.querySelector<HTMLButtonElement>('button[aria-label="收起表单"]');
    expect(toggle, '展开/收起入口必须在页头 actions').toBeTruthy();
    expect(w.host.querySelector('.xm-form'), '默认展开').toBeTruthy();
    toggle!.click();
    await settle();
    await wait(10);
    expect(w.host.querySelector('.xm-form'), '页头收起钮必须仍能收起表单').toBeNull();
    w.unmount();
  });
});
