/**
 * 999 批：三视图权限预判口走查（拉取源配置闸 / 诊断 health 宿主预判 / 迁移清单可见提示+源连接引导）。
 *
 * ① AdhocRebuildView pullSourceToManual：回退补拉通道 cluster/inspect 是共享读端点
 *   （索引/映射/搜索/配置校验/托管重建任一页读键可见）——纯连接模型缺页时点拉取
 *   不得发网络请求也不得进确认窗，warning 引导 + 钮面禁用（doStart/doAbort 同款
 *   首行闸+disabled 双保险）；持 adhoc-rebuild 连接页时闸放行照常（有权限行为不变）。
 * ② AdhocRebuildView 期望配置页外链：宿主 client 侧静态单页（浏览器直开不携连接
 *   目标头，恒按 host 裁决）——纯连接模型钮面禁用；持静态页键则可点（行为不变）。
 * ③ DiagView api.health：/internal/es/index/health 归宿主（overview/diag/health-report
 *   任一页可见）——无页授权时挂载即跳过该调用（不发必然 403 的请求），clusterHealth
 *   不受影响；持页则照常发起（既有 canHostHealth 预判的行为锁）。
 * ④ XmigrateView destIndices：清单恒按宿主控制面授权，拉不到不再静默吞——warning
 *   指明「需宿主或静态页授权」；正常回包零告警（防过修守卫）。
 * ⑤ XmigrateView loadJobs：连接模型未选源连接时不发必败请求（回落宿主必 403），
 *   既有错误条给「请先选择源连接」引导；预置源连接草稿则照常按源连接发。
 *
 * 挂具形态抄 adhocGateRace943（AR 全真挂载）/diagTableAgg（Diag）/xmigrateGateExport941
 * （Xm）：createPinia 直设 me.grantedPages 模拟纯连接/静态页授权，零鉴权语义不受扰。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { draftStorageKey } from '../composables/useScopedDraft';

const askConfirmFn = vi.fn();
const prepareFn = vi.fn();
const statusFn = vi.fn();
const adhocJobsFn = vi.fn();
const adhocAbortFn = vi.fn();
const inspectFn = vi.fn();
const aliasesFn = vi.fn();
const healthFn = vi.fn();
const clusterHealthFn = vi.fn();
const nodesStatsFn = vi.fn();
const pendingTasksFn = vi.fn();
const allocationFn = vi.fn();
const hotThreadsFn = vi.fn();
const rerouteFn = vi.fn();
const xbJobsFn = vi.fn();
const destIndicesFn = vi.fn();
const keysFn = vi.fn();
const clustersListFn = vi.fn();

vi.mock('../composables/confirm', () => ({
  askConfirm: (...a: any[]) => askConfirmFn(...a),
}));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      aliases: (...a: any[]) => aliasesFn(...a),
      clusterInspect: (...a: any[]) => inspectFn(...a),
      health: (...a: any[]) => healthFn(...a),
      clusterHealth: (...a: any[]) => clusterHealthFn(...a),
      nodesStats: (...a: any[]) => nodesStatsFn(...a),
      pendingTasks: (...a: any[]) => pendingTasksFn(...a),
      allocationExplain: (...a: any[]) => allocationFn(...a),
      hotThreads: (...a: any[]) => hotThreadsFn(...a),
      rerouteRetryFailed: (...a: any[]) => rerouteFn(...a),
      keys: (...a: any[]) => keysFn(...a),
      clustersList: (...a: any[]) => clustersListFn(...a),
      xb: {
        ...actual.api.xb,
        jobs: (...a: any[]) => xbJobsFn(...a),
        destIndices: (...a: any[]) => destIndicesFn(...a),
      },
      adhoc: {
        ...actual.api.adhoc,
        prepare: (...a: any[]) => prepareFn(...a),
        status: (...a: any[]) => statusFn(...a),
        jobs: (...a: any[]) => adhocJobsFn(...a),
        abort: (...a: any[]) => adhocAbortFn(...a),
      },
    },
  };
});
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(_props: any, { emit }: any) { void emit; return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';

const apps: ReturnType<typeof createApp>[] = [];
let pendingConfirms: { res: (v: boolean) => void }[] = [];

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/search', component: { template: '<div/>' } },
      { path: '/indices', component: { template: '<div/>' } },
    ],
  });
  return router;
}

/** 直设身份：grantedPages 模拟纯连接（conn:*）/静态页（裸键）两档授权（探测已完成的稳态） */
function grant(pinia: Pinia, grantedPages: string[]) {
  const auth = useAuthStore(pinia);
  auth.me = { username: 'tester', role: 'OPERATOR', fallback: false, grantedPages };
  auth.probed = true;
  return auth;
}

async function mountView(View: any, grantedPages: string[], hookStore?: (store: ReturnType<typeof useAppStore>) => void): Promise<{ host: HTMLElement; store: ReturnType<typeof useAppStore> }> {
  const pinia = createPinia();
  grant(pinia, grantedPages);
  const store = useAppStore(pinia);
  hookStore?.(store); /* 挂载前挂钩（挂载即发的请求/提示要先装 spy） */
  const router = makeRouter();
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(View as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  await settle(20);
  return { host, store };
}

function btnByText(host: ParentNode, label: string): HTMLButtonElement {
  const btn = [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find(b => (b.textContent || '').trim() === label);
  if (!btn) throw new Error('button not found: ' + label);
  return btn;
}

function releaseConfirm(v: boolean) {
  const p = pendingConfirms.shift();
  if (!p) throw new Error('no pending confirm');
  p.res(v);
}

/** 进手动模式并带索引名（真实用户路径：顶栏选索引→切手动页签；抄 adhocGateRace943 同款） */
async function gotoManual(host: HTMLElement) {
  const inp = host.querySelector<HTMLInputElement>('.ixp-inp')!;
  inp.value = 'src-idx';
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  await settle(4);
  const tabs = host.querySelectorAll<HTMLButtonElement>('.ar-input-tabs button');
  tabs[1]!.click();
  await settle(4);
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  location.hash = '#/';
  pendingConfirms = [];
  askConfirmFn.mockReset().mockImplementation(() => new Promise<boolean>((res) => { pendingConfirms.push({ res }); }));
  prepareFn.mockReset();
  statusFn.mockReset();
  adhocJobsFn.mockReset().mockResolvedValue([]);
  adhocAbortFn.mockReset();
  inspectFn.mockReset();
  aliasesFn.mockReset().mockResolvedValue([]);
  healthFn.mockReset().mockResolvedValue({ locks: { self: 0, other: 0, expired: 0 } });
  clusterHealthFn.mockReset().mockResolvedValue({ status: 'green', number_of_nodes: 1, active_primary_shards: 1 });
  nodesStatsFn.mockReset().mockResolvedValue([]);
  pendingTasksFn.mockReset().mockResolvedValue({ tasks: [] });
  allocationFn.mockReset().mockRejectedValue(new Error('not probed yet'));
  hotThreadsFn.mockReset();
  rerouteFn.mockReset();
  xbJobsFn.mockReset().mockResolvedValue([]);
  destIndicesFn.mockReset().mockResolvedValue([]);
  keysFn.mockReset().mockResolvedValue([]);
  clustersListFn.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

/* ═══ ① 拉取源配置权限闸（pullSourceToManual） ═══ */
describe('999 ① AdhocRebuildView 拉取源配置权限闸', () => {
  it('纯连接模型无相关页：钮面禁用；程序化通道补 warning 引导、零确认窗零网络', { timeout: 20000 }, async () => {
    const View = (await import('../views/AdhocRebuildView.vue')).default;
    const { host, store } = await mountView(View, ['conn:c1:overview']);
    const spy = vi.spyOn(store, 'notify');
    await gotoManual(host);
    const btn = btnByText(host, '拉取源配置');
    expect(btn.disabled, '缺页授权：拉取钮必须禁用').toBe(true);
    /* 钮面禁用挡住鼠标路径；disabled 短路解开走程序化通道，验证本体首行闸 */
    btn.disabled = false;
    btn.click();
    await settle(6);
    expect(askConfirmFn).not.toHaveBeenCalled();
    expect(inspectFn).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('warning', expect.stringContaining('拉取源配置需'));
  });

  it('持 adhoc-rebuild 连接页：闸放行照常进确认窗、确认后补拉单发（有权限行为不变）', { timeout: 20000 }, async () => {
    const View = (await import('../views/AdhocRebuildView.vue')).default;
    const { host, store } = await mountView(View, ['conn:c1:adhoc-rebuild']);
    store.target = 'c1';
    await settle(4);
    await gotoManual(host);
    const btn = btnByText(host, '拉取源配置');
    expect(btn.disabled).toBe(false);
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    releaseConfirm(true);
    await settle(8);
    expect(inspectFn).toHaveBeenCalledTimes(1);
  });
});

/* ═══ ② 期望配置页外链（宿主静态页语义） ═══ */
describe('999 ② AdhocRebuildView 期望配置页外链宿主预判', () => {
  it('纯连接模型：钮面禁用 + title 给「需宿主或静态页授权」引导', { timeout: 20000 }, async () => {
    const View = (await import('../views/AdhocRebuildView.vue')).default;
    const { host } = await mountView(View, ['conn:c1:adhoc-rebuild']);
    const btn = btnByText(host, '打开期望配置页');
    expect(btn.disabled, '宿主静态页对纯连接模型不可达：必须禁用').toBe(true);
    expect(btn.title).toContain('需宿主或静态页授权');
  });

  it('持静态页键（adhoc-rebuild）：钮面可点，行为不变', { timeout: 20000 }, async () => {
    const View = (await import('../views/AdhocRebuildView.vue')).default;
    const { host } = await mountView(View, ['adhoc-rebuild']);
    const btn = btnByText(host, '打开期望配置页');
    expect(btn.disabled).toBe(false);
  });
});

/* ═══ ③ DiagView health 宿主预判（既有 canHostHealth 的行为锁） ═══ */
describe('999 ③ DiagView api.health 宿主预判跳过', () => {
  it('纯连接模型无 health 归属页：挂载不发 api.health，clusterHealth 照常', { timeout: 20000 }, async () => {
    const View = (await import('../views/DiagView.vue')).default;
    await mountView(View, ['conn:c1:search']);
    expect(healthFn).not.toHaveBeenCalled();
    expect(clusterHealthFn).toHaveBeenCalledTimes(1);
  });

  it('持宿主连接 diag 页授权：api.health 照常发起（防过修守卫）', { timeout: 20000 }, async () => {
    const View = (await import('../views/DiagView.vue')).default;
    /* /health 是 host-bound 端点（isHostBoundPath 强制 tid='host'，OverviewView 同判）：
       授权键须落在宿主连接上才放行 */
    const { host } = await mountView(View, ['conn:host:diag']);
    expect(healthFn).toHaveBeenCalledTimes(1);
    expect(clusterHealthFn).toHaveBeenCalledTimes(1);
    void host;
  });
});

/* ═══ ④ 迁移目标索引清单可见提示 ═══ */
describe('999 ④ XmigrateView destIndices 失败可见提示', () => {
  it('清单拉取失败不再静默吞：warning 指明需宿主或静态页授权、目标索引列表不可用', { timeout: 20000 }, async () => {
    const View = (await import('../views/XmigrateView.vue')).default;
    destIndicesFn.mockRejectedValue(new Error('403 FORBIDDEN'));
    const { store } = await mountView(View, ['conn:c1:xmigrate'], (s) => { vi.spyOn(s, 'notify'); });
    await settle(6);
    expect(store.notify).toHaveBeenCalledWith('warning', expect.stringContaining('目标索引清单加载失败'));
    expect(store.notify).toHaveBeenCalledWith('warning', expect.stringContaining('需宿主或静态页授权'));
    expect(store.notify).toHaveBeenCalledWith('warning', expect.stringContaining('目标索引列表不可用'));
  });

  it('清单正常回包零告警且不阻断（防过修守卫）', { timeout: 20000 }, async () => {
    const View = (await import('../views/XmigrateView.vue')).default;
    destIndicesFn.mockResolvedValue([{ index: 'dest-1' }]);
    const { store } = await mountView(View, ['conn:c1:xmigrate'], (s) => { vi.spyOn(s, 'notify'); });
    await settle(6);
    const warns = (store.notify as any).mock.calls.filter((c: any[]) => c[0] === 'warning' && String(c[1]).includes('目标索引清单'));
    expect(warns).toHaveLength(0);
  });
});

/* ═══ ⑤ 迁移作业列表：连接模型未选源连接先引导 ═══ */
describe('999 ⑤ XmigrateView 作业列表源连接前置引导', () => {
  it('连接模型未选源连接：不发 xb.jobs，错误条给「请先选择源连接」引导', { timeout: 20000 }, async () => {
    const View = (await import('../views/XmigrateView.vue')).default;
    const { host } = await mountView(View, ['conn:c1:xmigrate']);
    await settle(6);
    expect(xbJobsFn).not.toHaveBeenCalled();
    expect(host.textContent).toContain('请先选择源连接');
  });

  it('预置源连接草稿：照常按源连接发 jobs（防过修守卫）', { timeout: 20000 }, async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'xmigrate' }, 'src-conn-id'), 'c1');
    const View = (await import('../views/XmigrateView.vue')).default;
    const { host } = await mountView(View, ['conn:c1:xmigrate']);
    await settle(6);
    expect(xbJobsFn).toHaveBeenCalledWith(30, 'c1');
    expect(host.textContent).not.toContain('请先选择源连接');
  });
});
