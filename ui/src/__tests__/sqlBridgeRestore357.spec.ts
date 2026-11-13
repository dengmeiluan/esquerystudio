/**
 * 三百五十七批：SqlBridge dsl/lucene 输出持久化行为级验证——
 * draft2 键预置后挂载，Monaco 栏真实恢复旧转换结果（刷新场景复现）。
 * 挂载器借 sqlBridgeMonaco 样板（memory router + pinia + Monaco stub）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any) { return () => h('div', { class: 'monaco-stub', 'data-lang': props.language }, String(props.modelValue ?? '')); },
    template: '<div class="monaco-stub">{{ modelValue }}</div>',
  },
}));

import SqlBridgeView from '../views/SqlBridgeView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(SqlBridgeView) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
});

describe('SqlBridge 输出持久化行为验证（357 批）', () => {
  it('draft2 预置 dsl-out → 挂载后 DSL 栏真实恢复旧转换结果', async () => {
    /* key 与组件同式：route:target:index:mode:field；空 SQL 时指纹='0:'（mode 槽） */
    sessionStorage.setItem(
      'esquerystudio.draft2:sqlbridge:host:-:0::dsl-out',
      '{"query":{"match_all":{}}}',
    );
    const host = await mountView();
    await settle();
    const stubs = [...host.querySelectorAll('.monaco-stub')].map(e => e.textContent ?? '');
    expect(stubs.some(t => t.includes('match_all')), 'DSL 栏应恢复旧转换结果').toBe(true);
  });
});
