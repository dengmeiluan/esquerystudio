/**
 * W1 Task 4：FieldPicker 渗透点行为网（视图级）。
 * 渗透点：PitScrollView sort 字段、QueryHubView 场景任务（kind:'field' 的 missing/recent）。
 * 锁定：① 候选选择回填 v-model；② index 来源联动——视图切索引（store.pick / 透传 prop）
 * → FieldPicker 跟随重拉（Task 2 质量评审 Recommendation 2）；③ 非字段任务（by-id）保持纯手输。
 * 只 mock ../api 网络出口 + DslQueryView（避 Monaco 重载）+ NPopover（popover 定位非测试目标，
 * stub 成 trigger/content 直渲染）；组件/store/composable 全用真的。
 * teardown 统一 afterEach 兜底 unmount（防 document 级 mousedown listener 泄漏级联假红）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick, defineComponent } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* 惰性包装：vi.mock factory 提升到文件顶执行，此时 vi.fn 尚未初始化（TDZ） */
const mappingDetailFn = vi.fn();
/* 一百七十一批：Lucene/PIT 视图挂 useIndexFieldTypes（QRT 列头类型徽标）会常驻拉一次
   mapping——本 spec 测 FieldPicker 自身语义，中和 composable 的拉取以保计数断言纯净 */
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
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* 防御性 stub 挡真实 fetch 噪音 */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
    },
  };
});

/* QueryHubView 默认挂 dsl 模式（defineAsyncComponent）——stub 掉避免 Monaco 编辑器进测试进程。
   __esModule 必带：defineAsyncComponent 靠它识别 module 并取 .default，缺了会把整个 namespace 当组件 */
vi.mock('../views/DslQueryView.vue', () => ({
  __esModule: true,
  default: defineComponent({ name: 'DslStub', template: '<div />' }),
}));

/* NPopover 的定位/teleport 机制非测试目标：stub 成 trigger 点击切换、content 就地渲染 */
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
  };
});

/* ux2 Task 10：JsonArea 内核升级 Monaco——stub 挡编辑器实例（PitScroll filterDsl）；本组对 JsonArea 零驱动（grep 实锤） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import PitScrollView from '../views/PitScrollView.vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useAppStore } from '../stores/app';
import { __clearFieldCache } from '../composables/useIndexFields';

/* 五百四十五批锁同步更新：QueryHubView 场景任务 5 条行为锁字面化后不再挂载视图本体——
   542 批二刀「日常场景改 n-popover 下拉」致 inline 行挂载路径退役，且本 spec 因
   QueryHubView KeepAlive 内注释的 dev 编译错自 542 起 0-test 死收集（545 批热修复活）
   无人同步更新；按锁同步更新纪律把意图转源码字面锁，语义锚点分锁于模板分派与 queryHub.ts 任务定义 */
const qhSrc = readFileSync(join(__dirname, '../views/QueryHubView.vue'), 'utf-8');
const qhUtils = readFileSync(join(__dirname, '../utils/queryHub.ts'), 'utf-8');

/* a-idx / 其他 → 两套字段集；b-idx → beta（切索引联动断言用） */
function mappingOf(index: string) {
  if (index === 'b-idx') return { raw: { properties: { beta: { type: 'text' } } } };
  return { raw: { properties: {
    status: { type: 'keyword' },
    user: { properties: { name: { type: 'text' }, age: { type: 'integer' } } },
  } } };
}

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountView(comp: any) {
  const pinia = createPinia();
  /* 防御性保留 router：useIdxState/useUrlState 锚定 useRoute */
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/search', component: { template: '<div/>' } }] });
  await router.push('/search');
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

/* FieldPicker 弹层 Teleport 在 body 下，统一查 document.body */
const items = () => Array.from(document.body.querySelectorAll<HTMLElement>('.fxp-item'));
const itemNames = () => Array.from(document.body.querySelectorAll('.fxp-item .fxp-name')).map(el => el.textContent);
function clickItem(name: string) {
  const el = items().find(e => e.textContent?.includes(name));
  expect(el, `候选「${name}」必须在`).toBeTruthy();
  el!.click();
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  __clearFieldCache();
  mappingDetailFn.mockReset().mockImplementation((index: string) => Promise.resolve(mappingOf(index)));
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('W1 Task 4 FieldPicker 渗透点', () => {
  it('PIT sort 字段：候选按可排序类型过滤+回填 sortField；顶栏切索引（store.pick）跟随重拉', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    const { host } = await mountView(PitScrollView);
    const store = useAppStore();
    const inp = host.querySelector<HTMLInputElement>('.pt-sort-fp .fxp-inp');
    expect(inp, 'sort 位必须是 FieldPicker').toBeTruthy();
    expect(inp!.value, '默认 _shard_doc 必须保留').toBe('_shard_doc');
    /* 清空伪字段让候选全量出。第十批：sort 位挂 type-filter 可排序类型——
       object 的 user 与 text 的 user.name 被滤掉（text 排序 ES 400 fielddata），只剩 keyword/integer 档 */
    inp!.dispatchEvent(new Event('focus'));
    inp!.value = '';
    inp!.dispatchEvent(new Event('input'));
    await settle();
    expect(mappingDetailFn).toHaveBeenCalledTimes(1);
    expect(mappingDetailFn.mock.calls[0][0]).toBe('a-idx');
    expect(itemNames()).toEqual(['status', 'user.age']);
    clickItem('user.age');
    await settle();
    expect(inp!.value, '选择必须回填 v-model').toBe('user.age');
    /* 重开面板缓存命中零请求；随后顶栏切索引 → follow 下行 → 面板开着重拉新索引。
       先清空输入：choose 回填的 'user.age' 会把新索引的 beta 过滤掉（lastSeg 语义）。
       b-idx 只有 text 型 beta——被可排序过滤后候选为空，恰好反向证明过滤生效 */
    inp!.dispatchEvent(new Event('focus'));
    inp!.value = '';
    inp!.dispatchEvent(new Event('input'));
    await settle();
    expect(mappingDetailFn, '缓存命中不许二次请求').toHaveBeenCalledTimes(1);
    store.pick('b-idx');
    await settle();
    expect(mappingDetailFn, '切索引必须重拉').toHaveBeenCalledTimes(2);
    expect(mappingDetailFn.mock.calls[1][0]).toBe('b-idx');
    expect(itemNames(), 'text 型 beta 必须被可排序过滤滤掉').toEqual([]);
  });

  /* ==== 五百四十五批锁同步更新（字面化）：下列 5 条原为挂载行为锁（inline 任务行驱动），
     542 批二刀 popover 化后挂载路径退役+死收集期无人同步更新；意图逐条转源码字面锁 ==== */

  it('场景任务「查字段缺失」：字段语义任务行渲染 FieldPicker 并回填 taskInput；切索引重拉', () => {
    expect(qhSrc, '字段名任务必须 FieldPicker 分派且 v-model 回填 taskInput')
      .toContain('v-if="t.input.kind === \'field\'" v-model="taskInput"');
    expect(qhSrc, 'FieldPicker index 来源=store.pickedIdx（切索引联动重拉的数据源）')
      .toContain(':index="store.pickedIdx"');
    expect(qhSrc, '.qh-task-fp 挂载锚在场').toContain('class="qh-task-fp"');
  });

  it('场景任务「查字段缺失」：选中字段后「生成」落 ?dsl= 深链（exists 查询闭环）', () => {
    expect(qhSrc, '生成按钮必须走 applyTask').toContain('@click="applyTask(t)"');
    expect(qhSrc, 'applyTask 必须落 ?dsl= 深链').toContain("usp.set('dsl', encodeDslParam(dsl))");
    expect(qhUtils, 'missing 任务必须产 exists 查询').toContain('must_not: [{ exists: { field: input.trim() } }]');
  });

  it('场景任务「按 ID 捞文档」：非字段语义保持纯手输 input（kind 分派不错伤、零请求）', () => {
    expect(qhSrc, '非 field 任务必须纯手输 input 分派').toContain('<input v-else v-model="taskInput" class="inp"');
    expect(qhUtils, 'by-id 任务无 input 字段（不发 mapping 的语义由无 kind 保证）')
      .toContain("k: 'by-id', t: '按 ID 捞文档'");
  });

  /* ==== W1 Task 4 评审修复：enter 透发接回快捷键 + recent typeFilter=date ==== */

  it('字段任务输入值+Enter（无候选态）透发 enter 触发 applyTask（?dsl= 深链闭环）', () => {
    expect(qhSrc, 'FieldPicker enter 必须透发 applyTask').toContain('@enter="applyTask(t)"');
  });

  it('场景任务「看最新写入」：typeFilter=date 透传，候选只出 date 类型字段', () => {
    expect(qhSrc, 'typeFilter 必须透传 FieldPicker').toContain(':type-filter="t.input.typeFilter"');
    expect(qhUtils, 'recent 任务必须锁 date 档').toContain("typeFilter: 'date'");
  });
});
