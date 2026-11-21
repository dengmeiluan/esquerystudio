/**
 * 2026-11-21 兼容计划批：详情弹窗冲突区升级——默认 50 条 +「加载全部冲突」游标分页拉满。
 *
 *   ① 默认窗口——job doc 自带 conflictSamples 只显示前 50 条（带样本的作业），
 *     「加载全部冲突」按钮在场（未加载完全时）；
 *   ② 游标分页——点击后 api.xb.conflicts(jobId, {cursor, limit:200}) 逐页追加拉满：
 *     首页无 cursor、后续页带上一页 nextCursor；服务端环上限 1000 封顶停止；
 *     逐页追加渐进呈现（中途即有部分行），total 以 job.conflicts 全量计数显示；
 *   ③ 样本形态 v2——samples 元素 {_id, ts, reason?}，取 _id 展示（reason 旁注可选）；
 *   ④ 加载完成按钮退场；无冲突样本/零冲突时按钮禁用（无可拉内容不空转）。
 * 挂具范式同 xmigrateReplay1120（全真挂载 + api mock；详情 n-modal teleport 查 document）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const xbConflicts = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      keys: async () => [],
      clustersList: async () => [],
      clusterIndices: async () => [],
      overview: async () => ({}),
      clusterHealth: async () => ({}),
      xb: {
        ...actual.api.xb,
        jobs: (...a: any[]) => xbJobs(...a),
        destIndices: async () => [],
        conflicts: (...a: any[]) => xbConflicts(...a),
        events: async () => ({ events: [] }),
      },
    },
  };
});

/* job doc 自带 60 条样本（>50 触发默认窗口），全量冲突 450 */
const SAMPLES_60 = Array.from({ length: 60 }, (_, i) => 'doc-' + i);
const JOB = {
  jobId: 'j-cf', status: 'DONE', destIndex: 'dest-cf', sourceIndex: 'src-cf',
  remoteEndpoint: '', migrated: 1000, total: 1450, conflicts: 450, errors: 0,
  createTime: 1700000000000, conflictSamples: SAMPLES_60,
  sliceStatus: {}, sliceMigrated: {}, sliceErrors: {},
};

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountXm() {
  location.hash = '#/';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/xmigrate', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(XmigrateView as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([JOB]);
  xbConflicts.mockReset();
  (Element.prototype as any).scrollIntoView = vi.fn();
});

async function openDetail(host: HTMLElement) {
  (host.querySelector('[aria-label^="作业详情"]') as HTMLButtonElement).click();
  await settle();
  return document.querySelector('[data-test="xm-detail-conflicts"]') as HTMLElement;
}

/* 游标分页桩：200/页，共 450 条样本三页拉满（v2 samples 元素形态 {_id,ts,reason?}） */
const mkPage = (from: number, n: number, next: string | null) => ({
  samples: Array.from({ length: n }, (_, i) => ({ _id: 'conf-' + (from + i), ts: 1700000000000 + i, reason: i % 3 === 0 ? '目标已存在同 _id' : undefined })),
  nextCursor: next,
  total: 450,
});

describe('1121 冲突分页', () => {
  it('默认窗口：conflictSamples 只显示前 50 条；加载按钮在场', async () => {
    const { app, host } = await mountXm();
    const sec = await openDetail(host);
    const items = sec.querySelectorAll('.xm-detail-list li');
    expect(items.length, '默认 50 条窗口').toBe(50);
    expect(items[0].textContent).toContain('doc-0');
    expect(sec.textContent, '总冲突计数显示').toContain('总冲突 450');
    expect(sec.querySelector('[data-test="xm-conflicts-loadall"]'), '加载全部按钮在场').toBeTruthy();
    app.unmount();
  }, 8000);

  it('游标分页拉满：首页无 cursor、后续带 nextCursor；v2 samples 取 _id 展示；完成后按钮退场', async () => {
    xbConflicts.mockReset()
      .mockResolvedValueOnce(mkPage(0, 200, 'c1'))
      .mockResolvedValueOnce(mkPage(200, 200, 'c2'))
      .mockResolvedValueOnce(mkPage(400, 50, null));
    const { app, host } = await mountXm();
    const sec = await openDetail(host);
    (sec.querySelector('[data-test="xm-conflicts-loadall"]') as HTMLButtonElement).click();
    await settle(12);
    expect(xbConflicts).toHaveBeenCalledTimes(3);
    expect(xbConflicts.mock.calls[0][0]).toBe('j-cf');
    expect(xbConflicts.mock.calls[0][1]).toEqual({ cursor: undefined, limit: 200 });
    expect(xbConflicts.mock.calls[1][1]).toEqual({ cursor: 'c1', limit: 200 });
    expect(xbConflicts.mock.calls[2][1]).toEqual({ cursor: 'c2', limit: 200 });
    /* v2 samples 元素形态取 _id 展示（不是 [object Object]） */
    const items = sec.querySelectorAll('.xm-detail-list li');
    expect(items.length, '全量 450 条拉满').toBe(450);
    expect(items[0].textContent).toContain('conf-0');
    expect(items[399].textContent).toContain('conf-399');
    expect(sec.textContent).not.toContain('[object Object]');
    expect(sec.querySelector('[data-test="xm-conflicts-loadall"]'), '拉满后按钮退场').toBeNull();
    app.unmount();
  }, 12000);

  it('环上限 1000 封顶：nextCursor 仍在但样本满 1000 即停（不无限翻页）', async () => {
    let page = 0;
    xbConflicts.mockReset().mockImplementation(async () => {
      page += 1;
      /* 恒回 nextCursor（异常环）：第 5 页后 all.length>=1000 应停止 */
      return mkPage((page - 1) * 200, 200, 'cursor-ever-' + page);
    });
    const { app, host } = await mountXm();
    const sec = await openDetail(host);
    (sec.querySelector('[data-test="xm-conflicts-loadall"]') as HTMLButtonElement).click();
    await settle(20);
    expect(xbConflicts.mock.calls.length, '1000/200=5 页封顶').toBe(5);
    expect(sec.querySelectorAll('.xm-detail-list li').length).toBe(1000);
    expect(sec.querySelector('[data-test="xm-conflicts-loadall"]'), '封顶后按钮退场').toBeNull();
    app.unmount();
  }, 12000);

  it('分页中途失败：通知错误不清已追加内容（已拉到的行保留）', async () => {
    xbConflicts.mockReset()
      .mockResolvedValueOnce(mkPage(0, 200, 'c1'))
      .mockRejectedValueOnce(new Error('网络中断'));
    const { app, host, } = await mountXm();
    const sec = await openDetail(host);
    (sec.querySelector('[data-test="xm-conflicts-loadall"]') as HTMLButtonElement).click();
    await settle(12);
    expect(sec.querySelectorAll('.xm-detail-list li').length, '已拉到的 200 条保留').toBe(200);
    expect(sec.querySelector('[data-test="xm-conflicts-loadall"]'), '失败后可再试（按钮在场）').toBeTruthy();
    app.unmount();
  }, 12000);
});
