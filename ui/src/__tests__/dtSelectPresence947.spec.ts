/**
 * 九百四十七批：DevTools「复制为代码」下拉恒在场（无路径 disabled，不再条件消失）。
 *
 * 请求区工具行三件（复制 curl/复制为代码/从 curl 导入）中，复制为代码 select
 * `v-if="cur?.path"` 条件消失——清空路径时整颗控件撤位、后续「从 curl 导入」钮左移
 * （空态行结构恒定违例：无数据 disabled 而非 v-if 消失；同排 curl 钮恒在场=同域两口径）。
 * 修法=恒在场 disabled。option 字面与 title 中文备注零触（三百一十四/五百六十二锁域）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const rawFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      raw: (...args: any[]) => rawFn(...args),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
    },
  };
});
vi.mock('../composables/confirm', () => ({ askConfirm: async () => false }));
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'dslAssist', 'readonly', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup() { return { getEditor: () => null }; },
    template: '<div class="monaco-stub"></div>',
  },
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import DevToolsView from '../views/DevToolsView.vue';

const dt = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  location.hash = '#/devtools';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }, { path: '/devtools', component: { template: '<div/>' } }],
  });
  await router.push('/devtools');
  await router.isReady();
  const app = createApp({ render: () => h(DevToolsView as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  await settle(20);
  return host;
}

const ss = (host: HTMLElement): any => (host.querySelector('.dt-page') as any).__vueParentComponent.setupState;
const codeSel = (host: HTMLElement) => host.querySelector<HTMLSelectElement>('select[aria-label^="复制为代码"]');

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
});

describe('九百四十七批 A 源码锁：恒在场 disabled', () => {
  it('select 恒在场接线：:disabled="!cur?.path" 在场，v-if 条件消失形态零残留', () => {
    expect(dt).toContain(':disabled="!cur?.path"');
    expect(dt, 'v-if 条件消失形态退役').not.toContain('v-if="cur?.path"');
  });
  it('option 字面与中文备注零触（三百一十四/五百六十二锁域不动）', () => {
    expect(dt).toContain('<option value="" disabled selected>代码</option>');
    expect(dt).toContain('<option value="js">JavaScript (fetch)</option>');
    expect(dt).toContain('<option value="python">Python (requests)</option>');
    expect(dt).toContain('title="复制为代码（fetch=前端 JavaScript 脚本 · requests=Python 脚本）"');
  });
});

describe('九百四十七批 B 行为锁（九百四十二挂载范式）', () => {
  it('无路径：select 恒在场且 disabled；同排 curl/导入钮行结构恒定', async () => {
    const host = await mountView();
    expect(ss(host).tabs.length, '默认示例标签在场').toBeGreaterThan(0);
    ss(host).tabs[0].path = '';
    await settle();
    const sel = codeSel(host)!;
    expect(sel, '清空路径后 select 恒在场（不撤位）').toBeTruthy();
    expect(sel.disabled, '无路径=disabled').toBe(true);
    expect([...host.querySelectorAll('button')].find(b => (b.getAttribute('title') || '') === '复制 curl'), '同排 curl 钮在场').toBeTruthy();
    expect([...host.querySelectorAll('button')].find(b => (b.getAttribute('title') || '') === '粘贴 curl 命令回填请求'), '同排导入钮在场').toBeTruthy();
  });

  it('有路径：select 可用（往返转移后状态跟随）', async () => {
    const host = await mountView();
    ss(host).tabs[0].path = '';
    await settle();
    ss(host).tabs[0].path = '/_cat/indices?v';
    await settle();
    const sel = codeSel(host)!;
    expect(sel, '路径回填后 select 仍在场').toBeTruthy();
    expect(sel.disabled).toBe(false);
  });
});
