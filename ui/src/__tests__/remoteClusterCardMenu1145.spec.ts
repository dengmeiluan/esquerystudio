/**
 * 1145：远程集群卡右键。
 *
 * 远程集群卡右侧原只有「跨集群查询 / 复制」；本批补右键：
 * - 一级：跨集群查询（带别名通配）+ 复制… / 去查看…
 * - 二级承接「别名 / 种子地址 / 整卡 JSON」与「Dev Tools 看 cluster.settings」
 * - 未连接卡与已连接卡同菜单（状态不影响可做的读取动作）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const remoteFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: { ...actual.api, remoteClusters: (...a: any[]) => remoteFn(...a) },
  };
});

import RemoteClustersView from '../views/RemoteClustersView.vue';
import { topLabels, openGroup, subButtons, clickMenuItem, menuRoot } from './helpers/ctxMenu';

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;

const REMOTES = {
  remotes: {
    'search-prod': { seeds: ['10.0.0.1:9300', '10.0.0.2:9300'], connected: true, num_nodes_connected: 2, skip_unavailable: false },
    'logs-archive': { proxy_address: 'proxy.internal:9400', connected: true, skip_unavailable: true },
    'beta-cluster': { seeds: ['10.9.9.9:9300'], connected: false },
  },
};

async function mountView() {
  remoteFn.mockResolvedValue(REMOTES);
  host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(RemoteClustersView) });
  app.use(createPinia());
  app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] }));
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 14; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const cards = () => [...host.querySelectorAll('.rc-card')] as HTMLElement[];

async function rightClick(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 }));
  await tick();
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); remoteFn.mockReset(); });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = ''; });

describe('1145 远程集群卡右键', () => {
  it('右键卡片弹菜单，标题带别名；一级 3 项（跨集群查询 + 复制… + 去查看…）', async () => {
    await mountView();
    expect(cards().length).toBe(3);
    expect(menuRoot(), '未右键不渲染').toBeNull();
    await rightClick(cards()[0]);
    expect(menuRoot()).toBeTruthy();
    expect(document.querySelector('.ccm-hd')!.textContent).toContain('search-prod');
    const tops = topLabels();
    expect(tops.length).toBe(3);
    expect(tops[0]).toBe('跨集群查询（search-prod:*）');
    expect(tops.slice(1)).toEqual(['复制…', '去查看…']);
  });

  it('复制二级按数据出项：有种子才给「复制种子地址」，代理卡不给', async () => {
    await mountView();
    await rightClick(cards()[0]);
    expect(await openGroup('复制…')).toBe(true);
    expect(subButtons().map(b => (b.textContent ?? '').trim()))
      .toEqual(['复制集群别名', '复制种子地址', '复制整卡配置 JSON']);
    /* 第二张是 proxy_address 卡：无 seeds → 不出种子项。
       先关掉上一张的菜单（遮罩盖在页面上，真实交互不会同时开两个） */
    (menuRoot() as HTMLElement).click();
    await tick();
    await rightClick(cards()[1]);
    await openGroup('复制…');
    expect(subButtons().map(b => (b.textContent ?? '').trim()))
      .toEqual(['复制集群别名', '复制整卡配置 JSON']);
  });

  it('去查看二级：Dev Tools cluster.settings 写入 _prefill 会话键', async () => {
    await mountView();
    await rightClick(cards()[0]);
    expect(await openGroup('去查看…')).toBe(true);
    const labels = subButtons().map(b => (b.textContent ?? '').trim());
    expect(labels).toEqual(['在 Dev Tools 看 cluster.settings', '查询工作台 · 沙盒']);
    expect(await clickMenuItem('在 Dev Tools 看 cluster.settings')).toBe(true);
    await tick();
    const prefill = sessionStorage.getItem('esquerystudio.devtools.open') || '';
    expect(prefill, '预填指向 cluster.settings 且自动执行').toContain('_cluster/settings');
    expect(prefill).toContain('"run":true');
  });

  it('未连接卡照常可右键（读取类动作与连通性无关）', async () => {
    await mountView();
    await rightClick(cards()[2]);
    expect(document.querySelector('.ccm-hd')!.textContent).toContain('beta-cluster');
    expect(topLabels()[0]).toBe('跨集群查询（beta-cluster:*）');
  });

  it('卡片常驻钮保留（能力零删除）：跨集群查询/复制仍在卡右', async () => {
    await mountView();
    const r = cards()[0].querySelector('.rc-card-r')!;
    expect(r.textContent).toContain('跨集群查询');
    expect(r.textContent).toContain('复制');
  });
});
