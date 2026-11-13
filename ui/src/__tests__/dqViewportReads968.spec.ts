/**
 * 九百六十八批：DQ 视口读数同族收口（967-C1 横切续刀）。
 *
 * 矿相：DslQueryView 四 computed（mainHandleSize/mainHandleMax/resultHandleSize/
 * resultHandleMax）与 onResultResize 事件体直读 window.innerHeight——computed 零
 * 响应式依赖，嵌入容器/挂载早期 0 值窗口被永久缓存且永不自愈（967 批 IndexHub
 * qryHandleMax 同族真机实锚：computed=0 而 window 实算 702，resize 不触发重算）。
 * 预扫同族矿谱横切三处（零依赖 computed 直读 window.innerWidth）：
 * QueryHubView histDrawerW / ReconcileReportDrawer drawerW / DevToolsView insFieldPopW。
 *
 * 修法：全部改走 app store viewportH/viewportW 响应式单源（IndexHub 967 批修后同款；
 * store 首值 0 防御回退 clientHeight/900+resize 更新守卫），jsdom 恒非 0 视口下
 * 读数与旧形态数学等价（768 基准逐值全等），唯嵌入 0 值环境从「永久 0」转「跟随实高」。
 *
 * 红证：① jsdom 可 stub window.innerHeight=0 直接复现 0 缓存矿相（旧形态四读数全 0；
 * 新形态走 store 回退 900 非零）——嵌入环境同构复现；② 响应式跟随锚：mount 后翻转
 * store.viewportH，四读数必须跟随（旧形态零依赖恒冻结在首拍值）；③ clamp 上限行为锚：
 * onResultResize 的 room 同源跟随。挂具：docWriteGate962 同款（视图全真 + Monaco stub +
 * 只 mock ../api 出口）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const clusterIndicesFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterIndices: (...a: any[]) => clusterIndicesFn(...a),
      mappingDetail: vi.fn(async () => ({ raw: { properties: {} } })),
      clusterHealth: vi.fn(async () => ({})),
      overview: vi.fn(async () => ({})),
      nodesStatsBrief: vi.fn(async () => []),
      aliases: vi.fn(async () => []),
      searchDsl: vi.fn(async () => ({ took: 1, hits: { total: { value: 0 }, hits: [] } })),
    },
  };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import DslQueryView from '../views/DslQueryView.vue';
import { useAppStore } from '../stores/app';

const dqSrc = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const qhSrc = readFileSync(join(__dirname, '../views/QueryHubView.vue'), 'utf-8');
const rrdSrc = readFileSync(join(__dirname, '../components/ReconcileReportDrawer.vue'), 'utf-8');
const dtSrc = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(view: any, hash: string) {
  location.hash = hash;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(view as any) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { host, pinia };
}

function dqState(host: HTMLElement): any {
  for (const el of host.querySelectorAll('*')) {
    const st = (el as any).__vueParentComponent?.setupState;
    if (st && st.mainHandleMax !== undefined && st.resultHandleMax !== undefined) return st;
  }
  throw new Error('DQ 视图组件 setupState 未找到');
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  clusterIndicesFn.mockReset().mockResolvedValue([{ index: 'idx-a', health: 'green', status: 'open' }]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  while (apps.length) apps.pop()!.unmount();
});

describe('九百六十八批：DQ 视口读数同族收口', () => {
  it('A 0 值视口四读数非零（store 回退 900；旧形态 innerHeight=0 全 0 永久缓存）', async () => {
    const realH = window.innerHeight;
    (window as any).innerHeight = 0;
    try {
      const { host } = await mountView(DslQueryView, '#/search');
      const st = dqState(host);
      expect(st.mainHandleMax, 'mainHandleMax 走 store 回退 900*0.78').toBe(Math.round(900 * 0.78));
      expect(st.mainHandleSize, 'mainHandleSize fallback 走 store 回退 900*0.34').toBe(Math.round(900 * 0.34));
      expect(st.resultHandleSize, 'resultHandleSize fallback 走 store 回退 900*0.4').toBe(Math.round(900 * 0.4));
      expect(st.resultHandleMax, 'resultHandleMax 走 store 回退 900-260').toBe(Math.max(320, 900 - 260));
    } finally {
      (window as any).innerHeight = realH;
    }
  });

  it('B 翻转 store.viewportH 四读数跟随（响应式单源；旧形态零依赖冻结首拍值）', async () => {
    const { host, pinia } = await mountView(DslQueryView, '#/search');
    const st = dqState(host);
    expect(st.mainHandleMax, '基准=jsdom 768*0.78').toBe(Math.round(window.innerHeight * 0.78));
    useAppStore(pinia).viewportH = 800;
    await settle(4);
    expect(st.mainHandleMax, '翻转后跟随 800*0.78=624').toBe(624);
    expect(st.mainHandleSize, 'fallback 态跟随 800*0.34=272').toBe(Math.round(800 * 0.34));
    expect(st.resultHandleSize, 'fallback 态跟随 800*0.4=320').toBe(Math.round(800 * 0.4));
    expect(st.resultHandleMax, 'clamp 口径跟随 800-260=540').toBe(800 - 260);
  });

  it('C onResultResize clamp 上限跟随 store.viewportH（552 口径 320..视口-260 保留）', async () => {
    const { host, pinia } = await mountView(DslQueryView, '#/search');
    const st = dqState(host);
    useAppStore(pinia).viewportH = 800;
    await settle(2);
    st.resultH = 0;
    st.onResultDragAnchor();
    st.onResultResize(0);
    expect(st.resultH, '向下拉满=clamp 上限 540（旧形态冻结在 768-260=508）').toBe(800 - 260);
  });

  it('D 源码锚：DQ 视口高直读退役+同族三处抽屉/弹层宽走 store.viewportW', () => {
    expect(dqSrc, 'DQ 视口高直读全退役').not.toContain('window.innerHeight');
    expect(dqSrc, '主柄上限走响应式单源').toContain('Math.round(store.viewportH * 0.78)');
    expect(qhSrc, '历史抽屉宽走响应式单源').toContain('Math.round(store.viewportW * 0.94)');
    expect(qhSrc, 'QueryHub 视口宽直读退役').not.toContain('window.innerWidth');
    expect(rrdSrc, '对账抽屉宽走响应式单源').toContain('Math.round(store.viewportW * 0.94)');
    expect(rrdSrc, 'ReconcileReportDrawer 视口宽直读退役').not.toContain('window.innerWidth');
    expect(dtSrc, '字段弹层宽走响应式单源').toContain('Math.round(store.viewportW * 0.94)');
    expect(dtSrc, 'DevTools 视口宽直读退役').not.toContain('window.innerWidth');
  });
});
