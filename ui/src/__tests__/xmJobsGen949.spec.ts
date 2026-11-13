/**
 * 949 批 刀①：XmigrateView loadJobs 世代守卫（并发拍乱序落袋根治）。
 *
 * 真矿：loadJobs 无互斥也无世代面，九个触发通道（刷新钮/重试钮/启动-中止-续跑成功
 *   回调/xmRefresher 3s 轮询 tick/深链三口：挂载+onActivated+watch）任两通道并发时，
 *   慢拍旧回包照常落袋——旧列表覆写新拍列表、旧拍失败把新拍成功面改写成 err-bar、
 *   骨架闸被旧拍 finally 提前收掉、深链双口定位权被旧消费口抢走（URL 指向 y 作业而
 *   高亮停在 x 作业）。
 *   修法口径=世代守卫：每拍入列即 ++jobsSeq 取得唯一落案权，回包/失败/finally 三处
 *   都先核 seq 再动状态；consumeJobDeepLink 同构 ++dlSeq——旧消费口在 await loadJobs
 *   期间被新口顶替后，定位与摘链权整体让位。裸闸（if (jobsLoading) return）不可行：
 *   jobsLoading 初值 true 会拦死首载，且深链 reentry 必须放行否则定位失效。
 * 袋序契约：mountXm 的挂载口消费占 bag#0，之后每次刷新钮点击依次 bag#1/bag#2——
 *   「新拍」恒为更大下标，「旧拍迟到」=先 release 新下标再 release/reject 旧下标。
 * 锁面：行为锚（视图全真挂载+双 promise 袋手控回包次序）+源码锁。刷新钮模板锁
 *   （refreshSpin419）与 track2Wave550 切片边界不动；xmigrateGateExport941/xmCheckGate948
 *   锁域（start/abort/check/export）零触。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const jobsFn = vi.fn();
const destIndicesFn = vi.fn();
const keysFn = vi.fn();
const clustersListFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      keys: (...a: any[]) => keysFn(...a),
      clustersList: (...a: any[]) => clustersListFn(...a),
      xb: {
        ...actual.api.xb,
        jobs: (...a: any[]) => jobsFn(...a),
        destIndices: (...a: any[]) => destIndicesFn(...a),
      },
    },
  };
});
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: async () => true };
});

import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const job = (id: string, migrated: number) => ({
  jobId: id, status: 'DONE', destIndex: 'dest-' + id, sourceIndex: 'src-' + id,
  remoteEndpoint: 'http://old:9200', migrated, total: 10, conflicts: 0, errors: 0,
  createTime: 1750000000000, sliceStatus: {},
});
const STALE = [job('x-1', 1)];
const FRESH = [job('x-1', 9), job('y-1', 3)];

type Bag = { res: (v: any) => void; rej: (e: any) => void };
let bags: Bag[] = [];
function holdJobs() {
  bags = [];
  jobsFn.mockImplementation(() => new Promise<any>((res, rej) => { bags.push({ res, rej }); }));
}
function release(i: number, value: any) {
  const b = bags[i];
  if (!b) throw new Error('no pending bag #' + i);
  b.res(value);
}
function rejectBag(i: number, e: any) {
  const b = bags[i];
  if (!b) throw new Error('no pending bag #' + i);
  b.rej(e);
}

async function mountXm(query = ''): Promise<{
  host: HTMLElement; store: ReturnType<typeof useAppStore>; router: ReturnType<typeof createRouter>;
}> {
  const View = (await import('../views/XmigrateView.vue')).default;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/search', component: { template: '<div/>' } },
      { path: '/indices', component: { template: '<div/>' } },
    ],
  });
  await router.push('/' + query);
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
  return { host, store: useAppStore(pinia), router };
}

function refreshBtn(host: ParentNode): HTMLButtonElement {
  const btn = host.querySelector<HTMLButtonElement>('button[aria-label="刷新任务列表"]');
  if (!btn) throw new Error('刷新钮不在场');
  return btn;
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  bags = [];
  destIndicesFn.mockReset().mockResolvedValue([]);
  keysFn.mockReset().mockResolvedValue([]);
  clustersListFn.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('949 loadJobs 世代守卫（并发拍乱序落袋）', () => {
  it('慢拍旧回包丢弃：新拍列表落位后旧拍迟到不覆写', { timeout: 20000 }, async () => {
    holdJobs();
    const { host } = await mountXm();
    refreshBtn(host).click();          /* bag#1（旧拍）入列 */
    refreshBtn(host).click();          /* bag#2（新拍）入列 */
    expect(bags.length).toBe(3);
    release(2, FRESH);                 /* 新拍先落 */
    await settle(6);
    release(1, STALE);                 /* 旧拍迟到——不得覆写 */
    await settle(6);
    expect(host.textContent).toContain('y-1');
    expect(host.textContent).toContain('x-1');
  });

  it('旧拍失败丢弃：不得把新拍成功面改写成错误条/错误通知', { timeout: 20000 }, async () => {
    holdJobs();
    const { host, store } = await mountXm();
    refreshBtn(host).click();
    refreshBtn(host).click();
    release(2, FRESH);                 /* 新拍成功 */
    await settle(6);
    rejectBag(1, new Error('stale boom')); /* 旧拍失败迟到——必须整拍丢弃 */
    await settle(6);
    expect(host.querySelector('.err-bar'), '错误条不得因旧拍失败复现').toBeNull();
    expect(store.notifyLog.filter(n => n.kind === 'error'), '零错误通知').toHaveLength(0);
    expect(host.textContent).toContain('y-1');
  });

  it('骨架闸只归最新拍收：旧拍 finally 提前复位不得灭骨架', { timeout: 20000 }, async () => {
    holdJobs();
    const { host } = await mountXm();
    refreshBtn(host).click();
    refreshBtn(host).click();
    release(1, STALE);                 /* 旧拍先落——骨架必须仍由新拍在途持有 */
    await settle(6);
    expect(host.querySelector('.xm-sk'), '新拍在途骨架不得被旧拍 finally 收掉').toBeTruthy();
    release(2, FRESH);                 /* 新拍落位后骨架才退场 */
    await settle(6);
    expect(host.querySelector('.xm-sk')).toBeNull();
    expect(host.textContent).toContain('y-1');
  });

  it('深链双口定位权归最新消费口：旧口顶替后不抢高亮不覆写', { timeout: 20000 }, async () => {
    holdJobs();
    const { host, router } = await mountXm('?jobId=x-1'); /* 挂载口消费 x-1（bag#0 在途） */
    await router.push('/?jobId=y-1');                     /* watch 口消费 y-1 再入（bag#1） */
    await settle(6);
    expect(bags.length).toBe(2);
    release(1, FRESH);                 /* y-1 拍先落：定位 y-1 */
    await settle(10);
    release(0, STALE);                 /* x-1 拍迟到：定位权已让位，整拍丢弃 */
    await settle(10);
    const hit = host.querySelector('tr.xm-hit');
    expect(hit, '行高亮必须在场').toBeTruthy();
    expect(hit!.textContent, '高亮停在深链目标 y-1，不被旧口抢回 x-1').toContain('y-1');
    expect(host.textContent).toContain('y-1');
  });

  it('对照绿锚：单拍落位/顺序二拍生效/单拍失败照常报真', { timeout: 20000 }, async () => {
    jobsFn.mockResolvedValueOnce(STALE);
    const { host } = await mountXm();
    expect(host.textContent).toContain('x-1');
    jobsFn.mockResolvedValueOnce(FRESH);
    refreshBtn(host).click();          /* 顺序二拍（前拍已落定）必须照常生效 */
    await settle(8);
    expect(host.textContent).toContain('y-1');
    jobsFn.mockRejectedValueOnce(new Error('real boom'));
    refreshBtn(host).click();          /* 单拍真失败照常走错误面 */
    await settle(8);
    const bar = host.querySelector('.err-bar');
    expect(bar, '真实失败必须报错').toBeTruthy();
    expect(bar!.textContent).toContain('加载迁移作业失败');
  });

  it('源码锁：jobsSeq 世代三处弃拍+finally 闸收+dlSeq 定位权让位', () => {
    const src = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf8');
    const body = src.slice(src.indexOf('async function loadJobs()'), src.indexOf('async function consumeJobDeepLink'));
    expect(src, '世代计数器声明').toContain('let jobsSeq = 0;');
    expect(body, '拍序捕获收本体首段').toContain('const seq = ++jobsSeq;');
    expect((body.match(/if \(seq !== jobsSeq\) return;/g) || []).length, '回包与失败两支弃拍锚')
      .toBeGreaterThanOrEqual(2);
    expect(body, '骨架闸只归最新拍收').toContain('if (seq === jobsSeq) jobsLoading.value = false;');
    expect(src).toContain('let dlSeq = 0;');
    const dl = src.slice(src.indexOf('async function consumeJobDeepLink'));
    expect(dl, '消费口拍序捕获').toContain('const seq = ++dlSeq;');
    expect(dl, '旧消费口定位/摘链权让位').toContain('if (seq !== dlSeq) return;');
  });
});
