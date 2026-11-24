/**
 * 2026-11-21 兼容计划批：迁移作业详情弹窗三件——事件时间线 / 分区折叠记忆 / 导出快照。
 *
 *   ① 事件时间线（第七区 xm-detail-events）——api.xb.events 渲染：ts HH:mm:ss + stage
 *     徽标 + message，最新在上（ts 降序）；level 着色 info 灰/warn 黄/error 红（行底色档）；
 *     拉取失败显示就地重试错误卡（role=alert + 重试钮），重试成功恢复列表；
 *   ② 分区折叠记忆——events/settings 区 CollapsePanel 开合落 localStorage
 *     xm-detail-open-keys，重开弹窗保持上次开合；坏快照回全收起不炸；
 *   ③ 以此参数新建——详情 footer 钮回填向导（复用行菜单 newMigrationFromJob：源/目标/
 *     策略字段 + formOpen 展开 + 滚回向导区）；
 *   ④ 导出快照——JSON 下载（downloadText 完整作业对象）+ Markdown 工单贴片（copyText
 *     实参含概要/参数/进度/冲突计数/收尾结论分段）。
 * 挂具范式同 xmigrateReplay1120（全真挂载 + api mock；详情 n-modal teleport 查 document）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import XmigrateView from '../views/XmigrateView.vue';
import { useAppStore } from '../stores/app';

const xbJobs = vi.fn();
const xbEvents = vi.fn();
const copyTextFn = vi.fn();
const downloadTextFn = vi.fn();

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
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return {
    ...actual,
    copyText: (...a: any[]) => copyTextFn(...a),
    downloadText: (...a: any[]) => downloadTextFn(...a),
  };
});

const T0 = 1732144800000; /* 2024-11-21 02:00:00 本地时区随环境，断言只锁 HH:mm:ss 段差 */
const DETAIL_JOB = {
  jobId: 'j-ev', status: 'RUNNING', destIndex: 'dest-ev', sourceIndex: 'src-ev',
  remoteEndpoint: 'http://old:9200', migrated: 50, total: 100, conflicts: 3, errors: 0,
  createTime: T0 - 60000, startedAtMs: T0 - 30000,
  sliceStatus: {}, sliceMigrated: {}, sliceErrors: {},
  message: '迁移中', destCreateMode: 'NONE', tuneMode: 'AGGRESSIVE',
};
const EVENTS = [
  { ts: T0, stage: 'RUNNING', message: '启动迁移', level: 'info' },
  { ts: T0 + 5000, stage: 'SLICE_FAIL', message: 'slice 1 写入失败重试', level: 'warn' },
  { ts: T0 + 10000, stage: 'FAILED', message: 'bulk 写入被拒', level: 'error' },
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
  return { app, host, store: useAppStore(pinia) };
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([DETAIL_JOB]);
  xbEvents.mockReset().mockResolvedValue({ events: EVENTS });
  copyTextFn.mockReset().mockResolvedValue(true);
  downloadTextFn.mockReset().mockReturnValue(undefined);
  (Element.prototype as any).scrollIntoView = vi.fn();
});

async function openDetail(host: HTMLElement) {
  (host.querySelector('[aria-label^="作业详情"]') as HTMLButtonElement).click();
  await settle();
  return document.querySelector('[data-test="xm-detail"]') as HTMLElement;
}

/** 打开详情并展开事件时间线折叠区（默认收起——开合记忆默认全收起） */
async function openDetailWithEvents(host: HTMLElement) {
  const root = await openDetail(host);
  (root.querySelector('[data-test="xm-detail-events"] .cp-toggle') as HTMLButtonElement).click();
  await settle(2);
  return root;
}

/* ═══ ① 事件时间线 ═══ */
describe('1121 详情 ①：事件时间线', () => {
  it('events 渲染：最新在上 + stage 徽标 + message + level 着色行', async () => {
    const { app, host } = await mountXm();
    await openDetailWithEvents(host);
    const sec = document.querySelector('[data-test="xm-detail-events"]')!;
    expect(sec, '第七区在场').toBeTruthy();
    const lines = [...sec.querySelectorAll('.xm-ev')];
    expect(lines.length).toBe(3);
    /* 最新在上：第一条=FAILED（ts 最大），最后一条=启动迁移 */
    expect(lines[0].textContent).toContain('bulk 写入被拒');
    expect(lines[0].className, 'error 级红档行').toContain('xm-ev-error');
    expect(lines[1].className, 'warn 级黄档行').toContain('xm-ev-warn');
    expect(lines[2].className, 'info 级灰档行').toContain('xm-ev-info');
    expect(lines[2].textContent).toContain('启动迁移');
    /* stage 徽标（StatusPill）与 HH:mm:ss 时间戳段在场 */
    expect(sec.querySelector('.pill')!.textContent).toContain('FAILED');
    expect(lines[0].querySelector('.xm-ev-ts')!.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(xbEvents).toHaveBeenCalledWith('j-ev', undefined);
    app.unmount();
  }, 8000);

  it('拉取失败：就地重试错误卡（role=alert）；重试成功恢复列表', async () => {
    xbEvents.mockRejectedValueOnce(new Error('net down'));
    const { app, host } = await mountXm();
    await openDetailWithEvents(host);
    const sec = document.querySelector('[data-test="xm-detail-events"]')!;
    const err = sec.querySelector('[data-test="xm-detail-events-err"]')!;
    expect(err.getAttribute('role')).toBe('alert');
    expect(err.textContent).toContain('事件读取失败');
    expect(err.textContent).toContain('net down');
    /* 就地重试钮：重试成功恢复时间线 */
    (err.querySelector('button') as HTMLButtonElement).click();
    await settle();
    expect(sec.querySelectorAll('.xm-ev').length, '重试后恢复列表').toBe(3);
    app.unmount();
  }, 8000);
});

/* ═══ ② 分区折叠记忆（xm-detail-open-keys） ═══ */
describe('1121 详情 ②：分区折叠记忆', () => {
  it('展开 events 区 → localStorage 落 keys；重开弹窗保持展开', async () => {
    const { app, host } = await mountXm();
    await openDetail(host);
    const sec = document.querySelector('[data-test="xm-detail-events"]')!;
    /* 默认收起：内容不渲染，折叠头在场 */
    expect(sec.querySelector('.xm-ev')).toBeNull();
    (sec.querySelector('.cp-toggle') as HTMLButtonElement).click();
    await settle(2);
    expect(sec.querySelectorAll('.xm-ev').length, '展开后内容渲染').toBe(3);
    expect(JSON.parse(localStorage.getItem('xm-detail-open-keys')!), '开合落盘').toContain('events');
    /* 关弹窗重开：开合状态保持（不强制复位） */
    (document.querySelector('.xm-detail-ft .btn:last-child') as HTMLButtonElement).click();
    await settle(2);
    const root2 = await openDetail(host);
    expect(root2.querySelector('[data-test="xm-detail-events"]')!.querySelectorAll('.xm-ev').length,
      '重开仍展开').toBe(3);
    /* 收起后落盘剔除 */
    (root2.querySelector('[data-test="xm-detail-events"] .cp-toggle') as HTMLButtonElement).click();
    await settle(2);
    expect(JSON.parse(localStorage.getItem('xm-detail-open-keys')!), '收起后 keys 剔除').not.toContain('events');
    app.unmount();
  }, 10000);
});

/* ═══ ③ 以此参数新建（回填向导 + 滚回向导区） ═══ */
describe('1121 详情 ③：以此参数新建', () => {
  it('footer 钮回填源/目标索引与策略，表单展开并定位向导区', async () => {
    const { app, host } = await mountXm();
    await openDetail(host);
    (document.querySelector('[data-test="xm-detail-newfrom"]') as HTMLButtonElement).click();
    await settle(6);
    const st = (app._instance as any)!.subTree.component.setupState;
    expect(st.form.sourceIndex).toBe('src-ev');
    expect(st.form.destIndex).toBe('dest-ev');
    expect(st.form.destCreateMode).toBe('NONE');
    expect(st.form.tuneMode).toBe('AGGRESSIVE');
    expect(host.querySelector('.xm-form'), '表单已展开回第一步').toBeTruthy();
    expect((Element.prototype as any).scrollIntoView).toHaveBeenCalled();
    app.unmount();
  }, 8000);
});

/* ═══ ④ 导出快照（JSON 下载 + 工单贴片） ═══ */
describe('1121 详情 ④：导出快照', () => {
  it('JSON：完整作业对象经 downloadText 落文件；MD：工单贴片分段齐全', async () => {
    const { app, host, store } = await mountXm();
    await openDetail(host);
    const ftBtns = [...document.querySelectorAll('.xm-detail-ft button')];
    (ftBtns.find(b => b.textContent!.includes('导出快照 JSON')) as HTMLButtonElement).click();
    await settle(2);
    expect(downloadTextFn).toHaveBeenCalledTimes(1);
    const [fname, fbody, fmime] = downloadTextFn.mock.calls[0];
    expect(fname).toBe('xm-job-j-ev.json');
    expect(fmime).toBe('application/json');
    expect(JSON.parse(fbody)).toMatchObject({ jobId: 'j-ev', destIndex: 'dest-ev' });
    (ftBtns.find(b => b.textContent!.includes('复制工单贴片')) as HTMLButtonElement).click();
    await settle(4);
    const md = copyTextFn.mock.calls[0][0] as string;
    expect(md).toContain('## 迁移作业 j-ev');
    expect(md).toContain('src-ev');
    expect(md).toContain('dest-ev');
    expect(md, '参数行').toContain('建索引 NONE');
    expect(md, '进度行').toContain('50 / 100');
    expect(md, '冲突计数').toContain('冲突计数：3');
    expect(md, '对账行').toContain('对账');
    expect(md, '收尾结论').toContain('收尾结论');
    expect(store.notifyLog.some(n => n.msg.includes('工单贴片已复制')), '复制成功 toast').toBe(true);
    app.unmount();
  }, 8000);
});
