import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { api } from '../api';
import { router } from '../router';
import { useJobTrackerStore } from '../stores/jobTracker';
import { useAppStore } from '../stores/app';

/**
 * 1120 批：托管重建确认门的全局通知锁。
 * 作业停在 AWAIT_CONFIRM 时旧索引 WRITE_BLOCK 正在挡写、业务写入持续失败，
 * 这条阻断信息原先只有托管重建页内的横幅在讲——运维停在别的页面就看不见，
 * 30 分钟门超时前无人处置。jobTracker.reconcile 补上停门检测：跨页弹一次
 * warning（「去确认」深链 /adhoc-rebuild?jobId=），已提醒集合随快照持久化
 * （重挂/刷新不重复弹），作业确认放行或超时收尾后终态通知按原路径接续。
 * 锁三点：a) RUNNING→AWAIT_CONFIRM 触发通知且带深链；b) 同 jobId 不重复；
 * c) 其他跃迁（RUNNING→FAILED / 停门后转终态）走原路径不受影响。
 */

function adhoc(jobId: string, status: string, stage = 'REINDEX') {
  return { jobId, logicalName: 'idx-' + jobId, strategy: 'ALIAS', status, stage, startedAt: 1000 };
}

let adhocJobs: any = [];
let pushSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  setActivePinia(createPinia());
  adhocJobs = [];
  vi.spyOn(api.adhoc, 'jobs').mockImplementation(async () => adhocJobs);
  vi.spyOn(api.xb, 'jobs').mockImplementation(async () => []);
  /* tasks/snapshots 两通道与本锁面无关，统一 stub 失败（与 jobTracker.spec 同手法，
     避免 setupFetchGuard 的空 200 兜底伪装成功干扰清单语义） */
  vi.spyOn(api, 'clusterTasks').mockImplementation(async () => { throw new Error('boom'); });
  vi.spyOn(api, 'snapshotStatus').mockImplementation(async () => { throw new Error('boom'); });
  pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined as any);
});

describe('确认门停门的全局通知（1120）', () => {
  it('RUNNING → AWAIT_CONFIRM：跨页弹 warning，带「去确认」深链 jobId', async () => {
    adhocJobs = [adhoc('g1', 'RUNNING', 'REINDEX')];
    const app = useAppStore();
    const jt = useJobTrackerStore();
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(0); // 停门前无事发生

    adhocJobs = [adhoc('g1', 'RUNNING', 'AWAIT_CONFIRM')]; // 停门：WRITE_BLOCK 挡写中
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(1);
    const n = app.notifyQueue[0];
    expect(n.kind).toBe('warning');
    expect(n.msg).toContain('重建停待确认');
    expect(n.msg).toContain('业务写入正被阻断');
    expect(n.duration).toBe(0); // 写入正被阻断，未处置前不自动消失
    // 动作按钮「去确认」深链与终态通知同款：/adhoc-rebuild?jobId= 直达该作业监控视图
    expect(n.action?.label).toBe('去确认');
    n.action!.onClick();
    expect(pushSpy).toHaveBeenCalledWith({ path: '/adhoc-rebuild', query: { jobId: 'g1' } });
    // 停门期间 status 仍是 RUNNING：顶栏清单不受影响
    expect(jt.runningCount).toBe(1);
  });

  it('同 jobId 停门只提醒一次：重复 poll 与整页重挂都不重复弹', async () => {
    adhocJobs = [adhoc('g1', 'RUNNING', 'REINDEX')];
    const jt = useJobTrackerStore();
    await jt.poll();

    adhocJobs = [adhoc('g1', 'RUNNING', 'AWAIT_CONFIRM')];
    const app = useAppStore();
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(1);

    await jt.poll(); // 停门持续期间继续轮询
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(1);

    // 等价整页刷新：pinia 重建（sessionStorage 保留），已提醒位不丢
    setActivePinia(createPinia());
    const app2 = useAppStore();
    const jt2 = useJobTrackerStore();
    await jt2.poll();
    expect(app2.notifyQueue).toHaveLength(0);
  });

  it('非停门跃迁走原路径：RUNNING → FAILED 弹终态 error，不夹带停门文案', async () => {
    adhocJobs = [adhoc('f1', 'RUNNING', 'REINDEX')];
    const app = useAppStore();
    const jt = useJobTrackerStore();
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(0);

    adhocJobs = [adhoc('f1', 'FAILED', 'REINDEX')];
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(1);
    expect(app.notifyQueue[0].kind).toBe('error');
    expect(app.notifyQueue[0].msg).toContain('结束于 FAILED');
    expect(app.notifyQueue[0].msg).not.toContain('停待确认');
    expect(jt.recentDone).toHaveLength(1);
  });

  it('停门提醒后确认放行 → 终态通知正常接续，两路互不干扰', async () => {
    adhocJobs = [adhoc('g1', 'RUNNING', 'REINDEX')];
    const jt = useJobTrackerStore();
    await jt.poll();

    adhocJobs = [adhoc('g1', 'RUNNING', 'AWAIT_CONFIRM')];
    const app = useAppStore();
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(1);
    expect(app.notifyQueue[0].msg).toContain('停待确认');

    // 门内确认放行：stage 离开 AWAIT_CONFIRM 继续推进，不再有新的停门提醒
    adhocJobs = [adhoc('g1', 'RUNNING', 'FINALIZE')];
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(1);

    // 之后转终态：终态通知照常弹（success + 「查看」深链 jobId）
    adhocJobs = [adhoc('g1', 'SUCCEEDED', 'DONE')];
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(2);
    expect(app.notifyQueue[1].kind).toBe('success');
    expect(app.notifyQueue[1].msg).toContain('已完成');
    app.notifyQueue[1].action!.onClick();
    expect(pushSpy).toHaveBeenCalledWith({ path: '/adhoc-rebuild', query: { jobId: 'g1' } });
    expect(jt.recentDone).toHaveLength(1);
  });

  it('停门超时收尾（AWAIT_CONFIRM → FAILED）同样接续终态通知', async () => {
    adhocJobs = [adhoc('t1', 'RUNNING', 'AWAIT_CONFIRM')]; // 首拍已停门（收门时不在页上）
    const app = useAppStore();
    const jt = useJobTrackerStore();
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(1);
    expect(app.notifyQueue[0].msg).toContain('停待确认');

    // 30 分钟未确认：自动解除挡写、按失败收尾
    adhocJobs = [adhoc('t1', 'FAILED', 'AWAIT_CONFIRM')];
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(2);
    expect(app.notifyQueue[1].kind).toBe('error');
    expect(app.notifyQueue[1].msg).toContain('结束于 FAILED');
    expect(jt.recentDone).toHaveLength(1);
  });

  it('重跑复用 jobId：作业回到 RUNNING 清上一轮通知标记，二次停门与二次终态照常提醒', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); // 只冻结时钟：越过 toast 同文案 8s 去重窗
    try {
      adhocJobs = [adhoc('g1', 'RUNNING', 'REINDEX')];
      const app = useAppStore();
      const jt = useJobTrackerStore();
      await jt.poll();

      adhocJobs = [adhoc('g1', 'RUNNING', 'AWAIT_CONFIRM')]; // 第一次停门
      await jt.poll();
      adhocJobs = [adhoc('g1', 'FAILED', 'AWAIT_CONFIRM')]; // 门超时失败收尾
      await jt.poll();
      expect(app.notifyQueue).toHaveLength(2);

      // 一键重跑（retry 沿用原 jobId）：回到 RUNNING——上一轮标记视为过期
      adhocJobs = [adhoc('g1', 'RUNNING', 'FULL_REINDEX')];
      await jt.poll();
      expect(app.notifyQueue).toHaveLength(2); // 回跑本身不弹

      vi.setSystemTime(Date.now() + 8100); // 越过同文案 8s 去重窗（真实重跑追平远超 8s）
      adhocJobs = [adhoc('g1', 'RUNNING', 'AWAIT_CONFIRM')]; // 第二次停门：必须再提醒
      await jt.poll();
      expect(app.notifyQueue).toHaveLength(3);
      expect(app.notifyQueue[2].msg).toContain('停待确认');

      adhocJobs = [adhoc('g1', 'SUCCEEDED', 'DONE')]; // 第二次终态：也必须再提醒
      await jt.poll();
      expect(app.notifyQueue).toHaveLength(4);
      expect(app.notifyQueue[3].kind).toBe('success');
      expect(jt.recentDone).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('并行重建先后停门：文案带作业名，toast 去重窗不吞第二条（8s 内）', async () => {
    adhocJobs = [adhoc('a1', 'RUNNING', 'REINDEX'), adhoc('b2', 'RUNNING', 'REINDEX')];
    const app = useAppStore();
    const jt = useJobTrackerStore();
    await jt.poll();

    adhocJobs = [adhoc('a1', 'RUNNING', 'AWAIT_CONFIRM'), adhoc('b2', 'RUNNING', 'REINDEX')];
    await jt.poll();
    adhocJobs = [adhoc('a1', 'RUNNING', 'AWAIT_CONFIRM'), adhoc('b2', 'RUNNING', 'AWAIT_CONFIRM')]; // 8s 内第二个索引也停门
    await jt.poll();
    expect(app.notifyQueue).toHaveLength(2);
    expect(app.notifyQueue[0].msg).toContain('idx-a1');
    expect(app.notifyQueue[1].msg).toContain('idx-b2');
  });
});
