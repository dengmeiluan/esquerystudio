/**
 * 九百一十五批走查件①【恢复成功反馈不被 rename 正则推导失败劫持】看守。
 *
 * doRestore 在 api.snapshotRestore 已 resolve（恢复已提交成功）后，用 new RegExp(restoreRenamePattern)
 * 推导「去查询验证」目标索引。rename_pattern 的输入 lint 立法是「尽力校验、不阻断提交（异步任务由
 * ES 侧裁决）」——坏正则（如未闭合括号）可以正常提交。此时 new RegExp 在 try 块内 throw：
 * 成功通知不发、弹窗不关、列表不补刷，反而落进 catch 弹「恢复失败」——恢复实际已成功，
 * 用户被反向误导（高危路径最忌讳的失败样貌）。
 * 立法=「去查询验证」目标推导失败只降级为不带 action 的成功通知，不得改变提交通知的成败语义。
 * 走真挂载（raceGuard860 范式）：视图全真，只 mock ../api 出口与 askConfirm。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const reposFn = vi.fn();
const snapListFn = vi.fn();
const snapRestoreFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      snapshotRepos: (...a: any[]) => reposFn(...a),
      snapshotList: (...a: any[]) => snapListFn(...a),
      snapshotRestore: (...a: any[]) => snapRestoreFn(...a),
      snapshotStatusSummary: vi.fn(async () => null),
      clusterIndices: vi.fn(async () => []),
      overview: vi.fn(async () => ({ indices: [] })),
      health: vi.fn(async () => ({ status: 'green' })),
      clusterHealth: vi.fn(async () => ({ status: 'green' })),
      shards: vi.fn(async () => []),
      nodesStatsBrief: vi.fn(async () => []),
      pendingTasks: vi.fn(async () => []),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

vi.mock('../composables/confirm', () => ({
  askConfirm: vi.fn(async () => true),
}));

import SnapshotsView from '../views/SnapshotsView.vue';
import { useAppStore } from '../stores/app';

const ROW = { snapshot: 'snap-1', state: 'SUCCESS', start_time: 1, duration_in_millis: 10, indices: ['a-idx'] };

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp({ render: () => h(SnapshotsView as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, pinia, store: useAppStore(pinia) };
}

describe('九百一十五批件①：恢复成功通知不被坏 rename 正则劫持', () => {
  beforeEach(() => {
    reposFn.mockReset().mockResolvedValue([{ name: 'r1', type: 'fs' }]);
    snapListFn.mockReset().mockResolvedValue([ROW]);
    snapRestoreFn.mockReset().mockResolvedValue({ accepted: true });
  });

  it('坏 rename_pattern 下恢复提交成功仍发 success 通知并关闭弹窗', async () => {
    const { app, host, store } = await mountView();
    const notifySpy = vi.spyOn(store, 'notify');
    const s = stateOf(app);
    expect(s.currentRepo).toBe('r1');
    expect(s.snapshots).toHaveLength(1);

    s.openRestore(ROW);
    await settle(2);
    expect(s.restoreOpen).toBe(true);

    /* 输入 lint 立法「不阻断提交」：坏正则允许提交，只能在此处降级推导 */
    s.restoreRenamePattern = '(';
    await settle(2);

    await s.doRestore();
    await settle(4);

    expect(snapRestoreFn).toHaveBeenCalledTimes(1);
    const successCall = notifySpy.mock.calls.find(c => c[0] === 'success');
    expect(successCall, '恢复已提交成功却未发 success 通知（被 verify 目标推导 throw 劫持进 error 支）').toBeTruthy();
    expect(String(successCall?.[1])).toContain('snap-1');
    expect(s.restoreOpen).toBe(false);
    app.unmount();
    host.remove();
  });

  it('合法 rename_pattern 下「去查询验证」action 仍在（推导成功路径不回退）', async () => {
    const { app, host, store } = await mountView();
    const notifySpy = vi.spyOn(store, 'notify');
    const s = stateOf(app);
    s.openRestore(ROW);
    await settle(2);
    s.restoreRenamePattern = '(.+)';
    s.restoreRenameReplacement = 'restored_$1';
    await settle(2);
    await s.doRestore();
    await settle(4);
    const successCall = notifySpy.mock.calls.find(c => c[0] === 'success');
    expect(successCall).toBeTruthy();
    const action = (successCall?.[2] as any)?.action;
    expect(action?.label).toBe('去查询验证');
    expect(s.restoreOpen).toBe(false);
    app.unmount();
    host.remove();
  });
});
