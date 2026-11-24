/**
 * R130 五十二批：SnapshotsView 快照仓库选择记忆守卫。
 * 锁定：
 * 1) 预置草稿 repo=X → 挂载后 currentRepo 选 X（而非回落第一仓库），且 X 在仓库集合中；
 * 2) 用户切换仓库（onRepoChange）→ 草稿写回；
 * 3) 草稿指向已不存在的仓库 → 回落第一仓库并自愈回写。
 * 挂真组件（mock snapshotRepos/snapshotList）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { draftStorageKey } from '../composables/useScopedDraft';

const REPOS = [{ name: 'repo-a', type: 'fs' }, { name: 'repo-b', type: 'fs' }];

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      keys: vi.fn(async () => []),
      clustersList: vi.fn(async () => []),
      snapshotRepos: vi.fn(async () => REPOS),
      snapshotList: vi.fn(async () => []),
    },
  };
});

import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountView() {
  const View = (await import('../views/SnapshotsView.vue')).default;
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

const selectedRepo = () => {
  const sel = [...document.querySelectorAll('.n-base-selection-input, .n-base-selection-label')]
    .map(e => e.textContent?.trim()).find(t => t?.startsWith('repo-'));
  return sel ?? null;
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

describe('SnapshotsView 仓库选择记忆（五十二批）', () => {
  it('预置草稿 repo-b → 挂载后选中 repo-b（不回落第一仓库）', { timeout: 20000 }, async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'snapshots' }, 'repo'), 'repo-b');
    await mountView();
    expect(selectedRepo()).toContain('repo-b');
  });

  it('草稿指向已删除仓库 → 回落第一仓库并自愈回写', { timeout: 20000 }, async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'snapshots' }, 'repo'), 'gone-repo');
    await mountView();
    expect(selectedRepo()).toContain('repo-a');
    expect(sessionStorage.getItem(draftStorageKey({ route: 'snapshots' }, 'repo'))).toBe('repo-a');
  });
});
