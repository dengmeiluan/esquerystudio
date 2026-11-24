/**
 * 定宽规则落位看守（审查修复项 P1-1 / P2-11，挂载级结构锁）。
 *
 * TextInput 是 inheritAttrs:false 的统一件：标签上的 class / style 只随 $attrs 落到内层真实 input，
 * 落不到根容器 .ti（根容器恒 width:100%，作 flex 项会占满整行）。所以凡是「给某个 TextInput 定宽」
 * 的规则，必须打在根容器上——靠 input-class 留在真实 input 上的锚类去定位根容器。
 *
 *  · RestView 响应条：搜索框 130px、JQ 框 flex 0 1 260px 打在 .rt-resp-bar 的直接子级 .ti 上
 *    （:has 下探锚类），高度/字号打在真实 input 上。此前标签 class="rt-search/rt-jq" 落在内层 input，
 *    scoped 定宽规则全部失配，两个输入框各占满一整行；
 *  · DevToolsView 变量弹窗：变量名输入 150px 打在新增行首个输入件根容器上。不用 :last-of-type
 *    圈「最后一行」——变量表为空时新增行后面还跟着空态提示（同为 div），该选择器命不中新增行。
 *
 * happy-dom 不计算布局，数值类断言不做（宽度数值由样式规则承担，源码锚见 inputSweepB1085 /
 * componentP0Tables1085）；这里锁的是「规则的作用对象在 DOM 里确实存在且唯一」。
 * 挂具范式：RestView 照抄 restTruncW2，DevToolsView 照抄 devtoolsResp561。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { draftStorageKey } from '../composables/useScopedDraft';

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup() { return {}; },
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
      devtoolsExecute: (...a: any[]) => rawFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
    },
  };
});

import RestView from '../views/RestView.vue';
import DevToolsView from '../views/DevToolsView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

async function mountRestWithResp() {
  /* 草稿在挂载前预置：路径输入框的值来自草稿存储，挂载后预置不生效（发送钮因路径为空被禁用） */
  const sc = { route: 'rest' };
  sessionStorage.setItem(draftStorageKey(sc, 'method'), 'GET');
  sessionStorage.setItem(draftStorageKey(sc, 'path'), '/_cluster/health');
  const app = createApp({ render: () => h(RestView) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle(4);
  rawFn.mockResolvedValue({ status: 200, body: '{"ok":true}' });
  (host.querySelector('.rt-req-row .btn.primary') as HTMLButtonElement).click();
  await settle(12);
  return { app, host };
}

async function mountDevtools() {
  location.hash = '#/devtools';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/update-by-query', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(DevToolsView as any) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  sessionStorage.clear();
  localStorage.clear();
  rawFn.mockReset();
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  location.hash = '#/';
});

describe('RestView · 响应条两个输入的定宽作用对象', () => {
  it('锚类只在真实 input 上；输入件根容器是响应条直接子级、不带锚类（定宽规则 :has 下探的对象）', async () => {
    const { host } = await mountRestWithResp();
    const bar = host.querySelector('.rt-resp-bar')!;
    expect(bar, '响应条在场').toBeTruthy();
    const roots = [...bar.querySelectorAll<HTMLElement>('.rt-resp-bar > .ti')];
    expect(roots, '搜索框 + JQ 框两个输入件根容器').toHaveLength(2);
    for (const r of roots) {
      /* 标签 class 已去除：根容器不带锚类（带了也只会落到内层 input） */
      expect(r.classList.contains('rt-search') || r.classList.contains('rt-jq'), '根容器不带锚类').toBe(false);
    }
    const search = bar.querySelector<HTMLInputElement>('input.rt-search')!;
    const jq = bar.querySelector<HTMLInputElement>('input.rt-jq')!;
    expect(search.classList.contains('inp') && search.classList.contains('mono'), '皮肤锚类仍在真实 input 上').toBe(true);
    expect(jq.classList.contains('inp') && jq.classList.contains('mono')).toBe(true);
    expect(search.closest('.rt-resp-bar > .ti'), '搜索框的真实 input 在第一个根容器内').toBe(roots[0]);
    expect(jq.closest('.rt-resp-bar > .ti'), 'JQ 框的真实 input 在第二个根容器内').toBe(roots[1]);
    expect(roots[0].matches('.rt-resp-bar > .ti:has(.rt-search)'), '定宽规则的选择器能选中搜索框根容器').toBe(true);
    expect(roots[1].matches('.rt-resp-bar > .ti:has(.rt-jq)'), '定宽规则的选择器能选中 JQ 框根容器').toBe(true);
    expect(roots[0].matches('.rt-resp-bar > .ti:has(.rt-jq)'), '两个选择器互不串扰').toBe(false);
  });
});

describe('DevToolsView · 变量弹窗变量名输入的定宽作用对象', () => {
  async function openVars() {
    const m = await mountDevtools();
    stateOf(m.app).varsOpen = true;
    await settle(10);
    return m;
  }

  it('变量表为空：新增行是唯一的「首子元素为输入件」行；:last-of-type 命不中它（其后还有空态提示 div）', async () => {
    await openVars();
    const list = document.querySelector('.dt-vars-list')!;
    expect(list, '变量弹窗在场').toBeTruthy();
    const rows = [...list.querySelectorAll('.dt-vars-row')];
    expect(rows, '无变量时只有新增行').toHaveLength(1);
    const added = rows[0];
    expect(added.querySelector(':scope > .ti:first-child input')?.getAttribute('placeholder'), '新增行首个输入件是变量名框').toBe('变量名');
    expect(list.querySelector('.dt-vars-empty'), '空态提示在场，且排在新增行之后').toBeTruthy();
    expect(added.nextElementSibling?.classList.contains('dt-vars-empty')).toBe(true);
    /* 裁决给的 :last-of-type 写法在空表时命不中新增行（新增行不是最后一个 div）——
       定宽规则改按「首子元素是输入件」定位，对空表/非空表都成立 */
    expect(added.matches('.dt-vars-row:last-of-type'), ':last-of-type 在空表时命不中新增行').toBe(false);
    expect(list.querySelectorAll('.dt-vars-row > .ti:first-child'), '定宽规则在空表时命中新增行且唯一').toHaveLength(1);
  });

  it('有变量时：循环行以变量名 span 开头不受影响，新增行仍被命中', async () => {
    const { app } = await openVars();
    const st = stateOf(app);
    st.newVarK = 'idx';
    st.newVarV = 'x';
    st.addVar();
    await settle(6);
    const list = document.querySelector('.dt-vars-list')!;
    const rows = [...list.querySelectorAll('.dt-vars-row')];
    expect(rows, '一条变量行 + 新增行').toHaveLength(2);
    expect(rows[0].firstElementChild?.classList.contains('dt-vars-k'), '循环行首子元素是变量名 span').toBe(true);
    expect(list.querySelector('.dt-vars-empty'), '有变量后空态提示消失').toBeNull();
    const hits = list.querySelectorAll('.dt-vars-row > .ti:first-child');
    expect(hits, '仍只命中新增行的变量名框').toHaveLength(1);
    expect(hits[0].closest('.dt-vars-row')).toBe(rows[1]);
    expect(rows[1].matches('.dt-vars-row:last-of-type'), '对照：空态提示不在场时 :last-of-type 才成立').toBe(true);
  });
});
