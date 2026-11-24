/**
 * 一千零八十五批 W6 分片 b：views 层裸 input 清零——五视图挂载级回归。
 * 每视图至少一例「TextInput 替换后 v-model / placeholder / 事件透传不漂移」：
 * 选择器仍锚真实 input（attrs 透传零漂移），输入后状态更新可观察（按钮 enable /
 * lint 提示出现），placeholder 与原皮肤类字面保留。
 * 覆盖：QueryHubView / QueryXrayView / MappingDesignerView / RankDebugView / IndexSettingsView。
 * 挂载设施照抄 queryHubFirstCut739 / qxTvTools525 / mappingFirstCut717 / rankDebugFirstCut743
 * （vue-router 轻 mock + api 超集 mock + MonacoEditor stub）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

/* 六模式容器（QueryHubView）内 DslQueryView 等懒加载视图消费 vue-router 全量导出——
 浅 mock 缺员会令异步组件 resolve 静默失败，故走真 router（queryHubFirstCut739 配方） */
import { createRouter, createMemoryHistory } from 'vue-router';

vi.mock('../components/MonacoEditor.vue', async () => {
  const { defineComponent: dc } = await import('vue');
  return {
    default: dc({
      props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
      emits: ['update:modelValue', 'execute'],
      setup(_, { expose }) {
        /* setMarkers：DslQueryView（QueryHub 懒挂 pane）lint 防抖回调 */
        expose({ setMarkers: () => ({ unplaced: [] }) });
        return () => h('div', { class: 'monaco-host' });
      },
    }),
  };
});

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([{ index: 'logs-x', health: 'green', status: 'open' }]),
      clusterHealth: () => Promise.resolve({}),
      overview: () => Promise.resolve({}),
      nodesStatsBrief: () => Promise.resolve([]),
      aliases: () => Promise.resolve([]),
      mappingDetail: () => Promise.resolve({ tree: [{ name: 'title', type: 'text' }], stats: { total: 1, text: 1 }, raw: { properties: { title: { type: 'text' }, status: { type: 'keyword' } } } }),
      indexSettings: () => Promise.resolve({ 'logs-x': { settings: { index: { refresh_interval: '1s', number_of_replicas: '1' } }, defaults: { index: {} } } }),
      validateQuery: () => Promise.resolve({}),
      explainDoc: () => Promise.resolve({ matched: false, explanation: null }),
      termVectors: () => Promise.resolve({ found: false, term_vectors: {} }),
      resolveSchema: () => Promise.resolve({ warnings: [] }),
    },
  };
});

import QueryHubView from '../views/QueryHubView.vue';
import QueryXrayView from '../views/QueryXrayView.vue';
import MappingDesignerView from '../views/MappingDesignerView.vue';
import RankDebugView from '../views/RankDebugView.vue';
import IndexSettingsView from '../views/IndexSettingsView.vue';
import { useAuthStore } from '../stores/auth';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(comp: any, path: string, opts: { admin?: boolean } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push(path);
  await router.isReady();
  const pinia = createPinia();
  if (opts.admin) {
    const auth = useAuthStore(pinia);
    auth.me = { username: 't', role: 'ADMIN', fallback: false };
    auth.probed = true;
  }
  const app = createApp({ render: () => h(comp) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function mustInput(root: ParentNode, sel: string): HTMLInputElement {
  const el = root.querySelector<HTMLInputElement>(sel);
  expect(el, `输入框必须存在：${sel}`).toBeTruthy();
  return el!;
}

function nativeSet(el: HTMLInputElement, val: string) {
  el.value = val;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/* 轮询等待异步渲染的目标出现（上限 10s，一出现即继续）：dsl 视图是懒加载的大视图，
   首次 transform 耗时随机器负载与缓存冷暖波动（全量并行分片时更久），固定延时会在慢机上假红 */
async function waitFor<T>(pick: () => T | null | undefined, what: string, limitMs = 10000): Promise<T> {
  const until = Date.now() + limitMs;
  for (;;) {
    const hit = pick();
    if (hit) return hit;
    if (Date.now() > until) { expect(hit, what).toBeTruthy(); throw new Error(what); }
    await new Promise(r => setTimeout(r, 100));
    await settle(10);
  }
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  /* useIdxState follow 读全局 picked 索引（localStorage 键）——种 logs-x（rankDebugFirstCut743 配方） */
  localStorage.setItem('es_picked', 'logs-x');
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  history.replaceState(null, '', '#/');
});

describe('1085 W6-b：QueryHubView 任务自由文本输入（TextInput 化零漂移）', () => {
  it('「按 ID 捞文档」任务输入：placeholder/皮肤类透传 + 输入后生成钮 enable', async () => {
    const host = await mountView(QueryHubView, '/search');
    /* 六模式 pane 为 defineAsyncComponent：「日常场景」钮在 dsl 视图工具行的插槽里，
       随懒加载视图渲染后才出现——轮询等待而非固定延时 */
    const toggle = await waitFor(
      () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('日常场景')) as HTMLButtonElement | undefined,
      '「日常场景」钮在场');
    toggle.click();
    const taskBtn = await waitFor(
      () => [...document.querySelectorAll('button')].find(b => b.textContent?.includes('按 ID 捞文档')) as HTMLButtonElement | undefined,
      '任务钮在场（popover teleport 到 body）');
    taskBtn.click();
    const inp = await waitFor(
      () => document.querySelector<HTMLInputElement>('input[placeholder*="文档 _id"]'),
      '任务输入（TextInput 内层 input）在场');
    expect(inp.className, '皮肤类 inp 经 input-class 落真实 input').toContain('inp');
    const gen = await waitFor(
      () => [...document.querySelectorAll('button')].find(b => b.textContent?.includes('生成')) as HTMLButtonElement | undefined,
      '生成钮在场');
    expect(gen.disabled, '未输入时生成钮禁用').toBe(true);
    nativeSet(inp, 'a,b');
    await settle();
    expect(gen.disabled, '输入后生成钮解禁（v-model 状态更新）').toBe(false);
  });
});

describe('1085 W6-b：QueryXrayView 取证 _id 输入（TextInput 化零漂移）', () => {
  it('词频取证 tab：qx-ii wide 皮肤类 + 输入后取证钮 enable', async () => {
    const host = await mountView(QueryXrayView, '/query-xray');
    const tabs = [...host.querySelectorAll('.qx-tab')] as HTMLElement[];
    (tabs.find(b => b.textContent?.includes('词频取证')) as HTMLElement).click();
    await settle();
    const inp = mustInput(host, 'input.qx-ii.wide');
    nativeSet(inp, 'doc-42');
    await settle();
    expect(inp.placeholder, 'placeholder 透传不漂移').toContain('要取证的文档 _id');
    const run = [...host.querySelectorAll('.btn.primary.sm')].find(b => b.textContent?.includes('取证')) as HTMLButtonElement;
    expect(run, '取证钮在场').toBeTruthy();
    expect(run.disabled, '输入后取证钮解禁').toBe(false);
  });
});

describe('1085 W6-b：MappingDesignerView 加字段路径输入（TextInput 化零漂移）', () => {
  it('加字段弹窗：md-ii 皮肤类 + 输入后添加钮 enable', async () => {
    const host = await mountView(MappingDesignerView, '/mapping-designer', { admin: true });
    const add = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('加字段')) as HTMLButtonElement;
    expect(add && !add.disabled, '加字段钮在场可点（ADMIN + 字段树非空）').toBeTruthy();
    add.click();
    await settle();
    const inp = document.querySelector<HTMLInputElement>('input[placeholder*="user.address.city"]');
    expect(inp, '字段路径输入（TextInput 内层 input）在场').toBeTruthy();
    expect(inp!.className, '皮肤类 md-ii 落真实 input').toContain('md-ii');
    const ok = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('提交')) as HTMLButtonElement;
    expect(ok && ok.disabled, '未输入时提交钮禁用').toBe(true);
    nativeSet(inp!, 'user.city');
    await settle();
    expect(ok.disabled, '输入后提交钮解禁（v-model 状态更新）').toBe(false);
  });
});

describe('1085 W6-b：RankDebugView 审问 _id 输入（TextInput 化零漂移）', () => {
  it('审问模式：rd-ii wide 皮肤类 + 输入后审问钮 enable', async () => {
    const host = await mountView(RankDebugView, '/rank-debug');
    const inp = mustInput(host, 'input.rd-ii.wide');
    nativeSet(inp, 'doc-7');
    await settle();
    expect(inp.placeholder, 'placeholder 透传不漂移').toContain('要审问的文档 _id');
    const run = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('审问它')) as HTMLButtonElement;
    expect(run, '审问钮在场').toBeTruthy();
    expect(run.disabled, '输入后审问钮解禁').toBe(false);
  });
});

describe('1085 W6-b：IndexSettingsView 热参数输入（TextInput 化零漂移）', () => {
  it('refresh_interval：is-input mono 皮肤类 + 失焦校验提示经 @blur 透传触发', async () => {
    const host = await mountView(IndexSettingsView, '/index-settings');
    const inp = host.querySelector<HTMLInputElement>('input[placeholder*="1s / 30s"]');
    expect(inp, 'refresh_interval 输入在场（settings 已加载）').toBeTruthy();
    expect(inp!.className, '皮肤类 is-input mono 落真实 input').toContain('is-input');
    expect(inp!.className).toContain('mono');
    nativeSet(inp!, 'bad');
    await settle();
    inp!.dispatchEvent(new Event('blur'));
    await settle();
    const hint = host.querySelector('.is-row .il-hint');
    expect(hint, '失焦后时间格式 lint 提示出现（@blur 透传 + v-model 同步）').toBeTruthy();
    expect(hint!.textContent).toContain('时间格式');
  });
});
