/**
 * 五百六十一批：DevTools 响应查看档三态（json/plaintext 双态扩「表格」档）行为锁。
 *  挂载范式同 devtoolsLint532.spec（api.raw mock + Monaco stub 捕获；空态 quickRun 按钮触发执行，
 *  绕开 admin 运行钮门控——run() 本体无角色门，permGating 只藏按钮）：
 *  ① seg 只在 respLang=json 出（非 JSON 响应零 seg，plaintext 双态保持）；
 *  ② 顶层数组→行序表（列=各行键并集首现序，_cat/* 结构化响应主场景；行点击复制该行 JSON）；
 *  ③ 对象→键值两列表（行点击复制 {k:v}）；
 *  ④ 三态往返：表格态响应 Monaco 整体让位（v-if 不渲染=高度链零触），切回 JSON 档编辑器原样回归。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
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
      /* 防御性 stub 挡真实 fetch 噪音（store.loadIndices / useIndexFields 链路） */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
    },
  };
});

const monacoCaps: { props: any }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'dslAssist', 'readonly'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any) { monacoCaps.push({ props }); return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

import DevToolsView from '../views/DevToolsView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountView() {
  location.hash = '#/devtools';
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
  const app = createApp({ render: () => h(DevToolsView as any) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, pinia };
}

const btn = (host: ParentNode, text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(text))!;
const segBtn = (host: ParentNode, text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('.dt-resp-seg button')].find(b => b.textContent?.trim() === text)!;
const stubCount = (host: ParentNode) => host.querySelectorAll('.monaco-stub').length;

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  rawFn.mockReset();
  monacoCaps.length = 0;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
});

describe('561 DevTools 响应表格查看档', () => {
  it('顶层数组→行序表：列并集首现序 + 行序号；行点击复制该行 JSON；表格态响应 Monaco 让位', async () => {
    rawFn.mockResolvedValue({ status: 200, body: JSON.stringify([
      { _index: 'orders', status: 'green', docs: 100 },
      { _index: 'users', status: 'yellow', docs: 5 },
    ]) });
    const { host } = await mountView();
    expect(host.querySelector('.dt-resp-seg'), '空态无响应不出 seg').toBeNull();
    btn(host, '列出索引')!.click();
    await settle();
    expect(stubCount(host), '执行后 body+响应两只 Monaco 在场').toBe(2);
    expect(host.querySelector('.dt-resp-seg'), 'json 响应出查看档 seg').toBeTruthy();
    segBtn(host, '表格')!.click();
    await settle();
    const tbl = host.querySelector('.dt-resp-tbl');
    expect(tbl, '表格态替换显示区').toBeTruthy();
    expect(stubCount(host), '响应 Monaco 整体让位（不渲染=高度链零触）').toBe(1);
    const headText = tbl!.querySelector('thead')!.textContent ?? '';
    expect(headText).toContain('_index');
    expect(headText).toContain('status');
    expect(headText).toContain('docs');
    const trs = tbl!.querySelectorAll('tbody tr');
    expect(trs.length, '行序=响应数组行序').toBe(2);
    expect(trs[0]!.textContent).toContain('orders');
    expect(trs[0]!.textContent).toContain('green');
    expect(trs[1]!.textContent).toContain('users');
    (trs[0] as HTMLElement).click();
    await settle();
    expect(navigator.clipboard.writeText, '行点击复制该行 JSON（行对象原文）')
      .toHaveBeenCalledWith('{"_index":"orders","status":"green","docs":100}');
  });

  it('对象→键值两列表；行点击复制 {k:v}；切回 JSON 档编辑器原样回归', async () => {
    rawFn.mockResolvedValue({ status: 200, body: JSON.stringify({ cluster_name: 'es-prod', status: 'green' }) });
    const { host } = await mountView();
    btn(host, '试试：集群健康')!.click();
    await settle();
    segBtn(host, '表格')!.click();
    await settle();
    const tbl = host.querySelector('.dt-resp-tbl');
    expect(tbl, '对象响应出键值两列表').toBeTruthy();
    const trs = tbl!.querySelectorAll('tbody tr');
    expect(trs.length).toBe(2);
    expect(trs[0]!.textContent).toContain('cluster_name');
    expect(trs[0]!.textContent).toContain('es-prod');
    (trs[1] as HTMLElement).click();
    await settle();
    expect(navigator.clipboard.writeText, '键值行复制单键对象').toHaveBeenCalledWith('{"status":"green"}');
    segBtn(host, 'JSON')!.click();
    await settle();
    expect(host.querySelector('.dt-resp-tbl')).toBeNull();
    expect(stubCount(host), '切回原文档：响应 Monaco 回归（高度结构原样）').toBe(2);
  });

  it('非 JSON 响应不出 seg（plaintext 双态保持），明文仍走只读 Monaco', async () => {
    rawFn.mockResolvedValue({ status: 200, body: 'boom not json' });
    const { host } = await mountView();
    btn(host, '试试：集群健康')!.click();
    await settle();
    expect(host.querySelector('.dt-resp-seg')).toBeNull();
    expect(host.querySelector('.dt-resp-tbl')).toBeNull();
    expect(stubCount(host), '明文仍由只读 Monaco 承接').toBe(2);
  });
});
