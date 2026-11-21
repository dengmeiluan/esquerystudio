import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import DraftBadge from '../DraftBadge.vue';

/* DraftBadge 契约：纯展示 + 单一 clear 事件。父级 v-if 控制显隐、
   持有清稿动作——徽标自己不碰存储，这里只锁文案与事件两条。 */

let app: ReturnType<typeof createApp> | null = null;
let host: HTMLDivElement | null = null;

async function mountBadge() {
  const clicks: string[] = [];
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp({ render: () => h(DraftBadge, { onClear: () => clicks.push('clear') }) });
  app.use(createPinia());
  app.use(router);
  app.mount(host);
  return { clicks };
}

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { app?.unmount(); host?.remove(); app = null; host = null; });

describe('DraftBadge', () => {
  it('渲染恢复文案与清除按钮', async () => {
    await mountBadge();
    expect(host!.textContent).toContain('已恢复草稿');
    const btn = host!.querySelector<HTMLButtonElement>('.draft-badge-x');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain('清除');
  });

  it('点「清除」emit clear（一次点击一次事件）', async () => {
    const { clicks } = await mountBadge();
    host!.querySelector<HTMLButtonElement>('.draft-badge-x')!.click();
    expect(clicks).toEqual(['clear']);
  });
});
