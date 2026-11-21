/**
 * W2 Task 8：LuceneInput 渗透点行为网（视图级）。
 * 渗透点（Step 1 核实结论）：
 *   ① LuceneQueryView 主查询框 qs（api.luceneSearch 直连 query_string，index=useIdxState）；
 *   ② IndexHubView 文档 Tab docsQ（buildDocsDsl 非空即 query_string，index=cur）。
 * 跳过点（不走 lucene 查询，不接 LuceneInput）：
 *   IndexHubView kwInput / BrowserView kw —— 本地子串过滤索引列表；
 *   SearchSandboxView —— 唯一查询入口是 Monaco DSL 全文编辑器，无 query_string 输入形态。
 * 锁定：① 输入字段前缀出补全（mappingDetail 出口）；② Enter/选择回填 v-model；
 *   ③ 面板关闭后 Enter 透发触发原查询（luceneSearch / clusterQuery 出口参数断言）。
 * mount 范式同 fieldPickerPenetration.spec.ts：手工 createApp+h+createPinia+memory router，
 * 只 mock ../api 出口（vi.fn 惰性包装防 TDZ）；NPopover/NModal 定位机制非测试目标，stub 直渲染。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick, defineComponent } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const mappingDetailFn = vi.fn();
const luceneSearchFn = vi.fn();
const clusterQueryFn = vi.fn();
const searchRawFn = vi.fn();
/* 一百七十一批：Lucene 视图挂 useIndexFieldTypes（QRT 列头类型徽标）会常驻拉一次
   mapping——本 spec 测 LuceneInput/FieldPicker 语义，中和 composable 的拉取以保计数断言纯净 */
vi.mock('../composables/useIndexFieldTypes', async () => {
  const { ref } = await import('vue');
  return { useIndexFieldTypes: () => ref({}) };
});
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      luceneSearch: (...a: any[]) => luceneSearchFn(...a),
      clusterQuery: (...a: any[]) => clusterQueryFn(...a),
      searchRaw: (...a: any[]) => searchRawFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* 防御性 stub 挡真实 fetch 噪音（含 IndexHubView loadDetail/loadAliases 出口；
         raw 挡 store.loadIndices→loadVersion 的 GET / 版本识别） */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      indexSettings: () => Promise.resolve({}),
      shards: () => Promise.resolve([]),
      aliases: () => Promise.resolve([]),
      raw: () => Promise.resolve({}),
    },
  };
});

/* IndexHubView 外壳组件与渗透点无关：stub 掉 CreateIndexModal 切断 monaco-editor 静态导入链 */
vi.mock('../components/CreateIndexModal.vue', () => ({
  __esModule: true,
  default: defineComponent({ name: 'CreateIndexModalStub', template: '<div />' }),
}));

/* NPopover/NModal 的 teleport/定位非测试目标：trigger/content 直渲染，show=false 不渲染 */
vi.mock('naive-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('naive-ui')>();
  return {
    ...actual,
    NPopover: defineComponent({
      name: 'NPopover',
      props: { show: { type: Boolean, default: false } },
      emits: ['update:show'],
      setup(props, { slots, emit }) {
        return () => h('div', { class: 'np-stub' }, [
          h('div', { class: 'np-trigger', onClick: () => emit('update:show', !props.show) }, slots.trigger ? slots.trigger() : []),
          props.show ? h('div', { class: 'np-content' }, slots.default ? slots.default() : []) : null,
        ]);
      },
    }),
    NModal: defineComponent({
      name: 'NModal',
      props: { show: { type: Boolean, default: false } },
      emits: ['update:show'],
      setup(props, { slots }) {
        return () => (props.show ? h('div', { class: 'nm-stub' }, slots.default ? slots.default() : []) : null);
      },
    }),
  };
});

/* ux2 Task 10：JsonArea 内核升级 Monaco——stub 挡编辑器实例（IndexHub dsl/docEditText）；本组对 JsonArea 零驱动（grep 实锤） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import LuceneQueryView from '../views/LuceneQueryView.vue';
import IndexHubView from '../views/IndexHubView.vue';
import { __clearFieldCache } from '../composables/useIndexFields';
import { __clearSuggestCache } from '../composables/useTermsSuggest';

const MAPPING = { raw: { properties: {
  status: { type: 'keyword' },
  message: { type: 'text' },
  user: { properties: { name: { type: 'text' }, age: { type: 'integer' } } },
} } };

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountView(comp: any, path: string) {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/lucene', component: { template: '<div/>' } },
      { path: '/index-hub', component: { template: '<div/>' } },
    ],
  });
  await router.push(path);
  await router.isReady();
  const app = createApp({ render: () => h(comp) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

/* LuceneInput 弹层默认 Teleport 在 body 下，统一查 document.body */
const itemTexts = () => Array.from(document.body.querySelectorAll('.li-item .li-name')).map(el => el.textContent);
async function type(el: HTMLInputElement, v: string) {
  el.value = v; /* happy-dom：程序赋值后 selectionStart 自动置尾 */
  el.dispatchEvent(new Event('input'));
  await settle();
}
async function key(el: HTMLInputElement, k: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
  await settle();
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  /* useUrlState 写回锚定全局 location.hash：LuceneQueryView 的 qs 与 IndexHubView 的 docsQ
     共用 key 'q'——不清场上一用例的 ?q= 会被下一用例读回（实测踩中） */
  history.replaceState(null, '', '#/');
  __clearFieldCache();
  __clearSuggestCache();
  mappingDetailFn.mockReset().mockResolvedValue(MAPPING);
  luceneSearchFn.mockReset().mockResolvedValue({ took: 1, _shards: { total: 1, successful: 1 }, hits: { hits: [], total: 0 } });
  clusterQueryFn.mockReset().mockResolvedValue({ hits: [], total: 0, took: 1 });
  searchRawFn.mockReset().mockResolvedValue({ aggregations: { suggest: { buckets: [] } } });
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('W2 Task 8 LuceneInput 渗透点', () => {
  it('LuceneQueryView 主查询框：字段前缀出补全 → Enter 回填 qs → 面板关 Enter 触发 luceneSearch', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    const { host } = await mountView(LuceneQueryView, '/lucene');
    const inp = host.querySelector<HTMLInputElement>('.lc-qwrap .li-inp');
    expect(inp, '主查询框必须是 LuceneInput').toBeTruthy();
    expect(host.querySelector('.lc-ta'), '旧 textarea 必须已移除').toBeNull();
    expect(inp!.value, 'qs 默认值 * 必须保留').toBe('*');

    await type(inp!, 'sta');
    expect(mappingDetailFn, '输入字段前缀必须拉 a-idx 字段清单').toHaveBeenCalledTimes(1);
    expect(mappingDetailFn.mock.calls[0][0]).toBe('a-idx');
    expect(itemTexts(), '弹层必须出 status 候选').toEqual(['status']);

    /* 有候选 Enter = 回填，不执行查询 */
    await key(inp!, 'Enter');
    expect(inp!.value, '选择必须回填 v-model（qs）').toBe('status');
    expect(luceneSearchFn, '有候选 Enter 只回填不执行').not.toHaveBeenCalled();

    /* 面板关闭后 Enter 透发 → 原执行语义（doRun → api.luceneSearch） */
    await key(inp!, 'Enter');
    expect(luceneSearchFn, '面板关 Enter 必须触发原查询').toHaveBeenCalledTimes(1);
    expect(luceneSearchFn.mock.calls[0][0]).toBe('a-idx');
    expect(luceneSearchFn.mock.calls[0][1], '执行必须带回填后的 qs').toBe('status');
  });

  it('IndexHubView 文档 Tab docsQ：字段前缀出补全 → Enter 回填 → 面板关 Enter 触发 runDocs（query_string 出口）', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    const { host } = await mountView(IndexHubView, '/index-hub');
    /* 挂载即自动 runDocs 一批（空关键词 = match_all 全量浏览） */
    expect(clusterQueryFn, '文档 Tab 首进必须自动拉一批').toHaveBeenCalledTimes(1);
    expect(clusterQueryFn.mock.calls[0][1], '空关键词必须 match_all').toContain('match_all');

    const inp = host.querySelector<HTMLInputElement>('.ih-docs-bar .li-inp');
    expect(inp, 'docsQ 必须是 LuceneInput').toBeTruthy();

    await type(inp!, 'sta');
    expect(itemTexts(), '弹层必须出 status 候选').toEqual(['status']);
    expect(mappingDetailFn.mock.calls.every(c => c[0] === 'a-idx'),
      '字段清单来源必须是当前选中索引 cur').toBe(true);

    /* 有候选 Enter = 回填，不触发检索 */
    await key(inp!, 'Enter');
    expect(inp!.value, '选择必须回填 v-model（docsQ）').toBe('status');
    expect(clusterQueryFn, '有候选 Enter 只回填不检索').toHaveBeenCalledTimes(1);

    /* 面板关闭后 Enter 透发 → 原 @keyup.enter=runDocs 语义，非空走 query_string */
    await key(inp!, 'Enter');
    expect(clusterQueryFn, '面板关 Enter 必须触发 runDocs').toHaveBeenCalledTimes(2);
    expect(clusterQueryFn.mock.calls[1][0]).toBe('a-idx');
    const body = JSON.parse(clusterQueryFn.mock.calls[1][1]);
    expect(body.query.query_string.query, '检索必须走 query_string 且带回填值').toBe('status');
  });
});
