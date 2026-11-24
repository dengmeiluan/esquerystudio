/**
 * 一千一百二十六批：长等待一律可停止（UpdateByQuery / DeleteByQuery / Bulk）。
 *
 * 用户口径「所有请求都能客户端 cancel，3 分钟预算到点自动掐断」在页面的落地：
 *  ① UBQ/DBQ：wait_for_completion=true 时请求最多阻塞 180s —— 在途给「停止等待」，
 *    abort 真打断 fetch（api 收到的 signal 被 abort），失败面板如实写「已停止等待」；
 *  ② Bulk：超大 NDJSON 同步 bulk 同口径；
 *  ③ 负控：删掉 signal 接线 → 源码锚必须红。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { draftStorageKey } from '../composables/useScopedDraft';

const ubqSrc = readFileSync(join(__dirname, '../views/UpdateByQueryView.vue'), 'utf-8');
const bulkSrc = readFileSync(join(__dirname, '../views/BulkEditorView.vue'), 'utf-8');

const updateByQueryFn = vi.fn();
const deleteByQueryFn = vi.fn();
const searchDslFn = vi.fn();
const askConfirmFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      searchDsl: (...args: any[]) => searchDslFn(...args),
      updateByQuery: (...args: any[]) => updateByQueryFn(...args),
      deleteByQuery: (...args: any[]) => deleteByQueryFn(...args),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
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
  askConfirm: (...args: any[]) => askConfirmFn(...args),
}));

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import UpdateByQueryView from '../views/UpdateByQueryView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const UBQ_HASH = '#/update-by-query?idx=logs-*';
const UBQ_DRAFT_KEY = draftStorageKey({ route: 'update-by-query', index: () => 'logs-*' }, 'query');

async function mountUq() {
  location.hash = UBQ_HASH;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(UpdateByQueryView) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

function findBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes(text));
}

let lastUbqSignal: AbortSignal | undefined;

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem(UBQ_DRAFT_KEY, '{ "match_all": {} }');
  askConfirmFn.mockReset().mockResolvedValue(true);
  searchDslFn.mockReset().mockResolvedValue({ hits: { total: { value: 1234, relation: 'eq' }, hits: [] } });
  lastUbqSignal = undefined;
  updateByQueryFn.mockReset().mockImplementation((_i: any, _b: any, _o: any, signal?: AbortSignal) => {
    lastUbqSignal = signal;
    return new Promise((_res, rej) => {
      signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
  });
  deleteByQueryFn.mockReset().mockResolvedValue({ taskId: 'job-dq-x', deleted: 1 });
});

describe('1126 ① UBQ 停止等待（真挂载 + abort 真打断）', () => {
  it('在途出现停止钮；点击后 api 收到的 signal 真 abort，失败面板写「已停止等待」', async () => {
    const { app, host } = await mountUq();
    const runBtn = findBtn(host, '执行')!;
    expect(runBtn, '执行钮在场').toBeTruthy();
    runBtn.click();
    await settle(8);
    const stopBtn = host.querySelector('[data-test="ubq-stop"]') as HTMLButtonElement | null;
    expect(stopBtn, '在途必须给停止入口').toBeTruthy();
    expect(stopBtn!.textContent).toContain('停止等待');
    const signal = lastUbqSignal;
    expect(signal instanceof AbortSignal, 'api 必须收到 AbortSignal').toBe(true);
    expect(signal!.aborted, '点击前未 abort').toBe(false);
    stopBtn!.click();
    await settle(8);
    expect(signal!.aborted, '点击后 signal 真 abort').toBe(true);
    expect(host.textContent || '', '失败面板如实说明').toContain('已停止等待');
    expect(host.querySelector('[data-test="ubq-stop"]'), '停止后入口收敛').toBe(null);
    app.unmount();
  });

  it('源码锁：signal 接线到 update/delete 两条链路 + abort 感知文案', () => {
    expect(ubqSrc).toMatch(/api\.updateByQuery\(index\.value, bodyStr\.value, opts, runAbort\.value\.signal\)/);
    expect(ubqSrc).toMatch(/api\.deleteByQuery\(index\.value, bodyStr\.value, opts, runAbort\.value\.signal\)/);
    expect(ubqSrc).toContain('已停止等待（服务端可能仍在执行');
    expect(ubqSrc).toMatch(/finally \{ runAbort\.value = null; submitting\.value = false; \}/);
  });

  it('卸载即收等待：真卸载后 signal 真 abort（不把无人查看的连接挂到 180s 上限）', async () => {
    const { app, host } = await mountUq();
    findBtn(host, '执行')!.click();
    await settle(8);
    const signal = lastUbqSignal!;
    expect(signal.aborted, '卸载前未 abort').toBe(false);
    app.unmount();
    expect(signal.aborted, '卸载后必须 abort').toBe(true);
  });
});

describe('1126 ② Bulk 停止等待（源码锚 + 负控）', () => {
  const SIGNAL_WIRE = /api\.bulk\(body\.value, \{[\s\S]*?\}, runAbort\.value\.signal\)/;

  it('在途给停止钮，signal 接线，abort 感知文案', () => {
    expect(bulkSrc).toContain('data-test="be-stop"');
    expect(bulkSrc).toMatch(SIGNAL_WIRE);
    expect(bulkSrc).toContain('已停止等待（已发出的 Bulk 可能仍在服务端执行');
    expect(bulkSrc).toMatch(/finally \{ runAbort\.value = null; submitting\.value = false; \}/);
  });

  it('负控：删掉 signal 接线 → 源码锚必须红', () => {
    const broken = bulkSrc.replace(SIGNAL_WIRE, 'api.bulk(body.value, {');
    expect(broken, '负控必须真的改掉源码').not.toBe(bulkSrc);
    expect(broken, '去掉 signal 后必须判不合格').not.toMatch(SIGNAL_WIRE);
  });

  it('其余长等待页同样在真卸载时收连接（Bulk / Reindex / Xmigrate）', () => {
    const raSrc = readFileSync(join(__dirname, '../views/ReindexAdvancedView.vue'), 'utf-8');
    const xmSrc = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');
    expect(bulkSrc).toContain('onBeforeUnmount(() => { runAbort.value?.abort(); })');
    expect(raSrc).toContain('onBeforeUnmount(() => { runAbort.value?.abort(); })');
    expect(xmSrc).toContain('onBeforeUnmount(() => { syncAbort.value?.abort(); verifyAbort.value?.abort(); })');
  });
});
