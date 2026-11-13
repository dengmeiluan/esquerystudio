/**
 * 五百三十批：索引工作区深修（挂载型行为锁）：
 * ① IndexHub 放大/还原：抽屉工具行双态钮 → .ih 进 .fs-active 聚焦面，
 *    还原钮必须内置于聚焦面内的工作区卡片头（历史事故防线：面盖页头时还原路径面内可点）；
 * ② Aliases 深链 /aliases?idx=：过滤词预填、含该索引的分组置顶（压过字典序）、
 *    命中分组挂 alv-deep-hit 强调条、消费后 URL ?idx 清参（刷新不重放）。
 */
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
      indexSettings: () => Promise.reject(new Error('skip')),
      mappingDetail: () => Promise.reject(new Error('skip')),
      shards: () => Promise.resolve([]),
      aliases: () => Promise.resolve([
        { alias: 'zeta', index: 'logs-2026', isWriteIndex: true },
        { alias: 'alpha-logs-2026', index: 'old-idx', isWriteIndex: false },
      ]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import IndexHubView from '../views/IndexHubView.vue';
import AliasesView from '../views/AliasesView.vue';

const tick = () => new Promise(r => setTimeout(r, 0));
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

describe('IndexHub 放大/还原（五百三十批回补）', () => {
  let host: HTMLElement;
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('工具行双态钮 → .fs-active 聚焦面 → 面内卡片头还原钮可退出', async () => {
    localStorage.setItem('esquerystudio.pref.ih.listOpen', 'true'); /* 抽屉开（放大钮在抽屉工具行内） */
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
    await router.push('/');
    await router.isReady();
    /* useUrlState 走 hash query（indexHubQueryTab 同款）：挂载前落 ?idx= 选中索引（卡片头才渲染） */
    history.replaceState(null, '', '#/?idx=idx_a');
    const app = createApp({ render: () => h(IndexHubView as any) });
    app.use(createPinia());
    app.use(router);
    app.mount(host);
    for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }

    const maximize = host.querySelector('button[aria-label="放大工作区"]') as HTMLElement | null;
    expect(maximize, '抽屉工具行应有放大钮').toBeTruthy();
    click(maximize!);
    await tick();
    expect(host.querySelector('.ih.fs-active'), '放大后 .ih 应进聚焦面').toBeTruthy();
    /* 历史事故防线：还原钮在聚焦面内的工作区卡片头（放大面盖住页头时仍可点） */
    const restoreInFace = host.querySelector('.ih.fs-active button[aria-label="还原工作区"]') as HTMLElement | null;
    expect(restoreInFace, '还原钮必须内置在聚焦面内').toBeTruthy();
    click(restoreInFace!);
    await tick();
    expect(host.querySelector('.ih.fs-active'), '点面内还原钮后应退出聚焦面').toBeNull();
    app.unmount();
  });
});

describe('Aliases 深链 ?idx=（五百三十批 P1）', () => {
  let host: HTMLElement;
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('过滤词预填 + 含该索引分组置顶 + alv-deep-hit 强调条 + URL 清参', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/aliases', component: { template: '<div/>' } }] });
    await router.push('/aliases?idx=logs-2026');
    await router.isReady();
    const app = createApp({ render: () => h(AliasesView as any) });
    app.use(createPinia());
    app.use(router);
    app.mount(host);
    await vi.waitFor(() => { expect(host.querySelector('.alv-group')).toBeTruthy(); }, { timeout: 2000 });

    const input = host.querySelector('.alv-input') as HTMLInputElement;
    expect(input.value, '深链索引名应预填过滤词').toBe('logs-2026');
    /* 置顶：zeta（含 logs-2026 成员）压过字典序更小的 alpha-logs-2026（仅别名子串命中过滤） */
    const groups = Array.from(host.querySelectorAll('.alv-group'));
    expect(groups.length).toBe(2);
    expect((groups[0].querySelector('.alv-g-alias') as HTMLElement).textContent).toBe('zeta');
    expect(groups[0].classList.contains('alv-deep-hit'), '深链命中分组应挂强调条').toBe(true);
    expect(groups[1].classList.contains('alv-deep-hit'), '非命中分组不得挂强调条').toBe(false);
    /* 消费后清参：history 栈不留 ?idx，刷新不重放 */
    expect(router.currentRoute.value.query.idx, '深链参数消费后应清除').toBeUndefined();
    app.unmount();
  });
});
