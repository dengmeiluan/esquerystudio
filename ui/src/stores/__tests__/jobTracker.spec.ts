import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { api } from '../../api';
import { useJobTrackerStore } from '../jobTracker';
import { useAppStore } from '../app';

/* R78：全局作业跟踪器的契约锁——顶栏进度徽标与「跑完自动通知」的数据源。
   这里锁死三条最容易回归的语义：①没亲眼见过在跑的历史作业不许补弹通知；
   ②同一作业终态只弹一次（刷新/重挂载不重复）；③两类接口全失败时不许谎报「没有作业」。 */

function adhoc(jobId: string, status: string, stage = 'REINDEX') {
  return { jobId, logicalName: 'idx-' + jobId, strategy: 'ALIAS', status, stage, startedAt: 1000 };
}
function xm(jobId: string, status: string, migrated = 0, total = 0) {
  return { jobId, status, destIndex: 'dest-' + jobId, sourceIndex: 'src', migrated, total, createTime: 2000 };
}

let adhocJobs: any = [];
let xmJobs: any = [];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setActivePinia(createPinia());
  adhocJobs = []; xmJobs = [];
  vi.spyOn(api.adhoc, 'jobs').mockImplementation(async () => {
    if (adhocJobs === null) throw new Error('boom');
    return adhocJobs;
  });
  vi.spyOn(api.xb, 'jobs').mockImplementation(async () => {
    if (xmJobs === null) throw new Error('boom');
    return xmJobs;
  });
  /* 五百三十批随迁：tracker 增吞 tasks/snapshots 两通道，本 spec 只锁 adhoc/xm 语义——
     两新通道统一 stub 失败（setupFetchGuard 的空 200 兜底会伪装成功清空清单），
     使原「全失败保留上一轮」「单类失败不拖垮」断言在四通道形态下语义不变 */
  vi.spyOn(api, 'clusterTasks').mockImplementation(async () => { throw new Error('boom'); });
  vi.spyOn(api, 'snapshotStatus').mockImplementation(async () => { throw new Error('boom'); });
});

describe('jobTracker 全局作业跟踪（R78）', () => {
  it('运行中作业进入 running，进度按 migrated/total 归一', async () => {
    adhocJobs = [adhoc('a1', 'RUNNING')];
    xmJobs = [xm('x1', 'RUNNING', 30, 120)];
    const jt = useJobTrackerStore();
    await jt.poll();
    expect(jt.runningCount).toBe(2);
    const x = jt.running.find(j => j.kind === 'xmigrate')!;
    expect(x.pct).toBe(25);
    expect(x.label).toBe('dest-x1');
    // adhoc 不报文档数：pct=-1 表示「只有阶段可展示」，不许伪造 0%
    expect(jt.running.find(j => j.kind === 'adhoc')!.pct).toBe(-1);
    // 有进度的取均值（adhoc 的 -1 不参与）
    expect(jt.overallPct).toBe(25);
  });

  it('首次进站看到的历史完成作业不补弹通知', async () => {
    adhocJobs = [adhoc('old', 'SUCCEEDED')];
    xmJobs = [xm('oldx', 'DONE', 10, 10)];
    const app = useAppStore();
    const jt = useJobTrackerStore();
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(0);
    expect(jt.recentDone).toHaveLength(0);
  });

  it('RUNNING → 终态弹一次通知，重复 poll 不再弹', async () => {
    adhocJobs = [adhoc('a1', 'RUNNING')];
    const app = useAppStore();
    const jt = useJobTrackerStore();
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(0);

    adhocJobs = [adhoc('a1', 'SUCCEEDED', 'DONE')];
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(1);
    expect(app.notifyQueue[0].kind).toBe('success');
    /* #86 三轮：原来只断言 msg 含 'idx-a1'。把整条文案削成裸标签 `[idx-a1]`
       （作业类型与成败措辞全丢）后该断言仍绿——「出现过作业名」不等于「说清了发生什么」。
       更致命的是把成/败措辞对调（失败作业显示「已完成」）时全 13 条测试无一变红。
       改成对**成败措辞取值**判定：成功必须说「已完成」，且不得混入失败侧措辞。 */
    expect(app.notifyQueue[0].msg).toContain('托管重建');
    expect(app.notifyQueue[0].msg).toContain('idx-a1');
    expect(app.notifyQueue[0].msg).toContain('已完成');
    expect(app.notifyQueue[0].msg).not.toContain('结束于');
    expect(jt.recentDone).toHaveLength(1);

    await jt.poll();
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(1);
  });

  it('失败/中断算终态并弹 error（迁移的 INTERRUPTED 也要提醒去续跑）', async () => {
    xmJobs = [xm('x1', 'RUNNING', 5, 10), xm('x2', 'RUNNING', 1, 10)];
    const app = useAppStore();
    const jt = useJobTrackerStore();
    await jt.poll();

    xmJobs = [xm('x1', 'FAILED', 5, 10), xm('x2', 'INTERRUPTED', 1, 10)];
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(2);
    expect(app.notifyQueue.every(n => n.kind === 'error')).toBe(true);
    /* #86 三轮：kind==='error' 只锁了通知的**渠道**，没锁**文案**。
       把成/败措辞对调后，失败作业的正文会写成「已完成」而 kind 仍是 error，
       用户读到的是「已完成」——本批选题正是「误报重建成功/失败」。
       故对文案取值加锁：失败正文必须带状态词，且不得出现「已完成」。 */
    const failMsgs = app.notifyQueue.map(n => n.msg).join('\n');
    expect(failMsgs).toContain('结束于 FAILED');
    expect(failMsgs).toContain('结束于 INTERRUPTED');
    expect(failMsgs).not.toContain('已完成');
    expect(jt.runningCount).toBe(0);
    expect(jt.recentFailed).toBe(2);
  });

  it('跃迁记录持久化：重建 store（等价整页刷新）后同一终态不重复通知', async () => {
    adhocJobs = [adhoc('a1', 'RUNNING')];
    const jt = useJobTrackerStore();
    await jt.poll();

    // 刷新：pinia 重建，sessionStorage 保留
    setActivePinia(createPinia());
    adhocJobs = [adhoc('a1', 'FAILED', 'REINDEX')];
    const app2 = useAppStore();
    const jt2 = useJobTrackerStore();
    await jt2.poll();
    expect(app2.notifyQueue).toHaveLength(1); // 刷新前没弹过，这次要弹

    setActivePinia(createPinia());
    const app3 = useAppStore();
    const jt3 = useJobTrackerStore();
    await jt3.poll();
    expect(app3.notifyQueue).toHaveLength(0); // 已弹过，刷新后不再骚扰
    expect(jt3.recentDone).toHaveLength(1);   // 但「最近完成」仍看得到
  });

  it('两类接口全失败：保留上一轮清单，不谎报空', async () => {
    adhocJobs = [adhoc('a1', 'RUNNING')];
    xmJobs = [xm('x1', 'RUNNING', 1, 10)];
    const jt = useJobTrackerStore();
    await jt.poll();
    expect(jt.runningCount).toBe(2);

    adhocJobs = null; xmJobs = null; // 双双 403/网络断
    await jt.poll();
    expect(jt.runningCount).toBe(2);
    expect(jt.probed).toBe(true);
  });

  it('单类接口失败（如无迁移权限）不拖垮另一类', async () => {
    adhocJobs = [adhoc('a1', 'RUNNING')];
    xmJobs = null;
    const jt = useJobTrackerStore();
    await jt.poll();
    expect(jt.runningCount).toBe(1);
    expect(jt.running[0].kind).toBe('adhoc');
  });

  /* R79：失败通知带原因——后端字段（adhoc.error / xm.message）直接进文案，不逼用户跳页找 */
  it('失败通知携带后端原因字段', async () => {
    adhocJobs = [adhoc('a1', 'RUNNING')];
    xmJobs = [xm('x1', 'RUNNING', 1, 10)];
    const app = useAppStore();
    const jt = useJobTrackerStore();
    await jt.poll();

    adhocJobs = [{ ...adhoc('a1', 'FAILED'), error: 'mapper_parsing_exception: failed to parse field [ts]' }];
    xmJobs = [{ ...xm('x1', 'INTERRUPTED', 1, 10), message: 'scroll timeout after 60s' }];
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(2);
    const msgs = app.notifyQueue.map(n => n.msg).join('\n');
    /* 原因在 jobTracker 侧先友好化再拼接：命中 KNOWN 表的 ES 异常被翻成人话，
       且作业名上下文必须保留（不能被 app.notify 的全句友好化整句替换掉） */
    expect(msgs).toContain('DSL 解析失败');
    expect(msgs).toContain('idx-a1');
    expect(msgs).toContain('scroll timeout after 60s');
  });

  it('成功通知不附带 message（迁移正常结束也会有 message，别把噪声当原因）', async () => {
    xmJobs = [xm('x1', 'RUNNING', 1, 10)];
    const app = useAppStore();
    const jt = useJobTrackerStore();
    await jt.poll();

    xmJobs = [{ ...xm('x1', 'DONE', 10, 10), message: 'migrated 10 docs in 3s' }];
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(1);
    expect(app.notifyQueue[0].kind).toBe('success');
    expect(app.notifyQueue[0].msg).not.toContain('migrated 10 docs');
  });

  /* R79：adhoc 作业是内存态，宿主重启后在跑作业无声蒸发——必须提醒，且只提醒一次 */
  it('在跑的 adhoc 作业从清单消失 → 弹 warning 一次，重复 poll 不再弹', async () => {
    adhocJobs = [adhoc('a1', 'RUNNING')];
    const app = useAppStore();
    const jt = useJobTrackerStore();
    await jt.poll();
    expect(jt.runningCount).toBe(1);

    adhocJobs = []; // 宿主重启：内存态记录全部丢失，接口本身正常返回空
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(1);
    expect(app.notifyQueue[0].kind).toBe('warning');
    /* #86 三轮：原来只断言含 'idx-a1' + '重启'。把整条提醒削成 `idx-a1 重启`
       （为什么消失、ES 侧是否受影响、下一步该做什么，全部销毁）后两条断言仍绿。
       这条通知的价值全在**可执行的指引**上，故对指引要点逐项取值判定。 */
    const vanishMsg = app.notifyQueue[0].msg;
    expect(vanishMsg).toContain('托管重建');
    expect(vanishMsg).toContain('idx-a1');
    expect(vanishMsg).toContain('重启');
    expect(vanishMsg).toContain('内存态');       // 为什么会消失
    expect(vanishMsg).toContain('不受影响');     // ES 侧 reindex 的影响范围
    expect(vanishMsg).toContain('重新发起');     // 下一步动作
    expect(jt.recentDone[0].status).toBe('VANISHED');

    await jt.poll();
    expect(app.notifyQueue).toHaveLength(1);
  });

  it('adhoc 接口失败（非空清单）不误判蒸发', async () => {
    adhocJobs = [adhoc('a1', 'RUNNING')];
    xmJobs = [];
    const app = useAppStore();
    const jt = useJobTrackerStore();
    await jt.poll();

    adhocJobs = null; // 403/网断：看不见 ≠ 消失
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(0);

    adhocJobs = [adhoc('a1', 'RUNNING')]; // 恢复后作业还在，什么都不该弹
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(0);
    expect(jt.runningCount).toBe(1);
  });

  it('接口失败几轮后才蒸发：提醒仍带作业名（标签缓存，不退化成 jobId）', async () => {
    adhocJobs = [adhoc('a1', 'RUNNING')];
    xmJobs = [];
    const app = useAppStore();
    const jt = useJobTrackerStore();
    await jt.poll();

    adhocJobs = null; // 失败的几轮会把 jobs 里的 adhoc 条目冲掉
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(0);

    adhocJobs = []; // 接口恢复且作业消失 = 蒸发
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(1);
    expect(app.notifyQueue[0].msg).toContain('idx-a1');
  });

  it('在跑的迁移被 30 条窗口挤出清单不算蒸发（ES 持久化，静默放手）', async () => {
    xmJobs = [xm('x1', 'RUNNING', 1, 10)];
    const app = useAppStore();
    const jt = useJobTrackerStore();
    await jt.poll();

    xmJobs = [xm('x2', 'RUNNING', 5, 10)]; // x1 被新作业挤出窗口
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(0);
  });
});
