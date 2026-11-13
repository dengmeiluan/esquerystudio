/**
 * ux2 Task 6：6 个裸 Monaco 实例装配渗透（组件 stub 范式——bodyKind/fields 是闭包，只有 props 捕获能断言）。
 *  ① ConfigValidatorView 双实例：settings 档 + mapping 档（fields 均空数组函数）；
 *  ② TemplatesView：点「新建 索引模板」进 newMode → editBody 挂 template 档；
 *  ③ MappingView：点「添加字段」开 modal → mapping 档；点「动态设置」开 modal → settings 档（NModal Teleport body）；
 *  ④ SystemView：查询窗 search 档（onMounted 自动 systemInspect+systemQuery——api mock 堵口）。
 * mount 范式同 devtoolsSmartAssist.spec.ts（手工 createApp+pinia+memory router+settle；
 * 弹层 Teleport 到 body——但 stub caps 在 setup 即捕获，与 DOM 落点无关）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* 防御性 stub 挡真实 fetch 噪音（store.loadIndices 链路） */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      /* 本 spec 四视图挂载出口 */
      templates: () => Promise.resolve({ index_templates: [], component_templates: [] }),
      clusterInspect: () => Promise.resolve({ mappings: {} }),
      systemInspect: () => Promise.resolve({}),
      systemQuery: () => Promise.resolve({ hits: [], total: 0, took: 1 }),
    },
  };
});

/* MonacoEditor 组件 stub：setup 捕获 props/emit 入档（断言 dslAssist 传递，不断言编辑器行为） */
const monacoCaps: { props: any; emit: (e: string, v?: any) => void }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { monacoCaps.push({ props, emit }); return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

import ConfigValidatorView from '../views/ConfigValidatorView.vue';
import TemplatesView from '../views/TemplatesView.vue';
import MappingView from '../views/MappingView.vue';
import SystemView from '../views/SystemView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(comp: any) {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(comp) });
  apps.push(app);
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

/* dslAssist 契约断言辅助：存在 + fields/bodyKind 均函数（现调现读）+ 返回 bodyKind 当前值 */
function bodyKindOf(cap: any): string {
  expect(cap?.props?.dslAssist, 'dslAssist prop 必须传入').toBeTruthy();
  expect(typeof cap.props.dslAssist.fields, 'fields 必须是函数').toBe('function');
  expect(typeof cap.props.dslAssist.bodyKind, 'bodyKind 必须是函数').toBe('function');
  return cap.props.dslAssist.bodyKind();
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  monacoCaps.length = 0;
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
});

describe('ux2 Task 6 装配渗透', () => {
  it('① ConfigValidatorView：双栏 Monaco 各挂 settings/mapping 档，fields 空数组函数', async () => {
    await mountView(ConfigValidatorView);
    expect(monacoCaps.length, '双栏恰 2 枚 Monaco').toBe(2);
    expect(bodyKindOf(monacoCaps[0])).toBe('settings');
    expect(bodyKindOf(monacoCaps[1])).toBe('mapping');
    expect(monacoCaps[0].props.dslAssist.fields()).toEqual([]);
  });

  it('② TemplatesView：点「新建 索引模板」进 newMode → editBody 挂 template 档', async () => {
    const { host } = await mountView(TemplatesView);
    expect(monacoCaps.length, '未选模板/未新建前无 Monaco（v-if 门控）').toBe(0);
    findBtn(host, '新建 索引模板')!.click();
    await settle();
    expect(monacoCaps.length).toBe(1);
    expect(bodyKindOf(monacoCaps[0])).toBe('template');
  });

  it('②b TemplatesView 零降级门：component tab 新建 → bodyKind 降 none（八键对 component body 非法，ES 必 400）', async () => {
    const { host } = await mountView(TemplatesView);
    /* 切到组件模板 tab（tab 钮文本是英文 component_template——TemplatesView L13 实证，全 DOM 按钮中唯一命中；
       「组件模板」中文文案仅出现在新建钮、切 tab 后才渲染，不能作选择器——修复轮 BLOCKED 裁决修订） */
    findBtn(host, 'component_template')!.click();
    await settle();
    findBtn(host, '新建 组件模板')!.click();
    await settle();
    expect(monacoCaps.length, 'component tab 新建出 1 枚 Monaco').toBe(1);
    expect(bodyKindOf(monacoCaps[0]), 'component tab 必须降 none（quality 裁决：六键顶层非法）').toBe('none');
  });

  it('③ MappingView：添加字段 modal → mapping 档；动态设置 modal → settings 档', async () => {
    /* 视图有 store.pickedIdx 门控（EmptyState）——预置工作索引 */
    localStorage.setItem('es_picked', 'idx-a');
    const { host } = await mountView(MappingView);
    findBtn(host, '添加字段')!.click();
    await settle();
    expect(monacoCaps.length, '添加字段 modal 出 1 枚').toBe(1);
    expect(bodyKindOf(monacoCaps[0])).toBe('mapping');
    findBtn(host, '动态设置')!.click();
    await settle();
    expect(monacoCaps.length, '动态设置 modal 再出 1 枚（两 modal 不互关）').toBe(2);
    expect(bodyKindOf(monacoCaps[1])).toBe('settings');
  });

  it('④ SystemView：查询窗挂 search 档', async () => {
    await mountView(SystemView);
    expect(monacoCaps.length).toBeGreaterThanOrEqual(1);
    expect(bodyKindOf(monacoCaps[0])).toBe('search');
  });
});
