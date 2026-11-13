/**
 * 938 批：DiagView 走查三刀。
 *
 * 刀① retryFailedAlloc 执行闸通道缺失+置位后移：互斥闸只落钮面 :disabled="retrying"，
 *   而闸置位在 askConfirm 这个 await 之后——确认窗挂起期间 retrying 仍 false，钮面可点，
 *   二击穿透闸=双开确认窗，两支都确认后 _cluster/reroute?retry_failed=true 双发
 *   （集群级写动作）。修法口径=闸读收函数本体首行+置位前移到第一个 await 之前+
 *   try/finally 全包裹（取消路径 finally 复位防闸死；templateSaveGate937 同族口径）。
 * 刀② loading 死状态退役：load() 的 loading ref 只写不读（KPI 卡墙退役后骨架消费面
 *   已不存在），只写不读 ref 高发指纹。
 * 刀③ 复制钮三处 v-if 条件消失：copyPending/copyAllocMd/copyHot 空数据时 v-if 卸载，
 *   hot 区复制钮消失会推挤其后采样钮位置（位置恒定违例）；改恒在场 :disabled
 *   （无数据禁用而非 v-if 消失，BrowserView 工作区钮同款口径）。
 *
 * 锁定形态：行为锚（视图全真挂载+askConfirm 手控回包）+源码锁双通道；与
 * diagNodesExport/diagRetryAlloc 既有锁面共处（三钮字面随迁由本批同批承担）。
 */
import { describe, it, expect, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const confirmFn = vi.fn();
const rawFn = vi.fn();
const rerouteFn = vi.fn();

vi.mock('../composables/confirm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../composables/confirm')>();
  return { ...actual, askConfirm: (...a: any[]) => confirmFn(...a) };
});
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      health: vi.fn(async () => ({ locks: { self: 0, other: 0, expired: 0 } })),
      clusterHealth: vi.fn(async () => ({ status: 'green', number_of_nodes: 2, active_primary_shards: 4 })),
      nodesStats: vi.fn(async () => []),
      pendingTasks: vi.fn(async () => ({ tasks: [] })),
      allocationExplain: vi.fn(async () => ({ index: 'idx-a', shard: 0, primary: true, current_state: 'unassigned', unassigned_info: { reason: 'NODE_LEFT' } })),
      hotThreads: vi.fn(async () => ''),
      raw: (...a: any[]) => rawFn(...a),
      reroute: (...a: any[]) => rerouteFn(...a),
      rerouteRetryFailed: (...a: any[]) => rerouteFn(...a),
    },
  };
});

import DiagView from '../views/DiagView.vue';
import { useAuthStore } from '../stores/auth';

let pendingConfirms: { res: (v: boolean) => void }[] = [];

async function settle(n = 10) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountDiag(): Promise<HTMLElement> {
  pendingConfirms = [];
  confirmFn.mockReset();
  rawFn.mockReset();
  rerouteFn.mockReset();
  confirmFn.mockImplementation(() => new Promise<boolean>((res) => { pendingConfirms.push({ res }); }));
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore(pinia);
  auth.me = { username: 't', role: 'ADMIN', fallback: false };
  const app = createApp({ render: () => h(DiagView as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function findBtn(host: HTMLElement, selector: string, re?: RegExp): HTMLButtonElement {
  const btn = [...host.querySelectorAll<HTMLButtonElement>(selector)]
    .find(b => (re ? re.test(b.textContent || '') : true));
  if (!btn) throw new Error('button not found: ' + selector + ' / ' + re);
  return btn;
}

/* 重试钮 v-if 双门控（canOps && current_state==='unassigned'）：挂载后点「探测」
   让 allocationExplain 回包落定，重试钮才进渲染树 */
async function mountDiagWithUnassigned(): Promise<HTMLElement> {
  const host = await mountDiag();
  findBtn(host, 'button', /探测/).click();
  await settle(6);
  return host;
}

function releaseConfirm(v: boolean) {
  const p = pendingConfirms.shift();
  if (!p) throw new Error('no pending confirm');
  p.res(v);
}

describe('Diag retry_failed 执行闸（刀①）', () => {
  it('确认窗在途期间二击不穿透：确认计数恒 1、提交恒 1 发、确认窗期间钮面即禁用', async () => {
    const host = await mountDiagWithUnassigned();
    const btn = findBtn(host, 'button', /重试失败分片分配/);
    btn.click();
    await settle(4);
    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(pendingConfirms.length).toBe(1);
    /* 闸置位前移后钮面在确认窗期间即禁用（穿透窗消除） */
    expect(btn.disabled).toBe(true);
    btn.click();                                   /* 二击：闸读+钮面禁用双保险 */
    await settle(4);
    expect(confirmFn).toHaveBeenCalledTimes(1);
    releaseConfirm(true);
    await settle(6);
    expect(rerouteFn).toHaveBeenCalledTimes(1);    /* 单发铁证 */
    expect(btn.disabled).toBe(false);              /* finally 复位 */
  });

  it('取消路径复位防闸死：确认窗取消后可再次发起', async () => {
    const host = await mountDiagWithUnassigned();
    const btn = findBtn(host, 'button', /重试失败分片分配/);
    btn.click();
    await settle(4);
    expect(confirmFn).toHaveBeenCalledTimes(1);
    releaseConfirm(false);
    await settle(4);
    expect(btn.disabled).toBe(false);
    expect(rerouteFn).not.toHaveBeenCalled();
    btn.click();
    await settle(4);
    expect(confirmFn).toHaveBeenCalledTimes(2);    /* 可再进确认 */
    releaseConfirm(true);
    await settle(6);
    expect(rerouteFn).toHaveBeenCalledTimes(1);
  });

  it('确认提交后 reroute 走结构化端点（retryFailed=true）且完成后复位', async () => {
    const host = await mountDiagWithUnassigned();
    const btn = findBtn(host, 'button', /重试失败分片分配/);
    btn.click();
    await settle(4);
    releaseConfirm(true);
    await settle(6);
    expect(rerouteFn).toHaveBeenCalledTimes(1);
    expect(rerouteFn).toHaveBeenCalledWith();
    expect(btn.disabled).toBe(false);
  });
});

describe('Diag 死状态与复制钮形态（刀②③）', () => {
  const src = readFileSync(join(__dirname, '../views/DiagView.vue'), 'utf-8');

  it('loading 死状态零残留（卡墙退役后无消费面）', () => {
    expect(src).not.toMatch(/const loading = ref/);
    expect(src).not.toMatch(/\bloading\.value\b/);
  });

  it('复制钮三处恒在场禁用形态（无数据禁用而非 v-if 消失）', () => {
    expect(src).toMatch(/<button class="btn sm ghost" :disabled="!pending\.length" style="margin-left:auto" @click\.prevent="copyPending"/);
    expect(src).toMatch(/<button class="btn sm ghost" :disabled="!allocation" @click="copyAllocMd"/);
    expect(src).toMatch(/<button class="btn sm ghost" :disabled="!hotThreads" @click\.prevent="copyHot"/);
  });

  it('自动刷新标签禁收缩+卡头换行提档 1440（1280 常态档不再压标签成竖排）', () => {
    expect(src).toMatch(/\.dg-auto-lbl \{ display: inline-flex; align-items: center; gap: var\(--sp-1\); font-size: var\(--fs-sm\); color: var\(--tx1\); cursor: pointer; margin-left: auto; flex: none; \}/);
    const wrap = src.indexOf('@media (max-width: 1440px)');
    const cardWrap = src.indexOf('.card-t { flex-wrap: wrap;');
    expect(wrap).toBeGreaterThan(-1);
    expect(cardWrap).toBeGreaterThan(wrap);
    expect(src).not.toMatch(/@media \(max-width: 1100px\) \{\s*\n\s*\.card-t \{ flex-wrap: wrap;/);
  });

  it('空数据时三复制钮在场且禁用，hot 区采样钮位置不被推挤', async () => {
    const host = await mountDiag();
    const copyPending = findBtn(host, '.dg-sec-t button[title*="pending"]');
    const copyAlloc = findBtn(host, '.dg-sec-t button[title*="分片诊断"]');
    const copyHot = findBtn(host, '.dg-hot button[title*="热线程原始文本"]');
    const sampleHot = findBtn(host, '.dg-hot summary button', /采样/);
    expect(copyPending.disabled).toBe(true);
    expect(copyAlloc.disabled).toBe(true);
    expect(copyHot.disabled).toBe(true);
    const btns = [...host.querySelectorAll('button')];
    expect(btns.indexOf(copyHot)).toBeGreaterThan(-1);
    expect(btns.indexOf(copyHot)).toBeLessThan(btns.indexOf(sampleHot));
  });
});
