/**
 * 九百四十七批：DevTools「复制为代码」下拉恒在场（无路径 disabled，不再条件消失）。
 *
 * 请求区工具行三件（复制 curl/复制为代码/从 curl 导入）中，复制为代码 select
 * `v-if="cur?.path"` 条件消失——清空路径时整颗控件撤位、后续「从 curl 导入」钮左移
 * （空态行结构恒定违例：无数据 disabled 而非 v-if 消失；同排 curl 钮恒在场=同域两口径）。
 * 修法=恒在场 disabled。W3b 升档 NSelect：选项字面迁 CODEGEN_OPTS 常量（314/562 锁域随迁）、
 * title 中文备注字面不动；disabled 断言走 naive 内部 .n-base-selection--disabled 类。
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
/* W3b NSelect 升档：aria-label fallthrough 至 NSelect 根；disabled 态落 naive 内部 selection 类 */
const codeSel = (host: HTMLElement) => host.querySelector<HTMLElement>('[aria-label^="复制为代码"]');
const codeSelDisabled = (host: HTMLElement) => !!codeSel(host)?.querySelector('.n-base-selection--disabled');

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
});

describe('九百四十七批 A 源码锁：恒在场 disabled', () => {
  it('下拉恒在场接线：:disabled="!cur?.path" 在场，v-if 条件消失形态零残留', () => {
    expect(dt).toContain(':disabled="!cur?.path"');
    expect(dt, 'v-if 条件消失形态退役').not.toContain('v-if="cur?.path"');
  });
  it('选项字面与中文备注零触（三百一十四/五百六十二锁域随 NSelect 迁常量）', () => {
    /* 恒 null 受控+placeholder 承载「代码」标题位（选择即复制后显示归位） */
    expect(dt).toContain(':value="null"');
    expect(dt).toContain('placeholder="代码"');
    expect(dt).toContain("label: 'JavaScript (fetch)', value: 'js'");
    expect(dt).toContain("label: 'Python (requests)', value: 'python'");
    expect(dt).toContain(`v-tip="'复制为代码（fetch=前端 JavaScript 脚本 · requests=Python 脚本）'"`);
  });
});

describe('九百四十七批 B 行为锁（九百四十二挂载范式）', () => {
  it('无路径：下拉恒在场且 disabled；同排 curl/导入钮行结构恒定', async () => {
    const host = await mountView();
    expect(ss(host).tabs.length, '默认示例标签在场').toBeGreaterThan(0);
    ss(host).tabs[0].path = '';
    await settle();
    const sel = codeSel(host)!;
    expect(sel, '清空路径后下拉恒在场（不撤位）').toBeTruthy();
    expect(codeSelDisabled(host), '无路径=disabled').toBe(true);
    expect([...host.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'curl'), '同排 curl 钮在场（title 已迁 v-tip，按钮面文本定位）').toBeTruthy();
    expect([...host.querySelectorAll('button')].find(b => (b.textContent || '').includes('从 curl 导入')), '同排导入钮在场（title 已迁 v-tip，按钮面文本定位）').toBeTruthy();
  });

  it('有路径：下拉可用（往返转移后状态跟随）', async () => {
    const host = await mountView();
    ss(host).tabs[0].path = '';
    await settle();
    ss(host).tabs[0].path = '/_cat/indices?v';
    await settle();
    const sel = codeSel(host)!;
    expect(sel, '路径回填后下拉仍在场').toBeTruthy();
    expect(codeSelDisabled(host), '有路径=可用').toBe(false);
  });
});
