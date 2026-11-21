/**
 * 九百三十二批（轨6 走查批 · IlmView 重试示能刀）：
 * explain 拉取失败态的「重试」在途无任何示能——按钮可连点重复下发；
 * explainLoading 声明并注释「仅用于重试按钮防重入」，模板零引用=只写死状态，
 * 声称的防重入从未接线。修法=EmptyState 增 additive actionDisabled 道具
 * （undefined=不禁用，存量零触），IlmView 重试态接线：在途 disabled（防连点双发，
 * 异步进度可感知）。watch 驱动的快速切索引并发语义不动（idx !== explainIndex.value
 * 过期丢弃守卫照旧，raceGuard857 锁面零触）。
 *   A 源码锁：EmptyState 支持 actionDisabled + IlmView 接线字面在场。
 *   B 行为锚：失败态点重试——请求在途时重试钮 disabled，落定（再次失败）后恢复示能。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

const ilmPoliciesFn = vi.fn();
const ilmExplainFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterIndices: vi.fn(async () => []),
      ilmPolicies: (...a: any[]) => ilmPoliciesFn(...a),
      ilmExplain: (...a: any[]) => ilmExplainFn(...a),
      ilmMove: vi.fn(async () => ({ acknowledged: true })),
      ilmPolicyPut: vi.fn(async () => ({ acknowledged: true })),
      ilmPolicyDelete: vi.fn(async () => ({ acknowledged: true })),
    },
  };
});

/* Monaco 内核挂载链 stub（raceGuard857 同款：JsonArea→MonacoEditor 静态链斩断） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import IlmView from '../views/IlmView.vue';
import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  history.replaceState(null, '', '#/ilm');
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [{ path: '/ilm', component: { template: '<div/>' } }, { path: '/:p(.*)*', component: { template: '<div/>' } }],
  });
  const app = createApp({ render: () => h(IlmView as never) });
  apps.push(app);
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  await router.isReady();
  setActivePinia(pinia);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { host, store: useAppStore(pinia) };
}

function setupStateOf(host: HTMLElement): Record<string, any> {
  const root = host.querySelector('.ilm') as HTMLElement & { __vueParentComponent?: { setupState: Record<string, any> } };
  expect(root, 'IlmView 根实例可达').toBeTruthy();
  return root.__vueParentComponent!.setupState;
}

/** 失败态 EmptyState 内的重试钮（页面里多个空态，按文案域定） */
function retryBtn(host: HTMLElement): HTMLButtonElement | null {
  const cards = Array.from(host.querySelectorAll('.empty-state'));
  const fail = cards.find(e => e.textContent?.includes('explain 拉取失败'));
  return fail ? fail.querySelector('button') : null;
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  ilmPoliciesFn.mockReset().mockResolvedValue([]);
  ilmExplainFn.mockReset();
});

afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('explain 重试示能与防重入（九百三十二批）', () => {
  it('A · 源码锁：EmptyState actionDisabled 道具在场，IlmView 重试态接线', () => {
    const empty = read('../components/EmptyState.vue');
    expect(empty).toContain('actionDisabled?: boolean');
    expect(empty).toContain(':disabled="actionDisabled"');
    const ilm = read('../views/IlmView.vue');
    expect(ilm).toContain(':action-disabled="explainLoading"');
  });

  it('B · 失败态点重试：在途 disabled，落定后恢复示能且失败面板仍在', async () => {
    let rejPending: ((e: any) => void) | null = null;
    let calls = 0;
    ilmExplainFn.mockImplementation(() => {
      calls++;
      if (calls === 1) return Promise.reject(new Error('boom-first'));
      return new Promise((_res, rej) => { rejPending = rej; });
    });
    const { host, store } = await mountView();
    store.pick('idx-a');
    await settle();
    let btn = retryBtn(host);
    expect(btn, 'explain 失败态空态与重试钮在场').toBeTruthy();
    expect(btn!.disabled, '非在途时可点').toBe(false);

    btn!.click();
    await settle();
    btn = retryBtn(host);
    expect(calls, '重试已发出第二次请求').toBe(2);
    expect(btn!.disabled, '在途窗口重试钮禁用（防连点）').toBe(true);

    rejPending!(new Error('boom-second'));
    await settle();
    btn = retryBtn(host);
    expect(btn, '再次失败后失败面板仍在').toBeTruthy();
    expect(btn!.disabled, '落定后恢复示能').toBe(false);
    const ss = setupStateOf(host);
    expect(ss.explainLoading, '在途态落定归位').toBe(false);
  });
});
