/**
 *  轨4（工蚁 F）：「用当前索引」内联回填钮合并 PickCurrentIdxBtn 统一件 +
 * UpdateByQueryView ubq.scriptH 私造高度档合并 useTierCycle。
 *
 * ① 四视图（BulkEditorView / ConfigValidatorView / IndexOptimizerView / UpdateByQueryView）
 *    逐字重复的内联回填钮（525/范式）退役，换消费统一件 PickCurrentIdxBtn（工蚁 C
 *    并行落件；AdhocRebuildView 同批归 C）：组件内聚 Crosshair 图标 / btn ghost sm 样式 /
 *    data-test="use-current-idx" / title 文案，props 无、emit 'pick'——落点回填仍由各页
 *    @pick 显式写自身 useIdxState（ 写类页不开 follow 口径不变，行为等值迁移）。
 *    ⚠ 备案（558 实证）：组件文件落盘前 vite:import-analysis 在解析层硬失败（Failed to
 *    resolve import），vi.mock 打桩无法越过解析层——挂载/行为用例直接加载真实组件（不打桩，收口保真）；组件缺失时由在场断言直接失败，不再跳过；
 *    落盘前的红绿由源码锁 + useTierCycle 直连行为用例承载。
 * ② ubq.scriptH：私造「TIERS + usePref + cycle」三件套机械平移 useTierCycle
 *    统一件（ W9 口径）——键名 ubq.scriptH / 档值序 / 默认档（tiers[0]）不变，零迁移。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* 工蚁 C 组件在场判定：在场才跑挂载/行为用例（解析层硬失败，缺席时无法绕过） */
const compReady = existsSync(join(__dirname, '../components/PickCurrentIdxBtn.vue'));

/* ── api mock 面（useCurrentIdxWritePages525 同款骨架：挡挂载触到的全部网络出口）── */
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
    template: '<div class="monaco-stub" :data-height="height"></div>',
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

/* ═══════════ ① 四视图合并（源码锁，不依赖组件落盘） ═══════════ */
describe('四视图回填钮合并 PickCurrentIdxBtn 统一件（，源码锁）', () => {
  const PICK_VIEWS = [
    { f: 'BulkEditorView', bind: 'index' },
    { f: 'ConfigValidatorView', bind: 'importIndex' },
    { f: 'IndexOptimizerView', bind: 'target' },
    { f: 'UpdateByQueryView', bind: 'index' },
  ] as const;

  it('内联钮退役；消费四件套：import + <PickCurrentIdxBtn @pick="落点 = store.pickedIdx"', () => {
    for (const { f, bind } of PICK_VIEWS) {
      const s = read(`../views/${f}.vue`);
      expect(s, `${f} 必须 import 统一件`).toMatch(/import PickCurrentIdxBtn from '\.\.\/components\/PickCurrentIdxBtn\.vue'/);
      expect(s, `${f} 必须消费 <PickCurrentIdxBtn 且 @pick 落点=自身 useIdxState`).toMatch(new RegExp(`<PickCurrentIdxBtn @pick="${bind} = store\\.pickedIdx"`));
      expect(s, `${f} 内联钮退役（data-test/title/图标归组件内聚）`).not.toMatch(/data-test="use-current-idx"/);
      expect(s, `${f} 就地 useCurrentIdx 函数退役`).not.toMatch(/function useCurrentIdx\(\)/);
      expect(s, `${f} Crosshair 随钮退役（图标归组件）`).not.toMatch(/Crosshair/);
      expect(s, `${f} 口径注释保留（写类页不开 follow 的理由）`).toMatch(/写类页不开|写类向导不开/);
    }
  });
});

/* ═══════════ ② 四视图 @pick 点击回填落点（挂载；组件在场才跑，直吃真实组件） ═══════════ */
describe('四视图 @pick 点击回填落点（挂载；558 统一件必须在场）', () => {
  it('PickCurrentIdxBtn 统一件必须在场', () => { expect(compReady, 'PickCurrentIdxBtn.vue 缺失时不再跳过，直接失败').toBe(true); });
  it('BulkEditorView：pickedIdx 空不渲染；点统一件 → 落点 index 回填（URL ?idx=）', async () => {
    const View = (await import('../views/BulkEditorView.vue')).default;
    const w = await mountView(View);
    expect(useCurBtn(w.host), 'pickedIdx 为空时钮不渲染').toBeNull();
    w.store.pick('bulk_idx');
    await settle();
    const btn = useCurBtn(w.host);
    expect(btn, 'pickedIdx 在场统一件必须在').toBeTruthy();
    expect(btn!.getAttribute('aria-label'), 'icon-only 可达性与旧内联钮等值').toBeTruthy();
    btn!.click();
    await settle();
    await wait(20);
    expect(location.hash, '@pick 落点回填 useIdxState（URL 单一真相）').toContain('idx=bulk_idx');
    w.unmount();
  });

  it('ConfigValidatorView：导入面板展开后点统一件 → 落点 importIndex 回填', async () => {
    const View = (await import('../views/ConfigValidatorView.vue')).default;
    const w = await mountView(View);
    findBtn(w.host, '从现有索引导入')!.click(); // showImport 默认收起，先展开
    await settle();
    expect(useCurBtn(w.host), 'pickedIdx 为空时钮不渲染').toBeNull();
    w.store.pick('cv_idx');
    await settle();
    const btn = useCurBtn(w.host);
    expect(btn).toBeTruthy();
    btn!.click();
    await settle();
    await wait(20);
    expect(location.hash, '@pick 落点回填导入起点').toContain('idx=cv_idx');
    w.unmount();
  });

  it('IndexOptimizerView：点统一件 → 落点 target 回填且不自动扫描', async () => {
    const View = (await import('../views/IndexOptimizerView.vue')).default;
    const w = await mountView(View);
    expect(useCurBtn(w.host)).toBeNull();
    w.store.pick('opt_idx');
    await settle();
    const btn = useCurBtn(w.host);
    expect(btn).toBeTruthy();
    btn!.click();
    await settle();
    await wait(20);
    expect(location.hash, '@pick 落点回填扫描目标').toContain('idx=opt_idx');
    expect(indexSettingsFn, '回填只写值，扫描由用户显式触发').not.toHaveBeenCalled();
    w.unmount();
  });

  it('UpdateByQueryView：点统一件 → 落点 index 回填', async () => {
    const View = (await import('../views/UpdateByQueryView.vue')).default;
    const w = await mountView(View);
    expect(useCurBtn(w.host)).toBeNull();
    w.store.pick('uq_idx');
    await settle();
    const btn = useCurBtn(w.host);
    expect(btn).toBeTruthy();
    btn!.click();
    await settle();
    await wait(20);
    expect(location.hash, '@pick 落点回填目标索引').toContain('idx=uq_idx');
    w.unmount();
  });
});

/* ═══════════ ③ ubq.scriptH 合并 useTierCycle ═══════════ */
describe('UpdateByQueryView ubq.scriptH 合并 useTierCycle（）', () => {
  it('源码锁：useTierCycle 键名档值原样平移（零迁移），私造三件套退役', () => {
    const s = read('../views/UpdateByQueryView.vue');
    expect(s, '机械平移：const { v, cycle } = useTierCycle(\'ubq.scriptH\', 原TIERS)').toMatch(/const \{ v: scriptH, cycle: cycleScriptH \} = useTierCycle\('ubq\.scriptH', SCRIPT_H_TIERS\)/);
    expect(s, '档值序原样（定档）').toMatch(/'max\(110px, 42vh\)', 'max\(150px, 56vh\)', 'max\(220px, 72vh\)'/);
    expect(s, '私造循环退役').not.toMatch(/SCRIPT_H_TIERS\.indexOf/);
    expect(s, '私造 cycle 函数退役（uq.resultH 单值偏好非档循环，合法在场）').not.toMatch(/function cycle/);
  });

  it('直连行为：useTierCycle(\'ubq.scriptH\') 三档循环 + 落盘键不变（不依赖组件落盘）', async () => {
    localStorage.setItem('esquerystudio.pref.ubq.scriptH', JSON.stringify('max(220px, 72vh)')); // 预置末档：验读档+循环回首
    const { useTierCycle } = await import('../composables/useTierCycle');
    const TIERS = ['max(110px, 42vh)', 'max(150px, 56vh)', 'max(220px, 72vh)'];
    const { v, cycle } = useTierCycle('ubq.scriptH', TIERS);
    expect(v.value, '历史末档读档直用（pref key 不变零迁移）').toBe('max(220px, 72vh)');
    cycle();
    expect(v.value, '末档循环回首档').toBe('max(110px, 42vh)');
    cycle();
    expect(v.value, '顺档推进').toBe('max(150px, 56vh)');
    await wait(0);
    expect(localStorage.getItem('esquerystudio.pref.ubq.scriptH'), '落盘键不变（零迁移）').toBe(JSON.stringify('max(150px, 56vh)'));
  });

  it('视图挂载行为：预置末档 → 「高」钮循环回首档，落盘键 esquerystudio.pref.ubq.scriptH 不变', async () => {
    localStorage.setItem('esquerystudio.pref.ubq.scriptH', JSON.stringify('max(220px, 72vh)'));
    const View = (await import('../views/UpdateByQueryView.vue')).default;
    const w = await mountView(View);
    const hBtn = () => w.host.querySelector<HTMLButtonElement>('[data-test="ubq-script-h"]')!;
    expect(hBtn().getAttribute('title'), '历史末档读档直用').toBe('脚本编辑器高度档：max(220px, 72vh)');
    hBtn().click();
    await settle();
    expect(hBtn().getAttribute('title'), '末档循环回首档').toBe('脚本编辑器高度档：max(110px, 42vh)');
    hBtn().click();
    await settle();
    expect(hBtn().getAttribute('title'), '顺档推进').toBe('脚本编辑器高度档：max(150px, 56vh)');
    await wait(0);
    expect(localStorage.getItem('esquerystudio.pref.ubq.scriptH'), '落盘键不变（零迁移）').toBe(JSON.stringify('max(150px, 56vh)'));
    w.unmount();
  });
});
