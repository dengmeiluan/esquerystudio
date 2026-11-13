import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* IndexHubView 元信息串合并 MetaStrip 统一件回归：items 四段（文档/存储+单位/分片副本/创建）
   渲染、别名段走默认插槽（前 3 截断 + 「管控」跳转交互）、整条 hover title 原文留根（信息保真：
   title 携带全量别名列表，显示只截前 3）。 */

const IDX_A = {
  index: 'idx_a', health: 'green', status: 'open', pri: 3, rep: 1,
  'docs.count': 12345, 'store.size': '34.5gb',
  'creation.date.string': '2024-01-02T03:04:05.123Z',
};
const FIVE_ALIASES = ['al_one', 'al_two', 'al_three', 'al_four', 'al_five']
  .map(a => ({ alias: a, index: 'idx_a' }));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([IDX_A]),
      aliases: () => Promise.resolve(aliasesMock),
      indexSettings: () => Promise.resolve({}),
      mappingDetail: () => Promise.resolve({}),
      shards: () => Promise.resolve([]),
      clusterQuery: () => Promise.resolve({ total: 0, hits: [] }),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

/* mock 变量声明在 vi.mock 工厂之后（工厂被提升，但回调执行时机在用例内）——用 let 承接 */
let aliasesMock: { alias: string; index: string }[] = FIVE_ALIASES;

import IndexHubView from '../views/IndexHubView.vue';

async function mountHub() {
  /* useUrlState/useIdxState 读的是 hash query（location.hash），深链选中走这里而非 router.push */
  window.location.hash = '#/?idx=idx_a';
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/aliases', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(IndexHubView as any) });
  app.use(createPinia());
  app.use(router);
  app.mount(host);
  return { router, host, cleanup: () => app.unmount() };
}

/* 等到选中索引的元信息串出现（loadIndices→curInfo、loadAliases→别名段都是异步落位） */
async function waitStrip(host: HTMLElement) {
  await vi.waitFor(() => {
    expect(host.querySelector('.ih-meta-pos'), '选中索引后 MetaStrip 应渲染').toBeTruthy();
    expect(host.querySelector('.ih-meta-pos .ms-unit'), 'items 存储段应带单位').toBeTruthy();
  }, { timeout: 2000 });
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  aliasesMock = FIVE_ALIASES;
});

describe('IndexHubView 元信息串（MetaStrip 统一件）', () => {
  it('items 四段渲染：文档千分位 / 存储值+单位拆分 / 分片副本合并值 / 创建时间', async () => {
    const { host, cleanup } = await mountHub();
    await waitStrip(host);
    const root = host.querySelector('.ih-meta-pos') as HTMLElement;
    /* 值段：items 4 个 b + 插槽别名段 1 个 b */
    const bs = root.querySelectorAll('.ms b');
    expect(bs.length).toBe(5);
    expect(bs[0].textContent).toBe('12,345');
    expect(bs[1].textContent).toBe('34.5');
    expect(bs[2].textContent).toBe('3/1');
    expect(bs[3].textContent).toBe('2024-01-02 03:04:05');
    /* 单位独立弱显（splitSize 拆分，非混在值里） */
    expect(root.querySelector('.ms-unit')?.textContent).toBe('gb');
    /* 标签：items 4 个 i + 插槽「别名」i */
    const labels = Array.from(root.querySelectorAll('.ms i')).map(i => i.textContent);
    expect(labels).toEqual(['文档', '存储', '分片/副本', '创建', '别名']);
    /* 分隔：items 间自动 3 枚 + items→插槽段组件自动 1 枚（525 批 MetaStrip 默认插槽自动补 sep；
       IndexHubView 手写 ih-meta-sep 已随自动档退役，ms-sep 单一出处，总数 4） */
    expect(root.querySelectorAll('.ms-sep').length).toBe(4);
    expect(root.querySelectorAll('.ih-meta-sep').length).toBe(0);
    cleanup();
  });

  it('别名段走默认插槽：前 3 截断 + 弱化 +N，「管控」点击跳 /aliases', async () => {
    const { router, host, cleanup } = await mountHub();
    await waitStrip(host);
    const aliasSeg = host.querySelector('.ih-meta-alias') as HTMLElement;
    expect(aliasSeg, '别名段应在插槽内').toBeTruthy();
    expect(aliasSeg.querySelector('b')?.textContent).toBe('al_one、al_two、al_three');
    expect(aliasSeg.querySelector('.dim')?.textContent).toBe(' +2');
    const go = aliasSeg.querySelector('a.ih-link') as HTMLElement;
    expect(go?.textContent).toBe('管控');
    go.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 0));
    expect(router.currentRoute.value.path).toBe('/aliases');
    cleanup();
  });

  it('整条 hover title 原文留根：含全量别名列表（信息保真）', async () => {
    const { host, cleanup } = await mountHub();
    await waitStrip(host);
    const root = host.querySelector('.ih-meta-pos') as HTMLElement;
    const tip = root.getAttribute('title') || '';
    expect(tip).toBe(
      '文档 12,345 · 存储 34.5gb · 3/1 分片/副本 · 创建 2024-01-02 03:04:05'
      + ' · 别名 al_one、al_two、al_three、al_four、al_five',
    );
    cleanup();
  });

  it('无别名分支：插槽弱化「无」，title 兜底「无别名」', async () => {
    aliasesMock = [];
    const { host, cleanup } = await mountHub();
    await waitStrip(host);
    const aliasSeg = host.querySelector('.ih-meta-alias') as HTMLElement;
    expect(aliasSeg.querySelector('b')).toBeNull();
    expect(aliasSeg.querySelector('.dim')?.textContent).toBe('无');
    expect((host.querySelector('.ih-meta-pos') as HTMLElement).getAttribute('title')).toContain(' · 无别名');
    cleanup();
  });
});
