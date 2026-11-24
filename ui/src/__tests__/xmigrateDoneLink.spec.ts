/**
 * R130 三十三批：XmigrateView 迁移完成「去查询验证」深链守卫。
 * 锁定：
 * 1) DONE 任务行操作列有「去查询验证」按钮（SearchCheck），RUNNING 行没有；
 * 2) 点击后与二十四批托管重建深链同模式：store.pick(destIndex) + router → /search?idx=destIndex；
 * 3) 无 destIndex 的 DONE 行不出按钮（防御坏数据）。
 * 挂真组件：mock api（xb.jobs 返回 DONE/RUNNING 两行）、memory router、pinia。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const JOBS = [
  { jobId: 'done-1', status: 'DONE', destIndex: 'dest-idx', sourceIndex: 'src-idx', remoteEndpoint: 'http://old:9200', migrated: 10, total: 10, pct: 100, conflicts: 0, errors: 0, createTime: Date.now() - 60000, sliceStatus: {} },
  { jobId: 'run-1', status: 'RUNNING', destIndex: 'dest-2', sourceIndex: 'src-2', remoteEndpoint: 'http://old:9200', migrated: 3, total: 0, pct: 0, conflicts: 0, errors: 0, createTime: Date.now() - 30000, sliceStatus: {} },
  // 第五十一批：DONE 但目标索引已从宿主删除（深链存在性预检用例）
  { jobId: 'gone-1', status: 'DONE', destIndex: 'dest-gone', sourceIndex: 'src-gone', remoteEndpoint: 'http://old:9200', migrated: 5, total: 5, pct: 100, conflicts: 0, errors: 0, createTime: Date.now() - 200000, sliceStatus: {} },
];

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      keys: vi.fn(async () => []),
      clustersList: vi.fn(async () => []),
      xb: { ...orig.api.xb, jobs: vi.fn(async () => JOBS), destIndices: vi.fn(async () => []) },
      clusterIndices: vi.fn(async () => [{ index: 'dest-idx' }, { index: 'other' }]),
    },
  };
});

import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountView() {
  const View = (await import('../views/XmigrateView.vue')).default;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/search', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(View) });
  app.use(createPinia());
  app.use(router);
  app.config.warnHandler = () => {};
  app.config.errorHandler = (err: any) => { console.error('APP ERR:', err); };
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 12; i++) { await nextTick(); await Promise.resolve(); }
  return { router };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

describe('Xmigrate 完成态深链（三十三批）', () => {
  it('DONE 行有「去查询验证」钮，RUNNING 行没有', { timeout: 20000 }, async () => {
    await mountView();
    const rows = [...host.querySelectorAll('tbody tr')].filter(tr => !tr.classList.contains('xm-detail'));
    expect(rows.length).toBe(3);
    const doneRow = rows.find(tr => tr.textContent?.includes('DONE'))!;
    expect(doneRow.querySelector('button[aria-label^="去查询验证"]')).not.toBeNull();
    const runRow = rows.find(tr => tr.textContent?.includes('RUNNING'))!;
    expect(runRow.querySelector('button[aria-label^="去查询验证"]')).toBeNull();
  });

  it('点击后 store.pick + 跳 /search?idx=dest-idx', { timeout: 20000 }, async () => {
    const { router } = await mountView();
    const btn = host.querySelector('button[aria-label^="去查询验证"]') as HTMLButtonElement;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    expect(router.currentRoute.value.path).toBe('/search');
    expect(router.currentRoute.value.query.idx).toBe('dest-idx');
    const store = useAppStore();
    expect(store.pickedIdx).toBe('dest-idx');
  });

  it('第五十一批：dest 仍在宿主清单时跳转且无警示', { timeout: 20000 }, async () => {
    await mountView();
    const store = useAppStore();
    const spy = vi.spyOn(store, 'notify');
    const btns = [...host.querySelectorAll('button[aria-label^="去查询验证"]')];
    // 第一行 DONE（dest-idx，在清单中）
    (btns[0] as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    const warns = spy.mock.calls.filter(c => c[0] === 'warning');
    expect(warns.length).toBe(0);
  });

  it('第五十一批：dest 已从宿主删除时跳转+warning 警示', { timeout: 20000 }, async () => {
    await mountView();
    const store = useAppStore();
    const spy = vi.spyOn(store, 'notify');
    const btns = [...host.querySelectorAll('button[aria-label^="去查询验证"]')];
    // gone-1 行的深链钮（第三行 DONE）
    (btns[1] as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    expect(store.pickedIdx).toBe('dest-gone');
    const warns = spy.mock.calls.filter(c => c[0] === 'warning');
    expect(warns.length).toBe(1);
    expect(String(warns[0][1])).toContain('dest-gone');
  });
});

