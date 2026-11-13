/**
 * 五百二十九批 W-C：xmigrate 进度可观测字段全链（前端消费面挂载锁）。
 * 后端契约（同批 Java）：MigrateJobES 新增 startedAtMs/finishedAtMs（Long，作业
 * start/resume 打点 + 终态打点，resume 重置）与 sliceErrors:Map<sliceId,count>。
 * 锁定：
 *   ① 耗时人话化——startedAtMs/finishedAtMs 齐备 → 进度列观测行 .xm-p-obs 显示（42s 形态）；
 *   ② 速率——RUNNING + sliceMigrated Σ → 「N docs/s」（任务书口径 ΣsliceMigrated/耗时）；
 *   ③ 失败切片红 chip——sliceErrors 有值的切片 → .xm-sfail「#2 ×2」，无值切片不显；
 *   ④ 存量降级——旧 JSON 无任何新字段 → 观测行/失败 chip 全部静默不显（null 安全）。
 * 挂真组件（xmigrateJobDeepLink527 同款最小 mock 面）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
/* 八百零五批：视图改静态 import——动态 import 全模块图落在首例超时墙内=本 spec 二十批
   连红的结构根因（545/550 两度提墙治标未愈），模块图移到测试求值期加载（一切超时墙
   之外；vi.mock 由 vitest 提升到 import 之前，api mock 先行不受影响） */
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();

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
      xb: { ...actual.api.xb, jobs: (...a: any[]) => xbJobs(...a), destIndices: async () => [] },
    },
  };
});

const NOW = Date.now();
/* finishedAtMs-startedAtMs=42000ms → humanElapsed=「42s」；sliceMigrated {0:210,1:90}=300 条/42s≈7 docs/s */
const NEW_JOB = {
  jobId: 'job-new-1', status: 'DONE', destIndex: 'dest-new', sourceIndex: 'src-new',
  remoteEndpoint: '', migrated: 300, total: 300, conflicts: 0, errors: 0,
  createTime: NOW - 60000, startedAtMs: NOW - 42000, finishedAtMs: NOW,
  sliceStatus: { '0': 'DONE', '1': 'DONE', '2': 'DONE' },
  sliceMigrated: { '0': 210, '1': 90, '2': 0 },
  sliceErrors: { '2': 2 },
};
/* RUNNING 作业：startedAtMs 在、无 finishedAtMs（进行中耗时用 now 推算）+速率可达 */
const RUNNING_JOB = {
  jobId: 'job-run-1', status: 'RUNNING', destIndex: 'dest-run', sourceIndex: 'src-run',
  remoteEndpoint: '', migrated: 5000, total: 10000, conflicts: 0, errors: 0,
  createTime: NOW - 30000, startedAtMs: NOW - 30000, finishedAtMs: null,
  sliceStatus: { '0': 'RUNNING' }, sliceMigrated: { '0': 5000 },
};
/* 旧文档：无任何新字段（存量兼容面） */
const LEGACY_JOB = {
  jobId: 'job-old-1', status: 'DONE', destIndex: 'dest-old', sourceIndex: 'src-old',
  remoteEndpoint: '', migrated: 7, total: 7, conflicts: 0, errors: 0,
  createTime: NOW - 90000, sliceStatus: {},
};

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountXm() {
  location.hash = '#/';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }, { path: '/xmigrate', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(XmigrateView as any) });
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
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset();
  xbJobs.mockResolvedValue([]);
});

describe('xmigrate 进度观测字段消费（529 批，挂载）', () => {
  /* 五百四十五批：首挂载动态 import 冷启动 ~5s 节奏，墙两度提至 8000ms（断言零变）。
     八百零五批根治：冷启动已移出测试墙（见顶部静态 import 注），墙内只剩暖挂载成本，
     8000 墙保留作冷 JIT 双保险 */
  it('耗时人话化：finishedAtMs-startedAtMs=42s → 进度列观测行显示 42s', async () => {
    xbJobs.mockResolvedValue([NEW_JOB]);
    const { app, host } = await mountXm();
    const obs = host.querySelector('.xm-p-obs');
    expect(obs, '有 startedAtMs/finishedAtMs 必须出观测行').toBeTruthy();
    expect(obs!.textContent).toContain('42s');
    app.unmount();
  }, 8000);

  it('速率：sliceMigrated Σ/耗时 → 「N docs/s」（任务书口径）', async () => {
    xbJobs.mockResolvedValue([NEW_JOB]);
    const { app, host } = await mountXm();
    const obs = host.querySelector('.xm-p-obs')!;
    expect(obs.textContent).toMatch(/docs\/s/);
    expect(obs.textContent).toContain('7'); // 300 条 / 42s ≈ 7 docs/s
    app.unmount();
  });

  it('失败切片红 chip：sliceErrors 有值切片显「#2 ×2」，无值切片不显', async () => {
    xbJobs.mockResolvedValue([NEW_JOB]);
    const { app, host } = await mountXm();
    const chips = [...host.querySelectorAll('.xm-sfail')];
    expect(chips.length, '只有 sliceErrors 有值的切片出 chip').toBe(1);
    expect(chips[0].textContent).toContain('#2');
    expect(chips[0].textContent).toContain('×2');
    app.unmount();
  });

  it('RUNNING：无 finishedAtMs 用 now 推算耗时（观测行在场）', async () => {
    xbJobs.mockResolvedValue([RUNNING_JOB]);
    const { app, host } = await mountXm();
    expect(host.querySelector('.xm-p-obs'), '进行中也有耗时（now 推算）').toBeTruthy();
    expect(host.querySelector('.xm-p-obs')!.textContent).toMatch(/docs\/s/);
    app.unmount();
  });

  it('存量降级：旧 JSON 无新字段 → 观测行/失败 chip 全部静默不显', async () => {
    xbJobs.mockResolvedValue([LEGACY_JOB]);
    const { app, host } = await mountXm();
    expect(host.querySelector('.xm-p-obs'), '无 startedAtMs 不显耗时（不假装已知）').toBeNull();
    expect(host.querySelector('.xm-sfails'), '无 sliceErrors 不显失败 chip').toBeNull();
    expect(host.querySelector('.qrt-tbl tbody tr'), '作业行照常渲染').toBeTruthy();
    app.unmount();
  });
});
