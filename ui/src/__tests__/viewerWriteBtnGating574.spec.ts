/**
 * 五百七十四批·权限写门行为锁：RestView（raw 透传=admin 档）三态挂载。
 *
 *  背景：574 批「TDD 深度扫描确保无集群写权限用户无法操作任何写入按钮」——全站写按钮
 *  此前 100% 依赖 permGating 源码字符串锁（v-if 字面在场），无一处「VIEWER 视角挂载断言
 *  按钮真不渲染」的行为级证据（侦察盲区③：canOps 计算属性写错恒 true 源码锁仍绿）。
 *  本 spec 以最轻的 RestView 为代表面补行为锁，并行为证明同批新落的 send() 执行体收口：
 *  发送钮按点位隐藏后，EndpointPathInput 的 @enter="send" 裸键盘路径仍可绕过——守卫收到
 *  执行体后，VIEWER 派发 Enter 必须 raw 零调用 + warning 提示。
 *
 *  三态设计防「恒真假绿」（572-C3 同源）：ADMIN 态前置断言发送钮在场 + Enter 真发 raw
 *  （链路正向证明），VIEWER/OPERATOR 态才拿「不渲染 + 零调用」当有效判别。
 *
 *  挂载范式同 dqResilience546（pinia + memory router + monaco 斩链——此处更省：
 *  直接组件级 mock MonacoEditor，无须 editor.api stub 全家桶）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* MonacoEditor 组件级 mock：斩断 monaco 导入巨图（body 编辑区本用例不触达） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: { name: 'MonacoEditor', props: ['modelValue', 'language', 'height'], render: () => null },
}));

/* api mock：raw 可编程计数；其余网络出口挂载冒烟堵死（dqResilience546 spread 范式）。
   五百七十七批：补 clusterTasks/cancelTask 惰性包装——TasksView conn 写键行为锁用
   （同 clusterThreeState 惰性范式：vi.mock factory 提升期 TDZ 规避） */
const rawMock = vi.fn(async (..._a: any[]) => ({ status: 200, body: '{}' }));
const tasksFn = vi.fn();
const cancelTaskFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      raw: (...args: any[]) => rawMock(...args),
      clusterIndices: () => Promise.resolve([]),
      clusterHealth: () => Promise.resolve({}),
      clusterTasks: (...args: any[]) => tasksFn(...args),
      cancelTask: (...args: any[]) => cancelTaskFn(...args),
    },
  };
});

import RestView from '../views/RestView.vue';
import TasksView from '../views/TasksView.vue';
import { useAuthStore } from '../stores/auth';
import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 10) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/* 五百七十七批：grantedPages 参数支持——conn 模型形态（默认 null 与既有三用例字面等价零改） */
async function mountWithRole(
  role: 'VIEWER' | 'OPERATOR' | 'ADMIN' | 'REBUILD_OP',
  grantedPages: string[] | null = null,
): Promise<HTMLElement> {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(RestView) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  const auth = useAuthStore(pinia);
  auth.me = { username: 'u-' + role.toLowerCase(), role, fallback: false, grantedPages };
  await settle();
  return host;
}

const sendBtnIn = (host: HTMLElement) =>
  !!Array.from(host.querySelectorAll('button')).find((b) => (b.textContent || '').includes('发送'));

const fireEnter = (host: HTMLElement) => {
  const inp = host.querySelector('input');
  expect(inp, '前置：path 输入框在场').toBeTruthy();
  inp!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '';
  rawMock.mockClear();
  tasksFn.mockReset();
  cancelTaskFn.mockReset();
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
});

describe('五百七十四批·RestView raw 透传三态行为锁（VIEWER 不可见+键盘旁路零调用）', () => {
  it('VIEWER：发送钮不渲染；path 输入框派发 Enter（@enter 旁路）→ send() 执行体守卫拦下，api.raw 零调用', async () => {
    const host = await mountWithRole('VIEWER');
    /* path 须不命中端点目录候选（有候选时 Enter 被吃作选候选不透发，守卫根本没被触达=假绿） */
    host.querySelector<HTMLInputElement>('input')!.value = '/_xlab/healthz';
    host.querySelector('input')!.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(2);
    expect(sendBtnIn(host), 'VIEWER 不应看到发送钮').toBe(false);
    fireEnter(host);
    await settle();
    expect(rawMock, 'VIEWER 键盘旁路被执行体守卫拦下，raw 不得发出').toHaveBeenCalledTimes(0);
  });

  it('OPERATOR：发送钮同样不渲染（ops 档以上才可见，raw 是 admin 档）', async () => {
    const host = await mountWithRole('OPERATOR');
    expect(sendBtnIn(host), 'OPERATOR 不应看到 raw 透传发送钮').toBe(false);
  });

  it('ADMIN：发送钮渲染，Enter → api.raw 恰一次（正向链路证明，防三态恒真假绿）', async () => {
    const host = await mountWithRole('ADMIN');
    const inp = host.querySelector<HTMLInputElement>('input')!;
    inp.value = '/_xlab/healthz';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(2);
    expect(sendBtnIn(host), 'ADMIN 应看到发送钮').toBe(true);
    fireEnter(host);
    await settle();
    expect(rawMock, 'ADMIN Enter 透发 raw').toHaveBeenCalledTimes(1);
    expect(rawMock.mock.calls[0]?.[0]).toBe('GET');
    expect(rawMock.mock.calls[0]?.[1]).toBe('/_xlab/healthz');
  });
});

/* ═══ 五百七十七批·TasksView conn 写键行为锁：canEndpoint(tasks/cancel) 连接感知真通 DOM ═══
   背景：后端共享写端点按真实归属页写键放行（task cancel → tasks/task-tree）；前端 Cancel 钮
   门控走 canEndpoint(tasks/cancel) 后，「有权限但看不到按钮」的镜像面必须收口。行为级四态：
   归属页写键在场可见 / 仅读键不可见 / 静态模型回落 VIEWER 不可见（零破坏）/ OPERATOR 正向证明。 */

/* TasksView 任务行形状（照 clusterThreeState TV_TASK：load() map 补 runningMs/tookMs） */
const TV_TASK = {
  taskId: 'node-es-01:123', node: 'node-es-01', action: 'indices:data/write/reindex',
  description: 'reindex from [a] to [b]', parentTaskId: 'unset',
  startTimeMillis: 0, runningTimeNanos: 2_000_000_000, cancellable: true, status: {},
};

async function mountTasksWithGrants(role: 'VIEWER' | 'OPERATOR' | 'ADMIN' | 'REBUILD_OP' | 'CLUSTER_OP', grantedPages: string[] | null): Promise<HTMLElement> {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(TasksView) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  const auth = useAuthStore(pinia);
  auth.me = { username: 'u-' + role.toLowerCase(), role, fallback: false, grantedPages };
  /* conn 目标侧：canEndpoint(tasks/cancel, store.target) 的 target=X-Es-Target（连接 id），
     共享端点按 tasks/task-tree 归属页写键裁决 */
  useAppStore(pinia).target = 'c1';
  await settle();
  return host;
}

const cancelBtnIn = (host: HTMLElement) =>
  !!Array.from(host.querySelectorAll('.tv-node button')).find((b) => (b.textContent || '').includes('取消'));

describe('五百七十七批·TasksView conn 写键行为锁（集群级动作需 rank3；VIEWER+连接写键不再可见）', () => {
  it('VIEWER + conn:c1:w:tasks：取消属集群级动作，rank2 不足 → Cancel 不可见', async () => {
    tasksFn.mockResolvedValue([TV_TASK]);
    const host = await mountTasksWithGrants('VIEWER', ['conn:c1:tasks', 'conn:c1:w:tasks']);
    expect(cancelBtnIn(host), 'VIEWER+任务页写键不得再看到 Cancel（后端需 rank3）').toBe(false);
  });

  it('CLUSTER_OP + conn:c1:w:tasks：集群级动作 rank3 达标 → Cancel 可见', async () => {
    tasksFn.mockResolvedValue([TV_TASK]);
    const host = await mountTasksWithGrants('CLUSTER_OP', ['conn:c1:tasks', 'conn:c1:w:tasks']);
    expect(cancelBtnIn(host), 'CLUSTER_OP+任务页写键应看到 Cancel 钮').toBe(true);
  });

  it('VIEWER + grantedPages 仅读键（conn:c1:tasks 无 w:）：Cancel 钮不可见（w: 键不在场即拒）', async () => {
    tasksFn.mockResolvedValue([TV_TASK]);
    const host = await mountTasksWithGrants('VIEWER', ['conn:c1:tasks']);
    expect(cancelBtnIn(host), '仅读键不应看到 Cancel 钮').toBe(false);
  });

  it('VIEWER + grantedPages=null（静态模型）：Cancel 钮不可见（回落 can(\'write\') 既有语义零破坏）', async () => {
    tasksFn.mockResolvedValue([TV_TASK]);
    const host = await mountTasksWithGrants('VIEWER', null);
    expect(cancelBtnIn(host), '静态模型 VIEWER 不应看到 Cancel 钮').toBe(false);
  });

  it('REBUILD_OP + grantedPages=null：Cancel 钮可见（正向链路证明按钮渲染本身通，防恒真假绿；取消与重建中止同族提档）', async () => {
    tasksFn.mockResolvedValue([TV_TASK]);
    const host = await mountTasksWithGrants('REBUILD_OP', null);
    expect(cancelBtnIn(host), 'REBUILD_OP 应看到 Cancel 钮').toBe(true);
  });

  it('OPERATOR + grantedPages=null：Cancel 钮不可见（取消提档 rank3 后 OPERATOR 不再持有，防回潮）', async () => {
    tasksFn.mockResolvedValue([TV_TASK]);
    const host = await mountTasksWithGrants('OPERATOR', null);
    expect(cancelBtnIn(host), 'OPERATOR 不应看到 Cancel 钮').toBe(false);
  });
});
