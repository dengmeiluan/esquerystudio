/**
 * 2.6.0 Task 9：RestView 发送前剥离 // 与 块注释——E 注释体验闭环（spec §6.3）。
 *
 * 契约（计划 Step 1 钉死）：
 *  ① 带 // 行注释与 块注释的 body 发出时已剥离——api.raw 收到干净 JSON（可 JSON.parse）；
 *  ② 串内 "//" 字面量保留（{"query": "a//b"} 形态值不动）——stripJsonComments 串内保护；
 *  ③ 无 body（GET）发送第三参传空串（hasBody=false 不碰 body 草稿）。
 *
 * 形态：组件级挂载 RestView（优先路径；提取纯函数为授权降级，未启用）。
 * 依赖面实读结论：
 *  - useDraft 键 rest.method/rest.path/rest.body 走 sessionStorage —— 挂载前预置即复原；
 *  - 发送入口 .rt-req-row .btn.primary.sm（POST/GET 直发，绕开 PUT/DELETE 的 ConfirmModal 确认门）；
 *  - MonacoEditor 整体 stub（jsonAreaMonaco 范式）斩断 monaco import 链——本 spec 不驱动
 *    编辑器交互，body 全由草稿预置；stub 同时让本 spec 对 ensureTheme 新增
 *    setLanguageConfiguration 天然免疫；
 *  - ../api 只堵网络出口 + raw 捕获入参（vi.fn 惰性包装防 TDZ，同 dslAssistPenetration 范式）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { draftStorageKey } from '../composables/useScopedDraft';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

/* MonacoEditor 整体 stub（jsonAreaMonaco.spec 范式） */
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
      /* 防御性 stub 挡真实 fetch 噪音（useIndexFields immediate 预热 / store 动作） */
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

/* useDraft 草稿通道预置（挂载即复原，免驱动 Monaco stub 编辑） */
function presetDraft(method: string, path: string, body?: string) {
  const sc = { route: 'rest' };
  sessionStorage.setItem(draftStorageKey(sc, 'method'), method);
  sessionStorage.setItem(draftStorageKey(sc, 'path'), path);
  if (body !== undefined) sessionStorage.setItem(draftStorageKey(sc, 'body'), body);
}

async function clickSend(host: HTMLElement) {
  const btn = host.querySelector<HTMLButtonElement>('.rt-req-row .btn.primary'); /* v3.0.1 尺寸统一 pri→primary sm */
  expect(btn, '发送按钮必须在场').toBeTruthy();
  expect(btn!.disabled, 'path 预置后发送按钮必须可用').toBe(false);
  btn!.click();
  await settle();
}

beforeEach(() => {
  apps.splice(0).forEach(a => a.unmount());
  document.body.innerHTML = '';
  sessionStorage.clear();
  localStorage.clear();
  rawFn.mockReset();
  rawFn.mockResolvedValue({ status: 200, body: '{}' });
});

describe('2.6.0 Task 9：RestView 发送前剥离注释', () => {
  it('① 带 // 行注释与 /* 块注释 */ 的 body 发出时已剥离（干净 JSON 可解析）', async () => {
    const body = [
      '{',
      '  // 行注释：调试时随便写',
      '  "query": { "match_all": {} },',
      '  /* 块注释：',
      '     多行也行 */',
      '  "size": 1',
      '}',
    ].join('\n');
    presetDraft('POST', '/x/_doc', body);
    const { host } = mountRest();
    await settle(4);
    await clickSend(host);

    expect(rawFn, '发送必须落到 api.raw').toHaveBeenCalledTimes(1);
    const [m, p, sent] = rawFn.mock.calls[0];
    expect(m).toBe('POST');
    expect(p).toBe('/x/_doc');
    expect(sent, '行注释必须剥离').not.toContain('//');
    expect(sent, '块注释必须剥离').not.toContain('/*');
    /* 剥离后是合法 JSON 且业务字段原样在——ES 只收干净 JSON */
    const parsed = JSON.parse(sent);
    expect(parsed.query).toEqual({ match_all: {} });
    expect(parsed.size).toBe(1);
  });

  it('② 串内 "//" 字面量保留（{"query": "a//b"} 值不动——串内保护回归锁）', async () => {
    presetDraft('POST', '/x/_doc', '{"query": "a//b"}');
    const { host } = mountRest();
    await settle(4);
    await clickSend(host);

    expect(rawFn).toHaveBeenCalledTimes(1);
    const sent = rawFn.mock.calls[0][2];
    expect(JSON.parse(sent).query, '串内 // 是合法字符，绝不可当注释剥掉').toBe('a//b');
  });

  it('③ 无 body（GET）发送第三参传空串', async () => {
    /* body 草稿即便有值，GET 也不应携带（hasBody=false） */
    presetDraft('GET', '/_cluster/health', '{"a":1}');
    const { host } = mountRest();
    await settle(4);
    await clickSend(host);

    expect(rawFn).toHaveBeenCalledTimes(1);
    const [m, p, sent] = rawFn.mock.calls[0];
    expect(m).toBe('GET');
    expect(p).toBe('/_cluster/health');
    expect(sent, 'GET 无 body 必须传空串').toBe('');
  });
});
