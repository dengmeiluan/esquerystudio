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
      clusterIndices: () => Promise.resolve([
        { index: 'idx_a', health: 'green', status: 'open', docs: { count: 10 }, storeSize: '1kb', pri: 1, rep: 1 },
      ]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import IndexHubView from '../views/IndexHubView.vue';

/* v3.0.1 三竖幅重造回归:列表列退役改抽屉——开关→打开→Esc 关闭往返。
   (原「折叠→展开往返」随折叠竖条/rail 一并退役) */

describe('IndexHubView 索引列表抽屉交互', () => {
  let host: HTMLElement;
  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('打开→Esc 关闭往返(默认关,不占常驻列)', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div/>' } }],
    });
    await router.push('/');
    await router.isReady();
    const app = createApp({ render: () => h(IndexHubView as any) });
    app.use(createPinia());
    app.use(router);
    app.mount(host);
    for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }

    /* 默认关:抽屉不在 DOM(列表不再占常驻竖幅) */
    expect(host.querySelector('.ih-drawer-mask')).toBeFalsy();

    const toggle = host.querySelector('button[aria-label="索引列表"]') as HTMLButtonElement;
    expect(toggle, '页头「索引列表」开关应存在').toBeTruthy();
    toggle.click();
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }

    const mask = host.querySelector('.ih-drawer-mask') as HTMLElement | null;
    expect(mask, '打开后抽屉遮罩应出现').toBeTruthy();
    expect(host.querySelector('.ih-drawer .ih-list'), '抽屉内应有索引列表').toBeTruthy();

    /* Esc 关闭(capture 监听挂在 document)。pop 过渡离场走真实 CSS 时长
       (happy-dom 不发 transitionend,Vue 回退 setTimeout)——vi.waitFor 轮询收层 */
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await vi.waitFor(() => { expect(host.querySelector('.ih-drawer-mask')).toBeNull(); }, { timeout: 2000 });

    /* 再开→点遮罩关闭 往返 */
    toggle.click();
    await vi.waitFor(() => { expect(host.querySelector('.ih-drawer-mask')).toBeTruthy(); }, { timeout: 2000 });
    (host.querySelector('.ih-drawer-mask') as HTMLElement).click();
    await vi.waitFor(() => { expect(host.querySelector('.ih-drawer-mask')).toBeNull(); }, { timeout: 2000 });
  });
});
