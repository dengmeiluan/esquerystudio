/**
 * 五百五十八批（工蚁C）：轨2 四页深化——QH 懒载反馈 / AR 四件 / IH 两件 / 回填钮统一件。
 *
 * ① QH：六模式 defineAsyncComponent 统一 { loader, loadingComponent, delay: 200 } 形态——
 *    557 真机探针「懒模式冷转换 8s 全白零反馈」根治；骨架定高、零测量链（不参与 pane
 *    高度链正反馈）；KeepAlive 已解析实例重挂 / stamp 强制重挂走缓存不进 loading，
 *    骨架仅首载冷拉取出现（行为网：慢 chunk 拉取期间骨架在场，到位后换真身）。
 * ② AR 四件：探测失败条私造壳合并全局 .err-bar（role=alert + errPreHtml/errMeta 双参 +
 *    prepErrRaw 原始对象旁路，XmigrateView :63 同款）；粘贴导入弹窗 pi-ja-wrap 定高
 *    min(60vh,600px) 升 useTierCycle 四档（adhoc.piH，adhoc.pasteH 同范式同族，默认档=原值
 *    零漂移）；收尾报告 .dsl 补 max(240px, 42vh) 滚动钳（站内口径）；内联「用当前索引」钮
 *    退役换 PickCurrentIdxBtn 统一件（557 备案兑现，原函数退役）。
 * ③ IH 两件：query tab 未执行就绪空态（DslQueryView :470 同件同文案风格，err→空态互斥
 *    不双显）；ih.drawerW 档循环合并 useTierCycle（k 数组驱动、t/css 查表函数保留按选中
 *    k 取值、pref 键 ih.drawerW 不变用户档位零迁移）。
 * ④ PickCurrentIdxBtn 契约：自读 store.pickedIdx、空索引不渲染、data-test/title/aria-label
 *    与内联钮逐字、点击 emit('pick')（回填语义归消费方）。
 *
 * 设施：源码锁（track2Wave557 范式）+ 行为网（QH 冷拉取骨架 / AR 探测失败条+piH 档 /
 * IH ready 空态 / 统一件挂载；mock 面 = pickedIdxSync528 + queryHubTplReplay529 +
 * ihUnify554 三家并集）。MonacoEditor 组件整体 stub（斩断 monaco 导入链，IH/AR/QH 共用）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick, defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const qh = read('../views/QueryHubView.vue');
const ar = read('../views/AdhocRebuildView.vue');
const ih = read('../views/IndexHubView.vue');

/* ── mock 面（三家并集）：api 出口全挡 + MonacoEditor 组件整体 stub ──
   rest 参数签名：api 包装层 (...a: any[]) => fn(...a) 展开进定参会 TS2556（pickedIdxSync528 同注） */
const prepareFn = vi.fn(async (..._a: any[]) => ({
  index: 'stub', isAlias: true, physicals: ['stub_v1'],
  sourcePhysical: 'stub_v1', docCount: 3,
  settingsJson: '{"index":{"number_of_replicas":1}}',
  mappingJson: JSON.stringify({ properties: { f: { type: 'keyword' } } }),
  suggestedDest: 'stub_v2', timeFieldCandidates: [],
}));
const adhocJobsFn = vi.fn(async (..._a: any[]) => []);
const dateFormsFn = vi.fn(async (..._a: any[]) => ({ sampled: 50, sampling: 'random_score', forms: {} }));
const clusterQueryFn = vi.fn(async (..._a: any[]) => ({ took: 1, total: 0, hits: [] }));

vi.mock('../components/MonacoEditor.vue', () => ({
  default: defineComponent({
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fill'],
    emits: ['update:modelValue', 'execute'],
    setup: (props: any) => () => h('div', { class: 'monaco-stub', 'data-height': props.height }, String(props.modelValue ?? '')),
  }),
}));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      adhoc: { ...orig.api.adhoc, prepare: (...a: any[]) => prepareFn(...a), jobs: (...a: any[]) => adhocJobsFn(...a) },
      dateForms: (...a: any[]) => dateFormsFn(...a),
      clusterQuery: (...a: any[]) => clusterQueryFn(...a),
      /* 防御性 stub 挡真实 fetch 噪音（三视图挂载会触到的初始化出口） */
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      indexSettings: () => Promise.resolve({}),
      shards: () => Promise.resolve([]),
      aliases: () => Promise.resolve([]),
      keys: () => Promise.resolve([]),
      clustersList: () => Promise.resolve([]),
      clusterIndices: () => Promise.resolve([]),
      ilmPolicies: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({ body: { version: { number: '8.11.0' } } }),
      setup: { ...orig.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

/* QH dsl 模式 chunk 慢拉取模拟：400ms 后到位（> delay:200，骨架必经在场窗口） */
vi.mock('../views/DslQueryView.vue', async () => {
  await new Promise(r => setTimeout(r, 400));
  return { __esModule: true, default: defineComponent({ name: 'DslStub', template: '<div class="dsl-stub-ok"></div>' }) };
});

async function settle(n = 10) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

const apps: ReturnType<typeof createApp>[] = [];

interface Mounted { host: HTMLDivElement; store: any; unmount: () => void }
async function mountView(comp: any, path = '/'): Promise<Mounted> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const { useAppStore } = await import('../stores/app');
  const store = useAppStore(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }] });
  await router.push(path);
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(comp) });
  apps.push(app);
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
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  prepareFn.mockClear();
  adhocJobsFn.mockClear();
  dateFormsFn.mockClear();
  clusterQueryFn.mockReset();
  clusterQueryFn.mockImplementation(async () => ({ took: 1, total: 0, hits: [] }));
});
afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
});

/* ═══════════ 一、QH：六模式 loadingComponent（源码锁 + 冷拉取行为网） ═══════════ */
describe('558 一：QH 六模式 defineAsyncComponent 统一 loadingComponent', () => {
  it('统一 { loader, loadingComponent, delay: 200 } 形态；六入口全走 lazyPane；裸 defineAsyncComponent 退役', () => {
    expect(qh).toContain('defineAsyncComponent({ loader, loadingComponent: QhPaneLoading, delay: 200 })');
    for (const v of ['DslQueryView', 'SqlConsoleView', 'LuceneQueryView', 'SearchSandboxView', 'PitScrollView', 'SqlBridgeView']) {
      expect(qh, `${v} 入口走 lazyPane`).toContain(`lazyPane(() => import('./${v}.vue'))`);
    }
    expect(qh, '无 loading 的裸形态退役').not.toMatch(/defineAsyncComponent\(\(\) => import/);
  });

  it('骨架件：站内 SkeletonBox 承担 + 弱文提示 + 定高（零测量链注释备案）', () => {
    expect(qh).toMatch(/import SkeletonBox from '\.\.\/components\/SkeletonBox\.vue';/);
    expect(qh).toContain("name: 'QhPaneLoading'");
    expect(qh).toContain("h(SkeletonBox");
    expect(qh).toContain('通道加载中');
    expect(qh).toMatch(/\/\/[^\n]*定高|\/\*[\s\S]*?定高[\s\S]*?\*\//);
  });

  it('行为网：chunk 冷拉取期间骨架在场（delay 后），到位后换真身骨架移除', async () => {
    const { mountView: mv } = { mountView: mountView };
    const { host } = await mv((await import('../views/QueryHubView.vue')).default, '/search');
    /* dsl chunk mock 延迟 400ms、delay 200ms——此刻拉取仍在途，骨架必须已顶上 */
    await wait(320);
    const sk = host.querySelector('.qh-pane-loading');
    expect(sk, '拉取期间骨架在场（不再全白）').toBeTruthy();
    expect(sk!.querySelector('.qh-pane-loading-tx')?.textContent).toContain('通道加载中');
    expect(sk!.querySelector('.sk'), '骨架块（SkeletonBox）在场').toBeTruthy();
    /* 400ms 到位 + 稳定：真身渲染、骨架移除 */
    await wait(280);
    await settle();
    expect(host.querySelector('.qh-pane-loading'), '到位后骨架移除').toBeNull();
    expect(host.querySelector('.dsl-stub-ok'), '真身渲染').toBeTruthy();
  }, 15000);
});

/* ═══════════ 二、AR：err-bar 合并 / piH 档 / DSL pre 钳 / 回填钮统一件（源码锁） ═══════════ */
describe('558 二：AR 四件（源码锁）', () => {
  it('①探测失败条合并全局 .err-bar：role=alert + errPreHtml/errMeta 双参 + prepErrRaw 旁路', () => {
    expect(ar).toContain('<div v-if="prepErr" role="alert" class="err-bar rise-in ar-probe-err">');
    expect(ar).toContain(`v-html="errPreHtml('探测失败：' + prepErr, errMeta(prepErrRaw))"`);
    expect(ar).toMatch(/const prepErrRaw = ref<unknown>\(null\);/);
    expect(ar).toContain('prepErrRaw.value = e;');
    expect(ar).toContain('prepErrRaw.value = null;');
    expect(ar).toMatch(/import \{ errPreHtml, errMeta \} from '\.\.\/utils\/errPre';/);
  });

  it('①私造红壳样式退役：border/err-soft/radius 不回流（语义壳归 theme.css .err-bar 单源），只留落位', () => {
    expect(ar, 'border 不回流').not.toMatch(/\.ar-probe-err \{[^}]*border[^-]/);
    expect(ar, 'err-soft 底不回流').not.toMatch(/\.ar-probe-err \{[^}]*err-soft/);
    expect(ar, 'radius 不回流').not.toMatch(/\.ar-probe-err \{[^}]*border-radius/);
    expect(ar, '落位 margin 保留').toMatch(/\.ar-probe-err \{ margin-top: var\(--sp-2h\); \}/);
  });

  it('②粘贴导入弹窗高度档：pi-ja-wrap 定高退役 → :style 绑 adhoc.piH 四档（pasteH 同族，默认档=原值）', () => {
    expect(ar).toContain("const PI_H_TIERS: string[] = ['min(60vh, 600px)', 'min(70vh, 720px)', 'min(80vh, 840px)', 'min(92vh, 960px)'];");
    expect(ar).toContain("const { v: piH, cycle: cyclePiH } = useTierCycle('adhoc.piH', PI_H_TIERS);");
    expect(ar).toContain('<div class="pi-ja-wrap" :style="{ height: piH }">');
    expect(ar, 'CSS 定高字面退役（高度归档值绑定）').not.toMatch(/\.pi-ja-wrap \{[^}]*height:/);
    expect(ar, '档循环钮在场（pasteH data-ar-paste-h 同范式）').toContain('data-ar-pi-h');
    expect(ar).toContain(`:title="'粘贴区高度档：' + piH + '（点击循环）'"`);
  });

  it('③收尾报告 .dsl 补滚动钳：max(240px, 42vh) 站内口径，超长不再撑页', () => {
    expect(ar).toMatch(/\.dsl \{[^}]*max-height: max\(240px, 42vh\); overflow: auto;/);
  });

  it('④内联「用当前索引」钮退役换统一件：消费标签在场、就地函数退役、Crosshair 同步更新', () => {
    expect(ar).toContain('<PickCurrentIdxBtn @pick="indexName = store.pickedIdx" />');
    expect(ar).toMatch(/import PickCurrentIdxBtn from '\.\.\/components\/PickCurrentIdxBtn\.vue';/);
    expect(ar, '就地覆盖函数退役').not.toMatch(/function useCurrentIdx\(\)/);
    expect(ar, 'data-test 锚随钮迁入组件').not.toContain('data-test="use-current-idx"');
    expect(ar, 'Crosshair 图标随钮迁入组件（本视图零残留）').not.toContain('Crosshair');
  });
});

/* ═══════════ 三、IH：ready 空态 / drawerW 合并 useTierCycle（源码锁） ═══════════ */
describe('558 三：IH 两件（源码锁）', () => {
  it('①query tab 未执行就绪空态：DQ :470 同件同文案风格，err 互斥（!qryErr）不双显', () => {
    const seg = ih.slice(ih.indexOf(`<template v-else-if="tab === 'query'">`), ih.indexOf('<!-- Settings -->'));
    expect(seg).toMatch(/<EmptyState v-else-if="!qryErr" :icon="FileSearch"\s*\n\s*text="编写 DSL 后点击「执行查询」或按 Ctrl\+Enter，命中结果、聚合与直方图将显示在这里" \/>/);
    expect(ih).toMatch(/\bFileSearch\b/);
  });

  it('②ih.drawerW 合并 useTierCycle：k 数组驱动 + 默认档 regular；t/css 查表函数保留按选中 k 取值', () => {
    expect(ih).toContain("const { v: drawerW, cycle: cycleDrawerW } = useTierCycle<DrawerWKey>('ih.drawerW', DRAWER_W_TIERS.map(w => w.k), 'regular');");
    expect(ih).toContain("const drawerWTier = computed(() => DRAWER_W_TIERS.find(w => w.k === drawerW.value) || DRAWER_W_TIERS[0]);");
    expect(ih).toContain('const drawerWCss = computed(() => drawerWTier.value.css);');
    expect(ih).toContain('const drawerWLabel = computed(() => drawerWTier.value.t);');
    expect(ih, '手写 findIndex 循环退役').not.toContain('DRAWER_W_TIERS.findIndex');
    expect(ih, '三档 {k,t,css} 表零触（responsiveGuard239 锁面）').toMatch(/\{ k: 'regular', t: '常规', css: 'clamp\(400px, 32vw, 560px\)' \}/);
    expect(ih, '抽屉宽度内联绑定零触').toContain(':style="{ width: drawerWCss }"');
    expect(ih).toMatch(/import \{ useTierCycle \} from '\.\.\/composables\/useTierCycle';/);
  });
});

/* ═══════════ 四、PickCurrentIdxBtn 统一件契约（行为网） ═══════════ */
describe('558 四：PickCurrentIdxBtn 契约（自读 pickedIdx / 逐字锚 / 点击 emit）', () => {
  it('空索引不渲染；pickedIdx 在场渲染逐字锚（data-test/title/aria-label/btn ghost sm/Crosshair）；点击 emit pick', async () => {
    const Btn = (await import('../components/PickCurrentIdxBtn.vue')).default;
    const pinia = createPinia();
    setActivePinia(pinia);
    const { useAppStore } = await import('../stores/app');
    const store = useAppStore(pinia);
    let picks = 0;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(Btn, { onPick: () => { picks++; } }) });
    app.use(pinia);
    app.mount(host);
    await settle();
    expect(host.querySelector('[data-test="use-current-idx"]'), 'pickedIdx 为空时钮不渲染').toBeNull();
    store.pick('gamma_idx');
    await settle();
    const btn = host.querySelector<HTMLButtonElement>('[data-test="use-current-idx"]');
    expect(btn, 'pickedIdx 在场钮必须渲染').toBeTruthy();
    expect(btn!.getAttribute('title'), 'title 与内联钮逐字一致').toBe('用当前索引：gamma_idx（覆盖当前输入）');
    expect(btn!.getAttribute('aria-label'), 'icon-only 可达性（pickedIdxSync528 同锚）').toBe('用当前索引：填入顶栏选中的索引');
    expect(btn!.className).toContain('btn ghost sm');
    expect(btn!.querySelector('svg'), 'Crosshair 图标在场').toBeTruthy();
    btn!.click();
    await settle();
    expect(picks, '点击 emit pick（回填语义归消费方）').toBe(1);
    app.unmount();
  });
});

/* ═══════════ 五、AR 行为网：探测失败条 / piH 档循环 ═══════════ */
describe('558 五：AR 行为网（err-bar 现场回看 + piH 档循环落盘）', () => {
  it('探测失败 → 全局 err-bar 在场（role=alert + 探测失败文案 + 重试钮）；重试成功 → 条移除', async () => {
    const { host } = await mountView((await import('../views/AdhocRebuildView.vue')).default);
    setInput(host.querySelector<HTMLInputElement>('.ixp-inp')!, 'stub_idx');
    await settle();
    prepareFn.mockRejectedValueOnce(new Error('index_not_found_exception: no such index [stub_idx]'));
    findBtn(host, '探测')!.click();
    await settle();
    const bar = host.querySelector<HTMLElement>('.err-bar.ar-probe-err');
    expect(bar, '失败条在场（全局 err-bar 形态）').toBeTruthy();
    expect(bar!.getAttribute('role')).toBe('alert');
    expect(bar!.textContent).toContain('探测失败');
    expect(bar!.textContent).toContain('index_not_found'); /* friendlyEsError 人话化后的错误码 */
    expect(findBtn(bar as unknown as ParentNode, '重试'), '重试钮在场').toBeTruthy();
    prepareFn.mockResolvedValueOnce({
      index: 'stub_idx', isAlias: true, physicals: ['stub_v1'], sourcePhysical: 'stub_v1', docCount: 0,
      settingsJson: '{}', mappingJson: '{}', suggestedDest: '', timeFieldCandidates: [],
    });
    findBtn(host, '重试')!.click();
    await settle();
    expect(host.querySelector('.err-bar.ar-probe-err'), '重试成功失败条移除').toBeNull();
  });

  it('粘贴导入弹窗：wrapper 高度=默认档（原值零漂移）；点档位钮进下一档并落盘 adhoc.piH', async () => {
    const { host } = await mountView((await import('../views/AdhocRebuildView.vue')).default);
    /* 入口在审编步（step1）：先探测成功（默认 resolve）再「下一步」进审编卡 */
    setInput(host.querySelector<HTMLInputElement>('.ixp-inp')!, 'stub_idx');
    await settle();
    findBtn(host, '探测')!.click();
    await settle();
    findBtn(host, '下一步')!.click();
    await settle();
    const openBtn = findBtn(host, '粘贴导入');
    expect(openBtn, '粘贴导入入口在场（防空跑）').toBeTruthy();
    openBtn!.click();
    await settle();
    /* n-modal Teleport 到 body——断言走 document（ihUnify554 同法）。
       jsdom cssstyle 会把 min() 值整个静默丢弃（style 属性串读不回），wrapper 高度绑定
       的在场由源码锁（二② :style="{ height: piH }"）承担，这里用档位钮 title 实时回显
       验证档状态机与落盘 */
    const wrap = document.querySelector<HTMLElement>('.pi-ja-wrap');
    expect(wrap, '弹窗 JsonArea wrapper 在场').toBeTruthy();
    const cyc = document.querySelector<HTMLButtonElement>('[data-ar-pi-h]');
    expect(cyc, '档循环钮在场').toBeTruthy();
    expect(cyc!.getAttribute('title'), '默认档=原定高字面（零漂移）').toBe('粘贴区高度档：min(60vh, 600px)（点击循环）');
    cyc!.click();
    await settle();
    expect(cyc!.getAttribute('title'), '进第二档（title 实时回显当前档）').toBe('粘贴区高度档：min(70vh, 720px)（点击循环）');
    expect(localStorage.getItem('esquerystudio.pref.adhoc.piH'), 'usePref 落盘').toBe('"min(70vh, 720px)"');
  });
});

/* ═══════════ 六、IH 行为网：query tab ready 空态与失败态互斥 ═══════════ */
describe('558 六：IH 行为网（query tab 就绪空态）', () => {
  it('未执行 → EmptyState 引导在场；执行失败 → err-bar 在场且空态不双显', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    const { host } = await mountView((await import('../views/IndexHubView.vue')).default);
    await settle(12);
    const qtab = Array.from(host.querySelectorAll<HTMLButtonElement>('.ih-tabs button')).find(b => (b.textContent || '').includes('查询'))!;
    expect(qtab, '查询页签在场（防空跑）').toBeTruthy();
    qtab.click();
    await settle();
    const guide = Array.from(host.querySelectorAll('.empty-state')).find(e => (e.textContent || '').includes('编写 DSL 后点击「执行查询」'));
    expect(guide, '未执行就绪空态在场（不再漏空白）').toBeTruthy();
    clusterQueryFn.mockRejectedValueOnce(new Error('boom'));
    findBtn(host, '执行查询')!.click();
    await settle(12);
    expect(host.querySelector('.ih-qerr'), '失败态 err-bar 在场').toBeTruthy();
    expect(Array.from(host.querySelectorAll('.empty-state')).find(e => (e.textContent || '').includes('编写 DSL 后点击「执行查询」')),
      '失败态空态不双显（v-else-if 互斥）').toBeUndefined();
  });
});
