/**
 * 2026-11-22 批：时间线×速率曲线联动（时间旅行）。
 *
 *   ① SparkLine 交互升级——负控：无 onScrub 时零行为变化（无捕获层、纯 polyline）；
 *     正控：pointermove 按与 pts 同款归一化数学反算最近采样点索引（跨点才重发），
 *     pointerleave 回 null，click 带 'click' 来源标记；marks（分数索引红刻度）与
 *     activeIdx（选中点实心圆）按域内过滤渲染；
 *   ② 详情弹窗联动——事件时间线区内曲线（rateHist 采样带 ts）在场 + THROTTLE 时刻
 *     红刻度（窗口外不标）；悬停/点击采样点 → 事件列表滚动定位到「不晚于该采样时刻的
 *     最近事件」+ 高亮一拍（160ms 摘除）；点击=粘性定位（曲线上选中点标记），再点
 *     同点取消；弹窗关闭清定位态。
 * 挂具范式同 xmDetailEvents1121（全真挂载 + api mock + localStorage 预置采样；
 * 详情 n-modal teleport 查 document）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import SparkLine from '../components/SparkLine.vue';
import XmigrateView from '../views/XmigrateView.vue';

/* ═══ 挂具 ═══ */
async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function mountSpark(props: Record<string, any>) {
  const app = createApp({ render: () => h(SparkLine as any, props) });
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  return { app, host, svg: host.querySelector('svg') as SVGSVGElement };
}
/** rect 捕获层几何 mock（happy-dom 无布局，getBoundingClientRect 全 0——按 left 偏移给定） */
function rectBox(el: Element, left = 0) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(
    { left, top: 0, right: left + 110, bottom: 26, width: 110, height: 26, x: left, y: 0, toJSON: () => ({}) } as DOMRect);
}
const move = (el: Element, x: number) => el.dispatchEvent(new MouseEvent('pointermove', { clientX: x, bubbles: true }));

/* ═══ ① SparkLine 交互 ═══ */
describe('1122 SparkLine ①：交互升级', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

  it('负控：无 onScrub 时零行为变化——无捕获层无标记，仅 polyline（w=96 既有调用点零破坏）', () => {
    const { svg } = mountSpark({ data: [1, 2, 3, 4], w: 96, h: 16 });
    expect(svg.getAttribute('aria-hidden'), '装饰性语义保持').toBe('true');
    expect(svg.querySelector('rect.spark-cap'), '无捕获层').toBeNull();
    expect(svg.querySelectorAll('circle').length, '无标记圆点').toBe(0);
    expect(svg.querySelectorAll('polyline').length, '曲线本体唯一').toBe(1);
    /* 无回调下事件不炸（无 onScrub 可调） */
    expect(() => svg.dispatchEvent(new MouseEvent('pointermove', { clientX: 50 }))).not.toThrow();
  });

  it('pointermove 反算最近索引（与 pts 同款数学）；同点不重发、跨点重发；leave 回 null', () => {
    const cb = vi.fn();
    const { svg } = mountSpark({ data: [0, 1, 2, 3, 4], onScrub: cb }); /* w=110：x=i/4*106+2 */
    const cap = svg.querySelector('rect.spark-cap')!;
    expect(cap, '有 onScrub 时捕获层在场').toBeTruthy();
    rectBox(cap);
    move(cap, 30);  /* x=30 → 最近 i=1（x₁=28.5） */
    expect(cb).toHaveBeenLastCalledWith(1, 'move');
    move(cap, 33);  /* 仍 i=1：同点不重发 */
    expect(cb).toHaveBeenCalledTimes(1);
    move(cap, 81);  /* x=81 → i=3 */
    expect(cb).toHaveBeenLastCalledWith(3, 'move');
    expect(cb).toHaveBeenCalledTimes(2);
    cap.dispatchEvent(new MouseEvent('pointerleave'));
    expect(cb).toHaveBeenLastCalledWith(null);
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it('click 带 click 来源标记（父级粘性定位/再点取消的判定依据）', () => {
    const cb = vi.fn();
    const { svg } = mountSpark({ data: [0, 1, 2, 3, 4], onScrub: cb });
    const cap = svg.querySelector('rect.spark-cap')!;
    rectBox(cap);
    cap.dispatchEvent(new MouseEvent('click', { clientX: 55, bubbles: true })); /* x=55 → i=2 */
    expect(cb).toHaveBeenLastCalledWith(2, 'click');
  });

  it('marks（分数索引）域内渲染红刻度、域外丢弃；activeIdx 渲染选中点', () => {
    const { svg } = mountSpark({ data: [1, 2, 3, 4], marks: [1.5, 99], activeIdx: 2 });
    const lines = svg.querySelectorAll('line.spark-mark');
    expect(lines.length, '域内 1 条（99 越界丢弃）').toBe(1);
    expect(lines[0].getAttribute('x1'), '分数索引 1.5 → x=(1.5/3)*106+2=55').toBe('55.0');
    expect(svg.querySelectorAll('circle.spark-pin').length, '选中点实心圆').toBe(1);
  });
});

/* ═══ ② 详情弹窗联动 ═══ */
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

const T0 = 1732144800000;
const JOB = {
  jobId: 'j-spark', status: 'RUNNING', destIndex: 'dest-s', sourceIndex: 'src-s',
  remoteEndpoint: '', migrated: 5000, total: 9000, conflicts: 0, errors: 0,
  createTime: T0 - 30000, startedAtMs: T0 - 12000,
  sliceStatus: { '0': 'RUNNING' }, sliceMigrated: { '0': 5000 }, sliceErrors: {},
};
/* 速率历史 5 点（t=T0..T0+12000，m 与 job.migrated 末点一致——轮询拍不推新点，曲线稳定） */
const RATE_BUF = [0, 1, 2, 3, 4].map(i => ({ t: T0 + i * 3000, m: 1000 + i * 1000 }));
/* 事件集（返回顺序无关，视图按 ts 降序排）：THROTTLE 窗口内 2 条 + 窗口外 1 条 */
const EVENTS = [
  { ts: T0 + 1000, stage: 'RUNNING', message: '启动迁移', level: 'info' },
  { ts: T0 + 5000, stage: 'THROTTLE', message: '调速为 500 docs/s', level: 'info' },
  { ts: T0 + 10000, stage: 'RUNNING', message: '搬运中', level: 'info' },
  { ts: T0 + 11000, stage: 'THROTTLE', message: '恢复不限速', level: 'info' },
  { ts: T0 + 13000, stage: 'THROTTLE', message: '窗口外调速（晚于末采样，不标刻度）', level: 'info' },
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
  return { app, host };
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

/** 打开详情并展开事件时间线（默认收起），返回联动曲线捕获层 */
async function openDetailSpark(host: HTMLElement) {
  (host.querySelector('[aria-label^="作业详情"]') as HTMLButtonElement).click();
  await settle();
  const root = document.querySelector('[data-test="xm-detail"]') as HTMLElement;
  (root.querySelector('[data-test="xm-detail-events"] .cp-toggle') as HTMLButtonElement).click();
  await settle(4);
  const row = document.querySelector('[data-test="xm-ev-spark-row"]') as HTMLElement;
  expect(row, '联动曲线行在场').toBeTruthy();
  const cap = row.querySelector('[data-test="spark-cap"]') as SVGRectElement;
  expect(cap, '捕获层在场').toBeTruthy();
  vi.spyOn(cap, 'getBoundingClientRect').mockReturnValue(
    { left: 0, top: 0, right: 180, bottom: 22, width: 180, height: 22, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
  return { root, cap };
}
/** 详情曲线 w=180/n=5：x = i/4*176+2 */
const xOf = (i: number) => (i / 4) * 176 + 2;
const evRow = (ts: number) => document.querySelector(`.xm-ev[data-evt="${ts}"]`) as HTMLElement;

describe('1122 联动 ②：曲线×事件时间线', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    location.hash = '#/';
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('xm-rate-hist-v1', JSON.stringify({ 'j-spark': RATE_BUF }));
    xbJobs.mockReset().mockResolvedValue([JOB]);
    xbEvents.mockReset().mockResolvedValue({ events: EVENTS });
    (Element.prototype as any).scrollIntoView = vi.fn();
  });

  it('联动曲线在场 + THROTTLE 时刻红刻度（采样窗口内 2 条、窗口外不标）', async () => {
    const { app, host } = await mountXm();
    await openDetailSpark(host);
    const marks = document.querySelectorAll('[data-test="xm-ev-spark-row"] line.spark-mark');
    expect(marks.length, '窗口内 THROTTLE 2 条刻度').toBe(2);
    app.unmount();
  }, 10000);

  it('点击采样点：滚动定位「不晚于该时刻的最近事件」+ 高亮一拍 + 粘性选中点标记', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    const { cap } = await openDetailSpark(host);
    /* i=3（t=T0+9000）→ 事件降序第一个 ≤9000 的是 ts=5000（THROTTLE 行） */
    const target = evRow(T0 + 5000)!;
    const si = vi.fn();
    (target as any).scrollIntoView = si;
    cap.dispatchEvent(new MouseEvent('click', { clientX: xOf(3), bubbles: true }));
    await settle(4);
    expect(si, '目标事件行滚动定位（居中入视野）').toHaveBeenCalledWith({ block: 'center' });
    expect(target.className, '定位命中行高亮一拍').toContain('xm-ev-flash');
    expect(st.sparkPinIdx, '点击=粘性定位（索引记 ref）').toBe(3);
    expect(document.querySelector('[data-test="xm-ev-spark-row"] circle.spark-pin'), '曲线上选中点标记').toBeTruthy();
    await sleep(220); /* 160ms 一拍摘除 */
    expect(target.className, '高亮一拍后摘除').not.toContain('xm-ev-flash');
    app.unmount();
  }, 15000);

  it('再次点击已选中点=取消定位（标记与定位态清）', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    const { cap } = await openDetailSpark(host);
    cap.dispatchEvent(new MouseEvent('click', { clientX: xOf(3), bubbles: true }));
    await settle(4);
    expect(st.sparkPinIdx).toBe(3);
    expect(document.querySelector('[data-test="xm-ev-spark-row"] circle.spark-pin')).toBeTruthy();
    cap.dispatchEvent(new MouseEvent('click', { clientX: xOf(3), bubbles: true })); /* 再点同点 */
    await settle(4);
    expect(st.sparkPinIdx, '再点同点取消定位').toBeNull();
    expect(document.querySelector('[data-test="xm-ev-spark-row"] circle.spark-pin'), '选中点标记随取消摘除').toBeNull();
    app.unmount();
  }, 10000);

  it('悬停采样点：预览定位滚动（不粘）——move 跨点触发、定位更早事件', async () => {
    const { app, host } = await mountXm();
    const { cap } = await openDetailSpark(host);
    /* i=1（t=T0+3000）→ 降序第一个 ≤3000 的是 ts=1000（启动迁移） */
    const target = evRow(T0 + 1000)!;
    const si = vi.fn();
    (target as any).scrollIntoView = si;
    cap.dispatchEvent(new MouseEvent('pointermove', { clientX: xOf(1), bubbles: true }));
    await settle(4);
    expect(si, '悬停定位滚动').toHaveBeenCalledWith({ block: 'center' });
    expect(target.className).toContain('xm-ev-flash');
    await sleep(220);
    expect(target.className).not.toContain('xm-ev-flash');
    app.unmount();
  }, 15000);

  it('弹窗关闭清定位态（粘性索引不跨弹窗残留）', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    const { cap } = await openDetailSpark(host);
    cap.dispatchEvent(new MouseEvent('click', { clientX: xOf(2), bubbles: true }));
    await settle(4);
    expect(st.sparkPinIdx).toBe(2);
    st.detailOpen = false; /* 关闭弹窗（v-model:show 同源） */
    await settle(4);
    expect(st.sparkPinIdx, '关闭即清定位态').toBeNull();
    app.unmount();
  }, 10000);
});
