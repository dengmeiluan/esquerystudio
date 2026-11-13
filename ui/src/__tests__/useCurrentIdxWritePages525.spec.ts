/**
 * 五百二十五批：C 类写类页目标索引「用当前索引」回填钮统一 + 全站小卫生。
 *
 * ① 回填钮四视图统一（照 AdhocRebuildView 528 批范式）：IndexSettingsView / IndexOptimizerView /
 *    UpdateByQueryView / ConfigValidatorView 各自 IndexPicker 旁加 data-test="use-current-idx"
 *    小钮——pickedIdx 为空不渲染；点击把顶栏全局选中写入该页目标 ref（写类页不开 useIdxState
 *    follow，R61 白名单口径；目标态独立是防「A 的表单写到 B」的正确设计，钮只补显式覆盖口）。
 *    IndexSettings 特例：该页既有语义是「选中即拉取」（@picked/watch 均带 loadSettings，只写值
 *    会落「拉取失败」坏分支），故钮随 loadSettings——与其页内两个既有回填出口行为一致。
 * ② 42vh 弹性档收尾：ConfigDriftView .cd-diff 420px / ClusterSettingsView .cs-preview 240px /
 *    LifecycleView .lc-result 200px → max(240px, 42vh)（ProfileFlame 524 批同口径）。
 * ③ severity 三处 token 语义错位纠正：.cv-iss-sev.error/.warn/.info 与 .cd-verdict.drift/.missing
 *    的 --danger/--warning（--err/--warn 别名）与 --brand（≠--info）→ --err/--warn/--info
 *    （W9 的 .pill.err/.warn/.info theme.css 别名档未就绪，先就地统一 token，类链形态待其落地）。
 * ④ 卫生：BrowserView 1280 独档并入 1100；router.ts WIDE_ROUTES 注释补三页页头豁免备案；
 *    ReindexAdvancedView .ra-card-tt 退役换全局 .card-t。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* ── 共享 mock 面（pickedIdxSync528.spec 同款骨架 + indexSettings 读档）── */
const indexSettingsFn = vi.fn(async (..._a: any[]) => ({}));
const clusterInspectFn = vi.fn(async (..._a: any[]) => ({ settings: {}, mappings: {} }));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      indexSettings: (...a: any[]) => indexSettingsFn(...a),
      clusterInspect: (...a: any[]) => clusterInspectFn(...a),
      /* useIndexFields（dsl-assist/字段表）与 store.loadIndices 链路挡真实 fetch（不断言） */
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      keys: () => Promise.resolve([]),
      clustersList: () => Promise.resolve([]),
      clusterIndices: () => Promise.resolve([]),
      aliases: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({ body: { version: { number: '8.11.0' } } }),
      setup: { ...orig.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute'],
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

function findBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(b => (b.textContent || '').includes(text));
}
const useCurBtn = (root: ParentNode) => root.querySelector<HTMLButtonElement>('[data-test="use-current-idx"]');

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  sessionStorage.clear();
  localStorage.clear();
  indexSettingsFn.mockClear();
  clusterInspectFn.mockClear();
});

/* ═══════════ ① 回填钮四视图（挂载型） ═══════════ */
describe('IndexSettingsView：回填钮显式覆盖（525 批）', () => {
  /* 五百七十三批退役改写（572-C2）：532 批页内 IndexPicker/手填框全站退役换 CurrentIdxChip
     只读件，「选中即拉取」改 watch(index) 承接（.is-bar .ixp-inp 手填框与回填钮物理退役）——
     替代判别链=退役形态锁（手填框/回填钮恒不在场）+ 顶栏选中触发拉取（watch 承接铁证） */
  it('532 退役改写：手填框/回填钮退役，「选中即拉取」由 watch(index) 承接（顶栏选中即拉 settings）', async () => {
    const View = (await import('../views/IndexSettingsView.vue')).default;
    const w = await mountView(View);
    expect(useCurBtn(w.host), '回填钮随 532 批退役（跟随语义归顶栏统一入口）').toBeNull();
    expect(w.host.querySelector('.is-bar .ixp-inp'), '手填输入框随 532 批退役').toBeNull();
    w.store.pick('global_idx'); // 真实流转触发 watch(index)
    await settle();
    await wait(20);
    await settle();
    expect(indexSettingsFn, '「选中即拉取」改 watch(index) 承接：顶栏选中即拉 settings').toHaveBeenCalled();
    w.unmount();
  });
});

describe('IndexOptimizerView：回填钮显式覆盖（525 批）', () => {
  /* 五百七十三批退役改写：手填框退役换「CurrentIdxChip + PickCurrentIdxBtn 显式桥」，
     target 流转可观察面=扫描钮 disabled（:disabled="!target || loading"）翻转 */
  it('532 退役改写：点「用当前索引」显式桥写入目标（扫描钮由禁用转可用），回填不自动扫描', async () => {
    const View = (await import('../views/IndexOptimizerView.vue')).default;
    const w = await mountView(View);
    expect(useCurBtn(w.host), 'pickedIdx 为空时钮不渲染（统一件根 v-if）').toBeNull();
    w.store.pick('opt_idx');
    await settle();
    const btn = useCurBtn(w.host);
    expect(btn, 'pickedIdx 在场钮必须在').toBeTruthy();
    const scanBtn = () => findBtn(w.host, '扫描')!;
    expect(scanBtn().disabled, 'target 空时扫描钮禁用').toBe(true);
    btn!.click();
    await settle();
    await wait(20);
    expect(scanBtn().disabled, '点钮显式覆盖后 target 就位=扫描钮转可用').toBe(false);
    expect(indexSettingsFn, '回填只写值，扫描由用户显式触发').not.toHaveBeenCalled();
    w.unmount();
  });
});

describe('UpdateByQueryView：回填钮显式覆盖（525 批）', () => {
  /* 五百七十三批退役改写：target 流转可观察面=校验提示文案翻转（index 空时「先选目标索引」
     → index 就位后「query 不能为空」；canOps 在挂载环境 me=null 恒放行走主分支） */
  it('532 退役改写：点钮显式覆盖目标索引（提示文案「先选目标索引」翻转），不自动执行', async () => {
    const View = (await import('../views/UpdateByQueryView.vue')).default;
    const w = await mountView(View);
    expect(useCurBtn(w.host)).toBeNull();
    const hint = () => w.host.textContent || '';
    expect(hint(), 'index 空时提示先选目标索引').toContain('先选目标索引');
    w.store.pick('uq_idx');
    await settle();
    const btn = useCurBtn(w.host);
    expect(btn).toBeTruthy();
    btn!.click();
    await settle();
    await wait(20);
    expect(hint(), 'index 就位后提示翻转为 query 校验（target 流转铁证）').toContain('query 不能为空');
    expect(hint()).not.toContain('先选目标索引');
    w.unmount();
  });
});

describe('ConfigValidatorView：回填钮显式覆盖（525 批）', () => {
  /* 五百七十三批退役改写：importIndex 流转可观察面=拉取钮 disabled（:disabled=
     "!importIndex.trim() || importing"）翻转；拉取仍由显式点击触发（回填不自动拉取） */
  it('532 退役改写：展开导入面板→点钮显式覆盖导入起点（拉取钮由禁用转可用），拉取仍显式触发', async () => {
    const View = (await import('../views/ConfigValidatorView.vue')).default;
    const w = await mountView(View);
    findBtn(w.host, '从现有索引导入')!.click(); // showImport 默认收起，先展开
    await settle();
    expect(useCurBtn(w.host), 'pickedIdx 为空时钮不渲染').toBeNull();
    const fetchBtn = () => findBtn(w.host, '拉取 settings + mapping')!;
    expect(fetchBtn().disabled, '导入起点空时拉取钮禁用').toBe(true);
    w.store.pick('cv_idx');
    await settle();
    const btn = useCurBtn(w.host);
    expect(btn).toBeTruthy();
    btn!.click();
    await settle();
    await wait(20);
    expect(fetchBtn().disabled, '点钮后导入起点就位=拉取钮转可用').toBe(false);
    expect(clusterInspectFn, '拉取仍由「拉取 settings + mapping」显式触发').not.toHaveBeenCalled();
    w.unmount();
  });
});

/* ═══════════ ② 卫生四件（源码锁） ═══════════ */
describe('525 批卫生：42vh 弹性档 / sev token / 断点并档 / ra-card-tt 退役', () => {
  it('只读结果区三处 42vh 弹性档（max(240px,42vh) 保底），旧定高不残留', () => {
    const cd = read('../views/ConfigDriftView.vue');
    const cs = read('../views/ClusterSettingsView.vue');
    const lc = read('../views/LifecycleView.vue');
    expect(cd).toMatch(/\.cd-diff \{[^}]*max-height: max\(240px, 42vh\)/);
    expect(cd, '420px 定高退役').not.toMatch(/\.cd-diff \{[^}]*max-height: 420px/);
    expect(cs).toMatch(/\.cs-preview \{[^}]*max-height: max\(240px, 42vh\)/);
    expect(cs, '240px 定高退役').not.toMatch(/\.cs-preview \{[^}]*max-height: 240px/);
    expect(lc).toMatch(/\.lc-result \{[^}]*max-height: max\(240px, 42vh\)/);
    expect(lc, '200px 定高退役').not.toMatch(/\.lc-result \{[^}]*max-height: 200px/);
  });

  it('sev 三处改用（525 批升 .pill 语义档；531 批 ConfigValidator 侧再收 StatusPill+sevZh）：本地配色档清零', () => {
    const cv = read('../views/ConfigValidatorView.vue');
    const cd = read('../views/ConfigDriftView.vue');
    /* 531 批锚同步更新：severity 裸英文枚举换 StatusPill（tone 仍走 cvSevPill=esEnumZh.sevPill 同源，
       label 收 cvSevZh 中文），本地 pill 字面拼接退役 */
    expect(cv, 'sev 徽标改用 StatusPill（tone 走同源 cvSevPill 五主档）').toMatch(/<StatusPill class="cv-iss-sev" :tone="cvSevPill\(/);
    expect(cv).toMatch(/\.cv-iss-sev \{ flex-shrink: 0; margin-top: 1px; \}/);
    expect(cv, 'cv sev 本地三档配色退役').not.toMatch(/\.cv-iss-sev\.[a-z]+ \{/);
    /* 五百六十批锚同步更新：清单角标改用 StatusPill 统一件（558b 回滚件解禁重做）——tone 走
       cdVerdictPill 映射消费，手写 .pill 裸挂退役；定位壳 .cd-verdict absolute right/top 保留 */
    expect(cd, 'verdict 徽标改用 StatusPill（tone=cdVerdictPill 映射消费，clean→g 正面绿，drift/missing→r/y）').toMatch(/<StatusPill v-if="verdicts\[k\.indexKey\]" class="cd-verdict" :tone="cdVerdictPill\(verdicts\[k\.indexKey\]\)"/);
    expect(cd, '手写 pill 裸挂退役').not.toContain('class="cd-verdict pill"');
    expect(cd).toMatch(/\.cd-verdict \{ position: absolute; right: 10px; top: 10px; \}/);
    expect(cd, 'cd verdict 本地三档配色退役').not.toMatch(/\.cd-verdict\.[a-z]+ \{/);
  });

  it('BrowserView 1280 独档并入 1100 档（col-created 藏列同步更新；529 批列头进内核改 :deep data-col）', () => {
    const bw = read('../views/BrowserView.vue');
    expect(bw).toMatch(/@media \(max-width: 1100px\) \{\s*\.bw :deep\(\[data-col="创建时间"\]\) \{ display: none; \}\s*\}/);
    expect(bw, '1280 独档退役').not.toMatch(/max-width: 1280px/);
  });

  it('router.ts WIDE_ROUTES 注释补三页页头豁免备案（525 批裁决）', () => {
    const rt = read('../router.ts');
    expect(rt).toMatch(/\/browser、\/diag、\/search 三页页头由工具条\/模式切换器承担，\s*不补 PageHeader/);
  });

  it('ReindexAdvancedView .ra-card-tt 退役换全局 .card-t（4 处模板 + 样式定义清零）', () => {
    const ra = read('../views/ReindexAdvancedView.vue');
    expect(ra, 'ra-card-tt 样式定义退役（备案注释允许保留字样）').not.toMatch(/\.ra-card-tt \{/);
    expect(ra, 'ra-card-tt 模板类名退役').not.toMatch(/class="ra-card-tt"/);
    expect(ra.match(/class="card-t"/g)?.length, '4 处卡头改用全局档').toBeGreaterThanOrEqual(4);
  });

  it('四视图回填钮源码锚随 558 批合并改锚：写类三视图消费 PickCurrentIdxBtn 统一件，IndexSettings 回填钮退役（532 批 selectorUnify532 看守）', () => {
    for (const f of ['IndexOptimizerView', 'UpdateByQueryView', 'ConfigValidatorView']) {
      const s = read(`../views/${f}.vue`);
      expect(s, `${f} 缺统一件消费`).toMatch(/<PickCurrentIdxBtn @pick=/);
    }
    const isv = read('../views/IndexSettingsView.vue');
    expect(isv, 'chip 即当前索引：IndexSettings 回填钮退役（532 批起）').not.toMatch(/use-current-idx/);
  });
});
