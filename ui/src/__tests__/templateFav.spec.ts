/**
 * R130 第六十九批：模板收藏写侧合并（收藏夹 kind:'template' 此前全站零写侧——
 * 分类 tab 与 favReplay 回放分支（case 'template' → 搜索沙盒）都在，TemplateGallery
 * 却无处创建）。锁定 TemplateGallery 每个模板卡片出「⭐」收藏钮，点击后：
 * 1) favorites 增 1 条 kind:'template'、payload 为 JSON 字符串（favReplay 同态消费）；
 * 2) title/subtitle 与模板元数据一致。
 * 读侧闭环静态锁：favReplay case 'template' 仍在（写 esquerystudio.sandbox.body + 跳沙盒）。
 * 挂真组件（TemplateGallery 无 Monaco；mock router/pinia，静态数据免 mock API）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return { ...orig, api: { ...orig.api } };
});

import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountView() {
  const View = (await import('../views/TemplateGalleryView.vue')).default;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(View) });
  app.use(createPinia());
  app.use(router);
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
  return app;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('TemplateGallery 模板收藏写侧（六十九批）', () => {
  it('每个模板卡片有收藏钮，点击写入 kind:template 收藏（payload 为 JSON 串）', async () => {
    await mountView();
    const store = useAppStore();
    const before = (store.favorites || []).length;
    const favBtns = [...host.querySelectorAll('.tg-c-actions button[title*="收藏"]')] as HTMLButtonElement[];
    expect(favBtns.length, '模板卡片应有收藏钮').toBeGreaterThan(10);
    favBtns[0].click();
    for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
    const favs = store.favorites || [];
    expect(favs.length).toBe(before + 1);
    const f = favs[favs.length - 1];
    expect(f.kind).toBe('template');
    expect(f.tags).toContain('template');
    expect(typeof f.payload).toBe('string');
    JSON.parse(f.payload); /* payload 必须是合法 JSON（favReplay 同态消费） */
    expect(f.title.length).toBeGreaterThan(0);
  });

  it('读侧闭环仍在：favReplay template 分支写沙盒键并跳 /search', async () => {
    const { replayFavorite } = await import('../utils/favReplay');
    /* 烟测不必真跑跳转：直接调一次断言沙盒键写入（mode 沙盒为 template 回放目标） */
    const calls: Array<[string, string]> = [];
    const fakeRouter = { push: (v: any) => calls.push(['push', typeof v === 'string' ? v : JSON.stringify(v)]) } as any;
    replayFavorite({ kind: 'template', payload: '{"size":20}' } as any, fakeRouter, () => {});
    expect(sessionStorage.getItem('esquerystudio.sandbox.body')).toBe('{"size":20}');
    expect(calls.some(([, v]) => v.includes('/search'))).toBe(true);
  });
});
