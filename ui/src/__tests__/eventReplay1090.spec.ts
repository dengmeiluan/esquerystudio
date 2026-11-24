/**
 * 1090：迁移详情事件回放——快照冻结、时间线高亮、退出回实时。
 * 挂具范式同 xmUx1085（全真挂载 + api mock + setupState 直调）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const xbEvents = vi.fn();

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
        events: (...a: any[]) => xbEvents(...a),
      },
    },
  };
});

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const NOW = Date.now();
const doneJob = {
  jobId: 'j-replay', status: 'DONE', destIndex: 'd-index', sourceIndex: 's-index',
  remoteEndpoint: 'http://old:9200', srcConnId: 'c1', migrated: 100, total: 100,
  conflicts: 0, errors: 0, createTime: NOW - 90000, startedAtMs: NOW - 80000, finishedAtMs: NOW - 70000,
  sliceStatus: {}, sliceMigrated: {}, sliceErrors: {},
  destCreateMode: 'NONE', tuneMode: 'GENTLE', slices: 3, batchSize: 200,
};
const EVENTS = [
  { ts: NOW, stage: 'DONE', level: 'info', message: '收尾完成' },
  { ts: NOW - 1000, stage: 'GATE_SWITCH', level: 'warn', message: '等待确认切换' },
  { ts: NOW - 2000, stage: 'COPY', level: 'info', message: '搬运中' },
  { ts: NOW - 3000, stage: 'STARTED', level: 'info', message: '启动' },
];

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
  const { useAppStore } = await import('../stores/app');
  useAppStore(pinia);
  return { app, host };
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([doneJob]);
  xbEvents.mockReset().mockResolvedValue({ events: EVENTS.map(e => ({ ...e })) });
  (Element.prototype as any).scrollIntoView = vi.fn();
});

describe('1090 迁移作业事件回放', () => {
  it('进入回放：控制条出现、快照冻结不跟随轮询、当前事件高亮随 step 推进、退出回实时', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    st.detailEventsOpen = true;
    st.openDetail(doneJob);
    await settle();
    expect(document.querySelectorAll('.xm-ev-line .xm-ev').length, '实时时间线 4 条').toBe(4);

    const replayBtn = document.querySelector('[data-test="xm-evt-replay"]') as HTMLButtonElement;
    expect(replayBtn).not.toBeNull();
    expect(replayBtn.disabled).toBe(false);
    replayBtn.click();
    await settle();
    st.evReplay.pause(); /* 关掉真实计时器，断言只认手动步进 */

    expect(st.evReplayOn).toBe(true);
    expect(document.querySelector('[data-test="evr-bar"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-evt-current="true"]').length).toBe(1);
    const first = document.querySelector('[data-evt-current="true"]') as HTMLElement;
    expect(first.textContent, '回放从最早事件开始').toContain('启动');

    /* 快照冻结：轮询拍追加新事件，回放列表不跟着变 */
    st.detailEvents = [{ ts: NOW + 5000, stage: 'NEW', level: 'info', message: '新到事件' }, ...EVENTS];
    await settle();
    expect(document.querySelectorAll('.xm-ev-line .xm-ev').length, '回放期间仍为快照 4 条').toBe(4);

    st.evReplay.step(1);
    await settle();
    const second = document.querySelector('[data-evt-current="true"]') as HTMLElement;
    expect(second.textContent).toContain('搬运中');
    expect(document.querySelectorAll('[data-evt-current="true"]').length).toBe(1);

    st.evReplay.seek(1);
    await settle();
    expect((document.querySelector('[data-evt-current="true"]') as HTMLElement).textContent).toContain('收尾完成');

    st.exitEvReplay();
    await settle();
    expect(st.evReplayOn).toBe(false);
    expect(document.querySelector('[data-test="evr-bar"]')).toBeNull();
    expect(document.querySelectorAll('.xm-ev-line .xm-ev').length, '退出后回到实时 5 条').toBe(5);
    app.unmount();
  }, 20000);

  it('事件不足 2 条时回放钮禁用；换作业退出回放并清空旧快照', async () => {
    xbEvents.mockResolvedValue({ events: [{ ts: NOW, stage: 'DONE', level: 'info', message: '只有一条' }] });
    const { app, host } = await mountXm();
    const st = stateOf(app);
    st.detailEventsOpen = true;
    st.openDetail(doneJob);
    await settle();
    expect((document.querySelector('[data-test="xm-evt-replay"]') as HTMLButtonElement).disabled).toBe(true);
    app.unmount();

    xbEvents.mockResolvedValue({ events: EVENTS.map(e => ({ ...e })) });
    const m2 = await mountXm();
    const st2 = stateOf(m2.app);
    st2.detailEventsOpen = true;
    st2.openDetail(doneJob);
    await settle();
    st2.enterEvReplay();
    st2.evReplay.pause();
    await settle();
    expect(st2.evReplayOn).toBe(true);
    st2.openDetail({ ...doneJob, jobId: 'j-other' });
    await settle();
    expect(st2.evReplayOn, '换作业退出回放').toBe(false);
    expect(st2.evReplayEvents.length).toBe(0);
    m2.app.unmount();
  }, 20000);
});

/* 孪生接线锚：AdhocRebuildView 与 Xmigrate 共用同一回放内核/控制条（行为核心已在上面覆盖） */
describe('1090 重建页回放接线', () => {
  it('AdhocRebuildView 接入共享 EventReplayBar 与快照渲染源', () => {
    const src = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');
    expect(src).toContain("import EventReplayBar from '../components/EventReplayBar.vue'");
    expect(src).toContain('useEventReplay(');
    expect(src).toContain('const evTimelineEvents = computed');
    expect(src).toContain('v-for="(ev, i) in evTimelineEvents"');
    expect(src).toContain('@click="evReplayOn ? exitEvReplay() : enterEvReplay()"');
    expect(src).toContain('<EventReplayBar');
  });
});
