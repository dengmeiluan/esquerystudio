/**
 * 2026-11-21 兼容计划批：作业表健康摘要条 + 行级右键菜单扩展 + 源列动态 title 迁 Tip。
 *
 *   ① 健康摘要条（xm-health，表上方统计芯片，纯前端派生零请求）——总数/运行中/成功/
 *     失败/中止中断/平均速率（有速率作业才显示）/冲突总数（>0 才显示）；无作业隐藏；
 *   ② 行级右键菜单——源/目标索引列右键开 CellContextMenu：复制源/目标索引名、
 *     打开详情、续跑（非终态 FAILED/ABORTED/INTERRUPTED）、中止（RUNNING）、治理删除（终态）；
 *     既有 copy-id/copy-row/new-from-job 项保留（只增项）；
 *   ③ 源列动态拼接 title 迁 Tip 统一件（原生 title 60+ 字符禁用口径），text 同一拼接表达式。
 * 挂具范式同 xmigrateUx1120（全真挂载 + api mock）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const copyTextFn = vi.fn();

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
        events: async () => ({ events: [] }),
      },
    },
  };
});
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: (...a: any[]) => copyTextFn(...a) };
});

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

/* 五状态混合 + 速率可算（startedAtMs/sliceMigrated）+ 冲突计数 */
const JOBS = [
  { jobId: 'h-run', status: 'RUNNING', destIndex: 'd1', sourceIndex: 's1', remoteEndpoint: 'http://o:9200',
    migrated: 400, total: 1000, conflicts: 30, errors: 0, createTime: 1700000000000,
    startedAtMs: Date.now() - 20000, sliceMigrated: { '0': 400 }, sliceStatus: {}, sliceErrors: {} },
  { jobId: 'h-done', status: 'DONE', destIndex: 'd2', sourceIndex: 's2', remoteEndpoint: 'http://o:9200',
    migrated: 100, total: 100, conflicts: 0, errors: 0, createTime: 1700000000000,
    startedAtMs: Date.now() - 40000, finishedAtMs: Date.now() - 20000, sliceMigrated: { '0': 100 }, sliceStatus: {}, sliceErrors: {} },
  { jobId: 'h-fail', status: 'FAILED', destIndex: 'd3', sourceIndex: 's3', remoteEndpoint: 'http://o:9200',
    migrated: 0, total: 10, conflicts: 0, errors: 5, createTime: 1700000000000, sliceStatus: {}, sliceMigrated: {}, sliceErrors: {} },
  { jobId: 'h-abort', status: 'ABORTED', destIndex: 'd4', sourceIndex: 's4', remoteEndpoint: 'http://o:9200',
    migrated: 0, total: 0, conflicts: 0, errors: 0, createTime: 1700000000000, sliceStatus: {}, sliceMigrated: {}, sliceErrors: {} },
  { jobId: 'h-int', status: 'INTERRUPTED', destIndex: 'd5', sourceIndex: 's5', remoteEndpoint: 'http://o:9200',
    migrated: 0, total: 0, conflicts: 2, errors: 0, createTime: 1700000000000, sliceStatus: {}, sliceMigrated: {}, sliceErrors: {} },
];

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([]);
  copyTextFn.mockReset().mockResolvedValue(true);
  (Element.prototype as any).scrollIntoView = vi.fn();
});

/* ═══ ① 健康摘要条 ═══ */
describe('1121 ①：健康摘要条', () => {
  it('五状态计数芯片 + 平均速率 + 冲突总数；文案与计数对齐', async () => {
    xbJobs.mockResolvedValue(JOBS);
    const { app, host } = await mountXm();
    const bar = host.querySelector('[data-test="xm-health"]')!;
    expect(bar.getAttribute('role')).toBe('status');
    const txt = bar.textContent!;
    expect(txt).toContain('总数 5');
    expect(txt).toContain('运行中 1');
    expect(txt).toContain('成功 1');
    expect(txt).toContain('失败 1');
    expect(txt).toContain('中止/中断 2');
    expect(txt).toContain('平均速率');
    expect(txt).toContain('docs/s');
    expect(txt).toContain('冲突总数 32');
    app.unmount();
  }, 8000);

  it('无速率作业不出平均速率芯片；零冲突不出冲突芯片；空表整条隐藏', async () => {
    xbJobs.mockResolvedValue([
      { jobId: 'x1', status: 'FAILED', destIndex: 'd', sourceIndex: 's', remoteEndpoint: '',
        migrated: 0, total: 0, conflicts: 0, errors: 1, createTime: 1, sliceStatus: {}, sliceMigrated: {}, sliceErrors: {} },
    ]);
    const { app, host } = await mountXm();
    const bar = host.querySelector('[data-test="xm-health"]')!;
    expect(bar.textContent).not.toContain('平均速率');
    expect(bar.textContent).not.toContain('冲突总数');
    app.unmount();

    xbJobs.mockResolvedValue([]);
    const m2 = await mountXm();
    expect(m2.host.querySelector('[data-test="xm-health"]'), '空态整条隐藏').toBeNull();
    m2.app.unmount();
  }, 10000);
});

/* ═══ ② 行级右键菜单（源/目标索引列右键） ═══ */
describe('1121 ②：行级右键菜单', () => {
  it('源列右键开菜单：复制源/目标索引名 + 打开详情 + 续跑（FAILED 行）；既有项保留', async () => {
    xbJobs.mockResolvedValue([JOBS[2]!]); /* FAILED 行（可续跑，非 RUNNING） */
    const { app, host } = await mountXm();
    const srcCell = host.querySelector('.xm-src-cell')!;
    srcCell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await settle(2);
    const menu = document.querySelector('.ccm')!;
    expect(menu, '右键菜单打开（源列）').toBeTruthy();
    const labels = [...menu.querySelectorAll('.ccm-it')].map(b => b.textContent!.trim());
    /* 既有三项保留（只增项） */
    expect(labels).toContain('复制 jobId');
    expect(labels).toContain('复制作业信息');
    expect(labels).toContain('以此作业新建迁移');
    /* 新增直达项 */
    expect(labels).toContain('复制源索引名');
    expect(labels).toContain('复制目标索引名');
    expect(labels).toContain('打开详情');
    expect(labels).toContain('断点续跑');
    expect(labels.filter(l => l === '中止迁移'), '非 RUNNING 不出中止').toHaveLength(0);
    expect(labels).toContain('删除记录（治理）');
    /* 复制源索引名动作 */
    const copySrc = [...menu.querySelectorAll('.ccm-it')].find(b => b.textContent!.trim() === '复制源索引名') as HTMLButtonElement;
    copySrc.click();
    await settle(4);
    expect(copyTextFn).toHaveBeenCalledWith('s3');
    app.unmount();
  }, 8000);

  it('RUNNING 行：出中止、不出续跑/治理删除', async () => {
    xbJobs.mockResolvedValue([JOBS[0]!]);
    const { app, host } = await mountXm();
    /* 目标索引列右键（td 内 span 挂 contextmenu） */
    const cells = [...host.querySelectorAll('.qrt-cell')];
    const dstIdxCell = cells.find(c => c.textContent!.includes('d1'))!;
    dstIdxCell.querySelector('span')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await settle(2);
    const labels = [...document.querySelectorAll('.ccm .ccm-it')].map(b => b.textContent!.trim());
    expect(labels).toContain('中止迁移');
    expect(labels.filter(l => l === '断点续跑')).toHaveLength(0);
    expect(labels.filter(l => l === '删除记录（治理）')).toHaveLength(0);
    app.unmount();
  }, 8000);
});

/* ═══ ③ 源列动态 title 迁 Tip（源码锚） ═══ */
describe('1121 ③：源列动态 title 迁 Tip', () => {
  const src = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');
  it('Tip 统一件承接动态拼接 text（同一表达式），源列原生 :title 退役', () => {
    expect(src).toMatch(/<Tip :text="rowJob\(row\)\?\.sourceIndex \+ ' ← ' \+ rowJob\(row\)\?\.remoteEndpoint \+ '（点击复制）'" long>/);
    expect(src).not.toMatch(/<span class="mono xm-src-cell" :title="rowJob\(row\)\?\.sourceIndex/);
    /* 右键列接线：源/目标索引两处 contextmenu */
    expect(src.match(/@contextmenu\.stop\.prevent="openJobMenu\(\$event, rowJob\(row\)\)"/g)!.length).toBeGreaterThanOrEqual(2);
  });
});
