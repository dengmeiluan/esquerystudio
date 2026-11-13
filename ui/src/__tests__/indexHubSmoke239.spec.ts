import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import IndexHubView from '../views/IndexHubView.vue';

/* 二百三十九批回归排查：IndexHub 页白屏复现与定位（带 memory router 的 view 级挂载） */

async function mountIndexHub() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(IndexHubView as any) });
  app.use(createPinia());
  app.use(router);
  app.mount(host);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
  return host;
}

describe('IndexHubView 渲染冒烟（239 折叠回归排查）', () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('带 router 挂载不抛错且渲染详情区/页头列表开关/tab(选中索引后)', async () => {
    /* tabs 在选中索引(v-else 分支)后才渲染——种 es_picked 驱动选中 */
    localStorage.setItem('es_picked', 'idx_a');
    const root = await mountIndexHub();
    expect(root.querySelector('.ih-page')).toBeTruthy();
    /* v3.0.1 三竖幅重造:列表列退役改抽屉,页头开关常驻 */
    expect(root.querySelector('button[aria-label="索引列表"]')).toBeTruthy();
    expect(root.querySelector('.ih-tabs')).toBeTruthy();
  });
});
