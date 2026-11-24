/**
 * 1439：RestView 结构化体 lint——与 DevTools 同一分派（lintStructuredBody）。
 *
 * 此前 RestView 只对 search 体接 lintDsl：_delete_by_query 里写 sort 这种非法根键
 * 页面一声不吭（DevTools 已能提示）。现在两页同源，根键笔误都进底部条；
 * search 档回归照旧，GET 无 body 面不出条。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { draftStorageKey } from '../composables/useScopedDraft';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const monacoCaps: { props: any }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute'],
    setup(props: any) { monacoCaps.push({ props }); return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      raw: () => Promise.resolve({ status: 200, body: '{}' }),
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

function presetDraft(method: string, path: string, body?: string) {
  const sc = { route: 'rest' };
  sessionStorage.setItem(draftStorageKey(sc, 'method'), method);
  sessionStorage.setItem(draftStorageKey(sc, 'path'), path);
  if (body !== undefined) sessionStorage.setItem(draftStorageKey(sc, 'body'), body);
}

beforeEach(() => {
  apps.splice(0).forEach(a => a.unmount());
  document.body.innerHTML = '';
  sessionStorage.clear();
  localStorage.clear();
  monacoCaps.length = 0;
});

describe('1439 RestView 结构化体 lint', () => {
  it('_delete_by_query 的非法根键进底部条（按查询删除体 + sort）', async () => {
    presetDraft('POST', '/logs/_delete_by_query', '{"sort":[]}');
    const { host } = mountRest();
    await settle();
    const bar = host.querySelector('.lint-bar');
    expect(bar, '结构化体非法根键应有底部条').toBeTruthy();
    expect(bar!.textContent).toContain('按查询删除体');
    expect(bar!.textContent).toContain('sort');
  });

  it('合法结构化体静默', async () => {
    presetDraft('POST', '/logs/_delete_by_query', '{"query":{"match_all":{}},"max_docs":10}');
    const { host } = mountRest();
    await settle();
    expect(host.querySelector('.lint-bar'), '合法体应静默').toBeNull();
  });

  it('search 档回归：根键笔误仍走 lintDsl', async () => {
    presetDraft('POST', '/logs/_search', '{"fromm":0}');
    const { host } = mountRest();
    await settle();
    const bar = host.querySelector('.lint-bar');
    expect(bar).toBeTruthy();
    expect(bar!.textContent).toContain('fromm');
  });

  it('GET 无 body 面：即使草稿里有非法 body 也不出条', async () => {
    presetDraft('GET', '/logs/_search', '{"fromm":0}');
    const { host } = mountRest();
    await settle();
    expect(host.querySelector('.lint-bar')).toBeNull();
  });

  it('_bulk（none 档）：NDJSON 配对告警进底部条，语言切 ndjson（与 DevTools 同源）', async () => {
    presetDraft('POST', '/logs/_bulk', '{"index":{}}\n{"index":{}}\n{"a":1}');
    const { host } = mountRest();
    await settle();
    expect(monacoCaps[0]?.props.language, '_bulk 体语言').toBe('ndjson');
    const bar = host.querySelector('.lint-bar');
    expect(bar, 'bulk 配对告警应有底部条').toBeTruthy();
    expect(bar!.textContent).toContain('数量不匹配');
  });

  it('_msearch：语言切 ndjson', async () => {
    presetDraft('POST', '/_msearch', '{"index":"logs"}\n{"query":{"match_all":{}}}');
    mountRest();
    await settle();
    expect(monacoCaps[0]?.props.language, '_msearch 体语言').toBe('ndjson');
  });

  it('settings 档走 lintSettingsBody：设置键笔误进底部条', async () => {
    presetDraft('PUT', '/logs/_settings', '{"index":{"number_of_shardss":1}}');
    const { host } = mountRest();
    await settle();
    const bar = host.querySelector('.lint-bar');
    expect(bar, 'settings 档应有底部条').toBeTruthy();
    expect(bar!.textContent).toContain('number_of_shardss');
  });

  it('_msearch 档（msearch-body）：头体对落单仍出 NDJSON 配对告警', async () => {
    presetDraft('POST', '/_msearch', '{"index":"a"}\n{"query":{}}\n{"index":"b"}');
    const { host } = mountRest();
    await settle();
    const bar = host.querySelector('.lint-bar');
    expect(bar, 'msearch 落单头行应有底部条').toBeTruthy();
    expect(bar!.textContent).toContain('数量不匹配');
  });
});
