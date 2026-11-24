/**
 * R130 三十九批：XmigrateView 任务列表排序记忆守卫。
 * 锁定：
 * 1) 预置排序记忆 状态/asc → 挂载后「状态」表头带 on 排序类；
 * 2) 点击「目标索引」表头 → 排序记忆持久化（列名+方向），表头类切换；
 * 3) 无排序时默认不落盘（等于默认不写；默认展示序=后端 createTime desc 原序）。
 * 五百二十九批 W-C：排序随壳合并 QRT 内核（storage-key="xm-jobs" → es_tbl_sort:xm-jobs:*，
 * 升→降→取消三击循环），记忆面由 useScopedDraft 会话稿改 localStorage 持久；
 * 挂真组件（xmigrateDoneLink.spec 同款最小 mock 面）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const JOBS = [
  { jobId: 'a-1', status: 'DONE', destIndex: 'dest-1', sourceIndex: 'src', remoteEndpoint: '', migrated: 10, total: 10, pct: 100, conflicts: 0, errors: 1, createTime: 1700000000000, sliceStatus: {} },
  { jobId: 'b-2', status: 'RUNNING', destIndex: 'dest-2', sourceIndex: 'src', remoteEndpoint: '', migrated: 3, total: 0, pct: 0, conflicts: 2, errors: 0, createTime: 1700000001000, sliceStatus: {} },
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
    },
  };
});

import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

const SORT_BASE = 'es_tbl_sort:xm-jobs';

async function mountView() {
  const View = (await import('../views/XmigrateView.vue')).default;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(View) });
  app.use(createPinia());
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 12; i++) { await nextTick(); await Promise.resolve(); }
}

const sortClsOf = (name: string) => {
  const th = [...host.querySelectorAll('th')].find(t => t.textContent?.includes(name));
  return th ? th.className : null;
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

describe('Xmigrate 排序记忆（三十九批，529 随壳迁 QRT es_tbl_sort）', () => {
  it('预置排序记忆 状态/asc → 挂载后状态表头 on', { timeout: 20000 }, async () => {
    localStorage.setItem(SORT_BASE + ':m', JSON.stringify([{ f: '状态', d: 'asc' }]));
    await mountView();
    const cls = sortClsOf('状态');
    expect(cls, '排序激活表头必须带 on 类').toContain('on');
    expect(cls).toContain('sortable');
  });

  it('点击「目标索引」表头 → 排序记忆写列名+方向（首击升序，内核三击循环）', { timeout: 20000 }, async () => {
    await mountView();
    const th = [...host.querySelectorAll('th')].find(t => t.textContent?.includes('目标索引'))!;
    th.click();
    await nextTick();
    expect(localStorage.getItem(SORT_BASE + ':f'), '记忆首键=目标索引').toBe('目标索引');
    expect(localStorage.getItem(SORT_BASE + ':d')).toBe('asc');
    expect(sortClsOf('目标索引')).toContain('on');
  });

  it('无排序时不落盘（默认展示序=后端 createTime desc 原序）', { timeout: 20000 }, async () => {
    await mountView();
    expect(sortClsOf('发起'), '未排序表头无 on 类').not.toContain('on');
    expect(localStorage.getItem(SORT_BASE + ':f')).toBeNull();
    expect(localStorage.getItem(SORT_BASE + ':m')).toBeNull();
  });
});
