/**
 * R130 三十四批：核心视图联动入口守卫。
 * 锁定：
 * 1) IndexHubView 页头 actions 有「托管重建」按钮（选中索引时出现），点击后
 *    goto 自带的 store.pick(cur) 生效且路由到 /adhoc；
 * 2) DslQueryView 工具条有「索引工作区」入口按钮（静态接线，挂载态断言存在）；
 *    七十九批命名统一：页面名=索引工作区（pages 合约+PageHeader），按钮文案随之，
 *    静态锁禁「索引工作台」孤例回潮（routerTargets 注释中的历史事故名不在此列）。
 * IndexHub 挂真组件（mock api，样例照抄本目录既有 IndexHub 相关 spec 的最小 mock 面）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      overview: vi.fn(async () => ({})),
      clusterHealth: vi.fn(async () => ({})),
      clusterIndices: vi.fn(async () => [{ index: 'idx-a', health: 'green', status: 'open', 'docs.count': 3, 'store.size': '1kb', aliases: [] }]),
      clustersList: vi.fn(async () => []),
      setup: { ...orig.api.setup, status: vi.fn(async () => ({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true })) },
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

async function mountView(loader: () => Promise<any>, routes: any[]) {
  const View = await loader();
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(View.default ?? View) });
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

describe('核心视图联动入口（三十四批）', () => {
  it('IndexHub：选中索引时页头有「托管重建」，点击 pick 该索引并跳 /adhoc', { timeout: 40000 }, async () => {
    const { router } = await mountView(
      () => import('../views/IndexHubView.vue'),
      [
        { path: '/', component: { template: '<div/>' } },
        { path: '/adhoc-rebuild', component: { template: '<div/>' } },
      ],
    );
    /* pinia 在挂载内 app.use——store 须挂载后再取 */
    const store = useAppStore();
    store.pick('idx-a');
    await nextTick(); await nextTick();
    const btn = host.querySelector('button[aria-label="托管重建当前索引"]') as HTMLButtonElement;
    expect(btn, '选中索引后页头应出现托管重建入口').not.toBeNull();
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));
    await nextTick();
    expect(router.currentRoute.value.path).toBe('/adhoc-rebuild'); // 三十八批修正：真实路由为 /adhoc-rebuild
    expect(store.pickedIdx).toBe('idx-a');
  });

  it('IndexHub qry：show-relevance 实验室契约接线（六十四批，静态锁）', () => {
    const t = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
    expect(t).toContain('show-relevance');
    /* 与 DslQueryView 同一 sessionStorage 契约键（消费方：RankDebugView/QueryXrayView）。
       五百三十一批：裸 setItem 合并 useLinkCarry 统一件后源码字面 'esquerystudio.link.*' 消失，
       改锚 useLinkCarry('rankdebug'/'xray') 形态（键前缀 esquerystudio.link. 归统一件承担） */
    expect(t).toContain("useLinkCarry<{ index: string; id: string; query: string }>('rankdebug')");
    expect(t).toContain("useLinkCarry<{ index: string; id: string }>('xray')");
  });

  it('DslQueryView：工具条有「索引工作区」入口按钮（七十九批命名统一）', { timeout: 40000 }, async () => {
    await mountView(
      () => import('../views/DslQueryView.vue'),
      [{ path: '/', component: { template: '<div/>' } }],
    );
    /* 未选索引时 DslQuery 只渲染 EmptyState——先选索引，工具条才渲染 */
    const store = useAppStore();
    store.pick('some-idx');
    await nextTick(); await nextTick();
    /* 1369：入口收进工具行「更多」二级菜单（一级只留本页高频写操作）。
       入口本身仍在，aria-label 与文案逐字保留——先展开菜单再取。 */
    const direct = host.querySelector('button[aria-label^="在索引工作区打开"]');
    if (direct) {
      expect(direct).not.toBeNull();
    } else {
      (host.querySelector('.dq-more') as HTMLButtonElement | null)?.click();
      await nextTick(); await nextTick();
      const inMenu = document.querySelector('.dq-more-pop button[aria-label^="在索引工作区打开"]');
      expect(inMenu, '「更多」菜单里必须有索引工作区入口').not.toBeNull();
    }
  });

  it('命名统一：全站禁「索引工作台」孤例（七十九批，页面注册名=索引工作区）', () => {
    const dslSrc = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
    expect(dslSrc, 'DslQueryView 应已统一为「索引工作区」').not.toContain('索引工作台');
  });
});
