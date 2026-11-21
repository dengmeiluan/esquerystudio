/** ux2 Task 7：SqlBridgeView 三栏 Monaco 化渗透。
 *  组件 stub 范式同 monacoAssistAttach.spec（setup 捕获 props/emit 入档）。
 *  断言面：三实例语言/只读/高度契约 + 空态占位形态 + execute→doAll 链路 + DSL 栏联动。 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* 防御性 stub 挡真实 fetch 噪音 */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      /* 本 spec 两个出口（runSql 用例不走，留 spy 即可） */
      sqlTranslate: vi.fn(() => Promise.resolve({ size: 100, query: { match_all: {} } })),
      sqlLenient: vi.fn(() => Promise.resolve({})),
    },
  };
});

/* MonacoEditor 组件 stub：setup 捕获 props/emit 入档（props 是响应式对象，后读即现值） */
const monacoCaps: { props: any; emit: (e: string, v?: any) => void }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { monacoCaps.push({ props, emit }); return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

import { api } from '../api';
import SqlBridgeView from '../views/SqlBridgeView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/* gotoQuery/gotoLucene 用 useRouter——必须挂 memory router（无 onMounted，挂载零网络） */
async function mountView() {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(SqlBridgeView) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  monacoCaps.length = 0;
  vi.clearAllMocks(); /* 清调用记录不清实现——sqlTranslate mock 返回值保活 */
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
});

describe('ux2 Task 7 SqlBridgeView 三栏 Monaco 化', () => {
  it('① 三实例装配：sql 可写 / json·lucene 只读，高度 v3.0.1 弹性 100%（可调工作台等高三栏，42vh 行高兜底）', async () => {
    await mountView();
    expect(monacoCaps.length, 'SQL/DSL/Lucene 三栏恰 3 枚 Monaco').toBe(3);
    expect(monacoCaps[0].props.language).toBe('sql');
    expect(monacoCaps[0].props.readonly, 'SQL 栏可写').toBeFalsy();
    expect(monacoCaps[0].props.height).toBe('100%');
    expect(monacoCaps[1].props.language).toBe('json');
    expect(monacoCaps[1].props.readonly).toBe(true);
    expect(monacoCaps[1].props.height).toBe('100%');
    expect(monacoCaps[2].props.language).toBe('lucene');
    expect(monacoCaps[2].props.readonly).toBe(true);
    expect(monacoCaps[2].props.height).toBe('100%');
  });

  it('② 空态占位：DSL 栏 // 注释形态（allowComments 配置下零红波浪），Lucene 栏人话占位', async () => {
    sessionStorage.clear(); /* 352 批：dsl/lucene 迁 draft2 草稿后挂载会恢复旧稿，先清 */
    await mountView();
    expect(monacoCaps[1].props.modelValue).toBe('// 点击一键转换后自动生成');
    expect(monacoCaps[2].props.modelValue).toBe('（从 DSL 抽取 query_string 片段）');
  });

  it('③ execute（Ctrl+Enter）触发 doAll：sqlTranslate 收 query 体，DSL 栏联动输出', async () => {
    await mountView();
    monacoCaps[0].emit('update:modelValue', 'SELECT 1');
    await settle();
    monacoCaps[0].emit('execute');
    await settle();
    expect(api.sqlTranslate).toHaveBeenCalledTimes(1);
    expect(api.sqlTranslate).toHaveBeenCalledWith(JSON.stringify({ query: 'SELECT 1' }));
    expect(monacoCaps[1].props.modelValue).toContain('match_all');
  });
});
