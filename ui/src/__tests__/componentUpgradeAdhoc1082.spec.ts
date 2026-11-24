/**
 * 迁移/重建板块输入统一件收敛看守：AdhocRebuild / ReindexAdvanced / UpdateByQuery
 * 三视图裸 input 清零，TextInput 接管后真实 input 保留宿主皮肤类与 data-test
 * （选择器零漂移）；输入/失焦/回车链路等价接线。
 * Adhoc 两张语义表（期望 vs 实际差异比对、重建轮次表）的行级右键菜单与键盘行导航
 * 经 MiniTable #rows 行自治槽承载（宿主自带整段行内容），Σ 聚合行经 #tfoot 槽——
 * 表格壳/表头/斑马/空态归统一件，行交互字面量（openDiffMenu/openRoundMenu/
 * data-row-nav/@keydown.self）原样存活在视图源码内。
 * 运行时基建同 adhocClusterClone / reindexAdvancedFirstCut745 / updateByQueryFirstCut770
 * （api 出口 mock + Monaco stub + memory router，视图/组件全真）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useAppStore } from '../stores/app';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const srcAdhoc = read('../views/AdhocRebuildView.vue');
const srcRA = read('../views/ReindexAdvancedView.vue');
const srcUQ = read('../views/UpdateByQueryView.vue');

/* ---- 网络出口 mock（三视图挂载链路合并一套，视图/组件全真） ---- */
const mocks = vi.hoisted(() => ({
  fetchConfig: vi.fn(),
  connectCheck: vi.fn(),
  adhocJobs: vi.fn(),
  reindexAdvanced: vi.fn(),
  searchDsl: vi.fn(),
  updateByQuery: vi.fn(),
  progress: vi.fn(),
  askConfirm: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      adhoc: { ...orig.api.adhoc, jobs: mocks.adhocJobs },
      xb: { ...orig.api.xb, fetchConfig: mocks.fetchConfig, connectCheck: mocks.connectCheck },
      reindexAdvanced: (...a: any[]) => mocks.reindexAdvanced(...a),
      searchDsl: (...a: any[]) => mocks.searchDsl(...a),
      updateByQuery: (...a: any[]) => mocks.updateByQuery(...a),
      progress: (...a: any[]) => mocks.progress(...a),
      setup: { ...orig.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      keys: () => Promise.resolve([]),
      clustersList: () => Promise.resolve([]),
      clusterIndices: () => Promise.resolve([]),
      aliases: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({ body: { version: { number: '8.11.0' } } }),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
    },
  };
});

vi.mock('../composables/confirm', () => ({
  askConfirm: (...a: any[]) => mocks.askConfirm(...a),
}));

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import AdhocRebuildView from '../views/AdhocRebuildView.vue';
import ReindexAdvancedView from '../views/ReindexAdvancedView.vue';
import UpdateByQueryView from '../views/UpdateByQueryView.vue';

const settle = async (n = 12) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const STEP_KEY = 'esquerystudio.draft2:adhoc:host:-:-:step';

function setInput(el: HTMLInputElement, v: string) {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function mountView(view: () => any, hash = '#/') {
  location.hash = hash;
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp({ render: () => h(view()) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, store: useAppStore(pinia) };
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem(STEP_KEY, '1');
  mocks.fetchConfig.mockReset();
  mocks.connectCheck.mockReset().mockResolvedValue([
    { index: 'onshore-bond-basic', health: 'green', 'docs.count': '1200' },
  ]);
  mocks.adhocJobs.mockReset().mockResolvedValue([]);
  mocks.reindexAdvanced.mockReset().mockResolvedValue({ took: 5, total: 1, created: 1, updated: 0 });
  mocks.searchDsl.mockReset().mockResolvedValue({});
  mocks.updateByQuery.mockReset().mockResolvedValue({ taskId: 'job-x' });
  mocks.progress.mockReset().mockResolvedValue({});
  mocks.askConfirm.mockReset().mockResolvedValue(true);
});

describe('源码锁：三视图零裸 input，统一件接管且皮肤类/data-test 零漂移', () => {
  it('三视图模板无裸 <input>（全部经 TextInput 承载）', () => {
    expect(srcAdhoc).not.toMatch(/<input[\s>]/);
    expect(srcRA).not.toMatch(/<input[\s>]/);
    expect(srcUQ).not.toMatch(/<input[\s>]/);
  });

  it('TextInput 接线：皮肤类经 inputClass 保留在真实 input 上（ipt grow mono / inp mono / ra-i / inp）', () => {
    expect(srcAdhoc).toContain('input-class="ipt grow mono"');
    expect(srcAdhoc).toContain('input-class="inp mono"');
    expect(srcRA).toMatch(/input-class="ra-i"/g);
    expect(srcRA.match(/input-class="ra-i"/g)!.length).toBe(2);
    expect(srcUQ.match(/input-class="inp"/g)!.length).toBe(4);
  });

  it('data-test 锚不漂移（复刻源索引 combobox / 预设名输入）', () => {
    expect(srcAdhoc).toContain('data-test="ar-clone-index"');
    expect(srcAdhoc).toContain('data-test="ar-preset-name"');
  });

  it('scoped 皮肤穿透：宿主皮类落到统一件内部 input 后仍命中（ra-i 穿透 / 预设名 110px 宽穿透）', () => {
    expect(srcRA).toContain(':deep(input.ra-i)');
    expect(srcAdhoc).toContain('.ar-retry-preset :deep(.ti) { flex: 0 1 110px; }');
  });
});

describe('源码锁：Adhoc 两张语义表经 MiniTable 承载（#rows/#tfoot 槽），行交互字面量不漂移', () => {
  it('三视图模板无裸 <table>（全部经组件承载）', () => {
    expect(srcAdhoc).not.toMatch(/<table[\s>]/);
    expect(srcRA).not.toMatch(/<table[\s>]/);
    expect(srcUQ).not.toMatch(/<table[\s>]/);
  });

  it('差异比对表：MiniTable 声明式列 + 行交互经 #rows 槽原样保留', () => {
    expect(srcAdhoc).toContain('<MiniTable :columns="CFG_DIFF_COLS">');
    expect(srcAdhoc).toContain("{ key: 'path', label: '路径', mono: true }");
    expect(srcAdhoc).toContain('@contextmenu.prevent="openDiffMenu($event, row)"');
    expect(srcAdhoc).toContain('data-row-nav @keydown.self="rowArrowNav"');
  });

  it('轮次表：tableClass 透传 ar-rounds + Σ 聚合行经 #tfoot 槽', () => {
    expect(srcAdhoc).toContain(':columns="ROUND_COLS" table-class="ar-rounds"');
    expect(srcAdhoc).toContain("@contextmenu.prevent=\"openRoundMenu($event, r)\"");
    expect(srcAdhoc).toContain('<template #tfoot>');
    expect(srcAdhoc).toContain('ar-rounds-agg-row');
  });
});

describe('运行时：AdhocRebuild 三处输入由 TextInput 承载，链路等价', () => {
  it('目标物理索引名：input.ti-inp 带原 ipt/grow/mono 皮肤类，输入 trim 语义保留', { timeout: 20000 }, async () => {
    const { app, host, store } = await mountView(() => AdhocRebuildView);
    store.conns = [{ id: 'conn-prod', name: '生产', host: 'es-prod.internal', port: 9200 }] as any;
    await settle();
    const inp = host.querySelector<HTMLInputElement>('.row input.ti-inp')!;
    expect(inp, '目标索引名输入必须渲染').toBeTruthy();
    expect(inp.classList.contains('ipt')).toBe(true);
    expect(inp.classList.contains('grow')).toBe(true);
    expect(inp.classList.contains('mono')).toBe(true);
    setInput(inp, '  orders-v2  ');
    await settle(2);
    expect(inp.value, 'v-model.trim 语义等价（首尾空格剪除后回写）').toBe('orders-v2');
    app.unmount();
  });

  it('复刻源索引 combobox：data-test/role/aria 透传到真实 input，输入链路可用', { timeout: 20000 }, async () => {
    mocks.fetchConfig.mockResolvedValue({ settings: '{}', mapping: '{}' });
    const { app, host, store } = await mountView(() => AdhocRebuildView);
    store.conns = [{ id: 'conn-prod', name: '生产', host: 'es-prod.internal', port: 9200 }] as any;
    await settle();
    (host.querySelector('[data-test="ar-clone-open"]') as HTMLButtonElement).click();
    await settle();
    const inp = document.querySelector<HTMLInputElement>('[data-test="ar-clone-index"]')!;
    expect(inp, '复刻弹窗输入必须渲染').toBeTruthy();
    expect(inp.classList.contains('ti-inp'), '统一件内部 input 承载').toBe(true);
    expect(inp.classList.contains('inp') && inp.classList.contains('mono'), '宿主皮肤类保留').toBe(true);
    expect(inp.getAttribute('role'), 'combobox aria 语义随 attrs 透传').toBe('combobox');
    expect(inp.getAttribute('aria-expanded'), '弹层开合态 aria 透传').toBeTruthy();
    setInput(inp, 'onshore-bond-basic');
    await settle(2);
    (document.querySelector('[data-test="ar-clone-fetch"]') as HTMLButtonElement).click();
    await settle();
    expect(mocks.fetchConfig).toHaveBeenCalledWith(expect.anything(), 'onshore-bond-basic', 'conn-prod');
    app.unmount();
  });
});

describe('运行时：ReindexAdvanced 两处输入由 TextInput 承载（ra-i 皮肤类保留）', () => {
  it('size/pipeline 输入：input.ti-inp.ra-i，v-model 输入链路等价', { timeout: 20000 }, async () => {
    const { app, host } = await mountView(() => ReindexAdvancedView);
    const size = host.querySelector<HTMLInputElement>('input.ti-inp.ra-i')!;
    expect(size, 'size 输入必须渲染').toBeTruthy();
    expect(size.placeholder).toBe('1000');
    setInput(size, '888');
    await settle(2);
    expect(size.value, '输入回写链路（v-model）').toBe('888');
    const all = [...host.querySelectorAll<HTMLInputElement>('input.ti-inp.ra-i')];
    expect(all.length, 'size + pipeline 两处输入').toBe(2);
    expect(all[1].placeholder).toBe('ingest pipeline ID（可选）');
    app.unmount();
  });
});

describe('运行时：UpdateByQuery 四处输入由 TextInput 承载（inp 皮肤类保留，blur 校验接线）', () => {
  it('max_docs/slices/限流/scroll 四输入：input.ti-inp.inp；slices 失焦校验仍产出 hint', { timeout: 20000 }, async () => {
    const { app, host } = await mountView(() => UpdateByQueryView, '#/update-by-query?idx=logs-*');
    await settle();
    const inps = [...host.querySelectorAll<HTMLInputElement>('input.ti-inp.inp')];
    expect(inps.length, '四参数输入全部统一件承载').toBe(4);
    const byPh = (ph: string) => inps.find(i => i.placeholder === ph)!;
    expect(byPh('留空 = 不限'), 'max_docs').toBeTruthy();
    expect(byPh('如 5m'), 'scroll').toBeTruthy();
    expect(byPh('-1 = 不限 / 500 = 500 doc/s'), 'requests_per_second').toBeTruthy();
    const slices = byPh('auto / 数字');
    setInput(slices, 'abc');
    await settle(2);
    slices.dispatchEvent(new Event('blur'));
    await settle(2);
    expect(host.querySelector('.il-hint'), 'slices 失焦校验 hint 仍接线（blur 事件透传）').toBeTruthy();
    app.unmount();
  });
});
