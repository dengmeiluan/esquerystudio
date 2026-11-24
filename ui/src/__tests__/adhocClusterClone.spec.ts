/* 「从集群复刻」审编步入口看守。
 *
 * 交互：审编步「粘贴导入」旁提供「从集群复刻」——选连接中心已存档案 + 手输源索引，
 * 调既有 /internal/es/xmigrate/fetch-config（api.xb.fetchConfig，connId 走服务端取密），
 * 返回 settings/mapping 拆填审编框。settings 为白名单精选 + 插件组件名还原，
 * 从源头绕开手动拷贝 GET 原文的系统键/null/插件脱敏三类坑。
 * 行为走真挂载（adhocProgressUi565 同款基建：api mock + Monaco stub）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchConfig: vi.fn(),
  connectCheck: vi.fn(),
  adhocJobs: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      keys: async () => [],
      clustersList: async () => [],
      clusterIndices: async () => [],
      overview: async () => ({}),
      clusterHealth: async () => ({}),
      adhoc: { ...orig.api.adhoc, jobs: mocks.adhocJobs },
      xb: { ...orig.api.xb, fetchConfig: mocks.fetchConfig, connectCheck: mocks.connectCheck },
    },
  };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useAppStore } from '../stores/app';
import AdhocRebuildView from '../views/AdhocRebuildView.vue';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const settle = async (n = 12) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const STEP_KEY = 'esquerystudio.draft2:adhoc:host:-:-:step';
const SETTINGS_KEY = 'esquerystudio.draft2:adhoc:host:-:-:settings';

async function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp({ render: () => h(AdhocRebuildView) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, store: useAppStore(pinia) };
}

const FETCHED = {
  settings: '{"index":{"number_of_shards":"5","analysis":{"analyzer":{"a":{"tokenizer":"keyword"}}}}}',
  mapping: '{"properties":{"title":{"type":"text"}}}',
};

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem(STEP_KEY, '1');
  mocks.fetchConfig.mockReset();
  mocks.connectCheck.mockReset();
  mocks.adhocJobs.mockReset();
  mocks.adhocJobs.mockResolvedValue([]);
  /* 打开弹窗即按当前档案拉源集群索引清单（快速点选，不再手输名字） */
  mocks.connectCheck.mockResolvedValue([
    { index: 'onshore-bond-basic', health: 'green', 'docs.count': '1200' },
    { index: 'stock-daily', health: 'green', 'docs.count': '99000' },
  ]);
});

describe('「从集群复刻」审编步入口', () => {
  it('行为：选已存档案+索引 → fetch-config 拆填审编框，tokenizer 值原样落草稿（不被掩埋）', async () => {
    mocks.fetchConfig.mockResolvedValue({ ...FETCHED });
    const { app, host, store } = await mountView();
    store.conns = [{ id: 'conn-prod', name: '生产', host: 'es-prod.internal', port: 9200 }] as any;
    await settle();

    (host.querySelector('[data-test="ar-clone-open"]') as HTMLButtonElement).click();
    await settle();
    /* n-modal 内容 teleport 到 body，不在视图容器内——弹窗内查询走全局 */
    const idxInput = document.querySelector('[data-test="ar-clone-index"]') as HTMLInputElement;
    expect(idxInput, '复刻弹窗索引输入框必须渲染').toBeTruthy();
    idxInput.value = 'onshore-bond-basic';
    idxInput.dispatchEvent(new Event('input'));
    await settle();
    (document.querySelector('[data-test="ar-clone-fetch"]') as HTMLButtonElement).click();
    await settle();

    expect(mocks.fetchConfig).toHaveBeenCalledTimes(1);
    expect(mocks.fetchConfig).toHaveBeenCalledWith(expect.anything(), 'onshore-bond-basic', 'conn-prod');
    const stored = sessionStorage.getItem(SETTINGS_KEY) || '';
    expect(stored, 'settings 草稿应含拆填结果').toContain('number_of_shards');
    expect(stored, 'tokenizer 值必须原样（掩埋回归锚；prettyJson 口径带空格）').toContain('"tokenizer": "keyword"');
    app.unmount();
  });

  it('行为：连接中心无档案 → 拉取不可用（不静默发空 connId）', async () => {
    const { app, host, store } = await mountView();
    store.conns = [] as any;
    await settle();
    (host.querySelector('[data-test="ar-clone-open"]') as HTMLButtonElement).click();
    await settle();
    const btn = document.querySelector('[data-test="ar-clone-fetch"]') as HTMLButtonElement;
    expect(btn, '拉取按钮必须渲染').toBeTruthy();
    expect(btn.disabled, '无连接档案时拉取必须禁用').toBe(true);
    app.unmount();
  });

  it('行为：拉取失败 → 错误提示且审编框不被清空', async () => {
    sessionStorage.setItem(SETTINGS_KEY, '{"index":{"number_of_shards":"3"}}');
    mocks.fetchConfig.mockRejectedValue(new Error('Connection refused'));
    const { app, host, store } = await mountView();
    store.conns = [{ id: 'conn-x', name: 'X', host: 'x', port: 9200 }] as any;
    await settle();
    (host.querySelector('[data-test="ar-clone-open"]') as HTMLButtonElement).click();
    await settle();
    const idxInput = document.querySelector('[data-test="ar-clone-index"]') as HTMLInputElement;
    idxInput.value = 'idx-1';
    idxInput.dispatchEvent(new Event('input'));
    await settle();
    (document.querySelector('[data-test="ar-clone-fetch"]') as HTMLButtonElement).click();
    await settle();

    /* 裸挂载没有 toast 容器组件——失败信号改锚：审编框保留预置原值（紧凑形态，
       成功路径的 prettyJson 会重排为带空格形态，以此区分）且弹窗保持打开 */
    expect(sessionStorage.getItem(SETTINGS_KEY)).toContain('number_of_shards":"3');
    expect(document.querySelector('[data-test="ar-clone-index"]'), '拉取失败弹窗应保持打开').toBeTruthy();
    app.unmount();
  });

  it('行为：打开弹窗即拉源集群索引清单供点选（connectCheck + combobox 弹层）', async () => {
    const { app, host, store } = await mountView();
    store.conns = [{ id: 'conn-prod', name: '生产', host: 'es-prod.internal', port: 9200 }] as any;
    await settle();
    (host.querySelector('[data-test="ar-clone-open"]') as HTMLButtonElement).click();
    await settle();
    expect(mocks.connectCheck).toHaveBeenCalledWith(expect.anything(), 'conn-prod');
    /* datalist 退役换 usePopupList combobox（IndexPicker 同骨架）：聚焦输入框展开弹层，
     清单渲染为可点选项（n-modal teleport body，弹层就地渲染在其内容子树内） */
    const input = document.querySelector('[data-test="ar-clone-index"]') as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    await settle(4);
    const items = [...document.querySelectorAll('.ar-clone-item')];
    expect(items.length, '索引清单应渲染为弹层选项').toBe(2);
    expect(items[0].textContent).toContain('onshore-bond-basic');
    app.unmount();
  });

  it('行为：清单拉取失败不阻塞弹窗（手输仍可用，如实提示）', async () => {
    mocks.connectCheck.mockRejectedValue(new Error('Connection refused'));
    const { app, host, store } = await mountView();
    store.conns = [{ id: 'conn-x', name: 'X', host: 'x', port: 9200 }] as any;
    await settle();
    (host.querySelector('[data-test="ar-clone-open"]') as HTMLButtonElement).click();
    await settle();
    const input = document.querySelector('[data-test="ar-clone-index"]') as HTMLInputElement;
    expect(input, '索引输入框仍可用（手输兜底）').toBeTruthy();
    input.dispatchEvent(new Event('focus'));
    await settle(4);
    /* 空清单弹层如实提示（手输兜底语义）；错误原因行在输入框下方常驻 */
    expect(document.querySelector('.ar-clone-hint')?.textContent).toContain('清单外索引名可直接回车拉取');
    const errRow = [...document.querySelectorAll('.err-txt')].find(el => (el.textContent || '').includes('索引清单拉取失败'));
    expect(errRow, '拉取失败如实提示').toBeTruthy();
    app.unmount();
  });

  it('源码锚：拆填走 api.xb.fetchConfig（connId 档案，服务端取密）+ prettyJson 口径', () => {
    const v = read('../views/AdhocRebuildView.vue');
    expect(v).toContain('api.xb.fetchConfig');
    expect(v).toMatch(/data-test="ar-clone-open"/);
  });
});
