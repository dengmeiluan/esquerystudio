/**
 * 1122：迁移任务级恢复提示——「有迁移在跑 / 上次被中断」从 XmigrateView 表格行
 * 前置到进站第一眼（任意页）。
 *
 * 锁：① 服务端模式经 jobTracker：RUNNING 渲染含「源 → 目标」与进度，「查看」深链
 *       ?jobId=&detail=1 且点击后提示消失；
 *     ② FAILED → 「上次迁移被中断」+「去续跑」主 CTA；
 *     ③ 同作业一次会话只提示一次（二次挂载不提示）；
 *     ④ 负控：无作业 / 探测未落地均不渲染（进站不闪空壳）；
 *     ⑤ 作业转 DONE 后提示撤下（终态不再打扰）；
 *     ⑥ 浏览器模式读 localStorage 台账同款行为。
 * 挂具范式：组件挂载抄 sceneResumeTip1184（createApp + h），store/router 处理抄
 * jobTrackerStall1121（setActivePinia + spyOn router.push）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { setActivePinia, createPinia, type Pinia } from 'pinia';
import XmJobResumeTip from '../components/XmJobResumeTip.vue';
import { useJobTrackerStore } from '../stores/jobTracker';
import { router } from '../router';

/* isBrowserMode 是编译期常量，靠模块 getter mock 切换两分支 */
const bm = vi.hoisted(() => ({ mode: false }));
vi.mock('../platform/browserApi', () => ({ get isBrowserMode() { return bm.mode; } }));
/* 路由对称用例要真实导航全局 router（currentRoute 驱动组件 watch），而路由表的
 XmigrateView/OverviewView 是懒加载真视图——XmigrateView 的 import 链含 monaco-editor，
 vitest 下加载远超单测时限；mock 成空模板让导航只剩路由解析本身 */
vi.mock('../views/XmigrateView.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../views/OverviewView.vue', () => ({ default: { template: '<div />' } }));

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;
let pinia: Pinia;
const activeEvents: boolean[] = [];

function tracked(jobId: string, status: string, pct: number) {
  return {
    id: 'xm:' + jobId, kind: 'xmigrate', kindName: '跨集群迁移',
    label: 'uat_' + jobId, source: 'order_' + jobId,
    status, pct, stage: '', reason: '', startedAt: 1000, route: '/xmigrate', processed: null,
  };
}

async function mountTip() {
  host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(XmJobResumeTip as any, { onActiveChange: (v: boolean) => activeEvents.push(v) }),
  });
  app.directive('tip', () => {}); // 独立 app 无全局指令，注册空实现防 resolve 告警
  app.use(pinia);
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 4; i++) await nextTick();
}

function setJobs(probed: boolean, jobs: any[]) {
  const jt = useJobTrackerStore();
  jt.probed = probed;
  jt.jobs = jobs as any;
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  bm.mode = false;
  activeEvents.length = 0;
  pinia = createPinia();
  setActivePinia(pinia);
  vi.spyOn(router, 'push').mockResolvedValue(undefined as any);
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = ''; });

describe('1122 迁移作业恢复提示（服务端模式，数据经 jobTracker）', () => {
  it('RUNNING：渲染含目标索引与进度，「查看」深链 ?jobId=&detail=1 且点击后提示消失', async () => {
    setJobs(true, [tracked('j1', 'RUNNING', 67)]);
    await mountTip();
    const tip = host.querySelector('.xjrt')!;
    expect(tip.textContent).toContain('进行中的迁移作业');
    expect(tip.textContent).toContain('order_j1 → uat_j1');
    expect(tip.textContent).toContain('（67%）');
    expect((host.querySelector('.xjrt-go') as HTMLButtonElement).textContent).toContain('查看');
    expect(activeEvents).toContain(true); // 在场状态已上报（App 侧压住路由级提示）

    (host.querySelector('.xjrt-go') as HTMLButtonElement).click();
    for (let i = 0; i < 4; i++) await nextTick();
    expect(router.push).toHaveBeenCalledWith({ path: '/xmigrate', query: { jobId: 'j1', detail: '1' } });
    expect(host.querySelector('.xjrt'), '深链跳转后提示消失（记忆已消费）').toBeNull();
  });

  it('FAILED：文案「上次迁移被中断」，主 CTA 为「去续跑」', async () => {
    setJobs(true, [tracked('j2', 'FAILED', 45)]);
    await mountTip();
    const tip = host.querySelector('.xjrt')!;
    expect(tip.textContent).toContain('上次迁移被中断');
    expect(tip.textContent).toContain('order_j2 → uat_j2');
    expect(tip.textContent).toContain('（45%）');
    expect((host.querySelector('.xjrt-go') as HTMLButtonElement).textContent).toContain('去续跑');
  });

  it('同作业只提示一次：首次显示即记忆，二次挂载不再渲染', async () => {
    setJobs(true, [tracked('j3', 'RUNNING', 10)]);
    await mountTip();
    expect(host.querySelector('.xjrt')).not.toBeNull();
    apps.pop()!.unmount();

    await mountTip(); // 同一会话（sessionStorage 仍在）重挂载
    expect(host.querySelector('.xjrt'), '二次挂载不重复提示').toBeNull();
  });

  it('负控：探测未落地 / 已探测但无作业，均不渲染', async () => {
    setJobs(false, []);
    await mountTip();
    expect(host.querySelector('.xjrt'), '首拍未返回前不闪空壳').toBeNull();
    apps.pop()!.unmount();

    setJobs(true, []);
    await mountTip();
    expect(host.querySelector('.xjrt')).toBeNull();
  });

  it('作业转 DONE 后提示撤下（终态不再打扰）', async () => {
    setJobs(true, [tracked('j4', 'RUNNING', 90)]);
    await mountTip();
    expect(host.querySelector('.xjrt')).not.toBeNull();

    setJobs(true, [tracked('j4', 'DONE', 100)]);
    for (let i = 0; i < 4; i++) await nextTick();
    expect(host.querySelector('.xjrt'), 'DONE 不在提示状态集，条即撤').toBeNull();
  });
});

describe('1122 迁移作业恢复提示（浏览器模式，读 localStorage 台账）', () => {
  it('RUNNING 台账：渲染含目标与进度，「查看」同款深链', async () => {
    bm.mode = true;
    localStorage.setItem('esquerystudio.xmigrate.jobs', JSON.stringify([{
      jobId: 'bj1', sourceIndex: 'order_v2', destIndex: 'uat_order', status: 'RUNNING',
      migrated: 600, total: 1000, conflicts: 0, errors: 0, createTime: 2000, message: '搬运中',
    }]));
    await mountTip();
    const tip = host.querySelector('.xjrt')!;
    expect(tip.textContent).toContain('进行中的迁移作业');
    expect(tip.textContent).toContain('order_v2 → uat_order');
    expect(tip.textContent).toContain('（60%）');

    (host.querySelector('.xjrt-go') as HTMLButtonElement).click();
    for (let i = 0; i < 4; i++) await nextTick();
    expect(router.push).toHaveBeenCalledWith({ path: '/xmigrate', query: { jobId: 'bj1', detail: '1' } });
    expect(host.querySelector('.xjrt')).toBeNull();
  });

  it('浏览器模式同作业亦只提示一次（sessionStorage 记忆）', async () => {
    bm.mode = true;
    localStorage.setItem('esquerystudio.xmigrate.jobs', JSON.stringify([{
      jobId: 'bj2', sourceIndex: 's', destIndex: 'd', status: 'INTERRUPTED', migrated: 1, total: 10, createTime: 1,
    }]));
    await mountTip();
    expect(host.querySelector('.xjrt')).not.toBeNull();
    apps.pop()!.unmount();

    await mountTip();
    expect(host.querySelector('.xjrt')).toBeNull();
  });

  it('路由判定与服务端 watch 对称：进 /xmigrate 收起，离开重判，防重保持、新作业照常', async () => {
    bm.mode = true;
    /* 全局 router 单例且 '/' 重定向 /overview——归位到非迁移页起测（位移可能残留自先前用例） */
    await router.replace('/overview');
    const writeLedger = (jobId: string) => localStorage.setItem('esquerystudio.xmigrate.jobs', JSON.stringify([{
      jobId, sourceIndex: 's', destIndex: 'd', status: 'RUNNING', migrated: 1, total: 10, createTime: 1,
    }]));
    writeLedger('bj3');
    await mountTip();
    expect(host.querySelector('.xjrt'), '非迁移页挂载即提示').not.toBeNull();

    /* push 已被 mock（深链断言专用），真实导航走 replace：进迁移页 = 页面自身就是现场，收起不隔页喊话 */
    await router.replace('/xmigrate');
    for (let i = 0; i < 4; i++) await nextTick();
    expect(host.querySelector('.xjrt'), '进 /xmigrate 后提示收起').toBeNull();

    await router.replace('/overview');
    for (let i = 0; i < 4; i++) await nextTick();
    expect(host.querySelector('.xjrt'), '离开再回：同作业 sessionStorage 已记忆，不重复弹').toBeNull();

    writeLedger('bj4'); /* 台账换成新作业：下一次路由重判要能看到 */
    await router.replace('/xmigrate');
    await router.replace('/overview');
    for (let i = 0; i < 4; i++) await nextTick();
    expect(host.querySelector('.xjrt'), '新作业（另一 jobId）重判照常提示').not.toBeNull();
    /* 收尾停在非迁移页，不污染后续用例的挂载判定 */
  });
});
