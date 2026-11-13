/**
 * 九百三十二批（轨6 走查批 · IlmView 策略编辑草稿真保护刀）：
 * 草稿注释声称「写一半的 policyBody 切页/刷新不再丢」，但 openNewPolicy 无条件
 * 覆写名/体两稿=草稿永不回显，声称的保护不可达；且 openEditPolicy 把编辑体写进
 * 同一草稿键——编辑 A 取消后点新建会带出 A 的体（跨会话串稿）。
 * 修法=新建/编辑分域（新建走 useScopedDraft 草稿、编辑走独立 ref）+ openNewPolicy
 * 条件回填（空稿才落示例体）+ 保存成功清新建稿（稿随保存消费，新建回归示例起步）。
 *   A 新建→改体→关→再新建：半成品体保留（刷新重开同路径，挂载读一次回显）。
 *   B 编辑→取消→新建：示例体起步（编辑体不串新建稿，草稿键不被编辑会话写）。
 *   C 新建保存成功：稿清零（草稿键移除），再新建回归示例体。
 *   D 刷新恢复：预种草稿键→挂载→新建：稿回显。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';

const KEY_BODY = 'esquerystudio.draft2:ilm:host:-:-:policy-body';
const KEY_NAME = 'esquerystudio.draft2:ilm:host:-:-:policy-name';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterIndices: vi.fn(async () => []),
      ilmPolicies: vi.fn(async () => []),
      ilmExplain: vi.fn(async () => ({ indices: {} })),
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
  const root = host.querySelector('.ilm') as HTMLElement & { __vueParentComponent?: { setupState: Record<string, any> } };
  expect(root, 'IlmView 根实例可达').toBeTruthy();
  return root.__vueParentComponent!.setupState;
}

const CUSTOM_BODY = '{"policy":{"phases":{"hot":{"actions":{"rollover":{"max_age":"9d"}}}}}}';

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('策略编辑草稿真保护（九百三十二批）', () => {
  it('A · 新建→改体→关→再新建：半成品体保留', async () => {
    const ss = await mountView();
    ss.openNewPolicy();
    expect(ss.policyBody, '空稿预填示例体').toContain('"50gb"');
    ss.policyBody = CUSTOM_BODY;
    await settle();
    expect(sessionStorage.getItem(KEY_BODY), '改动实时落稿').toContain('"9d"');
    ss.policyEditOpen = false;
    await settle();
    ss.openNewPolicy();
    expect(ss.policyBody, '重开回显半成品稿（不得被示例体重置）').toBe(CUSTOM_BODY);
  });

  it('B · 编辑→取消→新建：示例体起步，编辑体不串新建稿', async () => {
    const ss = await mountView();
    ss.openEditPolicy({ name: 'p-a', policy: { phases: { hot: { actions: { rollover: { max_age: '1d' } } } } } });
    expect(ss.policyBody, '编辑体取自源策略').toContain('"1d"');
    ss.policyEditOpen = false;
    await settle();
    expect(sessionStorage.getItem(KEY_BODY), '编辑会话不得写新建稿键').toBe(null);
    ss.openNewPolicy();
    expect(ss.policyBody, '新建以示例体起步（不带出编辑体）').toContain('"50gb"');
    expect(ss.policyBody, '新建不带出编辑体').not.toContain('"1d"');
  });

  it('C · 新建保存成功：稿清零，再新建回归示例体', async () => {
    const ss = await mountView();
    ss.openNewPolicy();
    ss.policyName = 'p-new-932';
    ss.policyBody = CUSTOM_BODY;
    await settle();
    await ss.savePolicy();
    await settle();
    expect(ss.policyEditOpen, '保存成功弹窗关').toBe(false);
    expect(sessionStorage.getItem(KEY_BODY), '体稿随保存消费清零').toBe(null);
    expect(sessionStorage.getItem(KEY_NAME), '名稿随保存消费清零').toBe(null);
    ss.openNewPolicy();
    expect(ss.policyBody, '再新建回归示例体（不留已保存陈稿）').toContain('"50gb"');
    expect(ss.policyName, '再新建名从空起步').toBe('');
  });

  it('D · 刷新恢复：预种草稿键，挂载后新建回显', async () => {
    sessionStorage.setItem(KEY_BODY, '{"policy":{"phases":{"warm":{"actions":{"allocate":{"require":{"data":"warm"}}}}}}}');
    sessionStorage.setItem(KEY_NAME, 'half-typed-name');
    const ss = await mountView();
    ss.openNewPolicy();
    expect(ss.policyBody, '刷新后体稿回显').toContain('"allocate"');
    expect(ss.policyName, '刷新后名稿回显').toBe('half-typed-name');
  });
});
