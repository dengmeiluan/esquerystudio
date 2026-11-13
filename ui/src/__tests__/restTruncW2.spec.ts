/**
 * W2 批：RestView 大响应截断展示（并轨 DevToolsView 326 批口径：512KB 常量）。
 *  ① 全量字符串不再直接跑 highlightJson——>512KB 只渲染前 512KB（尾部标记不出现）；
 *  ② 徽标「已截断 · N KB · 复制取全文」（data-rt-trunc）；
 *  ③ 点徽标 = copyResp 取 respParsed 完整原文（截断只作用于展示）。
 *
 * 设施：restComments 范式（MonacoEditor stub + api.raw 惰性包装 + 草稿预置）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { draftStorageKey } from '../composables/useScopedDraft';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const copyFn = vi.fn((_text: string) => Promise.resolve(true));
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: (text: string) => copyFn(text) };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute'],
    template: '<div class="monaco-stub"></div>',
  },
}));

const rawFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      raw: (...a: any[]) => rawFn(...a),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import RestView from '../views/RestView.vue';

const apps: ReturnType<typeof createApp>[] = [];

function mountRest() {
  const app = createApp({ render: () => h(RestView) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  return { app, host };
}

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

function presetDraft(method: string, path: string) {
  const sc = { route: 'rest' };
  sessionStorage.setItem(draftStorageKey(sc, 'method'), method);
  sessionStorage.setItem(draftStorageKey(sc, 'path'), path);
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  sessionStorage.clear();
  localStorage.clear();
  rawFn.mockReset();
  copyFn.mockClear();
});

describe('W2 批：RestView 大响应截断', () => {
  const TAIL = 'TAIL_MARKER_9Z';
  function hugeBody() { return '{"a":"' + 'x'.repeat(600 * 1024) + TAIL + '"}'; }

  it('① >512KB 响应：尾部不渲染 + 徽标「已截断 · 600 KB · 复制取全文」在场', async () => {
    rawFn.mockResolvedValue({ status: 200, body: hugeBody() });
    presetDraft('GET', '/_cluster/health');
    const { host } = mountRest();
    await settle(4);
    const send = host.querySelector<HTMLButtonElement>('.rt-req-row .btn.primary');
    send!.click();
    await settle(20);

    const badge = host.querySelector<HTMLButtonElement>('[data-rt-trunc]');
    expect(badge, '截断徽标必须在场').toBeTruthy();
    expect(badge!.textContent!.replace(/\s+/g, ' ')).toContain('已截断 · 600 KB · 复制取全文');
    const pre = host.querySelector('.rt-resp-scroll pre:not(.rt-err-pre)')!;
    expect(pre.textContent, '尾部标记必须被截断掉').not.toContain(TAIL);
    /* 小响应不受影响：无徽标（下一用例） */
  });

  it('①b 小响应：无截断徽标，全文直出', async () => {
    rawFn.mockResolvedValue({ status: 200, body: '{"ok":true}' });
    presetDraft('GET', '/_cluster/health');
    const { host } = mountRest();
    await settle(4);
    host.querySelector<HTMLButtonElement>('.rt-req-row .btn.primary')!.click();
    await settle(8);
    expect(host.querySelector('[data-rt-trunc]')).toBeNull();
    expect(host.querySelector('.rt-resp-scroll pre')!.textContent).toContain('"ok"');
  });

  it('② 点徽标 = copyResp 完整原文（含尾部标记，截断不污染复制）', async () => {
    rawFn.mockResolvedValue({ status: 200, body: hugeBody() });
    presetDraft('GET', '/_cluster/health');
    const { host } = mountRest();
    await settle(4);
    host.querySelector<HTMLButtonElement>('.rt-req-row .btn.primary')!.click();
    await settle(20);
    host.querySelector<HTMLButtonElement>('[data-rt-trunc]')!.click();
    await settle(4);
    expect(copyFn, '徽标必须走 copyText 全文通道').toHaveBeenCalledTimes(1);
    const copied = copyFn.mock.calls[0][0];
    expect(copied.length, '复制的是完整原文而非 512KB 截断版').toBeGreaterThan(512 * 1024);
    expect(copied).toContain(TAIL);
  });

  it('③ 截断常量与 DevToolsView 同口径 512KB（源码锁）', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const v = readFileSync(join(__dirname, '../views/RestView.vue'), 'utf-8');
    expect(v).toContain('const REST_RESP_MAX = 512 * 1024;');
    const dv = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');
    expect(dv).toContain('const DEVTOOLS_RESP_MAX = 512 * 1024;');
  });
});
