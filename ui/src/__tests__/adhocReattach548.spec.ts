/**
 * 五百四十八批 W3：轨2 执行链残面 —— Adhoc 运行中作业重挂提示 + 监控速率观测 + RawIo 判空口径统一。
 *
 *  ① 重挂提示（行为三态）：job 为内存态，刷新后 resumeScene 把 step>3 钳回 3，运行中作业失联，
 *     唯一回路是最近作业表 Eye 钮。step0（首页）且 allJobs（api.adhoc.jobs() 消费形态）存在
 *     RUNNING 作业时出非阻断提示条（data-test="adhoc-reattach-hint"）；「回到监控」钮复用既有
 *     watchJob（拉状态+startPolling 同链路，不自造轮询），切回监控步（step=4）后提示条随条件
 *     隐没。resumeScene 既有 step 裁决零触碰（adhocStateMachine/adhocStepPersist 锁不动）。
 *  ② 速率观测（源码锚+行为）：监控步进度区 data-test="adhoc-rate" —— Σcreated 对轮询采样时间
 *     差分（XmigrateView rateOf 范式移植，Xm 文件零触碰），采样差>0 出 docs/s + 已耗时；
 *     首拍无差分不出速率（不冒充）；零新增定时器（采样源=既有 useAutoRefresh 监控轮询）。
 *  ③ RawIo 判空双口径统一（546 裁决=notify 不开空弹窗）：AdhocRebuildView 与 SqlConsoleView
 *     的 openRawIo 改六视图同款「判空 notify → return」形态（rawIoPave546 六页同文案）；
 *     特征子串逐字保留（rawIo545 spec 的 last('/adhoc-rebuild/') 与 all().find 排 translate
 *     字面锁），行为侧无记录时 notify 且不开弹窗（RawIoModal 空态 EmptyState 归弹窗自身兜底，
 *     不再以空 rec 开弹窗）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  adhocJobs: vi.fn(),
  adhocStatus: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      keys: async () => [],
      clustersList: async () => [],
      clusterIndices: async () => [],
      overview: async () => ({}),
      clusterHealth: async () => ({}),
      adhoc: { ...orig.api.adhoc, jobs: mocks.adhocJobs, status: mocks.adhocStatus },
    },
  };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useAppStore } from '../stores/app';
import { ioRecorder } from '../api';
import AdhocRebuildView from '../views/AdhocRebuildView.vue';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const settle = async (n = 12) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp({ render: () => h(AdhocRebuildView) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, store: useAppStore(pinia) };
}

const RUNNING_JOB = { jobId: 'j-run-9', logicalName: 'lost_idx', strategy: 'WRITE_BLOCK', status: 'RUNNING', stage: 'FULL_REINDEX', startedAt: 1700000000000 };

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  ioRecorder.clear();
  mocks.adhocJobs.mockReset();
  mocks.adhocStatus.mockReset();
  mocks.adhocJobs.mockResolvedValue([]);
  mocks.adhocStatus.mockResolvedValue({});
});

/* ═══ ═══════════ ① 重挂提示三态 ═══════════ ═══ */
describe('五百四十八批①：Adhoc 运行中作业重挂提示', () => {
  it('无 RUNNING 作业：不出提示条（终态作业不算）', async () => {
    mocks.adhocJobs.mockResolvedValue([{ ...RUNNING_JOB, status: 'SUCCEEDED', stage: 'DONE' }]);
    const { app, host } = await mountView();
    expect(host.querySelector('[data-test="adhoc-reattach-hint"]'), '终态不提示').toBeNull();
    app.unmount();
  });

  it('有 RUNNING 作业且在 step0：提示条在场 + jobId 摘要 + 「回到监控」钮', async () => {
    mocks.adhocJobs.mockResolvedValue([RUNNING_JOB]);
    const { app, host } = await mountView();
    const hint = host.querySelector('[data-test="adhoc-reattach-hint"]');
    expect(hint, '运行中作业必须出重挂提示条').toBeTruthy();
    expect(hint!.textContent).toContain('检测到运行中的重建作业');
    expect(hint!.textContent).toContain('j-run-9');
    expect(hint!.textContent).toContain('可在下方最近作业中点详情回监控');
    expect(host.querySelector('[data-test="adhoc-reattach-go"]'), '「回到监控」钮在场').toBeTruthy();
    app.unmount();
  });

  it('点「回到监控」→ 复用 watchJob 链路：adhoc.status(jobId) 拉取 + step 到监控步 + 提示条收起', async () => {
    mocks.adhocJobs.mockResolvedValue([RUNNING_JOB]);
    mocks.adhocStatus.mockResolvedValue({ jobId: 'j-run-9', status: 'RUNNING', stage: 'FULL_REINDEX' });
    const { app, host } = await mountView();
    (host.querySelector('[data-test="adhoc-reattach-go"]') as HTMLButtonElement).click();
    await settle();
    expect(mocks.adhocStatus).toHaveBeenCalledWith('j-run-9');
    const steps = [...host.querySelectorAll('.steps .step')];
    const act = steps.findIndex(s => /\bact\b/.test(s.className));
    expect(act, '已切到执行监控步（step=4）').toBe(4);
    expect(host.querySelector('[data-test="adhoc-reattach-hint"]'), '切回后提示条收起').toBeNull();
    app.unmount();
  });
});

/* ═══ ═══════════ ② 监控步速率观测 ═══════════ ═══ */
describe('五百四十八批②：监控步速率观测行（data-test=adhoc-rate）', () => {
  it('源码锚：进度区速率行在场（采样差分口径 + 零新增定时器的注释载体）', () => {
    const v = read('../views/AdhocRebuildView.vue');
    expect(v).toContain('data-test="adhoc-rate"');
    expect(v).toContain('reindexRate');
    expect(v).toContain('jobElapsedMs');
  });

  it('行为：首拍无差分不出 docs/s（不冒充速率）+ 已耗时报出；二次采样差>0 出 docs/s', async () => {
    const startedAt = Date.now() - 8000;
    mocks.adhocJobs.mockResolvedValue([{ ...RUNNING_JOB, jobId: 'j-rate' }]);
    mocks.adhocStatus.mockResolvedValue({ jobId: 'j-rate', status: 'RUNNING', stage: 'FULL_REINDEX', startedAt, currentProgress: { created: 100, total: 1000 } });
    const { app, host } = await mountView();
    (host.querySelector('button[aria-label="查看任务详情"]') as HTMLButtonElement).click();
    await settle();
    const rateRow = host.querySelector('[data-test="adhoc-rate"]');
    expect(rateRow, '监控步速率观测行在场').toBeTruthy();
    expect(rateRow!.textContent).not.toContain('docs/s');
    expect(rateRow!.textContent).toContain('已耗时');

    /* 第二次轮询采样：Σcreated 100→400，差分>0 → docs/s 在场（采样源=既有 2s 监控轮询） */
    mocks.adhocStatus.mockResolvedValue({ jobId: 'j-rate', status: 'RUNNING', stage: 'FULL_REINDEX', startedAt, currentProgress: { created: 400, total: 1000 } });
    await new Promise(r => setTimeout(r, 2300));
    await settle();
    const after = host.querySelector('[data-test="adhoc-rate"]');
    expect(after, '速率行仍在').toBeTruthy();
    expect(after!.textContent).toMatch(/docs\/s/);
    app.unmount();
  });
});

/* ═══ ═══════════ ③ RawIo 判空双口径统一（546 notify 口径） ═══════════ ═══ */
describe('五百四十八批③：openRawIo 判空统一（notify 不开空弹窗）', () => {
  it('AdhocRebuildView：last(\'/adhoc-rebuild/\') 特征逐字保留 + 546 判空形态（notify→return→开弹窗；552 同步更新：last 扩 /config-lab/ 回退）', () => {
    const v = read('../views/AdhocRebuildView.vue');
    /* 五百五十二批同步更新：步②审编校验走 /config-lab/validate（不在 /adhoc-rebuild/ 特征下），
       last 取数扩回退链；特征子串与判空 notify 形态逐字保留 */
    expect(v).toContain("const rec = ioRecorder.last('/adhoc-rebuild/') ?? ioRecorder.last('/config-lab/');");
    expect(v).toContain("if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }");
    expect(v).toMatch(/return; \}\s*rawIoRec\.value = rec;\s*rawIoShow\.value = true;/);
  });

  it('SqlConsoleView：last(\'/cluster/sql/\', \'sql\') 双参特征（550 同步更新）+ 546 判空形态', () => {
    const s = read('../views/SqlConsoleView.vue');
    /* 550 同步更新：原锁钉 546 收紧形态「all().find 排 translate」；550 批退役该补丁，
       改 last(pathSub, kind) 双参收口（kind='sql' 只打执行链，translate 未打标天然排除，
       语义等价同步更新）。判空 notify 形态与赋值链 548 语义零触碰 */
    expect(s).toContain("const rec = ioRecorder.last('/cluster/sql/', 'sql');");
    expect(s).toContain("if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }");
    expect(s).toMatch(/return; \}\s*rawIoRec\.value = rec;\s*rawIoShow\.value = true;/);
  });

  it('行为：记录环空时点 Adhoc「原始 IO」→ notify 引导且不开弹窗（546 裁决行为侧）', async () => {
    const { app, host, store } = await mountView();
    const notifySpy = vi.spyOn(store, 'notify');
    const btn = host.querySelector<HTMLButtonElement>('[aria-label="查看原始 IO（探测评估）"]');
    expect(btn, '评估分节原始 IO 钮在场').toBeTruthy();
    btn!.click();
    await settle();
    expect(notifySpy).toHaveBeenCalledWith('info', expect.stringContaining('暂无原始 IO 记录'));
    expect(document.body.querySelector('.rim-url'), '判空不开空弹窗').toBeNull();
    app.unmount();
  });
});
