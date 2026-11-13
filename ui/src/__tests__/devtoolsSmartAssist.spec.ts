/**
 * W3 Task 11：DevToolsView / RestView 渗透 EndpointPathInput——端点补全 + method 联动 + body 骨架。
 *
 * 硬契约（计划 Step 1）：
 *   ① DevTools path 输入 _sea 出目录、选中回填（v-model cur.path）；
 *   ② 选中端点后 method 按端点 methods 联动（不在集合内置灰提示；未选端点=全可用；
 *      当前 method 不在 ep.methods 自动纠正为 ep.methods[0]；自由文本路径脱钩回全可用）；
 *   ③ 「插入 body 骨架」按钮（端点带 body 时出现）→ body 填入 snippet（直接覆盖，
 *      对齐既有格式化/清空的无确认交互）；
 *   ④ RestView 同路径渗透回归：Enter 选中回填，面板关 Enter 透发执行（裸 Enter 语义保留）；
 *   ⑥ T10 评审固化：弹层开着 Ctrl+Enter 先 choose 回填再冒泡触发宿主 run（选中即执行）；
 *   ⑦ tab 切换 v-model 跟随 tab 数据（EndpointPathInput 受控，父写 modelValue 输入框跟新）。
 *   W6（body 改用 Monaco + 端点语义补全）：
 *   ⑧ DevToolsView body 区 textarea 消失、MonacoEditor stub 在位且收到 dslAssist（fields/bodyKind 均函数）；
 *   ⑨ DevToolsView bodyKind 随端点派生——_settings→settings、_bulk→none、自由路径→search；
 *   ⑩ format/minify/insertBody/清空按钮改用后仍操作 cur.body（经 stub modelValue/emit 断言）；
 *   ⑪ RestView MonacoEditor 收到 dslAssist 且 bodyKind 随 path 派生（/_settings→settings）。
 *   （W6 改用后既有 ③ 的 .dt-body-area 断言迁移至 stub modelValue——textarea 形态本身即被替换对象。）
 *   W6-T3（响应阅读升级 + curl 导入）：
 *   ⑫ 响应区裸 pre 改用只读 Monaco（:model-value 单向），language 按内容侦测（合法 JSON→json / 非 JSON→plaintext）；
 *   ⑬ 「复制响应」按钮调 copyText(cur.result)（navigator.clipboard.writeText spy 等效断言）；
 *   ⑭ curl 导入弹层（NModal Teleport body，查 document.body——探针实证 naive 2.43.2 NModal 不支持
 *      :to=false）：合法 curl 回填 method/path/body 并关弹层；非法文本 notify warning 且三字段不动。
 *
 * mount 范式同 devxThreeState.spec.ts：手工 createApp+h+createPinia+memory router，
 * 只 mock ../api 出口（raw 用 vi.fn 惰性包装防 TDZ）；Monaco stub 捕获 props/emit（W6 渗透断言用）。
 * 弹层默认 Teleport 到 body：统一查 document.body。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import type { Pinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const rawFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      raw: (...args: any[]) => rawFn(...args),
      devtoolsExecute: (...args: any[]) => rawFn(...args),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* 防御性 stub 挡真实 fetch 噪音（store.loadIndices 链路） */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      /* W6：DevTools/Rest body 接 useIndexFields——堵 mappingDetail 出口（防御性 stub） */
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
    },
  };
});

/* W6：Monaco stub 捕获——setup 收 props/emit 入档（现调现读响应式 props），
   渗透断言 dslAssist 传递与 v-model 链路，不断言编辑器行为（同 T14 渗透范式）。
   monacoCaps 只在 setup 闭包内迟引用（mount 时执行），无 TDZ。 */
const monacoCaps: { props: any; emit: (e: string, v?: any) => void }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    /* W6-T3：响应区只读 Monaco 渗透——补 readonly 捕获（语言侦测/只读断言用） */
    props: ['modelValue', 'language', 'height', 'dslAssist', 'readonly'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { monacoCaps.push({ props, emit }); return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));
/* body 编辑器捕获（DevTools/Rest 每视图恰 1 枚 Monaco） */
const lastCap = () => monacoCaps[monacoCaps.length - 1];

import DevToolsView from '../views/DevToolsView.vue';
import RestView from '../views/RestView.vue';
import { useAppStore } from '../stores/app';

const RAW_OK = { status: 200, body: '{"ok":true}' };

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountView(comp: any, hash = '#/') {
  location.hash = hash;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/update-by-query', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(comp) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, pinia };
}

function findBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes(text));
}

/* EndpointPathInput 弹层 Teleport 在 body 下，统一查 document.body */
const pop = () => document.body.querySelector('.epi-pop');
/* 五百七十七批同步更新：563 批低频动作收「更多动作」⋯菜单（铁律 C）——n-popover 内容
   teleport 到 body 且 :show 受控（关态不渲染，566-C2 形态），菜单项断言一律先开菜单
   再查 document.body；菜单项点击自带 moreOpen=false 关层，下一步操作前再开（幂等） */
const moreBtn = (host: ParentNode) => host.querySelector<HTMLButtonElement>('button[aria-label="更多动作"]');
async function openMore(host: ParentNode) {
  if (moreBtn(host)?.getAttribute('aria-expanded') !== 'true') {
    moreBtn(host)!.click();
    await settle(3);
  }
}
const findMenuItem = (text: string) =>
  Array.from(document.body.querySelectorAll<HTMLButtonElement>('.dt-more-item'))
    .find(b => b.textContent?.includes(text));
const epPaths = () => Array.from(document.body.querySelectorAll('.epi-item .epi-p')).map(el => el.textContent);
/* W3-T11 渗透后 .dt-path/.rt-path 落在组件根 div 上，真实输入框是内层 .epi-inp */
const dtInp = (host: ParentNode) => host.querySelector<HTMLInputElement>('.dt-path .epi-inp')!;
const rtInp = (host: ParentNode) => host.querySelector<HTMLInputElement>('.rt-path .epi-inp')!;

async function type(el: HTMLInputElement, v: string) {
  el.value = v;
  el.dispatchEvent(new Event('input'));
  await settle();
}
async function key(el: HTMLInputElement, k: string, init: KeyboardEventInit = {}) {
  /* bubbles:true——宿主 @keydown.ctrl.enter 经 attrs 落在组件根 div，靠冒泡可达 */
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
  await settle();
}
async function flushLeave() {
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
  await settle(3);
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  rawFn.mockReset().mockResolvedValue(RAW_OK);
  monacoCaps.length = 0;
});

afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
});

describe('W3-T11 DevToolsView 智能补全渗透', () => {
  it('① path 输入 _sea 出端点目录，Enter 选中回填 cur.path', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    const inp = dtInp(host);
    expect(inp, 'dt-path 必须已渗透为 EndpointPathInput').toBeTruthy();
    expect(inp.value, 'tab A 默认路径保留').toBe('/_cluster/health');
    await type(inp, '_sea');
    expect(pop(), '输入必须出端点目录弹层').toBeTruthy();
    expect(epPaths()).toContain('/{index}/_search');
    expect(epPaths()[0], '无槽位 /_search 同 rank 字典序在前').toBe('/_search');
    await key(inp, 'Enter');
    expect(inp.value, '选中必须回填 v-model（cur.path）').toBe('/_search');
    await flushLeave();
    expect(pop(), '回填后弹层必须关闭').toBeNull();
  });

  it('② method 联动：选中端点置灰+自动纠正；未选端点/自由文本全可用', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    const sel = () => host.querySelector<HTMLSelectElement>('.dt-method')!;
    const optDisabled = (m: string) =>
      Array.from(sel().querySelectorAll<HTMLOptionElement>('option')).find(o => o.value === m)!.disabled;
    /* 未选端点（curEp=null）：全可用 */
    for (const m of ['GET', 'POST', 'PUT', 'DELETE', 'HEAD']) expect(optDisabled(m), `未选端点 ${m}`).toBe(false);
    /* 选 /_reindex（methods=[POST]）：当前 GET 不在集合 → 自动纠正 POST + GET 置灰 */
    const inp = dtInp(host);
    await type(inp, '_reindex');
    await key(inp, 'Enter');
    expect(inp.value).toBe('/_reindex');
    expect(sel().value, '当前 method 不在 ep.methods 必须自动纠正为 methods[0]').toBe('POST');
    expect(optDisabled('GET'), 'GET 不在端点 methods 内必须置灰').toBe(true);
    expect(optDisabled('PUT')).toBe(true);
    expect(optDisabled('POST'), 'POST 在集合内可用').toBe(false);
    /* 自由文本路径（不匹配任何端点模板）：联动脱钩，全可用（零降级） */
    await type(inp, '/_reindexX');
    for (const m of ['GET', 'POST', 'PUT', 'DELETE', 'HEAD']) expect(optDisabled(m), `自由文本 ${m}`).toBe(false);
  });

  it('③ 端点带 body 出「插入 body 骨架」→ 点击填入 snippet；未选端点不出按钮（577 同步更新 ⋯ 菜单形态）', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    /* 563 批骨架钮收进 ⋯ 菜单——开菜单后断言不在场（关态不渲染=恒真，570-C2 教训：开层断言才有效） */
    await openMore(host);
    expect(findMenuItem('插入 body 骨架'), '未选端点（curEp=null）不出骨架菜单项').toBeUndefined();
    const inp = dtInp(host);
    await type(inp, '_sea');
    await key(inp, 'Enter'); /* /_search 带 body snippet */
    await openMore(host);
    const btn = findMenuItem('插入 body 骨架');
    expect(btn, '端点带 body 必须出骨架菜单项').toBeTruthy();
    btn!.click(); /* 菜单项自带 moreOpen=false 关层 */
    await settle(3);
    /* W6：body 区已换 Monaco——stub modelValue 即 cur.body（v-model 入向） */
    expect(lastCap(), 'body Monaco 必须已挂载').toBeTruthy();
    expect(lastCap().props.modelValue, 'body 必须填入端点 snippet').toContain('"query"');
    expect(lastCap().props.modelValue).toContain('match_all');
  });

  it('⑥ Ctrl+Enter「选中即执行」固化：弹层开着 Ctrl+Enter 先 choose 回填再冒泡触发 run', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    const inp = dtInp(host);
    await type(inp, '_sea');
    expect(pop(), '弹层必须开着').toBeTruthy();
    /* keydown 不 stopPropagation：组件 onKey 先 choose（cursor 0=/_search，含 body 端点），
       事件冒泡到根 div 触发宿主 @keydown.ctrl.enter=run */
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    await settle();
    expect(inp.value, 'Ctrl+Enter 必须先完成 choose 回填').toBe('/_search');
    expect(rawFn, '冒泡必须触发宿主 run').toHaveBeenCalledTimes(1);
    expect(rawFn.mock.calls[0][0]).toBe('GET');
    expect(rawFn.mock.calls[0][1]).toBe('/_search');
  });

  it('⑦ tab 切换 v-model 跟随 tab 数据（受控组件父写 modelValue 响应）', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    expect(dtInp(host).value, 'tab A 默认路径').toBe('/_cluster/health');
    host.querySelectorAll<HTMLElement>('.dt-tab')[1].click();
    await settle(3);
    expect(dtInp(host).value, '切 tab B 输入框必须跟随 tab B path').toBe('/_cat/indices?v&format=json');
    host.querySelectorAll<HTMLElement>('.dt-tab')[0].click();
    await settle(3);
    expect(dtInp(host).value, '切回 tab A 输入框必须跟随回来').toBe('/_cluster/health');
  });
});

describe('W3-T11 RestView 智能补全渗透', () => {
  it('④ 同构渗透：_sea 出目录 → Enter 回填 path；面板关 Enter 透发执行（裸 Enter 语义保留）', async () => {
    const { host } = await mountView(RestView, '#/rest');
    const inp = rtInp(host);
    expect(inp, 'rt-path 必须已渗透为 EndpointPathInput').toBeTruthy();
    await type(inp, '_sea');
    expect(pop(), '输入必须出端点目录弹层').toBeTruthy();
    /* 有候选 Enter = 选择回填，不执行 */
    await key(inp, 'Enter');
    expect(inp.value, '选中必须回填 v-model（path 草稿）').toBe('/_search');
    expect(rawFn, '有候选 Enter 只回填不执行').not.toHaveBeenCalled();
    await flushLeave();
    /* 面板关 Enter → enter 透发 → send（裸 Enter 执行语义保留） */
    await key(inp, 'Enter');
    expect(rawFn, '面板关 Enter 必须触发发送').toHaveBeenCalledTimes(1);
    expect(rawFn.mock.calls[0][0]).toBe('GET');
    expect(rawFn.mock.calls[0][1]).toBe('/_search');
  });

  it('⑤ method 按钮联动 + body 骨架：选 /_reindex → GET 置灰带提示+自动 POST；骨架填入随发送带出', async () => {
    const { host } = await mountView(RestView, '#/rest');
    const mBtn = (m: string) => host.querySelector<HTMLButtonElement>(`button[data-m="${m}"]`)!;
    /* 未选端点：全可用 */
    for (const m of ['GET', 'POST', 'PUT', 'DELETE', 'HEAD']) expect(mBtn(m).disabled, `未选端点 ${m}`).toBe(false);
    const inp = rtInp(host);
    await type(inp, '_reindex');
    await key(inp, 'Enter');
    expect(inp.value).toBe('/_reindex');
    expect(mBtn('GET').disabled, 'GET 不在 [POST] 必须置灰').toBe(true);
    expect(mBtn('GET').title, '置灰必须带可用方法提示').toContain('POST');
    expect(mBtn('POST').disabled).toBe(false);
    expect(mBtn('POST').classList.contains('on'), '当前 method 必须自动纠正为 POST').toBe(true);
    const btn = findBtn(host, '插入 body 骨架');
    expect(btn, '端点带 body 必须出骨架按钮').toBeTruthy();
    btn!.click();
    await settle(3);
    findBtn(host, '发送')!.click();
    await settle();
    expect(rawFn, '发送必须带出骨架 body').toHaveBeenCalledTimes(1);
    expect(rawFn.mock.calls[0][0]).toBe('POST');
    expect(rawFn.mock.calls[0][1]).toBe('/_reindex');
    expect(rawFn.mock.calls[0][2]).toContain('"source"');
  });

  it('⑤b 骨架按钮与 body 区同口径（T11 复审 M1）：GET 选 /_search 不出按钮，切 POST 出现', async () => {
    const { host } = await mountView(RestView, '#/rest');
    const inp = rtInp(host);
    await type(inp, '_sea');
    await key(inp, 'Enter'); /* /_search：methods=[GET,POST]，当前 GET 在集合内不纠正 */
    expect(inp.value).toBe('/_search');
    expect(host.querySelector('button[data-m="GET"]')!.classList.contains('on'), 'GET 在端点 methods 内不纠正').toBe(true);
    /* M1：GET 下 body 编辑区隐藏且发送不带 body——骨架按钮必须同口径隐藏（修复前 v-if=curEp?.body 误出） */
    expect(host.querySelector('.rt-body-wrap'), 'GET 下 body 编辑区隐藏').toBeNull();
    expect(findBtn(host, '插入 body 骨架'), 'GET（无 body 区）下骨架按钮必须同隐').toBeUndefined();
    /* 切 POST：body 区出现，骨架按钮随 hasBody 出现，填入后随发送带出 */
    host.querySelector<HTMLButtonElement>('button[data-m="POST"]')!.click();
    await settle(3);
    expect(host.querySelector('.rt-body-wrap'), 'POST 下 body 编辑区出现').toBeTruthy();
    const btn = findBtn(host, '插入 body 骨架');
    expect(btn, 'POST（有 body 区）下骨架按钮必须出现').toBeTruthy();
    btn!.click();
    await settle(3);
    findBtn(host, '发送')!.click();
    await settle();
    expect(rawFn, 'POST 发送必须带出骨架 body').toHaveBeenCalledTimes(1);
    expect(rawFn.mock.calls[0][0]).toBe('POST');
    expect(rawFn.mock.calls[0][1]).toBe('/_search');
    expect(rawFn.mock.calls[0][2]).toContain('match_all');
  });
});

describe('W6 DevTools/Rest body 智能渗透', () => {
  it('⑧ DevToolsView：body 区 textarea 消失、MonacoEditor stub 在位且收到 dslAssist', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    expect(host.querySelector('textarea.dt-body-area'), 'body textarea 必须已改用').toBeNull();
    expect(host.querySelector('.monaco-stub'), 'body MonacoEditor stub 必须在位').toBeTruthy();
    const cap = lastCap();
    expect(cap, 'body Monaco 必须捕获 props').toBeTruthy();
    const da = cap.props.dslAssist;
    expect(da, 'body Monaco 必须收到 dslAssist').toBeTruthy();
    expect(typeof da.fields, 'dslAssist.fields 必须是函数').toBe('function');
    expect(typeof da.bodyKind, 'dslAssist.bodyKind 必须是函数').toBe('function');
  });

  it('⑨ DevToolsView：bodyKind 随端点派生——_settings→settings、_bulk→none、自由路径→search', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    const inp = dtInp(host);
    /* 默认 tab A '/_cluster/health'：无特殊段 → search（未选端点走裸 path 判定） */
    expect(lastCap().props.dslAssist.bodyKind(), '自由路径默认 search 档').toBe('search');
    /* 含 {index} 槽位端点：段一 choose 只发 endpoint（pickedEp 记录）不回填（切段二索引清单）；
       手输完整匹配路径后 epMatch 成立 → curEp=该端点 → bodyKind 吃模板 path（探针实证） */
    await type(inp, '_settings');
    await key(inp, 'Enter');
    await type(inp, '/idx-a/_settings');
    expect(lastCap().props.dslAssist.bodyKind(), '_settings 端点必须 settings 档').toBe('settings');
    await type(inp, '_bulk');
    await key(inp, 'Enter');
    await type(inp, '/idx-a/_bulk');
    expect(lastCap().props.dslAssist.bodyKind(), '_bulk 端点 1439 起为 bulk-body（动作行补全）').toBe('bulk-body');
    /* 自由文本脱钩（epMatch 不上 → curEp=null，按裸 path 判定，无特殊段回 search） */
    await type(inp, '/_custom/thing');
    expect(lastCap().props.dslAssist.bodyKind(), '自由文本必须回 search 档').toBe('search');
  });

  it('⑩ DevToolsView：format/minify/insertBody/清空按钮改用后仍操作 cur.body（577 同步更新 ⋯ 菜单路径）', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    /* 种子合法 JSON body——经 stub v-model emit 通道写入（等价真实编辑器键入） */
    lastCap().emit('update:modelValue', '{"a":1,"b":[1,2]}');
    await settle(3);
    /* 格式化=常驻工具行钮（563 合并后唯一留在 ⋯ 菜单外的 body 操作钮） */
    findBtn(host, '格式化')!.click();
    await settle(3);
    expect(lastCap().props.modelValue, '格式化必须含换行缩进').toContain('\n');
    expect(lastCap().props.modelValue).toContain('  "a": 1');
    /* 压缩/骨架/清空在 ⋯ 菜单内（菜单项点击自动关层，逐次重开） */
    await openMore(host);
    findMenuItem('压缩')!.click();
    await settle(3);
    expect(lastCap().props.modelValue, '压缩必须单行').toBe('{"a":1,"b":[1,2]}');
    /* 选带 body 端点插骨架覆盖（/_search 带 match_all snippet） */
    const inp = dtInp(host);
    await type(inp, '_sea');
    await key(inp, 'Enter');
    await openMore(host);
    findMenuItem('插入 body 骨架')!.click();
    await settle(3);
    expect(lastCap().props.modelValue, '骨架必须覆盖现有 body').toContain('match_all');
    await openMore(host);
    findMenuItem('清空')!.click();
    await settle(3);
    expect(lastCap().props.modelValue, '清空必须归零').toBe('');
  });

  it('⑪ RestView：MonacoEditor 收到 dslAssist 且 bodyKind 随 path 派生', async () => {
    const { host } = await mountView(RestView, '#/rest');
    /* GET 下 body 区隐藏（T11 复审 M1 口径）——切 POST 出编辑区 */
    host.querySelector<HTMLButtonElement>('button[data-m="POST"]')!.click();
    await settle(3);
    expect(host.querySelector('.rt-body-wrap .monaco-stub'), 'POST 下 body Monaco 必须在位').toBeTruthy();
    const da = lastCap().props.dslAssist;
    expect(da, 'RestView body Monaco 必须收到 dslAssist').toBeTruthy();
    expect(typeof da.fields, 'dslAssist.fields 必须是函数').toBe('function');
    expect(typeof da.bodyKind, 'dslAssist.bodyKind 必须是函数').toBe('function');
    /* 自由文本 path 派生（未 Enter 选端点，curEp=null，按裸 path 判定） */
    const inp = rtInp(host);
    await type(inp, '/{index}/_settings');
    expect(lastCap().props.dslAssist.bodyKind(), '_settings 路径必须 settings 档').toBe('settings');
    await type(inp, '/_search');
    expect(lastCap().props.dslAssist.bodyKind(), '搜索路径必须 search 档').toBe('search');
  });
});

describe('W6-T3 响应阅读与 curl 导入', () => {
  /* body/response 两枚 Monaco 按 dslAssist+readonly 区分：body 有 assist 可写；
     525 批同步更新——响应面也挂 dtRespAssist（只读白得通道）但 readonly=true，据此判别。
     响应枚随 v-if 重挂（重跑 result=null 卸载 → 新值重挂新捕获），取最后一枚只读捕获 */
  const bodyCap = () => monacoCaps.find(c => c.props.dslAssist && !c.props.readonly);
  const respCap = () => { const l = monacoCaps.filter(c => c.props.readonly); return l[l.length - 1]; };

  it('⑫ 响应区 MonacoEditor 只读 stub 在位且 language 按内容侦测', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    findBtn(host, '执行')!.click();
    await settle();
    expect(host.querySelector('pre.dt-out-pre'), '响应区裸 pre 必须已改用 Monaco').toBeNull();
    const rc = respCap();
    expect(rc, 'run 成功后响应 Monaco 必须已挂载').toBeTruthy();
    expect(rc.props.readonly, '响应 Monaco 必须只读（:model-value 单向不回写）').toBe(true);
    expect(rc.props.language, '合法 JSON 响应必须 json 着色').toBe('json');
    /* v3.0.1 语义分档:信封解包——Monaco 呈纯 body(状态码走 HTTP 徽标),不再整包糊面板 */
    expect(rc.props.modelValue).toBe(JSON.stringify(JSON.parse('{"ok":true}'), null, 2));
    /* 非 JSON 响应 → plaintext */
    rawFn.mockResolvedValue('plain text, not json');
    findBtn(host, '执行')!.click();
    await settle();
    expect(respCap().props.language, '非 JSON 响应必须落 plaintext').toBe('plaintext');
    expect(respCap().props.modelValue).toBe('plain text, not json');
  });

  it('⑬ 复制响应按钮调 copyText(cur.result)（577 同步更新：563 改常驻图标钮 aria-label 形态）', async () => {
    const clipSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const { host } = await mountView(DevToolsView, '#/devtools');
    /* 563 批空态行结构恒定约定：复制响应钮常驻不消失，无数据 disabled（纯图标+aria-label） */
    const copyBtn = () => host.querySelector<HTMLButtonElement>('button[aria-label="复制响应"]');
    expect(copyBtn(), '复制响应钮常驻在位').toBeTruthy();
    expect(copyBtn()!.disabled, '无响应时必须 disabled 而非消失').toBe(true);
    findBtn(host, '执行')!.click();
    await settle();
    expect(copyBtn()!.disabled, '有响应时必须可用').toBe(false);
    copyBtn()!.click();
    await settle(3);
    /* v3.0.1:信封解包后复制纯 body 全文(HTTP 徽标另行承载状态)；截断场景 resultFull 优先（小响应等值） */
    expect(clipSpy, 'copyText 必须带 body 全文').toHaveBeenCalledWith(JSON.stringify(JSON.parse('{"ok":true}'), null, 2));
    clipSpy.mockRestore();
  });

  it('⑭ curl 导入：合法回填 method/path/body；非法 notify warning 且三字段不动', async () => {
    const { host, pinia } = await mountView(DevToolsView, '#/devtools');
    const store = useAppStore(pinia as Pinia);
    const notifySpy = vi.spyOn(store, 'notify');
    /* 探针实证：naive 2.43.2 NModal 不支持 :to=false（Invalid Teleport target 内容不渲染）——
       默认 Teleport 至 body，与 epi-pop 同范式统一查 document.body */
    const modal = () => document.body.querySelector('.n-modal');
    /* 合法 curl：回填三字段 + 关弹层 */
    findBtn(host, '从 curl 导入')!.click();
    await settle(3);
    const ta = modal()?.querySelector<HTMLTextAreaElement>('textarea');
    expect(ta, '导入弹层必须渲染出文本框（Teleport body）').toBeTruthy();
    ta!.value = `curl -X PUT 'http://es:9200/my-index' -d '{"settings":{"number_of_shards":1}}'`;
    ta!.dispatchEvent(new Event('input'));
    await settle(3);
    findBtn(modal()!, '导入')!.click();
    await settle(3);
    expect(host.querySelector<HTMLSelectElement>('.dt-method')!.value, 'method 必须回填').toBe('PUT');
    expect(dtInp(host).value, 'path 必须回填').toBe('/my-index');
    expect(bodyCap()?.props.modelValue, 'body 必须回填').toBe('{"settings":{"number_of_shards":1}}');
    /* naive fade-in-scale-up leave 走真实 CSS 时长（happy-dom 不发 transitionend，
       Vue 回退 setTimeout ~300ms+）——vi.waitFor 真定时器轮询收层 */
    await vi.waitFor(() => { expect(modal(), '导入成功后弹层必须关闭').toBeNull(); }, { timeout: 2000 });
    /* 非法 curl：warning 提示 + 三字段不动 */
    findBtn(host, '从 curl 导入')!.click();
    await settle(3);
    const ta2 = modal()?.querySelector<HTMLTextAreaElement>('textarea');
    expect(ta2, '重开弹层必须再出文本框').toBeTruthy();
    ta2!.value = 'GET /_search';
    ta2!.dispatchEvent(new Event('input'));
    await settle(3);
    findBtn(modal()!, '导入')!.click();
    await settle(3);
    expect(notifySpy.mock.calls.some(c => c[0] === 'warning'), '非法 curl 必须 notify warning').toBe(true);
    expect(host.querySelector<HTMLSelectElement>('.dt-method')!.value, '非法导入不动 method').toBe('PUT');
    expect(dtInp(host).value, '非法导入不动 path').toBe('/my-index');
    expect(bodyCap()?.props.modelValue, '非法导入不动 body').toBe('{"settings":{"number_of_shards":1}}');
    notifySpy.mockRestore();
  });
});
