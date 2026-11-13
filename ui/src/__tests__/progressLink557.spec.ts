/**
 * 五百五十七批 W5(轨5 自适应与全栈·前端):「查进度」死 API 激活。
 *
 * 背景:src/api.ts api.progress(taskId)(InternalEsIndexRebuildController GET /progress,
 * 返回结构化 ReindexProgress:status=RUNNING|COMPLETED|UNKNOWN + total/created/updated/
 * deleted 计数)全站零消费——提交 wait_for_completion=false 异步返回 taskId 后,用户只能
 * 「到任务树」间接看进度,结果卡行内无即时反馈。Java 零改(端点现成)。
 *
 * 两视图(ReindexAdvancedView 结果区 taskId 行 / UpdateByQueryView StatusPill 旁)
 * 加「查进度」钮:点击一次性拉取 api.progress(taskId),行内三态中文渲染:
 * RUNNING=进行中 created/total;COMPLETED=已完成;UNKNOWN/拉取失败=查不到降级
 * (任务完成后从 _tasks 消失/过期是常态路径,降级是预期分支不是异常)。不挂轮询。
 *
 * 形态:源码字面锁(548 rawIoPave 同形态)+ 行为锚(vi.mock api 真挂载点击链,
 * dataThreeState/rebuildThreeState 先例):点「查进度」→ api.progress 收到 taskId →
 * 三态各断言一轮。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { draftStorageKey } from '../composables/useScopedDraft';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* ---- 网络出口 mock:只换被测链路,视图/组件全真(dataThreeState 先例) ---- */
const reindexAdvancedFn = vi.fn();
const updateByQueryFn = vi.fn();
const searchDslFn = vi.fn();
const progressFn = vi.fn();
const askConfirmFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      reindexAdvanced: (...args: any[]) => reindexAdvancedFn(...args),
      updateByQuery: (...args: any[]) => updateByQueryFn(...args),
      searchDsl: (...args: any[]) => searchDslFn(...args),
      progress: (...args: any[]) => progressFn(...args),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* 挂载链路防御性 stub,挡真实 fetch 噪音(dataThreeState M1 同款) */
      keys: () => Promise.resolve([]),
      clustersList: () => Promise.resolve([]),
      clusterIndices: () => Promise.resolve([]),
      aliases: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({ body: { version: { number: '8.11.0' } } }),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      xb: {
        ...actual.api.xb,
        jobs: () => Promise.resolve([]),
        connectCheck: () => Promise.resolve([]),
        destIndices: () => Promise.resolve([]),
        preflight: () => Promise.resolve({ destExists: false }),
      },
    },
  };
});

vi.mock('../composables/confirm', () => ({
  askConfirm: (...args: any[]) => askConfirmFn(...args),
}));

/* JsonArea 内核 Monaco——jsdom 不可用统一 stub(dataThreeState 同款) */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import ReindexAdvancedView from '../views/ReindexAdvancedView.vue';
import UpdateByQueryView from '../views/UpdateByQueryView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(comp: any, hash = '#/') {
  location.hash = hash;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(comp) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

function setInput(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function findBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes(text));
}

/* UBQ 预置(逐字承 dataThreeState):?idx= 进 URL、query 进 sessionStorage 草稿 */
const UBQ_HASH = '#/update-by-query?idx=logs-*';
const UBQ_DRAFT_KEY = draftStorageKey({ route: 'update-by-query', index: () => 'logs-*' }, 'query');

describe('五百五十七批:「查进度」钮源码锚(两视图 + 死 API 消费)', () => {
  it('ReindexAdvancedView:taskId 行查进度钮 + api.progress 消费 + 三态文案', () => {
    const v = read('../views/ReindexAdvancedView.vue');
    expect(v, '查进度钮必须在场(data-test 稳定锚)').toContain('data-test="ra-progress"');
    expect(v, '死 API api.progress 必须被消费(此前全站零消费)').toContain('api.progress(');
    expect(v, '点击处理函数必须在场').toContain('queryTaskProgress');
    for (const t of ['进行中', '已完成', '查不到']) {
      expect(v, `三态中文文案缺「${t}」`).toContain(t);
    }
  });

  it('UpdateByQueryView:StatusPill 旁同款钮 + api.progress 消费 + 三态文案', () => {
    const v = read('../views/UpdateByQueryView.vue');
    expect(v, '查进度钮必须在场(data-test 稳定锚)').toContain('data-test="ubq-progress"');
    expect(v, '死 API api.progress 必须被消费(此前全站零消费)').toContain('api.progress(');
    expect(v, '点击处理函数必须在场').toContain('queryTaskProgress');
    for (const t of ['进行中', '已完成', '查不到']) {
      expect(v, `三态中文文案缺「${t}」`).toContain(t);
    }
  });
});

describe('五百五十七批:api.progress 消费行为锚(真挂载点击链)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    location.hash = '#/';
    localStorage.clear();
    sessionStorage.clear();
    reindexAdvancedFn.mockReset().mockResolvedValue({ taskId: 'task-1' });
    updateByQueryFn.mockReset().mockResolvedValue({ taskId: 'task-9', updated: 3 });
    searchDslFn.mockReset().mockResolvedValue({ hits: { total: { value: 42 } } });
    progressFn.mockReset().mockResolvedValue({ completed: false, status: 'RUNNING', total: 100, created: 30 });
    askConfirmFn.mockReset().mockResolvedValue(true);
  });

  it('RA:异步提交返回 taskId → 点查进度 → api.progress(taskId) → RUNNING 渲染「进行中 30/100」', async () => {
    const { app, host } = await mountView(ReindexAdvancedView);
    setInput(host.querySelectorAll<HTMLInputElement>('.ixp-inp')[1], 'orders-v2'); /* 模板序:Source 卡在前 */
    await settle(2);
    findBtn(host, '开始 Reindex')!.click();
    await settle();
    expect(host.textContent, '异步结果必须出 taskId').toContain('task-1');
    const btn = host.querySelector<HTMLButtonElement>('[data-test="ra-progress"]');
    expect(btn, 'taskId 行必须渲染查进度钮').toBeTruthy();
    btn!.click();
    await settle();
    expect(progressFn, '必须以提交返回的 taskId 拉取').toHaveBeenCalledWith('task-1');
    expect(host.textContent, 'RUNNING 态必须行内渲染进行中计数').toContain('进行中 30/100');
    app.unmount();
  });

  it('RA:三态流转 COMPLETED→「已完成 100/100」;拉取失败→查不到降级(不 toast 轰炸)', async () => {
    const { app, host } = await mountView(ReindexAdvancedView);
    setInput(host.querySelectorAll<HTMLInputElement>('.ixp-inp')[1], 'orders-v2');
    await settle(2);
    findBtn(host, '开始 Reindex')!.click();
    await settle();
    progressFn.mockResolvedValue({ completed: true, status: 'COMPLETED', total: 100, created: 100 });
    host.querySelector<HTMLButtonElement>('[data-test="ra-progress"]')!.click();
    await settle();
    expect(host.textContent).toContain('已完成 100/100');
    progressFn.mockRejectedValue(new Error('gone'));
    host.querySelector<HTMLButtonElement>('[data-test="ra-progress"]')!.click();
    await settle();
    expect(host.textContent, '拉取失败必须降级文案(任务过期是常态路径)').toContain('查不到');
    app.unmount();
  });

  it('UQ:异步提交 → StatusPill 旁点查进度 → api.progress(taskId) → 「进行中 7/20」', async () => {
    sessionStorage.setItem(UBQ_DRAFT_KEY, '{ "match_all": {} }');
    progressFn.mockResolvedValue({ completed: false, status: 'RUNNING', total: 20, created: 7 });
    const { app, host } = await mountView(UpdateByQueryView, UBQ_HASH);
    findBtn(host, '执行')!.click();
    await settle();
    expect(host.textContent, '异步结果必须出 taskId').toContain('task-9');
    const btn = host.querySelector<HTMLButtonElement>('[data-test="ubq-progress"]');
    expect(btn, 'StatusPill 旁必须渲染查进度钮').toBeTruthy();
    btn!.click();
    await settle();
    expect(progressFn, '必须以提交返回的 taskId 拉取').toHaveBeenCalledWith('task-9');
    expect(host.textContent, 'RUNNING 态必须行内渲染进行中计数').toContain('进行中 7/20');
    app.unmount();
  });
});
