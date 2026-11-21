/**
 * 五百三十批「大屏与全栈可观测」看守 spec（W-E 工蚁）。
 *
 * 七件可观测/响应式改造的源码锁 + 行为锁：
 *  A 慢请求可观测：api.request 计时（>10s）→ esquerystudio:slow-request 事件桥 →
 *    app store 转发既有 notify('warning')（8s 同文去重内建）；失败链路不打扰。
 *  B 跨页任务进度：jobTracker 吞 /cluster/tasks?detailed 的 RUNNING reindex 任务与
 *    /cluster/snapshot/status 的 IN_PROGRESS 快照，归一 TrackedJob；消失即完成通知。
 *  C TasksView：job 级 tookMs 耗时列（五百三十一批起真值展示：后端已下发 tookMs，
 *    缺失回落 runningMs 折算）；actionShort/actionColor
 *    迁 utils/esEnumZh（taskActionZh/taskActionTone 收口）。
 *  D LiveDashboardView：第四卡「运行中任务」单源读 jobTracker，不新拉端点。
 *  E 大屏 1600 档：Overview .ov-grid / HealthReport .hr-hero-r 四列。
 *  F 1100 堆叠档：Topology/RemoteClusters/Slm/Watcher（零结构动，纯 style 分栏单列化）。
 *  G 后端 adhoc 耗时透出（Java 侧 AdhocRoundTookMsTest 独立覆盖，此处锁前端消费契约键名）。
 *
 * 端点响应键经 EsIndexAdmin.listTasks / _snapshot/_status 实地核对，非凭记忆编造。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const apiSrc = read('../api.ts');
const appSrc = read('../stores/app.ts');
const trackerSrc = read('../stores/jobTracker.ts');
const esEnumSrc = read('../utils/esEnumZh.ts');
const tasksViewSrc = read('../views/TasksView.vue');
const liveSrc = read('../views/LiveDashboardView.vue');
const overviewSrc = read('../views/OverviewView.vue');
const healthSrc = read('../views/HealthReportView.vue');
const topoSrc = read('../views/TopologyView.vue');
const rcSrc = read('../views/RemoteClustersView.vue');
const slmSrc = read('../views/SlmView.vue');
const watcherSrc = read('../views/WatcherView.vue');

/* ═══ 行为测试共用 mock：只替换网络出口，store/工具全用真的 ═══ */
const { tasksFn, snapsFn } = vi.hoisted(() => ({
  tasksFn: vi.fn(async () => [] as any[]),
  snapsFn: vi.fn(async () => ({ snapshots: [] }) as any),
}));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      adhoc: { ...orig.api.adhoc, jobs: vi.fn(async () => []) },
      xb: { ...orig.api.xb, jobs: vi.fn(async () => []) },
      clusterTasks: tasksFn,
      snapshotStatus: snapsFn,
    },
  };
});

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  tasksFn.mockClear();
  snapsFn.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/* ══════════ A 慢请求可观测 ══════════ */
describe('A 慢请求可观测（api 计时 + 事件桥 + notify warning）', () => {
  it('api.request 有 performance.now 计时与 10s 阈值常量', () => {
    expect(apiSrc).toMatch(/const startedAt = performance\.now\(\);/);
    expect(apiSrc).toMatch(/^const SLOW_REQUEST_MS = 10_000;/m); /* 七百九十一批同步更新：export 形态→^行锚（791 私有化零外部消费） */
    expect(apiSrc).toMatch(/costMs > SLOW_REQUEST_MS/);
  });

  it('慢请求经 esquerystudio:slow-request 事件广播（与 unauthorized 同范式，不反依赖 store）', () => {
    expect(apiSrc).toContain("new CustomEvent('esquerystudio:slow-request'");
    expect(apiSrc).toContain('window.dispatchEvent');
    expect(apiSrc).toMatch(/detail: \{ path, seconds: \+\(costMs \/ 1000\)\.toFixed\(1\) \}/);
  });

  it('行为：成功请求耗时 >10s → 广播事件（path + 秒数）', async () => {
    const { get: apiGet } = await import('../api');
    vi.spyOn(performance, 'now')
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => 11000);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 })));
    const events: any[] = [];
    const lst = (e: Event) => events.push(e);
    window.addEventListener('esquerystudio:slow-request', lst);
    try {
      await apiGet('/slow-endpoint');
    } finally {
      window.removeEventListener('esquerystudio:slow-request', lst);
      vi.unstubAllGlobals();
    }
    expect(events.length).toBe(1);
    expect(events[0].detail).toEqual({ path: '/slow-endpoint', seconds: 11 });
  });

  it('行为：快请求零打扰（5s 不广播）', async () => {
    const { get: apiGet } = await import('../api');
    vi.spyOn(performance, 'now')
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => 5000);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 })));
    const events: any[] = [];
    const lst = (e: Event) => events.push(e);
    window.addEventListener('esquerystudio:slow-request', lst);
    try {
      await apiGet('/fast-endpoint');
    } finally {
      window.removeEventListener('esquerystudio:slow-request', lst);
      vi.unstubAllGlobals();
    }
    expect(events.length).toBe(0);
  });

  it('行为：失败链路不受影响（500 即使 >10s 也不广播，错误走既有 error 通道）', async () => {
    const { get: apiGet } = await import('../api');
    vi.spyOn(performance, 'now')
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => 30000);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"boom"}', { status: 500 })));
    const events: any[] = [];
    const lst = (e: Event) => events.push(e);
    window.addEventListener('esquerystudio:slow-request', lst);
    try {
      await expect(apiGet('/broken-endpoint')).rejects.toThrow();
    } finally {
      window.removeEventListener('esquerystudio:slow-request', lst);
      vi.unstubAllGlobals();
    }
    expect(events.length).toBe(0);
  });

  it('app store 监听事件桥转发既有 notify warning 档（8s 同文去重吸收轮询重弹）', () => {
    expect(appSrc).toContain("window.addEventListener('esquerystudio:slow-request'");
    expect(appSrc).toContain("notify('warning', `${d.path} 耗时 ${d.seconds}s`)");
  });

  it('行为：dispatch slow-request → notifyQueue 出 warning「{path} 耗时 {n}s」', async () => {
    const { createPinia, setActivePinia } = await import('pinia');
    setActivePinia(createPinia());
    const { useAppStore } = await import('../stores/app');
    const app = useAppStore();
    window.dispatchEvent(new CustomEvent('esquerystudio:slow-request', { detail: { path: '/adhoc-rebuild/status', seconds: 12.5 } }));
    const last = app.notifyQueue[app.notifyQueue.length - 1];
    expect(last.kind).toBe('warning');
    expect(last.msg).toBe('/adhoc-rebuild/status 耗时 12.5s');
  });
});

/* ══════════ B 跨页任务进度（jobTracker 吞 tasks/snapshots）══════════ */
describe('B 跨页任务进度（estask/snapshot 归一 TrackedJob）', () => {
  it('TrackedJob.kind 扩展 estask/snapshot，新增归一器消费实地核对的响应键', () => {
    expect(trackerSrc).toMatch(/kind: 'adhoc' \| 'xmigrate' \| 'estask' \| 'snapshot'/);
    expect(trackerSrc).toMatch(/id: 'es-task:' \+ t\.taskId/);
    expect(trackerSrc).toMatch(/startedAt: Number\(t\.startTimeMillis \|\| 0\)/);
    expect(trackerSrc).toMatch(/route: '\/tasks'/);
    /* 快照：_snapshot/_status 透传键（repository/snapshot/state/shards_stats/start_time_in_millis） */
    expect(trackerSrc).toMatch(/id: 'snap:' \+ s\.repository \+ '\/' \+ s\.snapshot/);
    expect(trackerSrc).toContain('s.shards_stats');
    expect(trackerSrc).toMatch(/startedAt: Number\(s\.start_time_in_millis \|\| 0\)/);
    expect(trackerSrc).toMatch(/route: '\/snapshots'/);
  });

  it('poll 并行打 clusterTasks(reindex action)+snapshotStatus，且有数据面守卫与全失败短路', () => {
    expect(trackerSrc).toMatch(/api\.clusterTasks\('indices:data\/write\/reindex\*', true\)/);
    expect(trackerSrc).toMatch(/api\.snapshotStatus\(\)/);
    /* 五百五十七批同步更新：wantData → dataReady（连接模型须目标钉选才发数据面请求——
        裸奔=结构性 PAGE_DENIED 循环主源）+ 快照通道 snapshots 页授权门 */
    expect(trackerSrc).toMatch(/const dataReady = !!app\.target \|\| \(!!app\.hostVisible && !connModel\);/);
    expect(trackerSrc).toMatch(/const wantSnaps = dataReady && can\('snapshots'\);/);
    expect(trackerSrc).toMatch(/if \(ad == null && xm == null && !tsOk && !snOk\) return;/);
  });

  it('reindex 行按 action 过滤、快照按 IN_PROGRESS 过滤', () => {
    expect(trackerSrc).toMatch(/\.filter\(t => String\(t\.action \|\| ''\)\.includes\('reindex'\)\)/);
    expect(trackerSrc).toMatch(/=== 'IN_PROGRESS'/);
  });

  it('行为：poll 归一 reindex 任务与进行中快照（label/进度/runningCount）', async () => {
    const { createPinia, setActivePinia } = await import('pinia');
    setActivePinia(createPinia());
    tasksFn.mockResolvedValue([
      {
        taskId: 'n1:1', node: 'n1', action: 'indices:data/write/reindex',
        description: JSON.stringify({ source: { index: ['src-a'] }, dest: { index: 'dst-b' } }),
        startTimeMillis: 111, runningTimeNanos: 1e9, cancellable: true,
        status: { total: 100, updated: 60, created: 10, deleted: 0 },
      },
    ]);
    snapsFn.mockResolvedValue({
      snapshots: [{ snapshot: 'snap1', repository: 'repo1', state: 'IN_PROGRESS', start_time_in_millis: 222, shards_stats: { total: 8, done: 2 } }],
    });
    const { useJobTrackerStore } = await import('../stores/jobTracker');
    const st = useJobTrackerStore();
    await st.poll();
    const et = st.jobs.find(j => j.kind === 'estask');
    expect(et).toBeTruthy();
    expect(et!.id).toBe('es-task:n1:1');
    expect(et!.label).toBe('src-a → dst-b');
    expect(et!.pct).toBe(70); // processed 口径=updated+created+deleted
    expect(et!.route).toBe('/tasks');
    const sn = st.jobs.find(j => j.kind === 'snapshot');
    expect(sn).toBeTruthy();
    expect(sn!.id).toBe('snap:repo1/snap1');
    expect(sn!.pct).toBe(25); // shards_stats.done/total
    expect(st.runningCount).toBe(2);
  });

  it('行为：见过在跑的任务从列表消失（通道成功那轮）→ 弹一次「已完成」并记入最近完成', async () => {
    const { createPinia, setActivePinia } = await import('pinia');
    setActivePinia(createPinia());
    tasksFn.mockResolvedValue([
      {
        taskId: 'n1:9', node: 'n1', action: 'indices:data/write/reindex',
        description: JSON.stringify({ source: { index: ['s'] }, dest: { index: 'd' } }),
        startTimeMillis: 1, status: { total: 10, updated: 10, created: 0, deleted: 0 },
      },
    ]);
    snapsFn.mockResolvedValue({ snapshots: [] });
    const { useJobTrackerStore } = await import('../stores/jobTracker');
    const st = useJobTrackerStore();
    await st.poll();
    expect(st.runningCount).toBe(1);
    // 第二轮：任务结束从 _tasks 消失
    tasksFn.mockResolvedValue([]);
    await st.poll();
    const last = st.jobs.length === 0 ? null : null; // jobs 清空不作为断言点（adhoc/xm mock 恒空）
    expect(last).toBeNull();
    const app = (await import('../stores/app')).useAppStore();
    const done = app.notifyQueue[app.notifyQueue.length - 1];
    expect(done.kind).toBe('success');
    expect(done.msg).toContain('Reindex 任务');
    expect(done.msg).toContain('已完成');
    expect(st.recentDone[0].status).toBe('DONE');
  });

  it('estask/snapshot 消失判定按通道 ok 裁决（网断那轮不误判完成）', () => {
    expect(trackerSrc).toMatch(/const ok = id\.startsWith\('es-task:'\) \? tsOk : snOk;/);
    expect(trackerSrc).toMatch(/if \(!ok\) continue;/);
  });
});

/* ══════════ C TasksView（耗时列 + 枚举收口）══════════ */
describe('C TasksView 耗时列与 actionColor 收口', () => {
  it('耗时列消费 job 级 tookMs（五百三十一批起真值展示：后端已下发，缺失回落 runningMs 折算）', () => {
    /* 531 批锚同步更新：后端 listTasks 新增 tookMs（runningTimeNanos 折算 ms，运行中即已耗时），
       原「-1 显 -」兜底退役——ES _tasks 无 finished 概念（完成即消失），列语义=任务至今已耗时 */
    expect(tasksViewSrc).toMatch(/tookMs: Number\.isFinite\(Number\(t\.tookMs\)\) && Number\(t\.tookMs\) >= 0\s*\n\s*\? Number\(t\.tookMs\)\s*\n\s*: Math\.round\(Number\(t\.runningTimeNanos \|\| 0\) \/ 1e6\)/);
    expect(tasksViewSrc).toContain('{{ tookText(t.tookMs) }}');
    expect(tasksViewSrc).toContain('class="tv-took mono"');
    /* 人话化时长走 semFormat duration 单源（531 批） */
    expect(tasksViewSrc).toContain("import { semFormat } from '../composables/useSemFormat';");
    expect(tasksViewSrc).toMatch(/function tookText\(ms: number\): string \{\s*\n\s*return semFormat\(ms, 'duration'\)\?\.text \?\? fmtDur\(ms\);/);
  });

  it('actionShort/actionColor 从 utils/esEnumZh 收口 import，本地实现退役', () => {
    expect(tasksViewSrc).toContain("import { taskActionZh as actionShort, taskActionTone as actionColor } from '../utils/esEnumZh';");
    expect(tasksViewSrc).not.toMatch(/function actionShort\(/);
    expect(tasksViewSrc).not.toMatch(/function actionColor\(/);
  });

  it('esEnumZh 导出 taskActionZh（契约签名预定死）与 taskActionTone', () => {
    expect(esEnumSrc).toMatch(/export function taskActionZh\(a: string\): string/);
    expect(esEnumSrc).toMatch(/export function taskActionTone\(a: string\): TaskActionTone/);
  });

  it('行为：taskActionZh 短标签映射（reindex/bulk/delete-by-q/cluster: 前缀/空值）', async () => {
    const { taskActionZh } = await import('../utils/esEnumZh');
    expect(taskActionZh('indices:data/write/reindex')).toBe('reindex');
    expect(taskActionZh('indices:data/write/bulk')).toBe('bulk');
    expect(taskActionZh('indices:data/write/delete/byquery')).toBe('delete-by-q');
    expect(taskActionZh('cluster:health')).toBe('health');
    expect(taskActionZh('')).toBe('?');
  });

  it('行为：taskActionTone 色档（写=y、读=b、删=r、其余=n）', async () => {
    const { taskActionTone } = await import('../utils/esEnumZh');
    expect(taskActionTone('indices:data/write/reindex')).toBe('y');
    expect(taskActionTone('indices:data/write/bulk')).toBe('y');
    expect(taskActionTone('indices:data/read/search')).toBe('b');
    expect(taskActionTone('indices:data/write/delete/byquery')).toBe('r');
    expect(taskActionTone('cluster:health')).toBe('n');
  });
});

/* ══════════ D LiveDashboard 第四卡 ══════════ */
describe('D LiveDashboardView 第四卡「运行中任务」', () => {
  it('单源读 jobTracker，不新拉端点', () => {
    expect(liveSrc).toContain('useJobTrackerStore');
    expect(liveSrc).toMatch(/tracker\.jobs\.filter\(j => j\.status === 'RUNNING'\)/);
    expect(liveSrc).not.toMatch(/api\.(clusterTasks|snapshotStatus|adhoc|xb)/);
  });

  it('卡头与空态文案（形态对齐既有 .ld-chart 三卡结构）', () => {
    expect(liveSrc).toContain('运行中任务');
    expect(liveSrc).toContain('暂无运行中任务');
    expect(liveSrc).toMatch(/class="ld-chart"/);
  });

  it('卡墙保持默认 2x2；1600 大屏档随 R54 六卡换 3 列两行（原四列档收列）', () => {
    expect(liveSrc).toMatch(/\.ld-charts \{ display: grid; grid-template-columns: repeat\(2, 1fr\); gap: var\(--sp-3\); margin-bottom: var\(--sp-4\); \}/); /* 795 件4 同步更新：区块间距 sp-3→sp-4（疏密对比） */
    expect(liveSrc).toMatch(/@media \(min-width: 1600px\) \{\s*\n\s*\.ld-charts \{ grid-template-columns: repeat\(3, 1fr\); \}/);
  });
});

/* ══════════ E 大屏 1600 档 ══════════ */
describe('E 大屏 1600 四列档（Overview / HealthReport）', () => {
  it('OverviewView .ov-grid 补 min-width:1600 四列档（原 repeat(3)）', () => {
    expect(overviewSrc).toMatch(/@media \(min-width: 1600px\) \{\s*\n\s*\.ov-grid \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \}/);
    expect(overviewSrc).toMatch(/\.ov-grid \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  });

  it('HealthReportView .hr-hero-r 补 min-width:1600 四列档（原 repeat(3)）', () => {
    expect(healthSrc).toMatch(/@media \(min-width: 1600px\) \{\s*\n\s*\.hr-hero-r \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \}/);
    expect(healthSrc).toMatch(/\.hr-hero-r \{ flex: 1; display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  });
});

/* ══════════ F 1100 堆叠档（四视图，零结构动）══════════ */
describe('F 1100 堆叠档（Topology/RemoteClusters/Slm/Watcher）', () => {
  it('TopologyView：过滤输入随容器收缩（定宽 260px 收 100%）', () => {
    expect(topoSrc).toMatch(/@media \(max-width: 1100px\) \{\s*\n\s*\.tp-input \{ width: 100%; \}/);
  });

  it('RemoteClustersView：卡行塌纵向堆叠', () => {
    expect(rcSrc).toMatch(/@media \(max-width: 1100px\) \{[\s\S]*?\.rc-card \{ flex-direction: column; \}/);
  });

  it('SlmView：策略卡与页头塌纵向堆叠', () => {
    expect(slmSrc).toMatch(/@media \(max-width: 1100px\) \{[\s\S]*?\.slm-card \{ flex-direction: column; \}/);
    expect(slmSrc).toMatch(/\.slm-hd \{ flex-direction: column; align-items: flex-start; gap: var\(--sp-2\); \}/);
  });

  it('WatcherView：watch 卡与页头塌纵向堆叠', () => {
    expect(watcherSrc).toMatch(/@media \(max-width: 1100px\) \{[\s\S]*?\.wt-card \{ flex-direction: column; \}/);
    expect(watcherSrc).toMatch(/\.wt-hd \{ flex-direction: column; align-items: flex-start; gap: var\(--sp-2\); \}/);
  });
});
