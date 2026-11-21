/**
 * 2026-11-21 兼容计划批：jobTracker 进度停滞告警（xmigrate+adhoc 通用）。
 *
 * 判据：RUNNING 作业连续 3 次轮询 processed 无增长 → 进入停滞，弹一次 warning
 * 「「label」kindName进度停滞（N 秒无增长）」（N 从首次无增长拍起算）；
 * 恢复增长清标记；再停滞重新累计再通知——严禁持续条件每拍重弹。
 * 终态/蒸发/重跑清理停滞跟踪（不跨生命周期误报）。
 * 挂具范式同 adhocGateNotify1120（api spy + 直调 poll；fakeTimers 只冻 Date 越过去重窗）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { api } from '../api';
import { router } from '../router';
import { useJobTrackerStore } from '../stores/jobTracker';
import { useAppStore } from '../stores/app';

function adhocJob(jobId: string, status: string, created?: number) {
  return {
    jobId, logicalName: 'idx-' + jobId, status, stage: 'REINDEX', startedAt: 1000,
    ...(created != null ? { currentProgress: { created, total: 1000 } } : {}),
  };
}
function xmJob(jobId: string, status: string, migrated: number) {
  return { jobId, status, migrated, total: 1000, destIndex: 'dest-' + jobId, conflicts: 0, errors: 0, createTime: 1000 };
}

let xmJobs: any = [];
let adhocJobs: any = [];

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  setActivePinia(createPinia());
  xmJobs = [];
  adhocJobs = [];
  vi.spyOn(api.xb, 'jobs').mockImplementation(async () => xmJobs);
  vi.spyOn(api.adhoc, 'jobs').mockImplementation(async () => adhocJobs);
  vi.spyOn(api, 'clusterTasks').mockImplementation(async () => { throw new Error('boom'); });
  vi.spyOn(api, 'snapshotStatus').mockImplementation(async () => { throw new Error('boom'); });
  vi.spyOn(router, 'push').mockResolvedValue(undefined as any);
});

describe('进度停滞告警（xmigrate 通道）', () => {
  it('连续 3 拍无增长 → 一次 warning（带作业名与秒数）；持续无增长不重弹', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const app = useAppStore();
      const jt = useJobTrackerStore();
      xmJobs = [xmJob('s1', 'RUNNING', 100)];
      await jt.poll(); /* 首拍建基线 */
      expect(app.notifyQueue).toHaveLength(0);

      xmJobs = [xmJob('s1', 'RUNNING', 100)];
      await jt.poll(); /* 无增长 #1 */
      vi.setSystemTime(Date.now() + 5000);
      await jt.poll(); /* 无增长 #2 */
      vi.setSystemTime(Date.now() + 5000);
      expect(app.notifyQueue).toHaveLength(0); /* 两拍还未触发 */
      await jt.poll(); /* 无增长 #3 → 进入停滞 */
      expect(app.notifyQueue).toHaveLength(1);
      const n = app.notifyQueue[0];
      expect(n.kind).toBe('warning');
      expect(n.msg).toContain('「dest-s1」');
      expect(n.msg).toContain('跨集群迁移');
      expect(n.msg).toContain('进度停滞');
      expect(n.msg).toMatch(/（\d+ 秒无增长）/);
      expect(n.msg).toContain('10 秒无增长'); /* 首次无增长拍到触发拍 = 2×5s */

      /* 停滞持续期间继续轮询：不再重弹（状态转换才触发一次） */
      vi.setSystemTime(Date.now() + 5000);
      await jt.poll();
      vi.setSystemTime(Date.now() + 5000);
      await jt.poll();
      expect(app.notifyQueue).toHaveLength(1);
      /* 停滞通知带「查看」深链 */
      n.action!.onClick();
      expect(router.push).toHaveBeenCalledWith('/xmigrate');
    } finally { vi.useRealTimers(); }
  });

  it('恢复增长清标记；再次停滞重新累计再通知', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const app = useAppStore();
      const jt = useJobTrackerStore();
      xmJobs = [xmJob('s2', 'RUNNING', 10)];
      await jt.poll();
      await jt.poll(); await jt.poll(); await jt.poll(); /* 3 拍无增长 → 停滞通知一次 */
      expect(app.notifyQueue).toHaveLength(1);

      xmJobs = [xmJob('s2', 'RUNNING', 500)]; /* 恢复增长：清标记 */
      await jt.poll();
      expect(app.notifyQueue).toHaveLength(1);

      vi.setSystemTime(Date.now() + 8100); /* 越过 toast 同文案 8s 去重窗（真实恢复-再停滞远超 8s） */
      xmJobs = [xmJob('s2', 'RUNNING', 500)]; /* 再停滞：重新累计 */
      await jt.poll(); await jt.poll(); await jt.poll();
      expect(app.notifyQueue, '再停滞再通知（第二次）').toHaveLength(2);
      expect(app.notifyQueue[1].msg).toContain('进度停滞');
    } finally { vi.useRealTimers(); }
  });

  it('作业转终态清跟踪：停滞期间转 DONE 弹终态通知，不夹带停滞文案', async () => {
    const app = useAppStore();
    const jt = useJobTrackerStore();
    xmJobs = [xmJob('s3', 'RUNNING', 100)];
    await jt.poll();
    await jt.poll(); await jt.poll(); await jt.poll(); /* 停滞通知 */
    expect(app.notifyQueue).toHaveLength(1);
    expect(app.notifyQueue[0].msg).toContain('进度停滞');

    xmJobs = [xmJob('s3', 'DONE', 1000)];
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(2);
    expect(app.notifyQueue[1].kind).toBe('success');
    expect(app.notifyQueue[1].msg).toContain('已完成');
    expect(app.notifyQueue[1].msg).not.toContain('停滞');
  });

  it('processed 正常增长的作业不触发；无增长但仅 2 拍不触发', async () => {
    const app = useAppStore();
    const jt = useJobTrackerStore();
    xmJobs = [xmJob('g1', 'RUNNING', 0), xmJob('g2', 'RUNNING', 50)];
    await jt.poll();
    xmJobs = [xmJob('g1', 'RUNNING', 100), xmJob('g2', 'RUNNING', 50)];
    await jt.poll();
    xmJobs = [xmJob('g1', 'RUNNING', 200), xmJob('g2', 'RUNNING', 50)];
    await jt.poll();
    expect(app.notifyQueue, '增长者不弹、flat 仅 2 拍不弹').toHaveLength(0);
  });
});

describe('进度停滞告警（adhoc 通道 + 数据缺席）', () => {
  it('adhoc currentProgress.created 连续 3 拍无增长同样触发（文案带托管重建）', async () => {
    const app = useAppStore();
    const jt = useJobTrackerStore();
    adhocJobs = [adhocJob('a1', 'RUNNING', 100)];
    await jt.poll();
    await jt.poll(); await jt.poll(); await jt.poll();
    expect(app.notifyQueue).toHaveLength(1);
    expect(app.notifyQueue[0].msg).toContain('「idx-a1」托管重建进度停滞');
    app.notifyQueue[0].action!.onClick();
    expect(router.push).toHaveBeenCalledWith('/adhoc-rebuild');
  });

  it('旧后端 currentProgress 缺席（processed=null）不判定不误报', async () => {
    const app = useAppStore();
    const jt = useJobTrackerStore();
    adhocJobs = [adhocJob('a2', 'RUNNING')]; /* 无 currentProgress */
    await jt.poll();
    await jt.poll(); await jt.poll(); await jt.poll(); await jt.poll();
    expect(app.notifyQueue).toHaveLength(0);
  });
});
