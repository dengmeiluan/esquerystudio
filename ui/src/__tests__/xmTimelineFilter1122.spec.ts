/**
 * 2026-11-22 批：详情事件时间线能力栈升级三件——筛选芯片 / 自动滚动 / 跨天分组
 * （与 xmDetailEvents1121 折叠记忆共存，不破坏其锁面）。
 *
 *   ① 筛选芯片（全部/门禁/错误/终态）——语义映射：GATE_ 前缀或确认类=门禁、
 *     level=error 或 stage 含 FAIL=错误、DONE/ABORTED/INTERRUPTED=终态；
 *     芯片集自适应：事件集无该类命中则不出该档芯片（无门禁事件不出门禁芯片）；
 *     点档筛选只剩命中行，空命中显示「当前筛选无命中事件」；
 *   ② 自动滚动——默认开（checkbox 在场），新事件到达滚回最新（最新在上=scrollTop 归 0）；
 *     勾掉后新事件到达不打扰（scrollTop 保持用户翻动位置）；
 *   ③ 跨天分组——事件按天分段（dayLabel 单源：今天/昨天/MM-DD），最新天在上；
 *   ④ 折叠记忆共存——升级后 CollapsePanel 开合仍落 xm-detail-open-keys（1121 锁不破）。
 * 挂具范式同 xmDetailEvents1121（全真挂载 + api mock；详情 n-modal teleport 查 document）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
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

/* 跨天确定性：now 与 now-2d（前天，dayLabel 一定非「今天」）两锚点，
   具体标签随运行日期（MM-DD/YYYY-MM-DD），断言只锁段头数与首段=今天 */
const NOW = Date.now();
const DETAIL_JOB = {
  jobId: 'j-tl', status: 'RUNNING', destIndex: 'dest-tl', sourceIndex: 'src-tl',
  remoteEndpoint: 'http://old:9200', migrated: 10, total: 100, conflicts: 0, errors: 0,
  createTime: NOW - 60000, startedAtMs: NOW - 30000,
  sliceStatus: {}, sliceMigrated: {}, sliceErrors: {},
  message: '迁移中', destCreateMode: 'NONE', tuneMode: 'AGGRESSIVE',
};
/* 四类事件各一 + 跨天：GATE_PAUSE（门禁，前天）/ BULK_FAIL error 级（错误，今天）/
   SLICE_RETRY warn（未分类，今天）/ DONE（终态，今天）——ts 降序=最新在上 */
const MIX_EVENTS = [
  { ts: NOW, stage: 'DONE', message: '迁移完成', level: 'info' },
  { ts: NOW - 5000, stage: 'BULK_FAIL', message: 'bulk 写入被拒', level: 'error' },
  { ts: NOW - 8000, stage: 'SLICE_RETRY', message: 'slice 1 重试', level: 'warn' },
  { ts: NOW - 2 * 86400000, stage: 'GATE_PAUSE', message: '切换门暂停等待确认', level: 'warn' },
];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

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

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([DETAIL_JOB]);
  xbEvents.mockReset().mockResolvedValue({ events: MIX_EVENTS });
  (Element.prototype as any).scrollIntoView = vi.fn();
});

async function openDetailWithEvents(host: HTMLElement) {
  (host.querySelector('[aria-label^="作业详情"]') as HTMLButtonElement).click();
  await settle();
  const sec = document.querySelector('[data-test="xm-detail-events"]') as HTMLElement;
  (sec.querySelector('.cp-toggle') as HTMLButtonElement).click();
  await settle(2);
  return sec;
}

/* ═══ ① 筛选芯片（语义映射 + 自适应 + 命中过滤） ═══ */
describe('1122 时间线 ①：筛选芯片', () => {
  it('四类事件 → 全部/门禁/错误/终态四档芯片；点「错误」只剩 error 命中行', async () => {
    const { app, host } = await mountXm();
    const sec = await openDetailWithEvents(host);
    const chips = [...sec.querySelectorAll('.xm-ev-fchip')];
    expect(chips.map(c => c.textContent!.trim()), '四档芯片齐备').toEqual(['全部', '门禁', '错误', '终态']);
    expect(chips[0].className, '默认「全部」高亮').toContain('on');
    expect(sec.querySelectorAll('.xm-ev').length, '全部档=4 行').toBe(4);
    /* 点「错误」：只剩 BULK_FAIL（level=error 且 stage 含 FAIL） */
    (sec.querySelector('[data-test="xm-evt-filter-error"]') as HTMLButtonElement).click();
    await settle(2);
    const lines = [...sec.querySelectorAll('.xm-ev')];
    expect(lines.length, '错误档只显命中行').toBe(1);
    expect(lines[0].textContent).toContain('bulk 写入被拒');
    expect(lines[0].className).toContain('xm-ev-error');
    /* 点「门禁」：GATE_PAUSE 命中（stage 前缀 GATE_） */
    (sec.querySelector('[data-test="xm-evt-filter-gate"]') as HTMLButtonElement).click();
    await settle(2);
    const gateLines = [...sec.querySelectorAll('.xm-ev')];
    expect(gateLines.length).toBe(1);
    expect(gateLines[0].textContent).toContain('切换门暂停等待确认');
    /* 点「终态」：DONE 命中 */
    (sec.querySelector('[data-test="xm-evt-filter-final"]') as HTMLButtonElement).click();
    await settle(2);
    expect([...sec.querySelectorAll('.xm-ev')].length).toBe(1);
    expect(sec.querySelector('.xm-ev')!.textContent).toContain('迁移完成');
    /* 回「全部」恢复全集 */
    (sec.querySelector('[data-test="xm-evt-filter-all"]') as HTMLButtonElement).click();
    await settle(2);
    expect(sec.querySelectorAll('.xm-ev').length).toBe(4);
    app.unmount();
  }, 8000);

  it('芯片集自适应：无门禁事件的集合不出门禁芯片；纯 info 集只剩「全部」', async () => {
    xbEvents.mockResolvedValue({ events: [
      { ts: NOW, stage: 'RUNNING', message: '启动迁移', level: 'info' },
      { ts: NOW - 1000, stage: 'FAILED', message: 'bulk 写入被拒', level: 'error' },
    ] });
    const { app, host } = await mountXm();
    const sec = await openDetailWithEvents(host);
    const chips = [...sec.querySelectorAll('.xm-ev-fchip')];
    expect(chips.map(c => c.textContent!.trim()), '无门禁/终态事件→只剩 全部/错误').toEqual(['全部', '错误']);
    expect(sec.querySelector('[data-test="xm-evt-filter-gate"]'), '门禁档不出芯片').toBeNull();
    /* FAILED 归错误档（level=error）不归终态档（终态仅 DONE/ABORTED/INTERRUPTED） */
    expect(sec.querySelector('[data-test="xm-evt-filter-final"]'), '终态档不出芯片').toBeNull();
    /* 另一事件集（同 app 关弹窗重开=新详情拍）：纯 info → 只有「全部」不悬空 */
    xbEvents.mockResolvedValue({ events: [{ ts: NOW, stage: 'RUNNING', message: '启动', level: 'info' }] });
    (document.querySelector('.xm-detail-ft .btn:last-child') as HTMLButtonElement).click();
    await settle(2);
    (host.querySelector('[aria-label^="作业详情"]') as HTMLButtonElement).click();
    await settle();
    const sec2 = document.querySelector('[data-test="xm-detail-events"]')!;
    /* 折叠记忆：重开仍展开；若未展开（防御）再点开 */
    if (!sec2.querySelector('.xm-ev')) {
      (sec2.querySelector('.cp-toggle') as HTMLButtonElement).click();
      await settle(2);
    }
    expect([...sec2.querySelectorAll('.xm-ev-fchip')].map(c => c.textContent!.trim()), '纯 info 集只剩「全部」').toEqual(['全部']);
    expect(sec2.querySelectorAll('.xm-ev').length).toBe(1);
    app.unmount();
  }, 12000);
});

/* ═══ ② 自动滚动（默认开；新事件到达滚回最新；关掉不打扰） ═══ */
describe('1122 时间线 ②：自动滚动', () => {
  it('开关默认开；新事件到达 scrollTop 归 0；勾掉后保持用户翻动位置', async () => {
    const { app, host } = await mountXm();
    const sec = await openDetailWithEvents(host);
    const autoBox = sec.querySelector('[data-test="xm-evt-autoscroll"]');
    expect(autoBox, '自动滚动开关在场（默认开）').toBeTruthy();
    /* 模拟用户往下翻历史（最新在上=顶部是最新） */
    const line = sec.querySelector('[data-test="xm-events-line"]') as HTMLElement;
    line.scrollTop = 180;
    expect(line.scrollTop).toBe(180);
    /* 新事件到达（首条换引用+长度变化）→ 滚回最新（scrollTop=0）——
       经 refreshDetailEvents 显式通道驱动（重试钮/轮询拍同函数） */
    xbEvents.mockResolvedValue({ events: [
      { ts: NOW + 5000, stage: 'DONE', message: '迁移完成（新）', level: 'info' },
      ...MIX_EVENTS,
    ] });
    const st = (app._instance as any)!.subTree.component.setupState;
    await st.refreshDetailEvents(true);
    await settle(2);
    expect(sec.querySelectorAll('.xm-ev').length, '新事件已渲染（5 行）').toBe(5);
    expect(line.scrollTop, '自动滚动开：新事件到达滚回最新（顶部）').toBe(0);
    /* 勾掉自动滚动 → 再翻历史 + 新事件到达不打扰（checkbox 定位兼容 label 直点，xm-sync-aliases 同款兜底） */
    const cb = (sec.querySelector('[data-test="xm-evt-autoscroll"] [role="checkbox"]')
      || sec.querySelector('[data-test="xm-evt-autoscroll"]')) as HTMLElement;
    cb.click();
    await settle(2);
    const stAfter = (app._instance as any)!.subTree.component.setupState;
    expect(stAfter.evAutoScroll, '点击后开关翻为关').toBe(false);
    line.scrollTop = 180;
    xbEvents.mockResolvedValue({ events: [
      { ts: NOW + 9000, stage: 'ABORTED', message: '已中止（新）', level: 'warn' },
      { ts: NOW + 5000, stage: 'DONE', message: '迁移完成（新）', level: 'info' },
      ...MIX_EVENTS,
    ] });
    await st.refreshDetailEvents(true);
    await settle(2);
    expect(sec.querySelectorAll('.xm-ev').length).toBe(6);
    expect(line.scrollTop, '自动滚动关：不打扰用户翻动位置').toBe(180);
    app.unmount();
  }, 10000);

  it('同内容刷新拍（全新 JSON 对象、ts/长度不变）不打扰翻历史——引用比较守卫在真实轮询下恒失效的回归锁', async () => {
    const { app, host } = await mountXm();
    const sec = await openDetailWithEvents(host);
    const line = sec.querySelector('[data-test="xm-events-line"]') as HTMLElement;
    line.scrollTop = 180;
    expect(line.scrollTop).toBe(180);
    /* 真实轮询拍：HTTP 响应每拍 JSON 解析出全新对象（引用不等），但内容身份（长度+首条 ts）不变 */
    xbEvents.mockResolvedValue({ events: MIX_EVENTS.map(e => ({ ...e })) });
    const st = (app._instance as any)!.subTree.component.setupState;
    await st.refreshDetailEvents(true);
    await settle(2);
    expect(sec.querySelectorAll('.xm-ev').length, '同内容拍照常渲染').toBe(4);
    expect(line.scrollTop, '同内容新引用拍：不打扰翻历史（数据身份守卫）').toBe(180);
    app.unmount();
  }, 10000);
});

/* ═══ ③ 跨天分组（dayLabel 段头，最新天在上） ═══ */
describe('1122 时间线 ③：跨天分组', () => {
  it('两天事件 → 两段头（首段=今天，前天段为日期档）；段头不带 .xm-ev 不搅行计数', async () => {
    const { app, host } = await mountXm();
    const sec = await openDetailWithEvents(host);
    const days = [...sec.querySelectorAll('.xm-ev-day')];
    expect(days.length, '两天事件两段头').toBe(2);
    expect(days[0].getAttribute('data-day'), '最新天在上=今天').toBe('今天');
    expect(days[1].getAttribute('data-day'), '前天段为日期档（非今天）').not.toBe('今天');
    /* 段头是 .xm-ev-day 不是 .xm-ev——1121 行计数锁不搅 */
    expect(sec.querySelectorAll('.xm-ev').length).toBe(4);
    expect(days[0].textContent!.trim()).toBe('今天');
    app.unmount();
  }, 8000);

  it('同一天多事件只有一段头（不逐行重复）', async () => {
    xbEvents.mockResolvedValue({ events: [
      { ts: NOW, stage: 'DONE', message: '完成', level: 'info' },
      { ts: NOW - 1000, stage: 'RUNNING', message: '中途', level: 'info' },
      { ts: NOW - 2000, stage: 'RUNNING', message: '启动', level: 'info' },
    ] });
    const { app, host } = await mountXm();
    const sec = await openDetailWithEvents(host);
    expect(sec.querySelectorAll('.xm-ev-day').length, '同天一段头').toBe(1);
    expect(sec.querySelectorAll('.xm-ev').length).toBe(3);
    app.unmount();
  }, 8000);
});

/* ═══ ④ 折叠记忆共存（1121 锁不破） ═══ */
describe('1122 时间线 ④：折叠记忆共存', () => {
  it('升级后开合仍落 xm-detail-open-keys；重开弹窗保持展开', async () => {
    const { app, host } = await mountXm();
    await openDetailWithEvents(host);
    expect(JSON.parse(localStorage.getItem('xm-detail-open-keys')!), '开合落盘').toContain('events');
    /* 关弹窗重开：折叠区仍展开 + 筛选芯片照常在场（折叠记忆与新能力共存） */
    (document.querySelector('.xm-detail-ft .btn:last-child') as HTMLButtonElement).click();
    await settle(2);
    (host.querySelector('[aria-label^="作业详情"]') as HTMLButtonElement).click();
    await settle();
    const sec = document.querySelector('[data-test="xm-detail-events"]')!;
    expect(sec.querySelectorAll('.xm-ev').length, '重开仍展开（记忆保持）').toBe(4);
    expect(sec.querySelector('.xm-ev-fchip'), '筛选芯片在场').toBeTruthy();
    expect(sec.querySelector('.xm-ev-day'), '跨天段头在场').toBeTruthy();
    app.unmount();
  }, 10000);
});
