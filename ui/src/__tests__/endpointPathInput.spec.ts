/**
 * W3 Task 10：EndpointPathInput 双段弹层行为契约（TDD 先行，组件不存在时全红）。
 *
 * 硬契约 8 条（pinia 注入 indices=[logs-2026.08, bond_index]）：
 *   ① 输入 / → 弹端点目录（行=methods 徽标+path+doc）；
 *   ② 输入 _sea → 命中 /{index}/_search；
 *   ③ 选中含槽位端点 → 段二弹索引清单（logs-2026.08/bond_index）；
 *   ④ 选索引 → 回填 /logs-2026.08/_search；
 *   ⑤ 无槽位端点直接回填；
 *   ⑥ Esc 关层不丢文本；
 *   ⑦ Enter 选中回填、无匹配保留手输；
 *   ⑧ emit endpoint 事件带出端点（段一 choose 即发，method 联动用）。
 *
 * 增补（设计决策固化）：
 *   - 段二 input 显示方案 B：段二打开期间 v-model 保持用户原文不被模板污染，
 *     段指示行 .epi-stage 显示待填模板补偿上下文；emit endpoint 段一发一次，选索引不重发；
 *   - 段回退语义：input 事件 / Esc / 选索引完成 / enter 透发 → 一律回 endpoint 段；
 *   - 段二空索引集群 hint 零降级；to=false 就地模式；面板关 Enter 透发 enter。
 *
 * mount 范式与 luceneInput.spec.ts 一致（手工 createApp+h+createPinia，apps 收集 +
 * afterEach 兜底 unmount）；只 mock ../api 出口（防御性 stub 挡真实 fetch 噪音）。
 * 弹层默认 Teleport 到 body：统一查 document.body；to=false 时查组件根。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* 只替换网络出口，组件/composable/store 全用真的 */
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* 防御性 stub 挡真实 fetch 噪音（本组件只读 store，不发请求） */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
    },
  };
});

import EndpointPathInput from '../components/devtools/EndpointPathInput.vue';
import { useAppStore } from '../stores/app';
import type { EsEndpoint } from '../utils/esEndpoints';

const INDICES = [{ index: 'logs-2026.08' }, { index: 'bond_index' }];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/* teardown 兜底：所有 mount 的 app 收集于此，afterEach 统一 unmount（同 luceneInput.spec 范式） */
const apps: ReturnType<typeof createApp>[] = [];

async function mountInput(init: { modelValue?: string; to?: string | false; indices?: any[] } = {}) {
  const state = reactive({ modelValue: init.modelValue ?? '' });
  const endpoints: EsEndpoint[] = [];
  const entered: number[] = [];
  const pinia = createPinia();
  /* 防御性保留：防 store 未来路由依赖（同 luceneInput.spec 范式） */
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({
    render: () => h(EndpointPathInput, {
      modelValue: state.modelValue,
      ...(init.to !== undefined ? { to: init.to } : {}),
      'onUpdate:modelValue': (v: string) => { state.modelValue = v; },
      onEndpoint: (ep: EsEndpoint) => endpoints.push(ep),
      onEnter: () => entered.push(1),
    }),
  });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  /* pinia 注入索引清单：mount 前置位，组件 setup 即可读到 */
  const store = useAppStore(pinia);
  store.indices = (init.indices ?? INDICES) as any;
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, state, endpoints, entered };
}

/* 弹层 Teleport 到 body：统一在这里查 */
const pop = () => document.body.querySelector('.epi-pop');
const items = () => Array.from(document.body.querySelectorAll<HTMLElement>('.epi-item'));
/* 段一端点行 path 文本 / 段二索引行索引名（两类行互斥，同层只出一段） */
const epPaths = () => Array.from(document.body.querySelectorAll('.epi-item .epi-p')).map(el => el.textContent);
const slotNames = () => Array.from(document.body.querySelectorAll('.epi-item .epi-idx')).map(el => el.textContent);
const stageBar = () => document.body.querySelector('.epi-stage');
const inp = (host: ParentNode) => host.querySelector<HTMLInputElement>('.epi-inp')!;
async function type(host: ParentNode, v: string) {
  const el = inp(host);
  el.value = v;
  el.dispatchEvent(new Event('input'));
  await settle();
}
async function key(host: ParentNode, k: string) {
  inp(host).dispatchEvent(new KeyboardEvent('keydown', { key: k }));
  await settle();
}
/* 弹层关闭走 <transition> 离场：断言「已关闭」前补一帧（同 luceneInput.spec 的 flushLeave） */
async function flushLeave() {
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
  await settle(3);
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  apps.forEach(a => a.unmount());
  apps.length = 0;
});

describe('EndpointPathInput 双段弹层', () => {
  it('① 输入 / → 弹端点目录：含槽位/无槽位端点，行带 methods 徽标+path+doc', async () => {
    const { host } = await mountInput();
    expect(pop(), '未输入不出层').toBeNull();
    await type(host, '/');
    expect(pop(), '输入 / 必须出端点目录').toBeTruthy();
    expect(epPaths()).toContain('/{index}/_search');
    expect(epPaths()).toContain('/_cat/indices');
    const row = items().find(el => el.querySelector('.epi-p')?.textContent === '/{index}/_search')!;
    const badge = row.querySelector('.epi-m');
    expect(badge, '端点行必须带 methods 徽标').toBeTruthy();
    expect(badge!.textContent).toBe('GET/POST');
    expect(row.querySelector('.epi-d')!.textContent).toBe('搜索文档');
    expect(stageBar(), '段一没有槽位指示行').toBeNull();
  });

  it('② 输入 _sea → 命中 /{index}/_search（前缀rank前置，/_search 排首）', async () => {
    const { host } = await mountInput();
    await type(host, '_sea');
    expect(pop()).toBeTruthy();
    expect(epPaths()).toContain('/{index}/_search');
    expect(epPaths()[0], '无槽位 /_search 同 rank 字典序在前').toBe('/_search');
  });

  it('③④⑧ Enter 选中含槽位端点 → 段二弹索引清单（不回填 v-model，emit endpoint 一次）；选索引回填最终路径并关层', async () => {
    const { host, state, endpoints } = await mountInput();
    await type(host, '_sea');
    /* ↓ 移到 /{index}/_search（cursor 0=/_search，1=/{index}/_search） */
    await key(host, 'ArrowDown');
    expect(items()[1].classList.contains('act'), '高亮必须在 /{index}/_search 行').toBe(true);
    expect(items()[1].querySelector('.epi-p')!.textContent).toBe('/{index}/_search');
    await key(host, 'Enter');
    /* 段一 choose：不写 v-model（v-model 只承载最终路径），emit endpoint 即发（method 联动） */
    expect(state.modelValue, '段一 choose 不许污染 v-model（方案 B）').toBe('_sea');
    expect(endpoints.length, '段一 choose 必须 emit endpoint').toBe(1);
    expect(endpoints[0].path).toBe('/{index}/_search');
    expect(endpoints[0].methods).toEqual(['GET', 'POST']);
    /* 段二：弹层保持开，切索引清单（全量），段指示行显示待填模板 */
    expect(pop(), '段二弹层必须保持打开').toBeTruthy();
    expect(slotNames(), '段二索引清单=store.indices 全量').toEqual(['logs-2026.08', 'bond_index']);
    expect(epPaths(), '段二不再有端点行').toEqual([]);
    expect(stageBar(), '段二必须有槽位指示行').toBeTruthy();
    expect(stageBar()!.textContent).toContain('/{index}/_search');
    expect(inp(host).value, '段二 input 保持用户原文（方案 B）').toBe('_sea');
    /* 段二 Enter 选 logs-2026.08（cursor 0）→ fillIndexSlot 完整回填 + 关层 + 不重发 endpoint */
    await key(host, 'Enter');
    expect(state.modelValue, '选索引回填最终路径').toBe('/logs-2026.08/_search');
    expect(endpoints.length, '选索引不重发 endpoint').toBe(1);
    await flushLeave();
    expect(pop(), '回填后弹层必须关闭').toBeNull();
  });

  it('③④ 点击路径：点击端点项 → 段二索引清单；点击索引项回填', async () => {
    const { host, state, endpoints } = await mountInput();
    await type(host, '_sea');
    const row = items().find(el => el.querySelector('.epi-p')?.textContent === '/{index}/_search')!;
    row.click();
    await settle();
    expect(state.modelValue, '点击端点不回填 v-model').toBe('_sea');
    expect(endpoints.length).toBe(1);
    expect(slotNames()).toEqual(['logs-2026.08', 'bond_index']);
    /* 点击第二项 bond_index */
    items().find(el => el.querySelector('.epi-idx')?.textContent === 'bond_index')!.click();
    await settle();
    expect(state.modelValue).toBe('/bond_index/_search');
    await flushLeave();
    expect(pop(), '点击索引后弹层必须关闭').toBeNull();
  });

  it('目录关键词选含槽位端点：段二回退全量索引（关键词不当索引过滤词，避免无候选死路）', async () => {
    const { host, state } = await mountInput();
    /* 'search' 是目录搜索词，不是索引前缀：修复前段二按 'search' 过滤 → 0 个索引项 */
    await type(host, 'search');
    const row = items().find(el => el.querySelector('.epi-p')?.textContent === '/{index}/_search')!;
    row.click();
    await settle();
    expect(stageBar(), '必须进段二').toBeTruthy();
    expect(slotNames(), '关键词不当索引过滤词：段二出全量索引').toEqual(['logs-2026.08', 'bond_index']);
    items()[0].click();
    await settle();
    expect(state.modelValue, '选索引回填最终路径').toBe('/logs-2026.08/_search');
    await flushLeave();
    expect(pop(), '回填后弹层必须关闭').toBeNull();
  });

  it('⑤⑧ 无槽位端点直接回填：Enter 选中 /_reindex → 回填+emit endpoint+关层，不进段二', async () => {
    const { host, state, endpoints } = await mountInput();
    await type(host, 'reindex');
    expect(epPaths()).toEqual(['/_reindex']);
    await key(host, 'Enter');
    expect(state.modelValue, '无槽位端点直接回填').toBe('/_reindex');
    expect(endpoints.length, '无槽位端点 choose 同样 emit endpoint').toBe(1);
    expect(endpoints[0].path).toBe('/_reindex');
    expect(slotNames(), '无槽位端点不进段二').toEqual([]);
    expect(stageBar(), '无槽位端点不出段指示行').toBeNull();
    await flushLeave();
    expect(pop(), '回填后弹层必须关闭').toBeNull();
  });

  it('⑥ 段一 Esc：关层不丢文本', async () => {
    const { host, state } = await mountInput();
    await type(host, '_sea');
    expect(pop()).toBeTruthy();
    await key(host, 'Escape');
    expect(state.modelValue, 'Esc 不许丢/改文本').toBe('_sea');
    await flushLeave();
    expect(pop(), 'Esc 后弹层必须关闭').toBeNull();
  });

  it('⑥ 段二 Esc：关层不丢文本且回段一——↓ 重开出端点目录而非索引清单', async () => {
    const { host, state } = await mountInput();
    await type(host, '_sea');
    await key(host, 'ArrowDown');
    await key(host, 'Enter'); /* 进段二 */
    expect(slotNames()).toEqual(['logs-2026.08', 'bond_index']);
    await key(host, 'Escape');
    expect(state.modelValue, '段二 Esc 不丢手输文本').toBe('_sea');
    await flushLeave();
    expect(pop(), '段二 Esc 必须关层').toBeNull();
    /* 段回退：↓ 重开必须是端点目录 */
    await key(host, 'ArrowDown');
    expect(pop(), '↓ 必须重开弹层').toBeTruthy();
    expect(epPaths().length, '重开必须是端点目录（段一回退）').toBeGreaterThan(0);
    expect(slotNames(), '不许滞留段二索引清单').toEqual([]);
    expect(stageBar(), '回段一后段指示行必须消失').toBeNull();
  });

  it('⑦ 无匹配手输 zzz → hint 行提示仍可手输；Enter 收层保留手输并透发 enter', async () => {
    const { host, state, entered } = await mountInput();
    await type(host, 'zzz');
    expect(pop(), '无匹配也出层（hint 引导）').toBeTruthy();
    expect(items().length, '无匹配零候选').toBe(0);
    const hint = pop()!.querySelector('.epi-hint');
    expect(hint, '无匹配必须出 hint 行').toBeTruthy();
    expect(hint!.textContent).toContain('zzz');
    expect(hint!.textContent).toContain('仍可手输');
    await key(host, 'Enter');
    expect(state.modelValue, '手输值必须保留').toBe('zzz');
    expect(entered.length, '无候选 Enter 必须透发 enter').toBe(1);
    await flushLeave();
    expect(pop(), 'Enter 后收面板').toBeNull();
  });

  it('⑦ Enter 选中回填：键盘流全程（_sea → ↓Enter 进段二 → ↓Enter 选 bond_index）', async () => {
    const { host, state } = await mountInput();
    await type(host, '_sea');
    await key(host, 'ArrowDown');
    await key(host, 'Enter');
    await key(host, 'ArrowDown'); /* 段二 cursor 1 = bond_index */
    await key(host, 'Enter');
    expect(state.modelValue).toBe('/bond_index/_search');
    await flushLeave();
    expect(pop()).toBeNull();
  });

  it('段回退：段二打开时继续输入 → 回段一按新输入过滤端点目录', async () => {
    const { host, state } = await mountInput();
    await type(host, '_sea');
    await key(host, 'ArrowDown');
    await key(host, 'Enter'); /* 进段二 */
    expect(slotNames().length).toBe(2);
    await type(host, '_cat/ind');
    expect(state.modelValue).toBe('_cat/ind');
    expect(epPaths(), '输入后回段一按新输入过滤').toEqual(['/_cat/indices']);
    expect(slotNames(), '段二索引清单必须消失').toEqual([]);
    expect(stageBar(), '回段一后段指示行必须消失').toBeNull();
    /* 回段一后正常选择无槽位端点 */
    await key(host, 'Enter');
    expect(state.modelValue).toBe('/_cat/indices');
  });

  it('空索引集群：段二出 hint 零降级；Enter 收层保留手输并透发 enter（回段一）', async () => {
    const { host, state, entered } = await mountInput({ indices: [] });
    await type(host, '_sea');
    await key(host, 'ArrowDown');
    await key(host, 'Enter'); /* 进段二（无索引） */
    expect(pop(), '段二弹层保持打开').toBeTruthy();
    expect(items().length, '空集群零索引项').toBe(0);
    const hint = pop()!.querySelector('.epi-hint');
    expect(hint, '空集群必须出 hint 行').toBeTruthy();
    expect(hint!.textContent).toContain('暂无索引');
    expect(stageBar(), '段指示行仍在（上下文不丢）').toBeTruthy();
    await key(host, 'Enter');
    expect(state.modelValue, '手输值必须保留').toBe('_sea');
    expect(entered.length, '段二无候选 Enter 必须透发 enter').toBe(1);
    await flushLeave();
    expect(pop(), 'Enter 后收面板').toBeNull();
    /* enter 透发后回段一：↓ 重开出端点目录 */
    await key(host, 'ArrowDown');
    expect(epPaths().length).toBeGreaterThan(0);
    expect(slotNames()).toEqual([]);
  });

  it('to=false 就地模式：弹层渲染在组件根子树内，双段切换照常', async () => {
    const { host, state } = await mountInput({ to: false });
    await type(host, '_sea');
    const popEl = host.querySelector<HTMLElement>('.epi-pop');
    expect(popEl, '弹层必须在组件根子树内').toBeTruthy();
    expect(popEl!.getAttribute('style') ?? '', '就地模式跳过 place()，popStyle 为空对象').toBe('');
    expect(Array.from(document.body.children).some(el => el.classList.contains('epi-pop')),
      'body 直子不许新增弹层').toBe(false);
    await key(host, 'ArrowDown');
    await key(host, 'Enter');
    expect(host.querySelectorAll('.epi-item .epi-idx').length, '就地模式段二照常').toBe(2);
    await key(host, 'Enter');
    expect(state.modelValue).toBe('/logs-2026.08/_search');
  });

  it('enter 透发：面板关 Enter → emit enter（宿主接回执行快捷键）', async () => {
    const { host, entered } = await mountInput();
    await key(host, 'Enter');
    expect(entered.length, '面板关 Enter 必须透发').toBe(1);
  });

  it('onDocDown 段回退：段二打开时外部点击 → 关层回段一（↓ 重开出端点目录而非索引清单）', async () => {
    const { host } = await mountInput();
    await type(host, '_sea');
    await key(host, 'ArrowDown');
    await key(host, 'Enter'); /* 进段二 */
    expect(slotNames()).toEqual(['logs-2026.08', 'bond_index']);
    /* document 层 onDocDown：target 在 rootEl 外 → 关层（T10 评审固化：关层必须回段一） */
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    /* 先 settle 让 open=false 渲染与 leave 起步落定，再 flushLeave 等离场帧（同 settingsCatalog.spec 时序） */
    await settle();
    await flushLeave();
    expect(pop(), '外部点击必须关层').toBeNull();
    await key(host, 'ArrowDown');
    expect(pop(), '↓ 必须重开弹层').toBeTruthy();
    expect(epPaths().length, '重开必须回段一端点目录').toBeGreaterThan(0);
    expect(slotNames(), '不许滞留段二索引清单').toEqual([]);
    expect(stageBar(), '回段一后段指示行必须消失').toBeNull();
  });
});
