/**
 * 994：登出/token 吊销后全局双轮询器（liveMonitor.tick / jobTracker.poll）逐拍短路——
 * 已探明无会话（me==null 且非 authDisabled 且已探测）时不发请求、不空转 unauthorized
 * 事件链；身份恢复后自动续采（不停轮询器的补偿单点形态）。
 * liveMonitor.tick 未导出（内部函数）→ 行为测走 jobTracker.poll + 双源码锚。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../stores/auth';
import { useJobTrackerStore } from '../stores/jobTracker';
import { api } from '../api';
import { readFileSync } from 'fs';
import { join } from 'path';

let adhocJobsSpy: ReturnType<typeof vi.spyOn>;
let xmJobsSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setActivePinia(createPinia());
  adhocJobsSpy = vi.spyOn(api.adhoc, 'jobs').mockResolvedValue({ jobs: [] } as any);
  xmJobsSpy = vi.spyOn(api.xb, 'jobs').mockResolvedValue({ jobs: [] } as any);
});

describe('登出态轮询短路（994）', () => {
  it('jobTracker.poll：身份已知且无会话时零请求', async () => {
    const auth = useAuthStore();
    auth.me = null;
    (auth as any).authDisabled = false;
    (auth as any).probed = true;
    const jt = useJobTrackerStore();
    await jt.poll();
    expect(adhocJobsSpy, '登出态不得发作业跟踪请求').not.toHaveBeenCalled();
    expect(xmJobsSpy).not.toHaveBeenCalled();
  });

  it('源码锚：两轮询器首行同款身份短路守卫', () => {
    const lmSrc = readFileSync(join(__dirname, '../stores/liveMonitor.ts'), 'utf8');
    const jtSrc = readFileSync(join(__dirname, '../stores/jobTracker.ts'), 'utf8');
    const guard = 'if (auth.me == null && !auth.authDisabled && auth.probed) return;';
    expect(lmSrc, 'liveMonitor.tick 首行守卫在位').toContain(guard);
    expect(jtSrc, 'jobTracker.poll 首行守卫在位').toContain(guard);
  });
});
